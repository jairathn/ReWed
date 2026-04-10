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
  favorited: boolean;
  created_at: string;
};
