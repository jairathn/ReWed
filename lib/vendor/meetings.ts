import { getOpenAIClient, CHAT_MODEL } from '@/lib/ai/openai';
import { isTestMode } from '@/lib/env';

export type ExtractedTodo = {
  assignee: string;          // 'couple' or vendor name
  title: string;
  description: string | null;
  due_date: string | null;   // YYYY-MM-DD
  priority: 'high' | 'normal' | 'low';
};

const COUPLE_KEYWORD = 'couple';

const SYSTEM_PROMPT = `You are an assistant who turns wedding meeting notes into a clean to-do list.
Read the notes and extract every concrete action item. Assign each to ONE stakeholder from the provided list.
Use the exact stakeholder name as the assignee. If the action item is for the couple themselves (the bride and groom), use "couple" as the assignee.
Skip vague intentions or general updates. Only emit real to-dos that someone needs to do before the wedding.
Each title should be short and start with a verb (e.g. "Confirm dinner stations setup time").
Return JSON only.`;

function buildUserPrompt(args: {
  weddingName: string;
  meetingTitle: string;
  meetingDate: string | null;
  stakeholders: Array<{ name: string; category: string | null }>;
  rawNotes: string;
}): string {
  const stakeholderLines = [
    '- couple (the bride and groom)',
    ...args.stakeholders.map(
      (s) => `- ${s.name}${s.category ? ` (${s.category})` : ''}`
    ),
  ];

  return [
    `Wedding: ${args.weddingName}`,
    `Meeting: ${args.meetingTitle}${args.meetingDate ? ` (${args.meetingDate})` : ''}`,
    '',
    'Stakeholders (use exact name as the assignee):',
    stakeholderLines.join('\n'),
    '',
    'Raw notes:',
    args.rawNotes,
    '',
    `Respond with strictly this JSON shape:
{
  "todos": [
    {
      "assignee": "couple" or one of the stakeholder names exactly,
      "title": "short imperative",
      "description": "1-2 sentence detail or null",
      "due_date": "YYYY-MM-DD" or null,
      "priority": "high" | "normal" | "low"
    }
  ]
}`,
  ].join('\n');
}

function normalizeAssignee(
  raw: string,
  stakeholders: Array<{ id: string; name: string }>
): { vendorId: string | null; matched: boolean } {
  const cleaned = raw.toLowerCase().trim();
  if (!cleaned || cleaned === COUPLE_KEYWORD || cleaned.includes('bride') || cleaned.includes('groom')) {
    return { vendorId: null, matched: true };
  }
  const exact = stakeholders.find((s) => s.name.toLowerCase() === cleaned);
  if (exact) return { vendorId: exact.id, matched: true };
  const partial = stakeholders.find(
    (s) => cleaned.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(cleaned)
  );
  if (partial) return { vendorId: partial.id, matched: true };
  return { vendorId: null, matched: false };
}

const ALLOWED_PRIORITY = new Set(['high', 'normal', 'low']);

function sanitizeTodo(raw: unknown): ExtractedTodo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const assignee = typeof r.assignee === 'string' ? r.assignee : '';
  const title = typeof r.title === 'string' ? r.title.trim() : '';
  if (!assignee || !title) return null;

  const description =
    typeof r.description === 'string' && r.description.trim()
      ? r.description.trim()
      : null;
  const due =
    typeof r.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.due_date)
      ? r.due_date
      : null;
  const priorityRaw = typeof r.priority === 'string' ? r.priority.toLowerCase() : 'normal';
  const priority = ALLOWED_PRIORITY.has(priorityRaw) ? (priorityRaw as ExtractedTodo['priority']) : 'normal';

  return { assignee, title: title.slice(0, 500), description, due_date: due, priority };
}

/**
 * Generate to-dos from raw meeting notes via the chat model. Returns the raw
 * extracted to-dos (not yet assigned to vendor IDs). Handles JSON parsing
 * defensively — if the model returns junk we get an empty array, not a crash.
 */
export async function extractTodosFromNotes(args: {
  weddingName: string;
  meetingTitle: string;
  meetingDate: string | null;
  stakeholders: Array<{ name: string; category: string | null }>;
  rawNotes: string;
}): Promise<ExtractedTodo[]> {
  if (isTestMode()) {
    // Deterministic test fixture: one couple to-do + one vendor to-do per stakeholder.
    return [
      {
        assignee: 'couple',
        title: 'Confirm wedding party walkout songs',
        description: 'DJ needs the song list before the wedding.',
        due_date: null,
        priority: 'high',
      },
      ...args.stakeholders.slice(0, 1).map<ExtractedTodo>((s) => ({
        assignee: s.name,
        title: `Send program order to ${s.name}`,
        description: null,
        due_date: null,
        priority: 'normal',
      })),
    ];
  }

  const openai = getOpenAIClient();
  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(args) },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1500,
    temperature: 0.2,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }

  const list = (parsed as { todos?: unknown[] })?.todos;
  if (!Array.isArray(list)) return [];

  return list
    .map(sanitizeTodo)
    .filter((t): t is ExtractedTodo => t !== null);
}

/**
 * Resolve extracted to-do assignees to actual vendor IDs (or null for couple).
 * Drops items whose assignee can't be matched to anyone in the stakeholder
 * list — the alternative would be silently dumping mystery todos on the
 * couple, which feels worse.
 */
export function resolveAssignees(
  extracted: ExtractedTodo[],
  stakeholders: Array<{ id: string; name: string }>
): Array<ExtractedTodo & { vendor_id: string | null }> {
  const resolved: Array<ExtractedTodo & { vendor_id: string | null }> = [];
  for (const todo of extracted) {
    const { vendorId, matched } = normalizeAssignee(todo.assignee, stakeholders);
    if (!matched) continue;
    resolved.push({ ...todo, vendor_id: vendorId });
  }
  return resolved;
}
