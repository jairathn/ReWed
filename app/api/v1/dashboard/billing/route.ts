import { NextRequest } from 'next/server';
import { handleApiError, AppError } from '@/lib/errors';
import { calculatePackagePrice, type PackageInput } from '@/lib/billing/pricing';
import {
  createCheckoutSession,
  getSubscriptionStatus,
  activateSubscription,
} from '@/lib/billing/stripe';

/**
 * GET /api/v1/dashboard/billing
 * Returns pricing estimate or current subscription status.
 *
 * Query params for estimate: guest_count, event_count, etc.
 * Or: ?wedding_id=xxx to get current subscription.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const weddingId = searchParams.get('wedding_id');

    // If wedding_id provided, return subscription status
    if (weddingId) {
      const status = await getSubscriptionStatus(weddingId);
      return Response.json({ subscription: status });
    }

    // Otherwise, calculate a price estimate
    const input: PackageInput = {
      guest_count: Number(searchParams.get('guest_count') || 100),
      event_count: Number(searchParams.get('event_count') || 1),
      ai_portraits_per_guest: Number(searchParams.get('ai_portraits_per_guest') || 3),
      deliverables: (searchParams.get('deliverables') as PackageInput['deliverables']) || 'couple_only',
      social_feed: searchParams.get('social_feed') === 'true',
      faq_chatbot: searchParams.get('faq_chatbot') === 'true',
      sms_notifications: searchParams.get('sms_notifications') === 'true',
      theme_customization: (searchParams.get('theme_customization') as PackageInput['theme_customization']) || 'preset',
    };

    const price = calculatePackagePrice(input);
    return Response.json({ estimate: price, input });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/dashboard/billing
 * Create a checkout session (real Stripe or mock).
 *
 * Body: { couple_id, wedding_id, package_config }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { couple_id, wedding_id, package_config } = body;

    if (!couple_id || !wedding_id || !package_config) {
      throw new AppError('VALIDATION_ERROR', 'couple_id, wedding_id, and package_config are required');
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const result = await createCheckoutSession({
      coupleId: couple_id,
      weddingId: wedding_id,
      packageConfig: package_config,
      successUrl: `${appUrl}/dashboard/billing/success`,
      cancelUrl: `${appUrl}/dashboard/billing`,
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/v1/dashboard/billing
 * Confirm/activate a subscription after checkout completes.
 *
 * Body: { wedding_id, couple_id, session_id, package_config }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { wedding_id, couple_id, session_id, package_config } = body;

    if (!wedding_id || !couple_id || !session_id || !package_config) {
      throw new AppError('VALIDATION_ERROR', 'wedding_id, couple_id, session_id, and package_config are required');
    }

    await activateSubscription({
      weddingId: wedding_id,
      coupleId: couple_id,
      sessionId: session_id,
      packageConfig: package_config,
    });

    return Response.json({ status: 'active', message: 'Subscription activated successfully' });
  } catch (error) {
    return handleApiError(error);
  }
}
