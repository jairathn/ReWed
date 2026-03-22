import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';
import { getMediaUrl } from '@/lib/storage/r2';
import { handleApiError, AppError } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; guestId: string }> }
) {
  try {
    const { slug, guestId } = await params;
    const pool = getPool();

    // Get wedding
    const weddingResult = await pool.query(
      `SELECT id, display_name, config, wedding_date, status, gallery_published FROM weddings WHERE slug = $1`,
      [slug]
    );
    if (weddingResult.rows.length === 0) {
      throw new AppError('WEDDING_NOT_FOUND');
    }
    const wedding = weddingResult.rows[0];
    const config = wedding.config || {};

    // Get guest
    const guestResult = await pool.query(
      `SELECT id, first_name, last_name, display_name, memoir_published FROM guests WHERE id = $1 AND wedding_id = $2`,
      [guestId, wedding.id]
    );
    if (guestResult.rows.length === 0) {
      throw new AppError('AUTH_GUEST_NOT_FOUND');
    }
    const guest = guestResult.rows[0];

    // If memoir is not published, return minimal data with published: false
    if (!guest.memoir_published) {
      return Response.json({
        data: {
          published: false,
          wedding: {
            display_name: wedding.display_name,
            couple_names: config.couple_names || { name1: '', name2: '' },
            wedding_date: wedding.wedding_date,
            hashtag: config.hashtag || '',
          },
          guest: {
            id: guest.id,
            first_name: guest.first_name,
            display_name: guest.display_name,
          },
        },
      });
    }

    // Run all queries in parallel
    const [
      photosResult,
      videosResult,
      portraitsResult,
      postsResult,
      highlightReelsResult,
      memoirMessageResult,
      carouselPhotosResult,
    ] = await Promise.all([
      // Guest's photos
      pool.query(
        `SELECT id, storage_key, thumbnail_key, type, created_at
         FROM uploads
         WHERE wedding_id = $1 AND guest_id = $2 AND status = 'ready' AND type = 'photo'
         ORDER BY created_at ASC
         LIMIT 50`,
        [wedding.id, guestId]
      ),
      // Guest's videos
      pool.query(
        `SELECT id, storage_key, thumbnail_key, duration_ms, created_at
         FROM uploads
         WHERE wedding_id = $1 AND guest_id = $2 AND status = 'ready' AND type = 'video'
         ORDER BY created_at ASC
         LIMIT 10`,
        [wedding.id, guestId]
      ),
      // Guest's AI portraits
      pool.query(
        `SELECT id, output_key, style_id, created_at
         FROM ai_jobs
         WHERE wedding_id = $1 AND guest_id = $2 AND type = 'portrait' AND status = 'completed' AND output_key IS NOT NULL
         ORDER BY created_at ASC
         LIMIT 10`,
        [wedding.id, guestId]
      ),
      // Guest's feed posts
      pool.query(
        `SELECT id, content, type, created_at
         FROM feed_posts
         WHERE wedding_id = $1 AND guest_id = $2 AND is_hidden = FALSE AND content IS NOT NULL
         ORDER BY created_at ASC
         LIMIT 5`,
        [wedding.id, guestId]
      ),
      // Highlight reels for this guest
      pool.query(
        `SELECT id, type, storage_key, thumbnail_key, duration_ms, status
         FROM highlight_reels
         WHERE wedding_id = $1 AND guest_id = $2`,
        [wedding.id, guestId]
      ),
      // Personal thank-you message
      pool.query(
        `SELECT message FROM memoir_messages
         WHERE wedding_id = $1 AND guest_id = $2`,
        [wedding.id, guestId]
      ),
      // Carousel photos from all guests (only couple-approved, only if gallery published)
      wedding.gallery_published
        ? pool.query(
            `SELECT u.id, u.storage_key, u.thumbnail_key
             FROM uploads u
             WHERE u.wedding_id = $1 AND u.status = 'ready' AND u.type = 'photo'
               AND u.couple_approved = TRUE
             ORDER BY u.created_at DESC
             LIMIT 24`,
            [wedding.id]
          )
        : Promise.resolve({ rows: [] }),
    ]);

    const photos = await Promise.all(photosResult.rows.map(async (r) => ({
      id: r.id,
      url: await getMediaUrl(r.storage_key),
      thumbnail_url: await getMediaUrl(r.thumbnail_key || r.storage_key),
    })));

    const videos = await Promise.all(videosResult.rows.map(async (r) => ({
      id: r.id,
      url: await getMediaUrl(r.storage_key),
      thumbnail_url: await getMediaUrl(r.thumbnail_key || r.storage_key),
      duration_ms: r.duration_ms,
    })));

    const portraits = await Promise.all(portraitsResult.rows.map(async (r) => ({
      id: r.id,
      url: await getMediaUrl(r.output_key),
      style_id: r.style_id,
    })));

    // Build highlight reels
    const highlightReels: Record<string, { url: string; thumbnail_url: string | null; duration_ms: number | null; status: string }> = {};
    for (const reel of highlightReelsResult.rows) {
      highlightReels[reel.type] = {
        url: reel.status === 'ready' ? await getMediaUrl(reel.storage_key) : '',
        thumbnail_url: reel.thumbnail_key ? await getMediaUrl(reel.thumbnail_key) : null,
        duration_ms: reel.duration_ms,
        status: reel.status,
      };
    }

    // Carousel photos for the memoir background strips
    const carouselPhotos = await Promise.all(carouselPhotosResult.rows.map(async (r) => ({
      id: r.id,
      url: await getMediaUrl(r.storage_key),
      thumbnail_url: await getMediaUrl(r.thumbnail_key || r.storage_key),
    })));

    // Track view (fire and forget)
    pool.query(
      `INSERT INTO activity_log (wedding_id, guest_id, event_type, metadata)
       VALUES ($1, $2, 'memoir_viewed', $3)`,
      [wedding.id, guestId, JSON.stringify({ viewer: 'public' })]
    ).catch(() => {});

    return Response.json({
      data: {
        published: true,
        wedding: {
          display_name: wedding.display_name,
          couple_names: config.couple_names || { name1: '', name2: '' },
          wedding_date: wedding.wedding_date,
          hashtag: config.hashtag || '',
          venue_city: config.venue_city || null,
          venue_country: config.venue_country || null,
        },
        guest: {
          id: guest.id,
          first_name: guest.first_name,
          last_name: guest.last_name,
          display_name: guest.display_name,
        },
        photos,
        videos,
        portraits,
        posts: postsResult.rows,
        highlight_reels: highlightReels,
        memoir_message: memoirMessageResult.rows[0]?.message || null,
        carousel_photos: carouselPhotos,
        stats: {
          photo_count: photos.length,
          video_count: videos.length,
          portrait_count: portraits.length,
        },
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
