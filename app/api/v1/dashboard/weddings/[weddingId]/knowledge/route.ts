import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';

// Accept either a full https URL or a site-relative path (e.g. /photo.jpg),
// so couples can paste hosted URLs *or* drop a file in /public and reference
// it directly.
const imagePathOrUrl = z
  .string()
  .max(2000)
  .refine(
    (v) => v === '' || /^https?:\/\//.test(v) || v.startsWith('/'),
    'Must be a full URL or a path starting with /'
  );

const updateSchema = z.object({
  knowledge_base: z.string().max(50000).optional(),
  wedding_planner_name: z.string().max(200).optional().or(z.literal('')),
  wedding_planner_email: z.string().email().optional().or(z.literal('')),
  home_schedule_image: imagePathOrUrl.optional(),
  home_travel_image: imagePathOrUrl.optional(),
});

/**
 * GET /api/v1/dashboard/weddings/[weddingId]/knowledge
 * Returns the couple-editable knowledge base and wedding planner contact
 * stored in the wedding's config JSON.
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
      `SELECT config FROM weddings WHERE id = $1`,
      [weddingId]
    );
    const config = result.rows[0]?.config || {};

    return Response.json({
      knowledge_base: config.knowledge_base || '',
      wedding_planner: {
        name: config.wedding_planner?.name || '',
        email: config.wedding_planner?.email || '',
      },
      home_card_images: {
        schedule: config.home_card_images?.schedule || '',
        travel: config.home_card_images?.travel || '',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/v1/dashboard/weddings/[weddingId]/knowledge
 * Update the wedding's knowledge base and/or wedding planner contact.
 * Merges into config JSONB so other fields are preserved.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const pool = getPool();
    const current = await pool.query(
      `SELECT config FROM weddings WHERE id = $1`,
      [weddingId]
    );
    const config = current.rows[0]?.config || {};

    if (parsed.knowledge_base !== undefined) {
      config.knowledge_base = parsed.knowledge_base;
    }

    if (
      parsed.wedding_planner_name !== undefined ||
      parsed.wedding_planner_email !== undefined
    ) {
      const planner = { ...(config.wedding_planner || {}) };
      if (parsed.wedding_planner_name !== undefined) {
        planner.name = parsed.wedding_planner_name.trim() || null;
      }
      if (parsed.wedding_planner_email !== undefined) {
        planner.email = parsed.wedding_planner_email.trim() || null;
      }
      // If both fields are empty, drop the planner object entirely.
      if (!planner.name && !planner.email) {
        delete config.wedding_planner;
      } else {
        config.wedding_planner = planner;
      }
    }

    if (
      parsed.home_schedule_image !== undefined ||
      parsed.home_travel_image !== undefined
    ) {
      const images = { ...(config.home_card_images || {}) };
      if (parsed.home_schedule_image !== undefined) {
        images.schedule = parsed.home_schedule_image.trim() || null;
      }
      if (parsed.home_travel_image !== undefined) {
        images.travel = parsed.home_travel_image.trim() || null;
      }
      if (!images.schedule && !images.travel) {
        delete config.home_card_images;
      } else {
        config.home_card_images = images;
      }
    }

    await pool.query(
      `UPDATE weddings SET config = $1 WHERE id = $2`,
      [JSON.stringify(config), weddingId]
    );

    return Response.json({
      knowledge_base: config.knowledge_base || '',
      wedding_planner: {
        name: config.wedding_planner?.name || '',
        email: config.wedding_planner?.email || '',
      },
      home_card_images: {
        schedule: config.home_card_images?.schedule || '',
        travel: config.home_card_images?.travel || '',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
