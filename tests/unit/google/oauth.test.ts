import { describe, it, expect, beforeEach } from 'vitest';

describe('Google OAuth config detection', () => {
  beforeEach(() => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  });

  it('reports unconfigured when env vars are missing', async () => {
    const { isGoogleConfigured, getGoogleConfig } = await import('@/lib/google/oauth');
    expect(isGoogleConfigured()).toBe(false);
    expect(getGoogleConfig()).toBeNull();
  });

  it('reports configured when env vars are set', async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'id-123';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'secret-456';
    process.env.NEXT_PUBLIC_APP_URL = 'https://test.example';
    const { isGoogleConfigured, getGoogleConfig, buildAuthUrl, generateOauthState } = await import('@/lib/google/oauth');
    expect(isGoogleConfigured()).toBe(true);
    const cfg = getGoogleConfig()!;
    expect(cfg.redirectUri).toBe('https://test.example/api/v1/dashboard/google/callback');

    const state = generateOauthState();
    const url = buildAuthUrl(state);
    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('client_id=id-123');
    expect(url).toContain(`state=${state}`);
    // Both scopes must be requested.
    expect(decodeURIComponent(url)).toContain('gmail.readonly');
    expect(decodeURIComponent(url)).toContain('drive.readonly');
    // Need offline + consent to guarantee a refresh_token.
    expect(url).toContain('access_type=offline');
    expect(url).toContain('prompt=consent');
  });
});
