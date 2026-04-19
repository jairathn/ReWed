// Standard API response types

export type ApiResponse<T> = {
  data: T;
  error?: never;
} | {
  data?: never;
  error: { code: string; message: string; details?: unknown };
};

export type CursorPagination = {
  cursor?: string;
  limit?: number;
};

export type PaginatedResponse<T> = {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
};

export type WeddingPlanner = {
  name: string | null;
  email: string | null;
};

export type HomeCardImage = {
  /** Full URL or site-relative path for the image. */
  url: string;
  /** @deprecated Legacy focal-point field. Use `crop` instead. Kept for
   *  backward compatibility with rows written before the crop editor shipped. */
  position: string;
  /** Crop/zoom data set via the interactive editor. When present, the guest
   *  page renders the image with `transform: scale(zoom)` centered on (x, y). */
  crop?: {
    /** Horizontal position 0-100 (0 = left edge, 50 = center, 100 = right). */
    x: number;
    /** Vertical position 0-100 (0 = top, 50 = center, 100 = bottom). */
    y: number;
    /** Zoom level. 1 = image just covers the frame (min), up to 3. */
    zoom: number;
  };
};

export type WeddingConfig = {
  wedding_id: string;
  slug: string;
  display_name: string;
  couple_names: { name1: string; name2: string };
  hashtag: string;
  wedding_date: string | null;
  timezone: string;
  venue_city: string | null;
  venue_country: string | null;
  venue_lat: number | null;
  venue_lng: number | null;
  status: 'setup' | 'active' | 'post_wedding' | 'archived';
  wedding_planner: WeddingPlanner | null;
  /** Optional background image shown behind all guest pages. */
  guest_background: {
    url: string;
    opacity: number;
  } | null;
  /** Optional couple-provided image URLs shown in the guest home bento cards. */
  home_card_images: {
    schedule: HomeCardImage | null;
    travel: HomeCardImage | null;
  };
  theme: {
    preset: string;
    colors: { primary: string; secondary: string; bg: string; text: string };
    fonts: { heading: string; body: string };
  };
  prompts: {
    heartfelt: string[];
    fun: string[];
    quick_takes: string[];
  };
  enabled_filters: string[];
  enabled_ai_styles: string[];
  /**
   * Optional external RSVP/website URL. The guest home surfaces a button
   * linking here so guests who need to change their RSVP can jump to the
   * couple's existing Zola / The Knot / standalone wedding website.
   */
  rsvp_url: string | null;
  /**
   * Optional passcode for the external wedding website. When set, clicking
   * the RSVP button copies this to the clipboard and shows a toast before
   * opening the link — so guests can just paste on the other side.
   */
  rsvp_passcode: string | null;
  /**
   * Optional invite link (Canva, Paperless Post, PDF in Drive, etc.).
   * Surfaces next to the RSVP button on the guest home.
   */
  invite_url: string | null;
  events: EventConfig[];
  features: {
    social_feed: boolean;
    faq_chatbot: boolean;
    sms_notifications: boolean;
    ai_portraits: boolean;
    ai_portraits_per_guest: number;
  };
};

export type EventConfig = {
  id: string;
  name: string;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  venue_name: string | null;
  venue_address: string | null;
  dress_code: string | null;
  description: string | null;
  logistics: string | null;
  accent_color: string | null;
};

export type GuestProfile = {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string | null;
  group_label: string | null;
};

export type MediaItem = {
  id: string;
  type: 'photo' | 'video' | 'portrait';
  url: string;
  thumbnail_url: string;
  event_name: string | null;
  filter_applied: string | null;
  duration_ms: number | null;
  prompt_answered: string | null;
  favorited: boolean;
  created_at: string;
};
