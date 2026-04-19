// Orchestrator for the knowledge-base pipeline.
//
// Two phases, one batch function:
//
//   1) register  — page through Gmail threads in the window, upsert each
//                  into email_threads with just metadata (subject, dates,
//                  participants, snippet, message_count). No LLM, no body
//                  storage. Bounded by budget.registerThreadFetches.
//
//   2) extract   — pick N unextracted email_threads, fetch the full thread
//                  body from Gmail, run the extractor, write one
//                  wedding_facts row, stamp extracted_at. Bounded by
//                  budget.extractCount.
//
// The UI calls runIngestBatch repeatedly. Each call does one page of work
// and reports state. This keeps every HTTP request under serverless time
// limits even on a big inbox.
//
// Progress cursor for phase 1 lives on google_connections.backfill_* columns
// so if the browser tab closes we resume on the next click.

import type { Pool, PoolClient } from 'pg';
import { getAccessTokenForWedding } from './oauth';
import {
  listThreads,
  fetchThread,
  extractAddresses,
  type Thread,
} from './gmail-threads';
import { extractThreadFacts, type ExtractionContext } from './extract';

// -------------------------------------------------------------------
// Small helpers
// -------------------------------------------------------------------

/** Gmail search expression for the backfill window. */
function buildBackfillQuery(fromDate: string): string {
  // after:YYYY/MM/DD is Gmail's date syntax. We also filter out the two
  // categories most likely to be noise for planning; receipts and personal
  // confirmations tend to sit in "Primary" / "Updates" so they still come
  // through.
  const d = fromDate.replace(/-/g, '/');
  return `after:${d} -category:promotions -category:social`;
}

/** Gmail search expression for incremental sync past a timestamp. */
function buildIncrementalQuery(sinceTs: Date): string {
  const epochSec = Math.floor(sinceTs.getTime() / 1000);
  return `after:${epochSec} -category:promotions -category:social`;
}

function pickThreadDates(thread: Thread): { first: Date | null; last: Date | null } {
  let first: Date | null = null;
  let last: Date | null = null;
  for (const m of thread.messages) {
    if (!m.date) continue;
    if (!first || m.date < first) first = m.date;
    if (!last || m.date > last) last = m.date;
  }
  return { first, last };
}

function pickParticipants(thread: Thread): string[] {
  const addrs = new Set<string>();
  for (const m of thread.messages) {
    for (const a of extractAddresses(m.from, m.to, m.cc)) addrs.add(a);
  }
  return Array.from(addrs).slice(0, 50);
}

// -------------------------------------------------------------------
// Phase 1: register
// -------------------------------------------------------------------

interface RegisterBatchOutcome {
  registered: number;       // newly inserted
  reachedEnd: boolean;      // no more pages to process for this window
}

async function registerBatch(
  pool: Pool,
  weddingId: string,
  accessToken: string,
  opts: { query: string; budget: number; pageToken?: string }
): Promise<RegisterBatchOutcome> {
  // One page of thread ids. Gmail caps maxResults at 500; we ask for the
  // budget size so we don't scan ids we won't process this batch.
  const page = await listThreads(accessToken, {
    query: opts.query,
    maxResults: Math.min(Math.max(opts.budget, 10), 100),
    pageToken: opts.pageToken,
  });

  let registered = 0;

  for (const t of page.threads) {
    // Skip threads we already have registered — the incremental sync handles
    // new messages via a separate path (see runIncrementalRefresh). For
    // backfill, once we have metadata for a thread we don't re-fetch it.
    const exists = await pool.query(
      `SELECT 1 FROM email_threads WHERE wedding_id = $1 AND gmail_thread_id = $2`,
      [weddingId, t.id]
    );
    if (exists.rowCount && exists.rowCount > 0) continue;

    try {
      const full = await fetchThread(accessToken, t.id, { perMessageBodyCap: 0 });
      // perMessageBodyCap: 0 — we don't need the body for registration;
      // extraction refetches with full bodies. Keeps this phase cheap.
      const { first, last } = pickThreadDates(full);
      const participants = pickParticipants(full);
      await pool.query(
        `INSERT INTO email_threads
          (wedding_id, gmail_thread_id, subject, participants,
           first_message_at, last_message_at, message_count, snippet)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (wedding_id, gmail_thread_id) DO UPDATE
           SET subject = EXCLUDED.subject,
               participants = EXCLUDED.participants,
               first_message_at = EXCLUDED.first_message_at,
               last_message_at = EXCLUDED.last_message_at,
               message_count = EXCLUDED.message_count,
               snippet = EXCLUDED.snippet`,
        [
          weddingId,
          full.id,
          full.subject.slice(0, 500),
          participants,
          first,
          last,
          full.messages.length,
          (t.snippet || full.snippet || '').slice(0, 500),
        ]
      );
      registered += 1;
    } catch {
      // One bad thread shouldn't halt the batch. Record as refreshed=0 and
      // move on; it'll be retried on the next batch because it isn't in the
      // table yet.
    }
  }

  // Persist the page cursor so the next call picks up after this page.
  await pool.query(
    `UPDATE google_connections
     SET backfill_page_token = $1
     WHERE wedding_id = $2`,
    [page.nextPageToken ?? null, weddingId]
  );

  const reachedEnd = !page.nextPageToken;
  return { registered, reachedEnd };
}

