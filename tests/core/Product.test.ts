import {
  parseProductId,
  parseProductRow,
  parseProductRows,
  parseProductSlug,
} from "@/core/schemas/Product";

/** Exactly what PostgREST returns: snake_case, plus columns the DTO ignores. */
const ROW = {
  id: "5f0f5b0e-6a1b-4b1f-9c3a-1d2e3f4a5b6c",
  slug: "ethiopia-guji-natural",
  name: "Ethiopia Guji Natural",
  description: "Blueberry and jasmine, sun-dried on raised beds.",
  price_minor: 1850,
  currency: "USD",
  stock: 24,
  image_url: "https://picsum.photos/seed/ethiopia-guji-natural/600/450",
  published: true,
  created_at: "2026-11-18T08:41:44.000Z",
  updated_at: "2026-11-18T08:41:44.000Z",
};

describe("parseProductRow", () => {
  it("maps snake_case columns onto the DTO and drops the rest", () => {
    const result = parseProductRow(ROW);

    expect(result).toEqual({
      ok: true,
      data: {
        id: ROW.id,
        slug: ROW.slug,
        name: ROW.name,
        description: ROW.description,
        priceMinor: 1850,
        currency: "USD",
        stock: 24,
        imageUrl: ROW.image_url,
      },
    });
  });

  it("accepts null description and null image_url", () => {
    const result = parseProductRow({ ...ROW, description: null, image_url: null });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.description).toBeNull();
    expect(result.data.imageUrl).toBeNull();
  });

  it("fails loudly when a column arrives with the wrong type", () => {
    const result = parseProductRow({ ...ROW, price_minor: "1850" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("validation");
    expect(result.error.message).toContain("price_minor");
    expect(result.error.cause).toContain("1850");
  });

  it("rejects a negative stock rather than passing it to a badge", () => {
    const result = parseProductRow({ ...ROW, stock: -1 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("validation");
    expect(result.error.message).toContain("stock");
  });

  it("rejects a currency that is not a three-letter code", () => {
    const result = parseProductRow({ ...ROW, currency: "US" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("validation");
  });

  it("rejects a missing id", () => {
    const withoutId: Record<string, unknown> = { ...ROW };
    delete withoutId.id;

    const result = parseProductRow(withoutId);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("validation");
    expect(result.error.message).toContain("id");
  });
});

describe("parseProductRows", () => {
  it("maps every row", () => {
    const result = parseProductRows([ROW, { ...ROW, id: ROW.id.replace("5", "6") }]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(2);
  });

  it("reports validation when the payload is not a list", () => {
    const result = parseProductRows({ products: [ROW] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("validation");
  });
});

describe("parseProductSlug", () => {
  it("trims surrounding whitespace", () => {
    expect(parseProductSlug("  ethiopia-guji-natural  ")).toEqual({
      ok: true,
      data: "ethiopia-guji-natural",
    });
  });

  it("rejects a blank slug", () => {
    const result = parseProductSlug("   ");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("validation");
  });
});

describe("parseProductId", () => {
  it("rejects anything that is not a UUID", () => {
    const result = parseProductId("ethiopia-guji-natural");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("validation");
  });
});
