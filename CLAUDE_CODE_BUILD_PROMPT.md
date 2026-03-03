# BUILD PROMPT — Wedding Guest Experience Platform

> **Paste this entire document into Claude Code as your build instructions.**
> Two reference documents are already in the repository root:
> - `SCALING_PLAN.md` — Architecture, features, pricing, phased build plan
> - `MASTER_PRODUCTION_SPEC.md` — SQL, API contracts, env vars, tests, security, CI/CD
>
> Read BOTH files in full before writing any code. They are your source of truth.

---

## Who You're Building For

**The customer is the COUPLE.** Not the guests. The couple pays, the couple configures, the couple decides what their guests experience. Every marketing page, every dashboard screen, every pricing conversation speaks to the couple.

**The guest is the user.** Guests use the app on the day of the wedding. The guest experience must be effortless, beautiful, and delightful — but the couple is who we sell to.

This distinction shapes everything:
- The **landing page** sells to engaged couples: "Your guests will create something you'll treasure forever."
- The **dashboard** empowers couples: "You're in control of the experience."
- The **guest app** is invisible-simple: guests should never feel like they're using "a product." It should feel like part of the wedding itself.

---

## Design System — The Soul of the Product

### Aesthetic Direction: "Warm Editorial"

Think Flodesk meets Zola meets Instagram Stories. NOT a SaaS dashboard. NOT a Bootstrap template. NOT dark mode. This is a product about love, celebration, and memory — it should feel like opening a beautiful wedding invitation, not logging into a software tool.

**Reference points:**
- **Flodesk** — warm editorial aesthetic, generous whitespace, typographic confidence
- **Zola** — wedding-specific UI patterns, soft imagery, emotional copy
- **Instagram Stories** — recording UX, filter carousel, effortless capture
- **Airbnb** — card layouts, photography-forward, trust-building design
- **Apple Camera** — capture UI, shutter/record button design
- **Linear** — dashboard polish, subtle animations, information density done right

### Color Palette

```css
:root {
  /* ── Backgrounds ── */
  --bg-warm-white: #FEFCF9;
  --bg-soft-cream: #F7F3ED;
  --bg-pure-white: #FFFFFF;
  --bg-warm-gradient: linear-gradient(180deg, #FEF9F2 0%, #FEFCF9 40%, #FFF8F0 100%);

  /* ── Primary ── */
  --color-terracotta: #C4704B;
  --color-terracotta-dark: #A85D3E;
  --color-terracotta-light: #E8C4B8;
  --color-terracotta-gradient: linear-gradient(135deg, #C4704B 0%, #E8865A 100%);
  
  /* ── Secondary ── */
  --color-mediterranean-blue: #2B5F8A;
  --color-olive: #7A8B5C;
  --color-golden: #D4A853;
  --color-sunset-orange: #E8865A;
  --color-blush: #E8C4B8;
  
  /* ── Text ── */
  --text-primary: #2C2825;
  --text-secondary: #8A8078;
  --text-tertiary: #B8AFA6;
  --text-on-dark: #FEFCF9;
  
  /* ── Borders & Shadows ── */
  --border-light: rgba(232, 221, 211, 0.5);
  --border-medium: rgba(232, 221, 211, 0.8);
  --shadow-soft: 0 2px 12px rgba(44, 40, 37, 0.08);
  --shadow-medium: 0 4px 20px rgba(44, 40, 37, 0.12);
  --shadow-terracotta: 0 4px 20px rgba(196, 112, 75, 0.25);

  /* ── Event Colors ── */
  --event-haldi: #D4A853;
  --event-sangeet: #E8865A;
  --event-wedding: #2B5F8A;
  --event-reception: #7A8B5C;
}
```

### Typography

```css
/* Load via Google Fonts or self-host */
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');

:root {
  /* Display / Headlines — Playfair Display */
  --font-display: 'Playfair Display', Georgia, serif;
  
  /* Body / UI — DM Sans (NOT Inter, NOT system fonts) */
  --font-body: 'DM Sans', -apple-system, sans-serif;
}
```

**Usage rules:**
- Playfair Display: Headlines, couple names, section titles, emotional moments ("Your memories are ready"), feature names on landing page. Weight 400–600, sizes 24–48px.
- DM Sans: Everything else — body text, buttons, labels, navigation, form inputs, dashboard data. Weight 300–600, sizes 13–17px.
- **NEVER use Inter, Roboto, Arial, or system fonts anywhere in the product.** If you catch yourself reaching for Inter, use DM Sans instead.

