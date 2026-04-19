import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getPool } from '@/lib/db/client';
import { authenticateVendor } from '@/lib/vendor/auth';
import { handleApiError, AppError } from '@/lib/errors';

const patchSchema = z.object({
  status: z.enum(['open', 'completed']),
});

/**
 * PATCH /api/v1/v/[slug]/[token]/todos/[todoId]
 * Vendor-side: mark one of *their* to-dos complete (or reopen).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; token: string; todoId: string }> }
) {
  try {
    const { slug, token, todoId } = await params;
    const pool = getPool();
    const ctx = await authenticateVendor(pool, slug, token);

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }

    // Make sure this to-do belongs to this vendor.
    const check = await pool.query(
      `SELECT id FROM todos
       WHERE id = $1 AND wedding_id = $2 AND assigned_to_vendor_id = $3`,
      [todoId, ctx.wedding.id, ctx.vendor.id]
    );
    if (check.rows.length === 0) throw new AppError('WEDDING_NOT_FOUND');

    if (parsed.data.status === 'completed') {
      await pool.query(
        `UPDATE todos
         SET status = 'completed', completed_at = NOW(), completed_by_role = 'vendor'
         WHERE id = $1`,
        [todoId]
      );
    } else {
      await pool.query(
        `UPDATE todos
         SET status = 'open', completed_at = NULL, completed_by_role = NULL
         WHERE id = $1`,
        [todoId]
      );
    }

    return Response.json({ data: { id: todoId, status: parsed.data.status } });
  } catch (error) {
    return handleApiError(error);
  }
}
