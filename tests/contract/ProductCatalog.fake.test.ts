import { FakeProductCatalog } from "@/adapters/fake/ProductCatalog";
import type { Product } from "@/core/dto/Product";

import { describeProductCatalogContract } from "./ProductCatalog.contract";

/**
 * Mirrors `supabase/seed.sql`: one ordinary product, one sold out, one low.
 * The two drafts are absent on purpose — the DTO has no `published` field, so
 * by the time a product reaches this port, visibility is already decided.
 */
const SEED: Product[] = [
  {
    id: "5f0f5b0e-6a1b-4b1f-9c3a-1d2e3f4a5b6c",
    slug: "ethiopia-guji-natural",
    name: "Ethiopia Guji Natural",
    description: "Blueberry and jasmine, sun-dried on raised beds.",
    priceMinor: 1850,
    currency: "USD",
    stock: 24,
    imageUrl: "https://picsum.photos/seed/ethiopia-guji-natural/600/450",
  },
  {
    id: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    slug: "decaf-colombia-sugarcane",
    name: "Decaf Colombia Sugarcane",
    description: "Cocoa and plum, decaffeinated with sugarcane ethanol.",
    priceMinor: 1700,
    currency: "USD",
    stock: 0,
    imageUrl: "https://picsum.photos/seed/decaf-colombia-sugarcane/600/450",
  },
  {
    id: "8b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e",
    slug: "guatemala-antigua",
    name: "Guatemala Antigua",
    description: "Toffee and orange peel, the last bags of the season.",
    priceMinor: 1800,
    currency: "USD",
    stock: 2,
    imageUrl: "https://picsum.photos/seed/guatemala-antigua/600/450",
  },
];

describeProductCatalogContract("FakeProductCatalog", {
  createCatalog: async () => new FakeProductCatalog(SEED),
  sellsAs: { kind: "signed-in", unknownProduct: "not_found" },
});
