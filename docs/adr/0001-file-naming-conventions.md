# ADR 0001 — File naming conventions

- **Status:** accepted, 2026-11-17
- **Ticket:** [#10 Resolve the component naming convention conflict](https://github.com/BIGboss248/supabase-nextjs-lab/issues/10)
- **Supersedes:** the file paths, and only the paths, in [#3 Define the port signatures and error taxonomy](https://github.com/BIGboss248/supabase-nextjs-lab/issues/3)
- **Enforced by:** `.agents/autofix.json` rule 2, and an ESLint `check-file` rule that lands with the Phase 1 scaffold

## Context

Two conventions were in play. The Obsidian vault's rule #72 wrote `snake_case` component files for a portfolio site; the Next.js ecosystem writes `PascalCase`. Meanwhile #3 had already locked kebab-case for `src/core/` and `src/adapters/`, so the repo would have carried three cases if nothing was decided.

The tie-breaker is what this repo is for: a learning lab whose code is read beside Supabase and Next.js documentation. Every snippet you will copy uses PascalCase files, and a rename on paste is friction paid on every lesson.

## Decision

One case for hand-written source: **PascalCase**, named after the thing the file defines.

```text
src/core/ports/ProductCatalog.ts
src/core/dto/Product.ts
src/core/dto/Result.ts
src/core/schemas/Product.ts
src/adapters/supabase/Client.ts
src/adapters/supabase/ProductCatalog.ts
src/adapters/supabase/index.ts
src/adapters/fake/ProductCatalog.ts
src/components/catalog/ProductCard.tsx
tests/contract/ProductCatalog.fake.test.ts
```

Six subordinate rules:

1. **Roles are dotted and lowercase.** A companion is `<Base>.<role>.<ext>`: `ProductCard.skeleton.tsx`, `ProductCard.test.tsx`, `ProductCard.stories.tsx`, `ProductCard.client.tsx`, `ProductCatalog.contract.ts`. A skeleton is a real component with a real export, but it is named like a companion, not like a second component — one shape for the family, not two.
2. **Directories stay lowercase and single-word.** `catalog/`, `header/`, `ui/`, `shared/`. They mirror route segments and sort predictably.
3. **Framework-fixed names stay lowercase.** `page`, `layout`, `template`, `loading`, `error`, `not-found`, `route`, `proxy`. The framework reads these strings; renaming one breaks routing.
4. **`index.ts` survives in one place only.** `src/adapters/supabase/index.ts` is the public entry #3 allowed. No other barrel exists.
5. **Components live in surface folders.** `src/components/<surface>/<Name>.tsx`, flat, no per-component folder, no `index.ts`. A surface is a page segment (`catalog/`, `account/`), a layout region (`header/`), `ui/` for primitives, or `shared/` for anything two surfaces render.
6. **Client components carry a `Client` prefix on the file and on the export.** `ClientStockBadge.tsx` exports `ClientStockBadge`; its companions inherit it (`ClientStockBadge.skeleton.tsx` exports `ClientStockBadgeSkeleton`). The prefix is documentation — `'use client'` remains the only thing the compiler honours, and the directive is still required in the file.

Exports: components are **named exports**. `default` appears only in the six files Next reserves: `page`, `layout`, `template`, `loading`, `error`, `not-found`.

Outside the rule: SQL migrations (CLI timestamps), config (`next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`), documentation, and every framework-generated file.

## Alternatives rejected

- **`snake_case` component files.** Consistent with the vault's other projects, but the whole tree would then disagree with every doc snippet, which is the one cost this repo cannot afford.
- **Dotted role marker for client components** (`StockBadge.client.tsx`). Cleaner identifiers, and it was the option I recommended. Rejected in favour of the visible prefix: a `ls` shows the boundary without reading the name's tail.
- **Route-colocated components** (`src/app/products/_components/`). Keeps a route's parts together, but puts the shared card in an arbitrary route's folder, and rebases every import when a page moves.
- **Two conventions, components PascalCase and modules kebab-case.** Two rules to remember, and the boundary between them is a judgement call at every new file.

## Consequences

- The #3 layout note is superseded on file names only: `product-catalog.ts` → `ProductCatalog.ts`, `result.ts` → `Result.ts`, and so on. Signatures, the fake, the contract suite, the `server-only` door and the `getCatalog`/`getAuth` factory are unchanged.
- A lowercase component name now fails lint instead of review. The rule ships with the scaffold, because `package.json` does not exist yet.
- `Client` in a tag name (`<ClientStockBadge />`) encodes a rendering mode at the call site. Accepted, because the alternative was an alias between file and export.
- Reading a tutorial that writes `components/ProductCard.tsx` needs no translation in either direction.
