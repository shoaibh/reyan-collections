# Plan 1: Foundation and Content Model, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js + Payload 3 app on local Postgres with Reyan Collections' full content model, seeded sample data and a branded admin. An E2E test proves the admin journey.

**Architecture:** A single Next.js app with Payload embedded (the `blank` template). Collections and globals live in `src/collections` and `src/globals`, share access and field helpers in `src/access` and `src/fields`, and hold pure business helpers in `src/lib`. There is no storefront UI in this plan (that is plan 2).

**Tech Stack:** Node 26, pnpm 11, Next.js 16.4.x, Payload 3.92.0 (`@payloadcms/db-postgres`, `@payloadcms/richtext-lexical`, `@payloadcms/storage-s3`), sharp, Vitest, Playwright, Postgres 16 (Homebrew, already running on `localhost:5432`).

**Spec:** `docs/superpowers/specs/2026-10-26-reyan-collection-design.md`. Read §5 (logo), §7 (content model) and §10 before starting. Roadmap: `docs/superpowers/plans/2026-10-26-00-roadmap.md`.

## Global Constraints

- **pnpm only.** After scaffolding, **pin exact versions** in `package.json`: no `^` or `~`.
- TypeScript `strict: true`. `pnpm typecheck` (`tsc --noEmit`) and `pnpm lint` must pass at the end of every task.
- **Databases:**
  - Local Postgres at `postgres://shoaibhamza@localhost:5432/reyan_dev` (dev) and `.../reyan_test` (tests). There is no password and no Docker.
  - Payload's Postgres adapter runs with `push: true` in dev and test. Migrations come in plan 5.
- **Money:** integer rupees everywhere. Reject decimals.
- **Brand name:** **"Reyan Collections"**, tagline **"Daily finds • Home • Toys"**.
- **Slugs (fixed; later plans depend on them):**
  - Collections: `media`, `users`, `categories`, `curated`, `pages`, `products`.
  - Globals: `homepage`, `navigation`, `links-page`, `store-settings`.
- After any schema change, run `pnpm generate:types` (the output is `src/payload-types.ts`, committed). After any admin component change, run `pnpm generate:importmap`.
- **Secrets** live only in `.env` (gitignored). Every variable is listed in `.env.example` with a comment. **Never commit secrets.**
- **Implementers do not commit.** They leave changes unstaged and report. The orchestrator reviews, runs verification, and commits. Never use `--no-verify`, never force-push, never rewrite history.
- **E2E tests** are whole journeys, and each ends by asserting something visible on screen.

## Review Focus

1. **iPhone HEIC uploads.** Phone photos are often `.heic`. The expected behaviour is a clear rejection ("Upload JPG, PNG or WebP") rather than a crash. Media accepts only `image/jpeg`, `image/png` and `image/webp`, with a max of 15 MB. Tested in Task 2.
2. **Non-English or symbol titles:**
   - "Toys & Games" must become `toys-and-games`.
   - A Hindi title such as "खिलौने" must still get a non-empty, unique slug. When nothing ASCII is left, fall back to `item-<6 random chars>`.
   - Tested in Task 3.
3. **Decimal or negative money and stock.** ₹449.50 or a stock of −1 / 2.5 must be rejected with a field error. Tested in Task 4.
4. **Deleting a category that products use** must be blocked with a message naming how many products use it. Otherwise products would have no category and break the storefront. Tested in Task 4.
5. **A marketplace comparison typed without proof.** A `compareAt.price` without `marketplace`, `url` or `checkedOn` must be rejected. A comparison that isn't higher than our price is stored, but `showComparison` returns false. Tested in Task 4.

---

### Task 1: Scaffold, tooling and test harness  *(model: sonnet)*

