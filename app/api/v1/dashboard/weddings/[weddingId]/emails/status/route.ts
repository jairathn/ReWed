import { NextRequest } from 'next/server';
import { handleApiError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { isResendConfigured } from '@/lib/email/resend-client';
import { env } from '@/lib/env';

/**
 * GET /api/v1/dashboard/weddings/[weddingId]/emails/status
 *
 * Returns whether the Resend email service is configured and how many of
 * this wedding's guests have an email address on file (broken out by RSVP).
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
      `SELECT
         COUNT(*) FILTER (WHERE email IS NOT NULL AND email != '') AS with_email,
         COUNT(*) FILTER (WHERE rsvp_status = 'attending' AND email IS NOT NULL AND email != '') AS attending,
         COUNT(*) FILTER (WHERE rsvp_status = 'pending' AND email IS NOT NULL AND email != '') AS pending,
         COUNT(*) FILTER (WHERE rsvp_status = 'declined' AND email IS NOT NULL AND email != '') AS declined,
         COUNT(*) AS total
       FROM guests
       WHERE wedding_id = $1`,
      [weddingId]
    );
    const row = result.rows[0];

    return Response.json({
      configured: isResendConfigured(),
      from_email: env.RESEND_FROM_EMAIL || null,
      from_name: env.RESEND_FROM_NAME || null,
      reply_to: env.RESEND_REPLY_TO || null,
      counts: {
        total: Number(row.total || 0),
        with_email: Number(row.with_email || 0),
        attending: Number(row.attending || 0),
        pending: Number(row.pending || 0),
        declined: Number(row.declined || 0),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
