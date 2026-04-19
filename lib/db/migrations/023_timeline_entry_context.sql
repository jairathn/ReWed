-- Migration 023: Per-timeline-entry AI context cache
--
-- A vendor looking at their own timeline often sees a stripped row like
-- "be ready with a horse at 3 PM" with no indication that it's for the
-- Baraat. We generate a 1-2 sentence explanation using the master
-- timeline + wedding knowledge base, and cache it here so repeat viewers
-- don't re-incur the LLM call.
--
-- Keyed by timeline_entry_id directly (one context per entry, regardless
-- of which vendor is viewing) — the context describes the *event*, not
-- the viewer. Deleted on CASCADE if the entry goes away. Regenerate
-- policy lives in the app layer; this table is just the cache.

CREATE TABLE IF NOT EXISTS timeline_entry_context (
  timeline_entry_id UUID PRIMARY KEY REFERENCES timeline_entries(id) ON DELETE CASCADE,
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  context TEXT,
  model TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timeline_entry_context_wedding
  ON timeline_entry_context(wedding_id);

ALTER TABLE timeline_entry_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY timeline_entry_context_wedding_isolation ON timeline_entry_context
  USING (wedding_id::text = current_setting('app.current_wedding_id', true));
