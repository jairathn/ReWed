import { NextRequest } from 'next/server';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { requireWeddingAccess } from '@/lib/dashboard-auth';
import { parseWeddingExcel } from '@/lib/vendor/excel-parser';
import { syncTimelineFromParsedExcel } from '@/lib/vendor/sync';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    await requireWeddingAccess(request, weddingId);

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      throw new AppError('VALIDATION_ERROR', 'Missing file upload');
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new AppError('VALIDATION_ERROR', 'File exceeds 10 MB limit');
    }
    if (!/\.xlsx?$/i.test(file.name)) {
      throw new AppError('VALIDATION_ERROR', 'File must be .xlsx');
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseWeddingExcel(buffer);

    if (parsed.vendors.length === 0 && parsed.timeline.length === 0) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Could not read any vendors or timeline rows. Expected sheets "Basic Info - Venues & Vendors" and "Master Timeline".'
      );
    }

    const pool = getPool();
    const result = await syncTimelineFromParsedExcel(pool, weddingId, parsed);

    return Response.json({
      data: {
        vendors_synced: result.vendorCount,
        entries_synced: result.entryCount,
        unmatched_vendor_references: result.unmatchedVendors,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