### Component Patterns

**Cards:**
```css
.card {
  background: white;
  border-radius: 16px;
  box-shadow: var(--shadow-soft);
  border: 1px solid var(--border-light);
  overflow: hidden;
}

.card-feature {
  /* For hero cards like "Record a Video" or "Photo Booth" */
  background: var(--color-terracotta-gradient);
  border-radius: 20px;
  box-shadow: var(--shadow-terracotta);
  color: white;
  position: relative;
  overflow: hidden;
}

.card-feature::before {
  /* Decorative circle (glassmorphism) */
  content: '';
  position: absolute;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  top: -20px;
  right: -20px;
}
```

**Buttons:**
```css
.btn-primary {
  background: var(--color-terracotta-gradient);
  color: white;
  border: none;
  border-radius: 999px;           /* Full pill shape */
  padding: 14px 28px;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 16px;
  box-shadow: var(--shadow-terracotta);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.btn-primary:active {
  transform: scale(0.97);          /* Press feedback */
}

.btn-secondary {
  background: white;
  color: var(--color-terracotta);
  border: 1.5px solid var(--color-terracotta);
  /* Same radius, padding, font as primary */
}

.btn-ghost {
  background: rgba(196, 112, 75, 0.08);
  color: var(--color-terracotta);
  border: none;
  /* Same radius, padding, font */
}
```

**Frosted glass (for camera overlays):**
```css
.glass {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 24px;
}
```

**Bottom navigation (guest app):**
- 5 tabs: Home, Video, **Photo** (center, elevated), Events, Gallery
- Photo tab is elevated: 54px terracotta gradient circle, raised above the bar by 14px
- Active tab: terracotta icon + label. Inactive: gray.
- Background: frosted white (rgba(254,252,249,0.88), backdrop-filter: blur(24px))
- Tab bar respects safe-area-inset-bottom

### Animation Principles

```
Page transitions:     250ms slide from right (Framer Motion)
Button press:         scale(0.97) with 150ms spring back
Card entrance:        Staggered fade-up, 50ms delay between cards
Confetti:             Warm particles (gold, terracotta, blush, olive), 1.5s, on save/success
Loading:              Skeleton shimmer in cream tones — NEVER a spinner
Recording pulse:      Red dot opacity pulse 1.2s ease-in-out infinite
```

**prefers-reduced-motion:** Disable all animations. No confetti. No page transitions. Still functional.

---

## Page-by-Page Design Direction

### 1. LANDING PAGE (`app/page.tsx`) — SELLS TO COUPLES

This is the most important page. An engaged couple lands here from a shared reel, a Google search, or a friend's recommendation. They need to understand what this is, feel the emotion, and believe it's worth the money — all in under 60 seconds.

**Structure:**

