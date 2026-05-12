'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize from 'rehype-sanitize';
import { RICH_TEXT_SCHEMA, isSafeLinkHref } from './sanitize-schema';
import { detectEmbed, isUrlOnly, type Embed } from './embed-detect';

export type ContentFormat = 'plain' | 'rich';

interface Props {
  value: string | null | undefined;
  /**
   * 'plain' (default): legacy content authored against the old <textarea>
   *   surfaces. We pre-escape Markdown-special chars at line starts so
   *   "5 - 6 hours" doesn't suddenly render as a list. Single newlines
   *   become <br> via remark-breaks for parity with the old whiteSpace:
   *   pre-line behaviour.
   * 'rich': content authored via the upcoming Tiptap editor (PR1b).
   *   Strict Markdown parsing; nothing is escaped pre-parse.
   */
  format?: ContentFormat;
  /**
   * Optional class on the root wrapper. Per-site margins / typography
   * are driven by the parent — RichText itself stays unstyled so the
   * surrounding card / panel keeps full control.
   */
  className?: string;
}

/**
 * Guest-side rich-text renderer.
 *
 * Two render modes, one component:
 *   - In 'plain' mode the input is preprocessed so it renders identically
 *     to the previous `whiteSpace: 'pre-line'` behaviour. This is what
 *     every pre-PR1b row uses.
 *   - In 'rich' mode the input is parsed as full Markdown.
 *
 * Embed detection runs in both modes. A paragraph that is *only* a URL gets
 * promoted to an iframe (YouTube, Vimeo, Spotify, Apple Music, Google Maps).
 * The detector is the same one the editor uses on paste, so what the couple
 * sees in their editor is what the guest sees on the page.
 *
 * Sanitization is two-layered: rehype-sanitize against RICH_TEXT_SCHEMA,
 * then a per-anchor href hardener that forces target="_blank"
 * rel="noopener noreferrer" on outbound links and drops anchors with
 * disallowed schemes.
 */
export function RichText({ value, format = 'plain', className }: Props) {
  const text = value ?? '';
  if (!text.trim()) return null;

  const source = format === 'plain' ? escapeForPlainMode(text) : text;

  return (
    <div className={className} data-rich-text-format={format}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[[rehypeSanitize, RICH_TEXT_SCHEMA]]}
        components={MARKDOWN_COMPONENTS}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Pre-render escaping for legacy plain-text content.
 *
 * The goal: a string that used to render via <span style={{whiteSpace:'pre-line'}}>{value}</span>
 * looks the same after going through the Markdown parser.
 *
 * What needs escaping:
 *   - line-start `#`, `>`, `-`, `*`, `+`, `~`, digits-then-period — would
 *     parse as heading / blockquote / list / numbered list
 *   - inline `_`, `*`, `~`, backtick — would parse as emphasis / strong / strike / code
 *
 * We escape inline forms too because pre-PR1b authors used `*` as a literal
 * star sometimes (audit H-2 specifically called this out). Better to lose
 * the rare intentional `**bold**` in legacy text than to mangle "Wear
 * *something* nice" by italicising "something".
 *
 * URLs are NOT escaped — pasted URLs auto-linking is desirable behaviour
 * that the audit didn't flag as a regression risk.
 */
function escapeForPlainMode(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      // Line-start escape: leading punctuation that would change the line's role.
      const lineStartFixed = line.replace(
        /^(\s*)([#>\-*+~]|\d+[.)])(\s|$)/,
        (_m, ws: string, sigil: string, after: string) => `${ws}\\${sigil}${after}`
      );
      // Inline escape on every remaining markdown-special char. Order matters
      // (backslash first) so we don't double-escape our own escapes.
      return lineStartFixed
        .replace(/\\/g, '\\\\')
        .replace(/\*/g, '\\*')
        .replace(/_/g, '\\_')
        .replace(/`/g, '\\`')
        .replace(/~/g, '\\~')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/!/g, '\\!');
    })
    .join('\n');
}

/**
 * Custom component overrides:
 *   - paragraphs that contain only a single URL render as an embed (or a
 *     hardened anchor for non-embeddable URLs)
 *   - anchors get target="_blank" rel="noopener noreferrer" and a final
 *     href safety check
 *   - images get lazy-loading and a small wrapper for caption support later
 */
const MARKDOWN_COMPONENTS: Components = {
  p({ children, ...props }) {
    // Promote URL-only paragraphs to embeds. We inspect the children list:
    // when there's exactly one child and it's a text node containing a URL
    // (or an <a> wrapping one), swap the paragraph for an embed/link card.
    const candidate = extractSoleUrl(children);
    if (candidate) {
      const embed = detectEmbed(candidate);
      if (embed.kind !== 'link') return <EmbedBlock embed={embed} />;
      // Not embeddable — render as an anchor instead of letting the paragraph
      // fall through. Same visual as the inline link case.
      return <p {...props}><SafeLink href={candidate}>{candidate}</SafeLink></p>;
    }
    return <p {...props}>{children}</p>;
  },

  a({ children, href, ...props }) {
    return (
      <SafeLink href={typeof href === 'string' ? href : ''} {...props}>
        {children}
      </SafeLink>
    );
  },

  img({ src, alt, ...props }) {
    const srcStr = typeof src === 'string' ? src : '';
    if (!srcStr) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={srcStr}
        alt={alt ?? ''}
        loading="lazy"
        decoding="async"
        style={{ maxWidth: '100%', height: 'auto', borderRadius: 8 }}
        {...props}
      />
    );
  },
};

