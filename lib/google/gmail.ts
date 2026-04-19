// Minimal Gmail API client — list recent messages and pull subject/sender/snippet/body.
// Uses raw fetch so we don't pull in the full googleapis package (huge dependency).

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;        // RFC 2822
  snippet: string;
  body: string;        // plain text best-effort
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
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
  payload: GmailPart & { headers?: GmailHeader[] };
}

function decodeBase64Url(data: string): string {
  // Gmail returns body data as URL-safe base64.
  const padded = data.replace(/-/g, '+').replace(/_/g, '/');
  const buf = Buffer.from(padded, 'base64');
  return buf.toString('utf8');
}

function extractHeader(headers: GmailHeader[] | undefined, name: string): string {
  if (!headers) return '';
  const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

/**
 * Walk the MIME tree and pick the best plain-text body. Falls back to
 * stripping HTML tags from text/html if no text/plain part exists.
 */
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
    // Cheap HTML strip — no need for a real parser since we only care about
    // semantic content for the AI prompt, not pixel-perfect rendering.
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
 * Pull the most recent N messages from the inbox, newest first. Filters out
 * obvious noise (Promotions/Forums categories, sent mail).
 */
export async function listRecentInboxMessages(
  accessToken: string,
  options: { maxResults?: number; daysBack?: number } = {}
): Promise<GmailMessageSummary[]> {
  const maxResults = Math.min(options.maxResults ?? 20, 50);
  const daysBack = Math.max(1, Math.min(options.daysBack ?? 14, 60));

  const query = `in:inbox -category:promotions -category:forums newer_than:${daysBack}d`;

  const listRes = await fetch(
    `${BASE}/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) {
    throw new Error(`Gmail list failed: ${listRes.status} ${await listRes.text()}`);
  }
  const list = (await listRes.json()) as GmailListResponse;
  const ids = list.messages || [];

  const summaries: GmailMessageSummary[] = [];
  // Run sequentially to be polite to the Gmail API quota; with maxResults
  // capped at 50 this is still well under a second of latency in practice.
  for (const { id } of ids) {
    const msgRes = await fetch(`${BASE}/messages/${id}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!msgRes.ok) continue;
    const msg = (await msgRes.json()) as GmailMessage;
    const headers = msg.payload?.headers;
    summaries.push({
      id: msg.id,
      threadId: msg.threadId,
      subject: extractHeader(headers, 'Subject'),
      from: extractHeader(headers, 'From'),
      date: extractHeader(headers, 'Date'),
      snippet: msg.snippet || '',
      body: extractBody(msg.payload).slice(0, 4000), // cap per-message body for AI prompt budget
    });
  }
  return summaries;
}
