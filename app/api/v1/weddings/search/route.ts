import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';
import { handleApiError, AppError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q')?.trim() || '';

    if (q.length < 2) {
      throw new AppError('VALIDATION_ERROR', 'Search query must be at least 2 characters');
    }

    const pool = getPool();

    const result = await pool.query(
      `SELECT slug, display_name, wedding_date
       FROM weddings
       WHERE status != 'archived'
         AND (
           display_name ILIKE $1
           OR slug ILIKE $1
         )
       ORDER BY
         CASE WHEN display_name ILIKE $2 THEN 0 ELSE 1 END,
         display_name ASC
       LIMIT 5`,
      [`%${q}%`, `${q}%`]
    );

    return Response.json({
      data: {
        weddings: result.rows.map((w: { slug: string; display_name: string; wedding_date: string | null }) => ({
          slug: w.slug,
          display_name: w.display_name,
          wedding_date: w.wedding_date,
        })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
