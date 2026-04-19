import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
import { getOpenAIClient, CHAT_MODEL_MINI } from '@/lib/ai/openai';
import { sanitizeText } from '@/lib/validation';
import { AppError, handleApiError } from '@/lib/errors';
import { isTestMode } from '@/lib/env';
import { enforceChatbotLimit, getRequestIp, DAILY_CHATBOT_LIMIT } from '@/lib/chatbot-limit';
import { createHash } from 'crypto';

const askSchema = z.object({
  question: z.string().min(2).max(500),
});

/**
 * Appends a "still need help? email the planner" line to every chatbot
 * response when the couple has configured a wedding planner contact. Done
 * programmatically (rather than via the system prompt) so the line is
 * deterministic and survives cache hits without getting stale.
 */
function appendPlannerLine(
  answer: string,
  plannerName: string | null,
  plannerEmail: string | null
): string {
  if (!plannerEmail) return answer;
  // Don't double-append if the answer already contains the planner email
  // (e.g. the AI already wove it in naturally).
  if (answer.includes(plannerEmail)) return answer;
  const line = plannerName
    ? `Still need help? Email ${plannerName} at ${plannerEmail}.`
    : `Still need help? Email our wedding planner at ${plannerEmail}.`;
  return `${answer.trimEnd()}\n\n${line}`;
}