```
HERO SECTION
├── Headline (Playfair, 40-48px, centered):
│   "Every guest. Every moment. Every message."
│   or
│   "The moments between moments."
│   or  
│   "Who captures the story your photographer misses?"
├── Subheadline (DM Sans, 18px, muted):
│   "Your guests record heartfelt video toasts, take stunning photos with artistic
│    filters, and create fun portraits of themselves. Days later, everyone receives
│    a personalized video reel of their memories from your wedding."
├── CTA: "Build Your Experience →" (terracotta gradient pill, large)
├── Secondary: "See a demo reel ▶" (ghost button, opens modal with sample video)
└── Social proof: "Trusted by X couples" or "[3 small wedding photos] 
    Loved at over X celebrations"

HOW IT WORKS (3-step visual)
├── Step 1: "Share one link" 
│   Icon/illustration + "Text your guests a single link or print a QR code. 
│   They tap their name and they're in."
├── Step 2: "Guests capture the magic"
│   Icon/illustration + "Video toasts with prompts that pull real emotion. 
│   A photo booth with artistic filters. Fun AI-powered portraits."
├── Step 3: "Everyone gets a keepsake"
│   Icon/illustration + "3 days later, every guest receives a personalized 
│   video reel of their photos, messages, and memories. Set to your song."
└── Each step has a phone mockup or short looping video

THE VIRAL MOMENT (emotional section, darker background)
├── Headline: "This is the email that makes people cry."
├── Mock of the delivery email on a phone screen
├── Pull quote: "I've watched my reel 6 times. I didn't even know I was 
│   tearing up during the ceremony." — A guest
├── "Every shared reel is an invitation for someone else to want this 
│   for their wedding."

VS VOAST / VS TRADITIONAL (comparison, NOT a table — storytelling)
├── "Voast charges $1,600 for one iPad at your wedding. You get one video. 
│   Your guests get nothing."
├── "A photo booth rental is $800. Guests get a printed strip they lose 
│   in their jacket pocket."
├── "We give you every photo, every video, every message from every guest. 
│   And every guest takes home their own personalized reel. 
│   Starting at $249."
├── CTA: "See what's included →" (links to pricing section)

FEATURES SHOWCASE
├── Video Toasts — show phone mockup of recording screen with prompt
├── Photo Booth — show filter carousel + sample filtered photo
├── AI Portraits — show before/after (normal photo → Mughal painting)
│   THIS IS THE WOW MOMENT. Make it visual. Show 4-6 style examples.
├── Social Feed — subtle mention, screenshot
├── FAQ Chatbot — "Your guests can ask 'What's the dress code?' 
│   and get an instant answer. So you don't have to."
├── Schedule — "Every detail in one place. Venue, dress code, directions."
└── Each feature has a phone mockup or animation, NOT just text

PRICING SECTION
├── Headline: "Transparent pricing. No surprises."
├── Quick summary: "Most couples spend $400–600 for the full experience. 
│   That's less than a photo booth rental — and infinitely more meaningful."
├── "Build Your Package →" CTA (links to guided package builder)
├── 3 example configurations:
│   "Intimate" (50 guests, $249) | "Classic" (200 guests, $499) | 
│   "Grand" (400 guests, $799)
├── Each shows what's included in plain language
└── "Every package includes unlimited photos, video recording, and a 
    highlight reel for the couple."

FAQ
├── "When should I set this up?" — "Anytime before your wedding. 
│   Most couples set up 2-4 weeks before."
├── "Do my guests need to download an app?" — "No. It's a web app. 
│   They open a link and they're in."
├── "What if the venue has bad WiFi?" — "Everything works offline. 
│   Photos and videos upload automatically when they reconnect."
├── "Can I see a demo?" — "Yes! [Try the guest experience →]"
└── More questions as needed

FOOTER
├── CTA banner: "Ready to give your guests something unforgettable?"
│   → "Get Started" button
├── Links: About, Pricing, Demo, FAQ, Contact, Privacy, Terms
├── "Made with ❤️ for couples who want to remember everything"
```

**Design notes for the landing page:**
- Warm white background, NOT pure white. Use `--bg-warm-gradient`.
- Photography-forward: use warm, candid wedding photos (diverse couples). When you don't have real photos yet, use warm-toned gradient placeholders.
- Phone mockups showing the guest app throughout — this is a mobile product, show it on phones.
- Generous whitespace. Let the content breathe. This is a luxury product, not a feature checklist.
- The page should scroll smoothly. Sections should fade in as they enter the viewport (intersection observer + Framer Motion).
- Mobile-responsive: the landing page must look just as good on a phone as on desktop. Many couples will discover this ON their phone from a shared reel link.

### 2. PACKAGE BUILDER (`app/dashboard/create/page.tsx`)

Follow the guided flow in SCALING_PLAN.md §Pricing exactly. This is a multi-step form, NOT a pricing table. It should feel like a Typeform — one question at a time, warm and friendly, with a running total updating as they make selections.

**Design:**
- Each step is a full-width card with generous padding
- Options are large, tappable cards (NOT radio buttons)
- Running total floats at the bottom of the viewport
- Warm, encouraging copy at every step
- Progress indicator (subtle dots or a thin progress bar)
- "Why?" tooltips on each price component

### 3. COUPLE DASHBOARD (`app/dashboard/`)

**Aesthetic:** Clean, warm, reassuring. The couple needs to feel in control but not overwhelmed. Think Linear meets Zola — information density without feeling like a spreadsheet.

