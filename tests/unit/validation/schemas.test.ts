import { describe, it, expect } from 'vitest';
import { slugSchema, guestSearchSchema, uploadPresignSchema, feedPostSchema, sanitizeText } from '@/lib/validation';

describe('Validation Schemas', () => {
  describe('slugSchema', () => {
    it('accepts valid slugs', () => {
      expect(slugSchema.safeParse('neil-shriya').success).toBe(true);
      expect(slugSchema.safeParse('my-wedding-2026').success).toBe(true);
      expect(slugSchema.safeParse('abc').success).toBe(true);
    });

    it('rejects invalid slugs', () => {
      expect(slugSchema.safeParse('ab').success).toBe(false); // too short
      expect(slugSchema.safeParse('Neil-Shriya').success).toBe(false); // uppercase
      expect(slugSchema.safeParse('-starts-with-dash').success).toBe(false);
      expect(slugSchema.safeParse('ends-with-dash-').success).toBe(false);
    });
  });

  describe('guestSearchSchema', () => {
    it('accepts valid search queries', () => {
      const result = guestSearchSchema.safeParse({ q: 'Adi', limit: 5 });
      expect(result.success).toBe(true);
    });

    it('rejects short queries', () => {
      expect(guestSearchSchema.safeParse({ q: 'A' }).success).toBe(false);
    });

    it('applies default limit', () => {
      const result = guestSearchSchema.safeParse({ q: 'Adi' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
      }
    });
  });

  describe('uploadPresignSchema', () => {
    it('accepts valid photo upload', () => {
      const result = uploadPresignSchema.safeParse({
        type: 'photo',
        mime_type: 'image/jpeg',
        size_bytes: 5_000_000,
      });
      expect(result.success).toBe(true);
    });

    it('rejects oversized files', () => {
      const result = uploadPresignSchema.safeParse({
        type: 'video',
        mime_type: 'video/mp4',
        size_bytes: 600_000_000,
      });
      expect(result.success).toBe(false);
    });

    it('rejects unsupported file types', () => {
      const result = uploadPresignSchema.safeParse({
        type: 'photo',
        mime_type: 'application/pdf',
        size_bytes: 1000,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('feedPostSchema', () => {
    it('accepts text post', () => {
      const result = feedPostSchema.safeParse({ type: 'text', content: 'Hello!' });
      expect(result.success).toBe(true);
    });

    it('rejects empty post', () => {
      const result = feedPostSchema.safeParse({ type: 'text' });
      expect(result.success).toBe(false);
    });
  });

  describe('sanitizeText', () => {
    it('strips HTML tags', () => {
      expect(sanitizeText('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script');
    });

    it('strips control characters', () => {
      expect(sanitizeText('hello\x00world')).toBe('helloworld');
    });

    it('trims whitespace', () => {
      expect(sanitizeText('  hello  ')).toBe('hello');
    });

    it('caps length at 2000', () => {
      const long = 'a'.repeat(3000);
      expect(sanitizeText(long).length).toBe(2000);
    });
  });
});
