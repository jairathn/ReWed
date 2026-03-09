import { NextRequest } from 'next/server';
import { Pool } from 'pg';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
import { AppError } from '@/lib/errors';

export interface TravelAuthContext {
  pool: Pool;
  weddingId: string;
  guestId: string;
}

/**
 * Validates session and verifies the guest belongs to the wedding identified by slug.
 */
export async function authenticateTravelRequest(
  request: NextRequest,
  slug: string
): Promise<TravelAuthContext> {
  const pool = getPool();

  const sessionToken = request.cookies.get('wedding_session')?.value;
  if (!sessionToken) {
    throw new AppError('AUTH_NOT_REGISTERED');
  }

  const session = await validateSession(pool, sessionToken);
  if (!session) {
    throw new AppError('AUTH_TOKEN_EXPIRED');
  }

  const weddingResult = await pool.query(
    `SELECT id FROM weddings WHERE slug = $1`,
    [slug]
  );
  if (weddingResult.rows.length === 0) {
    throw new AppError('WEDDING_NOT_FOUND');
  }
  if (weddingResult.rows[0].id !== session.weddingId) {
    throw new AppError('AUTH_NOT_REGISTERED');
  }

  return { pool, weddingId: session.weddingId, guestId: session.guestId };
}