function SafeLink({
  href,
  children,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: React.ReactNode }) {
  if (!isSafeLinkHref(href)) {
    // Drop the anchor entirely if the scheme isn't allowed — render the text
    // (or string href) instead so content is preserved but the link is gone.
    return <>{children}</>;
  }
  const external = /^https?:/i.test(href);
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      {...rest}
    >
      {children}
    </a>
  );
}

function EmbedBlock({ embed }: { embed: Embed }) {
  const sandbox = 'allow-scripts allow-same-origin allow-popups allow-presentation';
  const aspect = embed.kind === 'spotify' ? '352 / 152' : embed.kind === 'apple_music' ? '450 / 175' : '16 / 9';
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: aspect,
        borderRadius: 12,
        overflow: 'hidden',
        background: 'var(--bg-soft-cream, #f5f1ea)',
        margin: '8px 0',
      }}
    >
      <iframe
        src={embed.embedUrl}
        title={embed.title || embed.kind}
        sandbox={sandbox}
        loading="lazy"
        allow={
          embed.kind === 'youtube' || embed.kind === 'vimeo'
            ? 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
            : undefined
        }
        allowFullScreen
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 'none',
        }}
      />
    </div>
  );
}

/**
 * If the paragraph contains exactly one URL — either bare text or an <a>
 * wrapping a URL whose href and text match — return that URL. Otherwise null.
 *
 * react-markdown calls our `p` component with `children` already converted to
 * React elements / text nodes, so we walk them shallowly.
 */
function extractSoleUrl(children: React.ReactNode): string | null {
  const nodes = React.Children.toArray(children);
  if (nodes.length !== 1) return null;
  const only = nodes[0];

  if (typeof only === 'string') {
    return isUrlOnly(only) ? only.trim() : null;
  }
  if (typeof only === 'object' && only !== null && 'props' in only) {
    const el = only as React.ReactElement<{ href?: string; children?: React.ReactNode }>;
    // An <a href="x">x</a> with matching href+text qualifies.
    if (el.type === 'a' || (typeof el.type === 'function')) {
      const href = el.props?.href;
      const inner = el.props?.children;
      const innerText =
        typeof inner === 'string'
          ? inner
          : Array.isArray(inner) && inner.every((c) => typeof c === 'string')
          ? inner.join('')
          : null;
      if (href && innerText && href.trim() === innerText.trim() && isUrlOnly(href)) {
        return href.trim();
      }
    }
  }
  return null;
}

// React is used implicitly through JSX; the explicit import keeps eslint and
// React.Children typings happy without `import * as React`.
import React from 'react';

export default RichText;
