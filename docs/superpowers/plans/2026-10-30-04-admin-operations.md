# Admin Operations Implementation Plan (Plan 4, milestone M5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shoaib runs every order from his phone. A **Today** screen and an **order actions panel** (both matching the approved mockup) let him:
- confirm COD orders over WhatsApp
- ship through Shiprocket (mock)
- cancel and refund
- mark orders returned or restocked

Behind them:
- GST invoices and packing slips are generated automatically
- jobs expire unpaid and unconfirmed orders
- courier webhooks move orders along
- customers get emails (mock)

**Architecture:**
- **Order rules** live in one place, `lib/commerce/orderActions.ts`. Each action follows the same pattern: lock the order row, re-read it inside a transaction, assert the transition with `orderStateMachine.ts`, apply side effects, commit, then revalidate and notify.
- **Admin entry points** are thin layers over those actions. Admin HTTP actions are Payload **collection endpoints** on `orders`, so they never shadow Payload's REST. The admin UI is custom Payload components: a dashboard-view replacement and a `ui` field at the top of the order edit view.
- **Integrations:**
  - Shiprocket and email follow the existing `types / mock / live / index` adapter pattern, selected by `integrationMode`.
  - Invoices are pure maths (`lib/commerce/invoice.ts`) rendered to PDF with `@react-pdf/renderer`.
  - Jobs use Payload's jobs queue with `schedule`.

**Tech Stack:** Next.js 16.3.3, Payload 3.92 (Postgres, custom admin components, jobs, endpoints), React 19, Tailwind 4 (storefront only), `@react-pdf/renderer` (the one new dependency, pinned exact), Vitest and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-26-reyan-collection-design.md`, mainly §8.2 and §8.5–8.9, §9, §10.3–10.5, §11 and §16 (journeys 1, 2 and 4). The binding admin mockup is `docs/design/mockups/admin-and-architecture.html`. Also read "Carried forward from plan 3" in `docs/superpowers/plans/2026-10-26-00-roadmap.md`.

## Global Constraints

- All Plan 3 global constraints still hold: integer rupees, server-side truth, published-only catalog reads, the `integrationMode` fail-closed, exact copy, no Next routes under `/api/orders/...`, the Next 16 and Payload docs first, `pnpm generate:types` after schema changes, and implementers never commit.
- **The Today view and the order actions panel must match the mockup in content and layout** (spec §10.4).
  - **Today view:** the "this week" band, the cards in mockup order and the quick actions.
  - **Actions panel:** the progress line, the eligibility note, the state-aware actions and the WhatsApp message preview.
  - Both are mobile-first (390px). Use the mockup's palette (ink `#1E1B4B`, tomato `#FF5A36`, card accents amber `#F5A524`, blue `#2D5BFF`, red `#E5484D`, green `#2BB673`, WhatsApp `#25D366`) through scoped CSS (a CSS module, or a scoped class prefix `rc-`), never global admin styles.
  - Every other admin screen stays stock Payload.
- **Admin custom components** are registered by path in the Payload config. After adding or renaming any, run `pnpm generate:importmap` and commit `src/app/(payload)/admin/importMap.js`.
- **Every order mutation goes through `orderActions.ts`** (or `payments.ts` for payments, and `checkout.ts` for creation). Endpoints, jobs, webhooks and dev tools never update order status directly.
- **Network side effects** (Shiprocket booking or cancel, Razorpay refund) run **while holding the order row lock**, inside the transaction. This is the same ruling as the Plan 3 refund: the order is never double-booked or double-refunded. A failed network call rolls the transaction back.
- **Notifications** (`notify`) run **after commit** and **never throw**: failures are logged with `payload.logger.error`. Email is only sent when an address exists.
- **Admin endpoints** require `req.user` (401 `{ error: 'Unauthorized' }` otherwise) and respond `Cache-Control: no-store`.
- **Dev-only tools** (simulate a courier event, run the jobs now, the mock label page) exist only when `process.env.NODE_ENV !== 'production'` **and** the relevant integration is in mock mode. Otherwise they return 404.
- **Tests:**
  - Never run int and e2e (or two suites) at the same time, because both reset `reyan_test`.
  - Int tests use unique phones and IPs. E2E journeys end on a visible assertion, and they restore seeded stock that other specs assert.
  - The e2e run needs `PLAYWRIGHT_BROWSERS_PATH` from the dispatch, and that path is never written into repo files.

## Review Focus

1. **Double-tap on Ship, Cancel or Mark returned** must book, refund or restock exactly once. The row lock is held across the network call, and a second call sees the new status and becomes a no-op that returns the current panel. Tested in Tasks 3 and 5.
2. **Courier webhooks arrive late, duplicated or out of order** (for example "in transit" after "delivered"). Status never moves backwards, and events are recorded once. Tested in Task 5.
3. **Invoice numbers never repeat or skip,** including a failed Ship (rollback) and the 31 March / 1 April IST boundary. Tested in Tasks 4 and 5.
4. **An expiry job racing a late payment or an admin confirm** must not cancel an order that just became paid or confirmed. `cancelOrder` re-checks the status under the lock. Tested in Task 6.
5. **A second COD RTO for a phone already on the blocklist** must not error or duplicate the entry. A prepaid RTO never blocklists. Tested in Task 5.

---

### Task 1: Email adapter, dev inbox and notifications

**Files:**
- Create:
  - `src/lib/integrations/email/{types,mock,live,index}.ts`
  - `src/collections/DevEmails.ts`
  - `src/lib/notifications/templates.ts` and `src/lib/notifications/notify.ts`
- Modify: `src/lib/integrations/mode.ts` (add `'EMAIL'`), `src/payload.config.ts`, `.env.example`, `src/seed/index.ts` (`wipe` deletes `dev-emails`)
- Test: `tests/unit/emailTemplates.spec.ts`, `tests/unit/email.spec.ts`, `tests/int/notify.int.spec.ts`

**Interfaces:**
```ts
// email/types.ts
export type EmailMessage = { to: string; subject: string; html: string; tag: NotifyEvent; orderNumber?: string }
export interface EmailClient { send(msg: EmailMessage): Promise<void> }
// email/index.ts
export function getEmail(payload: Payload): EmailClient   // mock writes a dev-emails doc + payload.logger.info; live POSTs Resend
// notifications/templates.ts (pure)
export type NotifyEvent = 'order_received' | 'order_paid' | 'cod_confirmed' | 'shipped' | 'cancelled' | 'refunded' | 'admin_new_order'
export function renderEmail(event: NotifyEvent, order: Order, ctx: { siteUrl: string; storeName: string; refundAmount?: number }): { subject: string; html: string }
// notifications/notify.ts
export async function notify(payload: Payload, event: NotifyEvent, order: Order, extra?: { refundAmount?: number }): Promise<void>  // never throws
```

