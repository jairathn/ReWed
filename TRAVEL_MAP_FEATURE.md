# Travel Coordination Feature — "Travel Map"

## The Pitch (for the landing page / feature showcase)

Your guests are flying in from 15 different cities. Half of them are tacking on a vacation — Paris before the wedding, Amalfi Coast after. But they don't know who else is going where.

The Travel Map changes that. Every guest shares where they're traveling, and an interactive map lights up with pins across Europe. Tap a city — "Oh, 6 other guests are in Rome the same week as me." Suddenly people who've never met are coordinating dinners, splitting car rentals, and sharing Airbnbs. Your wedding starts building community before anyone even arrives.

For destination weddings, this is the feature that turns "I'm flying in alone" into "I'm meeting 4 of your college friends in Barcelona the day before."

---

## Two Types of Travelers

### Type A: "Just Flying In" (60-70% of guests)
These guests are traveling directly to the wedding and back home. Their itinerary is simple:
- **Origin city** (where they're flying from)
- **Arrival date/time** at the wedding destination
- **Departure date/time** from the wedding destination
- Optional: flight details, interested in sharing transport from airport

They appear on the map ONLY at their origin city (showing where everyone is coming from) — NOT at the wedding destination (because everyone is going there, it's noise).

### Type B: "Exploring the Region" (30-40% of guests)  
These guests are turning the wedding into a Euro trip. Their itinerary has multiple stops:
- **Origin city** → **Stop 1** (3 nights in Paris) → **Stop 2** (2 nights in Rome) → **Wedding destination** → **Stop 3** (4 nights on Amalfi Coast) → **Home**
- Each stop has: city, arrive date, depart date, optional notes
- Optional: flight/train details, open to meetups flag

They appear on the map at EVERY stop EXCEPT the wedding destination.

### Why Exclude the Wedding Destination?
Everyone is going to Barcelona. Showing 200 pins in Barcelona adds zero information and drowns out the interesting data (who else is in YOUR other cities). The wedding destination is implicit — it's the event itself. The map is about everything around it.

However, we DO show arrival/departure dates at the wedding destination in a separate "Arrivals & Departures" view — because knowing who lands the same day as you IS useful for airport transport coordination.

---

## Data Model

```sql
-- Travel plans (one per guest per wedding)
CREATE TABLE travel_plans (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id    UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id      UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  plan_type     TEXT NOT NULL CHECK (plan_type IN ('direct', 'exploring')),
  origin_city   TEXT,                    -- "Chicago, IL" or "London, UK"
  origin_lat    DOUBLE PRECISION,
  origin_lng    DOUBLE PRECISION,
  origin_country TEXT,
  share_transport BOOLEAN DEFAULT FALSE, -- open to sharing airport rides
  visibility    TEXT DEFAULT 'full'      -- 'full' (dates+details), 'city_only' (just pins), 'private'
                CHECK (visibility IN ('full', 'city_only', 'private')),
  notes         TEXT,                    -- "Would love to meet up with anyone!"
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(wedding_id, guest_id)
);

CREATE INDEX idx_travel_plans_wedding ON travel_plans(wedding_id);

-- Individual stops in the itinerary
CREATE TABLE travel_stops (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id       UUID NOT NULL REFERENCES travel_plans(id) ON DELETE CASCADE,
  wedding_id    UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  stop_type     TEXT NOT NULL CHECK (stop_type IN (
    'origin',           -- Where they live / flying from
    'pre_wedding',      -- Stop before the wedding
    'arrival',          -- Arriving at the wedding destination
    'departure',        -- Departing the wedding destination
    'post_wedding',     -- Stop after the wedding
    'return'            -- Flying home
  )),
  city          TEXT NOT NULL,           -- "Paris"
  region        TEXT,                    -- "Île-de-France" (optional)
  country       TEXT NOT NULL,           -- "France"
  country_code  TEXT,                    -- "FR" (ISO 3166-1 alpha-2)
  latitude      DOUBLE PRECISION NOT NULL,
  longitude     DOUBLE PRECISION NOT NULL,
  arrive_date   DATE,
  depart_date   DATE,
  arrive_time   TIME,                   -- Optional: "14:30"
  transport_mode TEXT,                   -- 'flight', 'train', 'car', 'bus', 'ferry'
  transport_details TEXT,               -- "UA 123 from ORD, lands 9:15am"
  accommodation TEXT,                   -- "Airbnb in Le Marais" (optional)
  open_to_meetup BOOLEAN DEFAULT TRUE,  -- Flag: want to meet up here?
  notes         TEXT,                   -- "Looking for restaurant recs!"
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_travel_stops_wedding ON travel_stops(wedding_id);
CREATE INDEX idx_travel_stops_plan ON travel_stops(plan_id);
CREATE INDEX idx_travel_stops_city ON travel_stops(wedding_id, city, arrive_date);
-- Geospatial index for map clustering
CREATE INDEX idx_travel_stops_geo ON travel_stops(wedding_id, latitude, longitude);

-- RLS
ALTER TABLE travel_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY travel_plans_tenant ON travel_plans FOR ALL 
  USING (wedding_id = current_setting('app.current_wedding_id')::uuid);
CREATE POLICY travel_stops_tenant ON travel_stops FOR ALL 
  USING (wedding_id = current_setting('app.current_wedding_id')::uuid);
```

---

## API Endpoints

```typescript
// ── GET /api/v1/w/{slug}/travel/map ──
// Returns all non-private travel stops for the map (excluding wedding destination)
// Response: { stops: MapStop[], wedding_destination: { city, country, lat, lng } }
type MapStop = {
  id: string;
  city: string;
  country: string;
  country_code: string;
  latitude: number;
  longitude: number;
  guest_count: number;           // Pre-aggregated: how many guests at this city
  guests: Array<{
    guest_id: string;
    display_name: string;
    arrive_date: string | null;
    depart_date: string | null;
    open_to_meetup: boolean;
    notes: string | null;
    stop_type: string;
    visibility: 'full' | 'city_only';  // If city_only, dates are null
  }>;
};

// ── GET /api/v1/w/{slug}/travel/arrivals ──
// Returns arrival/departure info at the WEDDING destination only
// For airport transport coordination
// Response: { arrivals: ArrivalInfo[] }
type ArrivalInfo = {
  guest_id: string;
  display_name: string;
  arrive_date: string | null;
  arrive_time: string | null;
  depart_date: string | null;
  depart_time: string | null;
  transport_mode: string | null;
  transport_details: string | null;  // "UA 123 from ORD"
  share_transport: boolean;
  origin_city: string | null;
};

// ── GET /api/v1/w/{slug}/travel/my-plan ──
// Returns the current guest's own travel plan for editing
// Response: { plan: TravelPlan | null }

// ── PUT /api/v1/w/{slug}/travel/my-plan ──
// Create or update the current guest's travel plan
// Body: { plan_type, origin_city, stops: TravelStopInput[], visibility, notes }
// Response: { plan: TravelPlan }

// ── GET /api/v1/w/{slug}/travel/overlaps?guest_id={id} ──
// Returns cities where the given guest overlaps with other guests
// (same city, overlapping dates)
// Response: { overlaps: CityOverlap[] }
type CityOverlap = {
  city: string;
  country: string;
  your_dates: { arrive: string; depart: string };
  overlapping_guests: Array<{
    display_name: string;
    arrive_date: string;
    depart_date: string;
    open_to_meetup: boolean;
  }>;
};
```

---

## UX Flow

### Entry Points

1. **After registration**: Soft prompt on home screen — "Traveling to Barcelona? Tell other guests where you'll be and discover who's nearby." Card with a map illustration. Dismissable, reappears once.

2. **Navigation**: Travel Map tab in bottom nav (replaces nothing — it's a 6th tab, or replaces "Events" label with a combined "Travel & Events" section, or lives as a card on the home screen that opens full-screen).

3. **Direct link**: Couple can share `platform.com/w/{slug}/travel` directly.

### Input Flow: "Share Your Travel Plans"

**Step 1: Travel Type**
```
How are you getting to Barcelona?

  ┌─────────────────────────────┐
  │  ✈️  Flying in & out          │
  │  I'm heading straight to    │
  │  the wedding and back home  │
  └─────────────────────────────┘

  ┌─────────────────────────────┐
  │  🗺️  Making a trip of it     │
  │  I'm exploring before or    │
  │  after the wedding          │
  └─────────────────────────────┘
```

**Step 2a: "Flying in & out" (simple)**
```
Where are you flying from?
  [ Chicago, IL, USA          🔍 ]   ← Autocomplete (Google Places / Mapbox)

When do you arrive in Barcelona?
  [ Sept 7, 2026 ]  [ 2:30 PM ]  (optional time)
  
  Flight details (optional):
  [ UA 123 from ORD            ]

When do you leave Barcelona?
  [ Sept 12, 2026 ]  [ 11:00 AM ]

  ☐ I'd share a ride from the airport
  
  [  Save My Travel Plans  →  ]
```

**Step 2b: "Making a trip of it" (multi-stop)**
```
Build your itinerary:

  📍 Flying from
  [ Chicago, IL, USA          🔍 ]
  [ Sept 2, 2026 ]

  ── ✈️ ──────────────────────────

  📍 Stop 1
  [ Paris, France              🔍 ]
  [ Sept 3 ] → [ Sept 6 ]
  ☐ Open to meeting up here
  Notes: [ Looking for restaurant recs! ]

  [ + Add another stop ]

  ── 🚂 ──────────────────────────

  📍 Arriving in Barcelona           ← Auto-populated, not editable
  [ Sept 7, 2026 ]  [ 2:30 PM ]
  Flight: [ UA 123 from CDG         ]
  ☐ I'd share a ride from the airport

  🎉 WEDDING EVENTS (Sept 8-11)      ← Read-only, from schedule

  📍 Departing Barcelona
  [ Sept 12, 2026 ]

  ── 🚗 ──────────────────────────

  📍 Stop 2
  [ Amalfi Coast, Italy        🔍 ]
  [ Sept 12 ] → [ Sept 16 ]
  ☐ Open to meeting up here
  Notes: [ Renting a car, happy to share! ]

  ── ✈️ ──────────────────────────

  📍 Flying home
  [ Sept 16, 2026 ]

  ─────────────────────────────────
  Who can see your plans?
  ○ Full details (dates, notes, transport)
  ○ Cities only (just show which cities, no dates)
  ○ Private (don't show on the map)

  [  Save My Travel Plans  →  ]
```

**Key UX details:**
- City autocomplete uses Google Places or Mapbox Geocoding (returns lat/lng + formatted name)
- Transport mode selector between stops: ✈️ Flight, 🚂 Train, 🚗 Car, 🚌 Bus, ⛴️ Ferry
- The wedding destination arrival/departure is a fixed section in the middle — guests fill in their dates but can't remove it
- "Open to meeting up" is per-stop, defaulting to ON
- Drag-and-drop to reorder stops (or swipe to delete)

### Map View: The Main Experience

**Initial view:** Interactive map of Europe (or the relevant region), centered to show the wedding destination plus all guest stops. The wedding destination is marked with a special icon (heart pin / wedding icon) but has NO guest count — it's just a landmark.

**City clusters:** Each city with guests gets a circular pin. The pin size scales with guest count. Pin color varies by temporal phase:
- Blue-tinted: Pre-wedding stops
- Green-tinted: Post-wedding stops  
- Warm/amber: Origin cities (where people are flying from)

**Cluster content (on tap/click):**
```
┌─────────────────────────────────┐
│  Paris, France                   │
│  6 guests · Sept 3–8            │
│                                  │
│  ┌──────────────────────────┐   │
│  │ 👤 Aditya Sharma          │   │
│  │    Sept 3–6 · ✈️ from ORD  │   │
│  │    "Looking for recs!"     │   │
│  │    🤝 Open to meetup       │   │
│  ├──────────────────────────┤   │
│  │ 👤 Priya Patel             │   │
│  │    Sept 4–7 · 🚂 from LDN │   │
│  │    🤝 Open to meetup       │   │
│  ├──────────────────────────┤   │
│  │ 👤 Vikram Singh            │   │
│  │    Sept 5–8                │   │
│  │    (cities only)           │   │  ← Respects privacy
│  └──────────────────────────┘   │
│                                  │
│  📅 Date overlap:                │
│  Sept 5–6: Aditya, Priya,       │
│  Vikram are all here             │
│                                  │
└─────────────────────────────────┘
```

**The date overlap callout is the magic.** When guests see "3 other people are in your city at the same time," that's the moment they DM each other and plan dinner.

### Timeline Scrubber (optional, premium feel)

Below the map, a horizontal date scrubber spanning the full travel window (e.g., Sept 1 – Sept 20). As you drag it:
- Pins appear/disappear based on which guests are at each city on that date
- Pin sizes pulse as guests arrive/depart
- You can see the "flow" of guests converging on Barcelona and then scattering after

This is technically complex (requires animating MapGL markers per-frame) but visually stunning.

### "Arrivals & Departures" View

A separate tab/section within the travel page, focused specifically on the wedding destination:

```
Arrivals in Barcelona
─────────────────────────
Sept 6 (Thursday)
  👤 Aditya Sharma    2:30 PM  ✈️ UA 123 from ORD   🚗 Sharing ride
  👤 Priya Patel      6:00 PM  ✈️ BA 456 from LHR   🚗 Sharing ride

Sept 7 (Friday)  
  👤 Raj Kapoor       9:15 AM  ✈️ EK 789 from DXB
  👤 Neha Gupta      11:00 AM  🚂 TGV from Paris    
  👤 Meera Iyer      11:00 AM  🚂 TGV from Paris    ← Same train! Highlight this.
  ... 14 more arriving

Sept 8 (Saturday) — Haldi
  👤 Vikram Singh    10:00 AM  ✈️ LH 101 from MUC   🚗 Sharing ride
  ... 8 more arriving

Departures from Barcelona
─────────────────────────
Sept 11 (Tuesday)
  ... 
Sept 12 (Wednesday)
  👤 Aditya Sharma   11:00 AM  ✈️ to Rome
  ...
```

**Key insight:** Group by date, highlight people on the same flight/train, and flag who's open to sharing transport. This is the practical coordination view — "who's landing when I am, can we split a cab?"

### "Your Overlaps" Personalized View

After a guest saves their travel plan, show them a personalized card:

```
┌─────────────────────────────────┐
│  🤝 Your Travel Overlaps         │
│                                  │
│  Paris (Sept 3–6)                │
│  Aditya, Priya, and 2 others    │
│  are there at the same time!    │
│                                  │
│  Barcelona arrival (Sept 7)      │
│  Raj and Neha arrive the same   │
│  day — share a ride?             │
│                                  │
│  Nobody else is heading to       │
│  Amalfi Coast — you'll have it  │
│  to yourselves! 🌊              │
└─────────────────────────────────┘
```

---

## Map Technology

### Recommended: Mapbox GL JS (react-map-gl)

```
npm install react-map-gl mapbox-gl
```

**Why Mapbox over Google Maps:**
- Better visual customization (custom map styles that match the warm aesthetic)
- Built-in clustering (`Supercluster` integration)
- Smoother animations for the timeline scrubber
- Free tier: 50K map loads/month (plenty for weddings)
- Custom map style: warm-toned, muted labels, elegant feel (not the default blue Google Maps look)

**Custom map style:** Create a custom Mapbox style that matches the wedding aesthetic — warm cream/beige land, soft blue water, muted label colors, no highway detail, no POI clutter. The map should feel like a vintage travel illustration, not Google Maps.

### Alternative: Leaflet (free, no API key)

If you want zero vendor dependency:
```
npm install react-leaflet leaflet
```
Use OpenStreetMap tiles with a warm-toned tile layer (CartoDB Positron or a custom style). Less polish than Mapbox but completely free.

---

## Wedding Config Addition

```json
{
  "features": {
    "travel_map": true
  },
  "travel": {
    "destination": {
      "city": "Barcelona",
      "country": "Spain",
      "latitude": 41.3874,
      "longitude": 2.1686,
      "airport_codes": ["BCN"],
      "timezone": "Europe/Madrid"
    },
    "map_center": { "lat": 46.0, "lng": 8.0 },   // Center of Europe
    "map_zoom": 4,                                  // Zoom to show all of Europe
    "travel_window": {
      "earliest": "2026-08-25",                     // 2 weeks before wedding
      "latest": "2026-09-25"                        // 2 weeks after
    }
  }
}
```

---

## Privacy Considerations

1. **Three visibility levels**: Full (dates + details), Cities only (pins without dates), Private (no map presence). Default: Full.
2. **No exact addresses**: Only city-level precision. Never share hotel names or Airbnb links on the map (that's in optional notes, visible only in expanded view).
3. **Flight details are opt-in**: Never required. Useful for transport sharing but completely optional.
4. **Couple can disable the feature entirely** if they don't want travel coordination.
5. **Guest can delete their travel plan at any time.**

---

## Tests

```
tests/
  unit/
    travel/
      travel-plan.test.ts          -- create plan with stops → correct DB records
      travel-plan.test.ts          -- direct plan has only origin + arrival + departure stops
      travel-plan.test.ts          -- exploring plan allows arbitrary pre/post stops
      travel-plan.test.ts          -- wedding destination excluded from map endpoint response
      travel-plan.test.ts          -- city_only visibility hides dates in response
      travel-plan.test.ts          -- private visibility excludes from map entirely
      overlap-detection.test.ts    -- two guests in same city, overlapping dates → overlap detected
      overlap-detection.test.ts    -- two guests in same city, non-overlapping dates → no overlap
      overlap-detection.test.ts    -- same arrival date at destination → flagged for transport sharing
      geocoding.test.ts            -- city input → lat/lng resolved (mocked)
  integration/
    api/
      travel-map.test.ts           -- GET /travel/map returns clustered stops, excludes destination
      travel-map.test.ts           -- stops are scoped to wedding (no cross-wedding leakage)
      travel-plan-crud.test.ts     -- PUT creates plan, GET retrieves it, PUT updates it
      travel-arrivals.test.ts      -- GET /travel/arrivals returns only destination arrivals/departures
      travel-overlaps.test.ts      -- GET /travel/overlaps returns correct overlap data
  e2e/
    travel-flow.spec.ts            -- guest opens travel map → adds "exploring" plan with 3 stops
                                   -- saves → pins appear on map at correct cities
                                   -- clicks Paris pin → sees own name + other guests
                                   -- another guest adds overlapping Paris dates → overlap shown
                                   -- wedding destination has NO guest pins
                                   -- arrivals view shows both guests' Barcelona arrival info
```