**Files:**
- Create: the whole scaffold at the repo root (keep the existing `docs/`), plus `.gitignore`, `.env.example` and `.nvmrc` (`26`)
- Modify: `package.json` (scripts, exact versions), `vitest.config.mts` (include `tests/unit/**` and `tests/int/**`), `playwright.config.ts` (test server on port 3100 against `reyan_test`)
- Test: the template's own `tests/int/*.int.spec.ts` and `tests/e2e/*.e2e.spec.ts`

**Interfaces:**
- Produces:
  - Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test:unit`, `test:int`, `test:e2e`, `generate:types`, `generate:importmap`, `seed`, `db:reset:test`
  - Env vars: `DATABASE_URI`, `PAYLOAD_SECRET`, `NEXT_PUBLIC_SERVER_URL`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `MEDIA_STORAGE` (`local`|`r2`), `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL`

- [ ] **Step 1: Create the databases**
  Run: `createdb reyan_dev && createdb reyan_test && psql -l | grep reyan_`
  Expected: two rows, `reyan_dev` and `reyan_test`.

- [ ] **Step 2: Scaffold into a temp folder, then move it to the root**
  Run from the repo root:
  `pnpm dlx create-payload-app@3.92.0 -n app -t blank --db postgres --db-connection-string postgres://shoaibhamza@localhost:5432/reyan_dev --use-pnpm -a claude`, then move into `./.scaffold`.
  Then: `rsync -a --exclude .git ./.scaffold/app/ ./ && rm -rf ./.scaffold`.
  If the CLI still prompts, answer: blank template, Postgres, the connection string above, pnpm.
  Expected: `src/payload.config.ts`, `src/app/(payload)/` and `src/app/(frontend)/` exist at the root, and `docs/` is intact.

- [ ] **Step 3: Pin exact versions and add the scripts**
  - Replace every `^`/`~` range in `package.json` with the installed version (`pnpm list --depth 0`).
  - Add `"engines": {"node": ">=22"}`.
  - Add these scripts:
    - `typecheck`: `tsc --noEmit`
    - `test:unit`: `vitest run tests/unit`
    - `test:int`: `vitest run tests/int`
    - `test:e2e`: `playwright test`
    - `seed`: `payload run src/seed/run.ts`
    - `db:reset:test`: `dropdb --if-exists reyan_test && createdb reyan_test`
    - Keep the template's `generate:types` and `generate:importmap`.
  - Run `pnpm install`.
  Expected: `grep -E '"\^|"~' package.json` prints nothing.

- [ ] **Step 4: Write `.env`, `.env.example` and `.gitignore`**
  - `.env.example` holds every variable from the Interfaces list, with a one-line comment each. The local defaults are `MEDIA_STORAGE=local` and `NEXT_PUBLIC_SERVER_URL=http://localhost:3000`.
  - `.env` gets a random `PAYLOAD_SECRET` (`openssl rand -hex 32`) and `SEED_ADMIN_EMAIL=admin@reyancollection.in` with a random password. Print the password once in the report.
  - `.gitignore` adds `.env`, `.superpowers/`, `.playwright-mcp/`, `/media/` and `test-results/`.

- [ ] **Step 5: Point the tests at `reyan_test`**
  - `vitest` uses `DATABASE_URI=postgres://shoaibhamza@localhost:5432/reyan_test` (via `vitest.setup.ts` / an env file).
  - `playwright.config.ts`: `webServer.command = 'pnpm dev --port 3100'`, `webServer.env.DATABASE_URI` = the test DB, `use.baseURL = 'http://localhost:3100'`, `reuseExistingServer: !process.env.CI`.