**Pinned values:**
- **`dev-emails` collection:** fields `to`, `subject`, `html` (textarea), `tag`, `orderNumber`. Access is read and delete for admins only, and create is `() => false` (the local API bypasses this). `admin.group: 'Dev'`, `useAsTitle: 'subject'`, `defaultColumns: ['subject', 'to', 'createdAt']`.
- **Subjects:**

  | Event | Subject |
  |---|---|
  | order_received | `We got your order {orderNumber}` |
  | order_paid | `Order {orderNumber} confirmed` |
  | cod_confirmed | `Order {orderNumber} confirmed` |
  | shipped | `Your order {orderNumber} is on its way` |
  | cancelled | `Order {orderNumber} cancelled` |
  | refunded | `Refund for order {orderNumber}` |
  | admin_new_order | `New order {orderNumber} · {formatINR(total)} · {COD or Prepaid}` |

- **Bodies:** simple branded HTML with inline styles, using the ink colour and Bricolage-like system font stack. Each body contains:
  - the order number
  - the items (`{title} — {variantName}` × qty, omitting `Default`)
  - the total
  - a **View your order** link to `{siteUrl}{orderUrl(orderNumber, accessToken)}`
  - for `shipped`: the tracking link when there is a `trackingUrl`
  - for `cancelled` and `refunded` with `refundAmount`: the sentence `Your refund of {formatINR(refundAmount)} has been started. It can take 5–7 working days to reach you.`
  - for `order_received`: `We'll WhatsApp you shortly to confirm your order.`

  The admin email body links to `{siteUrl}/admin/collections/orders/{id}`. Every value interpolated into HTML is escaped.
- **Recipients:**
  - Customer events go to `order.customer.email`, and are skipped when it is empty.
  - `admin_new_order` goes to store-settings `business.email`, and is skipped when that is empty.
  - `siteUrl` is `process.env.NEXT_PUBLIC_SERVER_URL`.
- **Live adapter:** `POST https://api.resend.com/emails`, `Authorization: Bearer ${RESEND_API_KEY}`, JSON `{ from: EMAIL_FROM, to: [to], subject, html }`, with a 10s timeout. A non-2xx response throws an error that includes the status.
- **Env:** `EMAIL_MODE=mock`, `RESEND_API_KEY=` and `EMAIL_FROM=Reyan Collections <orders@reyancollection.in>` in `.env.example`, each with a comment.

- [ ] **Step 1: Write the failing tests.**
  - **Unit:**
    - Every event's subject matches the table for an order `RC1001`.
    - The `order_received` body contains `We'll WhatsApp you shortly`.
    - A customer name `<b>x</b>` is escaped (`&lt;b&gt;`).
    - The live adapter (fetch stubbed) posts to the Resend URL with the Bearer header, and throws on 422.
    - `integrationMode('EMAIL')` behaves like the others.
  - **Int:**
    - `notify(payload, 'order_received', order)` with an email creates one `dev-emails` doc with the right `to`, subject and `orderNumber`.
    - Without an email it creates none.
    - `admin_new_order` goes to the settings email when set, and to nobody when unset.
    - When `getEmail(...).send` is spied to reject, `notify` resolves and calls `payload.logger.error`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** Register `DevEmails` after `Counters`, run `pnpm generate:types`, and update `wipe`.
- [ ] **Step 4: Run `pnpm test:unit`, `pnpm test:int`, `pnpm typecheck` and `pnpm lint`.** Expected: all pass.

### Task 2: Shiprocket adapter (booking, cancel, tracking) and status mapping

**Files:**
- Modify: `src/lib/integrations/shiprocket/{types,mock,index}.ts`
- Create: `src/lib/integrations/shiprocket/live.ts`, `src/lib/integrations/shiprocket/status.ts`
- Modify: `src/globals/StoreSettings.ts`: `business.shiprocketPickupName` (text, default `Primary`, admin-read-only like `pickupAddress`); `.env.example`
- Test: `tests/unit/shiprocket.spec.ts`, `tests/unit/shiprocketStatus.spec.ts`

**Interfaces:**
```ts
export type ShipmentInput = { orderNumber: string; orderDate: string; pickupLocation: string; customer: { name: string; phone: string; email: string | null }; address: Order['address']; items: { name: string; sku: string; units: number; sellingPrice: number; hsn: string }[]; paymentMethod: 'Prepaid' | 'COD'; subTotal: number; weightKg: number; lengthCm: number; breadthCm: number; heightCm: number }
export type Booking = { shiprocketOrderId: string; shipmentId: string; awb: string; courierName: string; labelUrl: string | null; trackingUrl: string }
export type TrackResult = { status: string; at: string } | null
export interface ShiprocketClient {
  checkServiceability(input: ServiceabilityInput): Promise<ServiceabilityResult>   // existing
  bookShipment(input: ShipmentInput): Promise<Booking>     // create adhoc order → assign AWB (recommended courier) → generate pickup → generate label
  cancelShipment(shiprocketOrderId: string): Promise<void>
  trackAwb(awb: string): Promise<TrackResult>
}
export function mapCourierStatus(raw: string): 'shipped' | 'out_for_delivery' | 'delivered' | 'rto' | null
export const MOCK_SHIPROCKET_WEBHOOK_TOKEN = 'mock_shiprocket_token'
```

**Rules:**
- **Mock:**
  - `bookShipment` returns `shiprocketOrderId: 'MOCKSO' + 8 digits`, `shipmentId: 'MOCKSH' + 8 digits`, `awb: 'MOCKAWB' + 10 digits`, `courierName: 'Mock Express'`, `labelUrl: '/dev/mock-label?awb={awb}'` and `trackingUrl: 'https://shiprocket.co/tracking/{awb}'`.
  - `cancelShipment` resolves.
  - `trackAwb` returns null.
  - The existing serviceability behaviour is unchanged.
- **Live** (`https://apiv2.shiprocket.in/v1/external`):
  - **Auth:** `POST /auth/login {email, password}` returns a token. Cache it in module memory for 9 days. On a 401, refresh once and retry.
  - **Serviceability:** `GET /courier/serviceability/?pickup_postcode&delivery_postcode&weight (kg)&cod (0|1)`. Map it to the existing result: the best courier by `estimated_delivery_days`, using its `city` and `state`. The live serviceability mode now works (remove the "not implemented" throw).
  - **Booking:** `POST /orders/create/adhoc`, then `POST /courier/assign/awb {shipment_id}`, then `POST /courier/generate/pickup {shipment_id: [id]}`, then `POST /courier/generate/label {shipment_id: [id]}`.
  - **Cancel:** `POST /orders/cancel {ids: [id]}`.
  - **Tracking:** `GET /courier/track/awb/{awb}`.
  - **Env:** `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD` and `SHIPROCKET_WEBHOOK_TOKEN`. Missing env in live mode throws. Every request has a 15s timeout, and a non-2xx response throws with the status.
- **`mapCourierStatus`** uppercases the input and checks, in this order:
  1. Contains `RTO` → `rto`.
  2. Contains `OUT FOR DELIVERY` → `out_for_delivery`.
  3. Contains `DELIVERED` → `delivered`.
  4. Matches one of `PICKED UP|IN TRANSIT|SHIPPED|REACHED|DISPATCHED` → `shipped`.
  5. Anything else → null.

