import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { requireWeddingAccess } from '@/lib/dashboard-auth';
import { extractTodosFromNotes, resolveAssignees } from '@/lib/vendor/meetings';

const createSchema = z.object({
  title: z.string().min(1).max(300),
  meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  raw_notes: z.string().min(10).max(50000),
  stakeholder_vendor_ids: z.array(z.string().uuid()).default([]),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    await requireWeddingAccess(request, weddingId);

    const pool = getPool();
    const meetings = await pool.query(
      `SELECT id, title, meeting_date, created_by_role, created_by_label, created_at,
              (SELECT COUNT(*)::int FROM todos t WHERE t.meeting_id = meetings.id) AS todo_count
       FROM meetings WHERE wedding_id = $1
       ORDER BY meeting_date DESC NULLS LAST, created_at DESC`,
      [weddingId]
    );

    return Response.json({ data: { meetings: meetings.rows } });
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
    const actor = await requireWeddingAccess(request, weddingId);

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }
    const d = parsed.data;

    const pool = getPool();

    // Wedding name (for the AI prompt context)
    const wedding = await pool.query(
      `SELECT display_name FROM weddings WHERE id = $1`,
      [weddingId]
    );
    if (wedding.rows.length === 0) throw new AppError('WEDDING_NOT_FOUND');

    // Validate the stakeholder vendor IDs belong to this wedding.
    let stakeholderRows: Array<{ id: string; name: string; category: string | null }> = [];
    if (d.stakeholder_vendor_ids.length > 0) {
      const valid = await pool.query(
        `SELECT id, name, category FROM vendors
         WHERE wedding_id = $1 AND id = ANY($2::uuid[])`,
        [weddingId, d.stakeholder_vendor_ids]
      );
      stakeholderRows = valid.rows;
    }

    // Insert meeting
    const createdLabel = actor.role === 'planner' ? actor.name || actor.email : null;
    const meetingResult = await pool.query(
      `INSERT INTO meetings (wedding_id, title, meeting_date, raw_notes, created_by_role, created_by_label)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [
        weddingId,
        d.title,
        d.meeting_date ?? null,
        d.raw_notes,
        actor.role,
        createdLabel,
      ]
    );
    const meetingId = meetingResult.rows[0].id;

    // Persist stakeholders
    for (const s of stakeholderRows) {
      await pool.query(
        `INSERT INTO meeting_stakeholders (meeting_id, vendor_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [meetingId, s.id]
      );
    }

    // Run AI extraction
    const extracted = await extractTodosFromNotes({
      weddingName: wedding.rows[0].display_name,
      meetingTitle: d.title,
      meetingDate: d.meeting_date ?? null,
      stakeholders: stakeholderRows.map((s) => ({ name: s.name, category: s.category })),
      rawNotes: d.raw_notes,
    });
    const resolved = resolveAssignees(
      extracted,
      stakeholderRows.map((s) => ({ id: s.id, name: s.name }))
    );

    // Persist to-dos
    const insertedTodos: Array<{ id: string; assigned_to_vendor_id: string | null; title: string }> = [];
    for (const todo of resolved) {
      const ins = await pool.query(
        `INSERT INTO todos
           (wedding_id, meeting_id, assigned_to_vendor_id, title, description, due_date, priority)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, assigned_to_vendor_id, title`,
        [
          weddingId,
          meetingId,
          todo.vendor_id,
          todo.title,
          todo.description,
          todo.due_date,
          todo.priority,
        ]
      );
      insertedTodos.push(ins.rows[0]);
    }

    return Response.json({
      data: {
        meeting: { id: meetingId, created_at: meetingResult.rows[0].created_at },
        todos_generated: insertedTodos.length,
        todos: insertedTodos,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
