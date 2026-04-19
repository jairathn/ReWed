import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { buildAuthUrl, generateOauthState, isGoogleConfigured } from '@/lib/google/oauth';

/**
 * GET /api/v1/dashboard/weddings/[weddingId]/google/connect
 * Couple-only entry point: stores a CSRF state row and redirects the
 * browser to Google's consent screen. Google will redirect back to
 * /api/v1/dashboard/google/callback after consent.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    if (!isGoogleConfigured()) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and NEXT_PUBLIC_APP_URL.'
      );
    }

    const state = generateOauthState();
    const pool = getPool();
    await pool.query(
      `INSERT INTO google_oauth_states (state, wedding_id) VALUES ($1, $2)`,
      [state, weddingId]
    );

    return NextResponse.redirect(buildAuthUrl(state));
  } catch (error) {
    return handleApiError(error);
  }
}
