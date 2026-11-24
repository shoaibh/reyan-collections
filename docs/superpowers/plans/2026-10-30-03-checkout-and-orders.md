# Checkout and Orders Implementation Plan (Plan 3, milestone M4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer can check out from the cart (prepaid through mock Razorpay, or COD), stock is reserved atomically, and the customer lands on a tokenized order page they can find again through `/track`.

**Architecture:**
- Pure rule modules hold all money and status logic and are unit-tested: `lib/commerce/{pricing,eligibility,orderStateMachine}.ts` and `lib/india.ts`.
- Server modules use Payload's local API inside explicit Postgres transactions, plus raw SQL (`sql` from `@payloadcms/db-postgres`) for the hot rows: variant stock, counters and order row locks.
- Route handlers under `src/app/(frontend)/api/` stay thin.
- Integrations are typed adapters selected by env (`*_MODE=mock|live`). Mocks drive every test.

**Tech Stack:** Next.js 16.3.3 (App Router), Payload 3.92.0 on Postgres, Tailwind 4, Vitest, Playwright. No new runtime dependencies: crypto comes from `node:crypto`, and Razorpay and Turnstile are called with `fetch`.

**Spec:** `docs/superpowers/specs/2026-10-26-reyan-collection-design.md`, mainly §6.4, §6.5, §7.1 (orders, discountCodes, codBlocklist), §8.1–8.5, §10.3, §11 and §12. Also read the "Carried forward" sections of `docs/superpowers/plans/2026-10-26-00-roadmap.md`.

## Global Constraints

- Money is **integer rupees** everywhere. Paise (`× 100`) exist only at the Razorpay boundary (adapter input and `PaymentLaunch.amountPaise`).
- Prices, eligibility and stock are computed server-side. The client sends only ids, quantities, form fields and the total it expects to pay. **The place-order endpoint re-runs the quote and never trusts it** (§8.3.7).
- Catalog reads for checkout are published-only: `draft: false, overrideAccess: false`. Writes to orders, stock, counters and rate limits are server-side, with `overrideAccess` true (the local API default) or raw SQL.
- Every integration has `mock` and `live` implementations behind one interface, selected by `RAZORPAY_MODE` / `TURNSTILE_MODE` (`mock` | `live`, default `mock`). Live adapters are written against the official API docs and stay unverified until plan 5 (§11).
- Customer-facing copy uses the **exact strings in this plan**, because the e2e tests assert them. Error copy is friendly and specific (§6.4).
- Payload owns `/api/<collection>/*`. **Never add a Next route under `/api/orders/...`**, because it would shadow Payload's REST for the `orders` collection. Plan 4's admin actions must use Payload collection `endpoints` instead.
- Next 16 is not the Next you know. Before writing a route handler, page, server action or `searchParams` code, read the relevant guide in `node_modules/next/dist/docs/`. `params` and `searchParams` are Promises. For Payload, start from `.claude/skills/payload/SKILL.md`.
- Styling follows Playful Pop (spec §5), reusing the existing classes: 3px ink borders, hard offset shadows, `rounded-2xl`, the cobalt primary button from `src/components/cart/CartContents.tsx`. Every input has a visible `<label>`. Error text uses `role="alert"` or `aria-describedby`. AA contrast.
- After any collection change run `pnpm generate:types`. Do not hand-edit `src/payload-types.ts`.
- Tests:
  - Int tests run against `reyan_test` (vitest setup already does this). Each spec calls `seed(payload)` in `beforeAll` and `wipe(payload)` in `afterAll`.
  - Int tests use their own phones and their own `x-forwarded-for` IPs, so the rate limits never collide.
  - E2E tests are full journeys, run with workers 1, and **end on a visible assertion**. A journey that consumes seeded stock that another spec asserts restores it in `finally`.
- Never run `pnpm seed` against `reyan_dev`. Never commit (the controller commits). Never add the local Playwright browsers path to repo files.

## Review Focus

1. **Double "Place order" (double tap or a network retry) must create one order.** The client sends an `idempotencyKey`, and the server returns the existing order for a repeated key, including two concurrent requests. Tested in Task 7.
2. **The price changes between quote and order** (the admin edits a price while the customer is on checkout). The customer must never be charged a total they did not see. The server compares `expectedTotal` and replies `409 price_changed`. Tested in Task 7.
3. **Phones typed as `+91 98765 43210`, `098765 43210` or with dashes** are accepted and stored as 10 digits, at checkout and at `/track`. Tested in Tasks 2 and 9.
4. **A tampered request repeats the same variant across lines.** Lines are merged before clamping and reserving, so stock can't be double-reserved or bypass `maxPerOrder`. Tested in Task 6.
5. **A wrong or missing order token gives 404, the same as an unknown order number,** so order existence never leaks. Tested in Task 9.

---

### Task 1: Plan 2 carry-over fixes (R17, R8, pickup pincode)

**Files:**
- Modify: `src/lib/validators.ts`, `src/components/links/LinkButton.tsx:91`, `src/collections/Products.ts` (`protectVariantStock`), `src/app/(frontend)/api/serviceability/route.ts`
- Create: `src/lib/commerce/db.ts`, `src/lib/data/pickup.ts`
- Test: `tests/unit/validators.spec.ts` (extend), `tests/int/carryover.int.spec.ts`

**Interfaces:**
- Produces:
  - `isSitePath(value: string): boolean` in `validators.ts`. It is true only when the value starts with `/`, does not start with `//`, and contains none of `\`, tab, CR or LF.
  - `type SqlExecutor = { execute: (query: SQL) => Promise<{ rows: Record<string, unknown>[] }> }` (`SQL` from `drizzle-orm`, re-exported as a type via `@payloadcms/db-postgres`'s `sql`).
  - `drizzleFor(payload: Payload, transactionID?: string | number | Promise<string | number> | null): Promise<SqlExecutor>`. It returns `(payload.db as PostgresAdapter).sessions[await id]?.db` when a transaction id resolves, otherwise `payload.db.drizzle`.
  - `getPickupPincode(payload: Payload): Promise<string>`.

- [ ] **Step 1: Write failing unit tests**
  - In `tests/unit/validators.spec.ts`, `safeUrl` rejects each of `'/\\evil.com'`, `'/\t/evil.com'`, `'/\n/evil.com'`, `'/\r/evil.com'` and `'https://example.com/a\\b'` with `'Use an https:// link or a site path like /shop'`.
  - It still accepts `'/shop'`, `'/p/a-b?x=1'` and `'https://wa.me/910000000000'`.
  - `isSitePath` is true for `'/shop'`, and false for `'//evil.com'`, `'/\\evil.com'` and `'https://x.com'`.
- [ ] **Step 2: Write the failing int tests** in `tests/int/carryover.int.spec.ts`.
  - **`R8: publishing a stale draft keeps live stock`:**
    1. Seed, then load `mexico-premium-container-set-of-2` and save a draft (`draft: true`) that changes only `shortDescription`.
    2. Run `UPDATE products_variants SET stock = stock - 2 WHERE id = <Mint id>` through `drizzleFor`.
    3. Load the draft (`findByID draft: true`) and publish it with `_status: 'published'`, sending its `variants` unchanged. Each row carries `stockAtLoad` equal to its `stock`.
    4. Expect `findByID({ draft: false })` Mint stock `4`. A second publish sending Mint `stock: 9, stockAtLoad: 4` gives `9`.
  - **`pickup pincode is read server-side`:**
    - `vi.spyOn(mockShiprocket, 'checkServiceability')`.
    - With `business.pickupSameAsBusiness: false` and `pickupAddress.pincode: '226010'`, a GET on `/api/serviceability?pincode=400001&weight=500` calls the spy with `pickupPincode: '226010'`, and the response JSON has no `pickupPincode` key.
    - With `pickupSameAsBusiness: true` and `address.pincode: '226001'`, the spy gets `'226001'`.
    - With both pincodes empty, it gets `'110001'`.
    - Restore the settings in `finally`.
- [ ] **Step 3: Run them and confirm they fail.** Run `pnpm test:unit -- validators` and `pnpm test:int -- carryover`.
- [ ] **Step 4: Implement.**
  - `safeUrl` rejects any value containing `[\\\t\r\n]` and uses `isSitePath` for paths.
  - `LinkButton` renders `<Link>` only for `isSitePath(url)` and `<a>` only for a parseable `https:` URL. Anything else renders `null`.
  - `protectVariantStock` becomes async. For `operation === 'update'` it reads `SELECT id, stock::int AS stock FROM products_variants WHERE _parent_id = ${originalDoc.id}` through `drizzleFor(req.payload, req.transactionID)`. An untouched row takes the live main-table stock for its matched id, falling back to `match.stock` when there is no live row (never-published products).
  - `getPickupPincode` does `payload.findGlobal({ slug: 'store-settings', depth: 0 })`. It returns `pickupAddress.pincode` when `pickupSameAsBusiness === false` and the value matches `/^[0-9]{6}$/`, else `address.pincode` if valid. Otherwise it throws `Error('Set the pickup pincode in Store Settings')` when `SHIPROCKET_MODE === 'live'`, and returns `'110001'` when not.
  - The serviceability route uses it with `await getClient()` and drops its own fallback.
- [ ] **Step 5: Run the unit and int suites,** plus `pnpm typecheck` and `pnpm lint`. Expected: all pass.

### Task 2: Commerce rules (pure, unit-tested)

**Files:**
- Create: `src/lib/india.ts`, `src/lib/commerce/orderStateMachine.ts`, `src/lib/commerce/pricing.ts`, `src/lib/commerce/eligibility.ts`
- Test: `tests/unit/india.spec.ts`, `tests/unit/orderStateMachine.spec.ts`, `tests/unit/pricing.spec.ts`, `tests/unit/eligibility.spec.ts`

**Interfaces (produced; later tasks use these exact names):**
```ts
// india.ts
export const INDIAN_STATES: ReadonlyArray<{ name: string; code: string }>
export function stateCodeFor(name: string): string | null
export function normalizePhone(raw: string): string | null   // 10 digits starting 6-9, or null
export const PINCODE_RE: RegExp                                // /^[0-9]{6}$/ (R14: format only)
export function maskPhone(phone: string): string              // '••••••3210'

