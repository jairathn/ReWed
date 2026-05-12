-- Migration 025: Per-row "is this rich text or legacy plain text?" signal.
--
-- Block 2 PR1a ships the <RichText> renderer that can parse Markdown OR
-- render legacy plain-text content with pre-escaped Markdown chars so it
-- looks identical to what was on the page before. This column tells the
-- renderer which mode to use per row.
--
-- Defaults to 'plain' on every existing row → renderer is in permissive
-- mode → existing content renders identically post-deploy.
--
-- PR1b adds the Tiptap editor. When it saves a row, the API writes
-- content_format='rich' alongside the content. The renderer then runs
-- strict Markdown parsing on that row only.
--
-- One column per table covers all couple-authored text fields on that
-- table. A row that goes "rich" is rich for all its fields — acceptable
-- simplification; we don't expect a row with a rich `description` and a
-- plain `logistics`.
--
-- Knowledge base lives inside weddings.config (JSONB), so we don't add a
-- column there; the flag is stored as config.knowledge_base_format, read
-- by the API and passed to <RichText> as a prop. No schema change needed.

ALTER TABLE faq_entries
  ADD COLUMN IF NOT EXISTS content_format TEXT NOT NULL DEFAULT 'plain'
    CHECK (content_format IN ('plain', 'rich'));

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS content_format TEXT NOT NULL DEFAULT 'plain'
    CHECK (content_format IN ('plain', 'rich'));
