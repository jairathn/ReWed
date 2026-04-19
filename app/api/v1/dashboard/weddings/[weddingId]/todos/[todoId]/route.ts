import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { requireWeddingAccess } from '@/lib/dashboard-auth';

const patchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  priority: z.enum(['high', 'normal', 'low']).optional(),
  status: z.enum(['open', 'completed']).optional(),
  assigned_to_vendor_id: z.string().uuid().nullable().optional(),
});

async function ensureTodoOwned(weddingId: string, todoId: string) {
  const pool = getPool();
  const row = await pool.query(
    `SELECT id FROM todos WHERE id = $1 AND wedding_id = $2`,
    [todoId, weddingId]
  );
  if (row.rows.length === 0) throw new AppError('WEDDING_NOT_FOUND');
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string; todoId: string }> }
) {
  try {
    const { weddingId, todoId } = await params;
    const actor = await requireWeddingAccess(request, weddingId);
    await ensureTodoOwned(weddingId, todoId);

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }
    const d = parsed.data;

    const pool = getPool();
    if (d.assigned_to_vendor_id) {
      const check = await pool.query(
        `SELECT id FROM vendors WHERE id = $1 AND wedding_id = $2`,
        [d.assigned_to_vendor_id, weddingId]
      );
      if (check.rows.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'Unknown vendor');
      }
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    const fields = ['title', 'description', 'due_date', 'priority', 'assigned_to_vendor_id'] as const;
    for (const f of fields) {
      if (d[f] !== undefined) {
        updates.push(`${f} = $${i++}`);
        values.push(d[f]);
      }
    }

    if (d.status !== undefined) {
      updates.push(`status = $${i++}`);
      values.push(d.status);
      if (d.status === 'completed') {
        updates.push(`completed_at = NOW()`);
        updates.push(`completed_by_role = $${i++}`);
        values.push(actor.role);
      } else {
        updates.push(`completed_at = NULL`);
        updates.push(`completed_by_role = NULL`);
      }
    }

    if (updates.length === 0) {
      return Response.json({ data: { id: todoId } });
    }

    values.push(todoId);
    await pool.query(`UPDATE todos SET ${updates.join(', ')} WHERE id = $${i}`, values);

    return Response.json({ data: { id: todoId } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string; todoId: string }> }
) {
  try {
    const { weddingId, todoId } = await params;
    await requireWeddingAccess(request, weddingId);
    await ensureTodoOwned(weddingId, todoId);

    const pool = getPool();
    await pool.query(`DELETE FROM todos WHERE id = $1`, [todoId]);
    return Response.json({ data: { id: todoId } });
  } catch (error) {
    return handleApiError(error);
  }
}
