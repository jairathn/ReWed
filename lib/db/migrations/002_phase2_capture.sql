-- 002_phase2_capture.sql
-- Phase 2: Capture features — FAQ cache table + performance indexes
-- Run with: psql $DATABASE_URL_UNPOOLED -f lib/db/migrations/002_phase2_capture.sql

-- FAQ response cache (deduplication + speed)
CREATE TABLE IF NOT EXISTS faq_cache (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id    UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  question_hash TEXT NOT NULL,
  answer        TEXT NOT NULL,
  hit_count     INT DEFAULT 1,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (wedding_id, question_hash)
);

CREATE INDEX IF NOT EXISTS idx_faq_cache_lookup ON faq_cache(wedding_id, question_hash);

-- Additional indexes for Phase 2 queries

-- Upload queries: by wedding+guest, status filtering
CREATE INDEX IF NOT EXISTS idx_uploads_gallery
  ON uploads(wedding_id, guest_id, status, created_at DESC)
  WHERE status = 'ready';

-- AI jobs: quota counting
CREATE INDEX IF NOT EXISTS idx_ai_jobs_quota
  ON ai_jobs(wedding_id, guest_id, type, status)
  WHERE type = 'portrait';

-- AI jobs: polling by job ID
CREATE INDEX IF NOT EXISTS idx_ai_jobs_status
  ON ai_jobs(id, status);

-- Feed: listing posts for a wedding
CREATE INDEX IF NOT EXISTS idx_feed_posts_listing
  ON feed_posts(wedding_id, is_hidden, is_pinned DESC, created_at DESC);

-- Feed likes: checking if a user has liked
CREATE INDEX IF NOT EXISTS idx_feed_likes_lookup
  ON feed_likes(guest_id, post_id);

-- Feed comments: listing by post
CREATE INDEX IF NOT EXISTS idx_feed_comments_listing
  ON feed_comments(post_id, created_at ASC);

-- FAQ entries: by wedding for context retrieval
CREATE INDEX IF NOT EXISTS idx_faq_entries_wedding
  ON faq_entries(wedding_id);
