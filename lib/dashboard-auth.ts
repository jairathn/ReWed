import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production-min-32-chars!!';
}

export type DashboardActor =
  | { role: 'couple'; coupleId: string }
  | { role: 'planner'; plannerId: string; weddingId: string; name: string | null; email: string };

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

/**
 * Sign a planner session token. Used after a planner clicks their magic link
 * so subsequent dashboard requests can authenticate without re-validating the
 * single-use access_token on every call.
 */
export function signPlannerToken(args: {
  plannerId: string;
  weddingId: string;
  email: string;
  name: string | null;
}): string {
  return jwt.sign(
    {
      sub: args.plannerId,
      role: 'planner',
      wid: args.weddingId,
      email: args.email,
      name: args.name,
    },
    getJwtSecret(),
    { expiresIn: '90d' }
  );
}

type PlannerActor = Extract<DashboardActor, { role: 'planner' }>;

function getPlannerFromCookie(request: NextRequest): PlannerActor | null {
  const token = request.cookies.get('planner_token')?.value;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as {
      sub: string;
      role: string;
      wid: string;
      email: string;
      name: string | null;
    };
    if (decoded.role !== 'planner') return null;
    return {
      role: 'planner',
      plannerId: decoded.sub,
      weddingId: decoded.wid,
      email: decoded.email,
      name: decoded.name ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve who is making this request and assert they have access to the
 * given wedding. Couples need ownership; planners need an active grant on the
 * specific wedding (and we re-check the row so revocation takes effect even
 * before the JWT expires).
 */
export async function requireWeddingAccess(
  request: NextRequest,
  weddingId: string
): Promise<DashboardActor> {
  const coupleToken = request.cookies.get('couple_token')?.value;
  if (coupleToken) {
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);
    return { role: 'couple', coupleId };
  }

  const planner = getPlannerFromCookie(request);
  if (planner && planner.weddingId === weddingId) {
    const pool = getPool();
    const row = await pool.query(
      `SELECT id FROM planner_access
       WHERE id = $1 AND wedding_id = $2 AND revoked_at IS NULL`,
      [planner.plannerId, weddingId]
    );
    if (row.rows.length === 0) throw new AppError('AUTH_TOKEN_EXPIRED');
    return planner;
  }

  throw new AppError('AUTH_NOT_REGISTERED');
}
