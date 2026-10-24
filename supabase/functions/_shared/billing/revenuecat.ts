/**
 * RevenueCat → `entitlements` rows (CLAUDE.md "Monetisation": RevenueCat is the single source of
 * entitlements, the app user id is the Supabase user id). Pure, so it is unit-tested in
 * `packages/billing`.
 *
 * A webhook event only tells us *which* users changed; their state is read back from the REST API
 * (`GET /v1/subscribers/{id}`) and replaces what we stored. That makes out-of-order, duplicate and
 * transfer events harmless.
 */

export const ENTITLEMENTS = ['training', 'plus', 'gym'] as const;
export type EntitlementId = (typeof ENTITLEMENTS)[number];

export type Store = 'play_store' | 'app_store' | 'stripe' | 'other';

/** One row per user and entitlement, active or expired (`expires_at` decides). */
export interface EntitlementRow {
  user_id: string;
  entitlement: EntitlementId;
  product_id: string;
  store: Store;
  /** `trial`, `normal`, `intro`, `prepaid`. */
  period_type: string;
  will_renew: boolean;
  /** Null: does not expire. */
  expires_at: string | null;
  /** Localised price of the product ("CHF 59.00"), from the subscriber attributes. */
  price_string: string | null;
  management_url: string | null;
}

/** The parts of a RevenueCat webhook body we read. */
export interface WebhookBody {
  api_version?: string;
  event?: {
    id?: string;
    type?: string;
    app_user_id?: string;
    original_app_user_id?: string;
    aliases?: string[];
    transferred_from?: string[];
    transferred_to?: string[];
    environment?: string;
  };
}

/** The parts of `GET /v1/subscribers/{id}` we read. */
export interface SubscriberResponse {
  subscriber?: {
    entitlements?: Record<
      string,
      {
        product_identifier?: string;
        expires_date?: string | null;
        grace_period_expires_date?: string | null;
      }
    >;
    subscriptions?: Record<
      string,
      {
        store?: string;
        period_type?: string;
        expires_date?: string | null;
        unsubscribe_detected_at?: string | null;
        billing_issues_detected_at?: string | null;
        refunded_at?: string | null;
        management_url?: string | null;
      }
    >;
    subscriber_attributes?: Record<string, { value?: string } | undefined>;
    management_url?: string | null;
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Supabase users an event concerns. Anonymous RevenueCat ids (`$RCAnonymousID:…`, a purchase
 * before sign-in) are skipped: the purchase reaches the user with the TRANSFER / alias event that
 * follows the sign-in.
 */
export function usersOfEvent(body: WebhookBody): string[] {
  const e = body.event;
  if (!e) return [];
  const ids = [
    e.app_user_id,
    e.original_app_user_id,
    ...(e.aliases ?? []),
    ...(e.transferred_from ?? []),
    ...(e.transferred_to ?? []),
  ];
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && UUID.test(id)))];
}

export function storeOf(store: string | undefined): Store {
  switch ((store ?? '').toLowerCase()) {
    case 'play_store':
      return 'play_store';
    case 'app_store':
    case 'mac_app_store':
      return 'app_store';
    case 'stripe':
    case 'rc_billing':
      return 'stripe';
    default:
      return 'other';
  }
}

const base = (productId: string) => productId.split(':')[0] ?? productId;

/** The stored rows of one user, from the subscriber response. */
export function rowsFromSubscriber(userId: string, response: SubscriberResponse): EntitlementRow[] {
  const s = response.subscriber;
  if (!s) return [];
  const attributes = s.subscriber_attributes ?? {};
  const pricedProduct = attributes.peakr_product?.value;
  const price = attributes.peakr_price?.value ?? null;
  const rows: EntitlementRow[] = [];
  for (const id of ENTITLEMENTS) {
    const e = s.entitlements?.[id];
    if (!e?.product_identifier) continue;
    const productId = e.product_identifier;
    const sub = s.subscriptions?.[productId] ?? s.subscriptions?.[base(productId)];
    const expires = e.grace_period_expires_date ?? e.expires_date ?? null;
    rows.push({
      user_id: userId,
      entitlement: id,
      product_id: productId,
      store: storeOf(sub?.store),
      period_type: (sub?.period_type ?? 'normal').toLowerCase(),
      will_renew:
        !!sub &&
        !sub.unsubscribe_detected_at &&
        !sub.billing_issues_detected_at &&
        !sub.refunded_at,
      expires_at: expires,
      price_string:
        price && pricedProduct && base(pricedProduct) === base(productId) ? price : null,
      management_url: sub?.management_url ?? s.management_url ?? null,
    });
  }
  return rows;
}

/** Whether a row grants access at `now` (RevenueCat keeps expired entitlements in the response). */
export function isActive(row: Pick<EntitlementRow, 'expires_at'>, now: Date): boolean {
  return row.expires_at === null || new Date(row.expires_at).getTime() > now.getTime();
}

/** Constant-time comparison of the webhook's Authorization header with the configured value. */
export function sameSecret(given: string | null, expected: string): boolean {
  if (given === null || expected.length === 0 || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
