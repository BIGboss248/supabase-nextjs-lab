import { z } from "zod";

import type { AppError } from "../dto/AppError";
import type { Product } from "../dto/Product";
import { err, ok, type Result } from "../dto/Result";

/**
 * The boundary between Postgres and the app, expressed once.
 *
 * A row is what PostgREST returns: snake_case, plus columns the DTO does not
 * carry (`published`, the timestamps) which `z.object` strips. The DTO is what
 * every caller above the adapter sees. A parse failure becomes an `AppError`,
 * so a renamed column or a changed type fails as a value at the edge instead of
 * surfacing as `undefined` inside a card six layers up.
 */

/** The DTO shape, exported so a test can prove an adapter hands out nothing else. */
export const ProductSchema = z.object({
  id: z.uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  priceMinor: z.int().nonnegative(),
  currency: z.string().length(3),
  stock: z.int().nonnegative(),
  imageUrl: z.string().nullable(),
});

const ProductRowSchema = z
  .object({
    id: z.uuid(),
    slug: z.string().min(1),
    name: z.string().min(1),
    description: z.string().nullable(),
    price_minor: z.int().nonnegative(),
    currency: z.string().length(3),
    stock: z.int().nonnegative(),
    image_url: z.string().nullable(),
  })
  .transform(
    (row): Product => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      priceMinor: row.price_minor,
      currency: row.currency,
      stock: row.stock,
      imageUrl: row.image_url,
    }),
  );

const ProductIdSchema = z.uuid();

const ProductSlugSchema = z.string().trim().min(1).max(200);

export function parseProductRow(input: unknown): Result<Product> {
  const parsed = ProductRowSchema.safeParse(input);
  if (!parsed.success) {
    return err(invalid("a products row", parsed.error, input));
  }
  return ok(parsed.data);
}

export function parseProductRows(input: unknown): Result<Product[]> {
  const parsed = z.array(ProductRowSchema).safeParse(input);
  if (!parsed.success) {
    return err(invalid("the products list", parsed.error, input));
  }
  return ok(parsed.data);
}

export function parseProductId(input: unknown): Result<string> {
  const parsed = ProductIdSchema.safeParse(input);
  if (!parsed.success) {
    return err(invalid("a product id", parsed.error, input));
  }
  return ok(parsed.data);
}

export function parseProductSlug(input: unknown): Result<string> {
  const parsed = ProductSlugSchema.safeParse(input);
  if (!parsed.success) {
    return err(invalid("a product slug", parsed.error, input));
  }
  return ok(parsed.data);
}

function invalid(what: string, error: z.ZodError, input: unknown): AppError {
  return {
    kind: "validation",
    message: `${what} failed validation: ${z.prettifyError(error)}`,
    cause: describe(input),
  };
}

/** JSON when it can be, `String()` when the value cannot be serialised. */
function describe(input: unknown): string {
  try {
    return JSON.stringify(input) ?? String(input);
  } catch {
    return String(input);
  }
}
