# Wedding Guest Experience Platform — Master Production Spec

> **This document complements SCALING_PLAN.md.** The scaling plan covers architecture, features, pricing, and phased build. This document covers everything else needed to ship production-grade: full SQL, env vars, API contracts, error handling, CI/CD, security, monitoring, test implementations, deployment, and operational runbooks.

---

## Table of Contents

1. [What the Scaling Plan Already Covers (Don't Duplicate)](#1-what-the-scaling-plan-already-covers)
2. [What's Missing — Gap Analysis](#2-whats-missing)
3. [Environment Variables Catalog](#3-environment-variables)
4. [Full SQL Migrations](#4-sql-migrations)
5. [API Contracts (Request/Response Types)](#5-api-contracts)
6. [Error Handling Strategy](#6-error-handling)
7. [Security Hardening](#7-security)
8. [Media Processing Pipeline](#8-media-processing)
9. [Service Worker & PWA](#9-service-worker)
10. [Remotion Template Interfaces](#10-remotion-templates)
11. [Email Templates](#11-email-templates)
12. [CI/CD Pipeline](#12-cicd)
13. [Monitoring & Alerting](#13-monitoring)
14. [Deployment Runbook](#14-deployment)
15. [Performance Budgets](#15-performance)
16. [Accessibility](#16-accessibility)
17. [Complete Test Implementations](#17-tests)
18. [Operational Runbooks](#18-ops-runbooks)

---

## 1. What the Scaling Plan Already Covers

Do NOT re-implement or re-specify these — read SCALING_PLAN.md directly:

- The emotional pitch and competitive positioning (vs Voast)
- Multi-tenancy architecture (URL structure, tenant resolution, data isolation)
- Feature list (capture, schedule, gallery, feed, FAQ, notifications, deliverables)
- AI portrait strategy (gpt-image-1.5, quota enforcement, caching)
- Deliverables deep dive (Remotion, AI curation pipeline, beat detection, sequencing)
- Pricing model (guided package builder, transparent breakdown, unit economics)
- Technology evaluation (Next.js 15, Neon, R2, Remotion Lambda, Vercel)
- Infrastructure diagram
- Database schema design (tables, JSONB configs, RLS strategy)
- Project structure (file tree)
- Phased build plan with test descriptions
- Risk mitigations

---

## 2. What's Missing — Gap Analysis

| Gap | Risk if Skipped | Priority |
|-----|----------------|----------|
| Full SQL migrations (actual CREATE TABLE) | Schema drift, inconsistent deploys | P0 |
| Environment variables catalog | Broken deploys, leaked secrets | P0 |
| API contracts (TypeScript types) | Frontend/backend misalignment | P0 |
| Error handling (codes, messages, retry logic) | Poor UX on failures | P0 |
| Security headers (CSP, CORS, HSTS) | Vulnerabilities | P0 |
| CI/CD pipeline (GitHub Actions) | Manual testing, regressions | P0 |
| Media processing specs (Sharp, transcoding) | Broken thumbnails, slow loads | P1 |
| Service worker caching strategy | Offline failures | P1 |
| Remotion template TypeScript interfaces | Reel rendering failures | P1 |
| Email templates (React Email) | Broken delivery emails | P1 |
| Monitoring & alerting | Silent failures | P1 |
| Performance budgets | Slow guest experience | P1 |
| Test fixture generation (stock images/video) | Can't run tests without user assets | P1 |
| Deployment runbook | Failed first deploy | P2 |
| Accessibility | Excludes guests | P2 |
| Backup/DR strategy | Data loss | P2 |
| Landing page structure | No marketing funnel | P2 |

---

## 3. Environment Variables

### Required — App Won't Start Without These

```bash
# ── Database ──
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require  # Neon connection string (pooled)
DATABASE_URL_UNPOOLED=postgresql://user:pass@host/db?sslmode=require  # For migrations only

# ── Storage ──
R2_ACCOUNT_ID=abc123                         # Cloudflare account ID
R2_ACCESS_KEY_ID=xxx                         # R2 API token (S3-compatible)
R2_SECRET_ACCESS_KEY=xxx                     # R2 API secret
R2_BUCKET_NAME=wedding-media                 # R2 bucket name
R2_PUBLIC_URL=https://media.yourplatform.com # Cloudflare CDN custom domain

# ── Auth ──
JWT_SECRET=<64-char-random-hex>              # HS256 signing key for couple JWTs
GUEST_SESSION_SECRET=<64-char-random-hex>    # HMAC for guest session cookies

# ── AI ──
OPENAI_API_KEY=sk-...                        # For gpt-image-1.5, gpt-4o, gpt-4o-mini, Whisper

# ── Billing ──
STRIPE_SECRET_KEY=sk_live_...                # Stripe server-side key
STRIPE_WEBHOOK_SECRET=whsec_...              # Stripe webhook signing secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_  # Client-side Stripe key

# ── Email ──
SES_REGION=us-east-1                         # AWS SES region
SES_ACCESS_KEY_ID=xxx                        # SES IAM credentials
SES_SECRET_ACCESS_KEY=xxx
SES_FROM_EMAIL=hello@yourplatform.com        # Verified sender

# ── SMS ──
TWILIO_ACCOUNT_SID=AC...                     # Twilio account SID
TWILIO_AUTH_TOKEN=xxx                        # Twilio auth token
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX             # Twilio sender number

# ── Cache ──
UPSTASH_REDIS_URL=https://xxx.upstash.io     # Upstash Redis REST URL
UPSTASH_REDIS_TOKEN=xxx                      # Upstash Redis token

# ── Video Rendering ──
REMOTION_AWS_REGION=us-east-1                # Lambda region
REMOTION_FUNCTION_NAME=remotion-render       # Lambda function name
REMOTION_SERVE_URL=https://xxx.s3.amazonaws.com/sites/xxx  # Deployed Remotion bundle
AWS_ACCESS_KEY_ID=xxx                        # For Remotion Lambda
AWS_SECRET_ACCESS_KEY=xxx

# ── App ──
NEXT_PUBLIC_APP_URL=https://yourplatform.com # Canonical URL
NODE_ENV=production
```

### Optional / Feature Flags

```bash
TEST_MODE=false                              # true = mock all external services
LOG_LEVEL=info                               # debug | info | warn | error
SENTRY_DSN=https://xxx@sentry.io/xxx        # Error tracking
VERCEL_ANALYTICS_ID=xxx                      # Vercel web analytics
ENABLE_SMS=true                              # Kill switch for SMS sends
ENABLE_AI_PORTRAITS=true                     # Kill switch for AI generation
```

### Per-Environment Overrides

| Variable | Development | Preview | Production |
|----------|-------------|---------|------------|
| `DATABASE_URL` | Neon branch | Neon branch (auto per PR) | Neon main |
| `R2_BUCKET_NAME` | `wedding-media-dev` | `wedding-media-preview` | `wedding-media` |
| `STRIPE_SECRET_KEY` | `sk_test_...` | `sk_test_...` | `sk_live_...` |
| `TEST_MODE` | `true` | `false` | `false` |
| `SES_FROM_EMAIL` | `test@...` (sandbox) | `test@...` | `hello@...` |

---

## 4. SQL Migrations

### Migration 001: Foundation Tables

```sql
-- 001_foundation.sql
-- Run with: psql $DATABASE_URL_UNPOOLED -f migrations/001_foundation.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";   -- pgvector for FAQ embeddings
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- Trigram for fuzzy name search

-- ═══ COUPLES (account holders) ═══
CREATE TABLE couples (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT,
  stripe_customer_id TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_couples_email ON couples(email);
CREATE INDEX idx_couples_stripe ON couples(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- ═══ WEDDINGS (tenants) ═══
CREATE TABLE weddings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  couple_id       UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  slug            TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,           -- "Neil & Shriya's Wedding"
  hashtag         TEXT,                    -- "#JayWalkingToJairath"
  wedding_date    DATE,
  status          TEXT NOT NULL DEFAULT 'setup'
                  CHECK (status IN ('setup', 'active', 'post_wedding', 'archived')),
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  package_config  JSONB NOT NULL DEFAULT '{}'::jsonb,
  storage_used_bytes  BIGINT DEFAULT 0,
  ai_portraits_used   INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_weddings_slug ON weddings(slug);
CREATE INDEX idx_weddings_couple ON weddings(couple_id);
CREATE INDEX idx_weddings_status ON weddings(status);

-- ═══ EVENTS ═══
CREATE TABLE events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id   UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  date         DATE,
  start_time   TIME,
  end_time     TIME,
  venue_name   TEXT,
  venue_address TEXT,
  dress_code   TEXT,
  description  TEXT,
  logistics    TEXT,                      -- "Bus departs hotel at 4pm"
  accent_color TEXT,                      -- hex color for UI theming
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_events_wedding ON events(wedding_id);

-- ═══ GUESTS ═══
CREATE TABLE guests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id   UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  first_name   TEXT NOT NULL,
  last_name    TEXT NOT NULL,
  display_name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  email        TEXT,
  phone        TEXT,
  group_label  TEXT,                      -- "Family", "College Friends", "Work"
  rsvp_status  TEXT DEFAULT 'pending'
               CHECK (rsvp_status IN ('pending', 'attending', 'declined')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_guests_wedding ON guests(wedding_id);
CREATE INDEX idx_guests_name_trgm ON guests USING gin (display_name gin_trgm_ops);
CREATE INDEX idx_guests_wedding_name ON guests(wedding_id, first_name, last_name);

-- ═══ SESSIONS ═══
CREATE TABLE sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id   UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id     UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  device_type  TEXT DEFAULT 'mobile'
               CHECK (device_type IN ('mobile', 'kiosk_ipad', 'desktop')),
  token_hash   TEXT NOT NULL UNIQUE,     -- bcrypt hash of session token
  user_agent   TEXT,
  last_active  TIMESTAMPTZ DEFAULT NOW(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_token ON sessions(token_hash);
CREATE INDEX idx_sessions_guest ON sessions(guest_id);
CREATE INDEX idx_sessions_wedding ON sessions(wedding_id);

-- ═══ UPLOADS ═══
CREATE TABLE uploads (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id    UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id      UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  event_id      UUID REFERENCES events(id) ON DELETE SET NULL,
  type          TEXT NOT NULL CHECK (type IN ('photo', 'video')),
  storage_key   TEXT NOT NULL,           -- R2 object key
  original_filename TEXT,
  mime_type     TEXT,
  size_bytes    BIGINT,
  duration_ms   INTEGER,                 -- for videos
  width         INTEGER,
  height        INTEGER,
  filter_applied TEXT,                   -- which filter was used
  prompt_answered TEXT,                  -- which video prompt was answered
  thumbnail_key TEXT,                    -- R2 key for thumbnail
  transcode_key TEXT,                    -- R2 key for transcoded video
  status        TEXT DEFAULT 'pending'
                CHECK (status IN ('pending', 'uploading', 'processing', 'ready', 'failed')),
  retry_count   INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_uploads_wedding ON uploads(wedding_id);
CREATE INDEX idx_uploads_guest ON uploads(guest_id);
CREATE INDEX idx_uploads_event ON uploads(event_id);
CREATE INDEX idx_uploads_wedding_status ON uploads(wedding_id, status);
CREATE INDEX idx_uploads_guest_type ON uploads(guest_id, type);

-- ═══ AI JOBS (portraits) ═══
CREATE TABLE ai_jobs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id    UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id      UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('portrait', 'reel_guest', 'reel_couple')),
  style_id      TEXT,                    -- "castle_wedding", "mughal", etc.
  input_key     TEXT,                    -- R2 key of source photo
  output_key    TEXT,                    -- R2 key of result
  status        TEXT DEFAULT 'queued'
                CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  cost_cents    INTEGER,                 -- actual API cost tracked
  error_message TEXT,
  metadata      JSONB DEFAULT '{}'::jsonb, -- Remotion inputProps, model params, etc.
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_jobs_wedding ON ai_jobs(wedding_id);
CREATE INDEX idx_ai_jobs_guest ON ai_jobs(guest_id);
CREATE INDEX idx_ai_jobs_status ON ai_jobs(wedding_id, status);
CREATE INDEX idx_ai_jobs_guest_type ON ai_jobs(guest_id, type);

-- Count index for quota enforcement (fast: "how many portraits has this guest done?")
CREATE INDEX idx_ai_jobs_quota ON ai_jobs(wedding_id, guest_id, type)
  WHERE status IN ('completed', 'processing');

-- ═══ SOCIAL FEED ═══
CREATE TABLE feed_posts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id    UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id      UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('text', 'photo', 'memory')),
  content       TEXT,                    -- text body
  photo_key     TEXT,                    -- R2 key if photo post
  like_count    INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  is_pinned     BOOLEAN DEFAULT FALSE,
  is_hidden     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feed_wedding ON feed_posts(wedding_id, created_at DESC)
  WHERE is_hidden = FALSE;

CREATE TABLE feed_likes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id     UUID NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  guest_id    UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, guest_id)
);

CREATE TABLE feed_comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id     UUID NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  guest_id    UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_post ON feed_comments(post_id, created_at);

-- ═══ FAQ ═══
CREATE TABLE faq_entries (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id    UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  question      TEXT NOT NULL,
  answer        TEXT NOT NULL,
  embedding     VECTOR(1536),            -- text-embedding-3-small
  source        TEXT DEFAULT 'manual'
                CHECK (source IN ('manual', 'zola_import', 'generated')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_faq_wedding ON faq_entries(wedding_id);
CREATE INDEX idx_faq_embedding ON faq_entries USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE TABLE faq_cache (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id    UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  question_hash TEXT NOT NULL,           -- hash of normalized question
  answer        TEXT NOT NULL,
  hit_count     INTEGER DEFAULT 1,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(wedding_id, question_hash)
);

-- ═══ NOTIFICATIONS ═══
CREATE TABLE notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id    UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id      UUID REFERENCES guests(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'push')),
  type          TEXT NOT NULL,           -- 'schedule_reminder', 'reel_ready', 'logistics', etc.
  payload       JSONB NOT NULL,          -- template data
  status        TEXT DEFAULT 'queued'
                CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'bounced')),
  external_id   TEXT,                    -- SES message ID or Twilio SID
  retry_count   INTEGER DEFAULT 0,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_status ON notifications(status, created_at);
CREATE INDEX idx_notifications_wedding ON notifications(wedding_id);

-- ═══ SUBSCRIPTIONS (Stripe) ═══
CREATE TABLE subscriptions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id            UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT,
  stripe_checkout_session_id TEXT,
  status                TEXT DEFAULT 'pending'
                        CHECK (status IN ('pending', 'active', 'past_due', 'canceled')),
  price_cents           INTEGER NOT NULL,
  package_snapshot      JSONB NOT NULL,  -- frozen copy of package_config at time of purchase
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_wedding ON subscriptions(wedding_id);
CREATE INDEX idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);

-- ═══ ROW LEVEL SECURITY ═══
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policy: rows visible only when app.current_wedding_id matches
-- Applied to every tenant-scoped table
DO $$ 
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'events', 'guests', 'sessions', 'uploads', 'ai_jobs',
    'feed_posts', 'feed_likes', 'feed_comments', 
    'faq_entries', 'faq_cache', 'notifications'
  ]) LOOP
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I 
       FOR ALL 
       USING (wedding_id = current_setting(''app.current_wedding_id'')::uuid)',
      t, t
    );
  END LOOP;
END $$;

-- ═══ UPDATED_AT TRIGGER ═══
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER couples_updated_at BEFORE UPDATE ON couples 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER weddings_updated_at BEFORE UPDATE ON weddings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON subscriptions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## 5. API Contracts

### Shared Types

```typescript
// lib/types/api.ts

// ── Standard response envelope ──
type ApiResponse<T> = {
  data: T;
  error?: never;
} | {
  data?: never;
  error: { code: string; message: string; details?: unknown };
};

// ── Pagination ──
type CursorPagination = {
  cursor?: string;      // opaque cursor (base64 encoded timestamp)
  limit?: number;       // default 20, max 100
};

type PaginatedResponse<T> = {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
};

// ── Wedding Config (served to guest app) ──
type WeddingConfig = {
  wedding_id: string;
  slug: string;
  display_name: string;
  couple_names: { name1: string; name2: string };
  hashtag: string;
  wedding_date: string | null;  // ISO date
  status: 'setup' | 'active' | 'post_wedding' | 'archived';
  theme: {
    preset: string;           // "mediterranean", "garden", etc.
    colors: { primary: string; secondary: string; bg: string; text: string };
    fonts: { heading: string; body: string };
  };
  prompts: {
    heartfelt: string[];
    fun: string[];
    quick_takes: string[];
  };
  enabled_filters: string[];
  enabled_ai_styles: string[];
  events: EventConfig[];
  features: {
    social_feed: boolean;
    faq_chatbot: boolean;
    sms_notifications: boolean;
    ai_portraits: boolean;
    ai_portraits_per_guest: number;
  };
};

type EventConfig = {
  id: string;
  name: string;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  venue_name: string | null;
  venue_address: string | null;
  dress_code: string | null;
  description: string | null;
  logistics: string | null;
  accent_color: string | null;
};
```

### Guest-Facing Endpoints

```typescript
// ── GET /api/v1/w/{slug}/config ──
// No auth required (public config for app hydration)
// Response: ApiResponse<WeddingConfig>

// ── GET /api/v1/w/{slug}/guests/search?q={query} ──
// No auth required (pre-registration)
// Query: q (min 2 chars), limit (default 10)
// Response: ApiResponse<{ guests: { id: string; first_name: string; last_name: string }[] }>

// ── POST /api/v1/w/{slug}/auth/register ──
// Body: { guest_id: string }
// Response: ApiResponse<{ session_token: string; guest: GuestProfile }>
// Sets httpOnly cookie: wedding_session={token}

type GuestProfile = {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string | null;
  group_label: string | null;
};

// ── POST /api/v1/w/{slug}/upload/presign ──
// Auth: guest session required
// Body: { type: 'photo' | 'video'; mime_type: string; size_bytes: number; event_id?: string }
// Response: ApiResponse<{ upload_id: string; presigned_url: string; storage_key: string; expires_at: string }>
// For videos over 100MB: returns multipart upload fields instead

// ── POST /api/v1/w/{slug}/upload/complete ──
// Auth: guest session required
// Body: { upload_id: string; storage_key: string; filter_applied?: string; prompt_answered?: string }
// Response: ApiResponse<{ upload: UploadRecord }>

// ── GET /api/v1/w/{slug}/media/{guestId} ──
// Auth: guest session required (own media only, unless couple)
// Query: type? ('photo' | 'video' | 'portrait'), event_id?, cursor?, limit?
// Response: ApiResponse<PaginatedResponse<MediaItem>>

type MediaItem = {
  id: string;
  type: 'photo' | 'video' | 'portrait';
  url: string;              // CDN URL
  thumbnail_url: string;
  event_name: string | null;
  filter_applied: string | null;
  duration_ms: number | null;
  created_at: string;
};

// ── POST /api/v1/w/{slug}/ai-portrait/generate ──
// Auth: guest session required
// Body: { source_upload_id: string; style_id: string }
// Response: ApiResponse<{ job_id: string; status: 'queued' }>
// 429 if over quota (per-guest or per-wedding)

// ── GET /api/v1/w/{slug}/ai-portrait/{jobId} ──
// Auth: guest session required
// Response: ApiResponse<{ status: string; output_url?: string; error?: string }>

// ── GET /api/v1/w/{slug}/feed ──
// Auth: guest session required
// Query: cursor?, limit?
// Response: ApiResponse<PaginatedResponse<FeedPost>>

// ── POST /api/v1/w/{slug}/feed ──
// Auth: guest session required
// Body: { type: 'text' | 'photo' | 'memory'; content?: string; photo_upload_id?: string }
// Response: ApiResponse<{ post: FeedPost }>

// ── POST /api/v1/w/{slug}/feed/{postId}/like ──
// Auth: guest session required
// Response: ApiResponse<{ liked: boolean; like_count: number }>

// ── POST /api/v1/w/{slug}/feed/{postId}/comments ──
// Auth: guest session required
// Body: { content: string }
// Response: ApiResponse<{ comment: FeedComment }>

// ── POST /api/v1/w/{slug}/faq/ask ──
// Auth: guest session required
// Body: { question: string }
// Response: ApiResponse<{ answer: string; sources: { question: string; answer: string }[] }>

// ── GET /api/v1/w/{slug}/manifest.json ──
// No auth (PWA manifest)
// Response: WebAppManifest with wedding-specific name, colors, icons
```

### Couple Dashboard Endpoints

```typescript
// ── POST /api/v1/auth/signup ──
// Body: { email: string; password: string; name: string }
// Response: ApiResponse<{ couple_id: string; token: string }>

// ── POST /api/v1/auth/login ──
// Body: { email: string; password: string }
// Response: ApiResponse<{ token: string; refresh_token: string }>

// ── POST /api/v1/auth/refresh ──
// Body: { refresh_token: string }
// Response: ApiResponse<{ token: string }>

// ── POST /api/v1/weddings ──
// Auth: couple JWT
// Body: { slug: string; display_name: string; couple_names: {...}; wedding_date?: string }
// Response: ApiResponse<{ wedding: Wedding }>

// ── PUT /api/v1/weddings/{weddingId}/config ──
// Auth: couple JWT (must own this wedding)
// Body: Partial<WeddingConfig['theme'] & WeddingConfig['prompts'] & ...>
// Response: ApiResponse<{ config: WeddingConfig }>

// ── POST /api/v1/weddings/{weddingId}/guests/import ──
// Auth: couple JWT
// Body: FormData with CSV file
// Response: ApiResponse<{ parsed: ParsedGuest[]; warnings: string[] }>
// Couple reviews, then POST /confirm to save

// ── POST /api/v1/weddings/{weddingId}/billing/checkout ──
// Auth: couple JWT
// Body: { package_config: PackageConfig }
// Response: ApiResponse<{ checkout_url: string }>
// Redirects to Stripe Checkout

// ── POST /api/v1/weddings/{weddingId}/deliverables/trigger ──
// Auth: couple JWT
// Body: { type: 'couple_reel' | 'all_guest_reels'; send_after_days?: number }
// Response: ApiResponse<{ job_count: number; estimated_completion: string }>

// ── GET /api/v1/weddings/{weddingId}/analytics ──
// Auth: couple JWT
// Response: ApiResponse<WeddingAnalytics>

type WeddingAnalytics = {
  guests_registered: number;
  guests_total: number;
  photos_count: number;
  videos_count: number;
  portraits_count: number;
  feed_posts_count: number;
  storage_used_mb: number;
  top_events: { event_name: string; upload_count: number }[];
  daily_activity: { date: string; uploads: number; registrations: number }[];
};
```

### Webhook Endpoints

```typescript
// ── POST /api/v1/webhooks/stripe ──
// Stripe signature verified via STRIPE_WEBHOOK_SECRET
// Events handled: checkout.session.completed, customer.subscription.updated,
//                 customer.subscription.deleted, invoice.payment_failed

// ── POST /api/v1/webhooks/remotion ──
// Auth: shared secret in header
// Body: { renderId: string; outputUrl: string; status: 'done' | 'error'; error?: string }
// Updates ai_jobs row, triggers notification to guest
```

---

## 6. Error Handling Strategy

### Error Codes

```typescript
// lib/errors.ts
export const ErrorCodes = {
  // Auth
  AUTH_INVALID_CREDENTIALS: { status: 401, message: "Invalid email or password" },
  AUTH_TOKEN_EXPIRED:       { status: 401, message: "Session expired. Please log in again." },
  AUTH_NOT_REGISTERED:      { status: 401, message: "Please register first" },
  AUTH_GUEST_NOT_FOUND:     { status: 404, message: "We couldn't find that name on the guest list. Try a different spelling?" },

  // Tenant
  WEDDING_NOT_FOUND:        { status: 404, message: "Wedding not found" },
  WEDDING_INACTIVE:         { status: 403, message: "This wedding is no longer active" },
  WEDDING_SLUG_TAKEN:       { status: 409, message: "That URL is already taken. Try another!" },

  // Upload
  UPLOAD_TOO_LARGE:         { status: 413, message: "File is too large. Photos max 25MB, videos max 500MB." },
  UPLOAD_INVALID_TYPE:      { status: 400, message: "We accept JPG, PNG, HEIC photos and MP4, MOV, WebM videos." },
  UPLOAD_PRESIGN_EXPIRED:   { status: 410, message: "Upload link expired. Tap 'Save' again." },

  // AI
  AI_QUOTA_GUEST:           { status: 429, message: "You've used all {limit} of your portraits! Each one is a keepsake." },
  AI_QUOTA_WEDDING:         { status: 429, message: "The portrait limit for this wedding has been reached." },
  AI_GENERATION_FAILED:     { status: 502, message: "Portrait creation failed. Please try again." },
  AI_RATE_LIMITED:          { status: 429, message: "Please wait a moment before creating another portrait." },

  // Feed
  FEED_POST_TOO_LONG:       { status: 400, message: "Keep it under 500 characters!" },
  FEED_POST_HIDDEN:         { status: 403, message: "This post is no longer available" },

  // Billing
  BILLING_PAYMENT_FAILED:   { status: 402, message: "Payment failed. Please try another card." },
  BILLING_FEATURE_LOCKED:   { status: 403, message: "This feature isn't included in your package. Upgrade to unlock it!" },

  // General
  RATE_LIMITED:              { status: 429, message: "Too many requests. Please slow down." },
  INTERNAL_ERROR:            { status: 500, message: "Something went wrong. We're looking into it." },
  VALIDATION_ERROR:          { status: 400, message: "Please check your input." },
} as const;
```

### Retry Policy (Client-Side)

```typescript
// lib/retry.ts — used by upload queue and AI portrait polling
const RETRY_CONFIG = {
  upload: {
    maxRetries: Infinity,     // Never give up on uploads
    baseDelay: 2000,          // 2s
    maxDelay: 300_000,        // 5 min cap
    backoffMultiplier: 2,
    jitter: true,             // ±25% randomization
  },
  aiPortrait: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10_000,
    backoffMultiplier: 2,
    jitter: false,
  },
  apiCall: {
    maxRetries: 2,
    baseDelay: 500,
    maxDelay: 3000,
    backoffMultiplier: 2,
    jitter: true,
  },
};
```

---

## 7. Security Hardening

### HTTP Security Headers (next.config.ts)

```typescript
// next.config.ts
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' blob: data: https://media.yourplatform.com https://*.r2.dev",
      "media-src 'self' blob: https://media.yourplatform.com",
      "connect-src 'self' https://api.openai.com https://api.stripe.com https://*.r2.cloudflarestorage.com https://*.upstash.io",
      "frame-src https://js.stripe.com",
    ].join('; '),
  },
];
```

### Input Validation

```typescript
// lib/validation.ts — Zod schemas for every endpoint
import { z } from 'zod';

export const slugSchema = z.string()
  .min(3).max(60)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "URL must be lowercase letters, numbers, and dashes");

export const guestSearchSchema = z.object({
  q: z.string().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export const uploadPresignSchema = z.object({
  type: z.enum(['photo', 'video']),
  mime_type: z.string().refine(
    (v) => ['image/jpeg', 'image/png', 'image/heic', 'image/webp',
            'video/mp4', 'video/quicktime', 'video/webm'].includes(v),
    "Unsupported file type"
  ),
  size_bytes: z.number().int().positive()
    .refine((v) => v <= 500_000_000, "File too large (max 500MB)"),
  event_id: z.string().uuid().optional(),
});

export const feedPostSchema = z.object({
  type: z.enum(['text', 'photo', 'memory']),
  content: z.string().max(500).optional(),
  photo_upload_id: z.string().uuid().optional(),
}).refine(
  (d) => d.content || d.photo_upload_id,
  "Post must have text content or a photo"
);

// Sanitize ALL user text before DB insert or AI prompt
export function sanitizeText(input: string): string {
  return input
    .replace(/[<>]/g, '')       // Strip HTML tags
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // Strip control chars
    .trim()
    .slice(0, 2000);            // Hard length cap
}
```

### Rate Limiting (Upstash Redis)

```typescript
// lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export const rateLimiters = {
  // Guest API calls: 60/minute per session
  guestApi: new Ratelimit({
    redis, prefix: 'rl:guest',
    limiter: Ratelimit.slidingWindow(60, '1 m'),
  }),
  // AI portrait generation: 1 per 10 seconds per guest
  aiPortrait: new Ratelimit({
    redis, prefix: 'rl:ai',
    limiter: Ratelimit.fixedWindow(1, '10 s'),
  }),
  // Upload presign: 10/minute per guest
  uploadPresign: new Ratelimit({
    redis, prefix: 'rl:upload',
    limiter: Ratelimit.slidingWindow(10, '1 m'),
  }),
  // Couple auth: 5 attempts per 15 minutes per IP
  coupleAuth: new Ratelimit({
    redis, prefix: 'rl:auth',
    limiter: Ratelimit.slidingWindow(5, '15 m'),
  }),
  // FAQ query: 10/minute per guest (prevent abuse)
  faqQuery: new Ratelimit({
    redis, prefix: 'rl:faq',
    limiter: Ratelimit.slidingWindow(10, '1 m'),
  }),
};
```

---

## 8. Media Processing Pipeline

### Photo Processing (Sharp)

```typescript
// lib/media/photo-processor.ts
import sharp from 'sharp';

export async function generateThumbnail(
  inputBuffer: Buffer,
  options: { width: number; height: number; quality: number } = { width: 400, height: 400, quality: 80 }
): Promise<Buffer> {
  return sharp(inputBuffer)
    .resize(options.width, options.height, {
      fit: 'cover',
      position: 'attention',    // Smart crop (face detection)
    })
    .webp({ quality: options.quality })
    .toBuffer();
}

export async function optimizePhoto(inputBuffer: Buffer): Promise<Buffer> {
  const metadata = await sharp(inputBuffer).metadata();
  const maxDim = 2048;
  
  let pipeline = sharp(inputBuffer)
    .rotate()                    // Auto-rotate based on EXIF
    .removeAlpha();              // Remove alpha for photos
  
  if ((metadata.width || 0) > maxDim || (metadata.height || 0) > maxDim) {
    pipeline = pipeline.resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true });
  }
  
  return pipeline
    .webp({ quality: 85, effort: 4 })
    .toBuffer();
}
```

### Video Transcoding

```typescript
// Triggered via Vercel serverless function or dedicated worker
// Input: original upload from R2
// Output: 720p H.264 MP4 + thumbnail

export const VIDEO_TRANSCODE_CONFIG = {
  codec: 'libx264',
  preset: 'medium',
  crf: 23,                      // Quality: 18 (high) to 28 (low)
  maxWidth: 1280,
  maxHeight: 720,
  audioBitrate: '128k',
  format: 'mp4',
  thumbnailTimestamp: '00:00:02', // 2 seconds in
};
```

---

## 9. Service Worker & PWA

### Caching Strategy

```typescript
// public/sw.js (or next-pwa config)
const CACHE_STRATEGIES = {
  // App shell: cache-first, update in background
  appShell: {
    routes: ['/', '/w/*/home', '/w/*/schedule', '/w/*/directory'],
    strategy: 'StaleWhileRevalidate',
    maxAge: 24 * 60 * 60,      // 24 hours
  },
  // Static assets: cache-first, long TTL
  staticAssets: {
    routes: ['/fonts/*', '/_next/static/*', '/icons/*'],
    strategy: 'CacheFirst',
    maxAge: 365 * 24 * 60 * 60, // 1 year
  },
  // API data: network-first, fallback to cache
  apiData: {
    routes: ['/api/v1/w/*/config', '/api/v1/w/*/media/*'],
    strategy: 'NetworkFirst',
    maxAge: 5 * 60,             // 5 minutes
  },
  // Media (photos/videos): cache-first from CDN
  media: {
    routes: ['https://media.yourplatform.com/*'],
    strategy: 'CacheFirst',
    maxAge: 30 * 24 * 60 * 60,  // 30 days
    maxEntries: 500,
  },
};

// Background sync for upload queue
// When online: flush IndexedDB queue -> presign -> PUT to R2 -> complete
```

---

## 10. Remotion Template Interfaces

```typescript
// lib/remotion/types.ts

export interface GuestReelProps {
  // Branding
  branding: {
    couple_names: { name1: string; name2: string };
    hashtag: string;
    wedding_date: string;
    colors: { primary: string; secondary: string; bg: string; text: string };
    fonts: { heading: string; body: string };
  };
  
  // Guest info
  guest: {
    display_name: string;
    group_label: string | null;
  };
  
  // Curated media (AI-ordered for emotional arc)
  sequence: Array<
    | { type: 'title_card'; duration_frames: number }
    | { type: 'photo'; url: string; score: number; ken_burns: KenBurnsConfig; duration_frames: number }
    | { type: 'video_highlight'; url: string; start_sec: number; end_sec: number; transcript_quote: string }
    | { type: 'portrait'; url: string; style_name: string; duration_frames: number }
    | { type: 'thank_you_text'; message: string; duration_frames: number }
    | { type: 'thank_you_video'; url: string }
    | { type: 'closing_card'; duration_frames: number }
  >;
  
  // Audio
  music: {
    url: string;
    beat_map: number[];           // Array of beat timestamps in seconds
    speech_segments: Array<{ start: number; end: number }>; // For ducking
  };
  
  // Transitions (timed to beats)
  transition_style: 'cinematic' | 'playful' | 'elegant' | 'minimal';
}

export interface KenBurnsConfig {
  direction: 'left' | 'right' | 'up' | 'down' | 'zoom_in' | 'zoom_out';
  speed: 'slow' | 'medium' | 'fast';
}

export interface CoupleReelProps extends Omit<GuestReelProps, 'guest' | 'sequence'> {
  // The couple's reel pulls from ALL guests
  highlights: Array<{
    guest_name: string;
    type: 'video_highlight';
    url: string;
    start_sec: number;
    end_sec: number;
    transcript_quote: string;    // The best quote for text overlay
    emotional_score: number;     // 1-10 from GPT analysis
  }>;
  // Best photos across all guests
  photos: Array<{
    url: string;
    guest_name: string;
    event_name: string;
    score: number;
    ken_burns: KenBurnsConfig;
  }>;
}
```

---

## 11. Email Templates

```typescript
// lib/email/templates.ts — using React Email

// Template 1: Reel Delivery (the big one)
export interface ReelDeliveryEmailProps {
  guest_name: string;
  couple_names: { name1: string; name2: string };
  thank_you_message: string;
  reel_thumbnail_url: string;
  reel_viewing_url: string;       // platform.com/w/{slug}/memories/{guestId}
  gallery_url: string;
  photo_count: number;
  portrait_count: number;
  platform_url: string;           // For "Want this for your wedding?"
}

// Template 2: Schedule Reminder
export interface ScheduleReminderEmailProps {
  guest_name: string;
  couple_names: { name1: string; name2: string };
  event_name: string;
  event_date: string;
  event_time: string;
  venue_name: string;
  venue_address: string;
  dress_code: string | null;
  logistics: string | null;
  app_url: string;
}

// Template 3: Couple — Reels Ready for Review
export interface ReelsReadyEmailProps {
  couple_name: string;
  highlight_reel_url: string;
  guest_reel_count: number;
  sample_reel_urls: string[];
  dashboard_url: string;
}
```

---

## 12. CI/CD Pipeline

### GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  TEST_MODE: 'true'
  DATABASE_URL: postgresql://test:test@localhost:5432/test
  NODE_VERSION: '20'

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '${{ env.NODE_VERSION }}' }
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit

  unit-and-integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '${{ env.NODE_VERSION }}' }
      - run: npm ci
      - run: npx vitest run tests/unit tests/integration
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test

  e2e:
    runs-on: ubuntu-latest
    needs: [unit-and-integration]
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env: { POSTGRES_USER: test, POSTGRES_PASSWORD: test, POSTGRES_DB: test }
        ports: ['5432:5432']
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '${{ env.NODE_VERSION }}' }
      - run: npm ci
      - run: npx playwright install chromium
      - run: npm run build
      - run: npm run start &
      - run: npx wait-on http://localhost:3000
      - run: npx playwright test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test
          BASE_URL: http://localhost:3000
```

---

## 13. Monitoring & Alerting

### Health Check Endpoint

```typescript
// app/api/health/route.ts
export async function GET() {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    r2: await checkR2(),
    timestamp: new Date().toISOString(),
  };
  
  const healthy = Object.values(checks)
    .filter(v => typeof v === 'object')
    .every((c: any) => c.ok);
  
  return Response.json(checks, { status: healthy ? 200 : 503 });
}
```

### Alert Triggers (Sentry + Vercel)

| Condition | Severity | Action |
|-----------|----------|--------|
| API error rate > 5% over 5 minutes | Critical | Page on-call |
| Upload failure rate > 10% | Critical | Page on-call |
| AI portrait generation p99 > 30s | Warning | Slack alert |
| Database connection pool exhausted | Critical | Page on-call |
| R2 upload presign failures | Critical | Page on-call |
| Stripe webhook signature failures | Warning | Slack alert |
| Tenant isolation violation in tests | Blocker | Block deploy |

---

## 14. Deployment Runbook

### First Deploy Checklist

```bash
# 1. Create Neon database
#    - Enable pgvector extension
#    - Run migrations: psql $DATABASE_URL_UNPOOLED -f lib/db/migrations/001_foundation.sql

# 2. Create Cloudflare R2 bucket
#    - Name: wedding-media
#    - Set CORS: allow *.yourplatform.com, methods PUT/GET
#    - Create custom domain: media.yourplatform.com

# 3. Create Upstash Redis instance

# 4. Set up Stripe
#    - Create products/prices for package components
#    - Configure webhook endpoint: yourplatform.com/api/v1/webhooks/stripe

# 5. Set up AWS for Remotion Lambda
#    - Deploy Remotion function: npx remotion lambda functions deploy
#    - Deploy site: npx remotion lambda sites create

# 6. Set up SES
#    - Verify sender domain
#    - Request production access (out of sandbox)

# 7. Deploy to Vercel
#    - Connect GitHub repo
#    - Set all environment variables (see section 3)
#    - Deploy

# 8. Verify
#    - Hit /api/health — all checks green
#    - Create test wedding via API
#    - Register as test guest
#    - Upload a photo
#    - Generate AI portrait
```

---

## 15. Performance Budgets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Guest landing page FCP | < 1.5s | Vercel Analytics |
| Guest landing page LCP | < 2.5s | Vercel Analytics |
| Camera ready (viewfinder active) | < 3s | Custom timing |
| Photo capture to review | < 500ms | Custom timing |
| Filter switch (live preview) | < 100ms (60fps) | requestAnimationFrame timing |
| AI portrait generation | < 15s | Server-side timing |
| Gallery thumbnail load | < 200ms | CDN response time |
| API response p95 (reads) | < 200ms | Vercel function duration |
| API response p95 (writes) | < 500ms | Vercel function duration |
| JS bundle (guest app) | < 200KB gzipped | next build output |
| PWA install + offline ready | < 5s | Service worker registration timing |

---

## 16. Accessibility

| Requirement | Implementation |
|-------------|---------------|
| Color contrast | All text meets WCAG AA (4.5:1 for body, 3:1 for large text) |
| Focus management | Visible focus rings on all interactive elements (terracotta ring) |
| Screen reader | All images have alt text, camera UI has aria-labels |
| Keyboard nav | Tab order follows visual order, Enter/Space activate buttons |
| Motion sensitivity | Respect `prefers-reduced-motion` — disable confetti, transitions |
| Touch targets | All buttons minimum 44×44px (Apple HIG) |
| Text scaling | UI works up to 200% zoom |
| Camera UI | Large, high-contrast shutter/record buttons |

---

## 17. Complete Test Implementations

### Test Infrastructure Setup

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',           // 'jsdom' for component tests
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['tests/', 'node_modules/', '.next/'],
    },
  },
  resolve: {
    alias: { '@': new URL('./', import.meta.url).pathname },
  },
});
```

```typescript
// tests/setup.ts — runs before every test file
import { beforeAll, afterAll, afterEach, vi } from 'vitest';

// Mock external services when TEST_MODE=true
if (process.env.TEST_MODE === 'true') {
  vi.mock('@/lib/storage/r2', () => ({
    r2Client: {
      generatePresignedUrl: vi.fn().mockResolvedValue({
        url: 'https://mock-r2.example.com/presigned',
        key: 'weddings/test/uploads/2026/01/test-upload/original.jpg',
      }),
      putObject: vi.fn().mockResolvedValue({ etag: 'mock-etag' }),
      getSignedUrl: vi.fn().mockResolvedValue('https://mock-cdn.example.com/photo.jpg'),
      initiateMultipartUpload: vi.fn().mockResolvedValue({ uploadId: 'mock-upload-id' }),
    },
  }));

  vi.mock('@/lib/ai/openai', () => ({
    openaiClient: {
      images: {
        edit: vi.fn().mockResolvedValue({
          data: [{ url: 'https://mock-openai.example.com/portrait.png' }],
        }),
      },
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'Mock AI response' } }],
          }),
        },
      },
      embeddings: {
        create: vi.fn().mockResolvedValue({
          data: [{ embedding: new Array(1536).fill(0.01) }],
        }),
      },
      audio: {
        transcriptions: {
          create: vi.fn().mockResolvedValue({ text: 'Mock transcript of a wedding toast.' }),
        },
      },
    },
  }));

  vi.mock('@/lib/email/ses', () => ({
    sendEmail: vi.fn().mockResolvedValue({ messageId: 'mock-ses-id' }),
  }));

  vi.mock('@/lib/sms/twilio', () => ({
    sendSms: vi.fn().mockResolvedValue({ sid: 'mock-twilio-sid' }),
  }));
}
```

### Test Database Helper

```typescript
// tests/helpers/db.ts
import { Pool } from 'pg';
import { readFileSync } from 'fs';

const TEST_DB_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';

let pool: Pool;

export async function setupTestDb() {
  pool = new Pool({ connectionString: TEST_DB_URL });
  
  // Run migrations
  const migration = readFileSync('lib/db/migrations/001_foundation.sql', 'utf-8');
  await pool.query(migration);
  
  return pool;
}

export async function teardownTestDb() {
  // Drop all tables in reverse dependency order
  await pool.query(`
    DROP TABLE IF EXISTS feed_comments, feed_likes, feed_posts,
    faq_cache, faq_entries, notifications, subscriptions,
    ai_jobs, uploads, sessions, events, guests, weddings, couples
    CASCADE
  `);
  await pool.end();
}

export async function seedTestWedding(pool: Pool, overrides?: Partial<any>) {
  const couple = await pool.query(
    `INSERT INTO couples (email, password_hash, name)
     VALUES ('test@example.com', '$2b$10$mockhashedpassword', 'Test Couple')
     RETURNING id`
  );
  
  const wedding = await pool.query(
    `INSERT INTO weddings (couple_id, slug, display_name, hashtag, status, config, package_config)
     VALUES ($1, $2, $3, $4, 'active', $5, $6)
     RETURNING id`,
    [
      couple.rows[0].id,
      overrides?.slug || 'test-wedding',
      overrides?.display_name || "Test & Partner's Wedding",
      overrides?.hashtag || '#TestWedding',
      JSON.stringify({
        couple_names: { name1: 'Test', name2: 'Partner' },
        hashtag: '#TestWedding',
        theme: { preset: 'mediterranean', colors: { primary: '#C4704B', secondary: '#2B5F8A', bg: '#FEFCF9', text: '#2C2825' }, fonts: { heading: 'Playfair Display', body: 'DM Sans' } },
        prompts: { heartfelt: ['What is your favorite memory?'], fun: ['Rate their dance moves 1-10'], quick_takes: ['One word to describe them'] },
        enabled_filters: ['film-grain', 'golden-hour', 'bw-classic'],
        enabled_ai_styles: ['castle-wedding', 'mughal', 'bollywood'],
      }),
      JSON.stringify({
        guest_limit: 200, event_limit: 3, storage_gb: 500,
        ai_portraits_per_guest: 5, deliverables: 'all_guests',
        social_feed: true, faq_chatbot: true,
      }),
    ]
  );

  // Seed guests
  const guestNames = [
    ['Aditya', 'Sharma'], ['Priya', 'Patel'], ['Vikram', 'Singh'],
    ['Neha', 'Gupta'], ['Raj', 'Kapoor'],
  ];
  
  const guestIds: string[] = [];
  for (const [first, last] of guestNames) {
    const g = await pool.query(
      `INSERT INTO guests (wedding_id, first_name, last_name) VALUES ($1, $2, $3) RETURNING id`,
      [wedding.rows[0].id, first, last]
    );
    guestIds.push(g.rows[0].id);
  }

  // Seed events
  const eventIds: string[] = [];
  for (const [name, color] of [['Haldi', '#D4A853'], ['Sangeet', '#E8865A'], ['Wedding', '#2B5F8A']]) {
    const e = await pool.query(
      `INSERT INTO events (wedding_id, name, accent_color) VALUES ($1, $2, $3) RETURNING id`,
      [wedding.rows[0].id, name, color]
    );
    eventIds.push(e.rows[0].id);
  }

  return {
    coupleId: couple.rows[0].id,
    weddingId: wedding.rows[0].id,
    guestIds,
    eventIds,
    slug: overrides?.slug || 'test-wedding',
  };
}

// Set RLS context for a test query
export async function withWeddingContext(pool: Pool, weddingId: string, fn: (client: any) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.current_wedding_id = '${weddingId}'`);
    await fn(client);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

### Test Fixture Generator (No Stock Images Needed)

```typescript
// tests/helpers/fixtures.ts
// Generates valid test images and videos programmatically — no external files needed

import sharp from 'sharp';

export async function generateTestPhoto(
  width = 1024, height = 768, color = '#C4704B'
): Promise<Buffer> {
  // Creates a valid JPEG with a colored rectangle + "TEST" text overlay
  return sharp({
    create: {
      width, height,
      channels: 3,
      background: color,
    },
  })
  .jpeg({ quality: 80 })
  .toBuffer();
}

export async function generateTestThumbnail(): Promise<Buffer> {
  return generateTestPhoto(400, 400, '#D4A853');
}

// Generates a minimal valid MP4 file (1 second, black frame)
// This is a base64-encoded minimal MP4 with a single black frame
export function generateTestVideo(): Buffer {
  // Minimal valid MP4 container (ftyp + moov + mdat)
  // This is the smallest valid MP4 that video players can open
  const minimalMp4 = Buffer.from(
    'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAhtZGF0AAAA' +
    'MW1vb3YAAABsbXZoZAAAAAAAAAAAAAAAAAAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAAA' +
    'AQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
    'base64'
  );
  return minimalMp4;
}

// Generate a small test CSV for guest import testing
export function generateTestCSV(): string {
  return [
    'First Name,Last Name,Email,Phone,Group',
    'Aditya,Sharma,adi@test.com,+15551234567,College Friends',
    'Priya,Patel,priya@test.com,,Family',
    'Vikram,Singh,,,Work',
    '"Mary Jane",Watson,mj@test.com,+15559876543,College Friends',
  ].join('\n');
}

// Zola-format CSV (different column names)
export function generateZolaCSV(): string {
  return [
    'Guest Name,Household,RSVP Status,Email Address,Mailing Address',
    'Aditya Sharma,Sharma Family,Attending,adi@test.com,"123 Main St, NYC"',
    'Priya Patel,Patel Family,Pending,priya@test.com,',
  ].join('\n');
}
```

### Sample Test Files (Runnable by Claude Code)

```typescript
// tests/unit/storage/r2-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// These tests verify the R2 client module's logic
// External calls are mocked (see setup.ts)

describe('R2 Client', () => {
  it('generates presigned URL with correct key structure', async () => {
    const { generatePresignedPutUrl } = await import('@/lib/storage/r2');
    
    const result = await generatePresignedPutUrl({
      weddingId: '550e8400-e29b-41d4-a716-446655440000',
      uploadId: '660e8400-e29b-41d4-a716-446655440001',
      contentType: 'image/jpeg',
      contentLength: 1024000,
    });
    
    expect(result.key).toMatch(/^weddings\/550e8400.*\/uploads\/\d{4}\/\d{2}\/660e8400.*\/original\.jpg$/);
    expect(result.url).toBeDefined();
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('rejects files over size limit', async () => {
    const { generatePresignedPutUrl } = await import('@/lib/storage/r2');
    
    await expect(
      generatePresignedPutUrl({
        weddingId: 'test',
        uploadId: 'test',
        contentType: 'video/mp4',
        contentLength: 600_000_000, // 600MB, over 500MB limit
      })
    ).rejects.toThrow('File too large');
  });

  it('uses multipart for videos over 100MB', async () => {
    const { generatePresignedPutUrl } = await import('@/lib/storage/r2');
    
    const result = await generatePresignedPutUrl({
      weddingId: 'test',
      uploadId: 'test',
      contentType: 'video/mp4',
      contentLength: 150_000_000, // 150MB
    });
    
    expect(result.multipart).toBe(true);
    expect(result.uploadId).toBeDefined();
  });
});
```

```typescript
// tests/unit/auth/guest-session.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, seedTestWedding } from '../../helpers/db';
import type { Pool } from 'pg';

let pool: Pool;
let testData: Awaited<ReturnType<typeof seedTestWedding>>;

beforeAll(async () => {
  pool = await setupTestDb();
  testData = await seedTestWedding(pool);
});

afterAll(async () => {
  await teardownTestDb();
});

describe('Guest Session', () => {
  it('creates session for valid guest name match', async () => {
    const { createGuestSession } = await import('@/lib/session');
    
    const session = await createGuestSession(pool, {
      weddingId: testData.weddingId,
      guestId: testData.guestIds[0],
    });
    
    expect(session.token).toBeDefined();
    expect(session.token.length).toBeGreaterThan(32);
    expect(session.guestId).toBe(testData.guestIds[0]);
  });

  it('validates existing session token', async () => {
    const { createGuestSession, validateSession } = await import('@/lib/session');
    
    const session = await createGuestSession(pool, {
      weddingId: testData.weddingId,
      guestId: testData.guestIds[0],
    });
    
    const validated = await validateSession(pool, session.token);
    expect(validated).not.toBeNull();
    expect(validated!.weddingId).toBe(testData.weddingId);
    expect(validated!.guestId).toBe(testData.guestIds[0]);
  });

  it('rejects session from different wedding', async () => {
    const otherWedding = await seedTestWedding(pool, { slug: 'other-wedding' });
    const { createGuestSession, validateSession } = await import('@/lib/session');
    
    const session = await createGuestSession(pool, {
      weddingId: testData.weddingId,
      guestId: testData.guestIds[0],
    });
    
    // Session should only be valid for its own wedding
    const validated = await validateSession(pool, session.token);
    expect(validated!.weddingId).toBe(testData.weddingId);
    expect(validated!.weddingId).not.toBe(otherWedding.weddingId);
  });
});
```

```typescript
// tests/unit/billing/package-builder.test.ts
import { describe, it, expect } from 'vitest';

describe('Package Builder Pricing', () => {
  it('calculates correct price for mid-size wedding', async () => {
    const { calculatePackagePrice } = await import('@/lib/billing/pricing');
    
    const result = calculatePackagePrice({
      guest_count: 200,
      event_count: 3,
      ai_portraits_per_guest: 5,
      deliverables: 'all_guests',
      social_feed: true,
      faq_chatbot: true,
      sms_notifications: true,
      theme_customization: 'full',
    });
    
    expect(result.total_cents).toBeGreaterThan(0);
    expect(result.breakdown).toHaveProperty('base');
    expect(result.breakdown).toHaveProperty('portraits');
    expect(result.breakdown).toHaveProperty('deliverables');
    expect(result.our_cost_cents).toBeLessThan(result.total_cents);
    expect(result.total_cents - result.our_cost_cents).toBeGreaterThan(20000); // > $200 profit
  });

  it('enforces minimum $200 profit at smallest package', async () => {
    const { calculatePackagePrice } = await import('@/lib/billing/pricing');
    
    const result = calculatePackagePrice({
      guest_count: 25,
      event_count: 1,
      ai_portraits_per_guest: 3,
      deliverables: 'couple_only',
      social_feed: false,
      faq_chatbot: false,
      sms_notifications: false,
      theme_customization: 'preset',
    });
    
    const profit = result.total_cents - result.our_cost_cents;
    expect(profit).toBeGreaterThanOrEqual(20000); // $200 minimum
  });

  it('scales correctly for large wedding', async () => {
    const { calculatePackagePrice } = await import('@/lib/billing/pricing');
    
    const small = calculatePackagePrice({ guest_count: 50, event_count: 1, ai_portraits_per_guest: 3, deliverables: 'couple_only', social_feed: false, faq_chatbot: false, sms_notifications: false, theme_customization: 'preset' });
    const large = calculatePackagePrice({ guest_count: 500, event_count: 5, ai_portraits_per_guest: 15, deliverables: 'all_guests', social_feed: true, faq_chatbot: true, sms_notifications: true, theme_customization: 'full' });
    
    expect(large.total_cents).toBeGreaterThan(small.total_cents);
    expect(large.our_cost_cents).toBeGreaterThan(small.our_cost_cents);
  });
});
```

```typescript
// tests/unit/ai/quota-enforcement.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, seedTestWedding, withWeddingContext } from '../../helpers/db';
import type { Pool } from 'pg';

let pool: Pool;
let testData: any;

beforeAll(async () => {
  pool = await setupTestDb();
  testData = await seedTestWedding(pool);
});

afterAll(async () => await teardownTestDb());

describe('AI Portrait Quota Enforcement', () => {
  it('allows portrait when under quota', async () => {
    const { checkPortraitQuota } = await import('@/lib/ai/quota');
    
    await withWeddingContext(pool, testData.weddingId, async (client) => {
      const result = await checkPortraitQuota(client, {
        weddingId: testData.weddingId,
        guestId: testData.guestIds[0],
        perGuestLimit: 5,
      });
      
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5);
    });
  });

  it('blocks portrait when guest hits per-guest cap', async () => {
    const { checkPortraitQuota } = await import('@/lib/ai/quota');
    
    // Insert 5 completed portraits for this guest
    for (let i = 0; i < 5; i++) {
      await pool.query(
        `INSERT INTO ai_jobs (wedding_id, guest_id, type, style_id, status) 
         VALUES ($1, $2, 'portrait', 'castle-wedding', 'completed')`,
        [testData.weddingId, testData.guestIds[0]]
      );
    }
    
    await withWeddingContext(pool, testData.weddingId, async (client) => {
      const result = await checkPortraitQuota(client, {
        weddingId: testData.weddingId,
        guestId: testData.guestIds[0],
        perGuestLimit: 5,
      });
      
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.message).toContain('all 5');
    });
  });
});
```

```typescript
// tests/integration/tenant-isolation.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDb, teardownTestDb, seedTestWedding, withWeddingContext } from '../helpers/db';
import type { Pool } from 'pg';

let pool: Pool;
let weddingA: any;
let weddingB: any;

beforeAll(async () => {
  pool = await setupTestDb();
  weddingA = await seedTestWedding(pool, { slug: 'wedding-alpha', display_name: "Alpha Wedding" });
  weddingB = await seedTestWedding(pool, { slug: 'wedding-beta', display_name: "Beta Wedding" });
});

afterAll(async () => await teardownTestDb());

describe('Tenant Isolation', () => {
  it('RLS prevents cross-wedding guest access', async () => {
    await withWeddingContext(pool, weddingA.weddingId, async (client) => {
      const result = await client.query('SELECT * FROM guests');
      const guestIds = result.rows.map((r: any) => r.id);
      
      // Should only see Wedding A guests
      expect(guestIds).toEqual(expect.arrayContaining(weddingA.guestIds));
      // Should NOT see Wedding B guests
      for (const bId of weddingB.guestIds) {
        expect(guestIds).not.toContain(bId);
      }
    });
  });

  it('RLS prevents cross-wedding upload access', async () => {
    // Insert upload for Wedding A
    await pool.query(
      `INSERT INTO uploads (wedding_id, guest_id, type, storage_key, status) 
       VALUES ($1, $2, 'photo', 'weddings/a/test.jpg', 'ready')`,
      [weddingA.weddingId, weddingA.guestIds[0]]
    );
    
    // Insert upload for Wedding B
    await pool.query(
      `INSERT INTO uploads (wedding_id, guest_id, type, storage_key, status) 
       VALUES ($1, $2, 'photo', 'weddings/b/test.jpg', 'ready')`,
      [weddingB.weddingId, weddingB.guestIds[0]]
    );
    
    // Query as Wedding A — should only see Wedding A's upload
    await withWeddingContext(pool, weddingA.weddingId, async (client) => {
      const result = await client.query('SELECT storage_key FROM uploads');
      expect(result.rows.every((r: any) => r.storage_key.includes('weddings/a/'))).toBe(true);
    });
    
    // Query as Wedding B — should only see Wedding B's upload  
    await withWeddingContext(pool, weddingB.weddingId, async (client) => {
      const result = await client.query('SELECT storage_key FROM uploads');
      expect(result.rows.every((r: any) => r.storage_key.includes('weddings/b/'))).toBe(true);
    });
  });

  it('RLS prevents cross-wedding event access', async () => {
    await withWeddingContext(pool, weddingA.weddingId, async (client) => {
      const result = await client.query('SELECT id FROM events');
      expect(result.rows.map((r: any) => r.id)).toEqual(expect.arrayContaining(weddingA.eventIds));
      for (const bId of weddingB.eventIds) {
        expect(result.rows.map((r: any) => r.id)).not.toContain(bId);
      }
    });
  });
});
```

### Playwright E2E Test

```typescript
// tests/e2e/guest-registration.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Guest Registration Flow', () => {
  test('full registration → home screen → navigate', async ({ page }) => {
    // Navigate to test wedding
    await page.goto('/w/test-wedding');
    
    // Should see registration screen with couple names
    await expect(page.getByText("Test & Partner's Wedding")).toBeVisible();
    
    // Type partial name
    const nameInput = page.getByPlaceholder(/name/i);
    await nameInput.fill('Adi');
    
    // Autocomplete should appear
    await expect(page.getByText('Aditya Sharma')).toBeVisible();
    
    // Select name
    await page.getByText('Aditya Sharma').click();
    
    // Should be on home screen
    await expect(page.getByText('Welcome')).toBeVisible();
    await expect(page.getByText('Aditya')).toBeVisible();
    
    // Refresh — should still be logged in
    await page.reload();
    await expect(page.getByText('Aditya')).toBeVisible();
    
    // Navigate to schedule
    await page.getByText(/schedule|events/i).click();
    await expect(page.getByText('Haldi')).toBeVisible();
    await expect(page.getByText('Sangeet')).toBeVisible();
    await expect(page.getByText('Wedding')).toBeVisible();
  });
});
```

### NPM Scripts

```json
// package.json scripts
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "playwright test",
    "test:all": "npm run lint && npm run typecheck && npm run test && npm run test:e2e",
    "test:coverage": "vitest run --coverage",
    "db:migrate": "psql $DATABASE_URL_UNPOOLED -f lib/db/migrations/001_foundation.sql",
    "db:seed": "tsx tests/helpers/seed-dev.ts",
    "remotion:studio": "remotion studio lib/remotion/index.ts",
    "remotion:deploy": "remotion lambda functions deploy && remotion lambda sites create lib/remotion/index.ts"
  }
}
```

---

## 18. Operational Runbooks

### Runbook: Guest Can't Upload

```
1. Check /api/health — is R2 healthy?
2. Check Vercel function logs for upload/presign errors
3. Check R2 dashboard for bucket issues
4. If presigned URL generation failing: check R2 API key rotation
5. If client-side: check browser console for CORS errors (R2 bucket CORS config)
6. If offline queue stuck: guest should force-refresh the app (pull down)
```

### Runbook: AI Portraits Failing

```
1. Check OpenAI status page (status.openai.com)
2. Check ai_jobs table: SELECT status, error_message FROM ai_jobs WHERE status = 'failed' ORDER BY created_at DESC LIMIT 20
3. If rate limited: reduce concurrent generation limit in rate-limiter
4. If API key issue: rotate in Vercel env vars → redeploy
5. If content policy: review the failed prompt + input image
```

### Runbook: Reel Generation Stuck

```
1. Check Remotion Lambda CloudWatch logs
2. SELECT * FROM ai_jobs WHERE type LIKE 'reel_%' AND status = 'processing' AND started_at < NOW() - INTERVAL '10 minutes'
3. If Lambda cold start timeout: pre-warm functions
4. If out of memory: increase Lambda memory allocation
5. Reset stuck jobs: UPDATE ai_jobs SET status = 'queued', started_at = NULL WHERE id IN (...)
```

### Runbook: Tenant Data Leak Suspected

```
1. IMMEDIATELY: Check Sentry for cross-wedding data in any API response
2. Run: npm run test:integration -- tests/integration/tenant-isolation.test.ts
3. If test fails: EMERGENCY — disable new registrations, investigate
4. Check: Does every API route set RLS context? Search for queries missing wedding_id
5. Add regression test for the specific leak vector
```
