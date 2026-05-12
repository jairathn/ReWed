/**
 * URL → embed kind classifier. Used by both:
 *   - the Tiptap paste handler (Block 2.A.4 — ships in PR1b)
 *   - the <RichText> renderer, which detects URL-only paragraphs and
 *     swaps them for iframe embeds inline
 *
 * The two consumers MUST share this function so a URL the editor recognised
 * as an embed is also rendered as one on the guest side. Don't bake provider
 * regexes into the renderer separately.
 *
 * Adding a new provider: extend the providers list. The renderer / editor
 * pick it up for free.
 */

export type EmbedKind = 'youtube' | 'vimeo' | 'spotify' | 'apple_music' | 'google_maps' | 'link';

export interface Embed {
  kind: EmbedKind;
  embedUrl: string;
  originalUrl: string;
  title?: string;
}

interface Matcher {
  kind: Exclude<EmbedKind, 'link'>;
  // Tries to derive an embed URL from a parsed URL. Returns null when not a match.
  match(url: URL): string | null;
}

const matchers: Matcher[] = [
  {
    kind: 'youtube',
    match(url) {
      // youtu.be/<id> or youtube.com/watch?v=<id> or youtube.com/embed/<id>
      if (/(^|\.)youtu\.be$/.test(url.hostname)) {
        const id = url.pathname.replace(/^\/+/, '').split('/')[0];
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      if (/(^|\.)youtube\.com$/.test(url.hostname)) {
        if (url.pathname.startsWith('/embed/')) return url.toString();
        if (url.pathname === '/watch') {
          const id = url.searchParams.get('v');
          return id ? `https://www.youtube.com/embed/${id}` : null;
        }
        if (url.pathname.startsWith('/shorts/')) {
          const id = url.pathname.split('/')[2];
          return id ? `https://www.youtube.com/embed/${id}` : null;
        }
      }
      return null;
    },
  },
  {
    kind: 'vimeo',
    match(url) {
      if (!/(^|\.)vimeo\.com$/.test(url.hostname)) return null;
      // vimeo.com/<id> or player.vimeo.com/video/<id>
      if (url.pathname.startsWith('/video/')) return url.toString();
      const id = url.pathname.replace(/^\/+/, '').split('/')[0];
      return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    },
  },
  {
    kind: 'spotify',
    match(url) {
      if (!/(^|\.)spotify\.com$/.test(url.hostname)) return null;
      if (url.pathname.startsWith('/embed/')) return url.toString();
      // open.spotify.com/{track|album|playlist|episode|show}/<id>
      const m = url.pathname.match(/^\/(track|album|playlist|episode|show)\/([^/]+)/);
      return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}` : null;
    },
  },
  {
    kind: 'apple_music',
    match(url) {
      // music.apple.com or embed.music.apple.com.
      if (!/(^|\.)music\.apple\.com$/.test(url.hostname)) return null;
      if (url.hostname.startsWith('embed.')) return url.toString();
      // music.apple.com/<region>/<kind>/<id>... → embed.music.apple.com/...
      return `https://embed.music.apple.com${url.pathname}${url.search}`;
    },
  },
  {
    kind: 'google_maps',
    match(url) {
      const isGoogle =
        /(^|\.)google\.[a-z.]+$/.test(url.hostname) ||
        url.hostname === 'maps.google.com' ||
        url.hostname === 'goo.gl' ||
        url.hostname === 'maps.app.goo.gl';
      if (!isGoogle) return null;
      // Shortlinks: defer to opaque embed via the original URL (Google's
      // /maps page accepts &output=embed for visible queries).
      if (url.pathname.includes('/maps') || url.hostname.startsWith('maps')) {
        // Reuse the original URL + force embed output. Drop credentials, fragments.
        const clean = new URL(url.toString());
        clean.searchParams.set('output', 'embed');
        return clean.toString();
      }
      return null;
    },
  },
];

export function detectEmbed(raw: string): Embed {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'link', embedUrl: trimmed, originalUrl: trimmed };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { kind: 'link', embedUrl: trimmed, originalUrl: trimmed };
  }
  // Strict scheme allowlist — never embed file://, ftp://, javascript:, etc.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { kind: 'link', embedUrl: trimmed, originalUrl: trimmed };
  }
  for (const m of matchers) {
    const embed = m.match(url);
    if (embed) return { kind: m.kind, embedUrl: embed, originalUrl: trimmed };
  }
  return { kind: 'link', embedUrl: trimmed, originalUrl: trimmed };
}

/**
 * True if a string is a single URL with nothing else (whitespace ok).
 * The renderer uses this to decide whether a paragraph is purely a URL
 * paragraph that can be promoted to an embed.
 */
export function isUrlOnly(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (!/^https?:\/\/\S+$/i.test(t)) return false;
  try {
    new URL(t);
    return true;
  } catch {
    return false;
  }
}