- [ ] **Step 1: Write the failing unit tests.**
  - **Mock:** booking id formats match their patterns.
  - **`mapCourierStatus`:**

    | Input | Result |
    |---|---|
    | `'Picked Up'` | `shipped` |
    | `'IN TRANSIT'` | `shipped` |
    | `'Out For Delivery'` | `out_for_delivery` |
    | `'DELIVERED'` | `delivered` |
    | `'RTO DELIVERED'` | `rto` |
    | `'RTO Initiated'` | `rto` |
    | `'Pickup Scheduled'` | null |

  - **Live** (fetch stubbed, env stubbed):
    - Login happens once across two calls (token cached).
    - A 401 triggers one re-login and a retry.
    - `bookShipment` calls the four endpoints in order and returns the AWB from the assign response.
    - Serviceability maps the best courier's days and city.
    - Missing env throws.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** Run `pnpm generate:types` for the settings field.
- [ ] **Step 4: Run `pnpm test:unit`, `pnpm test:int` (serviceability int tests must still pass), `pnpm typecheck` and `pnpm lint`.** Expected: all pass.

### Task 3: Order actions (confirm, cancel with refund, deliver, return, restock, alerts) and notification wiring

**Files:**
- Create: `src/lib/commerce/orderActions.ts`, `src/lib/commerce/messages.ts`
- Modify:
  - `src/collections/Orders.ts` (new fields)
  - `src/lib/commerce/orderOps.ts`: `cancelPendingOrder` becomes a thin call to `cancelOrder` restricted to `pending_payment` and `awaiting_confirmation`
  - `src/lib/commerce/checkout.ts`: `notify` `order_received` and `admin_new_order` after a COD order commits
  - `src/lib/commerce/payments.ts`: `notify` `order_paid` and `admin_new_order` after `confirmed` or `late_confirmed`; `notify` `refunded` after `late_refunded`
  - `src/collections/Users.ts`: optional `name` text field
  - `src/seed/index.ts`: the seeded admin gets `name: 'Shoaib'`
- Test: `tests/unit/messages.spec.ts`, `tests/int/order-actions.int.spec.ts`

**Interfaces:**
- Consumes: `withTransaction`, `lockOrder`, `withTimelineEntry`, `reserveStock`/`releaseStock`, `assertTransition`, `canTransition`, `getRazorpay`, `notify`, `revalidate`, `productTags` (orderOps).
- Produces:
```ts
// messages.ts (pure)
export function itemSummary(items: Order['items']): string
export function codConfirmMessage(order: Order, storeName: string): string
export function shortName(fullName: string): string            // 'Priya Sharma' → 'Priya S.'; single word unchanged
// orderActions.ts
export type ActionResult = { ok: true; order: Order; changed: boolean } | { ok: false; status: 400 | 404 | 409 | 502; error: string }
export async function confirmOrder(payload: Payload, orderId: number): Promise<ActionResult>
export async function cancelOrder(payload: Payload, orderId: number, opts: { by: 'system' | 'admin'; note: string; allowFrom?: OrderStatus[] }): Promise<ActionResult>
export async function markDelivered(payload: Payload, orderId: number, opts: { by: 'system' | 'admin'; note?: string }): Promise<ActionResult>
export async function markReturned(payload: Payload, orderId: number, opts: { restock: boolean; refundNote?: string }): Promise<ActionResult>
export async function restockOrder(payload: Payload, orderId: number): Promise<ActionResult>   // rto or returned, once
export async function handleAlert(payload: Payload, orderId: number, kind: 'alert' | 'creditNote'): Promise<ActionResult>
```
- **New `orders` fields** (all `admin.readOnly`):
  - `restocked` (checkbox)
  - `creditNote { needed (checkbox), handled (checkbox) }`
  - `refundNote` (text: the COD manual refund note)
  - `codBlocklisted` (checkbox: the phone was auto-added on RTO)

**Rules:**
- **The common pattern:** every action runs `withTransaction` → `lockOrder` → re-read with `req: tx.req` → if the requested transition was already applied, return `{ ok: true, changed: false }` (idempotent) → `assertTransition` (an invalid transition gives `409` `This order can't be {verb} from {status label}.`) → mutate, appending a timeline entry with `by` and a note → commit → `revalidate` product tags if stock changed → `notify`.
- **`confirmOrder`:** `awaiting_confirmation` → `confirmed`, with note `Confirmed on WhatsApp`. Then notify `cod_confirmed`.
- **`cancelOrder`:**
  - **Default `allowFrom`:** `pending_payment`, `awaiting_confirmation`, `confirmed`, `ready_to_ship`.
  - **Steps, in order:**
    1. If there is a `shipment.shiprocketOrderId`, call `getShiprocket().cancelShipment(id)` under the lock (from Task 2). On failure, return 502 `We couldn't cancel the courier booking. Please try again.`
    2. Release stock (the item snapshot).
    3. For prepaid `paid`, refund `total * 100` under the lock, then set `paymentStatus: refunded` and `razorpay.refundId`.
    4. Set status `cancelled`.
  - **Notify** `cancelled`, with `refundAmount` when refunded.
  - Unpaid orders get no refund call.
- **`markDelivered`:** `shipped` | `out_for_delivery` → `delivered`. A COD order also gets `paymentStatus: cod_collected`.
- **`markReturned`:**
  - `delivered` → `returned`.
  - `restock` releases stock and sets `restocked`.
  - Prepaid `paid` is refunded under the lock (`paymentStatus: refunded`, notify `refunded`).
  - COD stores `refundNote` (required for COD: 400 `Add a note about the cash refund`).
  - If `invoice.number` is set, it sets `creditNote.needed`.
- **`restockOrder`:** allowed for `rto` or `returned` when `restocked` is false. It releases stock and sets `restocked: true`. A second call gives `changed: false`.
- **`handleAlert`:** sets `alert.handled` or `creditNote.handled` to true.
- **`itemSummary`:**
  - Each item renders as `{title}`, plus ` ({variantName})` unless the variant is `Default`, plus ` ×{qty}` when qty > 1. Items are joined with `, `.
  - With more than 2 items, it shows the first 2 then ` and {n} more`.
- **`codConfirmMessage`:** exactly `Hi {firstName}! This is {storeName}. You ordered {itemSummary} ({formatINR(total)}, cash on delivery) to {city} {pincode}. Reply YES to confirm and we'll ship it soon. Order {orderNumber}.`

- [ ] **Step 1: Write the failing tests.**
  - **Unit:**
    - `itemSummary` for one item, a variant with ×2, and 4 items (`… and 2 more`).
    - `codConfirmMessage` for `Priya Sharma`, the duck ×1, total 549, Lucknow 226010, RC1042 equals `Hi Priya! This is Reyan Collections. You ordered Duck climbing track toy (₹549, cash on delivery) to Lucknow 226010. Reply YES to confirm and we'll ship it soon. Order RC1042.`
    - `shortName('Priya Sharma')` is `'Priya S.'`.
  - **Int** (orders created through `placeOrder`, unique phones):
    - `confirmOrder` on COD gives `confirmed`. A second call gives `changed: false`. A `cod_confirmed` dev email exists when an email was given.
    - `cancelOrder` on a paid prepaid order (paid via `markPaid`) refunds once (`refundId` matches `/^rfnd_mock_/`), restores stock and sets `cancelled`. Two concurrent calls (`Promise.all`) give exactly one refund (spy count 1).
    - `cancelOrder` on `delivered` gives 409.
    - `markDelivered` on COD gives `cod_collected`. Get the order to `shipped` by setting the status directly through the local API.
    - `markReturned` on COD without a note gives 400; with a note and `restock: true`, stock is restored and `returned` is set.
    - `restockOrder` twice gives a single release.
    - The checkout COD path creates `order_received` and `admin_new_order` dev emails (set a settings email for the test).
    - `markPaid` creates `order_paid`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** Run `pnpm generate:types`. Keep `cancelPendingOrder`'s exported signature so Plan 3 callers and tests still pass.
