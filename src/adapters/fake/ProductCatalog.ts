import type { Product } from "@/core/dto/Product";
import { err, ok, type Result } from "@/core/dto/Result";
import type { ProductCatalog } from "@/core/ports/ProductCatalog";
import { parseProductId, parseProductSlug } from "@/core/schemas/Product";

/**
 * In-memory catalogue for tests that should not need Docker.
 *
 * Models the stock rule — never below zero, a refused sale returns no row — and
 * nothing else. It cannot model row-level security, because the `Product` DTO
 * has no `published` field: visibility is decided before a row ever reaches the
 * port. It does distinguish an unknown id (`not_found`) from zero stock
 * (`out_of_stock`); `sell_one_unit` cannot, and the Supabase adapter reports
 * both as `out_of_stock`.
 *
 * Every read and write copies, so a caller that mutates what it receives cannot
 * change the fixture under the next test.
 */
export class FakeProductCatalog implements ProductCatalog {
  private readonly products: Product[];

  constructor(seed: Product[] = []) {
    this.products = seed.map(copy);
  }

  async listProducts(): Promise<Result<Product[]>> {
    return ok(this.products.map(copy));
  }

  async getProductBySlug(slug: string): Promise<Result<Product>> {
    const valid = parseProductSlug(slug);
    if (!valid.ok) return valid;

    const found = this.products.find((product) => product.slug === valid.data);
    if (!found) {
      return err({
        kind: "not_found",
        message: `no product with slug "${valid.data}"`,
      });
    }
    return ok(copy(found));
  }

  async sellOneUnit(productId: string): Promise<Result<Product>> {
    const valid = parseProductId(productId);
    if (!valid.ok) return valid;

    const found = this.products.find((product) => product.id === valid.data);
    if (!found) {
      return err({
        kind: "not_found",
        message: `no product with id "${valid.data}"`,
      });
    }
    if (found.stock <= 0) {
      return err({
        kind: "out_of_stock",
        message: `"${found.slug}" has no stock left`,
      });
    }

    found.stock -= 1;
    return ok(copy(found));
  }
}

function copy(product: Product): Product {
  return { ...product };
}
