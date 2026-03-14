export const ErrorCodes = {
  // Auth
  AUTH_INVALID_CREDENTIALS: { status: 401, message: "Invalid email or password" },
  AUTH_TOKEN_EXPIRED: { status: 401, message: "Session expired. Please log in again." },
  AUTH_NOT_REGISTERED: { status: 401, message: "Please sign in by selecting your name on the guest list" },
  AUTH_GUEST_NOT_FOUND: { status: 404, message: "We couldn't find that name on the guest list. Try a different spelling?" },

  // Tenant
  WEDDING_NOT_FOUND: { status: 404, message: "Wedding not found" },
  WEDDING_INACTIVE: { status: 403, message: "This wedding is no longer active" },
  WEDDING_SLUG_TAKEN: { status: 409, message: "That URL is already taken. Try another!" },

  // Upload
  UPLOAD_TOO_LARGE: { status: 413, message: "File is too large. Photos max 25MB, videos max 500MB." },
  UPLOAD_INVALID_TYPE: { status: 400, message: "We accept JPG, PNG, HEIC photos and MP4, MOV, WebM videos." },
  UPLOAD_PRESIGN_EXPIRED: { status: 410, message: "Upload link expired. Tap 'Save' again." },

  // AI
  AI_QUOTA_GUEST: { status: 429, message: "You've used all {limit} of your portraits! Each one is a keepsake." },
  AI_QUOTA_WEDDING: { status: 429, message: "The portrait limit for this wedding has been reached." },
  AI_GENERATION_FAILED: { status: 502, message: "Portrait creation failed. Please try again." },
  AI_RATE_LIMITED: { status: 429, message: "Please wait a moment before creating another portrait." },

  // Feed
  FEED_POST_TOO_LONG: { status: 400, message: "Keep it under 500 characters!" },
  FEED_POST_HIDDEN: { status: 403, message: "This post is no longer available" },

  // Billing
  BILLING_PAYMENT_FAILED: { status: 402, message: "Payment failed. Please try another card." },
  BILLING_FEATURE_LOCKED: { status: 403, message: "This feature isn't included in your package. Upgrade to unlock it!" },

  // General
  RATE_LIMITED: { status: 429, message: "Too many requests. Please slow down." },
  INTERNAL_ERROR: { status: 500, message: "Something went wrong. We're looking into it." },
  VALIDATION_ERROR: { status: 400, message: "Please check your input." },
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(code: ErrorCode, details?: string) {
    const errorDef = ErrorCodes[code];
    super(details || errorDef.message);
    this.status = errorDef.status;
    this.code = code;
    this.name = 'AppError';
  }

  toResponse(): Response {
    return Response.json(
      { error: { code: this.code, message: this.message } },
      { status: this.status }
    );
  }
}

export function handleApiError(error: unknown): Response {
  if (error instanceof AppError) {
    return error.toResponse();
  }

  // Handle Zod validation errors
  if (error && typeof error === 'object' && 'issues' in error) {
    const zodError = error as { issues: Array<{ path: (string | number)[]; message: string }> };
    const firstIssue = zodError.issues[0];
    const field = firstIssue?.path?.join('.') || 'input';
    const message = firstIssue?.message || 'Invalid input';
    return Response.json(
      { error: { code: 'VALIDATION_ERROR', message: `${field}: ${message}` } },
      { status: 400 }
    );
  }

  console.error('Unhandled error:', error);
  const isDev = process.env.NODE_ENV !== 'production';
  const detail = isDev && error instanceof Error ? error.message : undefined;
  return Response.json(
    { error: { code: 'INTERNAL_ERROR', message: detail || ErrorCodes.INTERNAL_ERROR.message } },
    { status: 500 }
  );
}
