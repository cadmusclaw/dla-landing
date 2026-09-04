/**
 * Pay model: paid by the load and by mileage.
 *
 * Rate card (see config.payment):
 *   0-50 mi   $150      101-150 mi  $225      201+ mi  $2.00 / mile
 *   51-100 mi $175      151-200 mi  $275
 *
 * The bands are flat per load; only the last one is per-mile, and it steps up
 * rather than continuing the curve (200 mi = $275, 201 mi = $402). That is the
 * rate card as given.
 */

/** Pay for one load at a given billable mileage. */
export function loadPayUsd(miles, config) {
  const { tiers, overflowPerMileUsd, roundMilesToWhole } = config.payment;
  const billable = roundMilesToWhole ? Math.round(miles) : miles;
  let floor = 0;
  for (const tier of tiers) {
    if (billable <= tier.maxMiles) {
      return {
        payUsd: tier.flatUsd,
        billableMiles: billable,
        band: `${floor}-${tier.maxMiles} mi flat`,
      };
    }
    floor = tier.maxMiles + 1;
  }
  return {
    payUsd: billable * overflowPerMileUsd,
    billableMiles: billable,
    band: `${tiers[tiers.length - 1].maxMiles + 1}+ mi @ $${overflowPerMileUsd}/mi`,
  };
}

/**
 * Billable mileage for each stop on a run, and the run's total pay.
 *
 * mileageBasis:
 *   'yard_to_stop' (default) - one-way yard -> delivery address per load
 *   'route_leg'              - the leg actually driven to reach that stop
 */
export function computeRunPay({ sequence, yard, provider, config }) {
  const basis = config.payment.mileageBasis;
  const stops = sequence.map((order, i) => {
    const miles =
      basis === 'route_leg'
        ? provider.distanceMiles(i === 0 ? yard : sequence[i - 1], order)
        : provider.distanceMiles(yard, order);
    const { payUsd, billableMiles, band } = loadPayUsd(miles, config);
    return { orderId: order.id, billableMiles, payUsd, payBand: band };
  });
  return {
    stops,
    totalPayUsd: stops.reduce((sum, s) => sum + s.payUsd, 0),
    mileageBasis: basis,
  };
}

/** What an unassigned load would have paid if it had gone out today. */
export function potentialPayUsd({ order, yard, provider, config }) {
  return loadPayUsd(provider.distanceMiles(yard, order), config);
}

export const usd = (n) =>
  `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
