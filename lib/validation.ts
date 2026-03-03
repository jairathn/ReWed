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

export function sanitizeText(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .trim()
    .slice(0, 2000);
}
