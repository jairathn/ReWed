import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';

const createFaqSchema = z.object({
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(2000),
  source: z.enum(['manual', 'zola_import', 'generated']).optional(),
});

const bulkImportSchema = z.object({
  entries: z.array(z.object({
    question: z.string().min(1).max(500),
    answer: z.string().min(1).max(2000),
  })).min(1).max(100),
  source: z.enum(['manual', 'zola_import', 'generated']).optional(),
});

/**
 * GET /api/v1/dashboard/weddings/[weddingId]/faq
 * List all FAQ entries.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const pool = getPool();
    const result = await pool.query(
      `SELECT id, question, answer, source, created_at
       FROM faq_entries WHERE wedding_id = $1
       ORDER BY created_at`,
      [weddingId]
    );

    return Response.json({ entries: result.rows });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/dashboard/weddings/[weddingId]/faq
 *
 * Two modes:
 * - Single: { question, answer } → creates one entry
 * - Bulk:   { entries: [{ question, answer }, ...] } → creates many
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const body = await request.json();
    const pool = getPool();

    // Bulk import mode
    if (body.entries && Array.isArray(body.entries)) {
      const parsed = bulkImportSchema.parse(body);
      const source = parsed.source || 'manual';

      const values: unknown[] = [];
      const placeholders: string[] = [];
      let idx = 1;

      for (const entry of parsed.entries) {
        placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++})`);
        values.push(weddingId, entry.question.trim(), entry.answer.trim(), source);
      }

      const result = await pool.query(
        `INSERT INTO faq_entries (wedding_id, question, answer, source)
         VALUES ${placeholders.join(', ')}
         RETURNING id, question, answer, source, created_at`,
        values
      );

      // Clear FAQ cache so new entries are used for answers
      await pool.query('DELETE FROM faq_cache WHERE wedding_id = $1', [weddingId]);

      return Response.json({ entries: result.rows, count: result.rows.length }, { status: 201 });
    }

    // Single entry mode
    const parsed = createFaqSchema.parse(body);
    const result = await pool.query(
      `INSERT INTO faq_entries (wedding_id, question, answer, source)
       VALUES ($1, $2, $3, $4)
       RETURNING id, question, answer, source, created_at`,
      [weddingId, parsed.question.trim(), parsed.answer.trim(), parsed.source || 'manual']
    );

    // Clear FAQ cache so new entries are used for answers
    await pool.query('DELETE FROM faq_cache WHERE wedding_id = $1', [weddingId]);

    return Response.json({ entry: result.rows[0] }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
