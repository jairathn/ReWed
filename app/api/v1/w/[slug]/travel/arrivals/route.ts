import { NextRequest } from 'next/server';
import { authenticateTravelRequest } from '@/lib/travel/auth';
import { toDateString } from '@/lib/db/format';
import { handleApiError } from '@/lib/errors';

// GET /api/v1/w/[slug]/travel/arrivals — wedding destination arrivals/departures
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { pool, weddingId } = await authenticateTravelRequest(request, slug);

    const result = await pool.query(
      `SELECT
         ts.stop_type, ts.arrive_date, ts.depart_date, ts.arrive_time, ts.depart_time,
         ts.transport_mode, ts.transport_details,
         g.id AS guest_id, g.display_name,
         tp.share_transport, tp.origin_city
       FROM travel_stops ts
       JOIN travel_plans tp ON ts.plan_id = tp.id
       JOIN guests g ON tp.guest_id = g.id
       WHERE ts.wedding_id = $1
         AND tp.visibility != 'private'
         AND ts.stop_type IN ('arrival', 'departure')
       ORDER BY ts.arrive_date ASC, ts.arrive_time ASC`,
      [weddingId]
    );

    const arrivals = result.rows.map((row) => ({
      guest_id: row.guest_id,
      display_name: row.display_name,
      stop_type: row.stop_type,
      arrive_date: toDateString(row.arrive_date),
      depart_date: toDateString(row.depart_date),
      arrive_time: row.arrive_time,
      depart_time: row.depart_time,
      transport_mode: row.transport_mode,
      transport_details: row.transport_details,
      share_transport: row.share_transport,
      origin_city: row.origin_city,
    }));

    return Response.json({ data: { arrivals } });
  } catch (error) {
    return handleApiError(error);
  }
}
