import type { Product } from "@/core/dto/Product";
import type { ProductCatalog } from "@/core/ports/ProductCatalog";
import { ProductSchema } from "@/core/schemas/Product";

/**
 * One suite, two implementations.
 *
 * Anything asserted here must hold for the fake and for Postgres. What cannot
 * be asserted here is named instead of pretended away: visibility, roles and
 * grants are database behaviour, so the fake cannot have an opinion.
 *
 * Fixture requirements: the catalogue must contain at least one product; a
 * `signed-in` run also needs one product with stock above zero and one at zero.
 */

export type SellCapability =
  /** The caller has no `execute` grant on `sell_one_unit`; every sale is refused. */
  | { kind: "anonymous" }
  /**
   * The caller may write. `unknownProduct` names the result for an id that is
   * not in the catalogue: the fake can tell it apart (`not_found`), while
   * `sell_one_unit` matches no row either way (`out_of_stock`).
   */
  | { kind: "signed-in"; unknownProduct: "not_found" | "out_of_stock" };

export type ProductCatalogContractOptions = {
  createCatalog: () => Promise<ProductCatalog>;
  sellsAs: SellCapability;
};

const MISSING_ID = "00000000-0000-4000-8000-000000000000";

export function describeProductCatalogContract(
  name: string,
  { createCatalog, sellsAs }: ProductCatalogContractOptions,
): void {
  describe(`${name} satisfies the ProductCatalog contract`, () => {
    it("lists products that all parse as the Product DTO", async () => {
      const products = await listAll(await createCatalog());

      expect(products.length).toBeGreaterThan(0);
      for (const product of products) {
        expect(ProductSchema.safeParse(product).success).toBe(true);
      }

      const ids = products.map((product) => product.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("returns from getProductBySlug the same product the listing showed", async () => {
      const catalog = await createCatalog();
      const products = await listAll(catalog);

      for (const product of products) {
        await expect(catalog.getProductBySlug(product.slug)).resolves.toEqual({
          ok: true,
          data: product,
        });
      }
    });

    it("reports not_found for a slug that is not in the catalogue", async () => {
      const catalog = await createCatalog();

      const result = await catalog.getProductBySlug("no-such-product");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("not_found");
      expect(result.error.message).toContain("no-such-product");
    });

    it("rejects a blank slug as validation, before any query", async () => {
      const catalog = await createCatalog();

      const result = await catalog.getProductBySlug("   ");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("validation");
    });

    it("rejects a product id that is not a UUID as validation", async () => {
      const catalog = await createCatalog();

      const result = await catalog.sellOneUnit("not-a-uuid");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("validation");
    });

    if (sellsAs.kind === "anonymous") {
      it("refuses sellOneUnit for a caller without the execute grant", async () => {
        const catalog = await createCatalog();
        const [product] = await listAll(catalog);

        const result = await catalog.sellOneUnit(product.id);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.kind).toBe("unauthorized");
      });
      return;
    }

    it("decrements stock by exactly one and returns the updated row", async () => {
      const catalog = await createCatalog();
      const before = await listAll(catalog);
      const target = before.find((product) => product.stock > 0);
      if (!target) throw new Error("contract fixture needs a product with stock > 0");

      const result = await catalog.sellOneUnit(target.id);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toEqual({ ...target, stock: target.stock - 1 });

      const after = await listAll(catalog);
      const byId = new Map(after.map((product) => [product.id, product]));
      for (const product of before) {
        const expected = product.id === target.id ? product.stock - 1 : product.stock;
        expect(byId.get(product.id)?.stock).toBe(expected);
      }
    });

    it("refuses with out_of_stock when there is nothing left to sell", async () => {
      const catalog = await createCatalog();
      const soldOut = (await listAll(catalog)).find((product) => product.stock === 0);
      if (!soldOut) throw new Error("contract fixture needs a product with stock === 0");

      const result = await catalog.sellOneUnit(soldOut.id);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("out_of_stock");
    });

    it(`reports ${sellsAs.unknownProduct} for an id that is not in the catalogue`, async () => {
      const catalog = await createCatalog();

      const result = await catalog.sellOneUnit(MISSING_ID);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe(sellsAs.unknownProduct);
    });
  });
}

async function listAll(catalog: ProductCatalog): Promise<Product[]> {
  const result = await catalog.listProducts();
  if (!result.ok) throw new Error(`listProducts failed: ${result.error.message}`);
  return result.data;
}