// -------------------------------------------------------------------
// Phase 2: extract
// -------------------------------------------------------------------

interface ExtractBatchOutcome {
  extracted: number;
  failed: number;
  remaining: number;
}

async function extractBatch(
  pool: Pool,
  weddingId: string,
  accessToken: string,
  ctx: ExtractionContext,
  opts: { budget: number }
): Promise<ExtractBatchOutcome> {
  const rows = await pool.query<{
    id: string;
    gmail_thread_id: string;
    last_message_at: string | null;
  }>(
    `SELECT id, gmail_thread_id, last_message_at
     FROM email_threads
     WHERE wedding_id = $1 AND extracted_at IS NULL
     ORDER BY last_message_at DESC NULLS LAST
     LIMIT $2`,
    [weddingId, Math.min(Math.max(opts.budget, 1), 30)]
  );

  let extracted = 0;
  let failed = 0;

  for (const row of rows.rows) {
    try {
      const thread = await fetchThread(accessToken, row.gmail_thread_id, {
        perMessageBodyCap: 3000,
      });
      const facts = await extractThreadFacts(thread, ctx);
      const factDate = row.last_message_at ? new Date(row.last_message_at) : null;

      await pool.query(
        `INSERT INTO wedding_facts
          (wedding_id, source_type, source_id, source_ref,
           vendor_name, topic, summary, decisions, open_questions,
           action_items, amounts, fact_date, raw, model)
         VALUES ($1, 'email', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          weddingId,
          row.id,
          row.gmail_thread_id,
          facts.vendor_name,
          facts.topic,
          facts.summary,
          facts.decisions,
          facts.open_questions,
          JSON.stringify(facts.action_items),
          JSON.stringify(facts.amounts),
          factDate,
          JSON.stringify(facts.raw),
          facts.model,
        ]
      );

      await pool.query(
        `UPDATE email_threads
         SET extracted_at = NOW(), extraction_error = NULL
         WHERE id = $1`,
        [row.id]
      );
      extracted += 1;
    } catch (err) {
      await pool.query(
        `UPDATE email_threads
         SET extraction_error = $1
         WHERE id = $2`,
        [err instanceof Error ? err.message.slice(0, 500) : 'unknown', row.id]
      );
      failed += 1;
    }
  }

  const remainingRes = await pool.query(
    `SELECT COUNT(*)::int AS c FROM email_threads
     WHERE wedding_id = $1 AND extracted_at IS NULL`,
    [weddingId]
  );
  const remaining = (remainingRes.rows[0]?.c as number) ?? 0;

  return { extracted, failed, remaining };
}

// -------------------------------------------------------------------
// Public: one batch does whichever phase is next.
// -------------------------------------------------------------------

export interface IngestState {
  backfill_from_date: string | null;
  backfill_completed_at: string | null;
  last_synced_at: string | null;
  backfill_page_token: string | null;
  registered_total: number;
  extracted_total: number;
  unextracted_count: number;
}

export interface IngestBatchResult {
  phase: 'register' | 'extract' | 'done' | 'idle';
  registered?: number;
  extracted?: number;
  failed?: number;
  reachedEndOfBackfill?: boolean;
  state: IngestState;
}

async function loadState(client: PoolClient | Pool, weddingId: string): Promise<IngestState> {
  const [conn, counts] = await Promise.all([
    client.query<{
      backfill_from_date: string | null;
      backfill_completed_at: string | null;
      last_synced_at: string | null;
      backfill_page_token: string | null;
    }>(
      `SELECT backfill_from_date, backfill_completed_at, last_synced_at, backfill_page_token
       FROM google_connections WHERE wedding_id = $1`,
      [weddingId]
    ),
    client.query<{ total: string; unextracted: string; extracted: string }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE extracted_at IS NULL)::text AS unextracted,
              COUNT(*) FILTER (WHERE extracted_at IS NOT NULL)::text AS extracted
       FROM email_threads WHERE wedding_id = $1`,
      [weddingId]
    ),
  ]);
  const row = conn.rows[0] ?? {
    backfill_from_date: null,
    backfill_completed_at: null,
    last_synced_at: null,
    backfill_page_token: null,
  };
  const c = counts.rows[0] ?? { total: '0', unextracted: '0', extracted: '0' };
  return {
    backfill_from_date: row.backfill_from_date,
    backfill_completed_at: row.backfill_completed_at,
    last_synced_at: row.last_synced_at,
    backfill_page_token: row.backfill_page_token,
    registered_total: parseInt(c.total, 10),
    extracted_total: parseInt(c.extracted, 10),
    unextracted_count: parseInt(c.unextracted, 10),
  };
}

