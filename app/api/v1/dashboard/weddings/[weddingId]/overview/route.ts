import { NextRequest } from 'next/server';
import { handleApiError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { toDateString } from '@/lib/db/format';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';

/**
 * GET /api/v1/dashboard/weddings/[weddingId]/overview
 * Returns wedding details + summary stats.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const pool = getPool();

    // Fetch wedding + counts in parallel
    const [weddingRes, guestRes, eventRes, uploadRes, faqRes, feedRes] = await Promise.all([
      pool.query(
        `SELECT id, slug, display_name, wedding_date, timezone, status, config, package_config,
                storage_used_bytes, ai_portraits_used, created_at,
                venue_city, venue_country, venue_lat, venue_lng
         FROM weddings WHERE id = $1`,
        [weddingId]
      ),
      pool.query(
        `SELECT COUNT(*) as total,
                COUNT(*) FILTER (WHERE rsvp_status = 'attending') as attending,
                COUNT(*) FILTER (WHERE rsvp_status = 'declined') as declined,
                COUNT(*) FILTER (WHERE rsvp_status = 'pending') as pending
         FROM guests WHERE wedding_id = $1`,
        [weddingId]
      ),
      pool.query('SELECT COUNT(*) as total FROM events WHERE wedding_id = $1', [weddingId]),
      pool.query(
        `SELECT COUNT(*) as total,
                COUNT(*) FILTER (WHERE type = 'photo') as photos,
                COUNT(*) FILTER (WHERE type = 'video') as videos
         FROM uploads WHERE wedding_id = $1 AND status = 'ready'`,
        [weddingId]
      ),
      pool.query('SELECT COUNT(*) as total FROM faq_entries WHERE wedding_id = $1', [weddingId]),
      pool.query('SELECT COUNT(*) as total FROM feed_posts WHERE wedding_id = $1 AND is_hidden = FALSE', [weddingId]),
    ]);

    const wedding = weddingRes.rows[0];
    const guests = guestRes.rows[0];
    const events = eventRes.rows[0];
    const uploads = uploadRes.rows[0];
    const faqs = faqRes.rows[0];
    const feeds = feedRes.rows[0];

    // Normalize date fields so the frontend receives YYYY-MM-DD strings
    wedding.wedding_date = toDateString(wedding.wedding_date);

    return Response.json({
      wedding,
      stats: {
        guests: {
          total: parseInt(guests.total),
          attending: parseInt(guests.attending),
          declined: parseInt(guests.declined),
          pending: parseInt(guests.pending),
        },
        events: parseInt(events.total),
        uploads: {
          total: parseInt(uploads.total),
          photos: parseInt(uploads.photos),
          videos: parseInt(uploads.videos),
        },
        faq_entries: parseInt(faqs.total),
        feed_posts: parseInt(feeds.total),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
