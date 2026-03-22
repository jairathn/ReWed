import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
import { getMediaUrl } from '@/lib/storage/r2';
import { AppError, handleApiError } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const pool = getPool();

    // Validate guest session
    const sessionToken = request.cookies.get('wedding_session')?.value;
    if (!sessionToken) {
      throw new AppError('AUTH_NOT_REGISTERED');
    }

    const session = await validateSession(pool, sessionToken);
    if (!session) {
      throw new AppError('AUTH_TOKEN_EXPIRED');
    }

    // Fetch job
    const result = await pool.query(
      `SELECT id, status, style_id, output_key, error_message, created_at, completed_at
       FROM ai_jobs
       WHERE id = $1 AND wedding_id = $2 AND guest_id = $3`,
      [jobId, session.weddingId, session.guestId]
    );

    if (result.rows.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Portrait job not found');
    }

    const job = result.rows[0];

    return Response.json({
      data: {
        job_id: job.id,
        status: job.status,
        style_id: job.style_id,
        output_url: job.output_key ? await getMediaUrl(job.output_key) : null,
        error: job.error_message || null,
        created_at: job.created_at,
        completed_at: job.completed_at,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
