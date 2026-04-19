import { getOpenAIClient, CHAT_MODEL_EXPERT } from '@/lib/ai/openai';
import { isTestMode } from '@/lib/env';
import type { GmailMessageSummary } from './gmail';
import type { DriveFileSummary } from './drive';

export type SuggestionAction = 'create_todo' | 'update_todo' | 'update_timeline';

export interface RawSuggestion {
  action_type: SuggestionAction;
  rationale: string;
  source_ref: string;
  source_summary: string;
  source_url?: string;
  // payload shape depends on action_type — validated at apply time
  payload: Record<string, unknown>;
}

const SYSTEM_PROMPT = `You are an assistant scanning a wedding-planning couple's recent emails and Google Drive files to surface concrete changes they should consider making to their planning system.

You can propose three kinds of changes:

1. create_todo  — a new task that came up
   payload: { "title": "...", "description": "..."|null, "due_date": "YYYY-MM-DD"|null, "priority": "high"|"normal"|"low", "assignee_hint": "couple"|"<vendor name>" }

2. update_todo  — an existing open to-do should be marked complete or have its due date moved
   payload: { "todo_match": "<best title fragment to match>", "new_status": "completed"|null, "new_due_date": "YYYY-MM-DD"|null }

3. update_timeline — an existing master-timeline entry has new info (time, location, notes)
   payload: { "entry_match": "<best action fragment to match>", "new_time_label": "..."|null, "new_location": "..."|null, "new_notes": "..."|null }

Rules:
- Only propose changes that are CONCRETE and supported by clear evidence in the source. Skip vague mentions.
- Each suggestion must reference exactly one source (one email message or one Drive file).
- "rationale" is one short sentence explaining WHY you proposed this change, quoting the source.
- Do not invent vendors, dates, or details not in the source.
- Return JSON only.`;

export interface AnalyzeContext {
  weddingName: string;
  vendorNames: string[];
  openTodos: Array<{ title: string; vendor_name: string | null }>;
  upcomingTimeline: Array<{ event_date: string | null; time_label: string | null; action: string }>;
}

function buildContextBlock(ctx: AnalyzeContext): string {
  const parts: string[] = [];
  parts.push(`Wedding: ${ctx.weddingName}`);
  if (ctx.vendorNames.length > 0) {
    parts.push(`Known vendors: ${ctx.vendorNames.join(', ')}`);
  }
  if (ctx.openTodos.length > 0) {
    parts.push(
      `Open to-dos:\n${ctx.openTodos
        .map((t) => `- ${t.title}${t.vendor_name ? ` (→ ${t.vendor_name})` : ' (→ couple)'}`)
        .join('\n')}`
    );
  }
  if (ctx.upcomingTimeline.length > 0) {
    parts.push(
      `Master timeline (relevant entries):\n${ctx.upcomingTimeline
        .slice(0, 60)
        .map((e) => `- ${e.event_date || ''} ${e.time_label || ''} ${e.action}`.trim())
        .join('\n')}`
    );
  }
  return parts.join('\n\n');
}

function buildEmailBlock(messages: GmailMessageSummary[]): string {
  if (messages.length === 0) return '';
  return [
    'Recent emails:',
    ...messages.map((m, i) => {
      return [
        `--- email ${i + 1} ---`,
        `id: ${m.id}`,
        `subject: ${m.subject}`,
        `from: ${m.from}`,
        `date: ${m.date}`,
        `body:\n${m.body || m.snippet}`,
      ].join('\n');
    }),
  ].join('\n\n');
}

function buildDriveBlock(files: DriveFileSummary[]): string {
  if (files.length === 0) return '';
  return [
    'Recent Drive files:',
    ...files.map((f, i) => {
      return [
        `--- file ${i + 1} ---`,
        `id: ${f.id}`,
        `name: ${f.name}`,
        `type: ${f.mimeType}`,
        `modified: ${f.modifiedTime}`,
        f.webViewLink ? `link: ${f.webViewLink}` : '',
        f.excerpt ? `excerpt:\n${f.excerpt}` : '(no text excerpt available)',
      ]
        .filter(Boolean)
        .join('\n');
    }),
  ].join('\n\n');
}

const VALID_ACTIONS: ReadonlySet<string> = new Set([
  'create_todo',
  'update_todo',
  'update_timeline',
]);

function sanitize(raw: unknown): RawSuggestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const action_type = typeof r.action_type === 'string' ? r.action_type : '';
  if (!VALID_ACTIONS.has(action_type)) return null;
  const source_ref = typeof r.source_ref === 'string' ? r.source_ref : '';
  if (!source_ref) return null;
  const payload = (r.payload && typeof r.payload === 'object' ? r.payload : {}) as Record<string, unknown>;
  return {
    action_type: action_type as SuggestionAction,
    rationale: typeof r.rationale === 'string' ? r.rationale.slice(0, 600) : '',
    source_ref: source_ref.slice(0, 200),
    source_summary: typeof r.source_summary === 'string' ? r.source_summary.slice(0, 300) : '',
    source_url: typeof r.source_url === 'string' ? r.source_url : undefined,
    payload,
  };
}

export async function generateSuggestions(args: {
  context: AnalyzeContext;
  emails: GmailMessageSummary[];
  files: DriveFileSummary[];
}): Promise<RawSuggestion[]> {
  if (isTestMode()) {
    // Deterministic fixture for tests: one create_todo per email subject.
    return args.emails.map((m) => ({
      action_type: 'create_todo',
      rationale: `Email "${m.subject}" mentions a follow-up.`,
      source_ref: m.id,
      source_summary: `Email · ${m.subject}`,
      payload: {
        title: `Follow up on "${m.subject.slice(0, 80)}"`,
        description: m.snippet || null,
        due_date: null,
        priority: 'normal',
        assignee_hint: 'couple',
      },
    }));
  }

  if (args.emails.length === 0 && args.files.length === 0) return [];

  const userMsg = [
    buildContextBlock(args.context),
    '',
    buildEmailBlock(args.emails),
    '',
    buildDriveBlock(args.files),
    '',
    'Return JSON: {"suggestions":[ ... up to 12 entries ... ]}',
  ]
    .filter(Boolean)
    .join('\n');

  const openai = getOpenAIClient();
  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL_EXPERT,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 2000,
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
  const list = (parsed as { suggestions?: unknown[] })?.suggestions;
  if (!Array.isArray(list)) return [];
  return list.map(sanitize).filter((s): s is RawSuggestion => s !== null).slice(0, 12);
}
