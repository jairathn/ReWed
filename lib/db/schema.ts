// Database type definitions for all tables

export interface Couple {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  stripe_customer_id: string | null;
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Wedding {
  id: string;
  couple_id: string;
  slug: string;
  display_name: string;
  hashtag: string | null;
  wedding_date: string | null;
  timezone: string;
  status: 'setup' | 'active' | 'post_wedding' | 'archived';
  config: WeddingConfigData;
  package_config: PackageConfigData;
  storage_used_bytes: number;
  ai_portraits_used: number;
  created_at: Date;
  updated_at: Date;
}

export interface WeddingConfigData {
  couple_names: { name1: string; name2: string };
  hashtag: string;
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
}

export interface PackageConfigData {
  guest_limit: number;
  event_limit: number;
  storage_gb: number;
  ai_portraits_per_guest: number;
  deliverables: 'couple_only' | 'wedding_party' | 'all_guests';
  social_feed: boolean;
  faq_chatbot: boolean;
  sms_notifications?: boolean;
  theme_customization?: 'preset' | 'full';
}

export interface Event {
  id: string;
  wedding_id: string;
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
  sort_order: number;
  created_at: Date;
}

export interface Guest {
  id: string;
  wedding_id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  group_label: string | null;
  rsvp_status: 'pending' | 'attending' | 'declined';
  title: string | null;
  suffix: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  party_id: string | null;
  party_role: 'primary' | 'partner' | 'child';
  relationship: string | null;
  created_at: Date;
}

export interface Session {
  id: string;
  wedding_id: string;
  guest_id: string;
  device_type: 'mobile' | 'kiosk_ipad' | 'desktop';
  token_hash: string;
  user_agent: string | null;
  last_active: Date;
  created_at: Date;
}

export interface Upload {
  id: string;
  wedding_id: string;
  guest_id: string;
  event_id: string | null;
  type: 'photo' | 'video';
  storage_key: string;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  filter_applied: string | null;
  prompt_answered: string | null;
  thumbnail_key: string | null;
  transcode_key: string | null;
  status: 'pending' | 'uploading' | 'processing' | 'ready' | 'failed';
  retry_count: number;
  created_at: Date;
}

export interface AiJob {
  id: string;
  wedding_id: string;
  guest_id: string;
  type: 'portrait' | 'reel_guest' | 'reel_couple';
  style_id: string | null;
  input_key: string | null;
  output_key: string | null;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  cost_cents: number | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

export interface FeedPost {
  id: string;
  wedding_id: string;
  guest_id: string;
  type: 'text' | 'photo' | 'memory';
  content: string | null;
  photo_key: string | null;
  like_count: number;
  comment_count: number;
  is_pinned: boolean;
  is_hidden: boolean;
  created_at: Date;
}

export interface FeedLike {
  id: string;
  post_id: string;
  guest_id: string;
  created_at: Date;
}

export interface FeedComment {
  id: string;
  post_id: string;
  guest_id: string;
  content: string;
  created_at: Date;
}

export interface FaqEntry {
  id: string;
  wedding_id: string;
  question: string;
  answer: string;
  embedding: number[] | null;
  source: 'manual' | 'zola_import' | 'generated';
  created_at: Date;
}

export interface FaqCache {
  id: string;
  wedding_id: string;
  question_hash: string;
  answer: string;
  hit_count: number;
  created_at: Date;
}

export interface Notification {
  id: string;
  wedding_id: string;
  guest_id: string | null;
  channel: 'email' | 'sms' | 'push';
  type: string;
  payload: Record<string, unknown>;
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'bounced';
  external_id: string | null;
  retry_count: number;
  sent_at: Date | null;
  created_at: Date;
}

export interface Subscription {
  id: string;
  wedding_id: string;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id: string | null;
  status: 'pending' | 'active' | 'past_due' | 'canceled';
  price_cents: number;
  package_snapshot: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}
