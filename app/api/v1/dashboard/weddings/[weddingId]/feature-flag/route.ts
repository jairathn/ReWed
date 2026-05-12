import { NextRequest } from 'next/server';
import { handleApiError } from '@/lib/errors';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { isFlagEnabled } from '@/lib/feature-flags';

/**
 * GET /api/v1/dashboard/weddings/[weddingId]/feature-flag?flag=<name>
 *
 * Returns { enabled: boolean } for the given flag. Reads
 * weddings.package_config.feature_flags[flag] with an env-default fallback.
 * Read-only — flag setters are admin-only and not exposed yet.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const flag = new URL(request.url).searchParams.get('flag');
    if (!flag) {
      return Response.json({ data: { enabled: false } });
    }
    const enabled = await isFlagEnabled(weddingId, flag);
    return Response.json({ data: { enabled, flag } });
  } catch (error) {
    return handleApiError(error);
  }
}
