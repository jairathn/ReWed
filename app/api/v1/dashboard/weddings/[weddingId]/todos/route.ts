import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { requireWeddingAccess } from '@/lib/dashboard-auth';
import { annotate } from '@/lib/vendor/todo-urgency';

const createSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  priority: z.enum(['high', 'normal', 'low']).default('normal'),
  assigned_to_vendor_id: z.string().uuid().nullable().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    await requireWeddingAccess(request, weddingId);

    const pool = getPool();
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status'); // 'open'|'completed'|null

    const conditions: string[] = ['t.wedding_id = $1'];
    const queryParams: (string | number)[] = [weddingId];
    if (statusFilter === 'open' || statusFilter === 'completed') {
      conditions.push(`t.status = $2`);
      queryParams.push(statusFilter);
    }

    const result = await pool.query(
      `SELECT t.id, t.meeting_id, t.title, t.description, t.due_date, t.priority,
              t.status, t.assigned_to_vendor_id, t.created_at, t.completed_at,
              t.completed_by_role,
              v.name AS vendor_name,
              m.title AS meeting_title, m.meeting_date
       FROM todos t
       LEFT JOIN vendors v ON v.id = t.assigned_to_vendor_id
       LEFT JOIN meetings m ON m.id = t.meeting_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY (t.status = 'open') DESC, (t.priority = 'high') DESC, t.due_date ASC NULLS LAST, t.created_at DESC`,
      queryParams
    );

    type TodoRow = {
      id: string;
      meeting_id: string | null;
      title: string;
      description: string | null;
      due_date: string | null;
      priority: string;
      status: string;
      assigned_to_vendor_id: string | null;
      created_at: string;
      completed_at: string | null;
      completed_by_role: string | null;
      vendor_name: string | null;
      meeting_title: string | null;
      meeting_date: string | null;
    };
    const todos = (result.rows as TodoRow[]).map(annotate);

    // Counts by urgency band — handy for dashboard badges.
    const counts = todos.reduce(
      (acc, t) => {
        if (t.status === 'open') acc[t.urgency] += 1;
        return acc;
      },
      { fresh: 0, yellow: 0, orange: 0, red: 0 }
    );

    return Response.json({ data: { todos, urgency_counts: counts } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    await requireWeddingAccess(request, weddingId);

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
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

    const ins = await pool.query(
      `INSERT INTO todos
         (wedding_id, assigned_to_vendor_id, title, description, due_date, priority)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [
        weddingId,
        d.assigned_to_vendor_id ?? null,
        d.title,
        d.description ?? null,
        d.due_date ?? null,
        d.priority,
      ]
    );

    return Response.json({ data: { id: ins.rows[0].id, created_at: ins.rows[0].created_at } });
  } catch (error) {
    return handleApiError(error);
  }
}