/**
 * Run one batch of work. Returns quickly (within serverless time budget),
 * with state reflecting what's left. The UI calls this in a loop until
 * `phase === 'done'`.
 *
 * Budgets default to conservative values chosen so a single invocation on
 * Vercel's serverless runtime (10s to 60s depending on plan) comfortably
 * completes. Tune per-environment by passing options.
 */
export async function runIngestBatch(
  pool: Pool,
  weddingId: string,
  opts: {
    registerBudget?: number;  // threads to register per batch (default 25)
    extractBudget?: number;   // threads to extract per batch (default 10)
    weddingName: string;
    vendorNames: string[];
  }
): Promise<IngestBatchResult> {
  const tokenInfo = await getAccessTokenForWedding(pool, weddingId);
  if (!tokenInfo) {
    return { phase: 'idle', state: await loadState(pool, weddingId) };
  }
  if (!tokenInfo.gmail) {
    return { phase: 'idle', state: await loadState(pool, weddingId) };
  }

  const state = await loadState(pool, weddingId);
  const registerBudget = opts.registerBudget ?? 25;
  const extractBudget = opts.extractBudget ?? 10;

  // Phase 1: registration not complete — keep pulling pages.
  const backfillInProgress =
    state.backfill_from_date &&
    !state.backfill_completed_at &&
    // Either we have a cursor to continue from, OR we've never started
    // (registered_total is 0 and no page_token yet).
    (state.backfill_page_token !== null || state.registered_total === 0);

  if (backfillInProgress && state.backfill_from_date) {
    const query = buildBackfillQuery(state.backfill_from_date);
    const outcome = await registerBatch(pool, weddingId, tokenInfo.accessToken, {
      query,
      budget: registerBudget,
      pageToken: state.backfill_page_token ?? undefined,
    });

    if (outcome.reachedEnd) {
      await pool.query(
        `UPDATE google_connections
         SET backfill_completed_at = NOW(), backfill_page_token = NULL
         WHERE wedding_id = $1`,
        [weddingId]
      );
    }

    return {
      phase: 'register',
      registered: outcome.registered,
      reachedEndOfBackfill: outcome.reachedEnd,
      state: await loadState(pool, weddingId),
    };
  }

  // Phase 2: extraction. Process any unextracted threads regardless of
  // whether registration completed — this lets us start getting facts even
  // before every thread is registered.
  if (state.unextracted_count > 0) {
    const outcome = await extractBatch(
      pool,
      weddingId,
      tokenInfo.accessToken,
      { weddingName: opts.weddingName, vendorNames: opts.vendorNames },
      { budget: extractBudget }
    );
    if (state.backfill_completed_at) {
      await pool.query(
        `UPDATE google_connections SET last_synced_at = NOW() WHERE wedding_id = $1`,
        [weddingId]
      );
    }
    return {
      phase: 'extract',
      extracted: outcome.extracted,
      failed: outcome.failed,
      state: await loadState(pool, weddingId),
    };
  }

  return { phase: 'done', state: await loadState(pool, weddingId) };
}

/**
 * Incremental top-up: pull threads newer than last_synced_at into
 * email_threads so the next extract-batch covers them. Doesn't extract
 * itself; callers follow with runIngestBatch to process extraction.
 *
 * Intended to be called on demand by the UI after initial backfill completes
 * (or eventually by a cron).
 */
export async function runIncrementalRefresh(pool: Pool, weddingId: string): Promise<{
  discovered: number;
}> {
  const tokenInfo = await getAccessTokenForWedding(pool, weddingId);
  if (!tokenInfo?.gmail) return { discovered: 0 };

  const state = await loadState(pool, weddingId);
  // Look back at least 2 hours from last_synced_at to tolerate clock skew
  // and late-arriving threads — de-dup is handled by UNIQUE (wedding_id,
  // gmail_thread_id) so extra overlap is harmless.
  const since = state.last_synced_at
    ? new Date(new Date(state.last_synced_at).getTime() - 2 * 3600 * 1000)
    : new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const query = buildIncrementalQuery(since);

  const outcome = await registerBatch(pool, weddingId, tokenInfo.accessToken, {
    query,
    budget: 50,
  });

  await pool.query(
    `UPDATE google_connections SET last_synced_at = NOW() WHERE wedding_id = $1`,
    [weddingId]
  );

  return { discovered: outcome.registered };
}
