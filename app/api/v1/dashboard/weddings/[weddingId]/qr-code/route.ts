import { NextRequest } from 'next/server';
import { handleApiError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { generateWeddingQrCode, uploadQrCodeToR2 } from '@/lib/qr';
import { getMediaUrl } from '@/lib/storage/r2';

/**
 * GET /api/v1/dashboard/weddings/[weddingId]/qr-code
 * Returns the QR code for the wedding's guest sign-in page.
 * Generates and stores in R2 on first request, returns cached version after.
 *
 * Query params:
 *   format=png  — return raw PNG binary (for download)
 *   format=json — return JSON with CDN URL (default)
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
    const format = request.nextUrl.searchParams.get('format') || 'json';

    // Look up wedding slug and existing QR key
    const wedding = await pool.query(
      'SELECT slug, qr_code_key FROM weddings WHERE id = $1',
      [weddingId]
    );
    const { slug, qr_code_key: existingKey } = wedding.rows[0];

    // If raw PNG requested, generate fresh (always correct even if slug changed)
    if (format === 'png') {
      const pngBuffer = await generateWeddingQrCode(slug);
      return new Response(new Uint8Array(pngBuffer), {
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': `attachment; filename="${slug}-qr-code.png"`,
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }

    // JSON format: return CDN URL, generating + uploading if not yet stored
    let qrKey = existingKey;
    if (!qrKey) {
      const pngBuffer = await generateWeddingQrCode(slug);
      try {
        qrKey = await uploadQrCodeToR2(weddingId, pngBuffer);
        await pool.query('UPDATE weddings SET qr_code_key = $1 WHERE id = $2', [qrKey, weddingId]);
      } catch {
        // R2 not configured — return inline data URL fallback
        const { generateWeddingQrDataUrl } = await import('@/lib/qr');
        const dataUrl = await generateWeddingQrDataUrl(slug);
        return Response.json({
          data: {
            qr_url: dataUrl,
            guest_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/w/${slug}`,
          },
        });
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    return Response.json({
      data: {
        qr_url: await getMediaUrl(qrKey),
        guest_url: `${appUrl}/w/${slug}`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/dashboard/weddings/[weddingId]/qr-code
 * Regenerate the QR code (e.g. after slug change, or for pre-existing weddings).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const pool = getPool();
    const wedding = await pool.query('SELECT slug FROM weddings WHERE id = $1', [weddingId]);
    const { slug } = wedding.rows[0];

    const pngBuffer = await generateWeddingQrCode(slug);

    try {
      const qrKey = await uploadQrCodeToR2(weddingId, pngBuffer);
      await pool.query('UPDATE weddings SET qr_code_key = $1 WHERE id = $2', [qrKey, weddingId]);

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      return Response.json({
        data: {
          qr_url: await getMediaUrl(qrKey),
          guest_url: `${appUrl}/w/${slug}`,
        },
      });
    } catch {
      const { generateWeddingQrDataUrl } = await import('@/lib/qr');
      const dataUrl = await generateWeddingQrDataUrl(slug);
      return Response.json({
        data: {
          qr_url: dataUrl,
          guest_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/w/${slug}`,
        },
      });
    }
  } catch (error) {
    return handleApiError(error);
  }
}