- [ ] **Step 4: Run `pnpm test:unit`, `pnpm test:int`, `pnpm typecheck` and `pnpm lint`.** Expected: all pass, including the Plan 3 suites.

### Task 4: GST invoice maths and numbering (pure)

**Files:**
- Create: `src/lib/commerce/invoice.ts`, `src/lib/commerce/amountInWords.ts`
- Modify: `src/globals/StoreSettings.ts`: `invoicing.invoicePrefix` validation `/^[A-Z0-9]{1,5}$/` with message `Use 1–5 capital letters or digits`
- Test: `tests/unit/invoice.spec.ts`, `tests/unit/amountInWords.spec.ts`

**Interfaces:**
```ts
export type InvoiceParty = { name: string; gstin?: string | null; lines: string[]; state: string; stateCode: string | null }
export type InvoiceLine = { description: string; hsn: string; qty: number; unitPrice: number; grossPaise: number; discountPaise: number; taxablePaise: number; rate: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number }
export type Invoice = { number: string; date: string; seller: InvoiceParty; buyer: InvoiceParty; placeOfSupply: string; intraState: boolean; lines: InvoiceLine[]; shipping: InvoiceLine | null; codeDiscount: number; prepaidDiscount: number; totals: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; grandTotal: number }; amountInWords: string; warnings: string[] }
export function financialYear(at: Date): string                       // IST: '2026-27'
export function formatInvoiceNumber(prefix: string, fy: string, seq: number): string   // 'RC/2026-27/0001'
export function buildInvoice(order: Order, seller: InvoiceParty, meta: { number: string; issuedAt: string }): Invoice
export function amountInWords(rupees: number): string                 // Indian system
```

**Rules (spec §9; all maths in paise integers):**
- **Item lines:**
  - `grossPaise = unitPrice × qty × 100`.
  - The total discount `(codeDiscount + prepaidDiscount) × 100` is spread across **item lines only**, in proportion to `grossPaise`, using the largest-remainder method so the shares sum exactly.
  - `net = gross − discount`, `taxablePaise = round(net × 100 / (100 + rate))`, `tax = net − taxable`.
  - Intra-state: `cgst = floor(tax / 2)` and `sgst = tax − cgst`. Inter-state: `igst = tax`.
  - `totalPaise = net`.
- **Shipping:** its own line when `shippingFee > 0`. Description `Shipping`, HSN `996812`, rate = the highest item rate, no discount, same split.
- **Intra-state test:** `seller.stateCode === buyer.stateCode`, with both non-null. If the seller `stateCode` is missing, treat the invoice as inter-state and add the warning `Seller state is not set in Store Settings`. If the seller GSTIN is missing, add the warning `GSTIN is not set in Store Settings`.
- **Item description:** `{title}`, plus ` ({variantName})` unless the variant is `Default`.
- **Totals:** `grandTotal = (Σ line totals + shipping total) / 100`. This must equal `order.total` exactly; throw if it doesn't.
- **Financial year:** take the IST date. A month of April or later gives `{y}-{(y+1) % 100, 2 digits}`; otherwise `{y-1}-{y % 100, 2 digits}`.
- **Number:** `{prefix}/{fy}/{seq zero-padded to 4}`, at most 16 chars.
- **`amountInWords`:** Indian grouping (crore, lakh, thousand, hundred), title case, prefixed `Rupees` and suffixed `Only`. For example, `808` gives `Rupees Eight Hundred Eight Only` and `125000` gives `Rupees One Lakh Twenty Five Thousand Only`.

- [ ] **Step 1: Write the failing unit tests.**
  - **Number format:** `formatInvoiceNumber('RC', '2026-27', 1)` is `'RC/2026-27/0001'`.
  - **Financial year:**
    - `'2027-03-31T18:29:00Z'` (IST 31 Mar 23:59) gives `'2026-27'`.
    - `'2027-03-31T18:30:00Z'` (IST 1 Apr 00:00) gives `'2027-28'`.
  - **Intra-state,** with seller and buyer both `09`:
    - The order is 2 × 449 at 18%, with code discount 90, prepaid 0 and shipping 0, total 808.
    - It has one line: taxable `68475` paise, tax `12325`, cgst `6162`, sgst `6163`.
    - The grand total is 808, and the amount in words is `Rupees Eight Hundred Eight Only`.
  - **Inter-state:** the same order with the buyer in `27` gives `igst 12325` and `cgst 0`.
  - **Mixed rates:** a karaoke (18%) plus a duck (12%) with a discount gives discount shares that sum exactly. Shipping 49 at 18% gives its own line, and the grand total equals `order.total`.
  - **Warnings:** a missing seller state gives inter-state plus the warning.
  - **`amountInWords`:** `0` gives `Rupees Zero Only`, `1` gives `Rupees One Only`, and `10000000` gives `Rupees One Crore Only`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement** the pure modules.
- [ ] **Step 4: Run `pnpm test:unit`, `pnpm typecheck` and `pnpm lint`.** Expected: all pass.

### Task 5: Ship action, courier events, webhook and RTO handling

**Files:**
- Modify: `src/lib/commerce/orderActions.ts` (`shipOrder`, `applyCourierEvent`)
- Create: `src/app/(frontend)/api/webhooks/shiprocket/route.ts`, `src/app/(frontend)/(bare)/dev/mock-label/page.tsx`
- Test: `tests/int/shipping.int.spec.ts`

**Interfaces:**
```ts
export async function shipOrder(payload: Payload, orderId: number): Promise<ActionResult>
export async function applyCourierEvent(payload: Payload, input: { awb: string; rawStatus: string; at: string; raw: unknown; source: 'webhook' | 'poll' | 'simulate' }): Promise<{ applied: OrderStatus[]; order: Order | null }>
export async function handleShiprocketWebhook(payload: Payload, body: string, token: string | null): Promise<{ status: 200 | 401 | 400 }>
```

**Rules:**
- **`shipOrder`:** everything happens inside one `withTransaction` holding the lock.
  1. Re-read the order. If it is already `ready_to_ship` or later, return `changed: false`. Otherwise assert `confirmed → ready_to_ship`.
  2. Build `ShipmentInput` from the snapshot:
     - weight = Σ grams × qty / 1000, as kg with 3 decimals
     - dimensions = the largest single item by volume
     - `paymentMethod` is `COD` for COD orders, else `Prepaid`
     - `pickupLocation` = settings `shiprocketPickupName` (default `Primary`)
  3. Call `bookShipment`.
  4. Allocate the invoice number: `formatInvoiceNumber(prefix, financialYear(now), await nextNumber(tx.db, 'invoice:' + fy, 0))`.
  5. Set `shipment` (ids, awb, courier, labelUrl, trackingUrl) and `invoice { number, issuedAt: now }`, set status `ready_to_ship`, and add the timeline note `Booked with {courierName} · AWB {awb}`.
  6. A booking failure gives 502 `Shiprocket couldn't book this order. Please try again.` and no invoice number is consumed.
  7. After commit, notify `shipped`.
