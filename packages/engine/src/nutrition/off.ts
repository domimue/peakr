import type { FoodBasis, Nutrients, Portion } from './nutrients';

/**
 * Open Food Facts product → food (ODbL: the app shows the attribution and lets users correct an
 * entry; the corrected copy wins locally). Only the fields we read; everything else is ignored.
 */

export interface OffFood {
  barcode: string;
  name: string;
  brand: string | null;
  basis: FoodBasis;
  per100: Nutrients;
  portions: Portion[];
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Serving size text ("30 g", "250 ml", "1 bar (45 g)") → amount in the basis unit. */
function servingAmount(text: unknown, quantity: unknown, basis: FoodBasis): number | null {
  const q = num(quantity);
  if (q && q > 0) return q;
  if (typeof text !== 'string') return null;
  const m = text.match(/([\d.,]+)\s*(g|ml)\b/i);
  if (!m || m[2]?.toLowerCase() !== basis) return null;
  return num(m[1]);
}

/**
 * Parses an OFF API v2 product response. Null when the product is unknown or has no energy value
 * (then the user creates the food themselves, with the barcode).
 */
export function parseOffProduct(json: unknown, barcode: string): OffFood | null {
  const root = json as { status?: unknown; product?: Record<string, unknown> } | null;
  const p = root?.product;
  if (!p || root?.status === 0) return null;
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const kcal =
    num(n['energy-kcal_100g']) ??
    (num(n['energy-kj_100g']) !== null ? (num(n['energy-kj_100g']) as number) / 4.184 : null) ??
    (num(n.energy_100g) !== null ? (num(n.energy_100g) as number) / 4.184 : null);
  if (kcal === null) return null;
  const basis: FoodBasis =
    typeof p.nutrition_data_per === 'string' && /ml/i.test(p.nutrition_data_per)
      ? 'ml'
      : typeof p.quantity === 'string' && /\d\s*(ml|cl|l)\b/i.test(p.quantity)
        ? 'ml'
        : 'g';
  const name =
    [p.product_name, p.product_name_en, p.generic_name].find(
      (v): v is string => typeof v === 'string' && v.trim().length > 0,
    ) ?? barcode;
  const brand =
    typeof p.brands === 'string' && p.brands.trim()
      ? (p.brands.split(',')[0] as string).trim()
      : null;
  const serving = servingAmount(p.serving_size, p.serving_quantity, basis);
  return {
    barcode,
    name: name.trim(),
    brand,
    basis,
    per100: {
      kcal: Math.round(kcal),
      proteinG: r1(num(n.proteins_100g) ?? 0),
      carbsG: r1(num(n.carbohydrates_100g) ?? 0),
      fatG: r1(num(n.fat_100g) ?? 0),
    },
    portions:
      serving && serving > 0
        ? [
            {
              label: typeof p.serving_size === 'string' ? p.serving_size : `${serving} ${basis}`,
              amount: serving,
            },
          ]
        : [],
  };
}

/** Search results (cgi/search.pl, `products` array) → foods, skipping unusable ones. */
export function parseOffSearch(json: unknown): OffFood[] {
  const products = (json as { products?: unknown[] } | null)?.products;
  if (!Array.isArray(products)) return [];
  return products.flatMap((p) => {
    const code = (p as { code?: unknown }).code;
    if (typeof code !== 'string' || !code) return [];
    const food = parseOffProduct({ status: 1, product: p }, code);
    return food ? [food] : [];
  });
}

/** Barcodes OFF knows: EAN-8, EAN-13, UPC-A/E (digits only). */
export function isBarcode(text: string): boolean {
  return /^\d{8}$|^\d{12,14}$/.test(text);
}