// orderStateMachine.ts
export const ORDER_STATUSES = ['pending_payment', 'awaiting_confirmation', 'confirmed', 'ready_to_ship', 'shipped', 'out_for_delivery', 'delivered', 'rto', 'returned', 'cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]
export const PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded', 'cod_pending', 'cod_collected'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]
export class InvalidTransitionError extends Error {}
export function canTransition(from: OrderStatus, to: OrderStatus, opts?: { latePayment?: boolean }): boolean
export function assertTransition(from: OrderStatus, to: OrderStatus, opts?: { latePayment?: boolean }): void
export function nextStatuses(from: OrderStatus): OrderStatus[]

// pricing.ts
export type PaymentMethod = 'prepaid' | 'cod'
export type PricedLine = { productId: number; variantId: string; title: string; variantName: string; slug: string; unitPrice: number; qty: number; stock: number; codAllowed: boolean; hsnCode: string; gstRate: number; weightGrams: number; lengthCm: number; widthCm: number; heightCm: number }
export type CommerceSettings = { shippingFee: number; freeShippingAbove: number | null; prepaidDiscount: number; codMaxOrderValue: number; maxPerOrder: number; pendingPaymentMinutes: number; codConfirmHours: number }
export type DiscountCodeRule = { code: string; type: 'percent' | 'flat'; value: number; maxDiscount?: number | null; minOrderValue?: number | null; validFrom?: string | null; validUntil?: string | null; usageLimit?: number | null; perPhoneLimit?: number | null; active?: boolean | null }
export type CodeResult = { ok: true; discount: number } | { ok: false; message: string }
export type Totals = { subtotal: number; codeDiscount: number; shippingFee: number; prepaidDiscount: number; prepaidSaving: number; total: number }
export function normalizeCode(raw: string): string            // trim + uppercase
export function evaluateCode(rule: DiscountCodeRule | null, ctx: { subtotal: number; now: Date; totalUses: number; phoneUses: number | null }): CodeResult
export function priceCart(input: { lines: Pick<PricedLine, 'unitPrice' | 'qty'>[]; settings: Pick<CommerceSettings, 'shippingFee' | 'freeShippingAbove' | 'prepaidDiscount'>; paymentMethod: PaymentMethod; codeDiscount: number }): Totals

// eligibility.ts
export type CodResult = { eligible: true } | { eligible: false; reason: string }
export function codEligibility(input: { lines: Pick<PricedLine, 'title' | 'codAllowed'>[]; total: number; codMaxOrderValue: number; blocked: boolean; codServiceable: boolean | null }): CodResult
```

**Pinned values:**
- `INDIAN_STATES` is the 36 GST state codes, with exactly these names:
  - 01 Jammu and Kashmir, 02 Himachal Pradesh, 03 Punjab, 04 Chandigarh, 05 Uttarakhand, 06 Haryana, 07 Delhi, 08 Rajasthan, 09 Uttar Pradesh
  - 10 Bihar, 11 Sikkim, 12 Arunachal Pradesh, 13 Nagaland, 14 Manipur, 15 Mizoram, 16 Tripura, 17 Meghalaya, 18 Assam, 19 West Bengal
  - 20 Jharkhand, 21 Odisha, 22 Chhattisgarh, 23 Madhya Pradesh, 24 Gujarat, 26 Dadra and Nagar Haveli and Daman and Diu, 27 Maharashtra, 29 Karnataka
  - 30 Goa, 31 Lakshadweep, 32 Kerala, 33 Tamil Nadu, 34 Puducherry, 35 Andaman and Nicobar Islands, 36 Telangana, 37 Andhra Pradesh, 38 Ladakh
  - Sort them by name for the dropdown.
- **State machine.** Allowed transitions:
  - pending_payment → confirmed | cancelled
  - awaiting_confirmation → confirmed | cancelled
  - confirmed → ready_to_ship | cancelled
  - ready_to_ship → shipped | cancelled
  - shipped → out_for_delivery | delivered | rto
  - out_for_delivery → delivered | rto
  - delivered → returned
  - rto, returned and cancelled are terminal
  - cancelled → confirmed is allowed **only** with `{ latePayment: true }` (§8.4.4)
- **Code rules (§8.3.3).** Dates compare by **calendar day in IST** (UTC+5:30): a code is valid from the start of its `validFrom` IST day through the end of its `validUntil` IST day. `perPhoneLimit` null means no per-phone limit. `phoneUses: null` skips the per-phone check. Checks run in this order, each with this message:
  1. Missing rule, or `active` not true: `This code isn't valid`
  2. Before `validFrom`: `This code isn't active yet`
  3. After `validUntil`: `This code has expired`
  4. Below `minOrderValue`: `Add ₹{minOrderValue − subtotal} more to use this code` (the amount uses `formatINR`)
  5. `totalUses ≥ usageLimit`: `This code has been fully used`
  6. `phoneUses ≥ perPhoneLimit`: `You've already used this code`
  - **Discount amount:** flat gives `min(value, subtotal)`. Percent gives `round(subtotal × value / 100)`, capped by `maxDiscount` and by `subtotal`.
- **Totals (§8.3.4–6):**
  - `afterCode = subtotal − codeDiscount`
  - `shippingFee = 0` when `freeShippingAbove !== null && afterCode ≥ freeShippingAbove`; otherwise it is `settings.shippingFee`
  - `prepaidSaving = min(settings.prepaidDiscount, afterCode)`
  - `prepaidDiscount = paymentMethod === 'prepaid' ? prepaidSaving : 0`
  - `total = afterCode + shippingFee − prepaidDiscount`
- **COD reasons,** checked in this order:
  1. An item without COD: `Cash on delivery isn't available for {title}` (the first such item)
  2. `total > codMaxOrderValue`: `Cash on delivery is available on orders up to {formatINR(codMaxOrderValue)}`
  3. `blocked`: `Cash on delivery isn't available for this order. Please pay online.`
  4. `codServiceable === null`: `Enter your pincode to check cash on delivery`
  5. `codServiceable === false`: `Cash on delivery isn't available for this pincode`

- [ ] **Step 1: Write the failing tests**, using exactly these cases.
  - **`pricing.spec.ts`,** with settings `{ shippingFee: 49, freeShippingAbove: 499, prepaidDiscount: 20 }`:

    | Case | Result |
    |---|---|
    | 1×449, cod | `{ subtotal: 449, codeDiscount: 0, shippingFee: 49, prepaidDiscount: 0, prepaidSaving: 20, total: 498 }` |
    | 1×449, prepaid | total `478` |
    | 2×449, codeDiscount 90, prepaid | shipping `0`, total `788` |
    | `freeShippingAbove: null` | shipping `49` at any subtotal |
    | `prepaidDiscount: 1000`, 1×449, prepaid | prepaidDiscount `449`, total `49` |

  - **`evaluateCode`,** with `now = new Date('2026-11-01T06:00:00Z')`:

    | Case | Result |
    |---|---|
    | null rule | `This code isn't valid` |
    | inactive | `This code isn't valid` |
    | `validUntil: '2026-10-31T18:30:00.000Z'` | ok |
    | `validUntil: '2026-10-30T18:30:00.000Z'` | `This code has expired` |
    | `validFrom: '2026-11-01T18:30:00.000Z'` | `This code isn't active yet` |
    | min 499 at subtotal 449 | `Add ₹50 more to use this code` |
    | `usageLimit: 10, totalUses: 10` | `This code has been fully used` |
    | `perPhoneLimit: 1, phoneUses: 1` | `You've already used this code` |
    | `phoneUses: null` | ok |
    | percent 10, max 150, subtotal 898 | 90 |
    | percent 10, max 150, subtotal 2000 | 150 |
    | percent 15, subtotal 333 | 50 |
    | flat 100, subtotal 60 | 60 |
    | `normalizeCode(' diwali10 ')` | `'DIWALI10'` |

  - **`eligibility.spec.ts`:** each reason in order, plus the eligible case.
  - **`orderStateMachine.spec.ts`:**
    - every allowed transition is true
    - `delivered → shipped`, `pending_payment → shipped` and `cancelled → confirmed` are false
    - `cancelled → confirmed` with `{ latePayment: true }` is true
    - `assertTransition('delivered', 'shipped')` throws `InvalidTransitionError`
    - `nextStatuses('shipped')` equals `['out_for_delivery', 'delivered', 'rto']`
  - **`india.spec.ts`:**
    - `normalizePhone` gives `'9876543210'` for `'9876543210'`, `'+91 98765 43210'`, `'098765-43210'` and `'919876543210'`
    - it gives null for `'5876543210'`, `'98765'` and `'abc'`
    - `stateCodeFor('Uttar Pradesh')` is `'09'`; `stateCodeFor('Narnia')` is null
    - `INDIAN_STATES.length` is 36
    - `maskPhone('9876543210')` is `'••••••3210'`
- [ ] **Step 2: Run `pnpm test:unit`.** Expected: these fail because the modules don't exist yet.
- [ ] **Step 3: Implement the four modules.** They are pure: no Payload or Next imports. `formatINR` comes from `@/lib/format`.
- [ ] **Step 4: Run `pnpm test:unit`, `pnpm typecheck` and `pnpm lint`.** Expected: all pass.

### Task 3: Commerce collections and seed

**Files:**
- Create: `src/collections/Orders.ts`, `src/collections/DiscountCodes.ts`, `src/collections/CodBlocklist.ts`, `src/collections/RateLimits.ts`, `src/collections/Counters.ts`
- Modify: `src/payload.config.ts`, `src/seed/data.ts`, `src/seed/index.ts` (`wipe` + seed the code), `src/payload-types.ts` (generated)
- Test: `tests/int/commerce-schema.int.spec.ts`

**Interfaces:**
- Consumes: `ORDER_STATUSES` and `PAYMENT_STATUSES` (Task 2).
- **Produces `orders`** (Payload types: `Order`). The field names are exact:
  - `orderNumber` (text, unique, required)
  - `accessToken` (text, required, `admin.hidden`)
  - `status` (select over `ORDER_STATUSES`, required, indexed)
  - `paymentMethod` (`prepaid` | `cod`)
  - `paymentStatus` (select over `PAYMENT_STATUSES`)
  - `customer {name, phone (indexed), email}`
  - `address {line1, line2, landmark, city, state, stateCode, pincode}`
  - `items[] {productId (number), variantId, title, variantName, slug, unitPrice, qty, hsnCode, gstRate, weightGrams, lengthCm, widthCm, heightCm}`
  - `subtotal`, `discountCode` (text, indexed), `codeDiscount`, `shippingFee`, `prepaidDiscount`, `total`
  - `razorpay {orderId (indexed), paymentId, refundId}`
  - `shipment {shiprocketOrderId, shipmentId, awb, courierName, trackingUrl, labelUrl, events[] {status, at (date), raw (json)}}`
  - `invoice {number, issuedAt}`
  - `timeline[] {status, at (date), by ('system' | 'admin'), note}`
  - `meta {ipHash, userAgent, turnstileVerified (checkbox), idempotencyKey (unique)}`
  - `alert {message, handled (checkbox)}`
  - `notes` (textarea)
- **Orders access and admin:** access is `read`/`update` for admins only, while `create` and `delete` return `false` for everyone. Every field except `notes` is `admin.readOnly`. `admin.useAsTitle: 'orderNumber'`, and `defaultColumns: ['orderNumber', 'status', 'paymentMethod', 'total', 'createdAt']`.
- **Produces `discount-codes`:**
  - `code`: unique and required. A `beforeValidate` field hook normalises it with `normalizeCode`, and it must match `/^[A-Z0-9-]{3,20}$/` (message `Use 3–20 letters, digits or dashes`).
  - Other fields: `type` (`percent` | `flat`, required), `value` (required, `wholeNumber(1)`), `maxDiscount`, `minOrderValue`, `validFrom` and `validUntil` (date, `pickerAppearance: 'dayOnly'`), `usageLimit`, `perPhoneLimit` (default 1), `active` (default true), `note`.
  - `usage`: a group of virtual numbers `{ timesUsed, revenue }`, shown read-only. A collection `afterRead` hook fills it, only when `req.user` is set, from orders with `discountCode` equal to the code and `status` not `cancelled`.
  - Access: admin only.
- **Produces `cod-blocklist`:** `phone` (unique, required, `/^[6-9][0-9]{9}$/`), `reason` (text). Admin only.
- **Produces `rate-limits`:** `key` (text, required, indexed). `admin.hidden: true`. Admin-only access.
- **Produces `counters`:** `key` (text, unique, required) and `lastNumber` (number, required). `admin.hidden: true`. Admin-only access.
- **Produces in the seed:** `seedDiscountCode = { code: 'DIWALI10', type: 'percent', value: 10, maxDiscount: 150, minOrderValue: 499, perPhoneLimit: 1, active: true, note: 'Instagram Diwali reel' }`. `wipe()` deletes `orders`, `discount-codes`, `cod-blocklist`, `rate-limits` and `counters` before the existing collections.

- [ ] **Step 1: Write the failing int tests:**
  - anonymous `find` (`overrideAccess: false`, no user) on orders, discount-codes and cod-blocklist returns 0 docs or throws Forbidden
  - an admin `create` on orders with `overrideAccess: false` throws Forbidden
  - a discount code saved as `' diwali-5 '` reads back as `'DIWALI-5'`
  - `'DIWALI 5!'` fails validation, and a duplicate `DIWALI10` fails as not unique
  - two orders created through the local API with `discountCode: 'DIWALI10'`, totals 808 and 500, the second `cancelled`: an admin read of the code shows `usage { timesUsed: 1, revenue: 808 }`
  - the seed leaves exactly one code, `DIWALI10`, with the pinned values
- [ ] **Step 2: Run `pnpm test:int -- commerce-schema`.** Expected: FAIL.
- [ ] **Step 3: Implement the collections,** register them in `payload.config.ts` after `Pages`, update the seed, then run `pnpm generate:types`.
- [ ] **Step 4: Run `pnpm test:int`, `pnpm typecheck` and `pnpm lint`.** Expected: all pass. The dev server's schema push creates the new tables.

### Task 4: Transactions, stock, counters, rate limits, settings

**Files:**
- Modify: `src/lib/commerce/db.ts`
- Create: `src/lib/commerce/stock.ts`, `src/lib/commerce/counters.ts`, `src/lib/commerce/rateLimit.ts`, `src/lib/commerce/settings.ts`, `src/lib/request.ts`
- Test: `tests/int/commerce-infra.int.spec.ts`, `tests/unit/request.spec.ts`

**Interfaces:**
- Consumes: `drizzleFor`, `SqlExecutor` (Task 1); `CommerceSettings` (Task 2).
- Produces:
```ts
// db.ts
export type Tx = { transactionID: string | number; db: SqlExecutor; req: { transactionID: string | number } }
export async function withTransaction<T>(payload: Payload, fn: (tx: Tx) => Promise<T>): Promise<T>  // begin → fn → commit; rollback + rethrow on throw
// stock.ts
export type StockItem = { productId: number; variantId: string; qty: number }
export type ReserveResult = { ok: true } | { ok: false; productId: number; variantId: string; available: number }
export async function reserveStock(db: SqlExecutor, items: StockItem[]): Promise<ReserveResult>
export async function releaseStock(db: SqlExecutor, items: StockItem[]): Promise<void>
// counters.ts
export async function nextNumber(db: SqlExecutor, key: string, start: number): Promise<number>  // first call → start + 1
export const formatOrderNumber = (n: number): string => `RC${n}`
// rateLimit.ts
export async function hitRateLimit(payload: Payload, key: string, opts: { limit: number; windowMs: number }): Promise<boolean>  // true = allowed and recorded
// settings.ts
export async function loadCommerceSettings(payload: Payload): Promise<CommerceSettings & { whatsappNumber: string | null }>
// request.ts
export function clientIp(request: Request): string   // cf-connecting-ip → first x-forwarded-for → x-real-ip → 'unknown'
export function hashIp(ip: string): string           // sha256(`${ip}:${PAYLOAD_SECRET}`) hex, first 32 chars
```
- **SQL behaviour:**
  - `reserveStock` sorts the items by `variantId` (a consistent lock order prevents deadlocks). It runs `UPDATE products_variants SET stock = stock - ${qty} WHERE id = ${variantId} AND _parent_id = ${productId} AND stock >= ${qty} RETURNING stock` for each item.
  - On the first 0-row update, it releases the items it already reserved in this call, reads `stock::int` for the failing row (0 if the row is missing), and returns `ok: false`. The caller's transaction therefore stays usable.
  - `releaseStock` adds `qty` back, matching on `id` and `_parent_id`. Missing rows are ignored.
  - `nextNumber` runs `INSERT INTO counters (key, last_number) VALUES (${key}, ${start + 1}) ON CONFLICT (key) DO UPDATE SET last_number = counters.last_number + 1, updated_at = now() RETURNING last_number`.
- **Other behaviour:**
  - `hitRateLimit` counts `rate-limits` rows with this `key` and `createdAt` newer than `now − windowMs`. At or over the limit it returns false and records nothing. Otherwise it inserts a row and deletes this key's rows older than the window.
  - `loadCommerceSettings` reads `store-settings` uncached (`findGlobal`, depth 0). It fills null values with the spec defaults (49, 499, 0, 2000, 5, 30, 24), except `freeShippingAbove`, where null means never.

- [ ] **Step 1: Write the failing tests.**
  - **Int tests** (seeded DB):
    - reserving Mint 2 + Sand 1 decrements both
    - reserving Mint 1 + Sand 99 returns `{ ok: false, variantId: <Sand>, available: 3 }`, with Mint unchanged afterwards
    - two concurrent `withTransaction` calls, each reserving the last unit of a variant set to stock 1, produce exactly one `ok: true`
    - `releaseStock` restores stock
    - `nextNumber(db, 'order', 1000)` returns 1001 then 1002
    - a `withTransaction` that calls `nextNumber` and then throws leaves the next call at 1003, not 1004
    - `hitRateLimit` with limit 2 returns true, true, false; a different key returns true; a row whose `created_at` is backdated 2h by SQL is not counted
    - `loadCommerceSettings` returns the seeded `{ shippingFee: 49, freeShippingAbove: 499, prepaidDiscount: 0, codMaxOrderValue: 2000, maxPerOrder: 5 }`
  - **Unit tests:**
    - `clientIp` returns `'1.2.3.4'` for `x-forwarded-for: '1.2.3.4, 10.0.0.1'`
    - `cf-connecting-ip` wins over `x-forwarded-for`
    - with no headers it returns `'unknown'`
    - `hashIp('1.2.3.4')` is 32 hex chars, stable, and doesn't contain `'1.2.3.4'`
- [ ] **Step 2: Run them and confirm they fail.** Run `pnpm test:unit -- request` and `pnpm test:int -- commerce-infra`.
- [ ] **Step 3: Implement the modules.** Raw SQL uses `sql` from `@payloadcms/db-postgres`. Payload calls inside a transaction pass `req: tx.req`.
- [ ] **Step 4: Run `pnpm test:unit`, `pnpm test:int`, `pnpm typecheck` and `pnpm lint`.** Expected: all pass.

### Task 5: Turnstile and Razorpay adapters

**Files:**
- Create: `src/lib/integrations/turnstile/{types,mock,live,index}.ts` and `src/lib/integrations/razorpay/{types,mock,live,signature,index}.ts`
- Modify: `.env.example`
- Test: `tests/unit/turnstile.spec.ts`, `tests/unit/razorpay.spec.ts`

**Interfaces:**
```ts
// turnstile/types.ts
export interface TurnstileClient { verify(token: string, ip?: string): Promise<boolean> }
// turnstile/index.ts
export function getTurnstile(): TurnstileClient
export function turnstileClientConfig(): { mode: 'mock' | 'live'; siteKey: string | null }
export const MOCK_TURNSTILE_TOKEN = 'mock-pass'
// razorpay/types.ts
export interface RazorpayClient {
  mode: 'mock' | 'live'
  keyId: string
  createOrder(input: { amountPaise: number; receipt: string; notes?: Record<string, string> }): Promise<{ id: string; amount: number; currency: 'INR' }>
  refund(paymentId: string, amountPaise: number): Promise<{ id: string }>
  verifyPaymentSignature(input: { orderId: string; paymentId: string; signature: string }): boolean
  verifyWebhookSignature(rawBody: string, signature: string): boolean
}
// razorpay/signature.ts
export function hmacHex(secret: string, payload: string): string
export function safeEqualHex(a: string, b: string): boolean   // timingSafeEqual; false on length mismatch
// razorpay/mock.ts
export const MOCK_RAZORPAY = { keyId: 'rzp_test_mock', keySecret: 'mock_key_secret', webhookSecret: 'mock_webhook_secret' }
export const mockRazorpay: RazorpayClient
// razorpay/index.ts
export function getRazorpay(): RazorpayClient
```

**Behaviour:**
- **Turnstile mock:** `verify` returns true for any non-empty token except `'fail'`.
- **Turnstile live:** POSTs form data `secret`, `response` and `remoteip` to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with a 5s timeout. It returns `json.success === true`, and false on any error.
- **Turnstile env:** `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`. Live mode throws when either is missing.
- **Razorpay signatures:** the payment signature is `hmacHex(keySecret, `${orderId}|${paymentId}`)`, and the webhook signature is `hmacHex(webhookSecret, rawBody)` (spec §8.4).
- **Razorpay mock:**
  - `createOrder` returns `order_mock_` plus 14 hex chars, with the given amount.
  - `refund` returns `rfnd_mock_` plus 14 hex chars.
  - Signatures use `MOCK_RAZORPAY`.
- **Razorpay live:**
  - `createOrder`: `POST https://api.razorpay.com/v1/orders` with Basic auth `keyId:keySecret` and JSON `{ amount, currency: 'INR', receipt, notes }`.
  - `refund`: `POST https://api.razorpay.com/v1/payments/{paymentId}/refund` with `{ amount }`.
  - A non-2xx response throws an `Error` that includes the status.
  - Env: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`. Live mode throws when any is missing.
- **`.env.example`:** add `RAZORPAY_MODE=mock`, `RAZORPAY_KEY_ID=`, `RAZORPAY_KEY_SECRET=`, `RAZORPAY_WEBHOOK_SECRET=`, `TURNSTILE_MODE=mock`, `TURNSTILE_SITE_KEY=` and `TURNSTILE_SECRET_KEY=`, each with a one-line comment.

- [ ] **Step 1: Write the failing unit tests.**
  - **Mock verify:**
    - Turnstile: true for `'mock-pass'`, false for `'fail'` and `''`.
    - Razorpay signatures: a signature from `hmacHex(MOCK_RAZORPAY.keySecret, 'order_1|pay_1')` verifies; a tampered one doesn't; one of a different length returns false without throwing.
    - The webhook signature over `'{"a":1}'` verifies.
    - `createOrder` ids match `/^order_mock_[0-9a-f]{14}$/`.
  - **Live adapters,** with `vi.stubGlobal('fetch', …)` and live env set inside the test:
    - Razorpay `createOrder` calls the orders URL with method POST and `Authorization: 'Basic ' + base64('key:secret')`. The body contains `amount: 80800, currency: 'INR', receipt: 'RC1001'`.
    - A 401 response rejects.
    - Turnstile live posts `secret` and `response` and returns false when the response says `{ success: false }`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement both adapters.**
- [ ] **Step 4: Run `pnpm test:unit`, `pnpm typecheck` and `pnpm lint`.** Expected: all pass.

### Task 6: Cart loading and the quote endpoint

**Files:**
- Create: `src/lib/commerce/checkoutInput.ts` (pure; items parsing in this task), `src/lib/commerce/cartLoader.ts`, `src/lib/commerce/quote.ts`, `src/app/(frontend)/api/checkout/quote/route.ts`
- Modify: `src/lib/integrations/shiprocket/types.ts` (add `state?: string`), `src/lib/integrations/shiprocket/mock.ts` (`226001` returns `city: 'Lucknow', state: 'Uttar Pradesh'`)
- Test: `tests/unit/checkoutInput.spec.ts`, `tests/int/quote.int.spec.ts`

**Interfaces:**
- Consumes: everything in Task 2; `loadCommerceSettings`, `hitRateLimit`, `clientIp` and `hashIp` (Task 4); `getPickupPincode` (Task 1); `getShiprocket` (existing).
- Produces:
```ts
// checkoutInput.ts
export type ItemInput = { productId: number; variantId: string; qty: number }
export function parseItems(value: unknown): { ok: true; items: ItemInput[] } | { ok: false; error: string }
// cartLoader.ts
export type CartIssue = { productId: number; variantId: string; message: string }
export async function loadCart(payload: Payload, items: ItemInput[], settings: CommerceSettings): Promise<{ lines: PricedLine[]; issues: CartIssue[] }>
// quote.ts
export type QuoteRequest = { items: ItemInput[]; pincode?: string | null; paymentMethod: PaymentMethod; discountCode?: string | null; phone?: string | null }
export type QuoteLine = { productId: number; variantId: string; title: string; variantName: string; slug: string; unitPrice: number; qty: number; lineTotal: number }
export type DeliveryInfo = { pincode: string; serviceable: boolean; codAvailable: boolean; etaDays: { min: number; max: number } | null; city: string | null; state: string | null; message: string }
export type Quote = { lines: QuoteLine[]; issues: CartIssue[]; totals: Totals; discountCode: string | null; codeError: string | null; delivery: DeliveryInfo | null; cod: CodResult }
export type CheckoutComputation = { quote: Quote; lines: PricedLine[]; settings: CommerceSettings; codeRule: DiscountCodeRule | null }
export async function computeCheckout(payload: Payload, req: QuoteRequest, mode: 'quote' | 'order'): Promise<CheckoutComputation>
```

**Rules:**
- **`parseItems`:**
  - 1–20 items. Each has `productId` (integer 1–999999999), `variantId` (`/^[A-Za-z0-9_-]{1,64}$/`) and `qty` (integer 1–99).
  - **Duplicate `(productId, variantId)` pairs are merged by summing qty** (Review Focus 4).
  - Errors are `Your cart is empty` and `Invalid cart`.
- **`loadCart`:**
  - Reads `products` where `id in (...)` with `draft: false, overrideAccess: false, depth: 0`.
  - A missing product or unknown variant gives the issue `This item is no longer available` and no line.
  - `qty` is clamped to `settings.maxPerOrder`, with the issue `Max {n} per order`.
  - `stock` is the variant's live stock.
- **`computeCheckout`:**
  - **Quote mode** also clamps `qty` to `stock`, with the issue `Only {n} left`. A line at stock 0 is dropped with the issue `Out of stock`.
  - **Order mode** leaves quantities as asked (reservation decides).
  - **Code:** the code is normalised, then the rule is loaded from `discount-codes` (overrideAccess).
    - `totalUses` counts orders with that `discountCode` whose `status` isn't `cancelled`.
    - `phoneUses` adds `customer.phone` when `normalizePhone(phone)` is valid; otherwise it is null.
    - An invalid code sets `codeError` and contributes 0 discount. `discountCode` is the normalised code only when it is ok.
  - **Delivery:** only for a `PINCODE_RE` pincode. It calls `checkServiceability` with `getPickupPincode`, `weightGrams = Σ weightGrams × qty`, and `cod: true`. The message is:
    - serviceable: `Delivers to {city} in {min}–{max} days`, or `Delivers in {min}–{max} days` with no city, plus ` · COD available` when `codAvailable`
    - otherwise: `Sorry, we can't deliver to {pincode} yet`
  - **COD:** `codEligibility` with `blocked` (`cod-blocklist` has the normalised phone) and `codServiceable = delivery ? delivery.serviceable && delivery.codAvailable : null`.
- **Route `POST /api/checkout/quote`:**
  - Responds `Cache-Control: no-store`.
  - Bad JSON or bad items give 400 `{ error }`.
  - When `discountCode` is non-empty, `hitRateLimit(payload, 'quote-code:' + hashIp(clientIp(req)), { limit: 30, windowMs: 3_600_000 })` must allow the request. Otherwise it returns 429 `{ error: 'Too many attempts. Please try again in an hour.' }`.
  - On success it responds 200 with the `Quote`.

- [ ] **Step 1: Write the failing tests.**
  - **Unit:** `parseItems` merges `[{1,'a',2},{1,'a',3}]` into qty 5, and rejects 21 items, qty 0, qty 1.5 and a variantId of `'a b'`.
  - **Int, through the route handler:**
    - 2× container Mint, pincode 226001, prepaid, code `diwali10` gives subtotal 898, codeDiscount 90, shipping 0, total 808, `discountCode: 'DIWALI10'`, and delivery message `Delivers to Lucknow in 3–5 days · COD available`.
    - 1× container Mint with the code gives `codeError: 'Add ₹50 more to use this code'`, total 498.
    - Sand qty 5 gives the issue `Only 3 left` and a line qty of 3.
    - An unpublished product and an unknown variant each give `This item is no longer available`.
    - 2× karaoke, pincode 226001, cod gives `cod.reason: 'Cash on delivery is available on orders up to ₹2,000'`.
    - Pincode `000000` gives `delivery.serviceable: false` with `Sorry, we can't deliver to 000000 yet`.
    - Pincode `111111` gives the COD reason `Cash on delivery isn't available for this pincode`.
    - A blocklisted phone gives the blocked reason.
    - The 31st code-bearing quote from one IP returns 429.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement the modules and the route.**
- [ ] **Step 4: Run `pnpm test:unit`, `pnpm test:int`, `pnpm typecheck` and `pnpm lint`.** Expected: all pass.

### Task 7: Place order (`POST /api/checkout`)

**Files:**
- Modify: `src/lib/commerce/checkoutInput.ts`
- Create: `src/lib/commerce/checkout.ts`, `src/lib/commerce/orderOps.ts`, `src/lib/commerce/paymentLaunch.ts`, `src/app/(frontend)/api/checkout/route.ts`
- Test: `tests/unit/checkoutInput.spec.ts` (extend), `tests/int/checkout.int.spec.ts`

**Interfaces:**
- Consumes: Tasks 2, 4, 5 and 6.
- Produces:
```ts
// checkoutInput.ts
export type CheckoutFields = { name: string; phone: string; email: string; line1: string; line2: string; landmark: string; pincode: string; city: string; state: string }
export type CheckoutField = keyof CheckoutFields
export function fieldErrors(f: CheckoutFields): Partial<Record<CheckoutField, string>>   // pure; the checkout form reuses it
export type CheckoutInput = { items: ItemInput[]; customer: { name: string; phone: string; email: string | null }; address: { line1: string; line2: string | null; landmark: string | null; city: string; state: string; stateCode: string; pincode: string }; paymentMethod: PaymentMethod; discountCode: string | null; turnstileToken: string; honeypot: string; idempotencyKey: string; expectedTotal: number }
export function parseCheckoutInput(body: unknown): { ok: true; value: CheckoutInput } | { ok: false; error: string; field?: CheckoutField | 'items' }
// paymentLaunch.ts
export type PaymentLaunch = { mode: 'mock' | 'live'; keyId: string; razorpayOrderId: string; amountPaise: number; currency: 'INR'; orderNumber: string; orderUrl: string; prefill: { name: string; contact: string; email?: string } }
export const orderUrl = (orderNumber: string, token: string): string => `/order/${orderNumber}?t=${token}`
export function buildPaymentLaunch(order: Order): PaymentLaunch | null   // only pending_payment orders with razorpay.orderId
// orderOps.ts
export async function lockOrder(db: SqlExecutor, orderId: number): Promise<void>   // SELECT id FROM orders WHERE id = $1 FOR UPDATE
export function withTimelineEntry(order: Pick<Order, 'timeline'>, entry: { status: OrderStatus; by: 'system' | 'admin'; note: string }): NonNullable<Order['timeline']>
export async function cancelPendingOrder(payload: Payload, orderId: number, note: string): Promise<Order | null>   // pending_payment | awaiting_confirmation only: release stock, set cancelled, append timeline, revalidate after commit; plan 4's expiry job reuses this
// checkout.ts
export type PlaceOrderResponse = { status: 200 | 201; body: { orderNumber: string; token: string; orderUrl: string; payment: PaymentLaunch | null } } | { status: 400 | 409 | 422 | 429 | 502; body: { error: string; code?: 'cart_changed' | 'price_changed' | 'stock' | 'turnstile'; field?: string } }
export async function placeOrder(payload: Payload, input: CheckoutInput, ctx: { ipHash: string; userAgent: string }): Promise<PlaceOrderResponse>
```

**Field messages** (`fieldErrors` and `parseCheckoutInput` share them):

| Field | Rule | Message |
|---|---|---|
| name | 2–80 chars | `Enter your full name` |
| phone | `normalizePhone` | `Enter a 10-digit mobile number` |
| email | optional, ≤120 chars, `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` | `Enter a valid email or leave it empty` |
| line1 | 3–120 chars | `Enter your address` |
| line2, landmark | ≤120 chars | — |
| pincode | `PINCODE_RE` | `Enter a valid 6-digit pincode` |
| city | 2–60 chars | `Enter your city` |
| state | `stateCodeFor` | `Choose your state` |

`idempotencyKey` must match `/^[A-Za-z0-9-]{16,64}$/`.

**`placeOrder` order of operations** (first failure wins):
1. A non-empty honeypot gives 400 `Something went wrong. Please try again.`
2. An existing order with `meta.idempotencyKey` returns 200 with that order's body: `payment` from `buildPaymentLaunch`, and the token from the order.
3. `hitRateLimit('checkout:' + ipHash, { limit: 10, windowMs: 3_600_000 })` fails → 429 `Too many attempts. Please try again in an hour.`
4. `getTurnstile().verify` is false → 400 `Please complete the security check and try again.`, code `turnstile`.
5. 3 or more orders with this phone created in the last 24h, any status → 429 `You've placed 3 orders today. Please WhatsApp us to order more.`
6. Run `computeCheckout(..., 'order')`.
   - Any `This item is no longer available` issue → 409 `Some items in your cart are no longer available. We've updated your cart.`, code `cart_changed`.
   - Delivery not serviceable → 422, field `pincode`, with the delivery message.
   - `codeError` → 422, field `discountCode`, with that message.
   - `totals.total !== expectedTotal` → 409 `Your total changed to {formatINR(total)}. Please check and place your order again.`, code `price_changed`.
   - COD not eligible → 422, field `paymentMethod`, with the reason.
7. Inside `withTransaction`:
   - Run `reserveStock`. On `ok: false`, throw so the transaction rolls back, then return 409 `Only {available} left of {title}`, plus ` ({variantName})` unless the name is `Default`, with code `stock`.
   - Allocate the order number with `formatOrderNumber(await nextNumber(db, 'order', 1000))`.
   - Create the order with `req: tx.req`:
     - status `pending_payment` (prepaid) or `awaiting_confirmation` (cod)
     - paymentStatus `unpaid` or `cod_pending`
     - `accessToken: randomBytes(24).toString('base64url')`
     - the item snapshot and totals
     - `timeline: [{ status, at: now, by: 'system', note: 'Order placed' }]`
     - `meta { ipHash, userAgent (truncated to 200 chars), turnstileVerified: true, idempotencyKey }`
   - A unique-violation on `idempotencyKey` (a concurrent duplicate) is caught after rollback, and the existing order is returned as in step 2.
8. After commit, call `revalidate(['products', ...slugs.map(s => 'product:' + s)])`.
9. Prepaid: `getRazorpay().createOrder({ amountPaise: total * 100, receipt: orderNumber, notes: { orderNumber } })`, then store `razorpay.orderId`. If it throws, call `cancelPendingOrder(payload, id, 'Payment could not be started')` and return 502 `We couldn't start the payment. Please try again.`
10. Return 201.

The **route** parses JSON. A parse error returns 400 with `field`. Otherwise it calls `placeOrder` with `ipHash` (`hashIp(clientIp(request))`) and the user agent, and responds `no-store`.

- [ ] **Step 1: Write the failing tests.**
  - **Unit:** `fieldErrors` returns each message above for a bad value, and `{}` for a valid form with phone `'+91 98765 00001'`.
  - **Int, through the route handler** (each case uses its own phone and IP):
    - COD duck 1× returns 201. The order has `orderNumber` matching `/^RC1\d{3}$/`, status `awaiting_confirmation`, `paymentStatus: cod_pending`, duck stock 9, a timeline note `Order placed`, a 32-char `meta.ipHash` that doesn't equal the IP, and `payment: null`.
    - Prepaid 2× Mint with `DIWALI10`, `expectedTotal: 808`, returns 201: status `pending_payment`, `razorpay.orderId` matching `/^order_mock_/`, `payment.amountPaise: 80800`, `payment.mode: 'mock'`.
    - Honeypot gives 400. Token `'fail'` gives code `turnstile`.
    - The 11th attempt from one IP gives 429. A 4th order for one phone gives 429.
    - `expectedTotal: 1` gives 409 `price_changed`, and no order is created.
    - An unpublished product gives 409 `cart_changed`.
    - Sand qty 4 with `maxPerOrder` 5 gives 409 `Only 3 left of Mexico premium container, set of 2 (Sand)`, and stock is unchanged.
    - COD 2× karaoke gives 422 with field `paymentMethod`.
    - A blocklisted phone with COD gives 422 `Cash on delivery isn't available for this order. Please pay online.`
    - With `vi.spyOn(mockRazorpay, 'createOrder').mockRejectedValueOnce(new Error('down'))`: 502, the order is `cancelled`, and stock is restored.
    - The same `idempotencyKey` posted twice in sequence, and twice concurrently (`Promise.all`), returns the same `orderNumber` both times. Exactly one order exists and stock drops once.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `pnpm test:unit`, `pnpm test:int`, `pnpm typecheck` and `pnpm lint`.** Expected: all pass.

### Task 8: Payments (verify, webhook, mock pay page)

**Files:**
- Create: `src/lib/commerce/payments.ts`, `src/app/(frontend)/api/checkout/verify/route.ts`, `src/app/(frontend)/api/webhooks/razorpay/route.ts`, `src/app/(frontend)/(bare)/dev/mock-pay/page.tsx`, `src/app/(frontend)/(bare)/dev/mock-pay/actions.ts`
- Modify: `src/app/robots.ts` (disallow `/dev`)
- Test: `tests/int/payments.int.spec.ts`

**Interfaces:**
- Consumes: `getRazorpay`, `MOCK_RAZORPAY` and `hmacHex` (Task 5); `withTransaction` and `reserveStock` (Task 4); `lockOrder`, `withTimelineEntry` and `orderUrl` (Task 7); `assertTransition` (Task 2).
- Produces:
```ts
export type PaidOutcome = 'confirmed' | 'already_paid' | 'late_confirmed' | 'late_refunded' | 'unknown_order'
export async function markPaid(payload: Payload, input: { razorpayOrderId: string; paymentId: string }): Promise<{ outcome: PaidOutcome; order: Order | null }>
export async function recordPaymentFailure(payload: Payload, input: { razorpayOrderId: string; paymentId: string | null; reason: string }): Promise<void>
export async function handleRazorpayWebhook(payload: Payload, rawBody: string, signature: string | null): Promise<{ status: 200 | 400 | 500 }>
```

**`markPaid`:** everything happens inside one `withTransaction` holding `lockOrder`. It finds the order by `razorpay.orderId`; no order gives `unknown_order`.
- `paymentStatus` is `paid` or `refunded` with the same `paymentId` → `already_paid`, with no write.
- `pending_payment` → `confirmed`, `paymentStatus: paid`, `paymentId` set, timeline `Payment received`.
- `cancelled` and unpaid (the late payment of §8.4.4):
  - If `reserveStock` succeeds → `confirmed` with `{ latePayment: true }`, `paid`, timeline `Paid after expiry; stock re-reserved`, outcome `late_confirmed`.
  - Otherwise, still inside the lock, call `getRazorpay().refund(paymentId, total * 100)`. Then set `paymentStatus: refunded`, `paymentId`, `refundId`, `alert.message: 'Paid after expiry, refunded'`, and timeline `Paid after expiry; refunded (out of stock)`. Outcome `late_refunded`.
  - If the refund throws, the transaction rolls back and the error propagates. The webhook returns 500 so Razorpay retries.
- Revalidate the product tags after commit when stock changed.

**`recordPaymentFailure`:** on a `pending_payment` order, it appends timeline note `Payment failed` (with ` ({paymentId})` when known) unless an identical note already exists. Status does not change.

**Verify route `POST /api/checkout/verify`:**
- Body: `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`.
- A bad signature gives 400 `{ error: 'Payment could not be verified' }`.
- Otherwise it calls `markPaid`. `unknown_order` gives 404; anything else gives 200 `{ url: orderUrl(...) }`.

**Webhook route `POST /api/webhooks/razorpay`:**
- Reads `await request.text()` and the `x-razorpay-signature` header.
- A bad signature or bad JSON gives 400.
- `order.paid` calls `markPaid` with `payload.order.entity.id` and `payload.payment.entity.id`.
- `payment.failed` calls `recordPaymentFailure` with `payment.entity.order_id`, `payment.entity.id` and `error_description`.
- Other events give 200.

**Mock pay page `/dev/mock-pay?order=<razorpayOrderId>`:**
- Calls `notFound()` when `getRazorpay().mode === 'live'`.
- Looks up the order by `razorpay.orderId`. An unknown order gives `notFound()`. A non-pending order redirects to its order URL.
- Renders an `h1` "Test payment", the text `This is a test payment page. No money moves.`, `Order {orderNumber}`, the amount as `formatINR(total)`, and two submit buttons, **Succeed** and **Fail**.
- The server actions re-check the mode.
  - **Succeed:** builds `paymentId = 'pay_mock_' + 14 hex`, signs `${orderId}|${paymentId}` with `MOCK_RAZORPAY.keySecret`, and runs the same verify logic. It then calls `handleRazorpayWebhook` with a signed `order.paid` body (spec §11: the verify path and the webhook path both fire). Finally it redirects to the order URL.
  - **Fail:** calls `recordPaymentFailure(..., reason: 'Test payment failed')` and redirects to the order URL.

- [ ] **Step 1: Write the failing int tests.** Create orders through `placeOrder` (prepaid).
  - **Verify:** a valid signature gives 200 with a url containing `/order/RC`; the order is `confirmed` and `paid`.
  - **Idempotency and bad input:**
    - verify then the webhook for the same payment leaves one `Payment received` entry
    - the webhook alone confirms the order
    - a bad webhook signature gives 400
    - a bad verify signature gives 400
  - **Late payment:**
    - **Stock available:** cancel the order with `cancelPendingOrder`, then `markPaid` gives `late_confirmed` with stock re-reserved.
    - **Stock gone:** set the variant stock to 0 by SQL, then `markPaid` gives `late_refunded`, `refundId` matching `/^rfnd_mock_/`, and the alert set.
  - `payment.failed` appends `Payment failed (pay_x)` once, even when delivered twice.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `pnpm test:int`, `pnpm typecheck`, `pnpm lint` and `pnpm build`.** Expected: all pass.

### Task 9: Order status page and `/track`

**Files:**
- Create:
  - `src/lib/commerce/customerOrder.ts`
  - `src/app/(frontend)/(site)/order/[orderNumber]/page.tsx`
  - `src/app/(frontend)/(site)/track/page.tsx`
  - `src/app/(frontend)/api/track/route.ts`
  - `src/components/order/{OrderTimeline,PayAgainButton,TrackForm}.tsx`
  - `src/components/checkout/launchPayment.ts`
- Test: `tests/int/customer-order.int.spec.ts`

**Interfaces:**
- Consumes: `buildPaymentLaunch`, `PaymentLaunch` and `orderUrl` (Task 7); `maskPhone` and `normalizePhone` (Task 2); `buildWhatsAppLink` (existing); `loadCommerceSettings` (Task 4).
- Produces:
```ts
// customerOrder.ts
export type CustomerOrderView = { orderNumber: string; status: OrderStatus; heading: string; message: string | null; paymentLabel: string; paymentMethod: PaymentMethod; createdAt: string; items: { label: string; qty: number; lineTotal: number }[]; totals: Pick<Totals, 'subtotal' | 'codeDiscount' | 'shippingFee' | 'prepaidDiscount' | 'total'>; discountCode: string | null; shipTo: { name: string; phone: string; place: string }; step: 0 | 1 | 2 | 3; trackingUrl: string | null; payment: PaymentLaunch | null; whatsappUrl: string | null }
export async function getOrderForCustomer(payload: Payload, orderNumber: string, token: string | null): Promise<CustomerOrderView | null>
export async function findOrderUrl(payload: Payload, orderNumber: string, phone: string): Promise<string | null>
// launchPayment.ts ('use client' module)
export async function launchPayment(p: PaymentLaunch): Promise<void>
```

**Rules:**
- **Token check:** compared with `timingSafeEqual` on equal-length buffers. A missing token, wrong token or unknown number all return null, and the page calls `notFound()` (Review Focus 5). The view never contains `accessToken`, the full phone, or address lines.
- **Headings by status:**

  | Status | Heading |
  |---|---|
  | pending_payment | `Payment pending` |
  | awaiting_confirmation | `Order received` |
  | confirmed, ready_to_ship | `Order confirmed` |
  | shipped | `Shipped` |
  | out_for_delivery | `Out for delivery` |
  | delivered | `Delivered` |
  | cancelled | `Cancelled` |
  | rto | `Returned to us` |
  | returned | `Returned` |

- **Messages:**
  - pending_payment: `We haven't received your payment yet. Complete it within {pendingPaymentMinutes} minutes to keep your items.`
  - awaiting_confirmation: `We'll WhatsApp you shortly to confirm your order.`
  - confirmed: `Thanks! We'll pack your order soon.`
  - every other status: null
- **`paymentLabel`:** `Paid online` | `Cash on delivery` | `Payment pending` | `Refunded`.
- **Item label:** `{title} — {variantName}`, or just `{title}` when the variant is `Default`.
- **`shipTo`:** `{ name, phone: maskPhone(phone), place: '{city}, {state} {pincode}' }`.
- **`step`:** placed 0; confirmed or ready_to_ship 1; shipped or out_for_delivery 2; delivered 3. Cancelled, rto and returned keep their last reached step.
- **`whatsappUrl`:** `buildWhatsAppLink(whatsappNumber, 'Hi, I have a question about my order {orderNumber}')`, when a number is set.
- **`findOrderUrl`:** normalises the order number (`trim().toUpperCase()`) and the phone (`normalizePhone`). It returns `orderUrl(...)` only when both match.
- **Order page:**
  - `robots: { index: false }`, and never cached.
  - Shows the heading as `h1`, the message, the text `Order {orderNumber}`, and the note `Save or screenshot this page. You'll need your order number to track it.`
  - Shows a timeline (`ol` of Placed / Confirmed / Shipped / Delivered, with `aria-current="step"` on the current one), the items, the totals and the ship-to.
  - Shows a **Track your parcel** link when there is a `trackingUrl`, a **Chat on WhatsApp** link, and a **Complete payment** button (`PayAgainButton`, which calls `launchPayment`) when there is a `payment`.
- **`launchPayment`:**
  - **Mock:** `window.location.assign('/dev/mock-pay?order=' + encodeURIComponent(p.razorpayOrderId))`.
  - **Live:**
    1. Load `https://checkout.razorpay.com/v1/checkout.js` once.
    2. Open `new Razorpay({ key, order_id, amount, currency, name: 'Reyan Collections', timeout: 900, prefill, handler, modal: { ondismiss } })`.
    3. The `handler` POSTs to `/api/checkout/verify` and then `location.assign`s the returned url.
    4. `ondismiss` calls `location.assign(p.orderUrl)`.
- **`/track` page:** `h1` "Track your order". A `TrackForm` with the labels `Order number` and `Mobile number`, and a **Find my order** button. It POSTs to `/api/track` and redirects to the returned url. A 404 shows `We couldn't find an order with that number and phone.` in `role="alert"`.
- **Route `POST /api/track`:**
  - `hitRateLimit('track:' + ipHash, { limit: 20, windowMs: 3_600_000 })` fails → 429 `Too many attempts. Please try again in an hour.`
  - Found → 200 `{ url }`.
  - Not found → 404 `{ error: "We couldn't find an order with that number and phone." }`.

- [ ] **Step 1: Write the failing int tests.** Create orders with `placeOrder`.
  - **Token checks:**
    - the right token gives the `Order received` view with phone `••••••0021`, place `Lucknow, Uttar Pradesh 226001`, and no `accessToken` key (deep check of `JSON.stringify`)
    - a wrong token, a null token and an unknown number each give null
  - **Pending orders:** a prepaid pending order has `payment.mode: 'mock'` and heading `Payment pending`.
  - **`findOrderUrl`:**
    - `(lowercase number, '+91 98765 00021')` gives the url
    - a wrong phone gives null
  - **Track route:** the 21st request from one IP gives 429.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `pnpm test:int`, `pnpm typecheck`, `pnpm lint` and `pnpm build`.** Expected: all pass.

### Task 10: Checkout page and the prepaid journey

**Files:**
- Create:
  - `src/app/(frontend)/(site)/checkout/page.tsx`
  - `src/components/checkout/CheckoutForm.tsx`, plus focused children the implementer chooses (contact, address, payment, summary, discount, turnstile)
  - `tests/e2e/checkout-prepaid.e2e.spec.ts`
- Modify:
  - `src/components/cart/CartProvider.tsx`: add `clear(): void` to the context
  - `playwright.config.ts`: the `mobile` project matches `storefront` and `checkout-*` specs, and `chromium` ignores both

**Interfaces:**
- Consumes: `Quote` (Task 6); `fieldErrors`, `CheckoutFields` and `PaymentLaunch` (Task 7); `INDIAN_STATES` (Task 2); `launchPayment` (Task 9); `turnstileClientConfig` and `MOCK_TURNSTILE_TOKEN` (Task 5); `useCart` (existing, plus `clear`).

**Behaviour** (exact copy; e2e asserts it):
- **Page:**
  - `h1` "Checkout", with `robots: { index: false }`.
  - It passes `turnstileClientConfig()` and `prepaidDiscount` to the client form.
  - An empty cart shows `Your cart is empty` and a **Shop all products** link.
- **Sections:**
  - **Contact:** `Full name`, `Mobile number`, `Email (optional)`.
  - **Delivery address:**
    - fields: `Address line 1`, `Address line 2 (optional)`, `Landmark (optional)`, `Pincode`, `City`, `State` (a select of `INDIAN_STATES` names with the placeholder `Choose state`)
    - the delivery message shows under Pincode
    - when the quote returns `delivery.city` or `delivery.state` and the field is empty, it is filled in
  - **Discount code:** label `Discount code`, with an **Apply** button.
    - On error, `codeError` shows in `role="alert"`.
    - When applied, it shows `{CODE} applied` and a **Remove** button.
    - The applied code stays in every later quote request, so it becomes valid again after a cart change.
  - **Payment:** radios `Pay online` (default; shows `Save {formatINR(prepaidSaving)}` when `prepaidSaving > 0`) and `Cash on delivery`. COD is disabled with `cod.reason` shown when it isn't eligible, and the selection falls back to Pay online.
  - **Order summary:**
    - quote lines (`{title} — {variantName}` × qty)
    - rows `Subtotal`, `Discount ({CODE})` (only when > 0), `Shipping` (`Free` when 0), `Prepaid discount` (only when > 0) and `Total`
    - the text `Prices include GST`
    - an **Edit cart** button that opens the cart drawer
- **Requoting:** the form re-quotes (debounced 300ms, latest response wins) whenever the cart lines, a valid pincode, the payment method, the applied code or a valid phone changes. Quote issues are listed above the summary.
- **Hidden fields:** a honeypot input `name="website"` (visually hidden, `tabIndex={-1}`, `autoComplete="off"`, `aria-hidden`). Turnstile in mock mode sets `MOCK_TURNSTILE_TOKEN` and renders nothing. In live mode it renders the Cloudflare widget explicitly (`render=explicit`, the site key from props).
- **Place order:**
  - The button is labelled **Place order**. It is disabled while submitting (a ref guard against double taps), while a quote is loading, when delivery is unserviceable, or when there are no quote lines.
  - Client validation uses `fieldErrors`, shown under each field with `aria-describedby`.
  - Submit POSTs to `/api/checkout` with `idempotencyKey` (`crypto.randomUUID()` once per form mount, regenerated after any non-2xx response) and `expectedTotal` (the latest quote total).
  - **Success:** `cart.clear()`. COD goes to `router.push(orderUrl)`; prepaid calls `launchPayment(payment)`.
  - **Errors:** `field` errors show on that field. `cart_changed` and `price_changed` show the message and re-quote. Any other error shows in a `role="alert"` box above the button.

- [ ] **Step 1: Write the e2e journey `Instagram shopper pays online with a discount code`** (mobile project, spec §16 journey 1, first half).
  1. `/links`, click **Shop on our website**, then on home open the "Mexico premium container, set of 2" card.
  2. Click the **Sand** swatch. Expect `Colour: Sand`, then **Add to cart**.
  3. In the drawer, click **Checkout**. Fill `Full name` `Asha Verma`, `Mobile number` `98765 00001`, `Address line 1` `12 Park Road` and `Pincode` `226001`.
  4. Expect `City` to have the value `Lucknow`, `State` to be `Uttar Pradesh`, and `Delivers to Lucknow in 3–5 days · COD available` to be visible.
  5. Fill `Discount code` with `diwali10`, click **Apply**, and expect `Add ₹50 more to use this code`.
  6. Click **Edit cart**, then **Increase quantity** in the drawer, and close the drawer.
  7. Expect `DIWALI10 applied`, `Discount (DIWALI10)` `−₹90`, `Shipping` `Free` and `Total` `₹808`.
  8. Click **Place order**. Expect the mock page `Test payment` with `₹808`, then click **Succeed**.
  9. Expect the `h1` `Order confirmed`, text matching `/Order RC\d{4}/`, `Mexico premium container, set of 2 — Sand` and `Paid online`.
  10. Open `/p/mexico-premium-container-set-of-2`, pick **Sand** and expect `Only 1 left`.
  11. In `finally`, restore Sand stock to 3 with `setVariantStock` (`tests/e2e/helpers/productRest.ts`), because `storefront.e2e` asserts `Only 3 left`.
- [ ] **Step 2: Run it and confirm it fails** (there is no `/checkout` page yet).
- [ ] **Step 3: Implement the page and form,** and add `clear` to `CartProvider`.
- [ ] **Step 4: Run the full suite:** `pnpm test:unit`, `pnpm test:int`, `pnpm typecheck`, `pnpm lint`, `pnpm build` and `pnpm test:e2e`. Expected: all pass, and the existing e2e still passes.

### Task 11: COD, `/track` and guard journeys; buy-to-out-of-stock

**Files:**
- Create: `tests/e2e/checkout-cod.e2e.spec.ts`, `tests/e2e/checkout-guards.e2e.spec.ts`
- Modify: `tests/e2e/admin-to-storefront.e2e.spec.ts`

**Interfaces:**
- Consumes: the pages from Tasks 8–10. Only fix product code if a journey exposes a real defect, and report every such fix.

- [ ] **Step 1: Write `checkout-cod.e2e.spec.ts`,** test `shopper orders cash on delivery and finds the order again` (spec §16 journey 2, first half).
  1. Open the duck toy, **Add to cart**, then **Checkout**.
  2. Fill name `Ravi Kumar`, phone `98765 00002`, line 1 `4 Lake View`, pincode `400001`, city `Mumbai`, state `Maharashtra`.
  3. Choose **Cash on delivery** and click **Place order**.
  4. Expect the `h1` `Order received` and `We'll WhatsApp you shortly to confirm your order.`, and capture the order number.
  5. Go to `/track`. Enter the order number in lowercase with the phone `9876500099` and click **Find my order**. Expect `We couldn't find an order with that number and phone.`
  6. Retry with the phone `+91 98765 00002`. Expect `Order received` and the same order number.
- [ ] **Step 2: Write `checkout-guards.e2e.spec.ts`,** test `checkout blocks what it must and holds an unpaid order` (journey 4, first half).
  1. Open the karaoke product, click **Increase quantity** once, **Add to cart**, then **Checkout**.
  2. Fill phone `98765 00003` and pincode `000000`. Expect `Sorry, we can't deliver to 000000 yet` and **Place order** disabled.
  3. Change the pincode to `226001`. Expect the **Cash on delivery** radio disabled and `Cash on delivery is available on orders up to ₹2,000`.
  4. Complete the fields and **Place order** with **Pay online**. On the mock page click **Fail**.
  5. Expect the `h1` `Payment pending` and a visible **Complete payment** button.
- [ ] **Step 3: Change `admin-to-storefront.e2e.spec.ts`** to buy the stock instead of the admin setting it to 0 (journey 3).
  1. After the shop shows the new ₹349 product with stock 2, open it, raise the quantity to 2, **Add to cart** and **Checkout**.
  2. Pay with COD: phone `98765 00004`, pincode `226001`, line 1 `9 Hill Road`. Expect `Order received`.
  3. Open the product page again. Expect **Add to cart** disabled and `Out of stock` visible.
- [ ] **Step 4: Run all of `pnpm test:e2e` twice in a row** (two fresh global setups). Expected: every test passes both times.
- [ ] **Step 5: Run the full suite** (unit, int, typecheck, lint, build). Expected: all pass.
