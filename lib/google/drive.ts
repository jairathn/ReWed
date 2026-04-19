// Minimal Drive API client — list recently modified files in My Drive and
// pull short text excerpts where possible (Google Docs, plain text).

const BASE = 'https://www.googleapis.com/drive/v3';

export interface DriveFileSummary {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string | null;
  excerpt: string;
}

interface DriveListResponse {
  files?: Array<{
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string;
    webViewLink?: string;
    owners?: Array<{ emailAddress: string }>;
  }>;
  nextPageToken?: string;
}

const EXCERPT_LIMIT = 3000;

async function exportGoogleDoc(accessToken: string, fileId: string): Promise<string> {
  const res = await fetch(
    `${BASE}/files/${fileId}/export?mimeType=text/plain`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return '';
  const text = await res.text();
  return text.slice(0, EXCERPT_LIMIT);
}

async function downloadPlainFile(accessToken: string, fileId: string): Promise<string> {
  const res = await fetch(
    `${BASE}/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return '';
  const text = await res.text();
  return text.slice(0, EXCERPT_LIMIT);
}

/**
 * List recently modified files in My Drive (excluding trashed). Returns a
 * short text excerpt for Google Docs and plain text files; binary types
 * (PDF, images, spreadsheets) come back with an empty excerpt — the AI can
 * still flag them by name.
 */
export async function listRecentDriveFiles(
  accessToken: string,
  options: { maxResults?: number; daysBack?: number } = {}
): Promise<DriveFileSummary[]> {
  const maxResults = Math.min(options.maxResults ?? 15, 50);
  const daysBack = Math.max(1, Math.min(options.daysBack ?? 30, 90));

  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
  const q = `trashed = false and modifiedTime > '${cutoff}' and 'me' in owners`;
  const fields = 'files(id,name,mimeType,modifiedTime,webViewLink,owners(emailAddress)),nextPageToken';

  const listRes = await fetch(
    `${BASE}/files?pageSize=${maxResults}&orderBy=modifiedTime desc&q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) {
    throw new Error(`Drive list failed: ${listRes.status} ${await listRes.text()}`);
  }
  const list = (await listRes.json()) as DriveListResponse;
  const files = list.files || [];

  const summaries: DriveFileSummary[] = [];
  for (const f of files) {
    let excerpt = '';
    if (f.mimeType === 'application/vnd.google-apps.document') {
      excerpt = await exportGoogleDoc(accessToken, f.id);
    } else if (f.mimeType === 'text/plain' || f.mimeType === 'text/markdown') {
      excerpt = await downloadPlainFile(accessToken, f.id);
    }
    summaries.push({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink || null,
      excerpt,
    });
  }
  return summaries;
}
