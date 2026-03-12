import { NextRequest } from 'next/server';
import { env } from '@/lib/env';

interface GeoNamesResult {
  geonameId: number;
  name: string;
  countryCode: string;
  countryName: string;
  adminName1: string;
  lat: string;
  lng: string;
  population: number;
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return Response.json({ data: { cities: [] } });
  }

  const username = env.GEONAMES_USERNAME;
  if (!username) {
    return Response.json(
      { error: { code: 'GEOCODING_NOT_CONFIGURED', message: 'City search is not configured' } },
      { status: 503 }
    );
  }

  try {
    const params = new URLSearchParams({
      name_startsWith: q,
      featureClass: 'P',
      maxRows: '8',
      orderby: 'population',
      style: 'LONG',
      username,
    });

    const res = await fetch(
      `https://secure.geonames.org/searchJSON?${params}`,
      { next: { revalidate: 3600 } } // Cache results for 1 hour
    );

    if (!res.ok) {
      throw new Error(`GeoNames returned ${res.status}`);
    }

    const data = await res.json();

    const cities = (data.geonames || []).map((g: GeoNamesResult) => ({
      geoname_id: g.geonameId,
      city: g.name,
      region: g.adminName1 || null,
      country: g.countryName,
      country_code: g.countryCode,
      latitude: parseFloat(g.lat),
      longitude: parseFloat(g.lng),
      population: g.population,
    }));

    return Response.json({ data: { cities } });
  } catch (err) {
    console.error('GeoNames search error:', err);
    return Response.json(
      { error: { code: 'GEOCODING_ERROR', message: 'City search failed' } },
      { status: 502 }
    );
  }
}
