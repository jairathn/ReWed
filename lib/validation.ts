import { z } from 'zod';

export const slugSchema = z.string()
  .min(3).max(60)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "URL must be lowercase letters, numbers, and dashes");

export const guestSearchSchema = z.object({
  q: z.string().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export const uploadPresignSchema = z.object({
  type: z.enum(['photo', 'video']),
  mime_type: z.string().refine(
    (v) => ['image/jpeg', 'image/png', 'image/heic', 'image/webp',
            'video/mp4', 'video/quicktime', 'video/webm'].includes(v),
    "Unsupported file type"
  ),
  size_bytes: z.number().int().positive()
    .refine((v) => v <= 500_000_000, "File too large (max 500MB)"),
  event_id: z.string().uuid().optional(),
});

export const feedPostSchema = z.object({
  type: z.enum(['text', 'photo', 'memory']),
  content: z.string().max(500).optional(),
  photo_upload_id: z.string().uuid().optional(),
}).refine(
  (d) => d.content || d.photo_upload_id,
  "Post must have text content or a photo"
);

export const guestRegisterSchema = z.object({
  guest_id: z.string().uuid(),
});

// Travel plan validation
const travelStopInputSchema = z.object({
  stop_type: z.enum(['origin', 'pre_wedding', 'arrival', 'departure', 'post_wedding', 'return']),
  city: z.string().min(1).max(200),
  region: z.string().max(200).optional(),
  country: z.string().min(1).max(100),
  country_code: z.string().max(5).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  arrive_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional(),
  depart_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional(),
  arrive_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).transform(s => s.slice(0, 5)).optional(),
  depart_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).transform(s => s.slice(0, 5)).optional(),
  transport_mode: z.enum(['flight', 'train', 'car', 'bus', 'ferry']).optional(),
  transport_details: z.string().max(200).optional(),
  accommodation: z.string().max(200).optional(),
  open_to_meetup: z.boolean().default(true),
  notes: z.string().max(500).optional(),
  sort_order: z.number().int().min(0).default(0),
});

export const travelPlanSchema = z.object({
  plan_type: z.enum(['direct', 'exploring']),
  origin_city: z.string().max(200).optional(),
  origin_lat: z.number().min(-90).max(90).optional(),
  origin_lng: z.number().min(-180).max(180).optional(),
  origin_country: z.string().max(100).optional(),
  share_transport: z.boolean().default(false),
  share_contact: z.string().max(200).optional(),
  visibility: z.enum(['full', 'city_only', 'private']).default('full'),
  notes: z.string().max(500).optional(),
  stops: z.array(travelStopInputSchema).min(1).max(20),
}).refine(
  (d) => !d.share_transport || (d.share_contact && d.share_contact.trim().length > 0),
  { message: 'Phone or email is required when sharing rides', path: ['share_contact'] }
);

export type TravelStopInput = z.infer<typeof travelStopInputSchema>;

export function sanitizeText(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .trim()
    .slice(0, 2000);
}
