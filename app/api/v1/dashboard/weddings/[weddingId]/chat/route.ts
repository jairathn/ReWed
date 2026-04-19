import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { requireWeddingAccess } from '@/lib/dashboard-auth';
import { getOpenAIClient, CHAT_MODEL_EXPERT } from '@/lib/ai/openai';
import { sanitizeText } from '@/lib/validation';
import { isTestMode } from '@/lib/env';
import { enforceChatbotLimit, getRequestIp, DAILY_EXPERT_LIMIT } from '@/lib/chatbot-limit';
import { buildWeddingExpertContext } from '@/lib/vendor/expert-context';

const askSchema = z.object({
  question: z.string().min(2).max(2000),
});

const SYSTEM_PROMPT = `You are an expert assistant for a couple planning their wedding. You have access to the full state of their wedding planning system: vendors, master timeline, to-dos, meeting notes, vendor comments, FAQ entries, and the couple's own knowledge base.

Answer their questions accurately using ONLY the provided context. Be specific — quote names, dates, times, and exact entries when possible. If something isn't in the context, say so plainly in one short sentence rather than guessing.

When the question is open-ended (e.g. "is there anything I'm forgetting?"), look across to-dos, deadlines, vendor comments, and meeting follow-ups, and surface concrete items that look unresolved or aging. Be concise but complete.`;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const actor = await requireWeddingAccess(request, weddingId);

    const body = await request.json();
    const parsed = askSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }
    const question = sanitizeText(parsed.data.question);

    const pool = getPool();

    // Higher daily cap for the couple's expert bot — keyed by their actor id
    // so couples and planners share the wedding's pool.
    const identifier = actor.role === 'couple' ? actor.coupleId : actor.plannerId;
    const limit = await enforceChatbotLimit(
      pool,
      weddingId,
      identifier,
      'expert',
      getRequestIp(request.headers)
    );
    if (!limit.allowed) {
      throw new AppError(
        'RATE_LIMITED',
        `You've used today's ${DAILY_EXPERT_LIMIT} expert questions. Resets at midnight.`
      );
    }

    let answer: string;

    if (isTestMode()) {
      answer = `(mock expert answer) for "${question.slice(0, 80)}"`;
    } else {
      const context = await buildWeddingExpertContext(pool, weddingId);
      if (!context) throw new AppError('WEDDING_NOT_FOUND');

      const openai = getOpenAIClient();
      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL_EXPERT,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `${context}\n\n---\n\nQuestion: ${question}`,
          },
        ],
        max_tokens: 1000,
        temperature: 0.3,
      });

      answer =
        completion.choices[0]?.message?.content?.trim() ||
        "I couldn't put together an answer — try rephrasing.";
    }

    return Response.json({
      data: {
        answer,
        remaining: limit.remaining,
        limit: limit.limit,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
