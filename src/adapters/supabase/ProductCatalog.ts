import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { AppError, AppErrorKind } from "@/core/dto/AppError";
import type { Product } from "@/core/dto/Product";
import { err, type Result } from "@/core/dto/Result";
import type { ProductCatalog } from "@/core/ports/ProductCatalog";
import {
  parseProductId,
  parseProductRow,
  parseProductRows,
  parseProductSlug,
} from "@/core/schemas/Product";

/**
 * `published` is not selected: row-level security is the only visibility
 * filter, and asking for the column would invite a second, wrong one.
 */
const COLUMNS = "id, slug, name, description, price_minor, currency, stock, image_url";

/**
 * The real catalogue, over PostgREST.
 *
 * Takes a client rather than creating one, so the cookie-bound factory stays in
 * `index.ts` (the one `server-only` door) and a test can hand it a plain
 * anonymous client.
 *
 * `sellOneUnit` writes through `sell_one_unit`, not through a table update: the
 * table has no write grant, and the function is `security definer`, `execute`d
 * by signed-in users only.
 */
export class SupabaseProductCatalog implements ProductCatalog {
  constructor(private readonly client: SupabaseClient) {}

  async listProducts(): Promise<Result<Product[]>> {
    try {
      const { data, error } = await this.client.from("products").select(COLUMNS);
      if (error) return err(toAppError("listProducts", error));
      return parseProductRows(data);
    } catch (cause) {
      return err(unavailable("listProducts", cause));
    }
  }

  async getProductBySlug(slug: string): Promise<Result<Product>> {
    const valid = parseProductSlug(slug);
    if (!valid.ok) return valid;

    try {
      const { data, error } = await this.client
        .from("products")
        .select(COLUMNS)
        .eq("slug", valid.data)
        .maybeSingle();
      if (error) return err(toAppError("getProductBySlug", error));
      if (!data) {
        return err({
          kind: "not_found",
          message: `no product with slug "${valid.data}"`,
        });
      }
      return parseProductRow(data);
    } catch (cause) {
      return err(unavailable("getProductBySlug", cause));
    }
  }

  async sellOneUnit(productId: string): Promise<Result<Product>> {
    const valid = parseProductId(productId);
    if (!valid.ok) return valid;

    try {
      const { data, error } = await this.client.rpc("sell_one_unit", {
        product_id: valid.data,
      });
      if (error) return err(toAppError("sellOneUnit", error));
      if (!data) {
        // The function's `where stock > 0` matched nothing. It cannot tell a
        // zero-stock row from an id that is not there, so both read the same.
        return err({
          kind: "out_of_stock",
          message: `sell_one_unit returned no row for ${valid.data}: stock was zero, or the product is not visible`,
        });
      }
      return parseProductRow(data);
    } catch (cause) {
      return err(unavailable("sellOneUnit", cause));
    }
  }
}

/**
 * PostgREST reports failure as a resolved error value, so this is the one place
 * where provider vocabulary becomes the app's own taxonomy.
 */
function toAppError(operation: string, error: PostgrestError): AppError {
  return {
    kind: kindFor(error),
    message: `${operation} failed: ${error.message}`,
    cause: [error.code, error.details, error.hint].filter(Boolean).join(" / "),
  };
}

function kindFor(error: PostgrestError): AppErrorKind {
  switch (error.code) {
    // insufficient_privilege: RLS hid the row or a grant is missing.
    case "42501":
      return "unauthorized";
    // No rows where `.single()` required one.
    case "PGRST116":
      return "not_found";
    // Everything else is the service failing, not the caller being wrong.
    default:
      return "unavailable";
  }
}

/** A thrown value, not a PostgREST error: the network or the runtime gave up. */
function unavailable(operation: string, cause: unknown): AppError {
  return {
    kind: "unavailable",
    message: `${operation} could not reach the database`,
    cause: describe(cause),
  };
}

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  try {
    return JSON.stringify(cause) ?? String(cause);
  } catch {
    return String(cause);
  }
}