- [ ] **Step 6: Verify the scaffold**
  Run: `pnpm typecheck && pnpm lint && pnpm test:int`
  Expected: all pass (the template's int test is green).
  Run: `pnpm dev` and, in another shell, `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin`
  Expected: `200`. Stop the dev server.

- [ ] **Step 7: git init and hand off for commit**
  Run: `git init -b main`. Leave everything unstaged. In the report, list the files created and the admin password location (`.env`).

---

### Task 2: Media collection and storage switch  *(model: sonnet)*

**Files:**
- Create: `src/collections/Media.ts`, `src/lib/storage.ts`, `src/access/isAdmin.ts`, `tests/int/media.int.spec.ts`, `tests/fixtures/sample.jpg` (any 1600×1200 JPEG; generate it with sharp in the test setup if you prefer), `tests/fixtures/sample.heic` (a renamed file with the `.heic` extension and mime type is enough)
- Modify: `src/payload.config.ts` (register Media, the plugins from `storagePlugins()`, and `upload.limits.fileSize = 15_000_000`)

**Interfaces:**
- Produces:
  - `isAdmin: Access` (true when `req.user` exists)
  - `storagePlugins(): Plugin[]` (returns `[]` unless `MEDIA_STORAGE === 'r2'`; then `s3Storage({ collections: { media: { prefix: 'media' } }, bucket: R2_BUCKET, config: { endpoint: R2_ENDPOINT, region: 'auto', credentials } })`)
  - Media image sizes, named exactly:

    | Name | Width | Height |
    |---|---|---|
    | `thumb` | 400 | 400 |
    | `card` | 800 | 800 |
    | `hero` | 1200 | 1200 |
    | `wide` | 1600 | auto |
    | `og` | 1200 | 630 |

    All are WebP at quality 82, `focalPoint: true`, `crop: true`, `mimeTypes: ['image/jpeg','image/png','image/webp']`, and `alt` is a required text field.
  - Access: read is public; create/update/delete use `isAdmin`.

- [ ] **Step 1: Write the failing int test** `tests/int/media.int.spec.ts`
  - `it('generates webp sizes cropped to spec')`: `payload.create({ collection: 'media', data: { alt: 'sample' }, filePath: 'tests/fixtures/sample.jpg' })`, then expect `doc.sizes.card.width === 800`, `doc.sizes.card.height === 800`, `doc.sizes.og.height === 630` and `doc.sizes.card.mimeType === 'image/webp'`.
  - `it('requires alt text')`: create without `alt` rejects with a `ValidationError` mentioning `alt`.
  - `it('rejects HEIC with a clear message')`: creating with `sample.heic` rejects. The error message contains `JPG, PNG or WebP` (add a `beforeOperation`/validate hook that throws `APIError('Upload JPG, PNG or WebP images (iPhone HEIC photos must be converted first)', 400)` for other types).
- [ ] **Step 2:** Run `pnpm test:int tests/int/media.int.spec.ts`. Expected: FAIL (`media` collection not found).
- [ ] **Step 3:** Implement `Media.ts`, `isAdmin.ts` and `storage.ts` as described in Interfaces, and register them in the config. Install `@payloadcms/storage-s3@3.92.0` (exact).
- [ ] **Step 4:** Run `pnpm test:int tests/int/media.int.spec.ts`. Expected: PASS (3 tests). Then `pnpm generate:types && pnpm typecheck && pnpm lint`, which must pass.
- [ ] **Step 5:** Hand off for commit (unstaged), then the orchestrator commits: `feat: media collection with webp sizes and R2 switch`.

---

### Task 3: Users, categories, curated collections and pages  *(model: haiku)*

**Files:**
- Create: `src/access/publishedOrAdmin.ts`, `src/fields/slug.ts`, `src/collections/Categories.ts`, `src/collections/Curated.ts`, `src/collections/Pages.ts`, `tests/int/catalog-basics.int.spec.ts`
- Modify: `src/collections/Users.ts`, `src/payload.config.ts`

**Interfaces:**
- Consumes: `isAdmin` (Task 2)
- Produces:
  - `publishedOrAdmin: Access` (returns `true` for a logged-in user, otherwise `{ _status: { equals: 'published' } }`)
  - `slugField(source?: string): Field`. The text field is named `slug`, `unique: true`, `index: true`, sits in the admin sidebar, and has a `beforeValidate` hook that fills it from `source` (default `'title'`) when empty. Use `slugify(input: string): string`, exported from `src/fields/slug.ts`. Rules: lowercase, `&` becomes `and`, non-alphanumerics become `-`, collapse/trim dashes. If the result is empty, return `item-` plus 6 random lowercase alphanumerics.
  - **users:** `auth: { maxLoginAttempts: 5, lockTime: 600_000 }`, `role` select `['owner']`, default `'owner'`, required
  - **categories:** `title` (req), `slug`, `description` (textarea), `image` (upload → media), `tileColor` (select `cobalt|mint|tomato|sun|pink`, req, default `cobalt`), `order` (number, default 0). `defaultSort: 'order'`. Read is public; write is `isAdmin`.
  - **curated** (labels "Collection"/"Collections"): `title` (req), `slug`, `description`, `products` (relationship → products, `hasMany`, ordered), `order`. Read is public; write is `isAdmin`. *The `products` relation targets a collection created in Task 4. Add the field in Task 4 if Payload refuses a dangling relation; note it in the report.*
  - **pages:** `title` (req), `slug`, `content` (richText, lexical), `seo` group (`title`, `description`, `image` upload). `versions: { drafts: true }`. Read is `publishedOrAdmin`; write is `isAdmin`.

- [ ] **Step 1: Write failing tests** in `tests/int/catalog-basics.int.spec.ts`:
  - `it('slugifies symbols')`: `slugify('Toys & Games') === 'toys-and-games'`. A category created with that title gets that slug.
  - `it('never produces an empty slug')`: `slugify('खिलौने')` matches `/^item-[a-z0-9]{6}$/`.
  - `it('rejects duplicate slugs')`: a second category with slug `toys-and-games` rejects.
  - `it('hides draft pages from the public')`: create page A as a draft and page B as published. `payload.find({ collection: 'pages', overrideAccess: false })` (no user) returns only B.
- [ ] **Step 2:** Run `pnpm test:int tests/int/catalog-basics.int.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the files listed in Interfaces and register the collections.
- [ ] **Step 4:** Run the test. Expected: PASS. Then `pnpm generate:types && pnpm typecheck && pnpm lint`.
- [ ] **Step 5:** Hand off. Orchestrator commit: `feat: users, categories, curated collections, pages`.

---

### Task 4: Products with variants  *(model: sonnet)*

**Files:**
- Create: `src/collections/Products.ts`, `src/lib/commerce/product.ts`, `tests/unit/product.spec.ts`, `tests/int/products.int.spec.ts`
- Modify: `src/collections/Categories.ts` (block deletes while in use), `src/collections/Curated.ts` (if the relation was deferred), `src/payload.config.ts`

**Interfaces:**
- Consumes: `isAdmin`, `publishedOrAdmin`, `slugField` (Tasks 2–3)
- Produces:
  - The **products** collection, with `versions: { drafts: true }`. Read is `publishedOrAdmin`; write is `isAdmin`. Fields (names are exact; spec §7.1):

    | Field | Type and rules |
    |---|---|
    | `title` | text, req |
    | `slug` | `slugField` |
    | `images` | upload → media, `hasMany`, `minRows: 1`, req |
    | `boxImage` | upload |
    | `price` | number, req, integer ≥ 1 |
    | `compareAt` | group: `marketplace` (select `amazon\|flipkart\|meesho`), `price` (integer ≥ 1), `url` (text), `checkedOn` (date) |
    | `marketplaceLinks` | array: `marketplace` (same select, req), `url` (req) |
    | `variants` | array, `minRows: 1`, req. Each row: `name` (text, req), `swatch` (text, matches `/^#[0-9A-Fa-f]{6}$/` when set), `images` (upload, `hasMany`), `stock` (number, req, integer ≥ 0, default 0), `sku` (text) |
    | `badge` | select `none\|bestseller\|new\|limited`, default `none` |
    | `category` | relationship → categories, req |
    | `shortDescription` | textarea |
    | `description` | richText |
    | `highlights` | array: `text` |
    | `ageGroup` | text |
    | `bisNumber` | text |
    | `tax` | group: `hsnCode` (text, req, `/^\d{4,8}$/`), `gstRate` (number, req, one of 0, 5, 12, 18, 28) |
    | `shipping` | group: `weightGrams`, `lengthCm`, `widthCm`, `heightCm` (all number, req, integer ≥ 1) |
    | `codAllowed` | checkbox, default true |
    | `seo` | group: `title`, `description`, `image` |

    **Validation:** if `compareAt.price` is set, then `compareAt.marketplace`, `compareAt.url` and `compareAt.checkedOn` are all required (one error per missing field).
  - In `src/lib/commerce/product.ts`, both pure:
    - `showComparison(p: { price: number; compareAt?: { price?: number | null } | null }): boolean`. True iff `compareAt.price > price`.
    - `isComparisonStale(checkedOn: string | Date, now: Date, days = 30): boolean`. True iff `now - checkedOn > days`.
  - **Category delete guard:** a `beforeDelete` hook on categories counts products with that category. If there are any, it throws `APIError('This category is used by N product(s). Move them to another category first.', 400)`.

- [ ] **Step 1: Write failing unit tests** in `tests/unit/product.spec.ts`:
  - `showComparison({price: 449, compareAt: {price: 549}}) === true`
  - `showComparison({price: 449, compareAt: {price: 449}}) === false`
  - `showComparison({price: 449, compareAt: null}) === false`
  - `isComparisonStale('2026-09-01', new Date('2026-10-26')) === true`
  - `isComparisonStale('2026-10-10', new Date('2026-10-26')) === false`
- [ ] **Step 2: Write failing int tests** in `tests/int/products.int.spec.ts` (create a category first):
  - `it('saves a valid product with two variants')`: Mint (stock 4) and Sand (stock 0). Expect `doc.variants.length === 2` and each row to have a string `id`.
  - `it('requires at least one variant')`: rejects.
  - `it('rejects decimal or negative money and stock')`: `price: 449.5` rejects, variant `stock: -1` rejects, `stock: 2.5` rejects.
  - `it('rejects a comparison without proof')`: `compareAt: {price: 549}` alone rejects, with errors on `marketplace`, `url` and `checkedOn`.
  - `it('validates tax fields')`: `hsnCode: '95'` rejects and `gstRate: 7` rejects.
  - `it('blocks deleting a category in use')`: deleting the category rejects with a message containing `used by 1 product`.
- [ ] **Step 3:** Run `pnpm test:unit && pnpm test:int tests/int/products.int.spec.ts`. Expected: FAIL.
- [ ] **Step 4:** Implement the collection, the helpers and the category guard. Wire `curated.products` if it was deferred.
- [ ] **Step 5:** Run both test commands. Expected: PASS. Then `pnpm generate:types && pnpm typecheck && pnpm lint`.
- [ ] **Step 6:** Hand off. Orchestrator commit: `feat: products with colour variants and validation`.

---

### Task 5: Globals: homepage, navigation, links page and store settings  *(model: haiku)*

**Files:**
- Create: `src/globals/Homepage.ts`, `src/globals/Navigation.ts`, `src/globals/LinksPage.ts`, `src/globals/StoreSettings.ts`, `tests/int/globals.int.spec.ts`
- Modify: `src/payload.config.ts`

**Interfaces:**
- Produces (spec §7.2; read is public for all, update is `isAdmin`):
  - **homepage** (`versions: { drafts: true }`):
    - `announcement`: array, `maxRows: 3`, field `text` (req)
    - `hero` group: `pill`, `headline` (req), `highlightWord`, `subtext`, `ctaPrimary` {`label`, `link`}, `ctaSecondary` {`label`, `link`}, `productA` (rel → products), `productB` (rel → products), `imageOverrideA` (upload), `imageOverrideB` (upload), `stickerText`
    - `favouritesCollection` (rel → curated)
  - **navigation:** `items` array, `maxRows: 4`. Each row: `label` (req), `linkType` (select `category|collection|page|shop`, req), plus `category` / `collection` / `page` relationships, each shown only for its `linkType` (`admin.condition`) and required when its type is chosen.
  - **links-page:** `tagline`, and `buttons` array with `label` (req), `url` (req), `iconType` (select `shop|whatsapp|amazon|flipkart|meesho|instagram|link`, default `link`), `highlight` (checkbox), `enabled` (checkbox, default true).
  - **store-settings:** the groups and defaults below.

    | Group | Fields (default) |
    |---|---|
    | `business` | `name` ("Reyan Collections"), `legalName`, `gstin`, `address` group {`line1`, `line2`, `city`, `state`, `stateCode`, `pincode`}, `pickupSameAsBusiness` (true), `pickupAddress` (same shape; shown when false), `whatsappNumber`, `phone`, `email` |
    | `social` | `instagramUrl`, `amazonStoreUrl`, `flipkartStoreUrl`, `meeshoStoreUrl`, `ratings` group {`amazon`, `flipkart`, `meesho`}: numbers 0–5, one decimal, optional |
    | `commerce` | `shippingFee` (49), `freeShippingAbove` (499; empty means never), `prepaidDiscount` (0), `codMaxOrderValue` (2000), `maxPerOrder` (5), `returnWindowDays` (7) |
    | `timeouts` | `pendingPaymentMinutes` (30), `codConfirmHours` (24) |
    | `invoicing` | `invoicePrefix` ("RC") |

    All money and count fields are integers ≥ 0.

- [ ] **Step 1: Write failing tests** in `tests/int/globals.int.spec.ts`:
  - `it('applies store-settings defaults')`: `findGlobal('store-settings')` gives `commerce.shippingFee === 49`, `commerce.freeShippingAbove === 499`, `commerce.codMaxOrderValue === 2000`, `commerce.maxPerOrder === 5`, `commerce.returnWindowDays === 7`, `timeouts.pendingPaymentMinutes === 30`, `timeouts.codConfirmHours === 24`, `invoicing.invoicePrefix === 'RC'` and `business.name === 'Reyan Collections'`.
  - `it('caps navigation at 4 items')`: `updateGlobal('navigation')` with 5 `shop` items rejects.
  - `it('caps announcements at 3')`: 4 rows rejects.
  - `it('rejects a 6.0 rating')`: `social.ratings.amazon = 6` rejects.
- [ ] **Step 2:** Run `pnpm test:int tests/int/globals.int.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the four globals and register them.
- [ ] **Step 4:** Run the test. Expected: PASS. Then `pnpm generate:types && pnpm typecheck && pnpm lint`.
- [ ] **Step 5:** Hand off. Orchestrator commit: `feat: homepage, navigation, links page and store settings globals`.

---

### Task 6: Seed data  *(model: sonnet)*

**Files:**
- Create: `src/seed/index.ts`, `src/seed/run.ts`, `src/seed/data.ts`, `src/seed/pages.ts`, `src/seed/assets/*`, `public/brand/logo-circle.jpg`, `public/brand/logo-mark.png`, `tests/int/seed.int.spec.ts`

**Interfaces:**
- Consumes: all collections and globals (Tasks 2–5)
- Produces:
  - `seed(payload: Payload): Promise<{ products: number; categories: number }>`. Dev-only and idempotent: it first deletes all docs in `products`, `curated`, `categories`, `pages` and `media`, then recreates them. It upserts the admin user from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.
  - `src/seed/run.ts` refuses to run when `NODE_ENV === 'production'` unless `SEED_FORCE=1`.

- [ ] **Step 1: Copy the assets**

  | From | To |
  |---|---|
  | `~/Desktop/insta/karaoke/06_product_and_accessories.png` | `src/seed/assets/karaoke.png` |
  | `~/Desktop/insta/duck/Duck_Track_Toy_Post_1.jpg` | `src/seed/assets/duck.jpg` |
  | `~/Desktop/insta/container/01_stylish_organization.png` | `src/seed/assets/container.png` |
  | `~/Desktop/insta/juicer/Portable_Juicer_Post_1.jpg` | `src/seed/assets/juicer.jpg` |
  | `~/Desktop/insta/helicopter/helicopter_diwali_post_1.jpg` | `src/seed/assets/helicopter.jpg` |
  | `docs/design/brand/logo-circle.jpg` | `public/brand/` |
  | `docs/design/brand/logo-mark.png` | `public/brand/` |

  Run: `ls src/seed/assets public/brand`. Expected: 5 + 2 files.

- [ ] **Step 2: Write the failing test** `tests/int/seed.int.spec.ts`:
  - `it('seeds the catalog')`:
    - After `seed(payload)`: 5 published products; the categories are "Toys & Games" (`tileColor: 'cobalt'`, order 1) and "Kitchen & Home" (`tileColor: 'mint'`, order 2).
    - The product `mexico-premium-container-set-of-2` has variants named `['Mint', 'Sand']` with stock `[6, 3]`.
    - Curated collections "This week's favourites" (4 products) and "Gifts under ₹499" (products priced ≤ 499).
    - Navigation has 3 items: Toys & Games, Kitchen & Home, Gifts under ₹499.
    - The links page has 5 buttons, and the first is `iconType: 'shop'` with `highlight: true`.
    - `homepage.hero.productA` is the karaoke product.
    - The 6 policy pages exist as **drafts**.
  - `it('is idempotent')`: running `seed` twice still gives 5 products and 2 categories.
- [ ] **Step 3:** Run `pnpm test:int tests/int/seed.int.spec.ts`. Expected: FAIL.
- [ ] **Step 4: Implement the seed.** The data in `src/seed/data.ts` is below; all values are placeholders that Shoaib will edit.

  | title | category | price | compareAt (marketplace, price, checkedOn 2026-10-26, url `https://example.com/listing`) | variants (name, swatch, stock) | badge | ageGroup | hsn / gst | weight g / L×W×H cm |
  |---|---|---|---|---|---|---|---|---|
  | Karaoke speaker with 2 wireless mics | Toys & Games | 1299 | amazon, 1499 | Default, –, 8 | bestseller | 5+ | 8518 / 18 | 900 / 20×15×15 |
  | Duck climbing track toy with music | Toys & Games | 549 | flipkart, 649 | Default, –, 10 | new | 3+ | 9503 / 12 | 700 / 30×20×10 |
  | Mexico premium container, set of 2 | Kitchen & Home | 449 | meesho, 549 | Mint #8FC9B5, 6; Sand #D9C7A7, 3 | none | – | 3924 / 18 | 800 / 25×15×15 |
  | Portable juicer, 400 ml, USB charging | Kitchen & Home | 799 | amazon, 949 | Default, –, 5 | none | – | 8509 / 18 | 600 / 22×12×12 |
  | Induction flight RC helicopter | Toys & Games | 699 | amazon, 849 | Default, –, 4 | none | 6+ | 9503 / 12 | 400 / 35×18×8 |

  - Each product's `images` is its asset (alt = the title). `shortDescription` is a single sentence; `highlights` has 3 short bullets.
  - Homepage hero, from mockup `docs/design/mockups/home-logo.html`:
    - pill "Diwali gift picks are here"
    - headline "Fun for little hands. Joy for the whole home." with highlightWord "Joy"
    - subtext as in the mockup
    - CTAs "Shop toys →" (`/c/toys-and-games`) and "Kitchen & home" (`/c/kitchen-and-home`)
    - productA = karaoke, productB = container, sticker "Bestseller!"
    - announcement: the 3 mockup messages
    - favourites = "This week's favourites"
  - Links page:
    - tagline "Daily finds • Home • Toys"
    - Buttons: Shop on our website (`/`, shop, highlight), Chat on WhatsApp (`https://wa.me/910000000000`, whatsapp), Amazon store, Flipkart store, Meesho store (each `https://example.com/…`).
  - Policy pages (`src/seed/pages.ts`, drafts): about, contact, shipping-policy, return-policy, privacy-policy, terms. Each starts with the paragraph "⚠ Review before publishing: this is a starting template, not legal advice." followed by 3–5 sensible headings and placeholder text.
- [ ] **Step 5:** Run `pnpm test:int tests/int/seed.int.spec.ts`. Expected: PASS. Then run `pnpm seed` against `reyan_dev`. Expected: it logs counts (5 products, 2 categories) and exits 0.
- [ ] **Step 6:** Run `pnpm typecheck && pnpm lint`, then hand off. Orchestrator commit: `feat: dev seed with sample catalog, content and policy drafts`.

---

### Task 7: Branded admin and the admin catalog E2E journey  *(model: sonnet)*

**Files:**
- Create: `src/admin/brand/Logo.tsx`, `src/admin/brand/Icon.tsx`, `tests/e2e/admin-catalog.e2e.spec.ts`, `tests/e2e/global-setup.ts`
- Modify: `src/payload.config.ts` (`admin.components.graphics.Logo/Icon`, `admin.meta.titleSuffix: '· Reyan Collections'`, `admin.meta.icons` favicon `/brand/logo-mark.png`), `playwright.config.ts` (`globalSetup`)

**Interfaces:**
- Consumes: `seed()` (Task 6) and the `SEED_ADMIN_*` env vars
- Produces:
  - `Logo` renders `<img src="/brand/logo-circle.jpg" alt="Reyan Collections" width={160} height={160}>` on the login screen.
  - `Icon` renders `/brand/logo-mark.png` at 28px in the nav.
  - `global-setup.ts` runs `pnpm db:reset:test`, then seeds the test DB by running `seed()` through Payload's local API with `DATABASE_URI` set to `reyan_test`.

- [ ] **Step 1: Write the failing E2E journey** `tests/e2e/admin-catalog.e2e.spec.ts`, one `test('owner manages stock of a colour variant')`:
  1. Go to `/admin`. Expect `getByRole('img', { name: 'Reyan Collections' })` to be visible.
  2. Log in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
  3. Open Products. Expect the row text "Mexico premium container, set of 2" to be visible.
  4. Open it. Expect the variant rows "Mint" and "Sand" to be visible.
  5. Set Sand's stock to `7`, then Save (publish). Expect a success toast to be visible.
  6. Reload. **Final assertion:** the Sand stock input is visible with the value `7`.
- [ ] **Step 2:** Run `pnpm test:e2e tests/e2e/admin-catalog.e2e.spec.ts`. Expected: FAIL (no logo yet; global setup missing).
- [ ] **Step 3:** Implement `Logo`, `Icon`, the config changes and the global setup. Then run `pnpm generate:importmap`.
- [ ] **Step 4:** Run the E2E again. Expected: PASS. Run the full suite: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:int && pnpm test:e2e`, all green.
- [ ] **Step 5:** Hand off. Orchestrator commit: `feat: branded admin and admin catalog e2e journey`.

---

## Done when
- `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:int && pnpm test:e2e` are all green on a fresh `reyan_test`.
- `pnpm seed && pnpm dev` gives a branded admin at `localhost:3000/admin` with the 5 seeded products.
- The orchestrator has reviewed each task's diff against this plan and the spec, and committed it.
