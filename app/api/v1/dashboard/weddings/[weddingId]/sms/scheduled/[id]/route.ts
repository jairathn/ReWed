import { NextRequest } from 'next/server';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { cancelScheduledSms } from '@/lib/messaging/twilio-client';

/**
 * DELETE /api/v1/dashboard/weddings/[weddingId]/sms/scheduled/[id]
 *
 * Cancel a scheduled broadcast: tell Twilio to cancel every per-recipient
 * message that hasn't fired yet, then mark the local record 'canceled'. We
 * treat per-SID cancel failures as best-effort (a message that already fired
 * or was already canceled can't be canceled) and still flip the local status
 * so it leaves the pending list.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string; id: string }> }
) {
  try {
    const { weddingId, id } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const pool = getPool();
    const found = await pool.query(
      `SELECT twilio_message_sids, status
       FROM sms_scheduled
       WHERE id = $1 AND wedding_id = $2`,
      [id, weddingId]
    );

    if (found.rows.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Scheduled text not found');
    }
    if (found.rows[0].status !== 'scheduled') {
      throw new AppError('VALIDATION_ERROR', 'This text is no longer scheduled');
    }

    const sids: string[] = found.rows[0].twilio_message_sids || [];
    let canceled = 0;
    let failed = 0;
    for (const sid of sids) {
      const err = await cancelScheduledSms(sid);
      if (err) failed += 1;
      else canceled += 1;
    }

    await pool.query(
      `UPDATE sms_scheduled SET status = 'canceled', canceled_at = now() WHERE id = $1`,
      [id]
    );

    return Response.json({ canceled, failed, total: sids.length });
  } catch (error) {
    return handleApiError(error);
  }
}