- **`applyCourierEvent`:**
  1. Find the order by `shipment.awb`.
  2. Under the lock, append `shipment.events {status: rawStatus, at, raw}` unless an identical `(status, at)` already exists.
  3. Run `mapCourierStatus` to get a target. If the target exists and differs from the current status, walk the shortest allowed path through the state machine using only courier states (`shipped`, `out_for_delivery`, `delivered`, `rto`), applying each step with a timeline entry (`by: 'system'`, note `Courier: {rawStatus}`). If there's no path (for example backwards), record the event only.
  4. **On reaching `delivered`:** a COD order gets `paymentStatus: cod_collected`.
  5. **On reaching `rto`:**
     - A COD order upserts a `cod-blocklist` entry for the phone, with reason `Refused at the door ({orderNumber})`. If the phone is already listed, skip it with no error. Set `codBlocklisted: true`.
     - If invoiced, set `creditNote.needed`.
     - Stock is NOT released (the admin restocks).
- **`handleShiprocketWebhook`:**
  - A token that doesn't match `SHIPROCKET_WEBHOOK_TOKEN` gives 401. In mock mode the expected token is `MOCK_SHIPROCKET_WEBHOOK_TOKEN`. Compare in constant time.
  - Bad JSON or a missing `awb` or `current_status` gives 400.
  - Otherwise call `applyCourierEvent` with `at = current_timestamp ?? now`, and return 200 (also for an unknown awb).
- **Route:** `POST /api/webhooks/shiprocket` reads the raw body and the `x-api-key` header.
- **`/dev/mock-label`:** a bare dev page (404 unless dev and mock). It shows `Shipping label`, the AWB and `Mock Express`.

- [ ] **Step 1: Write the failing int tests.** Create COD and prepaid orders and confirm them (`confirmOrder` / `markPaid`).
  - **Ship:**
    - Ship gives `ready_to_ship`, an awb matching `/^MOCKAWB\d{10}$/`, and invoice number `RC/{fy}/0001`.
    - A second ship gives `changed: false`, and the same awb.
    - Two concurrent ships give one `bookShipment` call (spy) and invoice 0001 only. The next order gets 0002.
    - With `bookShipment` spied to reject: 502, the status stays `confirmed`, and the next successful ship still gets the next number with no gap.
  - **Webhook:**
    - A webhook with a bad token gives 401.
    - `PICKED UP` gives `shipped`, then `DELIVERED` gives `delivered`, and a COD order becomes `cod_collected`.
    - A duplicate `DELIVERED` at the same time records the event once.
    - A late `IN TRANSIT` after delivered keeps the order `delivered`, with the event recorded.
    - A `DELIVERED` while still `ready_to_ship` walks `shipped → delivered`.
  - **RTO:**
    - COD `RTO INITIATED` gives `rto`, a blocklist entry for the phone, `codBlocklisted`, `creditNote.needed`, and stock unchanged.
    - A second COD order for the same phone reaching RTO gives no error and still one entry.
    - A prepaid RTO creates no blocklist entry.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `pnpm test:int`, `pnpm typecheck`, `pnpm lint` and `pnpm build`.** Expected: all pass.

### Task 6: Scheduled jobs and the dev "run now" tool

**Files:**
- Create: `src/jobs/expire.ts`, `src/jobs/pollShipments.ts`, `src/jobs/index.ts`
- Modify: `src/payload.config.ts` (`jobs`), `vitest.setup.ts` (`JOBS_AUTORUN=false`), `.env.example`
- Test: `tests/int/jobs.int.spec.ts`

**Interfaces:**
```ts
export async function expirePendingPayments(payload: Payload, now: Date): Promise<string[]>  // returns cancelled order numbers
export async function expireUnconfirmedCod(payload: Payload, now: Date): Promise<string[]>
export async function pollShipmentStatus(payload: Payload): Promise<number>                  // events applied
```

**Rules:**
- **`expirePendingPayments`:** for `pending_payment` orders with `createdAt < now − pendingPaymentMinutes`, call `cancelOrder(..., { by: 'system', note: 'Payment not received in time', allowFrom: ['pending_payment'] })`.
- **`expireUnconfirmedCod`:** for `awaiting_confirmation` orders older than `codConfirmHours`, use the note `Not confirmed in time`.
- **Race safety:** each cancel is separate. An order whose status changed under the lock (paid or confirmed meanwhile) is skipped (409 → ignored). Errors are logged, and the rest continue.
- **`pollShipmentStatus`:** for orders in `ready_to_ship`, `shipped` or `out_for_delivery` with an awb, call `trackAwb`. A non-null result is passed to `applyCourierEvent` with source `poll`.
- **Payload jobs:**
  - Tasks `expirePendingPayments` and `expireUnconfirmedCod` have `schedule: [{ cron: '*/15 * * * *', queue: 'default' }]`. Task `pollShipmentStatus` runs hourly (`0 * * * *`).
  - `jobs.autoRun: [{ cron: '* * * * *', queue: 'default' }]` is enabled unless `process.env.JOBS_AUTORUN === 'false'`. Vitest sets it to false, and `.env.example` documents it.
  - Read the Payload jobs types in `node_modules/payload/dist/queues/config/types/` for the exact `schedule` and `autoRun` shape.
- **Dev tool:** a Payload **root endpoint** `POST /api/dev/run-jobs`.
  - Access: admin only, and 404 when `NODE_ENV === 'production'`.
  - Body `{ aheadMinutes?: number }`, default `0`.
  - It runs both expiry functions with `now = Date.now() + aheadMinutes × 60_000`, then runs `pollShipmentStatus`.
  - It returns `{ cancelled: string[], polled: number }`.

- [ ] **Step 1: Write the failing int tests.**
  - A pending prepaid order 31 min old (backdate `created_at` by SQL) is cancelled, its stock is restored and the timeline note is set. A 29-min-old order is untouched.
  - A COD order 25h old is cancelled. One 23h old is untouched.
  - **The race:** mark an order paid while it is past its deadline, then run expire, and it stays `confirmed`.
  - `pollShipmentStatus`, with `trackAwb` spied to return `{ status: 'DELIVERED', at }`, delivers a shipped order.
  - The run-jobs endpoint without a user gives 401. As admin with `aheadMinutes: 60`, it cancels a fresh pending order.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `pnpm test:int`, `pnpm typecheck`, `pnpm lint` and `pnpm build`.** Expected: all pass. The dev server must still start: run `pnpm dev` briefly and confirm no crash at startup.

### Task 7: Admin order endpoints, packing slips, invoice PDF and customer invoice link

**Files:**
- Create:
  - `src/collections/orders/endpoints.ts`
  - `src/lib/commerce/orderPanel.ts`
  - `src/lib/documents/{InvoicePdf.tsx,renderInvoice.ts,packingSlips.ts}`
  - `src/app/(frontend)/(site)/order/[orderNumber]/invoice/route.ts`
