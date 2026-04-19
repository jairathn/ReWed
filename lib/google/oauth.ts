import { randomBytes } from 'crypto';
import type { Pool } from 'pg';
import { encryptToken, decryptToken } from './crypto';

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
export const PROFILE_SCOPES = ['openid', 'email'];

export const ALL_SCOPES = [GMAIL_SCOPE, DRIVE_SCOPE, ...PROFILE_SCOPES];

export interface GoogleEnvConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getGoogleConfig(): GoogleEnvConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId || !clientSecret || !appUrl) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl}/api/v1/dashboard/google/callback`,
  };
}

export function isGoogleConfigured(): boolean {
  return getGoogleConfig() !== null;
}

export function buildAuthUrl(state: string): string {
  const cfg = getGoogleConfig();
  if (!cfg) throw new Error('Google OAuth is not configured');
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: ALL_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',           // forces refresh_token to be returned every time
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface TokenExchangeResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenExchangeResponse> {
  const cfg = getGoogleConfig();
  if (!cfg) throw new Error('Google OAuth is not configured');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as TokenExchangeResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
  scope: string;
}> {
  const cfg = getGoogleConfig();
  if (!cfg) throw new Error('Google OAuth is not configured');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} ${text}`);
  }
  return (await res.json()) as { access_token: string; expires_in: number; scope: string };
}

export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email || null;
}

export function generateOauthState(): string {
  return randomBytes(24).toString('hex');
}

/**
 * Get a usable access token for the wedding's connected mailbox, refreshing
 * (and persisting) if the cached one has expired or is about to expire.
 */
export async function getAccessTokenForWedding(
  pool: Pool,
  weddingId: string
): Promise<{ accessToken: string; gmail: boolean; drive: boolean } | null> {
  const result = await pool.query(
    `SELECT refresh_token, access_token, access_token_expires_at, gmail_enabled, drive_enabled
     FROM google_connections WHERE wedding_id = $1`,
    [weddingId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];

  const refreshToken = decryptToken(row.refresh_token as string);
  const expires = row.access_token_expires_at ? new Date(row.access_token_expires_at) : new Date(0);
  const cushionMs = 60 * 1000; // refresh 1 minute before actual expiry
  const stillValid = row.access_token && expires.getTime() - Date.now() > cushionMs;

  if (stillValid) {
    return {
      accessToken: decryptToken(row.access_token as string),
      gmail: !!row.gmail_enabled,
      drive: !!row.drive_enabled,
    };
  }

  const refreshed = await refreshAccessToken(refreshToken);
  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000);
  await pool.query(
    `UPDATE google_connections
     SET access_token = $1, access_token_expires_at = $2
     WHERE wedding_id = $3`,
    [encryptToken(refreshed.access_token), newExpiry, weddingId]
  );
  return {
    accessToken: refreshed.access_token,
    gmail: !!row.gmail_enabled,
    drive: !!row.drive_enabled,
  };
}
