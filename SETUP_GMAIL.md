# Setting up Gmail + Drive integration

This walks you through getting `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` so the couple's dashboard can scan their inbox and Drive for to-dos and timeline updates.

About 10 minutes of clicking. You only do it once per environment (dev / prod).

## 1. Create a Google Cloud project

1. Open https://console.cloud.google.com/
2. Top bar → project picker → **New project** (name it whatever, e.g. `zari-prod`)
3. Wait ~30 seconds for it to provision, then make sure it's selected in the project picker

## 2. Enable the Gmail and Drive APIs

In the search bar, type each one and click **Enable**:

- **Gmail API**
- **Google Drive API**

## 3. Configure the OAuth consent screen

1. Left nav → **APIs & Services** → **OAuth consent screen**
2. Choose **External** (so anyone with a Google account can use it). Click Create.
3. Fill in:
   - App name: `Zari`
   - User support email: your email
   - App logo: optional
   - Authorized domains: `<your-zari-domain.com>` (skip in local dev)
   - Developer contact: your email
4. **Scopes** → Add:
   - `.../auth/userinfo.email`
   - `openid`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/drive.readonly`
5. **Test users** → add the couple's Gmail addresses (any account that needs to connect while the app is in "testing" mode). When you're ready to launch publicly, click **Publish app** here — Google may ask for verification if you have many users.

## 4. Create the OAuth client ID

1. Left nav → **APIs & Services** → **Credentials**
2. **+ Create credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `Zari web client`
5. **Authorized redirect URIs** → add:
   - `http://localhost:3000/api/v1/dashboard/google/callback` (local dev)
   - `https://<your-prod-domain>/api/v1/dashboard/google/callback` (prod)
6. Click **Create**

A modal appears with your **Client ID** and **Client secret**. Copy both.

## 5. Add environment variables

In your `.env.local` (dev) and your prod environment (Vercel/Railway/etc):

```
GOOGLE_OAUTH_CLIENT_ID=<paste from step 4>
GOOGLE_OAUTH_CLIENT_SECRET=<paste from step 4>
NEXT_PUBLIC_APP_URL=https://your-zari-domain.com   # or http://localhost:3000 in dev
```

If `JWT_SECRET` isn't already set, add a strong random one — it's used to encrypt the OAuth refresh tokens at rest:

```
JWT_SECRET=<at least 32 random characters>
```

Restart the app.

## 6. Apply the database migrations

```
psql $DATABASE_URL_UNPOOLED -f lib/db/migrations/019_gmail_suggestions.sql
psql $DATABASE_URL_UNPOOLED -f lib/db/migrations/020_google_drive.sql
```

## 7. Connect from the dashboard

1. Open `/dashboard/<weddingId>/todos`
2. Top card now says **Connect Gmail + Drive**
3. Click → consent screen → grant Gmail + Drive read-only access
4. Land back on the To-dos page with the connection active
5. Click **Analyze emails + Drive** to scan the last 14 days of inbox + 30 days of Drive
6. Suggestions appear inline; **Accept** applies them, **Decline** dismisses

## What it can do

- **Create to-dos** from emails ("Caterer asked us to confirm headcount by Tuesday" → new to-do for the couple)
- **Update to-dos** ("we already paid the deposit" → marks the open deposit to-do complete)
- **Update timeline entries** ("ceremony moved to 5:30 PM" → updates the timeline entry's time)

You always review before anything is applied. Decline is a soft "no thanks" — the suggestion is dismissed and won't be re-proposed for the same email.

## Privacy notes

- We only read from Gmail/Drive. We never send, modify, delete, or share anything.
- Refresh tokens are encrypted at rest with AES-256-GCM keyed off `JWT_SECRET`.
- Email and file content is sent to OpenAI as part of the suggestion request, then forgotten — we don't store the raw email body in the database. Only the resulting suggestion (which references the email by ID) is persisted.
- Disconnect any time via the dashboard → all tokens are dropped immediately.
