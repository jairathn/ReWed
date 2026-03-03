# Wedding Guest Experience Platform: Scaling Plan

## The Pitch

You'll spend months planning every detail. The flowers, the venue, the menu, the playlist. But when the day arrives, it moves so fast. You'll miss your college friends wiping away tears during the ceremony. You'll miss your aunt telling your cousin that story about you as a kid. You'll miss the moment your best man rehearsed his speech in the bathroom mirror one last time.

Your photographer captures the ceremony. But who captures the moments between moments -- the ones that happen when 200 people who love you are all in the same room?

**That's what this is.** Every guest becomes part of the story. They record heartfelt video messages. They take photos with artistic filters. They create stunning portraits of themselves. And a few days after the honeymoon starts, something arrives in your inbox: a reel of every person you love, one by one, telling you what you mean to them. Set to the song from your first dance. That's not a video. That's a treasure.

And here's the part nobody else does: **every guest takes home their own reel too.** Their photos, their messages, their portraits -- a personal keepsake from your wedding that they'll rewatch and share for years. Not a printed photo strip that ends up in a drawer. A digital souvenir they'll actually keep forever.

**Compare that to Voast:** They charge $1,600 to set up an iPad at your wedding and create a single video for the couple. You don't even get the raw footage. No guest deliverables. No photos. No portraits. Just one video, for you.

We give you everything -- every photo, every video, every message from every guest -- plus each guest gets their own personalized reel. Starting at a fraction of what Voast charges. It's not even close.

[PLACEHOLDER: Demo video -- 60-second sizzle reel showing the guest experience: scan QR, enter name, record a video toast, take a photo with filters, create a fun portrait, then cut to "3 days later" -- the guest opens an email and watches their personalized reel]

[PLACEHOLDER: Demo video -- 30-second "Couple's Highlight Reel" showing a montage of guest video toasts set to music, ending with "Every message. Every moment. Every guest." text]

---

## Context

The current codebase is a single-wedding guest experience app (Neil & Shriya, Sept 2026) with photo booth, video recording, AI portraits (10 styles via gpt-image-1.5), event-specific photo filters, schedule, gallery, guest directory, and offline-first uploads to Google Drive.

**The goal:** Fork this into a multi-tenant SaaS platform that could serve every wedding in America (~2.5M/year).

**What this is NOT:** A wedding planning tool. Zola and The Knot own that. This is the experience layer -- what happens before, during, and after the events.

**Development approach:** Rebuild from scratch on Next.js 15 App Router. The current codebase (Vite + React SPA) is reference material — we port the business logic (upload queue, camera manager, AI portrait, filters, session handling) but rebuild the framework layer, routing, and API surface. The Neil & Shriya wedding stays on the existing repo. Once the platform is stable, Neil & Shriya become a regular user on the new platform.

---

## What Exists Today (Current State)

| Layer | Current | Key Files |
|-------|---------|-----------|
| Frontend | React 19 + Vite 7 + TypeScript + Tailwind + Framer Motion (→ **migrating to Next.js 15 App Router**) | `src/wedding-app/` |
| Backend | Vercel serverless functions (→ **migrating to Next.js Route Handlers**) | `api/` |
| Database | Neon PostgreSQL (guests, sessions, uploads, ai_jobs, events) | `scripts/migrate.sql` |
| Storage | Google Drive (OAuth2, resumable uploads) | `src/wedding-app/lib/upload-queue.ts`, `api/upload/initiate.ts` |
| AI Portraits | OpenAI gpt-image-1.5, 10 styles via `images.edit` | `api/ai-portrait/generate.ts`, `src/wedding-app/lib/ai-portrait.ts` |
| Photo Filters | 11 CSS/canvas-based filters, event-specific collections | `src/wedding-app/lib/filters.ts`, `constants.ts` |
| Auth | Name-based guest self-identification, localStorage sessions | `src/wedding-app/lib/session.ts` |
| Guest List | Hardcoded JSON (396 names) | `src/data/guests.json` |
| Config | All hardcoded (couple names, events, hashtag, prompts, colors, filters) | `src/wedding-app/constants.ts` |
| Offline | IndexedDB upload queue + service worker for queue-flush | `src/wedding-app/lib/upload-queue.ts` |
| PWA | Static manifest | `public/manifest.json` |

### Hardcoded Wedding-Specific References (must be extracted into dynamic config)
- `constants.ts` lines 34-54: All prompts reference "Neil" and "Shriya" by name
- `constants.ts` lines 136, 175, 215, 277, 286, 295: `#JayWalkingToJairath` hashtag in filter overlays
- `Registration.tsx`: "to Neil & Shriya's Wedding"
- `VideoScreen.tsx`: "for Neil & Shriya"
- `ReviewScreen.tsx`: "Neil & Shriya's Wedding"
- `filters.ts` line 146: `#JayWalkingToJairath` in canvas text overlays
- `manifest.json`: "Neil & Shriya's Wedding"
- `src/data/guests.json`: entire 396-name guest list bundled in frontend

---

## Architecture

### 1. Multi-Tenancy

**URL structure:** `platform.com/w/{slug}/...` (path-based, not subdomains)
- Subdomains break PWA installation (different origins), complicate SSL, and cache poorly
- One shared link per wedding: `platform.com/w/neil-shriya` -- couple shares this via text/email/table cards
- Couple dashboard: `platform.com/dashboard`

**Tenant resolution:** Next.js edge middleware (`middleware.ts`) intercepts every `/w/{slug}/*` request, resolves slug → `wedding_id` (cached in Redis, 5-min TTL), and injects the wedding ID into request headers. API Route Handlers read `wedding_id` from the header. All DB queries include `wedding_id` in WHERE clause — no exceptions. RLS provides defense-in-depth.

**Frontend:** The `app/w/[slug]/layout.tsx` server component fetches wedding config and passes it to a `<WeddingProvider>` client component. This replaces every hardcoded reference — couple names, hashtag, prompts, filter selections, colors, events. Client components consume via `useWeddingConfig()`. Server components receive config as props.

**Data isolation:** Shared database, shared schema, `wedding_id` FK on every tenant-scoped table. Row Level Security (RLS) in PostgreSQL as a defense-in-depth layer. UUIDs everywhere (no auto-increment), no cross-wedding joins. At 50K+ weddings, shard by `wedding_id` hash.

### 2. Storage: Replace Google Drive with Cloudflare R2

**Why R2, not Google Drive:**
- Google Drive requires OAuth per couple (refresh tokens, token rotation)
- Google Drive API rate limits (12K requests/100 seconds)
- Current architecture leaks Google Drive session URIs to client browsers
- Cannot scale to multi-tenant without per-couple auth or a single service account hitting rate limits
- R2: zero egress fees (S3 egress at scale = millions/year), S3-compatible, $0.015/GB/month, native CDN

**Upload flow (replaces Google Drive path in `upload-queue.ts`):**
1. Client requests presigned PUT URL from `POST /api/v1/w/{slug}/upload/presign`
2. Server validates session + wedding, generates presigned URL (15-min TTL)
3. Client uploads directly to R2:
   - Photos: single PUT (no more base64 encoding + proxying through Vercel)
   - Videos: S3 multipart upload (native R2 support, simpler than Google Drive resumable protocol)
4. Client calls `POST /api/v1/w/{slug}/upload/complete` to record metadata in DB
5. Thumbnail generated async (Sharp)

**Storage key structure:**
```
weddings/{wedding_id}/uploads/{year}/{month}/{upload_id}/original.{ext}
weddings/{wedding_id}/uploads/{year}/{month}/{upload_id}/thumb_400.jpg
weddings/{wedding_id}/uploads/{year}/{month}/{upload_id}/transcode_720p.mp4
weddings/{wedding_id}/ai/{job_id}/output.png
```

**Media lifecycle:**
- 0-3 months post-wedding: R2 Standard (hot)
- 3-12 months: R2 Infrequent Access
- 12+ months: reminder email, then archive
- 24+ months: delete for lower packages; preserved for premium
- "Download your memories" export always available before archiving

### 3. Authentication

**Couples (account-based):**
- Email + password (bcrypt), JWT in httpOnly cookies
- Access token (15 min) + refresh token (30 days)
- Optional "Sign in with Google"
- Email verification required

**Guests (name-based, stay logged in):**
- Guest opens the shared wedding link: `platform.com/w/{slug}`
- First visit: enter first name -> autocomplete dropdown from wedding's guest list -> tap name -> session created -> home screen
- Session persists: httpOnly cookie + localStorage fallback, 30-day expiry
- Subsequent visits: auto-logged-in, straight to home screen
- No per-guest QR codes, no tokens, no passwords. Just the name, once.
- Optional: couple can enable SMS verification for name entry (prevents impersonation)

### 4. Database Schema

**New tables:**
- `couples` (email, password_hash, stripe_customer_id)
- `weddings` (slug, display_name, hashtag, config JSONB, package_config JSONB, storage_used, ai_portraits_used)
- `events` (wedding-scoped, replaces hardcoded EVENTS array)
- `subscriptions` (Stripe billing)
- `feed_posts`, `feed_likes`, `feed_comments` (social feed)
- `notifications` (queued SMS/email/push)
- `faq_entries` (Q&A pairs with `VECTOR(1536)` column via pgvector)

**Modifications to existing tables:**
- Every table gets `wedding_id UUID NOT NULL` FK
- Guest `id`: SERIAL -> UUID
- `drive_file_id`/`drive_folder_id` -> `storage_key` (R2 object key)
- Guest table gains: `email`, `phone`, `group_label`, `rsvp_status`

**Wedding config (JSONB on `weddings` table):**
```json
{
  "couple_names": { "name1": "Neil", "name2": "Shriya" },
  "hashtag": "#JayWalkingToJairath",
  "theme": "mediterranean",
  "colors": { "primary": "#C4704B", "secondary": "#2B5F8A", "bg": "#FEFCF9" },
  "fonts": { "heading": "Playfair Display", "body": "DM Sans" },
  "prompts": { "heartfelt": [...], "fun": [...], "quickTakes": [...] },
  "enabled_filters": ["film-grain", "bw-classic", "bollywood-glam", ...],
  "enabled_ai_styles": ["castle-wedding", "bollywood-poster", ...],
  "notification_prefs": { "sms": true, "email": true }
}
```