**Key screens:**
- **Dashboard home**: Wedding stats at a glance (guests registered, photos, videos, portraits), quick actions (share link, view feed, configure events), status banner ("Your wedding is in 47 days!")
- **Guest management**: Searchable table with CSV import, group labels, RSVP status
- **Event configuration**: Drag-and-drop event ordering, inline editing
- **Theme/branding**: Live preview as couple picks colors, fonts, presets
- **Analytics**: Simple charts (daily activity, photos per event, most popular filter)
- **"After the Party"**: Post-wedding dashboard — this needs to be its own emotional moment. Big stats, preview the highlight reel, write the thank-you, send the reels.

**Design notes:**
- Sidebar navigation on desktop, bottom tabs on mobile
- White cards on cream background
- Charts in warm colors (terracotta, golden, olive — NOT blue/gray defaults from chart libraries)
- All copy is warm and human, never robotic ("189 of your 217 guests have joined!" not "Guest registration: 87.1%")

### 4. GUEST APP (`app/w/[slug]/`)

This is where all our earlier design work applies. The guest app must feel like a native mobile app, not a website. Every screen should be immediately intuitive to anyone who's used Instagram or the iPhone camera.

**Navigation:** Bottom tab bar, always visible except in fullscreen camera/video modes.

**Home screen:**
- Welcome greeting: "Welcome back," + guest name in Playfair Display
- "Up Next" event banner (frosted glass pill with event color)
- Hero cards: Video Message + Photo Booth (2-column, rich gradients, decorative circles, glassmorphism icon holders)
- Secondary cards: Schedule, Guests, Gallery (3-column, smaller)
- Quick stats bar (events, guests, days to go)

**Photo Booth:**
- Full-screen camera viewfinder, NO dark letterbox bars
- Filter carousel at bottom organized by event category (Classic, Haldi ✨, Sangeet 🎤, Wedding 💍) with section dividers
- Mode toggle: Single / Burst / AI Portrait (frosted glass pill)
- Shutter button: 76px white circle with ring (iPhone camera style)
- Review screen after capture: photo with filter, "Save to Both" as primary CTA (terracotta gradient with gold "Recommended" badge), secondary options

**Video Recording:**
- Full camera viewfinder
- Frosted glass prompt card floating at top (Playfair text, large emoji, category badge, pagination dots, shuffle/skip)
- Mode toggle: Send a Message / Just Record
- Record button: 80px, inner red circle that shrinks to a rounded square (stop icon) when recording
- Timer pill when recording (red background, pulsing dot, "0:42 / 1:30")

**AI Portrait Studio:**
- After photo capture, style picker: grid of style cards (gradient backgrounds, emoji, name, time estimate)
- Popular styles highlighted with 🔥 badge
- Generation screen: shimmer animation on original photo, progress bar, fun fact about the style
- Reveal: confetti burst, before/after comparison toggle, "Save to Both" CTA

**Schedule:**
- Vertical timeline with gradient line connecting events
- Event cards with left border in event color, emoji, venue, dress code, logistics
- Current/next event highlighted with glow

**Gallery ("My Memories"):**
- Stats row at top (photos, videos, portraits counts)
- Filter tabs (All / Photos / Videos / Portraits)
- 3-column Instagram-style grid with 3px gaps
- Event badges on each item, play icons on videos, duration badges

**Guest Directory:**
- Search bar in white card with shadow
- Alphabetical section headers (sticky, terracotta letter)
- Alphabet sidebar on right edge
- Varied avatar colors based on name

**Social Feed:**
- Chronological timeline, simple and warm
- Post types: text, photo+caption, memory
- Like (heart) + comment interactions
- NOT the home screen — it's a secondary tab, easy to find but never in your face

**FAQ Chatbot:**
- Chat bubble interface, warm and conversational
- Floating chat button, NOT a full page
- Quick suggestion chips for common questions

### 5. REEL VIEWING PAGE (`app/w/[slug]/memories/[guestId]/page.tsx`)

This is the page guests land on from the delivery email. It must load FAST (ISR), look beautiful, and make sharing effortless. This is also the viral loop — the subtle "Want this for your wedding?" CTA at the bottom.

**Design:**
- Full-width video player (autoplay on tap, NOT autoplay on load)
- Guest name + couple names + wedding date as header
- Download button (prominent)
- Share buttons: Copy link, WhatsApp, Instagram Story, iMessage
- Below the video: scrollable gallery of their photos
- Thank-you card from the couple (saveable image)
- Subtle footer: "Made with [platform name]" + "Want this for your wedding?"

---

## Build Phases

### PHASE 0 — Foundation (Do This First)

