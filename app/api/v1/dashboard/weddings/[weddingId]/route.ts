import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';

const updateWeddingSchema = z.object({
  timezone: z.string().max(100).optional(),
  venue_city: z.string().max(200).optional(),
  venue_country: z.string().max(200).optional(),
  venue_lat: z.number().min(-90).max(90).optional(),
  venue_lng: z.number().min(-180).max(180).optional(),
  // RSVP link shown on the guest home. Null / empty string clears it.
  // Accepts http(s) or null; we don't try to verify the URL resolves.
  rsvp_url: z
    .string()
    .max(500)
    .url()
    .nullable()
    .optional()
    .or(z.literal('')),
  // Passcode for the external wedding site — copied to clipboard when the
  // guest taps the RSVP button. Plain string; the user sees this themselves.
  rsvp_passcode: z.string().max(100).nullable().optional().or(z.literal('')),
  // Invite link (Canva, Paperless Post, etc.) — separate button on the guest
  // home next to the RSVP button.
  invite_url: z
    .string()
    .max(500)
    .url()
    .nullable()
    .optional()
    .or(z.literal('')),
});

/**
 * PATCH /api/v1/dashboard/weddings/[weddingId]
 * Update wedding-level settings.
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
    const parsed = updateWeddingSchema.parse(body);
    const pool = getPool();

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (parsed.timezone !== undefined) {
      sets.push(`timezone = $${idx++}`);
      values.push(parsed.timezone);
    }
    if (parsed.venue_city !== undefined) {
      sets.push(`venue_city = $${idx++}`);
      values.push(parsed.venue_city);
    }
    if (parsed.venue_country !== undefined) {
      sets.push(`venue_country = $${idx++}`);
      values.push(parsed.venue_country);
    }
    if (parsed.venue_lat !== undefined) {
      sets.push(`venue_lat = $${idx++}`);
      values.push(parsed.venue_lat);
    }
    if (parsed.venue_lng !== undefined) {
      sets.push(`venue_lng = $${idx++}`);
      values.push(parsed.venue_lng);
    }

    // These three all live inside the wedding config JSONB. Empty string and
    // explicit null both clear the field. We build a single merge object and
    // use one `config = config || $N::jsonb` assignment — Postgres rejects
    // assigning the same column multiple times in a single UPDATE.
    const configPatch: Record<string, string | null> = {};
    if (parsed.rsvp_url !== undefined) {
      configPatch.rsvp_url =
        typeof parsed.rsvp_url === 'string' && parsed.rsvp_url.trim()
          ? parsed.rsvp_url.trim()
          : null;
    }
    if (parsed.rsvp_passcode !== undefined) {
      configPatch.rsvp_passcode =
        typeof parsed.rsvp_passcode === 'string' && parsed.rsvp_passcode.trim()
          ? parsed.rsvp_passcode.trim()
          : null;
    }
    if (parsed.invite_url !== undefined) {
      configPatch.invite_url =
        typeof parsed.invite_url === 'string' && parsed.invite_url.trim()
          ? parsed.invite_url.trim()
          : null;
    }
    if (Object.keys(configPatch).length > 0) {
      sets.push(`config = COALESCE(config, '{}'::jsonb) || $${idx++}::jsonb`);
      values.push(JSON.stringify(configPatch));
    }

    if (sets.length === 0) {
      return Response.json({ ok: true });
    }

    values.push(weddingId);
    await pool.query(
      `UPDATE weddings SET ${sets.join(', ')} WHERE id = $${idx}`,
      values
    );

    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
