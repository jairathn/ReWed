// Generate a short human-readable explanation of what's happening around a
// specific timeline entry, from the perspective of a vendor who only sees
// their own row. The goal is letting a vendor land on "be ready with a horse
// at 3 PM" and immediately understand "this is for the Baraat, where Neil
// rides to the Mandap" without needing to read the whole master timeline.
//
// Design:
// - One LLM call per entry, cached in timeline_entry_context.
// - gpt-4.1-mini (CHAT_MODEL_MINI) — ~$0.0001 per call, plenty sharp enough
//   for 1-2 sentences of summarization with a bounded prompt.
// - Inputs bounded: the target entry, the 6 surrounding entries on the same
//   day (3 before, 3 after), wedding name, vendor role, and an optional
//   knowledge-base excerpt from the couple's configuration. Prompt budget
//   stays under ~1500 tokens regardless of inbox size.
// - No tool-use, no agentic loop. The LLM reads, writes a sentence, returns.

import { getOpenAIClient, CHAT_MODEL_MINI } from '@/lib/ai/openai';
import { isTestMode } from '@/lib/env';

export interface ContextInput {
  weddingName: string;
  knowledgeExcerpt: string | null;          // trimmed excerpt from config.knowledge_base
  vendor: { name: string; category: string | null };
  target: {
    event_name: string | null;
    event_date: string | null;
    time_label: string | null;
    action: string;
    location: string | null;
    notes: string | null;
  };
  /**
   * Entries on the same event_date, sorted by sort_order. Used so the LLM
   * can say "this is for the Baraat right before the ceremony" by
   * referencing what's happening just before/after.
   */
  neighborhood: Array<{
    time_label: string | null;
    action: string;
    vendor_names: string[];
    isTarget: boolean;
  }>;
}

const SYSTEM_PROMPT = `You are writing a short context blurb for a wedding vendor who only sees their own timeline entry. They may not know the tradition, event, or what happens right after their part.

Given the target entry and the surrounding master timeline, write 1-2 sentences explaining:
  - What tradition or moment this is part of (e.g. "This is for the Baraat — the groom's procession to the Mandap.")
  - Why the vendor's action matters for that moment, or what happens right after.

Rules:
- 1-2 sentences. Maximum 50 words.
- Plain English. No jargon unless you explain it.
- Do not invent details not supported by the provided context.
- If there isn't enough context to say anything useful, return the empty string.
- Return JSON: {"context": "..."}.`;

function renderNeighborhood(list: ContextInput['neighborhood']): string {
  return list
    .map((n) => {
      const marker = n.isTarget ? '→ THIS ENTRY:' : '  ';
      const time = n.time_label ? `[${n.time_label}]` : '';
      const vendors = n.vendor_names.length > 0 ? ` (${n.vendor_names.join(', ')})` : '';
      return `${marker} ${time} ${n.action}${vendors}`.trim();
    })
    .join('\n');
}

export async function generateEntryContext(input: ContextInput): Promise<{
  context: string;
  model: string;
}> {
  if (isTestMode()) {
    return {
      context: `Test context for "${input.target.action}" during ${input.target.event_name || 'wedding'}.`,
      model: 'test-fixture',
    };
  }

  const lines: string[] = [];
  lines.push(`Wedding: ${input.weddingName}`);
  lines.push(`Vendor: ${input.vendor.name}${input.vendor.category ? ` (${input.vendor.category})` : ''}`);
  if (input.target.event_name) lines.push(`Event: ${input.target.event_name}`);
  if (input.target.event_date) lines.push(`Date: ${input.target.event_date}`);
  lines.push('');
  lines.push('Surrounding timeline for this day:');
  lines.push(renderNeighborhood(input.neighborhood));
  if (input.knowledgeExcerpt) {
    lines.push('');
    lines.push('Wedding knowledge excerpt:');
    lines.push(input.knowledgeExcerpt);
  }

  const openai = getOpenAIClient();
  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL_MINI,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: lines.join('\n') },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 200,
    temperature: 0.3,
  });

  const content = completion.choices[0]?.message?.content ?? '';
  let parsed: { context?: string } = {};
  try {
    parsed = JSON.parse(content) as { context?: string };
  } catch {
    parsed = {};
  }
  const raw = typeof parsed.context === 'string' ? parsed.context.trim() : '';
  return { context: raw.slice(0, 400), model: CHAT_MODEL_MINI };
}
