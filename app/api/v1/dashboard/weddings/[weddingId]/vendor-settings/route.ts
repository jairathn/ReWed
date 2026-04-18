import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';

const patchSchema = z.object({
  vendor_notification_email: z.string().email().max(255).or(z.literal('')).optional(),
});

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
      `SELECT config FROM weddings WHERE id = $1`,
      [weddingId]
    );
    const config = result.rows[0]?.config || {};
    return Response.json({
      data: {
        vendor_notification_email: config.vendor_notification_email || '',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }

    const pool = getPool();
    const current = await pool.query(
      `SELECT config FROM weddings WHERE id = $1`,
      [weddingId]
    );
    const config = current.rows[0]?.config || {};

    if (parsed.data.vendor_notification_email !== undefined) {
      const email = parsed.data.vendor_notification_email.trim();
      if (email) config.vendor_notification_email = email;
      else delete config.vendor_notification_email;
    }

    await pool.query(`UPDATE weddings SET config = $1 WHERE id = $2`, [
      JSON.stringify(config),
      weddingId,
    ]);

    return Response.json({
      data: {
        vendor_notification_email: config.vendor_notification_email || '',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
