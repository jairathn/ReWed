import { NextRequest } from 'next/server';
import { handleApiError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { requireWeddingAccess } from '@/lib/dashboard-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    await requireWeddingAccess(request, weddingId);

    const pool = getPool();
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'pending';

    const result = await pool.query(
      `SELECT id, source_type, source_ref, source_summary, source_url,
              action_type, payload, rationale, status, resolved_at,
              resolved_by_role, applied_entity_id, created_at
       FROM suggestions
       WHERE wedding_id = $1 AND ($2 = 'all' OR status = $2)
       ORDER BY created_at DESC LIMIT 100`,
      [weddingId, status]
    );

    return Response.json({ data: { suggestions: result.rows } });
  } catch (error) {
    return handleApiError(error);
  }
}