```bash
npx create-next-app@latest wedding-platform --app --typescript --tailwind --eslint
cd wedding-platform
npm install @neondatabase/serverless @upstash/redis @upstash/ratelimit \
  @aws-sdk/client-s3 @aws-sdk/s3-request-presigner \
  stripe zod bcryptjs jsonwebtoken sharp uuid \
  framer-motion @remotion/player @remotion/lambda \
  react-email @react-email/components \
  openai pg
npm install -D vitest @vitejs/plugin-react @testing-library/react \
  @playwright/test @types/bcryptjs @types/jsonwebtoken @types/pg
```

**Then build in this order:**
1. Project structure (match SCALING_PLAN.md §Project Structure exactly)
2. SQL migrations (copy from MASTER_PRODUCTION_SPEC.md §4 — run against Neon)
3. Database client with RLS context setter (`lib/db/client.ts`)
4. R2 storage module (`lib/storage/r2.ts` — presigned URLs, multipart)
5. Environment variable validation (fail fast on missing vars)
6. Test infrastructure (setup.ts, helpers, fixtures — from MASTER_PRODUCTION_SPEC.md §17)
7. Run: `npm run test:unit` — should pass with mocked services

### PHASE 1 — Multi-Tenant Core

1. Edge middleware (`middleware.ts` — slug → wedding_id resolution, Redis cached)
2. Wedding config API (`/api/v1/w/[slug]/config`)
3. WeddingProvider context (`components/WeddingProvider.tsx`)
4. Guest auth (name search → autocomplete → session cookie)
5. Guest app layout + bottom nav
6. Home screen (server component for layout, client for interactions)
7. Schedule screen (server component — events from DB)
8. Guest directory (server component — guests from DB, search API)
9. Dynamic PWA manifest
10. SSR landing page for `/w/[slug]` with Open Graph meta tags
11. Run: `npm run test:all` — unit + integration + E2E guest registration

### PHASE 2 — Capture Features

1. Camera manager (ported from existing codebase)
2. Upload queue (rewritten for R2 presigned URLs)
3. Photo booth (full-screen camera, filter carousel, review screen)
4. Filters (CSS/Canvas, dynamic hashtag from config)
5. Video recording (prompted + freeform modes, timer)
6. Upload flow (presign → PUT → complete → thumbnail generation)
7. Gallery screen (media API, grid, tabs)
8. AI Portrait Studio (style picker → generate → reveal → save)
9. AI quota enforcement (server-side, from DB)
10. Run: Full capture flow tests — upload, filter, portrait generation

### PHASE 3 — Couple Dashboard + Billing

1. Couple auth (signup, login, JWT, email verification)
2. Dashboard layout (sidebar nav, warm aesthetic)
3. Create wedding flow
4. Guest import (CSV + gpt-4o-mini column mapping)
5. Event configuration (CRUD, drag-and-drop ordering)
6. Theme/branding configuration (live preview)
7. Filter + AI style selection
8. Prompt customization
9. Guided package builder (multi-step, running total)
10. Stripe checkout integration
11. Analytics dashboard
12. Run: Full couple onboarding E2E

### PHASE 4 — New Features

1. Social feed (CRUD, likes, comments, moderation)
2. FAQ chatbot (pgvector embeddings, RAG, chat UI)
3. Notification system (SES email, Twilio SMS, queue + cron)
4. Remotion reel templates (guest reel + couple highlight reel)
5. AI curation pipeline (Whisper transcription, photo scoring, emotional sequencing, beat detection)
6. Remotion Lambda rendering pipeline
7. Soundtrack upload + royalty-free library
8. Thank-you letter system (text/video/per-group/individual)
9. Post-wedding "After the Party" dashboard
10. Delivery email (React Email template)
11. Reel viewing page (ISR for viral sharing)
12. Auto-send configuration
13. Run: Full lifecycle E2E — couple signup → guest capture → deliverable generation → reel viewing

### PHASE 5 — Landing Page + Polish

1. Marketing landing page (the full structure described above)
2. Demo mode (sample wedding that anyone can try)
3. Redis caching (config, sessions, rate limiting)
4. CDN optimization (cache headers)
5. Performance profiling (meet the budgets in MASTER_PRODUCTION_SPEC.md §15)
6. Security headers (CSP, CORS, HSTS — from MASTER_PRODUCTION_SPEC.md §7)
7. Accessibility audit (MASTER_PRODUCTION_SPEC.md §16)
8. Health check endpoint
9. Sentry error tracking
10. CI/CD pipeline (GitHub Actions — from MASTER_PRODUCTION_SPEC.md §12)

