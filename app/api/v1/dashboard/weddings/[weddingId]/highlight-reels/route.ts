import { NextRequest } from 'next/server';
import { handleApiError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { generatePresignedPutUrl, getMediaUrl } from '@/lib/storage/r2';

/**
 * GET /api/v1/dashboard/weddings/[weddingId]/highlight-reels
 * List all highlight reels with guest info + status
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
    const result = await pool.query(
      `SELECT hr.id, hr.guest_id, hr.type, hr.storage_key, hr.thumbnail_key,
              hr.duration_ms, hr.status, hr.created_at,
              g.first_name, g.last_name, g.display_name
       FROM highlight_reels hr
       JOIN guests g ON hr.guest_id = g.id
       WHERE hr.wedding_id = $1
       ORDER BY g.last_name, g.first_name, hr.type`,
      [weddingId]
    );

    const items = await Promise.all(result.rows.map(async (r: Record<string, unknown>) => ({
      id: r.id,
      guest_id: r.guest_id,
      guest_name: r.display_name || `${r.first_name} ${r.last_name}`,
      type: r.type,
      url: r.status === 'ready' ? await getMediaUrl(r.storage_key) : null,
      thumbnail_url: r.thumbnail_key ? await getMediaUrl(r.thumbnail_key) : null,
      duration_ms: r.duration_ms,
      status: r.status,
      created_at: r.created_at,
    })));

    // Also get list of all guests for the dropdown
    const guestsResult = await pool.query(
      `SELECT id, first_name, last_name, display_name FROM guests
       WHERE wedding_id = $1 ORDER BY last_name, first_name`,
      [weddingId]
    );

    return Response.json({
      data: {
        reels: items,
        guests: guestsResult.rows.map((g: Record<string, unknown>) => ({
          id: g.id,
          name: g.display_name || `${g.first_name} ${g.last_name}`,
        })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/dashboard/weddings/[weddingId]/highlight-reels
 * Get a presigned URL for uploading a highlight reel, or mark one as ready
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const body = await request.json();
    const { guest_id, type, action, content_type, content_length } = body;

    if (!guest_id || !type || !['keeper', 'reel'].includes(type)) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'guest_id and type (keeper|reel) required' } },
        { status: 400 }
      );
    }

    const pool = getPool();

    if (action === 'presign') {
      // Generate presigned upload URL
      if (!content_type || !content_length) {
        return Response.json(
          { error: { code: 'VALIDATION_ERROR', message: 'content_type and content_length required for presign' } },
          { status: 400 }
        );
      }

      // Upsert the highlight reel record
      const upsertResult = await pool.query(
        `INSERT INTO highlight_reels (wedding_id, guest_id, type, storage_key, status)
         VALUES ($1, $2, $3, '', 'pending')
         ON CONFLICT (wedding_id, guest_id, type)
         DO UPDATE SET status = 'pending', updated_at = NOW()
         RETURNING id`,
        [weddingId, guest_id, type]
      );
      const reelId = upsertResult.rows[0].id;

      const presigned = await generatePresignedPutUrl({
        weddingId,
        uploadId: reelId,
        contentType: content_type,
        contentLength: content_length,
        guestName: 'highlights',
        eventName: type,
      });

      // Update storage key
      await pool.query(
        `UPDATE highlight_reels SET storage_key = $1 WHERE id = $2`,
        [presigned.key, reelId]
      );

      return Response.json({
        data: {
          reel_id: reelId,
          upload_url: presigned.url,
          storage_key: presigned.key,
        },
      });
    }

    if (action === 'complete') {
      // Mark upload as ready
      const { reel_id, duration_ms, size_bytes } = body;
      if (!reel_id) {
        return Response.json(
          { error: { code: 'VALIDATION_ERROR', message: 'reel_id required' } },
          { status: 400 }
        );
      }

      await pool.query(
        `UPDATE highlight_reels
         SET status = 'ready', duration_ms = $1, size_bytes = $2, updated_at = NOW()
         WHERE id = $3 AND wedding_id = $4`,
        [duration_ms || null, size_bytes || null, reel_id, weddingId]
      );

      return Response.json({ data: { success: true } });
    }

    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: 'action must be presign or complete' } },
      { status: 400 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