- Modify:
  - `src/collections/Orders.ts` (`endpoints`, `admin.listSearchableFields: ['orderNumber', 'customer.phone']`)
  - `package.json` (`@react-pdf/renderer`, pinned exact)
  - `next.config.ts` (`serverExternalPackages` if needed)
  - `src/lib/commerce/customerOrder.ts` (`invoiceUrl`)
  - `src/app/(frontend)/(site)/order/[orderNumber]/page.tsx` (link)
- Test: `tests/int/order-endpoints.int.spec.ts`

**Interfaces:**
```ts
// orderPanel.ts
export type PanelAction = 'confirm' | 'ship' | 'cancel' | 'mark-delivered' | 'mark-returned' | 'restock'
export type OrderPanel = { id: number; orderNumber: string; status: OrderStatus; statusLabel: string; paymentMethod: PaymentMethod; paymentLabel: string; steps: { label: 'Placed' | 'Confirm' | 'Ship' | 'Delivered'; state: 'done' | 'now' | 'todo' }[]; customer: { name: string; phone: string; email: string | null; address: string }; eligibility: { ok: boolean; note: string }; items: { label: string; qty: number; lineTotal: number }[]; totals: { shippingFee: number; codeDiscount: number; prepaidDiscount: number; total: number; discountCode: string | null }; whatsapp: { url: string; message: string } | null; actions: PanelAction[]; shipment: { awb: string; courierName: string; trackingUrl: string; labelUrl: string | null } | null; invoice: { number: string; url: string } | null; packingSlipUrl: string; customerUrl: string; alerts: { kind: 'alert' | 'creditNote'; message: string }[]; codBlocklisted: boolean; restocked: boolean; autoCancelLabel: string | null; dev: { simulate: boolean } }
export async function buildOrderPanel(payload: Payload, orderId: number, now: Date): Promise<OrderPanel | null>
```

**Endpoints** (on the `orders` collection, admin only, `no-store`):

| Method + path | Behaviour |
|---|---|
| `GET /:id/panel` | → `OrderPanel` |
| `POST /:id/confirm` · `/ship` · `/cancel {note?}` · `/mark-delivered` · `/mark-returned {restock, refundNote?}` · `/restock` · `/handle-alert {kind}` | Calls the action, then returns `{ panel }`, or `{ error }` with the action's status |
| `POST /:id/simulate {status: 'PICKED UP' \| 'OUT FOR DELIVERY' \| 'DELIVERED' \| 'RTO INITIATED'}` | Dev and mock only (else 404). Calls `handleShiprocketWebhook` with the mock token and a body for the order's awb |
| `GET /:id/invoice.pdf` | The PDF (`application/pdf`, `inline; filename="{number with / replaced by -}.pdf"`). 409 `Invoice is issued when the order ships` before Ship |
| `GET /packing-slips?ids=1,2` or `?status=ready_to_ship` | Printable HTML (`text/html`) |

- Confirm in the Payload endpoint docs that `/packing-slips` is matched before `/:id`; reorder if needed.

**Panel rules:**
- **`steps`:**

  | Status | Placed | Confirm | Ship | Delivered |
  |---|---|---|---|---|
  | `pending_payment`, `awaiting_confirmation` | done | now | todo | todo |
  | `confirmed` | done | done | now | todo |
  | `ready_to_ship`, `shipped`, `out_for_delivery` | done | done | done | now |
  | `delivered`, `returned` | done | done | done | done |

  `cancelled` and `rto` keep the last step reached, based on the timeline.
- **`eligibility`** comes from a live serviceability check for the pincode, `codAllowed` on all items, and the blocklist.
  - **COD:** `✓ Couriers deliver here · COD allowed · not on blocklist` when all hold. Otherwise list the failing parts, for example `⚠ COD not available for this pincode · on COD blocklist`.
  - **Prepaid:** `✓ Couriers deliver here`. When not serviceable, `⚠ Couriers don't deliver to {pincode}`. When the check fails, `⚠ Couldn't check delivery right now`.
- **`whatsapp`:** only for `awaiting_confirmation`. The url is `buildWhatsAppLink(customer.phone, codConfirmMessage(order, storeName))`.
- **`actions`:** `confirm` in awaiting_confirmation; `ship` in confirmed; `cancel` when `canTransition(status, 'cancelled')`; `mark-delivered` in shipped or out_for_delivery; `mark-returned` in delivered; `restock` in rto or returned while not restocked.
- **`autoCancelLabel`:**
  - pending_payment: `Auto-cancels in {m} min`.
  - awaiting_confirmation: `Auto-cancels in {h}h` when ≤ 6h are left, else null.
- **`customerUrl`:** absolute `{NEXT_PUBLIC_SERVER_URL}{orderUrl}`.
- The admin panel shows the **full** phone (the owner needs it). Masking is for public pages only.

**Documents:**
- **The invoice PDF** (`@react-pdf/renderer`, A4) shows:
  - the title `Tax Invoice`
  - the seller block (legal name or name, GSTIN, address, `State: {state} ({code})`)
  - the buyer block
  - the invoice no. and date (DD-MM-YYYY, IST)
  - `Place of supply: {state} ({code})`
  - a table with the columns `#`, `Description`, `HSN`, `Qty`, `Rate (incl. GST)`, `Discount`, `Taxable value`, `GST %`, `CGST`, `SGST`, `IGST` and `Total`
  - a shipping row
  - totals
  - the amount in words
  - any warnings in a red box at the top
  - the footer `This is a computer-generated invoice.`

  Amounts use 2 decimals with the ₹ sign. Use a built-in PDF font (Helvetica) and write `Rs.` instead of `₹`, because Helvetica has no ₹ glyph.
- **The customer invoice route** `GET /order/{orderNumber}/invoice?t={token}` reuses the token check from `getOrderForCustomer`, returns the same PDF when issued, and 404 otherwise. The order page shows a **Download GST invoice** link when there is an invoice (add `invoiceUrl: string | null` to `CustomerOrderView`).
- **Packing slips** are one A6 page per order (`@page { size: A6; margin: 8mm }`, with `page-break-after`). Each shows:
  - the store name
  - `Order {orderNumber}` (large)
  - `Ship to:` name, full address and phone
  - the AWB and courier when booked
  - the items as a checklist (`☐ {label} × {qty}`)
  - `COD: collect {formatINR(total)}` for COD orders
  - a print button hidden in print

  The page title is `Packing slips`. The response is HTML with escaped values.

- [ ] **Step 1: Write the failing int tests,** calling the endpoint handlers through `payload` REST with an admin session, or invoking the handler with a `req` that has a user.
  - **Panel:**
    - Without a user: 401.
    - For a COD awaiting order: steps `[done, now, todo, todo]`, `whatsapp.message` equal to `codConfirmMessage`, `whatsapp.url` starting `https://wa.me/91`, and actions `['confirm', 'cancel']`.
  - **Actions:** confirm, then panel actions `['ship', 'cancel']`. Ship gives a panel with a shipment and an invoice.
  - **Invoice:**
    - `invoice.pdf` returns `content-type: application/pdf`, with the body starting `%PDF`.
    - Before Ship it gives 409.
    - The customer route with the wrong token gives 404; with the right token it gives a PDF.
  - **Packing slips:** `?status=ready_to_ship` returns HTML containing the order number and `☐`.
  - **Simulate:** `DELIVERED` delivers the order.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** Add the dependency with `pnpm add -E @react-pdf/renderer@<current stable>`.
