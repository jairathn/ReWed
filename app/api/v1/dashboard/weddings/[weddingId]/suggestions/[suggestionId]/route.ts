import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { requireWeddingAccess } from '@/lib/dashboard-auth';
import { applySuggestion } from '@/lib/google/apply-suggestion';

const patchSchema = z.object({
  action: z.enum(['accept', 'decline']),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string; suggestionId: string }> }
) {
  try {
    const { weddingId, suggestionId } = await params;
    const actor = await requireWeddingAccess(request, weddingId);

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }

    const pool = getPool();
    const row = await pool.query(
      `SELECT id, wedding_id, action_type, payload, status
       FROM suggestions WHERE id = $1 AND wedding_id = $2`,
      [suggestionId, weddingId]
    );
    if (row.rows.length === 0) throw new AppError('WEDDING_NOT_FOUND');
    const suggestion = row.rows[0];

    if (suggestion.status !== 'pending') {
      throw new AppError('VALIDATION_ERROR', 'This suggestion has already been resolved');
    }

    if (parsed.data.action === 'decline') {
      await pool.query(
        `UPDATE suggestions
         SET status = 'declined', resolved_at = NOW(), resolved_by_role = $1
         WHERE id = $2`,
        [actor.role, suggestionId]
      );
      return Response.json({ data: { id: suggestionId, status: 'declined' } });
    }

    // accept — apply the change
    let applied: string | null = null;
    try {
      applied = await applySuggestion(pool, {
        id: suggestion.id,
        wedding_id: suggestion.wedding_id,
        action_type: suggestion.action_type,
        payload: suggestion.payload || {},
      });
    } catch (err) {
      throw new AppError(
        'VALIDATION_ERROR',
        err instanceof Error ? err.message : 'Could not apply suggestion'
      );
    }

    await pool.query(
      `UPDATE suggestions
       SET status = 'accepted', resolved_at = NOW(), resolved_by_role = $1,
           applied_entity_id = $2
       WHERE id = $3`,
      [actor.role, applied, suggestionId]
    );

    return Response.json({
      data: { id: suggestionId, status: 'accepted', applied_entity_id: applied },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