**Package config (JSONB on `weddings` table):**
```json
{
  "guest_limit": 200,
  "event_limit": 3,
  "storage_gb": 500,
  "ai_portraits_per_guest": 5,
  "deliverables": "all_guests",
  "social_feed": true,
  "faq_chatbot": true,
  "sms_notifications": true,
  "theme_customization": "full",
  "total_price_cents": 49900
}
```

### 5. Features (all ship at launch)

All existing features (photo booth, video recording, AI portraits with gpt-image-1.5, photo filters, schedule, gallery) are already built. They become multi-tenant by reading from wedding config instead of hardcoded constants. New features are added on top.

**Capture experience (existing, made configurable):**
- Photo booth with event-specific filter collections (already built in `constants.ts` + `filters.ts`)
- AI portraits with gpt-image-1.5, 10 styles (already built in `ai-portrait.ts`)
- Video recording with customizable prompts (already built, prompts loaded from config)
- Offline-first IndexedDB upload queue (rewritten for R2 presigned URLs)

**Schedule & logistics (enhanced from existing):**
- Event schedule with venue names, addresses, maps, dress codes, logistics notes
- Couple configures via dashboard; guests see a polished timeline

**Guest onboarding (simplified from existing):**
- Couple shares one link (or prints one QR code for table displays)
- Guest opens link -> types name -> autocomplete -> tap -> logged in forever
- No per-guest QR codes, no tokens, no complexity

**Personal gallery (existing, repointed to R2):**
- Guest's photos, videos, AI portraits served from R2/CDN

**Guest deliverables (new -- the killer feature -- see "Deliverables Deep Dive" section below):**
- Two outputs: (1) Couple's highlight reel (3-5 min, all guest messages + best moments) and (2) Per-guest souvenir reel (60-90 sec, that guest's media + couple's thank-you)
- Composed using Remotion (React-based programmatic video) on Modal
- Couple uploads a soundtrack or picks from royalty-free library
- Couple writes a thank-you letter (or records a video thank-you) that's included in every guest's reel
- Auto-send or manual send, configurable timing (e.g., 3 days post-wedding)
- Delivered via beautiful HTML email with viewing page, download, and share buttons

**Social feed (new -- deliberately subtle):**
- A secondary tab, NOT the home screen. Easy to find, never in your face.
- Simple chronological timeline, cursor-based pagination
- Post types: text, photo+caption, memory ("My favorite story about {couple}")
- Likes and comments (no threading, no algorithms, no push per-post)
- Couple can pin highlights and moderate (hide/delete)
- No notifications for every post -- daily digest at most

**FAQ chatbot (new):**
- Couple imports FAQ from Zola (paste URL or CSV) or types Q&A pairs
- Embedded with `text-embedding-3-small`, stored in pgvector
- Guest asks question -> RAG -> `gpt-4o-mini` generates conversational answer
- Simple chat bubble, not a full screen -- natural and unobtrusive
- Common Q&A cached per wedding (70%+ hit rate)

**Notifications (new):**
- Email (SES, ~free): reminders, schedule changes, deliverable links
- SMS (Twilio, configurable): day-of logistics only ("Bus departs in 15 min")
- PWA push (free): subtle social feed digest
- Couple chooses which notifications; guests can opt out per channel

**CSV import from Zola (new):**
- Upload CSV from Zola/The Knot/spreadsheet
- `gpt-4o-mini` identifies columns, normalizes data
- Review parsed results, one click to confirm

**Couple dashboard (new):**
- Create wedding, set slug, configure theme/colors/fonts
- Import guest list (CSV or manual)
- Configure events, select filters + AI styles, write prompts
- View analytics (registrations, photos, videos, portraits)
- Trigger deliverable generation post-wedding
- Moderate social feed

### 6. AI Portrait Strategy

**Always gpt-image-1.5.** No model tiering, no quality compromise. Every guest gets the same premium quality regardless of package. The cost is managed by caps that the couple explicitly chooses and pays for.

The word "AI" never appears in guest-facing UX. It's "Portrait Studio" or "Fun Portraits."

Custom styles: couple describes a vibe in plain English ("vintage Bollywood movie poster with our names in Hindi") -> system translates to a proper `images.edit` prompt -> couple previews on a sample photo -> enable/disable.

---

## Deliverables Deep Dive: "After the Party"

This is the section that makes people cry. It's the reason guests share the platform with other couples. It's the viral loop.

### What Gets Created

**1. The Couple's Highlight Reel (3-5 minutes)**
Every video toast from every guest, curated and composed into a single cinematic reel. The couple's best friend saying "I knew they were meant to be when..." followed by their grandmother tearing up, followed by the groomsman with the terrible joke. Set to the couple's song. This is the thing they'll rewatch on every anniversary.

This is what Voast sells for $1,600 -- except we do it better because we have EVERY guest's message, not just whoever happened to walk up to a single iPad.

[PLACEHOLDER: Sample couple highlight reel -- 60-second preview showing video toasts from multiple guests, crossfaded with photos, set to emotional music]

**2. The Per-Guest Souvenir Reel (60-90 seconds)**
Nobody else does this. Each guest gets their own personalized reel containing:
- Their video messages (the toasts they recorded for the couple)
- Their best photos from each event
- Their fun portraits (the AI-generated artistic styles)
- A few highlight photos from the event (group shots, candid moments)
- The couple's thank-you message to them specifically
- Set to the same music as the couple's reel (maintains the feeling)

