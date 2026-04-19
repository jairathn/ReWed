-- Migration 022: Structured knowledge base for email + drive
--
-- Goal: instead of re-scanning the last 14 days of inbox on every button
-- click, ingest threads once, extract structured facts per thread, and let
-- the rest of the app (chatbot, auto-todos, suggestions) read from the
-- facts table. Wedding planning is a months-long process and prior context
-- is first-class, not throwaway.
--
-- Two new tables:
--   email_threads  — one row per Gmail thread, so we know what we've
--                    already pulled and don't re-fetch or re-extract.
--   wedding_facts  — structured LLM extraction output, one row per
--                    thread (or drive file, later). This is the compact,
--                    queryable knowledge base the app reads from.
--
-- Plus a few columns on google_connections to track backfill progress.

-- -------------------------------------------------------------------
-- email_threads
-- -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  gmail_thread_id TEXT NOT NULL,
  subject TEXT,
  participants TEXT[],                         -- all distinct from/to/cc addresses seen
  first_message_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  message_count INTEGER NOT NULL DEFAULT 0,
  snippet TEXT,                                -- Gmail's snippet on the most recent message
  extracted_at TIMESTAMPTZ,                    -- NULL until fact extraction runs
  extraction_error TEXT,                       -- last error message if extraction failed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (wedding_id, gmail_thread_id)
);

CREATE INDEX IF NOT EXISTS idx_email_threads_wedding_last_msg
  ON email_threads(wedding_id, last_message_at DESC NULLS LAST);

-- Partial index to make "give me the next batch of unextracted threads" fast.
CREATE INDEX IF NOT EXISTS idx_email_threads_unextracted
  ON email_threads(wedding_id, last_message_at DESC NULLS LAST)
  WHERE extracted_at IS NULL;

ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_threads_wedding_isolation ON email_threads
  USING (wedding_id::text = current_setting('app.current_wedding_id', true));

-- -------------------------------------------------------------------
-- wedding_facts
-- -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wedding_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  source_type VARCHAR(20) NOT NULL,            -- 'email' | 'drive'
  source_id UUID,                              -- email_threads.id (or future drive_files.id)
  source_ref TEXT,                             -- external id (gmail thread id, drive file id) for debugging
  -- Denormalized extracted fields for fast filter/sort/read.
  vendor_name TEXT,                            -- best-guess vendor this relates to (NULL if general)
  topic TEXT,                                  -- short label, e.g. "centerpieces", "photography contract"
  summary TEXT,                                -- 1-2 sentence natural language summary
  decisions TEXT[],                            -- concrete decisions made ("white roses confirmed")
  open_questions TEXT[],                       -- unresolved asks ("delivery time for Saturday?")
  action_items JSONB,                          -- [{description, due_date, owner_hint}]
  amounts JSONB,                               -- [{description, usd}]
  -- When the fact "happened" — usually the thread's last message time, used for
  -- sorting and for "what's new since last time I checked".
  fact_date TIMESTAMPTZ,
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw JSONB,                                   -- full LLM output for debugging / re-processing
  model TEXT,                                  -- which model produced it
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wedding_facts_wedding
  ON wedding_facts(wedding_id, fact_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_wedding_facts_vendor
  ON wedding_facts(wedding_id, vendor_name)
  WHERE vendor_name IS NOT NULL;

-- Lets us look up "do we already have facts for this source?" without a
-- wedding_id filter when we're re-processing by source_ref.
CREATE INDEX IF NOT EXISTS idx_wedding_facts_source
  ON wedding_facts(source_type, source_id);

ALTER TABLE wedding_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY wedding_facts_wedding_isolation ON wedding_facts
  USING (wedding_id::text = current_setting('app.current_wedding_id', true));

-- -------------------------------------------------------------------
-- google_connections: backfill progress
-- -------------------------------------------------------------------

-- How far back we're ingesting from (NULL = not yet configured). Couples can
-- opt to go back to engagement date or farther.
ALTER TABLE google_connections ADD COLUMN IF NOT EXISTS backfill_from_date DATE;

-- Set once the full backfill has processed every thread in the window.
-- After this, only incremental sync (newer than last_synced_at) runs.
ALTER TABLE google_connections ADD COLUMN IF NOT EXISTS backfill_completed_at TIMESTAMPTZ;

-- Last time any sync batch ran successfully. Incremental sync uses this
-- (plus message dates) to decide what's new.
ALTER TABLE google_connections ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Gmail list-threads pagination cursor. Persisted across batches so if a
-- browser tab closes mid-backfill, the next batch resumes where we left off
-- instead of re-paging from the top.
ALTER TABLE google_connections ADD COLUMN IF NOT EXISTS backfill_page_token TEXT;
