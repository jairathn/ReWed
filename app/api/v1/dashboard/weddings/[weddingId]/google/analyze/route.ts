import { NextRequest } from 'next/server';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { getAccessTokenForWedding } from '@/lib/google/oauth';
import { listRecentInboxMessages } from '@/lib/google/gmail';
import { listRecentDriveFiles } from '@/lib/google/drive';
import { generateSuggestions } from '@/lib/google/suggest';

/**
 * POST /api/v1/dashboard/weddings/[weddingId]/google/analyze
 * Pulls recent Gmail + Drive content, runs the AI suggester, and persists
 * pending suggestions for the couple to accept/decline.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const pool = getPool();

    const tokenInfo = await getAccessTokenForWedding(pool, weddingId);
    if (!tokenInfo) throw new AppError('VALIDATION_ERROR', 'Connect Google first.');

    // Build the lightweight context the AI needs to spot real changes.
    const [weddingRow, vendorsRows, todosRows, timelineRows] = await Promise.all([
      pool.query(`SELECT display_name FROM weddings WHERE id = $1`, [weddingId]),
      pool.query(`SELECT name FROM vendors WHERE wedding_id = $1`, [weddingId]),
      pool.query(
        `SELECT t.title, v.name AS vendor_name
         FROM todos t
         LEFT JOIN vendors v ON v.id = t.assigned_to_vendor_id
         WHERE t.wedding_id = $1 AND t.status = 'open'`,
        [weddingId]
      ),
      pool.query(
        `SELECT event_date, time_label, action FROM timeline_entries
         WHERE wedding_id = $1
         ORDER BY event_date ASC NULLS LAST, sort_order ASC LIMIT 80`,
        [weddingId]
      ),
    ]);
    if (weddingRow.rows.length === 0) throw new AppError('WEDDING_NOT_FOUND');

    // Fetch sources in parallel — Gmail and Drive don't depend on each other.
    const fetches: Promise<unknown>[] = [];
    fetches.push(
      tokenInfo.gmail
        ? listRecentInboxMessages(tokenInfo.accessToken, { maxResults: 20, daysBack: 14 })
        : Promise.resolve([])
    );
    fetches.push(
      tokenInfo.drive
        ? listRecentDriveFiles(tokenInfo.accessToken, { maxResults: 15, daysBack: 30 })
        : Promise.resolve([])
    );

    const [emails, files] = (await Promise.all(fetches)) as [
      Awaited<ReturnType<typeof listRecentInboxMessages>>,
      Awaited<ReturnType<typeof listRecentDriveFiles>>,
    ];

    const suggestions = await generateSuggestions({
      context: {
        weddingName: weddingRow.rows[0].display_name,
        vendorNames: vendorsRows.rows.map((v) => v.name as string),
        openTodos: todosRows.rows.map((t) => ({
          title: t.title as string,
          vendor_name: (t.vendor_name as string) || null,
        })),
        upcomingTimeline: timelineRows.rows.map((e) => ({
          event_date: e.event_date as string | null,
          time_label: e.time_label as string | null,
          action: e.action as string,
        })),
      },
      emails,
      files,
    });

    // De-dupe against existing pending suggestions for the same source_ref.
    const existing = await pool.query(
      `SELECT source_ref FROM suggestions
       WHERE wedding_id = $1 AND status = 'pending' AND source_ref IS NOT NULL`,
      [weddingId]
    );
    const seen = new Set(existing.rows.map((r) => r.source_ref as string));

    let inserted = 0;
    for (const s of suggestions) {
      if (seen.has(s.source_ref)) continue;
      await pool.query(
        `INSERT INTO suggestions
           (wedding_id, source_type, source_ref, source_summary, source_url,
            action_type, payload, rationale, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
        [
          weddingId,
          'email',
          s.source_ref,
          s.source_summary,
          s.source_url || null,
          s.action_type,
          JSON.stringify(s.payload),
          s.rationale,
        ]
      );
      inserted += 1;
    }

    // Mark scan timestamps so the UI can show "last scanned X minutes ago".
    await pool.query(
      `UPDATE google_connections
       SET last_scanned_at = CASE WHEN gmail_enabled THEN NOW() ELSE last_scanned_at END,
           last_drive_scanned_at = CASE WHEN drive_enabled THEN NOW() ELSE last_drive_scanned_at END
       WHERE wedding_id = $1`,
      [weddingId]
    );

    return Response.json({
      data: {
        emails_scanned: emails.length,
        files_scanned: files.length,
        suggestions_created: inserted,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