// POST /api/v1/w/[slug]/faq — ask a question
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const pool = getPool();

    // Validate guest session
    const sessionToken = request.cookies.get('wedding_session')?.value;
    if (!sessionToken) {
      throw new AppError('AUTH_NOT_REGISTERED');
    }

    const session = await validateSession(pool, sessionToken);
    if (!session) {
      throw new AppError('AUTH_TOKEN_EXPIRED');
    }

    // Check FAQ feature is enabled
    const weddingResult = await pool.query(
      `SELECT id, package_config, display_name, config, wedding_date, timezone,
              venue_city, venue_country
       FROM weddings WHERE slug = $1`,
      [slug]
    );
    if (weddingResult.rows.length === 0) {
      throw new AppError('WEDDING_NOT_FOUND');
    }
    if (weddingResult.rows[0].id !== session.weddingId) {
      throw new AppError('AUTH_NOT_REGISTERED');
    }

    const pkgConfig = weddingResult.rows[0].package_config || {};
    if (pkgConfig.faq_chatbot === false) {
      throw new AppError('BILLING_FEATURE_LOCKED');
    }

    // Validate body
    const body = await request.json();
    const parsed = askSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }

    const question = sanitizeText(parsed.data.question);

    // Enforce 20-questions-per-day cap to keep inference costs bounded.
    const limitResult = await enforceChatbotLimit(
      pool,
      session.weddingId,
      session.guestId,
      'guest',
      getRequestIp(request.headers)
    );
    if (!limitResult.allowed) {
      throw new AppError(
        'RATE_LIMITED',
        `You've asked ${DAILY_CHATBOT_LIMIT} questions today — the limit resets at midnight. For anything urgent, reach out to the couple or their planner directly.`
      );
    }

    // Extract wedding config + planner early — we need the planner contact
    // for both cache-hit and fresh responses (it's appended to every reply).
    const wedding = weddingResult.rows[0];
    const weddingName = wedding.display_name;
    const weddingConfigObj = wedding.config || {};
    const knowledgeBase: string =
      typeof weddingConfigObj.knowledge_base === 'string' ? weddingConfigObj.knowledge_base.trim() : '';
    const plannerEmail: string | null = weddingConfigObj.wedding_planner?.email || null;
    const plannerName: string | null = weddingConfigObj.wedding_planner?.name || null;

    // Get FAQ entries and events for this wedding
    const [faqResult, eventsResult] = await Promise.all([
      pool.query(
        `SELECT id, question, answer FROM faq_entries WHERE wedding_id = $1`,
        [session.weddingId]
      ),
      pool.query(
        `SELECT name, date, start_time, end_time, venue_name, venue_address,
                dress_code, description, logistics
         FROM events WHERE wedding_id = $1 ORDER BY sort_order ASC, date ASC`,
        [session.weddingId]
      ),
    ]);

    // Check cache (but skip stale fallback responses when entries now exist)
    const questionHash = createHash('sha256').update(question.toLowerCase().trim()).digest('hex');
    const cacheResult = await pool.query(
      `SELECT answer FROM faq_cache WHERE wedding_id = $1 AND question_hash = $2`,
      [session.weddingId, questionHash]
    );

    const NO_ENTRIES_FALLBACK = "I don't have specific information about that yet.";
    const cachedAnswer = cacheResult.rows[0]?.answer;
    const isStaleFallback = cachedAnswer?.startsWith(NO_ENTRIES_FALLBACK) && faqResult.rows.length > 0;

    if (cachedAnswer && !isStaleFallback) {
      // Increment hit count
      await pool.query(
        `UPDATE faq_cache SET hit_count = hit_count + 1 WHERE wedding_id = $1 AND question_hash = $2`,
        [session.weddingId, questionHash]
      );

      return Response.json({
        data: {
          // Append planner line on-read so updated planner contact is always
          // fresh (cached answers store only the raw AI output).
          answer: appendPlannerLine(cachedAnswer, plannerName, plannerEmail),
          cached: true,
          sources: [],
        },
      });
    }

    // Delete stale fallback from cache
    if (isStaleFallback) {
      await pool.query(
        `DELETE FROM faq_cache WHERE wedding_id = $1 AND question_hash = $2`,
        [session.weddingId, questionHash]
      );
    }

    const hasContext =
      faqResult.rows.length > 0 ||
      eventsResult.rows.length > 0 ||
      knowledgeBase.length > 0;
    let answer: string;
    let sources: { question: string; answer: string }[] = [];

    if (isTestMode()) {
      answer = `Here's what I know about "${question}" for ${weddingName}: This is a mock FAQ response. Please check with the couple for specific details.`;
      sources = faqResult.rows.slice(0, 2).map((r) => ({ question: r.question, answer: r.answer }));
    } else if (!hasContext) {
      // Raw fallback — the planner line is appended below via appendPlannerLine
      // so guests always see a way to reach the planner when configured.
      answer = "I don't have specific information about that yet. The couple hasn't added FAQ entries.";
    } else {
      // Build rich context from FAQ entries + events + wedding details + knowledge base
      const openai = getOpenAIClient();

      sources = faqResult.rows.slice(0, 3).map((r) => ({
        question: r.question,
        answer: r.answer,
      }));

      const contextParts: string[] = [];

      // Wedding details
      const coupleNames = weddingConfigObj.couple_names;
      const weddingDetails: string[] = [];
      if (coupleNames?.name1 && coupleNames?.name2) {
        weddingDetails.push(`Couple: ${coupleNames.name1} & ${coupleNames.name2}`);
      }
      if (wedding.wedding_date) weddingDetails.push(`Wedding date: ${wedding.wedding_date}`);
      if (wedding.timezone) weddingDetails.push(`Timezone: ${wedding.timezone}`);
      if (wedding.venue_city) weddingDetails.push(`Location: ${wedding.venue_city}${wedding.venue_country ? `, ${wedding.venue_country}` : ''}`);
      if (weddingDetails.length > 0) {
        contextParts.push(`Wedding Details:\n${weddingDetails.join('\n')}`);
      }

      // Events/schedule
      if (eventsResult.rows.length > 0) {
        const eventsContext = eventsResult.rows.map((e: Record<string, unknown>) => {
          const parts: string[] = [`Event: ${e.name}`];
          if (e.date) parts.push(`  Date: ${e.date}`);
          if (e.start_time) parts.push(`  Start time: ${e.start_time}${e.end_time ? ` - End time: ${e.end_time}` : ''}`);
          if (e.venue_name) parts.push(`  Venue: ${e.venue_name}`);
          if (e.venue_address) parts.push(`  Address: ${e.venue_address}`);
          if (e.dress_code) parts.push(`  Dress code: ${e.dress_code}`);
          if (e.description) parts.push(`  Description: ${e.description}`);
          if (e.logistics) parts.push(`  Logistics: ${e.logistics}`);
          return parts.join('\n');
        }).join('\n\n');
        contextParts.push(`Schedule/Events:\n${eventsContext}`);
      }

      // FAQ entries
      if (faqResult.rows.length > 0) {
        const faqContext = faqResult.rows
          .map((r) => `Q: ${r.question}\nA: ${r.answer}`)
          .join('\n\n');
        contextParts.push(`FAQ:\n${faqContext}`);
      }

      // Wedding knowledge base (freeform couple-pasted context)
      if (knowledgeBase.length > 0) {
        // Cap to keep prompt size reasonable
        const trimmedKb = knowledgeBase.length > 12000
          ? knowledgeBase.slice(0, 12000) + '\n...[truncated]'
          : knowledgeBase;
        contextParts.push(`Additional Wedding Info:\n${trimmedKb}`);
      }

      const fullContext = contextParts.join('\n\n---\n\n');

      // We programmatically append the planner contact to every response
      // (see appendPlannerLine below), so the system prompt just tells the
      // AI to be honest when it doesn't know and avoid making things up.
      const chatResponse = await openai.chat.completions.create({
        model: CHAT_MODEL_MINI,
        messages: [
          {
            role: 'system',
            content: `You are a friendly, helpful assistant for ${weddingName}. Answer guest questions based on the provided wedding information, event schedule, FAQ entries, and additional wedding info. Be warm, concise, and conversational. If the provided context does not contain enough information to answer the question, say so honestly in one sentence. Never make up specific details that aren't in the context. Do not include contact info in your answer — it is appended separately.`,
          },
          {
            role: 'user',
            content: `${fullContext}\n\nGuest Question: ${question}`,
          },
        ],
        max_tokens: 300,
        temperature: 0.7,
      });

      answer = chatResponse.choices[0]?.message?.content || "I'm not sure about that. You might want to ask the couple directly!";
    }

    // Only cache AI-generated answers, not fallback messages. Cache the RAW
    // answer (without the planner line) so planner contact stays fresh when
    // the couple updates it in the Knowledge page.
    if (hasContext) {
      await pool.query(
        `INSERT INTO faq_cache (wedding_id, question_hash, answer)
         VALUES ($1, $2, $3)
         ON CONFLICT (wedding_id, question_hash) DO UPDATE SET hit_count = faq_cache.hit_count + 1`,
        [session.weddingId, questionHash, answer]
      );
    }

    return Response.json({
      data: {
        answer: appendPlannerLine(answer, plannerName, plannerEmail),
        cached: false,
        sources,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
