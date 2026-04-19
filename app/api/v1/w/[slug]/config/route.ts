import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';
import { toDateString } from '@/lib/db/format';
import { handleApiError, AppError } from '@/lib/errors';
import type { WeddingConfig, EventConfig, HomeCardImage } from '@/lib/types/api';

/**
 * Coerce a stored home_card_images.* value into the HomeCardImage shape.
 * Handles legacy rows that stored just the URL string (before focal point
 * control shipped) so they don't need a DB migration.
 */
function normalizeHomeCardImage(raw: unknown): HomeCardImage | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    return raw ? { url: raw, position: '50% 50%' } : null;
  }
  if (typeof raw === 'object' && raw !== null && 'url' in raw) {
    const obj = raw as Record<string, unknown>;
    const url = typeof obj.url === 'string' ? obj.url : '';
    if (!url) return null;
    const position =
      typeof obj.position === 'string' && obj.position ? obj.position : '50% 50%';
    const result: HomeCardImage = { url, position };
    // Pass through crop data when present (set by the interactive editor).
    if (
      obj.crop &&
      typeof obj.crop === 'object' &&
      'x' in (obj.crop as object)
    ) {
      const c = obj.crop as Record<string, unknown>;
      if (
        typeof c.x === 'number' &&
        typeof c.y === 'number' &&
        typeof c.zoom === 'number'
      ) {
        result.crop = { x: c.x, y: c.y, zoom: c.zoom };
      }
    }
    return result;
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const pool = getPool();

    // Fetch wedding by slug
    const weddingResult = await pool.query(
      `SELECT id, slug, display_name, hashtag, wedding_date, timezone, status, config, package_config,
              venue_city, venue_country, venue_lat, venue_lng
       FROM weddings WHERE slug = $1`,
      [slug]
    );

    if (weddingResult.rows.length === 0) {
      throw new AppError('WEDDING_NOT_FOUND');
    }

    const wedding = weddingResult.rows[0];

    if (wedding.status === 'archived') {
      throw new AppError('WEDDING_INACTIVE');
    }

    // Fetch events for this wedding
    const eventsResult = await pool.query(
      `SELECT id, name, date, start_time, end_time, venue_name, venue_address,
              dress_code, description, logistics, accent_color
       FROM events WHERE wedding_id = $1 ORDER BY sort_order ASC, date ASC`,
      [wedding.id]
    );

    const config = wedding.config || {};
    const packageConfig = wedding.package_config || {};

    const events: EventConfig[] = eventsResult.rows.map((e: Record<string, unknown>) => ({
      id: e.id as string,
      name: e.name as string,
      date: toDateString(e.date),
      start_time: e.start_time ? String(e.start_time) : null,
      end_time: e.end_time ? String(e.end_time) : null,
      venue_name: (e.venue_name as string) || null,
      venue_address: (e.venue_address as string) || null,
      dress_code: (e.dress_code as string) || null,
      description: (e.description as string) || null,
      logistics: (e.logistics as string) || null,
      accent_color: (e.accent_color as string) || null,
    }));

    const weddingConfig: WeddingConfig = {
      wedding_id: wedding.id,
      slug: wedding.slug,
      display_name: wedding.display_name,
      couple_names: config.couple_names || { name1: '', name2: '' },
      hashtag: wedding.hashtag || config.hashtag || '',
      wedding_date: toDateString(wedding.wedding_date),
      timezone: wedding.timezone || 'America/New_York',
      venue_city: wedding.venue_city || null,
      venue_country: wedding.venue_country || null,
      venue_lat: wedding.venue_lat ? Number(wedding.venue_lat) : null,
      venue_lng: wedding.venue_lng ? Number(wedding.venue_lng) : null,
      status: wedding.status,
      wedding_planner: config.wedding_planner
        ? {
            name: config.wedding_planner.name || null,
            email: config.wedding_planner.email || null,
          }
        : null,
      guest_background: config.guest_background?.url
        ? {
            url: config.guest_background.url,
            opacity: typeof config.guest_background.opacity === 'number'
              ? config.guest_background.opacity
              : 0.08,
          }
        : null,
      home_card_images: {
        schedule: normalizeHomeCardImage(config.home_card_images?.schedule),
        travel: normalizeHomeCardImage(config.home_card_images?.travel),
      },
      theme: config.theme || {
        preset: 'mediterranean',
        colors: { primary: '#C4704B', secondary: '#2B5F8A', bg: '#FEFCF9', text: '#2C2825' },
        fonts: { heading: 'Playfair Display', body: 'DM Sans' },
      },
      prompts: config.prompts || { heartfelt: [], fun: [], quick_takes: [] },
      enabled_filters: config.enabled_filters || [],
      enabled_ai_styles: config.enabled_ai_styles || [],
      rsvp_url: typeof config.rsvp_url === 'string' && config.rsvp_url.trim()
        ? config.rsvp_url.trim()
        : null,
      rsvp_passcode: typeof config.rsvp_passcode === 'string' && config.rsvp_passcode.trim()
        ? config.rsvp_passcode.trim()
        : null,
      invite_url: typeof config.invite_url === 'string' && config.invite_url.trim()
        ? config.invite_url.trim()
        : null,
      events,
      features: {
        social_feed: packageConfig.social_feed ?? false,
        faq_chatbot: packageConfig.faq_chatbot ?? false,
        sms_notifications: packageConfig.sms_notifications ?? false,
        ai_portraits: true,
        ai_portraits_per_guest: packageConfig.ai_portraits_per_guest ?? 5,
      },
    };

    return Response.json({ data: weddingConfig });
  } catch (error) {
    return handleApiError(error);
  }
}
