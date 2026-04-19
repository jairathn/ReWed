import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';
import { authenticateVendor } from '@/lib/vendor/auth';
import { annotate } from '@/lib/vendor/todo-urgency';
import { handleApiError } from '@/lib/errors';

/**
 * GET /api/v1/v/[slug]/[token]
 * All data the vendor portal needs in one request:
 * - vendor profile (self)
 * - wedding overview (name, date, venue city)
 * - assigned timeline entries, with coordination contacts per entry
 * - full master timeline (read-only)
 * - emergency contacts (from wedding.config)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; token: string }> }
) {
  try {
    const { slug, token } = await params;
    const pool = getPool();
    const ctx = await authenticateVendor(pool, slug, token);

    // Assigned entries — entries this vendor owns via timeline_entry_vendors
    const assignedResult = await pool.query(
      `SELECT te.id, te.event_date, te.event_name, te.time_label, te.sort_order,
              te.action, te.location, te.notes, te.status, te.deadline
       FROM timeline_entries te
       JOIN timeline_entry_vendors tev ON tev.timeline_entry_id = te.id
       WHERE te.wedding_id = $1 AND tev.vendor_id = $2
       ORDER BY te.event_date ASC NULLS LAST, te.sort_order ASC`,
      [ctx.wedding.id, ctx.vendor.id]
    );

    // Coordination contacts: other vendors assigned to the same entries
    let coordContacts: Array<{
      entry_id: string;
      id: string;
      name: string;
      category: string | null;
      phone: string | null;
      whatsapp: boolean;
      email: string | null;
    }> = [];
    if (assignedResult.rows.length > 0) {
      const entryIds = assignedResult.rows.map((r) => r.id);
      const coordResult = await pool.query(
        `SELECT tev.timeline_entry_id AS entry_id, v.id, v.name, v.category,
                v.phone, v.whatsapp, v.email
         FROM timeline_entry_vendors tev
         JOIN vendors v ON v.id = tev.vendor_id
         WHERE tev.timeline_entry_id = ANY($1::uuid[])
           AND v.id <> $2`,
        [entryIds, ctx.vendor.id]
      );
      coordContacts = coordResult.rows;
    }

    // Full master timeline (read-only)
    const masterResult = await pool.query(
      `SELECT te.id, te.event_date, te.event_name, te.time_label, te.sort_order,
              te.action, te.location, te.notes, te.status, te.deadline,
              COALESCE(
                array_agg(v.name) FILTER (WHERE v.name IS NOT NULL),
                ARRAY[]::text[]
              ) AS vendor_names
       FROM timeline_entries te
       LEFT JOIN timeline_entry_vendors tev ON tev.timeline_entry_id = te.id
       LEFT JOIN vendors v ON v.id = tev.vendor_id
       WHERE te.wedding_id = $1
       GROUP BY te.id
       ORDER BY te.event_date ASC NULLS LAST, te.sort_order ASC`,
      [ctx.wedding.id]
    );

    const emergencyContacts = Array.isArray(ctx.wedding.config.emergency_contacts)
      ? ctx.wedding.config.emergency_contacts
      : [];

    // To-dos assigned to this vendor (from meeting digestion or manual create).
    const todoResult = await pool.query(
      `SELECT t.id, t.title, t.description, t.due_date, t.priority, t.status,
              t.created_at, t.completed_at, t.completed_by_role,
              m.title AS meeting_title, m.meeting_date
       FROM todos t
       LEFT JOIN meetings m ON m.id = t.meeting_id
       WHERE t.wedding_id = $1 AND t.assigned_to_vendor_id = $2
       ORDER BY (t.status = 'open') DESC, (t.priority = 'high') DESC,
                t.due_date ASC NULLS LAST, t.created_at DESC`,
      [ctx.wedding.id, ctx.vendor.id]
    );

    type TodoRow = {
      id: string;
      title: string;
      description: string | null;
      due_date: string | null;
      priority: string;
      status: string;
      created_at: string;
      completed_at: string | null;
      completed_by_role: string | null;
      meeting_title: string | null;
      meeting_date: string | null;
    };
    const todos = (todoResult.rows as TodoRow[]).map(annotate);

    return Response.json({
      data: {
        vendor: ctx.vendor,
        wedding: {
          slug: ctx.wedding.slug,
          display_name: ctx.wedding.display_name,
          wedding_date: ctx.wedding.wedding_date,
          venue_city: ctx.wedding.venue_city,
          venue_country: ctx.wedding.venue_country,
        },
        assigned: assignedResult.rows,
        coordination_contacts: coordContacts,
        master_timeline: masterResult.rows,
        emergency_contacts: emergencyContacts,
        todos,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
