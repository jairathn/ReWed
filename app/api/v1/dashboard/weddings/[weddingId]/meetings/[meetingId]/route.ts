import { NextRequest } from 'next/server';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { requireWeddingAccess } from '@/lib/dashboard-auth';

async function ensureMeetingOwned(weddingId: string, meetingId: string) {
  const pool = getPool();
  const row = await pool.query(
    `SELECT id FROM meetings WHERE id = $1 AND wedding_id = $2`,
    [meetingId, weddingId]
  );
  if (row.rows.length === 0) throw new AppError('WEDDING_NOT_FOUND');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string; meetingId: string }> }
) {
  try {
    const { weddingId, meetingId } = await params;
    await requireWeddingAccess(request, weddingId);
    await ensureMeetingOwned(weddingId, meetingId);

    const pool = getPool();
    const meeting = await pool.query(
      `SELECT id, title, meeting_date, raw_notes, created_by_role, created_by_label, created_at
       FROM meetings WHERE id = $1`,
      [meetingId]
    );

    const stakeholders = await pool.query(
      `SELECT v.id, v.name, v.category
       FROM meeting_stakeholders ms
       JOIN vendors v ON v.id = ms.vendor_id
       WHERE ms.meeting_id = $1
       ORDER BY v.name ASC`,
      [meetingId]
    );

    const todos = await pool.query(
      `SELECT t.id, t.title, t.description, t.due_date, t.priority, t.status,
              t.assigned_to_vendor_id, t.created_at, t.completed_at, t.completed_by_role,
              v.name AS vendor_name
       FROM todos t
       LEFT JOIN vendors v ON v.id = t.assigned_to_vendor_id
       WHERE t.meeting_id = $1
       ORDER BY (t.priority = 'high') DESC, t.created_at ASC`,
      [meetingId]
    );

    return Response.json({
      data: {
        meeting: meeting.rows[0],
        stakeholders: stakeholders.rows,
        todos: todos.rows,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string; meetingId: string }> }
) {
  try {
    const { weddingId, meetingId } = await params;
    await requireWeddingAccess(request, weddingId);
    await ensureMeetingOwned(weddingId, meetingId);

    const pool = getPool();
    await pool.query(`DELETE FROM meetings WHERE id = $1`, [meetingId]);
    return Response.json({ data: { id: meetingId } });
  } catch (error) {
    return handleApiError(error);
  }
}
