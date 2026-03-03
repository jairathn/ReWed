import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';
import { handleApiError, AppError } from '@/lib/errors';
import { guestSearchSchema } from '@/lib/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const searchParams = request.nextUrl.searchParams;

    const parsed = guestSearchSchema.safeParse({
      q: searchParams.get('q'),
      limit: searchParams.get('limit') ?? undefined,
    });

    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Search query must be at least 2 characters');
    }

    const { q, limit } = parsed.data;
    const pool = getPool();

    // Resolve slug to wedding_id
    const weddingResult = await pool.query(
      'SELECT id FROM weddings WHERE slug = $1',
      [slug]
    );

    if (weddingResult.rows.length === 0) {
      throw new AppError('WEDDING_NOT_FOUND');
    }

    const weddingId = weddingResult.rows[0].id;

    // Search guests using trigram similarity
    const guestsResult = await pool.query(
      `SELECT id, first_name, last_name
       FROM guests
       WHERE wedding_id = $1
         AND (
           first_name ILIKE $2
           OR last_name ILIKE $2
           OR (first_name || ' ' || last_name) ILIKE $2
         )
       ORDER BY
         CASE WHEN first_name ILIKE $3 THEN 0 ELSE 1 END,
         first_name ASC
       LIMIT $4`,
      [weddingId, `%${q}%`, `${q}%`, limit]
    );

    return Response.json({
      data: {
        guests: guestsResult.rows.map((g: Record<string, string>) => ({
          id: g.id,
          first_name: g.first_name,
          last_name: g.last_name,
        })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
