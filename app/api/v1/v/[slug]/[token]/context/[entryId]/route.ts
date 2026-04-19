import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';
import { authenticateVendor } from '@/lib/vendor/auth';
import { handleApiError, AppError } from '@/lib/errors';
import { generateEntryContext, type ContextInput } from '@/lib/vendor/entry-context';

/**
 * GET /api/v1/v/[slug]/[token]/context/[entryId]
 *
 * Returns a 1-2 sentence explanation of what the given timeline entry is
 * for, in the context of the surrounding master timeline and wedding
 * knowledge base. Cached per entry; creates the cache row on miss.
 *
 * The vendor is authenticated via the slug+token path, and we verify the
 * entry is actually assigned to that vendor before answering — so
 * speculative requests for other vendors' entries return 404.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; token: string; entryId: string }> }
) {
  try {
    const { slug, token, entryId } = await params;
    const pool = getPool();
    const ctx = await authenticateVendor(pool, slug, token);

    // Verify the entry is (a) part of this wedding and (b) assigned to this
    // vendor. We pull the neighborhood (same-day entries + their vendor
    // names) at the same time — one query powers the cache-hit path too.
    const entryRes = await pool.query<{
      id: string;
      event_name: string | null;
      event_date: string | null;
      time_label: string | null;
      sort_order: number;
      action: string;
      location: string | null;
      notes: string | null;
    }>(
      `SELECT te.id, te.event_name, te.event_date, te.time_label, te.sort_order,
              te.action, te.location, te.notes
       FROM timeline_entries te
       JOIN timeline_entry_vendors tev ON tev.timeline_entry_id = te.id
       WHERE te.id = $1 AND te.wedding_id = $2 AND tev.vendor_id = $3`,
      [entryId, ctx.wedding.id, ctx.vendor.id]
    );
    if (entryRes.rows.length === 0) {
      throw new AppError('WEDDING_NOT_FOUND', 'Entry not found');
    }
    const target = entryRes.rows[0];

    // Cache hit? Return immediately.
    const cached = await pool.query<{ context: string | null; model: string | null; generated_at: string }>(
      `SELECT context, model, generated_at
       FROM timeline_entry_context
       WHERE timeline_entry_id = $1`,
      [entryId]
    );
    if (cached.rows.length > 0) {
      const row = cached.rows[0];
      return Response.json({
        data: {
          context: row.context || '',
          model: row.model,
          generated_at: row.generated_at,
          cached: true,
        },
      });
    }

    // Pull the neighborhood: entries on the same event_date (or unscheduled
    // if target is also unscheduled). Up to 3 before and 3 after by sort_order.
    const neighborhoodRes = await pool.query<{
      id: string;
      time_label: string | null;
      action: string;
      sort_order: number;
      vendor_names: string[] | null;
    }>(
      `SELECT te.id, te.time_label, te.action, te.sort_order,
              COALESCE(
                array_agg(v.name ORDER BY v.name) FILTER (WHERE v.name IS NOT NULL),
                ARRAY[]::text[]
              ) AS vendor_names
       FROM timeline_entries te
       LEFT JOIN timeline_entry_vendors tev ON tev.timeline_entry_id = te.id
       LEFT JOIN vendors v ON v.id = tev.vendor_id
       WHERE te.wedding_id = $1
         AND (
           ($2::date IS NULL AND te.event_date IS NULL)
           OR te.event_date = $2::date
         )
       GROUP BY te.id
       ORDER BY te.sort_order ASC`,
      [ctx.wedding.id, target.event_date]
    );

    const all = neighborhoodRes.rows;
    const targetIdx = all.findIndex((r) => r.id === target.id);
    const slice = targetIdx >= 0
      ? all.slice(Math.max(0, targetIdx - 3), targetIdx + 4)
      : [];
    const neighborhood = slice.map((n) => ({
      time_label: n.time_label,
      action: n.action,
      vendor_names: n.vendor_names ?? [],
      isTarget: n.id === target.id,
    }));

    // Pull an optional knowledge-base excerpt from the wedding config — this
    // is what the couple pastes into the Knowledge tab. We cap to keep the
    // prompt small.
    const kb = ctx.wedding.config?.knowledge_base;
    const knowledgeExcerpt = typeof kb === 'string' && kb.trim() ? kb.trim().slice(0, 4000) : null;

    const input: ContextInput = {
      weddingName: ctx.wedding.display_name,
      knowledgeExcerpt,
      vendor: { name: ctx.vendor.name, category: ctx.vendor.category },
      target: {
        event_name: target.event_name,
        event_date: target.event_date,
        time_label: target.time_label,
        action: target.action,
        location: target.location,
        notes: target.notes,
      },
      neighborhood,
    };

    const generated = await generateEntryContext(input);

    await pool.query(
      `INSERT INTO timeline_entry_context (timeline_entry_id, wedding_id, context, model)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (timeline_entry_id) DO UPDATE
         SET context = EXCLUDED.context,
             model = EXCLUDED.model,
             generated_at = NOW()`,
      [entryId, ctx.wedding.id, generated.context || null, generated.model]
    );

    return Response.json({
      data: {
        context: generated.context,
        model: generated.model,
        generated_at: new Date().toISOString(),
        cached: false,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
