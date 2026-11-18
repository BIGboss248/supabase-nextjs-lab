import type { Product } from "../dto/Product";
import type { Result } from "../dto/Result";

/**
 * What the storefront needs from the catalogue.
 *
 * There is no `listPublished`: row-level security already hides unpublished
 * rows, and a second filter here would misrepresent where visibility lives.
 * There is no `getProductById`: the detail page addresses by slug, and the
 * realtime merge already holds the id it patches.
 */
export interface ProductCatalog {
  listProducts(): Promise<Result<Product[]>>;
  getProductBySlug(slug: string): Promise<Result<Product>>;
  /** Returns `out_of_stock` when the database refuses the decrement. */
  sellOneUnit(productId: string): Promise<Result<Product>>;
}
