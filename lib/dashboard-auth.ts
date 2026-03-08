import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production-min-32-chars!!';
}

/**
 * Extract the couple ID from the JWT cookie on a dashboard request.
 */
export function getCoupleId(request: NextRequest): string {
  const token = request.cookies.get('couple_token')?.value;
  if (!token) throw new AppError('AUTH_NOT_REGISTERED');

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { sub: string };
    return decoded.sub;
  } catch {
    throw new AppError('AUTH_TOKEN_EXPIRED');
  }
}

/**
 * Verify that the couple owns the specified wedding. Throws WEDDING_NOT_FOUND if not.
 */
export async function verifyWeddingOwnership(coupleId: string, weddingId: string) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT id FROM weddings WHERE id = $1 AND couple_id = $2',
    [weddingId, coupleId]
  );
  if (result.rows.length === 0) {
    throw new AppError('WEDDING_NOT_FOUND');
  }
}
