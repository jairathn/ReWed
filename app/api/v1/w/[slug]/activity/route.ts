import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
import { trackActivity, type ActivityEventType } from '@/lib/activity';
import { handleApiError, AppError } from '@/lib/errors';

const VALID_EVENT_TYPES: ActivityEventType[] = [
  'page_view', 'photo_captured', 'video_recorded', 'portrait_generated',
  'faq_asked', 'song_requested', 'table_viewed', 'contact_shared',
  'memoir_viewed', 'memoir_shared', 'feed_post_created', 'feed_liked',
  'feed_commented', 'travel_plan_saved', 'icebreaker_answered',
  'gallery_viewed', 'shared_gallery_viewed',
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const pool = getPool();

    const sessionToken = request.cookies.get('wedding_session')?.value;
    if (!sessionToken) {
      throw new AppError('AUTH_NOT_REGISTERED');
    }

    const session = await validateSession(pool, sessionToken);
    if (!session) {
      throw new AppError('AUTH_TOKEN_EXPIRED');
    }

    const body = await request.json();
    const { event_type, metadata } = body;

    if (!event_type || !VALID_EVENT_TYPES.includes(event_type)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid event type');
    }

    await trackActivity(pool, {
      weddingId: session.weddingId,
      guestId: session.guestId,
      eventType: event_type,
      metadata: metadata || {},
    });

    return Response.json({ data: { tracked: true } });
  } catch (error) {
    return handleApiError(error);
  }
}
