import type { Pool } from 'pg';

type Pg = Pool;

interface SuggestionRow {
  id: string;
  wedding_id: string;
  action_type: 'create_todo' | 'update_todo' | 'update_timeline';
  payload: Record<string, unknown>;
}

const ALLOWED_PRIORITY: ReadonlySet<string> = new Set(['high', 'normal', 'low']);

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function asPriority(v: unknown): 'high' | 'normal' | 'low' {
  const s = typeof v === 'string' ? v.toLowerCase() : '';
  return (ALLOWED_PRIORITY.has(s) ? s : 'normal') as 'high' | 'normal' | 'low';
}

function asDateOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

async function findVendorByHint(
  pool: Pg,
  weddingId: string,
  hint: string | null
): Promise<string | null> {
  if (!hint) return null;
  const lower = hint.toLowerCase().trim();
  if (!lower || lower === 'couple' || lower.includes('bride') || lower.includes('groom')) {
    return null;
  }
  const result = await pool.query(
    `SELECT id, name FROM vendors WHERE wedding_id = $1`,
    [weddingId]
  );
  for (const row of result.rows) {
    const n = (row.name as string).toLowerCase();
    if (n === lower || n.includes(lower) || lower.includes(n)) {
      return row.id as string;
    }
  }
  return null;
}

/**
 * Apply a suggestion to live data. Returns the id of the entity that was
 * created or updated (todo id or timeline_entry id) so we can stash it on
 * the suggestion row for traceability.
 */
export async function applySuggestion(pool: Pg, s: SuggestionRow): Promise<string | null> {
  if (s.action_type === 'create_todo') {
    const title = asString(s.payload.title);
    if (!title) throw new Error('Suggestion is missing a title');
    const description = asString(s.payload.description);
    const due = asDateOrNull(s.payload.due_date);
    const priority = asPriority(s.payload.priority);
    const vendorId = await findVendorByHint(pool, s.wedding_id, asString(s.payload.assignee_hint));

    const ins = await pool.query(
      `INSERT INTO todos (wedding_id, assigned_to_vendor_id, title, description, due_date, priority)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [s.wedding_id, vendorId, title, description, due, priority]
    );
    return ins.rows[0].id as string;
  }

  if (s.action_type === 'update_todo') {
    const match = asString(s.payload.todo_match);
    if (!match) throw new Error('Suggestion is missing todo_match');
    const todo = await pool.query(
      `SELECT id FROM todos
       WHERE wedding_id = $1 AND status = 'open' AND title ILIKE $2
       ORDER BY created_at DESC LIMIT 1`,
      [s.wedding_id, `%${match}%`]
    );
    if (todo.rows.length === 0) throw new Error('No matching open to-do found');
    const todoId = todo.rows[0].id as string;

    const newStatus = asString(s.payload.new_status);
    const newDue = asDateOrNull(s.payload.new_due_date);

    if (newStatus === 'completed') {
      await pool.query(
        `UPDATE todos
         SET status = 'completed', completed_at = NOW(), completed_by_role = 'couple'
         WHERE id = $1`,
        [todoId]
      );
    }
    if (newDue) {
      await pool.query(`UPDATE todos SET due_date = $1 WHERE id = $2`, [newDue, todoId]);
    }
    return todoId;
  }

  if (s.action_type === 'update_timeline') {
    const match = asString(s.payload.entry_match);
    if (!match) throw new Error('Suggestion is missing entry_match');
    const entry = await pool.query(
      `SELECT id FROM timeline_entries
       WHERE wedding_id = $1 AND action ILIKE $2
       ORDER BY event_date ASC NULLS LAST, sort_order ASC LIMIT 1`,
      [s.wedding_id, `%${match}%`]
    );
    if (entry.rows.length === 0) throw new Error('No matching timeline entry found');
    const entryId = entry.rows[0].id as string;

    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    const newTime = asString(s.payload.new_time_label);
    const newLoc = asString(s.payload.new_location);
    const newNotes = asString(s.payload.new_notes);
    if (newTime) { updates.push(`time_label = $${i++}`); values.push(newTime); }
    if (newLoc) { updates.push(`location = $${i++}`); values.push(newLoc); }
    if (newNotes) { updates.push(`notes = $${i++}`); values.push(newNotes); }
    if (updates.length === 0) throw new Error('No applicable timeline fields in payload');
    updates.push(`updated_at = NOW()`);
    values.push(entryId);
    await pool.query(`UPDATE timeline_entries SET ${updates.join(', ')} WHERE id = $${i}`, values);
    return entryId;
  }

  return null;
}
