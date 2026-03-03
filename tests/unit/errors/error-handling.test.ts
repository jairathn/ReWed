import { describe, it, expect } from 'vitest';
import { AppError, handleApiError, ErrorCodes } from '@/lib/errors';

describe('Error Handling', () => {
  describe('AppError', () => {
    it('creates error with correct status and code', () => {
      const error = new AppError('WEDDING_NOT_FOUND');
      expect(error.status).toBe(404);
      expect(error.code).toBe('WEDDING_NOT_FOUND');
      expect(error.message).toBe('Wedding not found');
    });

    it('allows custom message', () => {
      const error = new AppError('VALIDATION_ERROR', 'Name is required');
      expect(error.message).toBe('Name is required');
      expect(error.status).toBe(400);
    });

    it('converts to Response', async () => {
      const error = new AppError('AUTH_NOT_REGISTERED');
      const response = error.toResponse();
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error.code).toBe('AUTH_NOT_REGISTERED');
    });
  });

  describe('handleApiError', () => {
    it('handles AppError', async () => {
      const response = handleApiError(new AppError('RATE_LIMITED'));
      expect(response.status).toBe(429);
    });

    it('handles unknown errors as 500', async () => {
      const response = handleApiError(new Error('something broke'));
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
