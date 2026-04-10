import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId } from '@/lib/dashboard-auth';

const bodySchema = z.object({
  password: z.string().min(1).max(128),
});

/**
 * POST /api/v1/dashboard/auth/verify-password
 *
 * Re-verifies the logged-in couple's password without issuing a new session.
 * Used as a second-factor check before destructive dashboard operations
 * (bulk guest delete, event delete, etc.) so a forgotten-open laptop can't
 * wipe wedding data with a single misclick.
 *
 * Returns 200 { ok: true } on match, 401 AUTH_INVALID_CREDENTIALS on mismatch.
 */
export async function POST(request: NextRequest) {
  try {
    const coupleId = getCoupleId(request);
    const body = await request.json();
    const { password } = bodySchema.parse(body);

    const pool = getPool();
    const result = await pool.query(
      'SELECT password_hash FROM couples WHERE id = $1',
      [coupleId]
    );

    if (result.rows.length === 0) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'Incorrect password. Please try again.');
    }

    const valid = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!valid) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'Incorrect password. Please try again.');
    }

    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
