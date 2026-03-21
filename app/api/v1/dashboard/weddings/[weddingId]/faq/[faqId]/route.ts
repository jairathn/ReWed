import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';

const updateFaqSchema = z.object({
  question: z.string().min(1).max(500).optional(),
  answer: z.string().min(1).max(2000).optional(),
});

/**
 * PUT /api/v1/dashboard/weddings/[weddingId]/faq/[faqId]
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string; faqId: string }> }
) {
  try {
    const { weddingId, faqId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const body = await request.json();
    const parsed = updateFaqSchema.parse(body);
    const pool = getPool();

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (parsed.question !== undefined) {
      sets.push(`question = $${idx++}`);
      values.push(parsed.question.trim());
    }
    if (parsed.answer !== undefined) {
      sets.push(`answer = $${idx++}`);
      values.push(parsed.answer.trim());
    }

    if (sets.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'No fields to update');
    }

    values.push(faqId, weddingId);
    const result = await pool.query(
      `UPDATE faq_entries SET ${sets.join(', ')}
       WHERE id = $${idx++} AND wedding_id = $${idx}
       RETURNING id, question, answer, source, created_at`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('WEDDING_NOT_FOUND', 'FAQ entry not found');
    }

    // Clear FAQ cache so updated answers are used
    await pool.query('DELETE FROM faq_cache WHERE wedding_id = $1', [weddingId]);

    return Response.json({ entry: result.rows[0] });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/dashboard/weddings/[weddingId]/faq/[faqId]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string; faqId: string }> }
) {
  try {
    const { weddingId, faqId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const pool = getPool();
    const result = await pool.query(
      'DELETE FROM faq_entries WHERE id = $1 AND wedding_id = $2 RETURNING id',
      [faqId, weddingId]
    );

    if (result.rows.length === 0) {
      throw new AppError('WEDDING_NOT_FOUND', 'FAQ entry not found');
    }

    // Clear FAQ cache for this wedding when entries change
    await pool.query('DELETE FROM faq_cache WHERE wedding_id = $1', [weddingId]);

    return Response.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
