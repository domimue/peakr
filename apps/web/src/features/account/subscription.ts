/**
 * What the account page says about a subscription, from the user's `entitlements` rows (the
 * RevenueCat mirror). Pure, so it is unit-tested.
 */

export type Store = 'play_store' | 'app_store' | 'stripe' | 'other';
export type EntitlementId = 'training' | 'plus' | 'gym';

export interface EntitlementRow {
  entitlement: EntitlementId;
  product_id: string;
  store: Store;
  period_type: string;
  will_renew: boolean;
  expires_at: string | null;
  price_string: string | null;
  management_url: string | null;
}

export type SubscriptionStatus = 'trial' | 'active' | 'cancelled' | 'expired' | 'lifetime';

export interface SubscriptionView {
  /** The tier the user has (Plus over Training), or the Gym add-on. */
  entitlement: EntitlementId;
  status: SubscriptionStatus;
  /** Trial end, renewal or end of access. */
  date: string | null;
  store: Store;
  price: string | null;
  managementUrl: string | null;
}

export function statusOf(row: EntitlementRow, now: Date): SubscriptionStatus {
  if (row.expires_at === null) return 'lifetime';
  if (new Date(row.expires_at).getTime() <= now.getTime()) return 'expired';
  if (!row.will_renew) return 'cancelled';
  return row.period_type === 'trial' ? 'trial' : 'active';
}

/** One line per subscription: the tier (Plus replaces Training, same purchase) and the add-on. */
export function subscriptionViews(rows: readonly EntitlementRow[], now: Date): SubscriptionView[] {
  const byId = new Map(rows.map((r) => [r.entitlement, r]));
  const tier = byId.get('plus') ?? byId.get('training');
  return [tier, byId.get('gym')]
    .filter((r): r is EntitlementRow => r !== undefined)
    .map((r) => ({
      entitlement: r.entitlement,
      status: statusOf(r, now),
      date: r.expires_at,
      store: r.store,
      price: r.price_string,
      managementUrl: r.management_url,
    }));
}

/** Where a store subscription is managed (the store's own page). */
export function storeManagementUrl(view: SubscriptionView): string | null {
  if (view.managementUrl) return view.managementUrl;
  if (view.store === 'play_store') return 'https://play.google.com/store/account/subscriptions';
  if (view.store === 'app_store') return 'https://apps.apple.com/account/subscriptions';
  return null;
}
