import { NextRequest } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
import { getCdnUrl } from '@/lib/storage/r2';
import { checkPortraitQuota } from '@/lib/ai/quota';
import { getOpenAIClient, AI_PORTRAIT_STYLES, IMAGE_MODEL, type PortraitStyleId } from '@/lib/ai/openai';
import { AppError, handleApiError } from '@/lib/errors';
import { isTestMode } from '@/lib/env';

const generateSchema = z.object({
  source_upload_id: z.string().uuid(),
  style_id: z.string().refine(
    (v) => v in AI_PORTRAIT_STYLES,
    'Invalid portrait style'
  ),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
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

    // Validate request body
    const body = await request.json();
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }

    const { source_upload_id, style_id } = parsed.data;

    // Check AI portraits feature is enabled
    const weddingResult = await pool.query(
      `SELECT id, package_config, status FROM weddings WHERE slug = $1`,
      [slug]
    );
    if (weddingResult.rows.length === 0) {
      throw new AppError('WEDDING_NOT_FOUND');
    }
    const wedding = weddingResult.rows[0];
    if (wedding.id !== session.weddingId) {
      throw new AppError('AUTH_NOT_REGISTERED');
    }

    const perGuestLimit = wedding.package_config?.ai_portraits_per_guest || 5;

    // Check quota using a pool client for transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const quota = await checkPortraitQuota(client, {
        weddingId: session.weddingId,
        guestId: session.guestId,
        perGuestLimit,
      });

      if (!quota.allowed) {
        throw new AppError('AI_QUOTA_GUEST', quota.message);
      }

      // Verify source upload exists and belongs to this guest
      const uploadResult = await client.query(
        `SELECT id, storage_key, type FROM uploads
         WHERE id = $1 AND wedding_id = $2 AND guest_id = $3 AND status = 'ready'`,
        [source_upload_id, session.weddingId, session.guestId]
      );
      if (uploadResult.rows.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'Source photo not found');
      }
      if (uploadResult.rows[0].type !== 'photo') {
        throw new AppError('VALIDATION_ERROR', 'Source must be a photo');
      }

      const sourceKey = uploadResult.rows[0].storage_key;

      // Create AI job
      const jobId = uuidv4();
      await client.query(
        `INSERT INTO ai_jobs (id, wedding_id, guest_id, type, style_id, input_key, status, metadata)
         VALUES ($1, $2, $3, 'portrait', $4, $5, 'queued', $6)`,
        [jobId, session.weddingId, session.guestId, style_id, sourceKey, JSON.stringify({ source_upload_id })]
      );

      await client.query('COMMIT');

      // Start generation asynchronously (non-blocking)
      processPortraitJob(jobId, session.weddingId, session.guestId, sourceKey, style_id as PortraitStyleId).catch(
        (err) => console.error('Portrait generation failed:', err)
      );

      return Response.json({
        data: {
          job_id: jobId,
          status: 'queued',
          style: AI_PORTRAIT_STYLES[style_id as PortraitStyleId],
          quota: {
            remaining: quota.remaining - 1,
            used: quota.used + 1,
          },
        },
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    return handleApiError(error);
  }
}

async function processPortraitJob(
  jobId: string,
  weddingId: string,
  guestId: string,
  inputKey: string,
  styleId: PortraitStyleId
) {
  const pool = getPool();

  try {
    // Mark as processing
    await pool.query(
      `UPDATE ai_jobs SET status = 'processing', started_at = NOW() WHERE id = $1`,
      [jobId]
    );

    const style = AI_PORTRAIT_STYLES[styleId];
    let outputUrl: string;

    if (isTestMode()) {
      // Mock response in test mode
      outputUrl = `https://mock-cdn.example.com/ai/${jobId}/output.png`;
    } else {
      const openai = getOpenAIClient();
      const sourceUrl = getCdnUrl(inputKey);

      // Fetch source image as buffer for OpenAI API
      const imageResponse = await fetch(sourceUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch source image: ${imageResponse.status}`);
      }
      const imageBlob = await imageResponse.blob();
      const imageFile = new File([imageBlob], 'source.png', { type: 'image/png' });

      const response = await openai.images.edit({
        model: IMAGE_MODEL,
        image: imageFile,
        prompt: style.prompt,
        size: '1024x1024' as const,
      });

      outputUrl = response.data?.[0]?.url || '';
      if (!outputUrl) {
        throw new Error('No image URL returned from OpenAI');
      }
    }

    // Store result
    const outputKey = `weddings/${weddingId}/ai/${jobId}/output.png`;

    await pool.query(
      `UPDATE ai_jobs
       SET status = 'completed', output_key = $1, completed_at = NOW(), cost_cents = 4
       WHERE id = $2`,
      [outputKey, jobId]
    );

    // Update wedding portrait counter
    await pool.query(
      `UPDATE weddings SET ai_portraits_used = ai_portraits_used + 1 WHERE id = $1`,
      [weddingId]
    );
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    await pool.query(
      `UPDATE ai_jobs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`,
      [errMessage, jobId]
    );
  }
}
