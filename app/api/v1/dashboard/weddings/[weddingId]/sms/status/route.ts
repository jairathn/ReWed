import { NextRequest } from 'next/server';
import { handleApiError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { isTwilioConfigured, validateTwilioCredentials } from '@/lib/messaging/twilio-client';
import { normalizePhone } from '@/lib/messaging/normalize-phone';
import { env } from '@/lib/env';

/**
 * GET /api/v1/dashboard/weddings/[weddingId]/sms/status
 *
 * Returns whether Twilio is configured, guest counts by audience (only
 * guests whose phone normalizes to E.164 — same rule the send route
 * applies), per-group counts, and recent blast history.
 *
 * Counts are computed in JS rather than SQL because "has a usable phone"
 * means normalizePhone() succeeds, not merely phone IS NOT NULL.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const pool = getPool();
    const result = await pool.query(
      `SELECT rsvp_status, group_label, phone
       FROM guests
       WHERE wedding_id = $1 AND soft_deleted_at IS NULL`,
      [weddingId]
    );

    const counts = { total: 0, with_phone: 0, attending: 0, pending: 0, declined: 0 };
    const groupCounts = new Map<string, number>();

    for (const row of result.rows) {
      counts.total += 1;
      if (!normalizePhone(row.phone).ok) continue;
      counts.with_phone += 1;
      if (row.rsvp_status === 'attending') counts.attending += 1;
      else if (row.rsvp_status === 'pending') counts.pending += 1;
      else if (row.rsvp_status === 'declined') counts.declined += 1;
      if (row.group_label) {
        groupCounts.set(row.group_label, (groupCounts.get(row.group_label) || 0) + 1);
      }
    }

    const groups = [...groupCounts.entries()]
      .map(([label, with_phone]) => ({ label, with_phone }))
      .sort((a, b) => b.with_phone - a.with_phone || a.label.localeCompare(b.label));

    // History is best-effort: the table arrives in migration 026, and the
    // composer should still work if that hasn't been applied yet.
    let recent: unknown[] = [];
    try {
      const history = await pool.query(
        `SELECT id, body, audience, group_labels, recipient_count, sent_count,
                failed_count, skipped_bad_phone, created_at
         FROM sms_messages
         WHERE wedding_id = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [weddingId]
      );
      recent = history.rows;
    } catch {
      // table missing — ignore
    }

    // Validate the credentials so the banner reflects reality, not just the
    // presence of env vars. Only worth the round-trip if env vars are set.
    const configured = isTwilioConfigured();
    const credCheck = configured
      ? await validateTwilioCredentials()
      : { valid: false as boolean | null, error: null };

    return Response.json({
      configured,
      credentials_valid: credCheck.valid,
      credentials_error: credCheck.error,
      from_number: env.TWILIO_MESSAGING_SERVICE_SID
        ? null // messaging service picks the number per-send
        : env.TWILIO_PHONE_NUMBER || null,
      uses_messaging_service: !!env.TWILIO_MESSAGING_SERVICE_SID,
      counts,
      groups,
      recent,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