---

## Technical Reminders

### Mobile-First, Always
Every screen is designed for a phone first. The guest app will be used 95% on mobile (phones and iPad kiosk). The couple dashboard should work on both desktop and mobile. The landing page must be responsive.

Test at these viewports:
- 375×812 (iPhone SE/13 mini)
- 390×844 (iPhone 14/15)
- 430×932 (iPhone 15 Pro Max)
- 768×1024 (iPad)
- 1440×900 (Desktop)

### Server Components vs. Client Components
- **Server Components** (default): Layout, schedule, directory, gallery grid, landing page sections. Zero client JS for static content.
- **Client Components** (`'use client'`): Camera/video (WebRTC), filter carousel, upload queue, AI portrait studio, social feed interactions, any animation with Framer Motion, bottom nav (active state), search inputs.

### Image Optimization
Use `next/image` for ALL images served from R2 CDN. Configure remote patterns in `next.config.ts`:
```typescript
images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'media.yourplatform.com' },
  ],
},
```

### Offline Support
The upload queue in `lib/upload-queue.ts` uses IndexedDB. If the network drops during a wedding (it will), captured photos and videos are stored locally and flush when connectivity returns. The service worker caches the app shell. Guest should never lose a capture.

### Copy Guidelines
All user-facing copy should be warm, human, and specific:
- ✅ "189 of your 217 guests have joined!"
- ❌ "Guest registration: 87.1%"
- ✅ "You've used all 5 of your portraits! Each one is a keepsake."
- ❌ "Error 429: Quota exceeded."
- ✅ "3 days later, the email arrives."
- ❌ "Delivery notification sent."

### What NOT to Do
- ❌ Do NOT use a component library (Material UI, Chakra, Ant Design). This product has its own design language. Use Tailwind + custom components.
- ❌ Do NOT use Inter, Roboto, Arial, or system fonts. Use Playfair Display + DM Sans.
- ❌ Do NOT use loading spinners. Use skeleton shimmer screens in cream tones.
- ❌ Do NOT use blue as a primary color anywhere in the product. Terracotta is the primary.
- ❌ Do NOT use dark mode. This is a warm, light product.
- ❌ Do NOT make the landing page look like a SaaS template. No hero section with floating screenshots on a blue gradient. It should feel like a wedding publication.
- ❌ Do NOT use bullet points in the UI (landing page copy, onboarding). Write in sentences and paragraphs.
- ❌ Do NOT make the guest app feel like a "product." No settings icons, no hamburger menus, no "powered by" headers. It should feel like part of the wedding.

---

## Testing Commands

Claude Code should be able to run these at any time to verify the build:

```bash
# Type checking
npx tsc --noEmit

# Lint
npm run lint

# Unit + integration tests (mocked external services)
npx vitest run tests/unit tests/integration

# E2E tests (requires built app)
npm run build
npm run start &
npx wait-on http://localhost:3000
npx playwright test

# All tests in sequence
npm run test:all

# Single test file
npx vitest run tests/unit/auth/guest-session.test.ts

# Coverage report
npx vitest run --coverage
```

All test implementations, mocks, fixtures, and helpers are documented in MASTER_PRODUCTION_SPEC.md §17. Use the programmatic test fixture generators (Sharp for images, minimal MP4 for videos) — no stock images needed.

---

## Definition of Done

A screen is "done" when:
1. It matches the design direction described above (warm, editorial, mobile-first)
2. It uses the correct fonts (Playfair Display + DM Sans)
3. It uses the correct color palette (terracotta primary, warm backgrounds)
4. Animations are smooth and purposeful (Framer Motion)
5. It works at all 5 viewport sizes listed above
6. It respects `prefers-reduced-motion`
7. Touch targets are ≥ 44×44px
8. All text meets WCAG AA contrast
9. Server components are used for static content, client components only where needed
10. Relevant tests pass

The product is "done" when `npm run test:all` passes, every page meets these criteria, and a couple can go from landing page → signup → create wedding → import guests → configure → pay → share link → guest registers → guest captures → couple triggers deliverables → guest receives reel.
