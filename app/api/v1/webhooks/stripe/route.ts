import { NextRequest } from 'next/server';
import { handleApiError } from '@/lib/errors';

/**
 * POST /api/v1/webhooks/stripe
 * Handles Stripe webhook events.
 *
 * In test mode (no STRIPE_WEBHOOK_SECRET), logs the event and returns 200.
 * In production, verifies the webhook signature before processing.
 */
export async function POST(request: NextRequest) {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const body = await request.text();

    // If Stripe is not configured, accept but log
    if (!webhookSecret) {
      console.log('[stripe-webhook] Test mode — no webhook secret configured');
      try {
        const event = JSON.parse(body);
        console.log(`[stripe-webhook] Received event: ${event.type}`);
      } catch {
        // Not valid JSON, ignore
      }
      return Response.json({ received: true, mode: 'test' });
    }

    // Verify webhook signature
    const signature = request.headers.get('stripe-signature');
    if (!signature) {
      return Response.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { couple_id, wedding_id, package_config } = session.metadata || {};

        if (couple_id && wedding_id && package_config) {
          const { activateSubscription } = await import('@/lib/billing/stripe');
          await activateSubscription({
            weddingId: wedding_id,
            coupleId: couple_id,
            sessionId: session.id,
            packageConfig: JSON.parse(package_config),
          });
          console.log(`[stripe-webhook] Activated subscription for wedding ${wedding_id}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const { getPool } = await import('@/lib/db/client');
        const pool = getPool();
        await pool.query(
          `UPDATE subscriptions SET status = $1, current_period_end = $2
           WHERE stripe_subscription_id = $3`,
          [
            subscription.status,
            new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000).toISOString(),
            subscription.id,
          ]
        );
        console.log(`[stripe-webhook] Updated subscription ${subscription.id} → ${subscription.status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const { getPool } = await import('@/lib/db/client');
        const pool = getPool();
        await pool.query(
          `UPDATE subscriptions SET status = 'canceled' WHERE stripe_subscription_id = $1`,
          [subscription.id]
        );
        console.log(`[stripe-webhook] Canceled subscription ${subscription.id}`);
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    return Response.json({ received: true, mode: 'live' });
  } catch (error) {
    console.error('[stripe-webhook] Error:', error);
    return handleApiError(error);
  }
}
