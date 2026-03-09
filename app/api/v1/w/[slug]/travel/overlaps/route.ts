import { NextRequest } from 'next/server';
import { authenticateTravelRequest } from '@/lib/travel/auth';
import { handleApiError } from '@/lib/errors';

// GET /api/v1/w/[slug]/travel/overlaps — find date overlaps for current guest
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { pool, weddingId, guestId } = await authenticateTravelRequest(request, slug);

    // Get the current guest's stops (non-arrival/departure)
    const myStops = await pool.query(
      `SELECT ts.city, ts.country, ts.arrive_date, ts.depart_date
       FROM travel_stops ts
       JOIN travel_plans tp ON ts.plan_id = tp.id
       WHERE tp.wedding_id = $1 AND tp.guest_id = $2
         AND ts.stop_type NOT IN ('arrival', 'departure')
         AND ts.arrive_date IS NOT NULL AND ts.depart_date IS NOT NULL`,
      [weddingId, guestId]
    );

    if (myStops.rows.length === 0) {
      return Response.json({ data: { overlaps: [] } });
    }

    // Find other guests in the same cities with overlapping dates
    const overlaps = [];

    for (const myStop of myStops.rows) {
      const othersResult = await pool.query(
        `SELECT g.display_name, ts.arrive_date, ts.depart_date, ts.open_to_meetup
         FROM travel_stops ts
         JOIN travel_plans tp ON ts.plan_id = tp.id
         JOIN guests g ON tp.guest_id = g.id
         WHERE ts.wedding_id = $1
           AND tp.guest_id != $2
           AND tp.visibility != 'private'
           AND ts.city = $3
           AND ts.country = $4
           AND ts.arrive_date IS NOT NULL AND ts.depart_date IS NOT NULL
           AND ts.arrive_date <= $6
           AND ts.depart_date >= $5`,
        [weddingId, guestId, myStop.city, myStop.country, myStop.arrive_date, myStop.depart_date]
      );

      if (othersResult.rows.length > 0) {
        overlaps.push({
          city: myStop.city,
          country: myStop.country,
          your_dates: {
            arrive: myStop.arrive_date,
            depart: myStop.depart_date,
          },
          overlapping_guests: othersResult.rows.map((r) => ({
            display_name: r.display_name,
            arrive_date: r.arrive_date,
            depart_date: r.depart_date,
            open_to_meetup: r.open_to_meetup,
          })),
        });
      }
    }

    return Response.json({ data: { overlaps } });
  } catch (error) {
    return handleApiError(error);
  }
}
