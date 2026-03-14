import { NextRequest } from 'next/server';
import { authenticateTravelRequest } from '@/lib/travel/auth';
import { toDateString } from '@/lib/db/format';
import { handleApiError } from '@/lib/errors';

// Ride-share matching: finds guests arriving/departing within 2 hours of you

// GET /api/v1/w/[slug]/travel/ride-shares — find guests arriving/departing within 2 hours of you
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { pool, weddingId, guestId } = await authenticateTravelRequest(request, slug);

    // Get the current guest's arrival/departure stops at the wedding destination
    const myStops = await pool.query(
      `SELECT ts.stop_type, ts.arrive_date, ts.depart_date,
              ts.arrive_time, ts.depart_time, ts.city
       FROM travel_stops ts
       JOIN travel_plans tp ON ts.plan_id = tp.id
       WHERE tp.wedding_id = $1 AND tp.guest_id = $2
         AND ts.stop_type IN ('arrival', 'departure')`,
      [weddingId, guestId]
    );

    // Check if current guest has share_transport enabled
    const myPlan = await pool.query(
      `SELECT share_transport FROM travel_plans
       WHERE wedding_id = $1 AND guest_id = $2`,
      [weddingId, guestId]
    );

    if (myStops.rows.length === 0) {
      return Response.json({ data: { ride_shares: [], my_sharing: false } });
    }

    const mySharing = myPlan.rows[0]?.share_transport || false;

    const rideShares = [];

    for (const myStop of myStops.rows) {
      // Determine which time/date to match on
      const isArrival = myStop.stop_type === 'arrival';
      const myDate = isArrival ? myStop.arrive_date : myStop.depart_date;
      const myTime = isArrival ? myStop.arrive_time : myStop.depart_time;

      if (!myDate || !myTime) continue;

      // Find other guests arriving/departing at the same destination on the same date
      // within 2 hours, who have share_transport enabled
      const othersResult = await pool.query(
        `SELECT g.display_name, g.id AS guest_id,
                ts.stop_type, ts.arrive_date, ts.depart_date,
                ts.arrive_time, ts.depart_time,
                ts.transport_mode, ts.transport_details,
                tp.share_contact, tp.origin_city
         FROM travel_stops ts
         JOIN travel_plans tp ON ts.plan_id = tp.id
         JOIN guests g ON tp.guest_id = g.id
         WHERE ts.wedding_id = $1
           AND tp.guest_id != $2
           AND tp.visibility != 'private'
           AND tp.share_transport = true
           AND ts.stop_type = $3
           AND ts.city = $4
           AND ${isArrival
             ? 'ts.arrive_date = $5 AND ts.arrive_time IS NOT NULL AND ABS(EXTRACT(EPOCH FROM (ts.arrive_time - $6::time))) <= 7200'
             : 'ts.depart_date = $5 AND ts.depart_time IS NOT NULL AND ABS(EXTRACT(EPOCH FROM (ts.depart_time - $6::time))) <= 7200'
           }
         ORDER BY ${isArrival ? 'ts.arrive_time' : 'ts.depart_time'}`,
        [weddingId, guestId, myStop.stop_type, myStop.city, myDate, myTime]
      );

      if (othersResult.rows.length > 0) {
        rideShares.push({
          type: isArrival ? 'arrival' : 'departure',
          your_date: toDateString(myDate),
          your_time: myTime,
          city: myStop.city,
          matches: othersResult.rows.map((r) => ({
            display_name: r.display_name,
            time: isArrival ? r.arrive_time : r.depart_time,
            transport_mode: r.transport_mode,
            transport_details: r.transport_details,
            origin_city: r.origin_city,
            share_contact: r.share_contact,
          })),
        });
      }
    }

    return Response.json({ data: { ride_shares: rideShares, my_sharing: mySharing } });
  } catch (error) {
    return handleApiError(error);
  }
}
