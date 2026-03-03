import { calculatePackagePrice, type PackageInput, type PackagePrice } from './pricing';

/**
 * Billing service with mock mode fallback.
 *
 * When STRIPE_SECRET_KEY is set, uses real Stripe.
 * Otherwise, returns mock responses that look identical to the frontend.
 */

export interface CheckoutResult {
  checkout_url: string;
  session_id: string;
  mode: 'live' | 'test';
}

export interface SubscriptionStatus {
  id: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';
  current_period_end: string;
  package_config: PackageInput;
  price: PackagePrice;
  mode: 'live' | 'test';
}

function isStripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

async function getStripe() {
  if (!isStripeConfigured()) {
    throw new Error('Stripe is not configured');
  }
  const { default: Stripe } = await import('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

// ── Mock billing (used when Stripe is not configured) ──

function mockSessionId(): string {
  return `mock_cs_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function mockSubscriptionId(): string {
  return `mock_sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ── Public API ──

/**
 * Create a checkout session (or mock one).
 */
export async function createCheckoutSession(params: {
  coupleId: string;
  weddingId: string;
  packageConfig: PackageInput;
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutResult> {
  const price = calculatePackagePrice(params.packageConfig);

  if (!isStripeConfigured()) {
    // Mock mode: return a fake checkout URL that the dashboard handles
    const sessionId = mockSessionId();
    return {
      checkout_url: `${params.successUrl}?session_id=${sessionId}&mock=true`,
      session_id: sessionId,
      mode: 'test',
    };
  }

  // Real Stripe
  const stripe = await getStripe();

  // Upsert Stripe customer
  const { getPool } = await import('../db/client');
  const pool = getPool();
  const coupleRow = await pool.query(
    'SELECT stripe_customer_id, email FROM couples WHERE id = $1',
    [params.coupleId]
  );

  let customerId = coupleRow.rows[0]?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: coupleRow.rows[0]?.email,
      metadata: { couple_id: params.coupleId, wedding_id: params.weddingId },
    });
    customerId = customer.id;
    await pool.query(
      'UPDATE couples SET stripe_customer_id = $1 WHERE id = $2',
      [customerId, params.coupleId]
    );
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'ReWed Wedding Package',
          description: `${params.packageConfig.guest_count} guests, ${params.packageConfig.event_count} events`,
        },
        unit_amount: price.total_cents,
      },
      quantity: 1,
    }],
    success_url: params.successUrl + '?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: params.cancelUrl,
    metadata: {
      couple_id: params.coupleId,
      wedding_id: params.weddingId,
      package_config: JSON.stringify(params.packageConfig),
    },
  });

  return {
    checkout_url: session.url!,
    session_id: session.id,
    mode: 'live',
  };
}

/**
 * Get subscription status for a wedding.
 */
export async function getSubscriptionStatus(weddingId: string): Promise<SubscriptionStatus | null> {
  const { getPool } = await import('../db/client');
  const pool = getPool();

  const result = await pool.query(
    `SELECT s.*, w.package_config
     FROM subscriptions s
     JOIN weddings w ON w.id = s.wedding_id
     WHERE s.wedding_id = $1
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [weddingId]
  );

  if (result.rows.length === 0) return null;

  const sub = result.rows[0];
  const packageConfig = sub.package_config as PackageInput;
  const price = calculatePackagePrice(packageConfig);

  return {
    id: sub.stripe_subscription_id || sub.id,
    status: sub.status,
    current_period_end: sub.current_period_end,
    package_config: packageConfig,
    price,
    mode: sub.stripe_subscription_id?.startsWith('mock_') ? 'test' : 'live',
  };
}

/**
 * Activate a subscription after successful checkout (mock or real).
 */
export async function activateSubscription(params: {
  weddingId: string;
  coupleId: string;
  sessionId: string;
  packageConfig: PackageInput;
}): Promise<void> {
  const { getPool } = await import('../db/client');
  const pool = getPool();
  const price = calculatePackagePrice(params.packageConfig);

  const isMock = params.sessionId.startsWith('mock_');

  await pool.query(
    `INSERT INTO subscriptions (
       wedding_id, stripe_subscription_id, stripe_checkout_session_id,
       status, current_period_start, current_period_end,
       amount_cents, package_snapshot
     ) VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL '1 year', $5, $6)
     ON CONFLICT (wedding_id) DO UPDATE SET
       stripe_subscription_id = EXCLUDED.stripe_subscription_id,
       stripe_checkout_session_id = EXCLUDED.stripe_checkout_session_id,
       status = EXCLUDED.status,
       current_period_start = EXCLUDED.current_period_start,
       current_period_end = EXCLUDED.current_period_end,
       amount_cents = EXCLUDED.amount_cents,
       package_snapshot = EXCLUDED.package_snapshot`,
    [
      params.weddingId,
      isMock ? mockSubscriptionId() : params.sessionId,
      params.sessionId,
      'active',
      price.total_cents,
      JSON.stringify(params.packageConfig),
    ]
  );

  // Activate the wedding and save its package config
  await pool.query(
    `UPDATE weddings SET status = 'active', package_config = $1 WHERE id = $2`,
    [JSON.stringify(params.packageConfig), params.weddingId]
  );
}
