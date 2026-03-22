import { NextRequest } from 'next/server';
import { handleApiError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';

/**
 * GET /api/v1/dashboard/weddings/[weddingId]/memoir-messages
 * List all memoir messages with guest info
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
      `SELECT mm.id, mm.guest_id, mm.message, mm.created_at,
              g.first_name, g.last_name, g.display_name
       FROM memoir_messages mm
       JOIN guests g ON mm.guest_id = g.id
       WHERE mm.wedding_id = $1
       ORDER BY g.last_name, g.first_name`,
      [weddingId]
    );

    return Response.json({
      data: {
        messages: result.rows.map((r: Record<string, unknown>) => ({
          id: r.id,
          guest_id: r.guest_id,
          guest_name: r.display_name || `${r.first_name} ${r.last_name}`,
          message: r.message,
          created_at: r.created_at,
        })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/dashboard/weddings/[weddingId]/memoir-messages
 * Create or update a memoir message for a guest
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
    const { guest_id, message } = body;

    if (!guest_id || !message || typeof message !== 'string') {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'guest_id and message required' } },
        { status: 400 }
      );
    }

    if (message.length > 2000) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Message must be under 2000 characters' } },
        { status: 400 }
      );
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO memoir_messages (wedding_id, guest_id, message)
       VALUES ($1, $2, $3)
       ON CONFLICT (wedding_id, guest_id)
       DO UPDATE SET message = $3, updated_at = NOW()`,
      [weddingId, guest_id, message.trim()]
    );

    return Response.json({ data: { success: true } });
  } catch (error) {
    return handleApiError(error);
  }
}
