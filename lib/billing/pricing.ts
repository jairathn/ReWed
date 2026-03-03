export interface PackageInput {
  guest_count: number;
  event_count: number;
  ai_portraits_per_guest: number;
  deliverables: 'couple_only' | 'wedding_party' | 'all_guests';
  social_feed: boolean;
  faq_chatbot: boolean;
  sms_notifications: boolean;
  theme_customization: 'preset' | 'full';
}

export interface PackagePrice {
  total_cents: number;
  our_cost_cents: number;
  breakdown: {
    base: number;
    portraits: number;
    deliverables: number;
    social_feed: number;
    faq_chatbot: number;
    sms: number;
    theme: number;
  };
}

// Internal cost per unit
const COSTS = {
  base_per_guest: 0.10, // ~$0.10 per guest for compute/storage
  base_minimum: 15_00, // $15 minimum base cost
  portrait_cost: 3, // $0.03 per portrait
  reel_per_guest: 12, // $0.12 per guest reel
  reel_couple: 50, // $0.50 for couple reel
  reel_wedding_party: 25, // $0.25 per wedding party reel (assume 10)
  faq_cost: 150, // $1.50 per wedding
  sms_per_guest: 2.4, // $0.024 per guest (~3 messages)
};

function getBasePriceCents(guestCount: number, eventCount: number): number {
  // Scale: 25 guests = $149, 100 = $199, 200 = $249, 300 = $299, 500+ = $349
  if (guestCount <= 50) return 149_00;
  if (guestCount <= 100) return 199_00;
  if (guestCount <= 200) return 249_00;
  if (guestCount <= 300) return 299_00;
  return 349_00;
}

function getPortraitPriceCents(perGuest: number, guestCount: number): number {
  const totalPortraits = perGuest * guestCount;
  // $0.15 per portrait to couple, rounding up to nice numbers
  return Math.ceil((totalPortraits * 15) / 100) * 100; // Round to nearest dollar
}

function getDeliverablePriceCents(deliverables: string, guestCount: number): number {
  switch (deliverables) {
    case 'couple_only': return 0; // Included in base
    case 'wedding_party': return 49_00;
    case 'all_guests': return Math.max(guestCount * 50, 50_00); // $0.50/guest, min $50
    default: return 0;
  }
}

export function calculatePackagePrice(input: PackageInput): PackagePrice {
  const base = getBasePriceCents(input.guest_count, input.event_count);
  const portraits = getPortraitPriceCents(input.ai_portraits_per_guest, input.guest_count);
  const deliverables = getDeliverablePriceCents(input.deliverables, input.guest_count);
  const social_feed = input.social_feed ? 25_00 : 0;
  const faq_chatbot = input.faq_chatbot ? 25_00 : 0;
  const sms = input.sms_notifications ? Math.max(input.guest_count * 15, 29_00) : 0;
  const theme = input.theme_customization === 'full' ? 39_00 : 0;

  const total_cents = base + portraits + deliverables + social_feed + faq_chatbot + sms + theme;

  // Calculate our costs
  const baseCost = Math.max(Math.round(input.guest_count * COSTS.base_per_guest), COSTS.base_minimum);
  const portraitCost = Math.round(input.ai_portraits_per_guest * input.guest_count * COSTS.portrait_cost);

  let deliverableCost = COSTS.reel_couple; // Always have couple reel
  if (input.deliverables === 'wedding_party') {
    deliverableCost += 10 * COSTS.reel_wedding_party;
  } else if (input.deliverables === 'all_guests') {
    deliverableCost += input.guest_count * COSTS.reel_per_guest;
  }

  const faqCost = input.faq_chatbot ? COSTS.faq_cost : 0;
  const smsCost = input.sms_notifications ? Math.round(input.guest_count * COSTS.sms_per_guest) : 0;

  const our_cost_cents = baseCost + portraitCost + deliverableCost + faqCost + smsCost;

  // Ensure minimum $200 profit
  const profit = total_cents - our_cost_cents;
  const finalTotal = profit < 200_00 ? our_cost_cents + 200_00 : total_cents;

  return {
    total_cents: finalTotal,
    our_cost_cents,
    breakdown: {
      base,
      portraits,
      deliverables,
      social_feed,
      faq_chatbot,
      sms,
      theme,
    },
  };
}
