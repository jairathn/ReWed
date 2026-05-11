import { defaultSchema } from 'rehype-sanitize';
import type { Schema } from 'hast-util-sanitize';

/**
 * Sanitization schema shared by every rendering site. Two truths to internalize
 * before editing this:
 *
 *   1. Embeds are NOT iframe HTML in our markdown. The editor serializes
 *      embeddable URLs as plain Markdown links / URL-paragraphs. The renderer
 *      detects URL-only paragraphs via embed-detect.ts and builds iframes
 *      itself from a clean URL list. That means: iframes never appear in the
 *      content this sanitizer sees, so we don't allowlist iframe here at all.
 *      If you find yourself adding `iframe` to this schema, stop and read
 *      embed-detect.ts again.
 *
 *   2. We pre-escape ambiguous Markdown characters at line starts on rows
 *      that haven't opted into rich mode (see RichText.tsx). This sanitizer
 *      only sees the AST after Markdown parsing, so it never has to think
 *      about pre-rendering edge cases.
 *
 * Output of this is fed to rehype-sanitize. Anything not allowlisted gets
 * dropped silently (no error, just removed).
 */

// Couples never write inline classnames. If we later add semantic classes
// (e.g. for blockquotes styled differently), allowlist them here. For now,
// disallowed entirely.
const ALLOWED_CLASS_NAMES: ReadonlyArray<string> = [];

export const RICH_TEXT_SCHEMA: Schema = {
  ...defaultSchema,
  // Tag allowlist — derived from defaultSchema but explicit so future
  // rehype-sanitize updates don't silently widen the surface.
  tagNames: [
    'p',
    'br',
    'strong',
    'em',
    'u',
    's',
    'del',
    'h2',
    'h3',
    'ul',
    'ol',
    'li',
    'a',
    'img',
    'blockquote',
    'code',
    'pre',
    'hr',
  ],

  attributes: {
    a: ['href', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    // Everything else: no attributes at all (sanitizer strips them silently).
  },

  // URL scheme allowlist for href / src — note: rehype-sanitize already
  // restricts these by default; we make our list explicit and remove anything
  // we don't want (javascript:, data: except images, file:, etc.).
  protocols: {
    href: ['http', 'https', 'mailto', 'tel'],
    src: ['http', 'https'],
  },

  // Force safe defaults onto outbound links.
  // rehype-sanitize doesn't add attributes itself — we layer this on in the
  // <RichText> renderer by post-processing <a> nodes. Schema documents intent.
  clobber: [],
  clobberPrefix: '',

  // Top-level allowed ancestor structure stays at default (defaultSchema
  // already enforces sane nesting — e.g. <li> only inside <ul>/<ol>).
};

/**
 * Classes safe to render. Currently empty — strip all class attributes.
 * Exposed in case a future style needs a stable hook.
 */
export const SAFE_CLASS_NAMES: ReadonlyArray<string> = ALLOWED_CLASS_NAMES;

/**
 * Whether a URL is a safe target for <a href="…">.
 * Matches `protocols.href` above. Used by the post-render link hardener.
 */
export function isSafeLinkHref(href: string): boolean {
  if (!href) return false;
  try {
    const u = new URL(href, 'https://placeholder.invalid');
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol);
  } catch {
    return false;
  }
}
