import { NextRequest } from 'next/server';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { isTestMode } from '@/lib/env';

interface ParsedFaq {
  question: string;
  answer: string;
}

/**
 * POST /api/v1/dashboard/weddings/[weddingId]/faq/import
 *
 * Accepts raw text (copy-pasted from Zola, The Knot, or any format)
 * and uses an LLM to parse it into Q&A pairs, then bulk-inserts.
 *
 * Body: { raw_text: string, step: 'preview' | 'import', entries?: ParsedFaq[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const body = await request.json();
    const { raw_text, step, entries: providedEntries } = body as {
      raw_text?: string;
      step: 'preview' | 'import';
      entries?: ParsedFaq[];
    };

    // ── Preview: parse with LLM ──
    if (step === 'preview') {
      if (!raw_text || typeof raw_text !== 'string' || !raw_text.trim()) {
        throw new AppError('VALIDATION_ERROR', 'raw_text is required');
      }

      const parsed = await parseFaqWithLLM(raw_text);

      if (parsed.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'Could not identify any Q&A pairs in the provided text.');
      }

      return Response.json({ entries: parsed, count: parsed.length });
    }

    // ── Import: insert parsed entries ──
    if (step === 'import') {
      if (!providedEntries || !Array.isArray(providedEntries) || providedEntries.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'entries array is required');
      }

      const pool = getPool();
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let idx = 1;

      for (const entry of providedEntries) {
        if (!entry.question?.trim() || !entry.answer?.trim()) continue;
        placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++})`);
        values.push(weddingId, entry.question.trim(), entry.answer.trim(), 'zola_import');
      }

      if (placeholders.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'No valid Q&A pairs to import');
      }

      const result = await pool.query(
        `INSERT INTO faq_entries (wedding_id, question, answer, source)
         VALUES ${placeholders.join(', ')}
         RETURNING id, question, answer, source, created_at`,
        values
      );

      return Response.json({ entries: result.rows, count: result.rows.length }, { status: 201 });
    }

    throw new AppError('VALIDATION_ERROR', 'step must be "preview" or "import"');
  } catch (error) {
    return handleApiError(error);
  }
}

async function parseFaqWithLLM(rawText: string): Promise<ParsedFaq[]> {
  if (isTestMode()) {
    return basicFaqParse(rawText);
  }

  try {
    const { getOpenAIClient, CHAT_MODEL_MINI } = await import('@/lib/ai/openai');
    const openai = getOpenAIClient();

    const response = await openai.chat.completions.create({
      model: CHAT_MODEL_MINI,
      messages: [
        {
          role: 'system',
          content: `You are a FAQ parser for wedding websites. Extract question-and-answer pairs from raw text that has been copy-pasted from wedding websites like Zola, The Knot, or similar platforms.

The text may have various formats:
- Zola copy-paste where questions appear doubled: "Question?Question?" followed by the answer
- Standard Q&A format with Q: and A: prefixes
- Free-form text with embedded questions and answers
- Lists with headers as questions and body text as answers

For each Q&A pair found, return a JSON object with:
- question: string — the question, deduplicated if doubled (Zola format), but otherwise using the EXACT original wording
- answer: string — the EXACT original answer text as the user wrote it, preserving line breaks, lists, and URLs

CRITICAL: Do NOT rephrase, reword, summarize, or re-interpret ANY of the text. The users wrote their FAQ content with specific wording for a reason — preserve it verbatim.

Important:
- Remove markdown formatting characters only (**, __, etc.) but keep the underlying text exactly as written
- Preserve URLs in answers
- Preserve numbered lists and bullet points
- If a question appears doubled (Zola format), deduplicate it
- Return ONLY a JSON array of {question, answer} objects, no markdown, no explanation`,
        },
        {
          role: 'user',
          content: rawText,
        },
      ],
      max_tokens: 3000,
      temperature: 0,
    });

    const text = response.choices[0]?.message?.content || '';
    const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    const parsed = JSON.parse(cleaned) as ParsedFaq[];

    if (!Array.isArray(parsed)) {
      return basicFaqParse(rawText);
    }

    return parsed.filter((e) => e.question?.trim() && e.answer?.trim());
  } catch {
    return basicFaqParse(rawText);
  }
}

function basicFaqParse(rawText: string): ParsedFaq[] {
  // Try Zola doubled-question format first
  const zolaResults = parseZolaFormat(rawText);
  if (zolaResults.length > 0) return zolaResults;

  // Fall back to Q:/A: format
  const pairs = rawText.split(/\n\n+/).filter(Boolean);
  const results: ParsedFaq[] = [];

  for (const pair of pairs) {
    const lines = pair.split('\n');
    let q = '';
    let a = '';
    for (const line of lines) {
      if (line.match(/^Q:\s*/i)) q = line.replace(/^Q:\s*/i, '').trim();
      else if (line.match(/^A:\s*/i)) a = line.replace(/^A:\s*/i, '').trim();
      else if (q && !a) q += ' ' + line.trim();
      else if (a) a += ' ' + line.trim();
    }
    if (q && a) results.push({ question: q, answer: a });
  }

  return results;
}

function parseZolaFormat(text: string): ParsedFaq[] {
  const lines = text.split(/\r?\n/);
  const results: ParsedFaq[] = [];
  let currentQuestion: string | null = null;
  let currentAnswerLines: string[] = [];

  for (const line of lines) {
    const doubled = parseDoubledQuestion(line);
    if (doubled) {
      if (currentQuestion && currentAnswerLines.length > 0) {
        const answer = currentAnswerLines.join('\n').trim();
        if (answer) results.push({ question: currentQuestion, answer });
      }
      currentQuestion = doubled;
      currentAnswerLines = [];
    } else if (currentQuestion !== null) {
      currentAnswerLines.push(line);
    }
  }
  if (currentQuestion && currentAnswerLines.length > 0) {
    const answer = currentAnswerLines.join('\n').trim();
    if (answer) results.push({ question: currentQuestion, answer });
  }
  return results;
}

function parseDoubledQuestion(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.includes('?')) return null;
  const firstQ = trimmed.indexOf('?');
  const candidate = trimmed.substring(0, firstQ + 1);
  const rest = trimmed.substring(firstQ + 1);
  if (candidate.length > 5 && rest.trim() === candidate.trim()) {
    return candidate.trim();
  }
  return null;
}
