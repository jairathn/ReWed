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

// "50% 30%" or "center top" — CSS object-position value. We just cap the
// length and reject obvious junk; the guest UI safely ignores unknown values.
const objectPosition = z
  .string()
  .max(40)
  .regex(/^[0-9a-zA-Z%.\s-]+$/, 'Invalid focal point value');

const cropSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  zoom: z.number().min(1).max(3),
});

const updateSchema = z.object({
  knowledge_base: z.string().max(50000).optional(),
  wedding_planner_name: z.string().max(200).optional().or(z.literal('')),
  wedding_planner_email: z.string().email().optional().or(z.literal('')),
  home_schedule_image: imagePathOrUrl.optional(),
  home_schedule_position: objectPosition.optional(),
  home_schedule_crop: cropSchema.optional(),
  home_travel_image: imagePathOrUrl.optional(),
  home_travel_position: objectPosition.optional(),
  home_travel_crop: cropSchema.optional(),
  guest_background_image: imagePathOrUrl.optional(),
  guest_background_opacity: z.number().min(0).max(1).optional(),
});

interface NormalizedImage {
  url: string;
  position: string;
  crop?: { x: number; y: number; zoom: number };
}

/**
 * Coerce stored home_card_images.* values into the normalized shape — handles
 * legacy string-only rows from before the crop editor shipped.
 */
function normalizeImage(raw: unknown): NormalizedImage {
  if (!raw) return { url: '', position: '50% 50%' };
  if (typeof raw === 'string') return { url: raw, position: '50% 50%' };
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const result: NormalizedImage = {
      url: typeof obj.url === 'string' ? obj.url : '',
      position:
        typeof obj.position === 'string' && obj.position
          ? (obj.position as string)
          : '50% 50%',
    };
    if (obj.crop && typeof obj.crop === 'object') {
      const c = obj.crop as Record<string, unknown>;
      if (
        typeof c.x === 'number' &&
        typeof c.y === 'number' &&
        typeof c.zoom === 'number'
      ) {
        result.crop = { x: c.x, y: c.y, zoom: c.zoom };
      }
    }
    return result;
  }
  return { url: '', position: '50% 50%' };
}

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
        schedule: normalizeImage(config.home_card_images?.schedule),
        travel: normalizeImage(config.home_card_images?.travel),
      },
      guest_background: {
        url: config.guest_background?.url || '',
        opacity: typeof config.guest_background?.opacity === 'number' ? config.guest_background.opacity : 0.08,
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
      parsed.home_schedule_position !== undefined ||
      parsed.home_schedule_crop !== undefined ||
      parsed.home_travel_image !== undefined ||
      parsed.home_travel_position !== undefined ||
      parsed.home_travel_crop !== undefined
    ) {
      // Normalize any existing values (handles legacy string-only rows).
      const existingSchedule = normalizeImage(config.home_card_images?.schedule);
      const existingTravel = normalizeImage(config.home_card_images?.travel);

      const scheduleUrl =
        parsed.home_schedule_image !== undefined
          ? parsed.home_schedule_image.trim()
          : existingSchedule.url;
      const schedulePosition =
        parsed.home_schedule_position !== undefined
          ? parsed.home_schedule_position.trim() || '50% 50%'
          : existingSchedule.position;
      const scheduleCrop =
        parsed.home_schedule_crop !== undefined
          ? parsed.home_schedule_crop
          : existingSchedule.crop;

      const travelUrl =
        parsed.home_travel_image !== undefined
          ? parsed.home_travel_image.trim()
          : existingTravel.url;
      const travelPosition =
        parsed.home_travel_position !== undefined
          ? parsed.home_travel_position.trim() || '50% 50%'
          : existingTravel.position;
      const travelCrop =
        parsed.home_travel_crop !== undefined
          ? parsed.home_travel_crop
          : existingTravel.crop;

      const images: Record<string, NormalizedImage | null> = {};
      images.schedule = scheduleUrl
        ? { url: scheduleUrl, position: schedulePosition, ...(scheduleCrop && { crop: scheduleCrop }) }
        : null;
      images.travel = travelUrl
        ? { url: travelUrl, position: travelPosition, ...(travelCrop && { crop: travelCrop }) }
        : null;

      if (!images.schedule && !images.travel) {
        delete config.home_card_images;
      } else {
        config.home_card_images = images;
      }
    }

    if (
      parsed.guest_background_image !== undefined ||
      parsed.guest_background_opacity !== undefined
    ) {
      const existing = config.guest_background || {};
      const bgUrl =
        parsed.guest_background_image !== undefined
          ? parsed.guest_background_image.trim()
          : existing.url || '';
      const bgOpacity =
        parsed.guest_background_opacity !== undefined
          ? parsed.guest_background_opacity
          : typeof existing.opacity === 'number'
            ? existing.opacity
            : 0.08;

      if (bgUrl) {
        config.guest_background = { url: bgUrl, opacity: bgOpacity };
      } else {
        delete config.guest_background;
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
        schedule: normalizeImage(config.home_card_images?.schedule),
        travel: normalizeImage(config.home_card_images?.travel),
      },
      guest_background: {
        url: config.guest_background?.url || '',
        opacity: typeof config.guest_background?.opacity === 'number' ? config.guest_background.opacity : 0.08,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
