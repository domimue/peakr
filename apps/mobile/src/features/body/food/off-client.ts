import { parseOffProduct, parseOffSearch, type OffFood } from '@peakr/engine';

import * as repo from '@/data/repositories/body-repository';
import type { FoodItem } from '@/data/repositories/body-repository';

/**
 * Open Food Facts (free, ODbL). Read-only calls straight from the app – no key, but a descriptive
 * User-Agent as OFF asks. Every product found is kept in the local food table, so a barcode
 * scanned once works offline afterwards; a user's correction of it (an own food with the same
 * barcode) always wins over the cache. The UI shows the attribution wherever OFF data appears.
 */

const BASE = 'https://world.openfoodfacts.org';
const FIELDS =
  'code,product_name,product_name_en,generic_name,brands,quantity,serving_size,serving_quantity,nutrition_data_per,nutriments';
const HEADERS = {
  'User-Agent': 'Peakr/1.0 (Android; https://peakr.app)',
  Accept: 'application/json',
};
const TIMEOUT_MS = 8000;

async function getJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: HEADERS, signal: controller.signal });
    return response.ok ? ((await response.json()) as unknown) : null;
  } catch {
    // Offline or slow: the local cache is all there is.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Stores an OFF product in the local cache (replacing an older cached copy). */
async function cache(food: OffFood): Promise<FoodItem> {
  const existing = await repo.foodByBarcode(food.barcode);
  return repo.saveFoodItem({
    id: existing?.kind === 'off' ? existing.id : undefined,
    kind: 'off',
    name: food.name,
    brand: food.brand,
    barcode: food.barcode,
    basis: food.basis,
    kcal: food.per100.kcal,
    proteinG: food.per100.proteinG,
    carbsG: food.per100.carbsG,
    fatG: food.per100.fatG,
    pieceAmount: null,
    portions: food.portions,
    recipe: null,
  });
}

export type LookupResult =
  | { status: 'found'; food: FoodItem; fromCache: boolean }
  | { status: 'notFound' }
  | { status: 'offline' };

/** A barcode: own food or cache first (offline), then OFF. */
export async function lookupBarcode(barcode: string): Promise<LookupResult> {
  const local = await repo.foodByBarcode(barcode);
  if (local && local.kind !== 'off') return { status: 'found', food: local, fromCache: true };
  const json = await getJson(
    `${BASE}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`,
  );
  if (json === null) {
    return local ? { status: 'found', food: local, fromCache: true } : { status: 'offline' };
  }
  const food = parseOffProduct(json, barcode);
  if (!food)
    return local ? { status: 'found', food: local, fromCache: true } : { status: 'notFound' };
  return { status: 'found', food: await cache(food), fromCache: false };
}

/** Text search on OFF; null when offline. Results are not cached until one is used. */
export async function searchOff(query: string): Promise<OffFood[] | null> {
  const q = query.trim();
  if (q.length < 3) return [];
  const json = await getJson(
    `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${FIELDS}`,
  );
  return json === null ? null : parseOffSearch(json);
}

/** An OFF search result the user picked: cached, so it can be logged (and found offline later). */
export const cacheOffResult = cache;
