import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { signPlannerToken } from '@/lib/dashboard-auth';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

/**
 * GET /planner/[token]
 * Validates the magic-link token, sets a planner_session cookie, and
 * redirects into the timeline editor for the wedding they were granted.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, wedding_id, name, email
     FROM planner_access
     WHERE access_token = $1 AND revoked_at IS NULL
     LIMIT 1`,
    [token]
  );

  if (result.rows.length === 0) {
    const url = new URL('/planner/invalid', request.url);
    return NextResponse.redirect(url);
  }

  const planner = result.rows[0];
  const jwt = signPlannerToken({
    plannerId: planner.id,
    weddingId: planner.wedding_id,
    email: planner.email,
    name: planner.name,
  });

  const target = new URL(`/dashboard/${planner.wedding_id}/timeline`, request.url);
  const response = NextResponse.redirect(target);
  response.cookies.set('planner_token', jwt, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}
