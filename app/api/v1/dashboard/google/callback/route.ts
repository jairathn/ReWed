import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import {
  exchangeCodeForTokens,
  fetchUserEmail,
  GMAIL_SCOPE,
  DRIVE_SCOPE,
} from '@/lib/google/oauth';
import { encryptToken } from '@/lib/google/crypto';

/**
 * GET /api/v1/dashboard/google/callback
 * Google redirects the browser here with ?code=...&state=... after consent.
 * We swap the code for tokens, persist them encrypted, and bounce the user
 * back to the To-dos page (where the connection card lives).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || url.origin;

  if (oauthError) {
    return NextResponse.redirect(
      `${appUrl}/dashboard?google_error=${encodeURIComponent(oauthError)}`
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/dashboard?google_error=missing_params`);
  }

  const pool = getPool();
  const stateRow = await pool.query(
    `DELETE FROM google_oauth_states WHERE state = $1 RETURNING wedding_id`,
    [state]
  );
  if (stateRow.rows.length === 0) {
    return NextResponse.redirect(`${appUrl}/dashboard?google_error=invalid_state`);
  }
  const weddingId = stateRow.rows[0].wedding_id as string;

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch {
    return NextResponse.redirect(
      `${appUrl}/dashboard/${weddingId}/todos?google_error=exchange_failed`
    );
  }
  if (!tokens.refresh_token) {
    // Google only returns refresh_token on the first consent. If a stale
    // grant exists, ask the user to disconnect first.
    return NextResponse.redirect(
      `${appUrl}/dashboard/${weddingId}/todos?google_error=no_refresh_token`
    );
  }

  const email = (await fetchUserEmail(tokens.access_token)) || 'unknown@google';
  const grantedScopes = tokens.scope.split(/\s+/);
  const gmailEnabled = grantedScopes.includes(GMAIL_SCOPE);
  const driveEnabled = grantedScopes.includes(DRIVE_SCOPE);
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await pool.query(
    `INSERT INTO google_connections
       (wedding_id, email, refresh_token, access_token, access_token_expires_at,
        scope, gmail_enabled, drive_enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (wedding_id) DO UPDATE
       SET email = EXCLUDED.email,
           refresh_token = EXCLUDED.refresh_token,
           access_token = EXCLUDED.access_token,
           access_token_expires_at = EXCLUDED.access_token_expires_at,
           scope = EXCLUDED.scope,
           gmail_enabled = EXCLUDED.gmail_enabled,
           drive_enabled = EXCLUDED.drive_enabled`,
    [
      weddingId,
      email,
      encryptToken(tokens.refresh_token),
      encryptToken(tokens.access_token),
      expiresAt,
      tokens.scope,
      gmailEnabled,
      driveEnabled,
    ]
  );

  return NextResponse.redirect(
    `${appUrl}/dashboard/${weddingId}/todos?google_connected=1`
  );
}
