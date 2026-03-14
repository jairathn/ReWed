import { NextRequest } from 'next/server';
import { authenticateTravelRequest } from '@/lib/travel/auth';
import { toDateString } from '@/lib/db/format';
import { handleApiError } from '@/lib/errors';

const MATCH_RADIUS_MILES = 100;
// Haversine: 3959 = Earth radius in miles
const EARTH_RADIUS_MILES = 3959;

// GET /api/v1/w/[slug]/travel/overlaps — find nearby date overlaps for current guest
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { pool, weddingId, guestId } = await authenticateTravelRequest(request, slug);

    // Get the current guest's stops with coordinates
    const myStops = await pool.query(
      `SELECT ts.city, ts.country, ts.arrive_date, ts.depart_date,
              ts.latitude, ts.longitude
       FROM travel_stops ts
       JOIN travel_plans tp ON ts.plan_id = tp.id
       WHERE tp.wedding_id = $1 AND tp.guest_id = $2
         AND ts.stop_type NOT IN ('arrival', 'departure')
         AND ts.arrive_date IS NOT NULL AND ts.depart_date IS NOT NULL
         AND ts.latitude IS NOT NULL AND ts.longitude IS NOT NULL`,
      [weddingId, guestId]
    );

    if (myStops.rows.length === 0) {
      return Response.json({ data: { overlaps: [] } });
    }

    // Find other guests within 100 miles with overlapping dates
    const overlaps = [];

    for (const myStop of myStops.rows) {
      const othersResult = await pool.query(
        `SELECT g.display_name, ts.city, ts.country,
                ts.arrive_date, ts.depart_date, ts.open_to_meetup,
                (${EARTH_RADIUS_MILES} * acos(
                  LEAST(1.0, cos(radians($3)) * cos(radians(ts.latitude))
                  * cos(radians(ts.longitude) - radians($4))
                  + sin(radians($3)) * sin(radians(ts.latitude)))
                )) AS distance_miles
         FROM travel_stops ts
         JOIN travel_plans tp ON ts.plan_id = tp.id
         JOIN guests g ON tp.guest_id = g.id
         WHERE ts.wedding_id = $1
           AND tp.guest_id != $2
           AND tp.visibility != 'private'
           AND ts.stop_type NOT IN ('arrival', 'departure')
           AND ts.arrive_date IS NOT NULL AND ts.depart_date IS NOT NULL
           AND ts.latitude IS NOT NULL AND ts.longitude IS NOT NULL
           AND ts.arrive_date <= $6
           AND ts.depart_date >= $5
           AND (${EARTH_RADIUS_MILES} * acos(
             LEAST(1.0, cos(radians($3)) * cos(radians(ts.latitude))
             * cos(radians(ts.longitude) - radians($4))
             + sin(radians($3)) * sin(radians(ts.latitude)))
           )) <= ${MATCH_RADIUS_MILES}
         ORDER BY distance_miles`,
        [weddingId, guestId, myStop.latitude, myStop.longitude, myStop.arrive_date, myStop.depart_date]
      );

      if (othersResult.rows.length > 0) {
        overlaps.push({
          city: myStop.city,
          country: myStop.country,
          your_dates: {
            arrive: toDateString(myStop.arrive_date),
            depart: toDateString(myStop.depart_date),
          },
          overlapping_guests: othersResult.rows.map((r) => ({
            display_name: r.display_name,
            their_city: r.city,
            their_country: r.country,
            arrive_date: toDateString(r.arrive_date),
            depart_date: toDateString(r.depart_date),
            open_to_meetup: r.open_to_meetup,
            distance_miles: Math.round(r.distance_miles),
          })),
        });
      }
    }

    return Response.json({ data: { overlaps } });
  } catch (error) {
    return handleApiError(error);
  }
}