- [ ] **Step 4: Run `pnpm test:int`, `pnpm typecheck`, `pnpm lint` and `pnpm build`.** Expected: all pass.

### Task 8: Order actions panel (admin UI)

**Files:**
- Create: `src/admin/orders/OrderActionsPanel.tsx` (client) and `src/admin/orders/panel.module.css`, plus `src/admin/orders/OrderStatusTabs.tsx` (list view)
- Modify:
  - `src/collections/Orders.ts`: add a first field `{ name: 'actionsPanel', type: 'ui', admin: { components: { Field: '/admin/orders/OrderActionsPanel' } } }` and `admin.components.beforeListTable: ['/admin/orders/OrderStatusTabs']`
  - `src/app/(payload)/admin/importMap.js` (generated)
- Modify: `src/collections/Products.ts` (list columns and the `totalStock` virtual field)
- Test: an e2e smoke is in Task 10. Here, a component-level check is enough via `pnpm build`, plus a manual 390px screenshot (Step 3), plus the `totalStock` int assertion.

**Behaviour** (the mockup's right-hand phone):
- **Data:** the panel gets the id via `useDocumentInfo()` and fetches `GET /api/orders/{id}/panel` (credentials included). It renders:
  - a status pill (amber for awaiting or pending, blue for confirmed or ready, green for shipped or delivered, red for cancelled or rto)
  - the **progress line** (`steps`)
- **Customer card:** name, a phone `tel:` link, the address, and the eligibility note (a green box when ok, amber otherwise).
- **Items card:** label × qty with amounts, a Shipping row, discounts when > 0, and a total row labelled with `paymentLabel`.
- **Next step card,** by status:
  - **awaiting_confirmation:**
    - a full-width green **Confirm on WhatsApp** link (`target=_blank`)
    - the message preview bubble, captioned `Message that opens, ready to send`
    - a dark **Customer replied YES · Mark confirmed** button
    - `autoCancelLabel` when present
  - **confirmed:** a dark **Ship with Shiprocket** button.
  - **ready_to_ship and later:** AWB, courier, a **Track parcel** link and a **Shipping label** link.
  - **shipped / out_for_delivery:** a **Mark delivered** button.
  - **delivered:** a **Mark returned** form (a `Restock items` checkbox, plus a required `Cash refund note` text input for COD) and a submit.
  - **rto / returned while not restocked:** a **Restock items** button. On rto with `codBlocklisted`, the note `Phone added to COD blocklist` links to `/admin/collections/cod-blocklist`.
  - **Always:** a two-up row of **Packing slip** (opens `packingSlipUrl`) and **GST invoice** (enabled only with an invoice), a **Copy customer link** button (clipboard, label changes to `Copied`), and red **Cancel order** text when `cancel` is allowed. Cancel asks `window.confirm('Cancel {orderNumber}?{ prepaid paid ? " The customer will be refunded " + total : ""}')` first.
  - **Alerts:** each alert renders as an amber box with a **Mark handled** button.
  - **Dev tools:** when `dev.simulate`, a small `Simulate courier` row with **Picked up**, **Out for delivery**, **Delivered** and **RTO**.
- **After an action:**
  - The panel re-renders from the returned `panel`, and calls `router.refresh()` so Payload's read-only fields update.
  - Errors show in `role="alert"`.
  - Buttons are disabled while a request is in flight (a ref guard).
- **`OrderStatusTabs`:** links above the orders list: `All`, `To confirm` (awaiting_confirmation), `To ship` (confirmed), `Booked` (ready_to_ship), `On the way` (shipped or out_for_delivery), `Delivered` and `Cancelled`. Each sets `?where[status][in]=…` (read the Payload list query-param format), and the active tab is highlighted.
- **Products list (spec §10.4):**
  - `Products.admin.defaultColumns` is `['images', 'title', 'price', 'totalStock', '_status']`.
  - `totalStock` is a new virtual number field (`virtual: true`, `admin.readOnly`, `admin.position: 'sidebar'`). An `afterRead` hook fills it with the sum of the variant stock.
  - Confirm that Payload's upload cell shows the first image as a thumbnail.
  - Add a unit-free int assertion to `tests/int/products.int.spec.ts`: `totalStock` equals the sum of variant stock.
- **Styling:** the panel uses the CSS module only. Card styles follow the mockup (white cards, 16px radius, 4px left accent, the Inter-like admin font, the specified colours). It stays usable at 390px.

- [ ] **Step 1: Implement** the panel and tabs, and run `pnpm generate:importmap`.
- [ ] **Step 2: Run `pnpm typecheck`, `pnpm lint` and `pnpm build`.** Expected: all pass.
- [ ] **Step 3: Manual visual check.**
  - Start `pnpm dev` on a spare port against `reyan_test`: run `pnpm db:reset:test`, then `DATABASE_URI=<test uri> pnpm seed`, then `DATABASE_URI=<test uri> pnpm dev --port 3200`.
  - Place a COD order through the UI or the API, then log in at `/admin`.
  - Screenshot the order at 390×844 with Playwright to the scratchpad. Compare it against the mockup's right-hand phone and fix any differences.
  - Stop the server.

### Task 9: Today view (admin dashboard)

**Files:**
- Create: `src/lib/commerce/today.ts`, `src/admin/today/TodayView.tsx` (server component), `src/admin/today/TodayActions.tsx` (client: ✓, Ship) and `src/admin/today/today.module.css`
- Modify: `src/payload.config.ts` (`admin.components.views.dashboard: { Component: '/admin/today/TodayView' }`), the import map, and the e2e login assertions (`tests/helpers/login.ts` and every spec that waits for `span[title="Dashboard"]`). These now wait for the Today heading.
- Test: `tests/int/today.int.spec.ts`

**Interfaces:**
```ts
export type TodayData = {
  greeting: string                     // 'Good morning' | 'Good afternoon' | 'Good evening' (+ ', {name}' when the admin has a name), by IST hour <12 / <17 / else
  needsYou: number                     // confirmCod.length + readyToShip.length + alerts.length
  week: { revenue: number; orders: number; prepaid: number; cod: number }   // Monday 00:00 IST → now, status not cancelled
  confirmCod: { id: number; title: string; meta: string; whatsappUrl: string }[]   // oldest first
  readyToShip: { id: number; title: string; meta: string }[]                      // status confirmed, oldest first
  bookedCount: number                  // ready_to_ship
  lowStock: { productId: number; title: string; meta: string }[]                  // variant stock ≤ 3, lowest first
  onTheWay: { inTransit: number; outForDelivery: number }
  alerts: { kind: 'payment' | 'creditNote' | 'staleCompare'; title: string; href: string; orderId?: number }[]
}
export async function getTodayData(payload: Payload, now: Date, adminName: string | null): Promise<TodayData>
```

**Row copy (pinned):**
- **confirmCod:**
  - title `#{orderNumber} · {shortName(name)}`
  - meta `{itemSummary} · {formatINR(total)} · {age} ago`, with ` · auto-cancels in {h}h` appended when ≤ 6h are left
  - `age` is `{m}m` under 1h, `{h}h` under 48h, else `{d}d`
- **readyToShip:**
  - title `#{orderNumber} · {itemSummary}`
  - meta `{Prepaid | COD confirmed} · {city} {pincode}`
- **lowStock:**
  - title `{product title}` plus ` ({variant})` unless the variant is `Default`
  - meta `{stock} left · {sold in last 7 days} sold this week`
  - Only published products count.
- **alerts:**
  - Payment alerts (`alert.message` and not handled): title `#{orderNumber} · {message}`.
  - Credit notes (needed and not handled): `#{orderNumber} · Credit note needed (returned after invoicing)`.
  - Stale comparisons (`compareAt.checkedOn` older than 30 days on published products): `Re-check marketplace price: {title}`.
  - `href` points to the order or product edit page.

**View** (the mockup's left-hand phone, top to bottom):
- **Heading:** the greeting, then the h1 `{needsYou} things need you`, or `All caught up` when 0.
- **The ink "This week" band:** `formatINR(revenue)`, `{orders} orders`, and chips `{prepaid} prepaid` and `{cod} COD`.
- **Cards,** in this order:
  1. **Confirm COD orders** (amber, count): each row has a WhatsApp link button and a **✓** button that calls `POST /api/orders/{id}/confirm`, then `router.refresh()`.
  2. **Ready to ship** (blue, count): each row has a **Ship** button (calls `/ship`, then refresh). Then `Print all packing slips →` (opens `/api/orders/packing-slips?status=ready_to_ship`) when `bookedCount > 0`, followed by `{bookedCount} booked, waiting for pickup`.
  3. **Low stock** (red): an **Update** link to the product edit page.
  4. **On the way** (green): `{inTransit} in transit · {outForDelivery} out for delivery`, a `Tracking updates come from Shiprocket` line, and a **View** link to the orders list filtered by shipped and out_for_delivery.
  5. **Alerts** (red, only when any exist): each row links to its target.
  6. **Quick actions:** `+ Add product` (`/admin/collections/products/create`), `Edit homepage` (`/admin/globals/homepage`), `Edit links page` (`/admin/globals/links-page`), `Store settings` (`/admin/globals/store-settings`).
- **Empty states:** a card with no rows shows a muted line (`Nothing to confirm`, `Nothing to ship`, `All stocked up`, `Nothing on the way`).
- **Layout:** mobile-first. On wide screens the cards sit in a max-width 720px column. Keep Payload's own nav (no custom bottom tab bar).
- **Rendering:** the view renders inside Payload's default admin template. Read the Payload custom-view docs and types for the dashboard view's props and how to get `payload` and the user.

- [ ] **Step 1: Write the failing int test** for `getTodayData`.
  - Seed, then create: a COD awaiting order (23h old, by SQL backdate), which gets `auto-cancels in 1h`; a confirmed prepaid order; a ready_to_ship order; a shipped order; and an order with an alert.
  - Set container Sand stock to 2. Set one product's `compareAt.checkedOn` 40 days ago.
  - Assert every list, its counts, and the pinned row copy, plus `needsYou`, `week` and `greeting` for `now` at 19:00 IST with admin name `Shoaib` (`Good evening, Shoaib`).
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement** the loader, view and actions. Run `pnpm generate:importmap`, then update the e2e login waits.
- [ ] **Step 4: Run `pnpm test:int`, `pnpm typecheck`, `pnpm lint`, `pnpm build` and the full e2e suite** (existing journeys must pass with the new login wait). Then take a 390px screenshot of `/admin` with data and compare it against the mockup's left-hand phone.

### Task 10: Full admin journeys

**Files:**
- Create: `tests/e2e/admin-prepaid-fulfilment.e2e.spec.ts`, `tests/e2e/admin-cod-rto.e2e.spec.ts`, `tests/e2e/checkout-expiry.e2e.spec.ts`, `tests/e2e/helpers/admin.ts` (an admin login helper and an API token helper)
- Modify: `playwright.config.ts`. The `admin-*` specs run in `chromium`, and `checkout-expiry` matches the `mobile` project's `checkout-*` pattern.

**Journeys** (spec §16; each is one `test`, ending on a visible assertion):
1. **`owner ships a prepaid order and the customer sees it delivered`:**
   1. As the shopper (helpers from `tests/e2e/helpers/checkout.ts`), buy 1 duck prepaid with phone `98765 00011` and pincode `226001`, and pay **Succeed**. Capture the order URL and number.
   2. As the admin, log in. Expect Today's **Ready to ship** card to list `#{orderNumber}`, then click its **Ship**.
   3. Expect `1 booked, waiting for pickup`. Open the order from the orders list.
   4. Expect the panel to show an AWB matching `MOCKAWB` and **GST invoice** enabled. A `request` GET of its href returns `application/pdf`.
   5. Click **Picked up**, then **Delivered**.
   6. Visit the customer order URL. Expect the `h1` `Delivered`.
   7. In `finally`, restore the duck's stock to 10.
2. **`owner confirms a COD order on WhatsApp and handles a refused parcel`:**
   1. As the shopper, place a COD order for 1 juicer with name `Priya Sharma`, phone `98765 00012`, pincode `226010`, city `Lucknow` and state `Uttar Pradesh`.
   2. As the admin, expect Today's **Confirm COD orders** card to show `#{n} · Priya S.`.
   3. The WhatsApp link's `href`, decoded, contains `Hi Priya!`, `₹799`, `Lucknow 226010` and `Order {n}`.
   4. Click **✓**. Expect the row to move to **Ready to ship**.
   5. Open the order and click **Ship with Shiprocket**, then **RTO**.
   6. Expect the pill `Returned to us` and the note `Phone added to COD blocklist`. Expect the COD blocklist list page to show `9876500012`.
   7. As the shopper, add a juicer, go to checkout and fill phone `98765 00012` and pincode `226001`. Expect **Cash on delivery** disabled and `Cash on delivery isn't available for this order. Please pay online.`
   8. In `finally`, restore the juicer's stock to 5 and delete the blocklist entry through the REST API.
3. **`an unpaid order expires and its stock comes back`** (mobile):
   1. As the shopper, add 3 Sand containers and check out prepaid with phone `98765 00013`, then click **Fail**. Expect `Payment pending`.
   2. Open the product page and pick Sand. Expect `Out of stock`.
   3. Call `POST /api/dev/run-jobs { aheadMinutes: 60 }` with an admin token from the API login.
   4. Reload the order URL. Expect the `h1` `Cancelled`.
   5. On the product page, pick Sand. Expect `Only 3 left`.

- [ ] **Step 1: Write the three journeys.**
- [ ] **Step 2: Run each alone and fix failures.** Fix product code only for real defects, and list them in the report.
- [ ] **Step 3: Run the full e2e suite twice in a row (one at a time).** Expected: all green both times. Also run `pnpm test:int` once.
