// Structured fact extraction: one Gmail thread (or Drive file, later) goes
// in, one wedding_facts row comes out. This is the compact representation
// the rest of the app reads from instead of re-reading raw email content.
//
// Design choices that matter:
//
// - Schema-constrained output via response_format=json_object + a tight
//   SYSTEM_PROMPT. We don't use tool-calling here because the LLM isn't
//   navigating anything — it's reading one bounded thread and emitting
//   structured JSON. Cheap and deterministic.
//
// - Uses gpt-4.1-mini (CHAT_MODEL_MINI) not gpt-5.4. At ~3-10k input tokens
//   per thread and a few hundred output tokens, extracting 1000 threads
//   costs pennies with mini. This is the whole point of the cost argument
//   for extraction-over-live-tool-use.
//
// - The prompt leans on "known vendor names" as a bias so "email from
//   Maria <maria@florist.com>" about centerpieces reliably tags
//   vendor_name="Maria Florist" rather than just "Maria". Missing vendors
//   are fine — extractor returns null and we just leave the facts general.
//
// - Everything the LLM emits is also saved to `raw` JSONB so we can
//   re-denormalize later or debug a weird extraction without re-calling
//   the API.

import { getOpenAIClient, CHAT_MODEL_MINI } from '@/lib/ai/openai';
import { isTestMode } from '@/lib/env';
import type { Thread } from './gmail-threads';

export interface ExtractionContext {
  weddingName: string;
  vendorNames: string[];
}

export interface ExtractedFacts {
  vendor_name: string | null;
  topic: string | null;
  summary: string | null;
  decisions: string[];
  open_questions: string[];
  action_items: Array<{ description: string; due_date: string | null; owner_hint: string | null }>;
  amounts: Array<{ description: string; usd: number | null }>;
  fact_date: string | null; // ISO
  raw: Record<string, unknown>;
  model: string;
}

const SYSTEM_PROMPT = `You are extracting structured facts from a single email thread that may be part of a couple's wedding planning inbox. Read the thread and emit one JSON object summarizing what is concretely known or pending from this thread.

Output JSON with exactly these keys:
{
  "vendor_name": string | null,          // Best-guess vendor this relates to. Prefer names from the "Known vendors" list. Null for general/non-vendor threads.
  "topic": string | null,                // 2-4 word label, e.g. "centerpieces", "photography contract", "guest list"
  "summary": string | null,              // 1-2 sentences plain English. What is this thread about?
  "decisions": string[],                 // Concrete things agreed/confirmed in the thread (e.g. "white roses confirmed for Saturday"). Include deposits paid, colors chosen, quantities confirmed.
  "open_questions": string[],            // Still unresolved questions/asks (e.g. "delivery time for Saturday?"). Pending the other side.
  "action_items": [                      // Things someone needs to DO. Usually the couple or a vendor.
    { "description": string, "due_date": "YYYY-MM-DD" | null, "owner_hint": "couple" | string | null }
  ],
  "amounts": [                           // Dollar amounts mentioned with a purpose
    { "description": string, "usd": number | null }
  ]
}

Rules:
- Do not invent facts. Only include things explicitly stated in the thread.
- Short strings. Each decision/question/action ≤ 200 characters.
- If the thread is small-talk, thank-you, spam, or has no planning signal, return arrays empty and summary = null.
- JSON only.`;

function renderThread(thread: Thread): string {
  const parts: string[] = [];
  parts.push(`Subject: ${thread.subject || '(no subject)'}`);
  parts.push(`Messages: ${thread.messages.length}`);
  thread.messages.forEach((m, i) => {
    parts.push(`--- message ${i + 1} ---`);
    parts.push(`From: ${m.from}`);
    if (m.to) parts.push(`To: ${m.to}`);
    if (m.cc) parts.push(`Cc: ${m.cc}`);
    if (m.date) parts.push(`Date: ${m.date.toISOString()}`);
    if (m.subject && m.subject !== thread.subject) parts.push(`Subject: ${m.subject}`);
    parts.push(`Body:\n${m.body || m.snippet || '(empty)'}`);
  });
  return parts.join('\n');
}

/** Parse LLM output into a typed ExtractedFacts, sanitizing aggressively. */
function sanitize(raw: unknown, modelName: string): ExtractedFacts {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const str = (v: unknown, cap = 200): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t ? t.slice(0, cap) : null;
  };
  const strArr = (v: unknown, cap = 200, limit = 20): string[] => {
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => str(x, cap))
      .filter((x): x is string => x !== null)
      .slice(0, limit);
  };

  const actionItems: ExtractedFacts['action_items'] = [];
  if (Array.isArray(obj.action_items)) {
    for (const rawItem of obj.action_items.slice(0, 20)) {
      if (!rawItem || typeof rawItem !== 'object') continue;
      const r = rawItem as Record<string, unknown>;
      const description = str(r.description, 300);
      if (!description) continue;
      actionItems.push({
        description,
        due_date: str(r.due_date, 10),
        owner_hint: str(r.owner_hint, 80),
      });
    }
  }

  const amounts: ExtractedFacts['amounts'] = [];
  if (Array.isArray(obj.amounts)) {
    for (const rawItem of obj.amounts.slice(0, 20)) {
      if (!rawItem || typeof rawItem !== 'object') continue;
      const r = rawItem as Record<string, unknown>;
      const description = str(r.description, 200);
      if (!description) continue;
      const usdRaw = r.usd;
      const usd = typeof usdRaw === 'number' && Number.isFinite(usdRaw) ? usdRaw : null;
      amounts.push({ description, usd });
    }
  }

  return {
    vendor_name: str(obj.vendor_name, 120),
    topic: str(obj.topic, 80),
    summary: str(obj.summary, 800),
    decisions: strArr(obj.decisions, 300, 30),
    open_questions: strArr(obj.open_questions, 300, 20),
    action_items: actionItems,
    amounts,
    fact_date: null, // set by the ingest orchestrator from thread.last_message_at
    raw: obj,
    model: modelName,
  };
}

/**
 * Run extraction on a single thread. Returns null ONLY if the LLM call fails
 * in a way that's worth retrying later (rate limit, transient API error) —
 * callers persist an `extraction_error` on the thread row so we can see why.
 * A thread that's just small-talk returns a valid ExtractedFacts with empty
 * arrays and null summary — not null.
 */
export async function extractThreadFacts(
  thread: Thread,
  ctx: ExtractionContext
): Promise<ExtractedFacts> {
  if (isTestMode()) {
    return {
      vendor_name: ctx.vendorNames[0] ?? null,
      topic: 'test',
      summary: `Test extraction for "${thread.subject}"`,
      decisions: [],
      open_questions: [],
      action_items: [],
      amounts: [],
      fact_date: null,
      raw: { __test: true, subject: thread.subject },
      model: 'test-fixture',
    };
  }

  const knownVendors = ctx.vendorNames.length > 0 ? ctx.vendorNames.join(', ') : '(none listed)';
  const userMsg = [
    `Wedding: ${ctx.weddingName}`,
    `Known vendors: ${knownVendors}`,
    '',
    'Thread:',
    renderThread(thread),
  ].join('\n');

  const openai = getOpenAIClient();
  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL_MINI,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1200,
    temperature: 0.1,
  });

  const content = completion.choices[0]?.message?.content ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {};
  }
  return sanitize(parsed, CHAT_MODEL_MINI);
}
