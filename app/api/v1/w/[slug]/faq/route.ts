import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
import { getOpenAIClient, CHAT_MODEL_MINI } from '@/lib/ai/openai';
import { sanitizeText } from '@/lib/validation';
import { AppError, handleApiError } from '@/lib/errors';
import { isTestMode } from '@/lib/env';
import { createHash } from 'crypto';

const askSchema = z.object({
  question: z.string().min(2).max(500),
});

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
      `SELECT id, package_config, display_name, config FROM weddings WHERE slug = $1`,
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

    // Check cache first
    const questionHash = createHash('sha256').update(question.toLowerCase().trim()).digest('hex');
    const cacheResult = await pool.query(
      `SELECT answer FROM faq_cache WHERE wedding_id = $1 AND question_hash = $2`,
      [session.weddingId, questionHash]
    );

    if (cacheResult.rows.length > 0) {
      // Increment hit count
      await pool.query(
        `UPDATE faq_cache SET hit_count = hit_count + 1 WHERE wedding_id = $1 AND question_hash = $2`,
        [session.weddingId, questionHash]
      );

      return Response.json({
        data: {
          answer: cacheResult.rows[0].answer,
          cached: true,
          sources: [],
        },
      });
    }

    // Get FAQ entries for this wedding
    const faqResult = await pool.query(
      `SELECT id, question, answer FROM faq_entries WHERE wedding_id = $1`,
      [session.weddingId]
    );

    const weddingName = weddingResult.rows[0].display_name;
    let answer: string;
    let sources: { question: string; answer: string }[] = [];

    if (isTestMode()) {
      answer = `Here's what I know about "${question}" for ${weddingName}: This is a mock FAQ response. Please check with the couple for specific details.`;
      sources = faqResult.rows.slice(0, 2).map((r) => ({ question: r.question, answer: r.answer }));
    } else if (faqResult.rows.length === 0) {
      answer = `I don't have specific information about that yet. The couple hasn't added FAQ entries. You might want to reach out to them directly!`;
    } else {
      // Use GPT to answer from the FAQ context
      const openai = getOpenAIClient();

      // Use all FAQ entries as context for the AI
      sources = faqResult.rows.slice(0, 3).map((r) => ({
        question: r.question,
        answer: r.answer,
      }));

      const context = faqResult.rows
        .map((r) => `Q: ${r.question}\nA: ${r.answer}`)
        .join('\n\n');

      const chatResponse = await openai.chat.completions.create({
        model: CHAT_MODEL_MINI,
        messages: [
          {
            role: 'system',
            content: `You are a friendly, helpful FAQ assistant for ${weddingName}. Answer guest questions based on the provided FAQ context. Be warm, concise, and conversational. If you're not sure, say so honestly and suggest they ask the couple directly. Never make up specific details like times, addresses, or dress codes that aren't in the context.`,
          },
          {
            role: 'user',
            content: `FAQ Context:\n${context}\n\nGuest Question: ${question}`,
          },
        ],
        max_tokens: 300,
        temperature: 0.7,
      });

      answer = chatResponse.choices[0]?.message?.content || "I'm not sure about that. You might want to ask the couple directly!";
    }

    // Only cache AI-generated answers, not fallback messages
    if (faqResult.rows.length > 0) {
      await pool.query(
        `INSERT INTO faq_cache (wedding_id, question_hash, answer)
         VALUES ($1, $2, $3)
         ON CONFLICT (wedding_id, question_hash) DO UPDATE SET hit_count = faq_cache.hit_count + 1`,
        [session.weddingId, questionHash, answer]
      );
    }

    return Response.json({
      data: {
        answer,
        cached: false,
        sources,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
