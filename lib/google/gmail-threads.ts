// Thread-level Gmail API helpers for the knowledge-base pipeline.
//
// The existing lib/google/gmail.ts operates message-by-message from a 14-day
// window — good for "scan recent inbox". For knowledge-base ingest we need
// the thread as a unit (all replies grouped) and we need to page through
// arbitrarily long date ranges.
//
// We keep the surface tiny: list thread ids in a date window, and fetch the
// full thread when we want to extract facts from it. No full googleapis
// package — just raw fetch, same as the existing module.

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface ThreadListItem {
  id: string;
  snippet?: string;
}

export interface ThreadListPage {
  threads: ThreadListItem[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  mimeType: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  internalDate?: string; // ms since epoch as string
  payload: GmailPart & { headers?: GmailHeader[] };
}

interface GmailThreadResponse {
  id: string;
  snippet: string;
  messages?: GmailMessage[];
}

export interface ThreadMessage {
  id: string;
  date: Date | null;
  from: string;
  to: string;
  cc: string;
  subject: string;
  snippet: string;
  body: string;
}

export interface Thread {
  id: string;
  subject: string;
  snippet: string;
  messages: ThreadMessage[];
}

function decodeBase64Url(data: string): string {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function extractHeader(headers: GmailHeader[] | undefined, name: string): string {
  if (!headers) return '';
  const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

function extractBody(payload: GmailPart): string {
  const stack: GmailPart[] = [payload];
  let plainText = '';
  let htmlText = '';
  while (stack.length > 0) {
    const part = stack.pop()!;
    if (part.parts) {
      for (const child of part.parts) stack.push(child);
    }
    if (part.body?.data) {
      const decoded = decodeBase64Url(part.body.data);
      if (part.mimeType === 'text/plain' && !plainText) plainText = decoded;
      if (part.mimeType === 'text/html' && !htmlText) htmlText = decoded;
    }
  }
  if (plainText) return plainText;
  if (htmlText) {
    return htmlText
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
}

/**
 * List thread ids in a date range. `query` is a Gmail search expression —
 * callers typically pass something like "after:YYYY/MM/DD -category:promotions".
 * Returns one page; callers page through using `pageToken`.
 */
export async function listThreads(
  accessToken: string,
  opts: { query: string; pageToken?: string; maxResults?: number }
): Promise<ThreadListPage> {
  const params = new URLSearchParams();
  params.set('q', opts.query);
  params.set('maxResults', String(Math.min(opts.maxResults ?? 100, 500)));
  if (opts.pageToken) params.set('pageToken', opts.pageToken);

  const res = await fetch(`${BASE}/threads?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Gmail list threads failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    threads?: ThreadListItem[];
    nextPageToken?: string;
    resultSizeEstimate?: number;
  };
  return {
    threads: json.threads ?? [],
    nextPageToken: json.nextPageToken,
    resultSizeEstimate: json.resultSizeEstimate,
  };
}

/**
 * Fetch a single thread, decoding each message's plain-text body (falling
 * back to stripped HTML). Body length per message is capped so a single
 * thread can't blow the LLM prompt budget.
 */
export async function fetchThread(
  accessToken: string,
  threadId: string,
  opts: { perMessageBodyCap?: number } = {}
): Promise<Thread> {
  const cap = opts.perMessageBodyCap ?? 3000;

  const res = await fetch(`${BASE}/threads/${threadId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Gmail fetch thread failed: ${res.status} ${await res.text()}`);
  }
  const raw = (await res.json()) as GmailThreadResponse;

  const messages: ThreadMessage[] = (raw.messages ?? []).map((m) => {
    const headers = m.payload?.headers;
    const internalMs = m.internalDate ? Number.parseInt(m.internalDate, 10) : NaN;
    const date = Number.isFinite(internalMs) && internalMs > 0 ? new Date(internalMs) : null;
    return {
      id: m.id,
      date,
      from: extractHeader(headers, 'From'),
      to: extractHeader(headers, 'To'),
      cc: extractHeader(headers, 'Cc'),
      subject: extractHeader(headers, 'Subject'),
      snippet: m.snippet ?? '',
      body: extractBody(m.payload).slice(0, cap),
    };
  });

  // Subject line for the thread = subject of the first message (threading by
  // Gmail already strips Re:/Fwd: for grouping, but individual messages may
  // still carry them — use the earliest message as the canonical).
  const firstSubject = messages.length > 0 ? messages[0].subject : '';

  return {
    id: raw.id,
    subject: firstSubject || raw.snippet || '',
    snippet: raw.snippet ?? '',
    messages,
  };
}

/**
 * Turn a from/to/cc line into a set of bare email addresses. Tolerates
 * "Name <addr@x.com>" and "addr@x.com" and comma-separated lists.
 */
export function extractAddresses(...fields: string[]): string[] {
  const out = new Set<string>();
  for (const raw of fields) {
    if (!raw) continue;
    for (const chunk of raw.split(',')) {
      const m = chunk.match(/<([^>]+)>/) || chunk.match(/([^\s,<>"]+@[^\s,<>"]+)/);
      if (m) out.add(m[1].trim().toLowerCase());
    }
  }
  return Array.from(out);
}
