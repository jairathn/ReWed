// Lightweight activity tracking for guest engagement analytics
// Usage: await trackActivity(pool, { weddingId, guestId, eventType, metadata })

import type { Pool } from 'pg';

export type ActivityEventType =
  | 'page_view'
  | 'photo_captured'
  | 'video_recorded'
  | 'portrait_generated'
  | 'faq_asked'
  | 'song_requested'
  | 'table_viewed'
  | 'contact_shared'
  | 'memoir_viewed'
  | 'memoir_shared'
  | 'feed_post_created'
  | 'feed_liked'
  | 'feed_commented'
  | 'travel_plan_saved'
  | 'icebreaker_answered'
  | 'gallery_viewed'
  | 'shared_gallery_viewed';

export async function trackActivity(
  pool: Pool,
  params: {
    weddingId: string;
    guestId?: string | null;
    eventType: ActivityEventType;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO activity_log (wedding_id, guest_id, event_type, metadata)
       VALUES ($1, $2, $3, $4)`,
      [
        params.weddingId,
        params.guestId || null,
        params.eventType,
        JSON.stringify(params.metadata || {}),
      ]
    );
  } catch (err) {
    // Activity tracking should never break the main flow
    console.error('Activity tracking failed:', err);
  }
}
