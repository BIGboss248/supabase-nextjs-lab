/**
 * One product shape for both the listing and the detail page.
 *
 * `published` is deliberately absent: row-level security is the filter, and a
 * field no screen may act on would invite a second, wrong visibility check.
 * `stock` is here because the card renders sold-out and low-stock states and
 * because the realtime merge patches a card by `id`.
 */
export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /** Whole minor units, e.g. 1850 for $18.50. Never a float. */
  priceMinor: number;
  /** ISO 4217 code, three letters. */
  currency: string;
  stock: number;
  imageUrl: string | null;
};