[PLACEHOLDER: Sample guest souvenir reel -- 60-second example showing one guest's photos, video message, portrait, ending with thank-you card from couple]

### How the Reels Are Composed

**Technology: Remotion (React-based programmatic video) on AWS Lambda**

Why Remotion, not raw FFmpeg:
- Video templates are React components -- beautiful typography, branded overlays, smooth animations
- Ken Burns, crossfades (`@remotion/transitions`), text overlays -- all defined in JSX
- `<TransitionSeries>` with `fade()`, `slide()`, `wipe()` presentations built-in
- Audio ducking: per-frame `volume` callback function for frame-accurate music control
- Couple can choose a "reel style" (cinematic, playful, elegant, minimal) -- each is just a different React component/template
- Remotion Studio gives visual preview during development (scrub through frames, debug)
- Hiring: any React developer can build and iterate on templates (vs rare FFmpeg experts)
- Remotion uses FFmpeg internally for final encoding, so codec quality is identical

Why AWS Lambda (via `@remotion/lambda`), not Modal:
- Remotion has first-party Lambda support (`renderMediaOnLambda()`)
- Distributed rendering: a 90-second video is split into chunks, rendered in parallel across many Lambda functions
- Handles scaling and queueing out of the box
- Up to 1,000 concurrent Lambda functions per region (expandable on request)
- At 1,000 reels/day: ~$600-1,500/month in Lambda compute
- Remotion Company License: $100/month flat (unlimited renders)

**Cost: ~$0.02-0.05 per 60-90 second reel** on Lambda. At 200 guests: ~$4-10/wedding. At 1,000 reels/day: ~$750-2,200/month all-in (Lambda + license + S3). This is dramatically cheaper than my earlier estimate and makes per-guest deliverables very viable.

**The goal: reels that feel like a professional editor made them.** Not a slideshow. Not "just stitched together." Something with intelligent pacing, beat-synced transitions, emotional arc, and consistent visual quality -- like what Canva or ClipChamp produce from your raw footage, but fully automated.

**AI-driven curation pipeline (all invisible to the end user):**

**Step 1: Analyze every video clip**
- **Whisper transcription** (OpenAI, $0.006/minute): transcribe every guest's video messages
- **GPT-4o-mini transcript analysis** (~$0.01/guest): read the transcript, score emotional peaks, identify the best quote, the funniest moment, the most tearful line. For a 90-second video toast, the system finds the best 15-20 second highlight segment.
- This is what separates this from a basic slideshow: not every clip makes the reel at full length. The system intelligently extracts the moment that matters.

**Step 2: Analyze every photo**
- **GPT-4o vision scoring** (~$0.03/guest batch call): evaluate every photo for composition, lighting, faces detected, emotional expression, sharpness. Score 1-10.
- **Perceptual hashing** (local, free): detect and deduplicate near-identical photos
- **Auto-select top 10-15**: rank by score, diversify by event (don't put all sangeet photos together)

**Step 3: Beat detection on the music track**
- Library: `aubio` or Web Audio API beat detection (run once per wedding, cache the beat map)
- Output: array of beat timestamps in the track
- Transitions are timed to land ON the beat -- this is what makes it feel cinematic vs amateur

**Step 4: Intelligent sequencing**
- **GPT-4o-mini ordering** (~$0.01/guest): given the analyzed clips and photos, sequence them for maximum emotional impact:
  - Start light/fun (the joke, the funny story)
  - Build to heartfelt (the best friend's tearful message, the family photo)
  - End on a high note (the toast, the celebration, the dance floor)
- **Dynamic pacing**: faster photo montage during upbeat music sections, slower single-photo moments during emotional sections. Beat map drives timing.

**Step 5: Visual normalization**
- All clips and photos color-corrected to a consistent look (CSS filters in Remotion: brightness, contrast, saturation normalization)
- Consistent framing: portrait videos get a tasteful blurred-background letterbox, landscape photos get Ken Burns treatment

**Step 6: Compose with Remotion**
- All the analysis results feed into Remotion `inputProps`:
  - `videoHighlights`: array of `{ url, startSec, endSec, transcriptQuote }` -- the best moments
  - `rankedPhotos`: array of `{ url, score, kenBurnsDirection, kenBurnsSpeed }`
  - `beatMap`: array of beat timestamps for transition timing
  - `sequenceOrder`: the AI-determined clip ordering
  - `audioSpeechSegments`: timestamps where speech plays (for music ducking)
  - `thankYouContent`: text and/or video URL from the couple
  - `brandingConfig`: couple names, hashtag, colors, fonts from wedding config
- Remotion React template handles all the visual magic: Ken Burns on photos synced to beats, crossfade transitions that land on beats, animated text overlays with wedding typography, smooth audio ducking during speech segments

**Step 7: Render + deliver**
- Render via Remotion Lambda (~30-60 seconds per reel, distributed)
- Upload result to R2
- Generate thumbnail (best frame: brightest, most faces)
- Update DB: job complete, reel URL stored

**Total AI curation cost per guest reel:**

| Step | Cost |
|---|---|
| Whisper transcription (~3 min of video avg) | ~$0.018 |
| GPT-4o-mini transcript analysis | ~$0.01 |
| GPT-4o vision photo scoring (batch) | ~$0.03 |
| Beat detection (cached per wedding) | ~$0.001 |
| GPT-4o-mini sequencing | ~$0.01 |
| Remotion Lambda rendering | ~$0.03-0.05 |
| **Total per guest reel** | **~$0.10-0.12** |

At 200 guests: ~$20-24/wedding. Still incredibly profitable at any price point above $100.

**The couple's highlight reel is even more curated:**
- System collects ALL video transcripts from ALL guests
- GPT-4o selects the 15-20 most impactful moments across all guests (not just one guest's clips)
- Sequences them into a 3-5 minute cinematic reel
- The emotional arc spans the entire guest list: the college friend, the parent, the coworker, the childhood friend -- each with their most powerful 10-15 seconds
- Cost: ~$0.50-1.00 (more analysis, longer render)

### Soundtrack: How Couples Choose Music

**During setup (couple dashboard, "Choose Your Music" section):**

Option A: **Upload your own track**
- Drag-and-drop MP3 or WAV (max 10MB, ~5 minute track)
- Preview: 15-second snippet plays over a sample photo slideshow
- Note: "Make sure you have the rights to this song. We won't distribute it publicly."
- The music loops or fades to match reel duration automatically

Option B: **Browse the royalty-free library**
- Curated collection of royalty-free tracks, categorized by mood:
  - Romantic & tender
  - Upbeat & joyful
  - Cinematic & emotional
  - Acoustic & intimate
  - Bollywood & cultural
- Each track has a 15-second preview with sample wedding photos
- No licensing concerns -- all tracks cleared for commercial use
- Source: Epidemic Sound API or bundled library (Pixabay Music, Free Music Archive)

Option C: **Let us pick for you**
- Based on wedding style/theme, auto-select a track
- Couple can swap later

**The music is shared across both the couple's reel and all guest reels** -- this creates a cohesive feeling, like everyone experienced the same soundtrack.

### Thank-You Letters

After the wedding, before the reels are sent, the couple has the chance to add a personal touch.

**Option 1: Written thank-you (default)**
- Template with dynamic fields: "Thank you so much for being part of our day, {guest_name}! We love you. -- {couple_names}"
- Couple can edit the template freely
- Rendered as a beautiful closing card at the end of each guest's reel (branded with wedding colors/fonts)
- Also included as text in the delivery email

**Option 2: Recorded video thank-you**
- Couple records a 10-30 second video via the dashboard (or uploads one)
- This clip is appended to the END of every guest's reel
- Much more personal -- the guest sees the couple speaking directly to them (generically, but still feels intimate)
- Premium feature

**Option 3: Personalized per group**
- Couple writes different thank-you messages for different guest groups:
  - Family: "You've been there since day one..."
  - College friends: "From late night study sessions to this..."
  - Work friends: "Thanks for making the commute bearable..."
- System applies the right message based on each guest's `group_label`

**Option 4: Individual messages (premium, very personal)**
- For VIP guests (parents, best friend, maid of honor), the couple writes a specific message
- "Mom, I don't have the words. Thank you for everything. I love you."
- This takes more time but is incredibly meaningful for the recipient

### The Post-Wedding Dashboard: "After the Party"

This is what the couple sees when they open the dashboard 1-3 days after the wedding.

**Screen 1: "Look what your guests created"**
```
┌─────────────────────────────────────────────────┐
│  Your Wedding By The Numbers                     │
│                                                   │
│  📸 847 photos   🎬 312 video messages            │
│  🎨 476 portraits   👥 189 of 217 guests joined   │
│                                                   │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐     │
│  │    │ │    │ │    │ │    │ │    │ │    │     │
│  │best│ │phot│ │os  │ │auto│ │cura│ │ted │     │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘     │
│                                                   │
│  [Watch Your Highlight Reel ▶]                    │
└─────────────────────────────────────────────────┘
```

**Screen 2: "Your Highlight Reel" (auto-generated)**
- 3-5 minute reel of ALL guest video toasts + best photos
- Set to the music the couple chose during setup
- Couple watches. Cries. Approves.
- Options: "Love it!" (approve) | "Try different music" | "Adjust clips" (reorder/remove)

**Screen 3: "Send your guests their memories"**
- Preview 3 sample guest reels (auto-picked: one close friend, one family member, one random)
- Couple sees what the guest experience looks like
- "Add a thank-you note" section (see options above)
- "Record a thank-you video" option

**Screen 4: "When should we deliver?"**
- "Send in 3 days" (recommended -- "gives everyone time to recover from the best party ever!")
- "Send now"
- "Schedule for [date picker]"
- "I'll send manually" (couple reviews and approves each batch)

**Screen 5: "Track delivery" (after send)**
- Dashboard shows: sent, opened, watched, shared
- "87% of your guests have watched their reel!"
- Social proof: "Aditya shared his reel to Instagram"

### The Delivery Email

Subject: "Your memories from Neil & Shriya's wedding are ready"

```
┌─────────────────────────────────────────────────┐
│                                                   │
│     [Best photo of this guest at the wedding]     │
│                                                   │
│  Hey Aditya,                                      │
│                                                   │
│  "Thank you so much for being part of our         │
│   day. Your speech had everyone in tears           │
│   (especially Neil). We love you."                 │
│        — Neil & Shriya                             │
│                                                   │
│  ┌─────────────────────────────────────┐         │
│  │                                     │         │
│  │     [Thumbnail from their reel]     │         │
│  │         ▶  Watch Your Reel          │         │
│  │                                     │         │
│  └─────────────────────────────────────┘         │
│                                                   │
│  You also have 23 photos and 3 portraits          │
│  from the wedding.                                │
│  [View Your Gallery →]                            │
│                                                   │
│  ─────────────────────────────────────            │
│  Made with love by [platform name]                │
│  Want this for your wedding? [Learn more]         │
│                                                   │
└─────────────────────────────────────────────────┘
```

### The Reel Viewing Page

URL: `platform.com/w/{slug}/memories/{guest_id}`

- Full-screen video player with personalized reel (autoplay on tap)
- Download button (MP4, full quality)
- Share buttons: copy link, WhatsApp, Instagram Story, iMessage
- Below the video: scrollable gallery of all their photos from the wedding
- Thank-you card from the couple (saveable image)
- Footer: "Want this for your wedding? [subtle CTA]" -- this is the viral loop

### The Viral Loop

1. Guest receives email 3 days after the wedding
2. Guest watches their reel, is emotionally moved
3. Guest shares reel to social media or sends to friends
4. Friends see "Made with [platform]" and think "I want this for MY wedding"
5. Friends visit the landing page, see the demo videos, are sold

The sharing moment is the growth engine. Every guest reel has a subtle branded footer. Every shared reel is a free advertisement to exactly the right audience (people who go to weddings = people who will have weddings).

### Auto-Send Configuration

The couple configures this during setup or anytime before the wedding:

**"After the Wedding" settings:**
- Auto-generate reels: Yes (default) / No (manual trigger)
- Auto-send timing: 1 day / 3 days (default) / 5 days / 7 days / Manual
- Thank-you style: Text template / Recorded video / Per-group / Manual
- Approval required before send: Yes / No (default for auto-send)

**When auto-send is enabled:**
1. Wedding date passes
2. System waits [configured days]
3. Auto-generates couple highlight reel + all guest reels (background, Modal)
4. If approval required: couple gets email "Your reels are ready to preview"
5. If no approval needed: emails sent directly to all guests
6. Couple gets dashboard notification: "189 reels delivered! Track opens and shares."

**When manual send:**
1. Couple opens dashboard after wedding
2. Reviews their highlight reel
3. Previews sample guest reels
4. Writes/records thank-you
5. Approves -> "Generate all reels" -> progress bar
6. Once generated: "Send to all guests" button
7. Can send in batches (family first, then friends, etc.)

---

## Pricing: Guided Package Builder

**The framing:** You're already spending $35,000-$50,000 on the wedding. A professional videographer costs $3,000-$8,000 and captures the ceremony from one angle. A photo booth rental is $500-$1,500 and prints strips people lose. Voast charges $1,600 for one iPad and one video for the couple.

For less than what most couples spend on centerpieces, every single guest takes home a permanent memory of your wedding. And you get a highlight reel of every heartfelt message, every laugh, every tear -- from every single person you love. Not from one camera angle. From everyone's perspective.

**No fixed tiers.** Instead, a guided module that takes 1-2 minutes. The couple selects their preferences, sees a custom quote in real-time with a transparent breakdown, and understands exactly what they're getting and why.

### The Package Builder Flow

**Step 1 -- "How big is the celebration?"**
- "How many guests are you expecting?" -- Slider: 25, 50, 100, 150, 200, 300, 500, 1000+
- "How many events?" -- 1 event, 2-3 events, 4+ events
- Warm note: "More guests means more messages, more perspectives, and an even richer highlight reel for you."

**Step 2 -- "Fun Portraits"**
- "Each guest can create artistic portraits of themselves -- think watercolor, Bollywood poster, castle painting. These are always the crowd favorite."
- Options: 3 per guest, 5 per guest, 10 per guest, 15 per guest
- Shows: "At 200 guests with 5 each, that's up to 1,000 unique portraits. Guests will want to try every style."
- Why it costs what it does: "Each portrait is created using a premium generative model to ensure stunning quality. We never compromise on this."

**Step 3 -- "Video Memories"** (this is the emotional center)
- "After the wedding, we compose personalized video reels set to the music you choose. Who should receive one?"
- Option A: "Just us" -- 1 couple highlight reel (all guest messages compiled)
  - "Every video toast your guests recorded, curated into one beautiful reel. This is the thing you'll rewatch on every anniversary."
- Option B: "Us + our wedding party" -- couple reel + wedding party reels
  - "Your wedding party gets their own souvenir too -- their photos, their moments, their memories."
- Option C: "Every single guest" -- the full experience
  - "Every guest takes home a personalized reel of their own photos, messages, and portraits. A forever keepsake of your wedding. This is what makes guests talk about your wedding for years."
  - Compare callout: "Voast charges $1,600 for just one video for the couple. You're giving a personal video to every single guest."

**Step 4 -- "Community & Communication"**
- "Want to build excitement before the big day and keep everyone informed?"
- Social feed: "Guests share travel photos, favorite stories about you, and excitement in a private wedding feed."
- FAQ helper: "Guests can ask 'What's the dress code?' or 'Where do I park?' and get instant answers -- so you don't have to answer the same question 50 times."
- Day-of SMS: "Real-time logistics texts for your guests -- 'Bus departs hotel lobby in 15 minutes.' Never lose a guest."
- Each is an optional add-on with clear explanation

**Step 5 -- "Look & Feel"**
- "How custom do you want the experience?"
- 8 beautiful presets (included in base): Mediterranean, Garden, Modern, Rustic, Bollywood, Coastal, Minimalist, Classic
- Full custom: your exact colors, fonts, and branding (+$39)

### Transparent Pricing Breakdown

As the couple makes selections, a running total updates in real-time with a clear breakdown:

```
Your Package Summary
─────────────────────────────
Base platform (200 guests, 3 events)      $249
Storage (1 TB for photos & videos)          included
Fun Portraits (5 per guest, 1,000 total)   $150
Video deliverables (every guest)            $100
Social feed + FAQ chatbot                   $49
SMS notifications (day-of logistics)        $29
Custom theme                                $39
─────────────────────────────
Total                                       $616
```

Each line item has a "Why?" tooltip explaining what it includes and why it costs what it does:
- Portraits: "Each portrait is created using a premium generative model. At 5 per guest, your 200 guests can create up to 1,000 unique portraits."
- Deliverables: "We compose a personalized 60-90 second video for each of your 200 guests. That's 200 custom videos, each with their own photos, messages, and portraits."
- SMS: "We'll send real-time logistics texts on the day of your events -- bus departures, ceremony timing, etc."

### Upsell Moments (delicate, always transparent)

These are soft nudges, not hard sells. They appear as brief highlights below each selection:

- At 3 portraits/guest: "Most couples choose 5 -- guests love trying every style, and each portrait is a piece of art they keep forever."
- At "couple only" video: "For just $0.50 more per guest, every person at your wedding takes home a personal video. That's less than the cost of a wedding favor -- and infinitely more meaningful."
- Without SMS: "Day-of texts make sure no one misses the bus or shows up late. One less thing for you to worry about on the biggest day of your life."
- Without FAQ: "You know how you've answered 'What's the dress code?' 47 times? This handles it for you."

Every upsell explains the VALUE in human terms, shows the per-guest cost ("less than a wedding favor"), and is always skippable. The couple should think "that's a no-brainer" not "they're trying to upsell me."

Always show the full breakdown. Never hide costs. Transparency builds trust.

### Pricing Components (our internal cost + markup)

| Component | Our Cost | Couple Pays | Margin |
|---|---|---|---|
| Base (platform, storage, compute) | ~$15-30 | $149-349 (scales with guests) | 80%+ |
| AI portrait (per portrait) | ~$0.03 | ~$0.15 | 80% |
| Video reel (per guest, AI curation + Remotion) | ~$0.10-0.12 | ~$0.50 | 78%+ |
| FAQ chatbot (per wedding) | ~$1.50 | $25 | 94% |
| SMS (per guest, ~3 msgs) | ~$0.024 | $0.15 | 84% |
| Custom theme | ~$0 (just config) | $39 | ~100% |

Each reel cost includes Whisper transcription, GPT-4o vision photo scoring, GPT-4o-mini emotional analysis + sequencing, beat detection, and Remotion Lambda rendering. The result feels like a professional editor made it -- because the AI IS the professional editor.

**Example packages at different scales:**

| Wedding Size | Typical Selections | Price | Our Cost | Profit |
|---|---|---|---|---|
| 50 guests, 1 event, basic | 3 portraits, couple reel only, email | ~$249 | ~$14 | ~$235 |
| 150 guests, 3 events, mid | 5 portraits, all-guest reels, feed+FAQ, email+SMS | ~$499 | ~$55 | ~$444 |
| 300 guests, 4 events, full | 10 portraits, all-guest reels, feed+FAQ, SMS, custom theme | ~$799 | ~$110 | ~$689 |
| 500+ guests, 5 events, max | 15 portraits, everything | ~$1,200+ | ~$200 | ~$1,000+ |

**Always above $200 profit per wedding.** Even the smallest package. At every scale, the couple is getting something that would cost 5-10x more with traditional services.

### Revenue Projections

- 1% US market (25K weddings) @ $450 avg = **$11.25M ARR**, ~$8.5M gross profit
- 5% US market (125K weddings) = **$56.25M ARR**, ~$42M gross profit

---

## AI Cost Management

**Always gpt-image-1.5.** No quality compromise. Cost managed by caps the couple chooses and pays for.

1. **Server-side quotas enforced in DB** -- replaces client-side localStorage counter. Track per-wedding total and per-guest count in `ai_jobs` table. When a guest hits their cap: "You've used all 5 of your Fun Portraits! Each one is a keepsake."
2. **Couple-chosen caps** -- the package builder makes caps explicit. Couple knows "5 per guest = 1,000 total portraits." They pay for what they choose. If they want more, they upgrade.
3. **Hard cost ceiling** -- even the highest cap (15/guest at 500 guests = 7,500 portraits) has a known maximum cost (~$225). This is baked into the package price.
4. **Caching** -- hash(input_image + style_id) -> cache hit avoids re-generation. 10-20% hit rate for group photos.
5. **Self-hosted migration path (medium-term)** -- Flux/SDXL on Modal GPUs for ~$0.005/portrait (6x cheaper). Same quality, better margins. This is the play that turns portraits from a cost center into pure profit.

---

## Technology Evaluation (Comprehensive)

### Framework: Vite + React SPA → Next.js 15 App Router (REBUILD)

**Current state:** Vite 7 + React 19 + React Router 7 = pure client-side SPA. No SSR, no SSG, no edge middleware. API routes are flat Vercel Functions in `/api/`. The SPA has ~10 screens, ~9 API routes. Not a massive codebase.

**Why Vite SPA doesn't work for multi-tenant SaaS:**

| Limitation | Impact | How Next.js solves it |
|---|---|---|
| **No edge middleware** | Can't resolve `/w/{slug}` at the edge before page load. Every tenant resolution happens client-side after JS loads. | Next.js middleware runs at the edge, resolves tenant, redirects/rewrites before the page renders. |
| **No SSR for couple landing pages** | `platform.com/w/neil-shriya` is the first impression a guest sees. SPA takes 2.8-3.5s to paint content (download JS → parse → execute → fetch config → render). | SSR renders full HTML server-side: 1.1-1.8s to meaningful content. Guest sees the couple's names and welcome message instantly. |
| **No Open Graph / social previews** | When a couple texts `platform.com/w/neil-shriya` to 200 guests, iMessage/WhatsApp show a blank preview. No title, no image. | Server-rendered `<meta>` tags with couple names, wedding photo, and description. Beautiful link previews in every messaging app. |
| **No image optimization** | Serving 200+ guest photos to a gallery requires responsive sizes (WebP/AVIF), lazy loading, blur placeholders. Currently manual. | `next/image` handles responsive sizes, format negotiation, blur placeholders, and CDN caching automatically. |
| **No ISR for reel viewing pages** | Guest reel pages (`platform.com/reel/{id}`) need to load fast for viral sharing. SPA requires full JS execution first. | ISR generates static HTML on first view, serves from CDN on every subsequent view. Sub-100ms loads. |
| **API routes are Vercel-coupled** | Current `api/*.ts` files use `VercelRequest`/`VercelResponse` types. Locks you to Vercel. | Next.js Route Handlers use standard `Request`/`Response` Web APIs. Portable. |
| **No Server Components** | Everything ships to the client, even static content (schedule, directory, layout). Larger JS bundle. | React Server Components render static parts server-side with zero client JS. Only interactive elements (camera, filters) ship JS. |

**What about the guest app behind auth (photo booth, video, AI portraits)?**
This part *doesn't* need SSR — it's interactive, camera-heavy, offline-capable. In Next.js, you mark these as `'use client'` components. They behave exactly like the current SPA. No performance difference. The benefit is that the *scaffolding around them* (layout, navigation, schedule, directory) renders server-side.

**Migration scope (it's smaller than it sounds):**

| Current | Next.js equivalent |
|---|---|
| `src/main.jsx` + `BrowserRouter` | Deleted. Next.js App Router replaces it. |
| `src/App.jsx` (route definitions) | `app/layout.tsx` + file-based routes |
| `src/wedding-app/WeddingApp.tsx` | `app/w/[slug]/layout.tsx` |
| `src/wedding-app/screens/*.tsx` (~10 files) | `app/w/[slug]/home/page.tsx`, etc. |
| `src/wedding-app/lib/*.ts` (camera, filters, upload, AI) | Move as-is into `lib/`. These are client utilities. |
| `src/wedding-app/components/*` | Move as-is into `components/`. Add `'use client'` where needed. |
| `api/*.ts` (~9 Vercel Functions) | `app/api/v1/**/route.ts` (Next.js Route Handlers) |
| `vercel.json` rewrites | Deleted. Native Next.js routing handles everything. |
| `vite.config.js` | Deleted. Next.js handles build. |

**What we keep unchanged:**
- All React component JSX (identical syntax)
- Tailwind CSS + Framer Motion
- All business logic (upload queue, camera manager, AI portrait, filters, session management)
- Neon database integration
- Same Vercel deployment target

**Verdict: Rebuild on Next.js 15 App Router.** It's the right call for a multi-tenant SaaS with public-facing pages. The migration is manageable (~20 files to reorganize), and the benefits — edge middleware, SSR, image optimization, OG tags, Server Components, portable API routes — are substantial.

---

### Hosting: Vercel — KEEP (with media carved out to R2 CDN)

**Why this matters:** Vercel's pricing gotchas are real for media-heavy apps. Pro plan: $20/user/month, 1 TB bandwidth, 40 hours function execution, $0.15/GB bandwidth overage. A single wedding with 200 guests viewing a gallery of 1,000 photos could burn through gigabytes fast.

**But our architecture avoids the trap:**

| Traffic type | Where it goes | Vercel cost impact |
|---|---|---|
| HTML pages, JS bundles, API calls | Through Vercel | Tiny. HTML is kilobytes. JS is code-split. API payloads are small JSON. |
| Photos, videos, AI portraits, reels | Direct from Cloudflare R2 CDN | **Zero Vercel bandwidth.** R2 has zero egress. Cloudflare CDN is included. |
| Presigned upload PUTs | Direct from browser to R2 | **Zero Vercel bandwidth.** Client uploads straight to R2. |

With media carved out, Vercel only handles lightweight requests. Even at 10K+ weddings, we'd stay well within Pro bandwidth limits.

**Alternatives evaluated:**

| Platform | Pros | Cons | For us |
|---|---|---|---|
| **Vercel** | Best Next.js DX. Seamless deployment. Edge middleware. Preview deploys. | $0.15/GB bandwidth overage. Pro→Enterprise cliff ($20K+/yr). | Use it. Media bypasses Vercel anyway. |
| **Cloudflare Pages** | Unlimited bandwidth (all tiers). $25/mo. 300+ PoPs vs Vercel's 100+. Native R2 integration. | Next.js requires OpenNext adapter (maturing but not all features supported). Workers have 30s CPU limit. SSR/ISR may lag behind Vercel support. | Strong alternative at scale. Revisit if Vercel costs spike. |
| **Railway / Fly.io** | Predictable pricing. Full Docker control. WebSocket support. | No edge network for static assets. More ops overhead. Not serverless. | Overkill for now. |
| **Self-hosted VPS** | 10-20% of Vercel cost at scale. | Ops burden. No auto-scaling. No preview deploys. | Not worth the trade-off until revenue justifies a team. |

**Verdict: Stay on Vercel.** With all media going through R2 CDN, Vercel only handles the lightweight stuff it's great at. At 50K+ weddings, re-evaluate Cloudflare Pages (OpenNext will be mature by then).

---

### Database: Neon PostgreSQL — KEEP

**Why Neon over alternatives:**

| Option | Strengths | Weaknesses | For us |
|---|---|---|---|
| **Neon (current)** | Already integrated. Serverless Postgres. pgvector support. Branch-per-PR for dev/staging. Connection pooling via Neon proxy. Acquired by Databricks (2025) — more investment. | No built-in auth integration. RLS must be wired up manually. Scale-to-zero cold start 500ms-2s. | Best fit. We only need a database. |
| **Supabase** | Full BaaS: auth, RLS, real-time, storage, edge functions. RLS integrates with auth tokens (elegant). | We'd ignore 80% of features (we use R2 for storage, name-based guest auth, our own session system). Coupling to a BaaS is a larger dependency. Always-on compute = higher base cost. | Overkill. We don't want a BaaS. |
| **PlanetScale** | MySQL-compatible. | Not Postgres. No pgvector. Incompatible with our existing schema and the RLS / pgvector strategy. | Non-starter. |
| **CockroachDB** | Distributed, multi-region, strong consistency. | Expensive for early stage. Postgres-compatible but not identical (some pgvector limitations). Heavy for what we need. | Premature. |

**RLS strategy:** Standard PostgreSQL Row Level Security, enforced at the database level. Every tenant-scoped table has `wedding_id`. Policies: `USING (wedding_id = current_setting('app.current_wedding_id')::uuid)`. The API layer sets `SET LOCAL app.current_wedding_id = '{id}'` at the start of every request. This is a well-documented Postgres pattern — no BaaS needed.

**Verdict: Stay on Neon.** It's working. It has everything we need (pgvector, branching, pooling, serverless). Don't switch databases for features we won't use.

---

### Storage: Google Drive → Cloudflare R2 (REPLACE)

This is the most obvious change. Google Drive is fundamentally unsuitable for multi-tenant:

| Factor | Google Drive | Cloudflare R2 |
|---|---|---|
| **Multi-tenant auth** | Requires OAuth per couple OR a single service account hitting rate limits | One set of API keys, unlimited "tenants" via key prefixes |
| **Rate limits** | 12K requests/100 seconds (shared across ALL weddings) | Essentially unlimited for our scale |
| **Egress cost** | N/A (but Google Drive API is the bottleneck) | **$0.00/GB** — zero egress |
| **S3 compatibility** | No | Yes — presigned URLs, multipart upload, all standard S3 tooling |
| **CDN** | None — every download goes through Google's API | Cloudflare CDN included (300+ PoPs, automatic) |
| **Cost** | Free tier but unsustainable at scale due to API limits | $0.015/GB/month storage, zero egress |
| **Security** | Current code leaks Google Drive session URIs to client browsers | Presigned URLs with 15-min TTL, never expose credentials |

**Verdict: R2. No question.**

---

### Video Composition: Remotion on AWS Lambda (NEW)

**What it does:** React-based programmatic video rendering. Write video templates as React components (same language as the app). Render on AWS Lambda for horizontal scaling.

| Factor | Detail |
|---|---|
| **Cost** | ~$0.02-0.05/reel (90-sec guest reel). ~$0.10-0.20 for 5-min couple reel. |
| **License** | $100/month company license (flat, unlimited renders) |
| **Lambda support** | First-party `@remotion/lambda` package. Distributed chunk rendering for longer videos. |
| **Template capabilities** | Ken Burns pan/zoom, crossfades, text overlays with custom fonts, audio ducking, beat-synced transitions, color grading/normalization — all in React code |
| **Preview** | Remotion Studio for local development — see templates in real-time before deploying |

**Why not FFmpeg?** FFmpeg is a command-line tool. Building Canva/ClipChamp-quality reels with dynamic text, branded overlays, Ken Burns effects, audio ducking, and beat-synced transitions in FFmpeg requires thousands of lines of filter graph syntax. Remotion lets you write it as React components with CSS — same skill set as the rest of the app.

---

### Supporting Services (NEW)

| Service | Role | Cost |
|---|---|---|
| **Upstash Redis** | Caching (wedding config 5-min TTL), rate limiting (API + AI), session cache | ~$10/month at early scale |
| **Stripe** | Guided package builder checkout, subscription management | 2.9% + $0.30 per transaction |
| **OpenAI** | gpt-image-1.5 (portraits), gpt-4o-mini (FAQ chatbot, CSV import, thank-you letter drafting), gpt-4o (vision scoring for reel curation), Whisper (video transcription) | Pass-through to couple via package pricing |
| **Amazon SES** | Transactional email (deliverable links, reminders, thank-you letters) | ~$0.10/1K emails |
| **Twilio** | SMS notifications (day-of logistics, configurable by couple) | ~$0.0079/SMS |

---

### Summary: What Changes vs. What Stays

| Component | Current | Decision | Rationale |
|---|---|---|---|
| **Framework** | Vite 7 + React SPA | **→ Next.js 15 App Router** | Edge middleware, SSR, OG tags, image optimization, Server Components, portable APIs |
| **Hosting** | Vercel | **Keep** | Best Next.js DX. Media bypasses Vercel via R2 CDN. |
| **Database** | Neon PostgreSQL | **Keep** | Already working. pgvector, branching, pooling. |
| **Storage** | Google Drive | **→ Cloudflare R2** | Zero egress, S3-compatible, no rate limits, CDN included |
| **Video** | N/A | **+ Remotion on Lambda** | React-based templates, $0.02-0.05/reel, first-party Lambda support |
| **Cache** | N/A | **+ Upstash Redis** | Config caching, rate limiting, sessions |
| **Billing** | N/A | **+ Stripe** | Package builder checkout |
| **AI** | OpenAI (portraits only) | **Expand** | + gpt-4o vision curation, Whisper transcription, gpt-4o-mini for FAQ/CSV/letters |
| **Email** | N/A | **+ Amazon SES** | Transactional email for deliverables, reminders |
| **SMS** | N/A | **+ Twilio** | Day-of logistics notifications |

---

## Infrastructure

```
                    ┌─────────────────────────────────┐
                    │      Cloudflare CDN + R2         │
                    │  (media storage & delivery,      │
                    │   zero egress, 300+ PoPs)        │
                    └────────────────┬────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │    Vercel (Next.js 15 App Router)│
                    │  Edge middleware → tenant resolve │
                    │  SSR/ISR → couple landing pages   │
                    │  API Route Handlers → backend     │
                    │  Server Components → less client JS│
                    └────────────────┬────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │      Neon PostgreSQL + pgvector   │
                    │  (RLS per wedding_id, branching,  │
                    │   connection pooling, embeddings)  │
                    └────────────────┬────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │      AWS Lambda (Remotion)        │
                    │  (distributed video reel rendering)│
                    └─────────────────────────────────┘

    External Services:
    ├── OpenAI: gpt-image-1.5 (portraits), gpt-4o (vision curation),
    │           gpt-4o-mini (FAQ/CSV/letters), Whisper (transcription)
    ├── Twilio: SMS notifications (day-of logistics)
    ├── Amazon SES: transactional email (deliverables, reminders)
    ├── Stripe: guided package builder checkout
    ├── Upstash Redis: config caching, rate limiting, sessions
    └── Remotion: $100/mo license, unlimited renders
```

**Why not Supabase instead of Neon?** Supabase offers Auth + RLS + Realtime + Storage all-in-one. The research considered it seriously. But:
- We'd ignore most of Supabase's value: we use R2 for storage (not Supabase Storage), we have custom name-based guest auth (not Supabase Auth), and SSE from Next.js handles the social feed (not Supabase Realtime).
- RLS is standard PostgreSQL — works identically on Neon and Supabase. We implement it ourselves either way.
- Neon's scale-to-zero is valuable for the bursty wedding traffic pattern (active during event week, dormant otherwise).
- Neon is already integrated in the current codebase.
- If we later want Supabase, migration is trivial — both are PostgreSQL. Schema and RLS policies transfer directly.

---

## Implementation Phases with Automated Tests

**All tests run locally before every push.** Agents execute `npm test` from the CLI. No VSCode required.

**Test infrastructure:**
- **Vitest** for unit + integration tests (works with Next.js via `@vitejs/plugin-react`)
- **Playwright** for E2E browser tests (headless Chromium, installed via `npx playwright install chromium`)
- **Next.js Route Handler tests** via direct `fetch` against `next dev` or via `@testing-library/react` for component tests
- **Stock images/videos** for upload, filter, portrait, and Remotion pipeline testing (user will provide sample files)
- **Test database** -- Neon branch (or SQLite in-memory for unit tests)

**External service mocking:** All external services mocked via `TEST_MODE=true` env variable:
- R2 -> in-memory object store mock (or local filesystem)
- OpenAI (portraits, FAQ, CSV, curation) -> mock that returns realistic responses
- Stripe -> stripe-mock (official test mode)
- Twilio/SES -> mock that records calls for assertion
- Remotion Lambda -> mock that immediately returns a pre-rendered test video URL
- Whisper -> mock that returns a canned transcript

Every mock is a drop-in replacement for the real client, using the same interface. Tests verify the full flow -- input to output -- without any real API calls or credentials.

---

### Phase 0: Foundation (Weeks 1-3)

**Build:**
- Create a new Next.js 15 project (`create-next-app` with App Router, TypeScript, Tailwind)
- Set up the project structure: `app/`, `lib/`, `components/`, `api/`
- Port business logic from current codebase: camera manager, upload queue, AI portrait, filters, session handling
- Set up Cloudflare R2 integration module (`lib/storage/r2.ts`)
- Build presigned URL generation (`app/api/v1/w/[slug]/upload/presign/route.ts`)
- Rewrite `upload-queue.ts` for R2 (presigned PUT for photos, multipart for videos)
- Build upload completion endpoint (`app/api/v1/w/[slug]/upload/complete/route.ts`)
- Database migrations: `couples`, `weddings` tables; add `wedding_id` to existing tables; replace `drive_file_id` with `storage_key`
- Seed test wedding data

**Tests (all executable by agents via `npm test`):**

```
tests/
  unit/
    storage/
      r2-client.test.ts          -- presigned URL generation returns valid URL structure
      r2-client.test.ts          -- storage key follows expected pattern
      r2-client.test.ts          -- multipart upload initiation returns upload ID
    upload/
      upload-queue.test.ts       -- photo queued -> presigned URL requested -> PUT executed -> complete called
      upload-queue.test.ts       -- video queued -> multipart initiated -> chunks uploaded -> complete called
      upload-queue.test.ts       -- failed upload retries with exponential backoff
      upload-queue.test.ts       -- offline queue persists in IndexedDB, flushes on reconnect
      upload-queue.test.ts       -- upload with invalid session returns 401
    db/
      migrations.test.ts         -- migrations run without errors on clean DB
      migrations.test.ts         -- weddings table created with correct schema
      migrations.test.ts         -- wedding_id FK exists on guests, uploads, sessions, ai_jobs
      migrations.test.ts         -- seed data inserts test wedding correctly
  integration/
    api/
      presign.test.ts            -- POST /api/v1/upload/presign returns presigned URL + upload_id
      presign.test.ts            -- presign without valid session returns 401
      presign.test.ts            -- presign with unknown wedding slug returns 404
      complete.test.ts           -- POST /api/v1/upload/complete records upload in DB with correct storage_key
      complete.test.ts           -- complete with mismatched wedding_id returns 403
    upload-flow.test.ts          -- full flow: presign -> upload file to mock R2 -> complete -> verify DB record
    upload-flow.test.ts          -- photo upload: file appears at correct storage key
    upload-flow.test.ts          -- video multipart: all chunks uploaded, DB updated on completion
```

**Pass criteria:** `npm test -- --run tests/unit/storage tests/unit/upload tests/unit/db tests/integration/api tests/integration/upload-flow` -- all green, zero failures.

---

### Phase 1: Multi-Tenant Core (Weeks 4-6)

**Build:**
- Next.js edge middleware for tenant resolution (`middleware.ts` at root)
- `WeddingContext` React provider + `useWeddingConfig()` hook (client component)
- Next.js App Router file structure: `app/w/[slug]/layout.tsx`, `app/w/[slug]/home/page.tsx`, etc.
- Server Components for static content (schedule, directory, layout chrome)
- Client Components for interactive features (camera, filters, upload queue)
- SSR for couple landing page (`app/w/[slug]/page.tsx`) with Open Graph meta tags
- Dynamic config API: `app/api/v1/w/[slug]/config/route.ts`
  - Replaces hardcoded `constants.ts` (prompts, events, colors, hashtag)
  - `filters.ts` text overlays -> dynamic from config
  - Registration/Video/Review screens -> couple names from context
- Guest search API: `app/api/v1/w/[slug]/guests/search/route.ts` (replaces bundled `guests.json`)
- Dynamic PWA manifest endpoint: `app/api/v1/w/[slug]/manifest.json/route.ts`
- Name-based guest auth with persistent sessions
- `next/image` integration for photo optimization from R2
- Thumbnail generation (Sharp)

**Tests:**

```
tests/
  unit/
    middleware/
      tenant-resolver.test.ts    -- known slug resolves to correct wedding_id
      tenant-resolver.test.ts    -- unknown slug returns 404
      tenant-resolver.test.ts    -- resolved wedding config is cached (second call skips DB)
      tenant-resolver.test.ts    -- inactive wedding returns 404
    context/
      wedding-context.test.ts    -- provider fetches config on mount
      wedding-context.test.ts    -- useWeddingConfig() returns couple_names, hashtag, colors, prompts
      wedding-context.test.ts    -- config loading shows skeleton/loading state
      wedding-context.test.ts    -- config load failure shows error boundary
    auth/
      guest-session.test.ts      -- name match creates session with correct wedding_id
      guest-session.test.ts      -- session persists across page reloads (cookie + localStorage)
      guest-session.test.ts      -- fuzzy name matching works (partial names, typos)
      guest-session.test.ts      -- guest from Wedding A cannot get session for Wedding B
    filters/
      dynamic-filters.test.ts    -- filter text overlay uses wedding hashtag, not hardcoded
      dynamic-filters.test.ts    -- only enabled filters from config are shown
  integration/
    api/
      config.test.ts             -- GET /api/v1/w/{slug}/config returns full wedding config
      config.test.ts             -- config includes couple_names, hashtag, colors, prompts, filters
      guest-search.test.ts       -- GET /api/v1/w/{slug}/guests/search?q=Adi returns matching guests
      guest-search.test.ts       -- search is scoped to wedding (no cross-wedding results)
      guest-search.test.ts       -- empty query returns empty (no full list leak)
      manifest.test.ts           -- GET /api/v1/w/{slug}/manifest.json returns wedding-specific PWA manifest
      register.test.ts           -- POST /api/v1/w/{slug}/auth/register with valid name returns session
      register.test.ts           -- register with unknown name returns 404
    tenant-isolation.test.ts     -- create 2 weddings with different configs
                                 -- verify each returns its own config
                                 -- verify each has its own guests
                                 -- verify uploads are scoped to wedding
                                 -- verify guest from wedding A cannot access wedding B's API
  e2e/
    guest-registration.spec.ts   -- open /w/test-wedding -> see registration screen
                                 -- type partial name -> autocomplete appears
                                 -- select name -> home screen loads with correct couple names
                                 -- refresh page -> still logged in
                                 -- navigate to schedule -> correct events displayed
                                 -- navigate to photo screen -> correct filters shown
    multi-tenant.spec.ts         -- open /w/wedding-a -> see Wedding A config (names, colors)
                                 -- open /w/wedding-b -> see Wedding B config (different names, colors)
                                 -- verify no data leakage between the two
```

**Pass criteria:** All tests green. Two test weddings with different configs show correct, isolated data. Guest registration flow works end-to-end in Playwright.

---

### Phase 2: Couple Dashboard + Billing (Weeks 7-9)

**Build:**
- Couple auth (signup, login, JWT, email verification)
- Dashboard: create wedding, configure slug/names/hashtag/theme
- Guest import: CSV upload with gpt-4o-mini parsing + manual entry
- Event configuration (dates, venues, logistics, dress codes)
- Filter + AI style selection (enable/disable per collection)
- Prompt customization
- Guided package builder (the 1-2 minute pricing flow)
- Stripe integration (Checkout, Billing, webhooks)
- Server-side AI quota enforcement

**Tests:**

```
tests/
  unit/
    auth/
      couple-auth.test.ts        -- signup creates couple with hashed password
      couple-auth.test.ts        -- login returns valid JWT
      couple-auth.test.ts        -- invalid password returns 401
      couple-auth.test.ts        -- expired token returns 401, refresh token works
    csv/
      csv-parser.test.ts         -- Zola CSV format parsed correctly (first, last, email, phone, group)
      csv-parser.test.ts         -- The Knot CSV format parsed correctly
      csv-parser.test.ts         -- messy CSV (merged name column, missing fields) handled gracefully
      csv-parser.test.ts         -- returns structured guest objects for review
    billing/
      package-builder.test.ts    -- 200 guests + 5 portraits + all videos = correct price
      package-builder.test.ts    -- price updates in real-time as selections change
      package-builder.test.ts    -- minimum package is always >= $200 profit
      package-builder.test.ts    -- large wedding (500+) pricing scales correctly
    ai/
      quota-enforcement.test.ts  -- portrait request within quota succeeds
      quota-enforcement.test.ts  -- portrait request over per-guest cap returns quota error
      quota-enforcement.test.ts  -- portrait request over wedding total cap returns quota error
      quota-enforcement.test.ts  -- quota check reads from DB, not localStorage
  integration/
    api/
      couple-signup.test.ts      -- POST /api/v1/auth/signup -> couple created
      couple-signup.test.ts      -- POST /api/v1/auth/login -> JWT returned
      wedding-create.test.ts     -- POST /api/v1/weddings -> wedding created with slug
      wedding-create.test.ts     -- duplicate slug returns 409
      guest-import.test.ts       -- POST /api/v1/w/{slug}/guests/import with CSV -> parsed + created
      guest-import.test.ts       -- imported guests searchable via guest-search endpoint
      events-crud.test.ts        -- create, read, update, delete events for a wedding
      stripe-webhook.test.ts     -- checkout.session.completed webhook updates wedding plan
      stripe-webhook.test.ts     -- subscription.deleted webhook deactivates features
      ai-quota.test.ts           -- generate portrait -> ai_jobs count incremented
      ai-quota.test.ts           -- exceed quota -> 429 returned with clear message
  e2e/
    couple-onboarding.spec.ts    -- signup with email/password -> login -> create wedding
                                 -- set slug, names, hashtag -> configure theme
                                 -- upload CSV -> review parsed guests -> confirm
                                 -- add events with venues and dress codes
                                 -- select filters and AI styles
                                 -- go through package builder -> see price update
                                 -- Stripe test checkout (mock) -> wedding activated
    guest-from-dashboard.spec.ts -- couple creates wedding + imports guests via dashboard
                                 -- open guest-facing URL -> search for imported guest name
                                 -- register as that guest -> see correct wedding config
```

**Pass criteria:** Full couple onboarding works E2E in Playwright. CSV import handles real Zola export format. Package builder calculates correct prices. AI quota enforcement prevents over-generation.

---

### Phase 3: New Guest Features (Weeks 10-13)

**Build:**
- Social feed (CRUD, chronological UI, likes, comments, moderation)
- FAQ chatbot (pgvector, embedding pipeline, RAG query, chat UI)
- Notifications (SES email, Twilio SMS, queue + cron)
- Remotion video reel templates (couple highlight reel + per-guest souvenir reel)
- Remotion Lambda rendering pipeline (queue -> render -> R2 -> notify)
- Soundtrack upload (MP3/WAV in dashboard) + royalty-free library
- Thank-you letter system (text template / video / per-group / individual)
- Post-wedding dashboard ("After the Party" flow)
- Delivery email (beautiful HTML with reel thumbnail, viewing page link)
- Reel viewing page (`/w/{slug}/memories/{guest_id}`) with video player, download, share
- Auto-send configuration (timing, approval, batch delivery)

**Tests:**

```
tests/
  unit/
    feed/
      feed-model.test.ts         -- create post -> retrieve post -> correct fields
      feed-model.test.ts         -- posts ordered by created_at DESC
      feed-model.test.ts         -- cursor pagination returns correct pages
      feed-model.test.ts         -- like/unlike toggles correctly, updates count
      feed-model.test.ts         -- comment creates with correct post + guest association
      feed-model.test.ts         -- couple can hide/delete posts (moderation)
    faq/
      faq-embedding.test.ts      -- Q&A pair embedded correctly (mock embedding API)
      faq-embedding.test.ts      -- similarity search returns relevant entries
      faq-embedding.test.ts      -- RAG prompt includes top 5 FAQ entries as context
      faq-embedding.test.ts      -- cached question returns cached answer without re-embedding
    notifications/
      notification-queue.test.ts -- email notification queued with correct template
      notification-queue.test.ts -- SMS notification queued only for weddings with SMS enabled
      notification-queue.test.ts -- queue processor sends batch via mock SES/Twilio
      notification-queue.test.ts -- failed send retries with backoff
      notification-queue.test.ts -- guest opt-out respected (no send)
    deliverables/
      reel-composer.test.ts      -- guest with 3 photos + 2 videos -> correct Remotion inputProps generated
      reel-composer.test.ts      -- inputProps include Ken Burns params for photos, speech segments for ducking
      reel-composer.test.ts      -- couple highlight reel pulls from ALL guests' video messages
      reel-composer.test.ts      -- per-guest reel includes only that guest's media + thank-you
      reel-composer.test.ts      -- music track URL included in inputProps
      reel-composer.test.ts      -- thank-you text/video appended as final sequence
      reel-composer.test.ts      -- result uploaded to correct R2 key after render
    curation/
      photo-ranker.test.ts       -- given 20 photos, returns top 10 ranked by quality (mock GPT-4o vision)
      photo-ranker.test.ts       -- blurry/dark photos scored lower
      photo-ranker.test.ts       -- photos with faces scored higher
    soundtrack/
      music-upload.test.ts       -- MP3 upload stores to R2 at correct key
      music-upload.test.ts       -- WAV upload accepted, stored correctly
      music-upload.test.ts       -- file over 10MB rejected
    thank-you/
      thank-you.test.ts          -- text template with {guest_name} interpolated correctly per guest
      thank-you.test.ts          -- per-group messages applied based on guest group_label
      thank-you.test.ts          -- video thank-you URL included in reel inputProps
    auto-send/
      auto-send.test.ts          -- auto-send enabled + wedding date passed -> jobs created after delay
      auto-send.test.ts          -- manual mode: no jobs created until couple triggers
      auto-send.test.ts          -- approval required: couple notified, jobs held until approved
  integration/
    api/
      feed-crud.test.ts          -- POST /feed/posts creates post, GET returns it
      feed-crud.test.ts          -- POST /feed/posts/{id}/like increments count
      feed-crud.test.ts          -- POST /feed/posts/{id}/comments adds comment
      feed-crud.test.ts          -- feed is scoped to wedding (no cross-wedding posts)
      feed-crud.test.ts          -- couple DELETE /feed/posts/{id} removes post
      faq-query.test.ts          -- POST /faq/ask with "dress code" returns relevant answer
      faq-query.test.ts          -- FAQ is scoped to wedding (wedding A FAQ ≠ wedding B FAQ)
      notifications.test.ts      -- trigger schedule reminder -> notification queued in DB
      notifications.test.ts      -- process queue -> mock SES called with correct template
      deliverables.test.ts       -- trigger deliverable for guest -> reel job created in DB
      deliverables.test.ts       -- Remotion Lambda render completion webhook -> job marked complete
      deliverables.test.ts       -- completion triggers notification to guest with reel URL
      deliverables.test.ts       -- reel viewing page returns correct video + gallery for guest
      delivery-email.test.ts     -- delivery email rendered with correct guest name, thumbnail, thank-you
      delivery-email.test.ts     -- email includes "Watch Your Reel" link to viewing page
      post-wedding.test.ts       -- "After the Party" dashboard returns correct stats (photos, videos, portraits)
      post-wedding.test.ts       -- couple highlight reel URL available after generation
      soundtrack.test.ts         -- upload MP3 -> stored in R2 -> retrievable via wedding config
  e2e/
    social-feed.spec.ts          -- guest A posts text -> guest B sees it in feed
                                 -- guest B likes the post -> count updates
                                 -- guest B comments -> comment appears
                                 -- couple hides post -> no longer visible to guests
    faq-chatbot.spec.ts          -- guest opens FAQ -> types "dress code"
                                 -- receives relevant, conversational answer
                                 -- answer matches wedding's FAQ content
    notification-flow.spec.ts    -- schedule reminder triggers -> email appears in mock inbox
                                 -- deliverable ready -> email with link sent
    post-wedding-flow.spec.ts    -- couple opens "After the Party" dashboard
                                 -- sees correct stats (photo count, video count, guest participation)
                                 -- watches couple highlight reel preview
                                 -- writes thank-you message
                                 -- configures auto-send timing
                                 -- triggers send -> delivery emails queued
    reel-viewing.spec.ts         -- guest opens reel viewing page from email link
                                 -- video player loads with correct reel
                                 -- download button works
                                 -- share button generates shareable link
                                 -- gallery below shows guest's photos
```

**Pass criteria:** Social feed CRUD works with tenant isolation. FAQ chatbot returns relevant answers from wedding-specific FAQ. Notification queue processes correctly. Remotion reel composition generates correct inputProps and handles Lambda render completion. Post-wedding dashboard shows accurate stats. Delivery email renders correctly with guest-specific content. Reel viewing page loads video, download, and share buttons. Auto-send triggers at configured timing. Thank-you messages are correctly personalized per guest/group.

---

### Phase 4: Polish + Scale (Weeks 14-16)

**Build:**
- Redis caching (Upstash): config, sessions, rate limiting
- CDN optimization (cache headers, immutable thumbnails)
- Performance monitoring (Sentry, Vercel Analytics)
- Load testing
- Security audit (tenant isolation, RLS, presigned URL abuse, AI prompt injection)
- Data privacy (CCPA/GDPR: export, deletion)
- Couple analytics dashboard

**Tests:**

```
tests/
  unit/
    cache/
      redis-cache.test.ts        -- wedding config cached on first fetch
      redis-cache.test.ts        -- cached config returned on second fetch (no DB hit)
      redis-cache.test.ts        -- cache invalidated on config update
      redis-cache.test.ts        -- session cached, expired session rejected
    security/
      rls.test.ts                -- DB query without wedding_id in WHERE is blocked by RLS
      rls.test.ts                -- direct SQL injection attempt in slug returns 400
      input-sanitize.test.ts     -- malicious prompt in guest name is sanitized before AI call
      input-sanitize.test.ts     -- XSS in feed post content is escaped on render
      presign-abuse.test.ts      -- expired presigned URL returns 403
      presign-abuse.test.ts      -- presigned URL with wrong content-type is rejected on complete
    privacy/
      data-export.test.ts        -- export generates ZIP with all guest data + media URLs
      data-deletion.test.ts      -- delete removes all guest data, uploads, sessions, AI jobs
  integration/
    rate-limiting.test.ts        -- > 100 requests/min from same IP returns 429
    rate-limiting.test.ts        -- AI portrait requests respect per-minute rate limit
  load/
    k6-config.js                 -- simulate 100 concurrent weddings, 50 guests each
                                 -- mixed workload: registration, upload, feed, FAQ
                                 -- assert p99 < 500ms for reads, p99 < 2s for writes
                                 -- assert zero cross-wedding data in responses
  e2e/
    full-lifecycle.spec.ts       -- couple signup -> create wedding -> import guests
                                 -- configure package (5 portraits, all-guest videos)
                                 -- guest registers -> takes photo -> applies filter -> uploads
                                 -- guest creates AI portrait -> quota decremented
                                 -- guest records video -> uploads
                                 -- guest posts to feed -> another guest sees it
                                 -- guest asks FAQ question -> relevant answer
                                 -- couple triggers deliverables -> jobs created
                                 -- guest receives email notification
    tenant-isolation-stress.spec.ts
                                 -- create 10 weddings with unique configs
                                 -- register guests across all 10 simultaneously
                                 -- verify every API response is scoped to correct wedding
                                 -- verify no data leakage in any response
```

**Pass criteria:** All unit/integration tests green. k6 load test passes with p99 targets. Tenant isolation stress test passes with 10 simultaneous weddings. Full lifecycle E2E runs from couple signup to guest deliverable notification.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **AI costs** | Margin pressure | Couple-chosen caps with transparent pricing; they pay for what they choose. Self-hosted models on Modal as medium-term play (6x cheaper). |
| **Tenant data leak** | Trust-destroying | wedding_id in every query, RLS in Postgres, tenant isolation stress test in CI, security audit |
| **Guest impersonation** | Low-stakes | Name-based is inherently low-security (wedding context, ~200 people). Optional SMS verification for couples who want it. |
| **Vercel costs at scale** | Margin compression | Heavy compute on Lambda/Modal. Migrate API to containers at 50K+ weddings. |
| **Reel quality** | Disappointment, refund requests | Remotion React templates = professional output. AI curation selects best photos. Couple previews before sending. Accept all input formats, transcode to H.264 1080p. |
| **Remotion Lambda cold starts** | Slow reel generation | Pre-warm Lambda functions. Batch renders off-peak. Most reels generated 1-3 days post-wedding (not real-time). |
| **Offline at venues** | Missed captures | Already solved: IndexedDB queue + service worker. Extend to cache app shell. |
| **Social feed annoyance** | Guests disengage | Subtle positioning (tab, not home screen), daily digest not per-post push, couple moderation |

---

## Project Structure (Next.js 15 App Router — New Build)

Since this is a rebuild from scratch on Next.js, here's the complete project structure:

```
wedding-platform/
├── next.config.ts                    # Next.js config (image domains, redirects)
├── middleware.ts                      # Edge middleware: tenant resolution from /w/{slug}
├── package.json
├── tsconfig.json
├── tailwind.config.ts
│
├── app/                               # Next.js App Router
│   ├── layout.tsx                     # Root layout (html, body, global providers)
│   ├── page.tsx                       # Marketing landing page (SSG)
│   │
│   ├── w/[slug]/                      # Guest-facing wedding app
│   │   ├── layout.tsx                 # Wedding layout: fetches config, <WeddingProvider>
│   │   ├── page.tsx                   # Guest registration (SSR with OG meta tags)
│   │   ├── home/page.tsx              # Home screen (client component)
│   │   ├── schedule/page.tsx          # Event schedule (server component)
│   │   ├── directory/page.tsx         # Guest directory (server component)
│   │   ├── gallery/page.tsx           # Photo gallery (server component + client hydration)
│   │   ├── video/page.tsx             # Video recording (client component, camera-heavy)
│   │   ├── photo/page.tsx             # Photo capture + filters (client component)
│   │   ├── review/page.tsx            # Review before upload (client component)
│   │   ├── feed/page.tsx              # Social feed (client component, subtle secondary tab)
│   │   ├── faq/page.tsx               # FAQ chatbot (client component)
│   │   └── memories/[guestId]/page.tsx # Reel viewing page (SSR/ISR for sharing)
│   │
│   ├── dashboard/                     # Couple dashboard (authenticated)
│   │   ├── layout.tsx                 # Dashboard layout with auth guard
│   │   ├── page.tsx                   # Dashboard home (wedding list, stats)
│   │   ├── create/page.tsx            # Create wedding flow
│   │   ├── [weddingId]/
│   │   │   ├── settings/page.tsx      # Wedding config (theme, prompts, filters, events)
│   │   │   ├── guests/page.tsx        # Guest list management + CSV import
│   │   │   ├── analytics/page.tsx     # Stats (registrations, photos, videos)
│   │   │   ├── feed/page.tsx          # Feed moderation
│   │   │   ├── deliverables/page.tsx  # "After the Party" dashboard
│   │   │   ├── thank-you/page.tsx     # Thank-you letter/video editor
│   │   │   └── soundtrack/page.tsx    # Soundtrack upload + royalty-free library
│   │   └── billing/page.tsx           # Package builder + Stripe checkout
│   │
│   └── api/v1/                        # Next.js Route Handlers (replaces Vercel Functions)
│       ├── w/[slug]/
│       │   ├── config/route.ts        # GET wedding config
│       │   ├── auth/register/route.ts # POST guest registration (name-based)
│       │   ├── guests/search/route.ts # GET guest name autocomplete
│       │   ├── upload/
│       │   │   ├── presign/route.ts   # POST get R2 presigned URL
│       │   │   └── complete/route.ts  # POST record upload metadata
│       │   ├── media/[guestId]/route.ts   # GET guest's media
│       │   ├── feed/route.ts          # GET/POST social feed
│       │   ├── faq/route.ts           # POST FAQ query
│       │   ├── ai-portrait/
│       │   │   └── generate/route.ts  # POST generate portrait (quota-enforced)
│       │   ├── manifest.json/route.ts # GET dynamic PWA manifest
│       │   └── memories/[guestId]/route.ts # GET reel viewing data
│       ├── dashboard/
│       │   ├── weddings/route.ts      # CRUD weddings
│       │   ├── auth/route.ts          # Couple login/register
│       │   ├── guests/import/route.ts # CSV import
│       │   └── billing/route.ts       # Stripe checkout session
│       └── webhooks/
│           ├── stripe/route.ts        # Stripe webhook
│           └── remotion/route.ts      # Remotion Lambda render completion
│
├── lib/                               # Shared business logic (ported from current codebase)
│   ├── storage/r2.ts                  # R2 client: presigned URLs, multipart, CDN URLs
│   ├── db/                            # Database layer
│   │   ├── client.ts                  # Neon connection + RLS context setter
│   │   ├── schema.ts                  # Type definitions for all tables
│   │   └── migrations/               # SQL migration files
│   ├── upload-queue.ts                # IndexedDB offline queue (ported, rewritten for R2)
│   ├── camera-manager.ts             # Camera access + recording (ported as-is)
│   ├── filters.ts                     # Canvas/CSS photo filters (ported, dynamic hashtag)
│   ├── ai-portrait.ts                # Client-side AI portrait orchestration (ported)
│   ├── session.ts                     # Guest session management (ported, wedding-scoped)
│   ├── email/                         # Email templates
│   │   ├── delivery.tsx               # Reel delivery email (React Email)
│   │   └── reminder.tsx               # Schedule reminder email
│   ├── remotion/                      # Remotion video templates (separate build)
│   │   ├── WeddingReel.tsx            # Per-guest souvenir reel template
│   │   ├── HighlightReel.tsx          # Couple's highlight reel template
│   │   └── components/
│   │       ├── KenBurnsSlide.tsx      # Ken Burns photo animation
│   │       ├── ThankYouCard.tsx       # Closing thank-you card
│   │       └── TitleCard.tsx          # Opening title (couple names, date)
│   └── ai/                            # AI service integrations
│       ├── curation.ts                # GPT-4o vision scoring, Whisper transcription
│       ├── faq.ts                     # pgvector RAG + gpt-4o-mini
│       └── csv-import.ts             # gpt-4o-mini column identification
│
├── components/                        # React components
│   ├── WeddingProvider.tsx            # WeddingContext provider (client component)
│   ├── guest/                         # Guest-facing UI components (ported)
│   │   ├── BottomNav.tsx
│   │   ├── PhotoBooth.tsx
│   │   ├── FilterPicker.tsx
│   │   ├── VideoRecorder.tsx
│   │   ├── AiPortraitStudio.tsx
│   │   ├── GalleryGrid.tsx
│   │   ├── FeedPost.tsx
│   │   └── FaqChat.tsx
│   └── dashboard/                     # Couple dashboard components (new)
│       ├── PackageBuilder.tsx         # Guided pricing flow
│       ├── ThankYouEditor.tsx         # Thank-you letter/video editor
│       ├── SoundtrackUploader.tsx
│       ├── GuestImporter.tsx          # CSV import with AI column mapping
│       └── AfterTheParty.tsx          # Post-wedding dashboard
│
├── tests/                             # All tests
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/                      # Stock images/videos for testing
│
└── public/                            # Static assets
    └── fonts/
```

**Key files ported from current codebase (reference paths):**

| Current file | Ported to | What changes |
|---|---|---|
| `src/wedding-app/lib/upload-queue.ts` | `lib/upload-queue.ts` | Rewritten for R2 presigned URLs (photos: direct PUT, videos: S3 multipart) |
| `src/wedding-app/constants.ts` | Deleted — replaced by dynamic config from `app/api/v1/w/[slug]/config/route.ts` |
| `src/wedding-app/lib/filters.ts` | `lib/filters.ts` | Hashtag/overlays from config, not hardcoded |
| `src/wedding-app/lib/session.ts` | `lib/session.ts` | Wedding-scoped persistent sessions |
| `src/wedding-app/lib/ai-portrait.ts` | `lib/ai-portrait.ts` | Quota enforcement, wedding_id scoping |
| `api/upload/initiate.ts` | `app/api/v1/w/[slug]/upload/presign/route.ts` | R2 presigned URLs instead of Google Drive |
| `api/upload/complete.ts` | `app/api/v1/w/[slug]/upload/complete/route.ts` | `storage_key` instead of `drive_file_id` |
| `api/ai-portrait/generate.ts` | `app/api/v1/w/[slug]/ai-portrait/generate/route.ts` | Quota enforcement, cost tracking |
| `api/auth/register.ts` | `app/api/v1/w/[slug]/auth/register/route.ts` | Wedding-scoped, persistent session |
| `src/data/guests.json` | Deleted — replaced by DB-backed guest search API |
| `scripts/migrate.sql` | `lib/db/migrations/` | Multi-tenant schema with wedding_id FKs |

---

## Lifecycle Stickiness (why guests and couples keep coming back)

The platform isn't just a day-of tool. It creates emotional touchpoints at every stage:

**Weeks before:** Guest receives the link, explores the schedule, reads FAQ, browses the social feed. Other guests are posting travel photos and stories about the couple. Anticipation builds.

**Day of:** Photo booth with artistic filters, video toasts with prompts that pull real emotion out of people, fun portraits they share immediately. The app is the icebreaker at every table.

**Days after:** The email arrives. "Your memories from Neil & Shriya's wedding are ready." The guest taps play and relives the whole day in 90 seconds. They share it. They save it. They come back to the gallery to download their photos.

**Months after:** Someone says "remember that wedding?" and the guest pulls up their reel. Still there. Still beautiful. The couple rewatches their highlight reel on their anniversary.

**The viral loop:** Every shared reel is a free ad to exactly the right audience -- people who attend weddings are people who will have weddings. The subtle "Made with [platform]" footer in the reel + "Want this for your wedding?" link in the delivery email = organic growth.

**Stock images needed for testing:** User will provide stock images for: photo upload testing, filter preview testing, AI portrait input testing, and Remotion reel composition testing (sample photos/videos to compose into a test reel).
