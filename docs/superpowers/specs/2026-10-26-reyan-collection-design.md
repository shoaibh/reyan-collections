# Reyan Collections: Website Design (v1)

Status: **Approved by Shoaib 2026-10-26** · Author: Claude (with Shoaib) · 2026-10-26
Domain: **reyancollection.in** (registered at GoDaddy)

Items marked **[Shoaib]** were decided by Shoaib. Items marked **[call]** are the designer's call and can be changed. Anything not marked follows directly from those decisions.

---

## 1. Intent

**Brand name: "Reyan Collections"** (as on the logo) **[Shoaib]**. Tagline: **"Daily finds • Home • Toys"**. The domain stays reyancollection.in.

Reyan Collections is a family business that sells about 15 toys and kitchen/bathroom products. Today it sells **only on Amazon, Flipkart and Meesho**. The website is a **direct sales channel next to the marketplaces, not a replacement**. It has two jobs **[Shoaib]**:

1. **Margin:** direct orders pay no marketplace commission. Website prices are a little *lower* than marketplace prices, which gives customers a reason to buy direct, and the business still keeps more per order.
2. **Trust:** it shows that a real business stands behind the products: GSTIN, address, clear policies, real photos, and real people on WhatsApp. This helps whether a buyer orders direct or on a marketplace.

Traffic comes mainly from **social media (Instagram)**. The profile link points to a **links page on our own domain** (`/links`) with buttons for the website shop, WhatsApp, Amazon, Flipkart and Meesho **[Shoaib]**. Most visitors are on phones, so the design is mobile-first.

### Goals
- A beautiful, distinctive storefront in the approved **Playful Pop** style (§5).
- Customers can buy with Razorpay (UPI/cards/netbanking) **or cash on delivery** **[Shoaib]**.
- One operator, Shoaib, runs everything from a phone-friendly admin **[Shoaib]**: products, content, orders, shipping.
- Running costs of roughly ₹450–700/month fixed **[Shoaib accepted]**.

### Non-goals (v1)
Customer accounts and login, product reviews, a wishlist, a blog, multiple languages, automated WhatsApp messages (Business API), stock sync with the marketplaces, COD OTP, a page builder, multiple admin roles, and international shipping.

### Anti-goals (failure even if it "works")
- The site looks cheap, template-made, or cluttered.
- **Prices, stock, ratings, or policies on the site disagree with reality or with each other.** Every fact is entered once and shown everywhere from that one source (§7).
- Photos that misrepresent the product. AI may only be used for backgrounds around a real product cutout.
- A checkout that loses orders or takes money without creating an order.

---

## 2. Constraints

- **Volume:** low at first, roughly a few orders a day. The design must not add infrastructure for scale.
- **Inventory:** one physical stock pile, shared with the marketplaces. Stock counts on the website are maintained **by hand** by Shoaib **[call]**. Occasional overselling (a marketplace sale the website didn't know about) is an **accepted risk** at this volume. It is handled with the normal admin cancel flow, plus a full refund for prepaid orders. There is no stock buffer setting in v1.
- **Fulfilment:** the brother-in-law packs the parcels. Today Flipkart and Amazon couriers collect them. Website orders ship through **Shiprocket** **[Shoaib]**, with pickup from the same address.
- **Legal and financial:** the business has a GSTIN and a registered address, but no walk-in shop. A GST tax invoice is required for every shipped order. Razorpay activation requires live policy pages (Contact, Terms, Privacy, Refund, Shipping).
- **Toys:** BIS (ISI) certification is mandatory in India. Product pages show the BIS/ISI licence number when one exists.
- **Accounts not created yet:** Razorpay, Shiprocket, Railway, Cloudflare and Resend are signed up for *later* **[Shoaib]**. **All integrations must have a mock mode**, so the whole site can be built, run and tested end-to-end without any accounts (§11).
- **Cost:** prefer free tiers and avoid paid SaaS beyond Railway.

---

## 3. People and journeys

### Customer: prepaid
Instagram post → `/links` → "Shop on our website" → home or product page → add to cart → checkout (name, phone, address, pincode) → pay with Razorpay → order confirmation page with the order number and a "track" link → tracking updates from Shiprocket by SMS/email → delivered.

### Customer: COD
Same as prepaid up to checkout → choose COD (if eligible) → order placed with status *awaiting confirmation* → Shoaib sends a WhatsApp confirmation by hand → the customer replies YES → order confirmed → shipped → pays the courier on delivery.

### Operator: Shoaib's daily loop
Open `/admin` → **Today** screen → confirm COD orders (WhatsApp button, then ✓) → for each order in "Ready to ship", click **Ship** (books Shiprocket) → print packing slips → the brother-in-law packs → the courier collects → tracking updates the status automatically. Occasionally: update stock, add a product, or change the homepage for a festival.

---

## 4. Site map

| Route | Purpose |
|---|---|
| `/` | Home (§6.1) |
| `/links` | Link-in-bio page: big buttons, editable list (§7.2) |
| `/shop` | All products (grid; filter by category; sort by featured/price) |
| `/c/[category]` | Category listing, e.g. Toys & Games, Kitchen & Home |
| `/collections/[slug]` | Curated collection, e.g. "Gifts under ₹499", "This week's favourites" |
| `/p/[slug]` | Product page |
| `/cart` | Cart (a slide-over drawer on all pages, plus a full page fallback) |
| `/checkout` | Checkout |
| `/order/[orderNumber]?t=[token]` | Order confirmation / status. The token prevents guessing other people's orders. |
| `/track` | Look up an order by order number + phone |
| `/[slug]` | CMS pages: about, contact, shipping-policy, return-policy, privacy-policy, terms |
| `/admin` | Payload admin (+ custom Today view) |
| `/api/...` | Payload REST plus our endpoints (§10.3) |
| `/sitemap.xml`, `/robots.txt` | SEO |

---

## 5. Visual design: "Playful Pop" [Shoaib approved]

The approved reference mockups are in `docs/design/mockups/home-playful.html` (storefront, laptop and phone) and `docs/design/mockups/admin-and-architecture.html` (admin). **Match these closely.** The images in the mockups were served from Shoaib's sample photos (`~/Desktop/insta/`).

**Tokens**

| Token | Value | Use |
|---|---|---|
| butter | `#FFF6DA` | page background |
| ink | `#1E1B4B` | text, outlines, offset shadows, dark bands |
| tomato | `#FF5A36` | brand dot, cart, accents, blobs |
| cobalt | `#2D5BFF` | primary CTA, Toys category |
| mint | `#3CCB9A` | highlight word, Kitchen & Home category |
| pink | `#FF9EC7` | stickers |
| sun | `#FFD23F` | price tag, "Save ₹X" badges |
| soft text | `#3d3a66` / `#5b5885` | body copy / secondary |

**Type:** Bricolage Grotesque (variable; weights 400–800), self-hosted with `next/font`. Headlines are 800 weight with tight letter-spacing (−0.04em).

**Signature elements:**
- Ink-outlined cards (2.5–3px) with a **hard offset shadow** (4–8px, ink, no blur).
- Rounded corners of 14–28px.
- Rotated stickers ("Bestseller!", "Save ₹200").
- A highlighted word in a rotated mint chip.
- An organic tomato blob behind the hero products.
- A **ticket-shaped price tag** comparing our price with the marketplace price.
- A wavy divider into the ink "Why buy direct" band.
- A floating WhatsApp button.

**Logo [Shoaib]:** the existing circular logo is at `docs/design/brand/logo-circle.jpg` (1440², raster, navy/teal/orange line-art house with a tap, dispenser, dino and car; "REYAN COLLECTIONS"; "DAILY FINDS • HOME • TOYS"). How it is used **[call]**:
- **Header lockup:** the **house mark** (cropped from the logo; vectorise to SVG later) followed by **"Reyan Collections"** set in Bricolage 800 in ink. This replaces the mockup's `reyan.collection` text, and the tomato dot is dropped.
- **Full circular logo:** at the top of `/links`, in the footer, on invoices and packing slips, and in the admin login and nav. Generate the favicon, apple-touch icon and default OG image from it.
- The logo's navy, teal and orange already sit close to ink, mint and tomato/sun, so the palette stays as it is. The tagline "Daily finds • Home • Toys" appears on `/links`, in the footer and in the default meta description.

**Accessibility:** WCAG AA contrast for body text. White on tomato fails AA for small text, so use ink text or a darker tomato (e.g. `#E8441F`) wherever text is under 18.66px bold. Never put white text on mint. Every image needs alt text (the media field is required). Focus states must be visible (an ink outline plus offset). Honour `prefers-reduced-motion`.

**Motion [call]:** subtle only. Cards lift on hover (translate −2px, shadow grows) and the add-to-cart button gives a small bounce. No scroll-jacking.

---

## 6. Storefront pages

### 6.1 Home (top to bottom, as in the mockup)
1. **Announcement bar:** 1–3 messages (editable).
2. **Header:** wordmark, nav (up to 4 editable links), search (simple product-name search, client-side over the published catalog, which is small), cart button with count.
3. **Hero:** pill text, headline (one word chosen for the mint highlight), subtext, 2 CTAs (label + link), and **featured product A (big card) + product B (small card)**. Images come from those products by default and can be overridden with a custom image. A sticker text. The **price tag is computed from product A** (our price and its marketplace price), never typed by hand.
4. **Trust row** (fixed layout): "GST-registered business", "Cash on delivery", "Easy N-day returns" (N comes from settings), "Secure payments".
5. **Shop by need:** the category tiles (editable categories; order, colour and image come from the category).
6. **Favourites:** a product grid from a chosen collection (default: "This week's favourites"). "See all N →" goes to `/shop`.
7. **Why buy direct:** a fixed 3-card band. The marketplace pills come from settings (only the marketplaces with a store URL are shown).
8. **Footer:** wordmark, GSTIN, address, policy links, social and marketplace links (from settings).
9. **Floating WhatsApp button:** opens `wa.me/<number>?text=<prefilled>`, with page-aware text such as "Hi, I have a question about <product>".

Marketplace ratings ("★ 4.3 on Amazon") show **only if they are set** in settings. **Never invent numbers.**

### 6.2 Product page
- Gallery: swipeable on mobile, with thumbnails on desktop. The first image is the main one.
- Name, badge, our price, and the marketplace comparison ("₹1,499 on Amazon" with a link to the listing).
- Stock state: in stock / only N left (when N ≤ 3) / out of stock (button disabled, plus "Ask on WhatsApp").
- Qty stepper, capped by stock and by `maxPerOrder` (settings, default 5).
- **Delivery check:** enter a pincode to see "Delivers to Lucknow in 3–5 days · COD available" (Shiprocket serviceability, §11.2).
- Description (rich text) and highlights (bullets).
- "What's in the box" photo (optional field).
- Age group (toys) and BIS/ISI number (toys, optional).
- Trust row (compact) and "Also available on" marketplace links.
- Related products from the same category.
- JSON-LD `Product` with `offers` (INR price, availability).

### 6.3 Links page `/links`
A standalone page (no main header). Wordmark, a one-line tagline, then big ink-outlined buttons in Playful Pop style. Each button has a preset icon type (shop, whatsapp, amazon, flipkart, meesho, instagram, generic link) and an optional "highlight" style for the main shop button. Text labels only, no marketplace logos **[call]**.

### 6.4 Cart and checkout
- **Cart:** a drawer, stored in `localStorage` (product id + qty). It shows prices from the latest catalog data. The server recalculates everything at checkout.
- **Checkout** (single page, mobile-first):
  1. Contact: name, **mobile** (10 digits, starts with 6–9), email (*optional*; used for email updates if given) **[call]**.
  2. Address: line 1, line 2, landmark (optional), pincode, city, state (dropdown). City and state are auto-filled from the pincode when possible.
  3. Delivery check runs on pincode entry.
  4. Payment method: **Pay online** (shows "Save ₹X" when a prepaid discount is set) or **Cash on delivery** (hidden or disabled with the reason when not eligible, §8.3).
  5. Order summary: items, subtotal, shipping, prepaid discount, total. The text "Prices include GST" is shown.
  6. Turnstile widget (invisible/managed) and a "Place order" button.
- **Errors** are friendly and specific ("Sorry, we can't deliver to 7xxxxx yet").

### 6.5 Order status `/order/[orderNumber]?t=...` and `/track`
Shows status and a timeline (Placed → Confirmed → Shipped → Delivered), items, the delivery address (partly masked), the courier tracking link once shipped, and a WhatsApp help button. For COD orders awaiting confirmation it shows: "We'll WhatsApp you shortly to confirm your order."

Customers can get back to their order in three ways **[call]**:
- `/track` (order number + phone).
- The order emails, which carry the link.
- Asking on WhatsApp. The admin order view has a **"Copy customer link"** button for this.

The confirmation page tells customers to save or screenshot the order number.

---

## 7. Content model (Payload)

**Principle [Shoaib approved]:** *content is editable, design is not.* Colours, fonts, layout, section order and component styles live in code.

### 7.1 Collections

**products**

| Field | Details |
|---|---|
| title, slug | |
| status | draft / published (Payload drafts) |
| images | Ordered upload array (min 1); the first is the main image |
| boxImage | Optional; "what's in the box" |
| price | ₹, GST-inclusive, integer rupees |
| compareAt | Optional marketplace comparison: `marketplace` (amazon / flipkart / meesho), `price`, `url`, `checkedOn` (date, required when set). **The comparison, the "Save ₹X" badge and the hero price tag are hidden whenever `compareAt.price ≤ price`.** The Today screen lists comparisons with `checkedOn` older than 30 days under "Re-check marketplace prices", so the site never claims a stale price. |
| marketplaceLinks | Optional list of `marketplace`, `url` (for "Also available on") |
| variants | **[Shoaib: colour variants exist]** Array, min 1. Each row: `name` (e.g. "Mint", or "Default" when there are no options), `swatch` (hex), `images` (optional; shown first when this variant is selected), `stock` (integer ≥ 0), `sku` (optional). Price is per product, and every variant shares it **[call]**. A product with one variant hides the picker. The cart, stock, orders, Shiprocket and invoices all work at **variant level**. |
| badge | none / bestseller / new / limited |
| category | Relation, required |
| shortDescription, description, highlights | description is rich text; highlights are strings |
| ageGroup | Optional, e.g. "3+" |
| bisNumber | Optional |
| tax | hsnCode (required), gstRate (enum 0/5/12/18/28, required) |
| shipping | weightGrams, lengthCm, widthCm, heightCm (all required; used by Shiprocket) |
| codAllowed | Boolean, default true |
| seo | Optional title, description, image |

**Variant storage [call]:** an array field on the product, for inline editing in the admin. Stock reservation runs a conditional `UPDATE … SET stock = stock - :qty WHERE id = :variantRowId AND stock >= :qty` on the variants table, inside the order transaction, through Payload's Drizzle access (§8.3).

**discountCodes** **[Shoaib: wanted in v1]**

| Field | Details |
|---|---|
| code | Unique, stored uppercase, letters/digits/dashes |
| type | `percent` or `flat` |
| value | |
| maxDiscount | ₹, optional; for percent codes |
| minOrderValue | ₹, optional |
| validFrom, validUntil | Optional dates |
| usageLimit | Total uses, optional |
| perPhoneLimit | Default 1 |
| active | Boolean |
| note | e.g. "Instagram Diwali reel"; used to see which campaign worked |
| usage | Read-only in the admin, computed from orders: times used and revenue |

Codes apply to the whole cart (no per-product targeting in v1). One code per order.

**categories:** title, slug, description, image, `tileColor` (enum cobalt / mint / tomato / sun / pink, which maps to tokens and keeps text contrast correct), order.

**collections:** title, slug, description, products (ordered relation list), order.

**media** (upload): alt (required), focal point enabled. Generated sizes:

| Size | Dimensions |
|---|---|
| thumb | 400×400 |
| card | 800×800 |
| hero | 1200×1200 |
| wide | 1600w |
| og | 1200×630 |

All sizes are WebP. The image is cropped around the focal point.

**pages:** title, slug, rich-text content, seo. Seeded with *draft* templates for about, contact, shipping-policy, return-policy, privacy-policy and terms. Each starts with a visible "⚠ Review before publishing" note, because the legal text is a starting template and not legal advice.

**orders:** see §8.1. Admin-only. **No create or delete from the admin UI**; orders are created only by checkout.

**codBlocklist:** phone, reason, createdAt.

**users:** admins only (Payload auth). One role, `owner`.

### 7.2 Globals

**homepage**
- announcement (1–3 strings)
- hero: pill, headline, highlightWord, subtext, ctaPrimary {label, link}, ctaSecondary {label, link}, productA, productB, imageOverrideA?, imageOverrideB?, stickerText
- favouritesCollection (relation)
- Drafts and preview enabled.

**navigation:** up to 4 items. Each is a label plus a link, where the link is a category, collection, page, or `/shop`.

**linksPage:** tagline, buttons[] {label, url, iconType, highlight, enabled}, ordered.

**storeSettings**

| Group | Fields |
|---|---|
| business | name ("Reyan Collections"), legalName, GSTIN, address (lines, city, state, stateCode, pincode), pickupAddress (defaults to the business address), whatsappNumber, phone, email |
| social and marketplaces | instagramUrl, store URLs (amazon/flipkart/meesho), ratings (amazon/flipkart/meesho; optional numbers with one decimal) |
| commerce | shippingFee (₹, default 49), freeShippingAbove (₹, default 499; empty means never), prepaidDiscount (₹, default 0), codMaxOrderValue (₹, default 2000), maxPerOrder (default 5), returnWindowDays (default 7) |
| timeouts | pendingPaymentMinutes (default 30), codConfirmHours (default 24) |
| invoicing | invoicePrefix (default "RC") |

All defaults are placeholders that Shoaib sets.

**invoiceCounters** (internal; a collection keyed by financial year, e.g. `2026-27`): lastNumber.

### 7.3 Publishing and revalidation
Storefront pages are statically generated and revalidated **on demand**. Payload `afterChange`/`afterDelete` hooks on products, categories, collections, pages and all globals call `revalidateTag` for the affected tags. A fallback time-based revalidation of 1h covers stock and status freshness **[call]**. Product pages read **live stock** in a small client fetch, so an "out of stock" state is never stale by an hour.

---

## 8. Commerce rules

### 8.1 Orders: data
- `orderNumber`: human-friendly and sequential, e.g. `RC1042` (starting at RC1001).
- `accessToken`: random, 32+ chars.
- `customer`: name, phone, email?
- `address`: line1, line2, landmark, city, state, stateCode, pincode
- `items[]`: **a snapshot taken at purchase**: productId, variantId, title, variantName, slug, unitPrice, qty, hsnCode, gstRate, weight and dims
- `subtotal`, `discountCode` (string, or null), `codeDiscount`, `shippingFee`, `prepaidDiscount`, `total` (₹ integers)
- `paymentMethod`: `prepaid` | `cod`
- `paymentStatus`: `unpaid` | `paid` | `refunded` | `cod_pending` | `cod_collected`
- `status` (§8.2)
- `razorpay`: orderId, paymentId
- `shipment`: shiprocketOrderId, shipmentId, awb, courierName, trackingUrl, labelUrl, events[] {status, at, raw}
- `invoice`: number, issuedAt
- `timeline[]`: {status, at, by: system/admin, note}
- `meta`: ip hash, user agent, Turnstile verified flag

### 8.2 Order status machine

```
pending_payment ──paid──▶ confirmed
pending_payment ──expired/failed──▶ cancelled
awaiting_confirmation (COD) ──admin confirms──▶ confirmed
awaiting_confirmation ──24h no confirm / admin cancels──▶ cancelled
confirmed ──Ship (Shiprocket booked)──▶ ready_to_ship ──picked up──▶ shipped
shipped ──▶ out_for_delivery ──▶ delivered
shipped/out_for_delivery ──▶ rto (returned to origin)
confirmed/ready_to_ship ──admin cancels──▶ cancelled (prepaid → full refund)
delivered ──admin marks return received──▶ returned (prepaid → refund; COD → manual refund note)
```

- Transitions are enforced in one pure module (`orderStateMachine.ts`) with unit tests. Any other transition is rejected.
- **Stock** is decremented when the order is created, and released on `cancelled`. On `rto` and `returned` it is released **only when the admin ticks "restock"**, because the item may be damaged.
- **COD refused at the door** (`rto` on a COD order) automatically adds the phone to `codBlocklist`, and the admin can undo this.

### 8.3 Checkout pricing and eligibility (server-side only)
1. Load the products and variants by id. Reject any that are unpublished or missing. Clamp qty to `maxPerOrder`.
2. `subtotal = Σ price × qty`.
3. **Discount code** (if given):
   - Validate: exists, active, within its dates, `subtotal ≥ minOrderValue`, total uses `< usageLimit`, and this phone's uses `< perPhoneLimit`. Uses are counted from orders that aren't cancelled.
   - `codeDiscount` = flat `value`, or `round(subtotal × value%)` capped at `maxDiscount`, and never more than `subtotal`.
   - An invalid code gives a specific message ("This code has expired" / "Add ₹120 more to use this code").
4. `afterCode = subtotal − codeDiscount`. `shippingFee` is 0 when `freeShippingAbove` is set and `afterCode ≥ freeShippingAbove`; otherwise it is `shippingFee` **[call]**.
5. Prepaid: `prepaidDiscount = min(settings.prepaidDiscount, afterCode)`. It stacks with a code **[call]**.
6. `total = afterCode + shippingFee − prepaidDiscount`.
7. The same function powers `POST /api/checkout/quote`, which shows live totals as the customer edits the cart, applies a code, enters a pincode or switches payment method. The place-order endpoint re-runs it and never trusts the quote.
5. **COD is eligible only if** all of these hold:
   - every item has `codAllowed`
   - `total ≤ codMaxOrderValue`
   - the phone is not on `codBlocklist`
   - Shiprocket reports COD as serviceable for the pincode
6. **Anti-abuse:**
   - The Turnstile token is verified server-side.
   - Max **3 orders per phone per 24h** and **10 checkout attempts per IP per hour**, counted in Postgres (an orders query, plus a small `rateLimits` table for attempts) **[call]**.
   - A honeypot field.
   - Pincode serviceability is required.
7. **Stock reservation** happens inside one DB transaction:
   - `UPDATE products SET stock = stock - :qty WHERE id = :id AND stock >= :qty` for each item.
   - If any update affects 0 rows, roll back and reply "only N left".
   - Then insert the order.

### 8.4 Prepaid flow (Razorpay)
1. Checkout creates the order (`pending_payment`) and a Razorpay Order (amount in paise, `receipt = orderNumber`), and returns the details to the client.
2. The client opens Razorpay Checkout. On success it POSTs `{razorpay_order_id, razorpay_payment_id, razorpay_signature}` to `/api/checkout/verify`. The server verifies the HMAC, marks the order `paid` and `confirmed`, and redirects to the order page.
3. **The webhook is the source of truth.** `/api/webhooks/razorpay` verifies the signature and handles `order.paid` (and `payment.failed` for logging). It is idempotent on `paymentId`, so the verify call and the webhook can arrive in either order.
4. **Late payment after expiry:** the order is already cancelled and its stock released. Try to re-reserve the stock. If that works, confirm the order. If not, issue an automatic full refund and flag the order on the Today screen ("Paid after expiry, refunded").
5. Failed or abandoned payments leave the order `pending_payment` until the expiry job cancels it.
6. **Aligning the expiry times [call]:**
   - Razorpay Checkout is opened with `timeout: 900` (15 min), so the payment window closes well before our `pendingPaymentMinutes` (30).
   - In the Razorpay dashboard, payments are **auto-captured**, and late-authorised payments are auto-refunded after 30 min.
   - With both in place, step 4 is a rare safety net and not a normal path.

### 8.5 COD flow
1. Checkout creates the order in `awaiting_confirmation` with `paymentStatus = cod_pending`.
2. In the admin, the **Confirm on WhatsApp** button opens `https://wa.me/91XXXXXXXXXX?text=<encoded>` with this template **[call]**:
   > Hi {firstName}! This is Reyan Collections. You ordered {item summary} (₹{total}, cash on delivery) to {city} {pincode}. Reply YES to confirm and we'll ship it soon. Order {orderNumber}.
3. The admin clicks **Mark confirmed**, and the order becomes `confirmed`.
4. The expiry job cancels unconfirmed orders after `codConfirmHours` and releases their stock.
5. When the order is delivered, `paymentStatus` becomes `cod_collected` (from the Shiprocket delivered event).

### 8.6 Fulfilment (Shiprocket)
- **Ship** (admin action on a `confirmed` order):
  1. Create the Shiprocket order with the item snapshot, dims and weight. The package weight is the sum of the items; dims come from the largest item **[call]**. Payment is `Prepaid` or `COD` with the collectable amount, and the pickup location is from settings.
  2. Request an AWB with Shiprocket's recommended courier **[call]**, or let the admin pick from the available courier list in v1.1.
  3. Generate the pickup request.
  4. Store the AWB, courier, `labelUrl` and `trackingUrl`. The order becomes `ready_to_ship`, and the **GST invoice is issued** at this point (§9).
- **Tracking webhook** `/api/webhooks/shiprocket`: verify it with a shared token header. Map the Shiprocket status to ours: picked up / in transit → `shipped`, out for delivery → `out_for_delivery`, delivered → `delivered`, RTO → `rto`. Append to `shipment.events`.
- A **packing slip** (A6/A4 printable HTML) lists the order number, items, qty, and the "what's in the box" checklist. "Print all packing slips" covers every order in `ready_to_ship`.

### 8.7 Cancellation, refunds and returns
- The admin can cancel from `awaiting_confirmation`, `confirmed` or `ready_to_ship`. If a shipment exists, cancel it at Shiprocket first. Prepaid orders get a full refund through the Razorpay Refunds API, and `paymentStatus` becomes `refunded`.
- **Returns (v1, manual):** the customer requests a return on WhatsApp, and Shoaib arranges it (Shiprocket return or by hand). Once the item is received, the admin clicks **Mark returned**, which optionally restocks and refunds prepaid orders. COD refunds are paid manually by UPI and recorded with a note. The return policy page states the window (`returnWindowDays`) and the conditions.

### 8.8 Notifications
- **Email** (only when the customer gave an address), sent through Resend: order placed (prepaid paid / COD received), confirmed (COD), shipped (with the tracking link), cancelled or refunded. Templates are simple branded HTML.
- **Admin alert:** an email to the store email on every new order **[call]**.
- **WhatsApp:** manual, through click-to-chat buttons only (v1).
- **SMS:** none from us. Shiprocket and couriers send their own tracking SMS.

### 8.9 Scheduled jobs (Payload jobs queue, autoRun every 15 min) **[call]**
- `expirePendingPayments`: cancels `pending_payment` orders older than `pendingPaymentMinutes` and releases their stock.
- `expireUnconfirmedCod`: cancels `awaiting_confirmation` orders older than `codConfirmHours` and releases their stock.
- `pollShipmentStatus` (hourly): a safety net in case a webhook is missed.

---

## 9. GST invoices
- Issued when an order moves to `ready_to_ship`, i.e. when goods are about to leave. Orders cancelled before shipping never take an invoice number.
- **Number:** `{prefix}/{FY}/{seq}`, e.g. `RC/2026-27/0001`. The sequence is per financial year (April–March), allocated atomically in `invoiceCounters` with a row lock. It stays ≤16 characters.
- **Content:**
  - Seller: legal name, GSTIN, address, state + code.
  - Buyer: name, address, state + code.
  - Invoice number and date, place of supply.
  - Per line: description, HSN, qty, unit price incl. GST, taxable value (`price / (1 + rate)`), and the rate.
  - Tax: **CGST + SGST** (half rate each) when the buyer's state equals the seller's state, otherwise **IGST**.
  - Shipping is charged as its own line, taxed at the highest GST rate among the items **[call; Shoaib to confirm with his CA]**.
  - The code discount and the prepaid discount are each shown as a line, and they reduce the item taxable values proportionally **[call; CA to confirm]**.
  - The line description includes the variant, e.g. "Mexico container, set of 2 (Mint)".
  - Totals are rounded to the rupee, with the amount in words.
- **Output:** a PDF made with `@react-pdf/renderer`, generated on demand (`/api/orders/:id/invoice.pdf`, admin-only, plus a tokenized customer link on the order page).
- **Out of scope:** credit notes for RTO or returns after invoicing. These are handled manually with the CA. When an invoiced order reaches `rto` or `returned`, it gets a `creditNoteNeeded` flag, and the Today screen shows it as an alert until the admin ticks "handled".
- **The tax rules are hard-coded [call]** in one isolated module, `lib/commerce/invoice.ts`, with unit tests. They are not admin-configurable. If the CA disagrees with the shipping or discount treatment, only that module and its tests change.

---

## 10. Architecture

### 10.1 Stack [call, Shoaib approved]
- **One app:** Next.js (App Router, TypeScript) with **Payload CMS 3** embedded, from a single repository. Use the latest stable versions from `create-payload-app` (Postgres adapter), and **pin exact versions** at scaffold time (no `^`). Upgrades are deliberate.
- **DB:** Postgres via `@payloadcms/db-postgres`. Use Docker Compose locally and Railway Postgres in production.
- **Media:** stored on the local disk in dev, and in **Cloudflare R2** via `@payloadcms/storage-s3` in production, served from a public bucket on `media.reyancollection.in`. Sizes are generated by Payload with `sharp`.
- **Styling:** Tailwind CSS with the tokens from §5 as theme values. Components are hand-built, with no UI kit on the storefront.
- **PDF:** `@react-pdf/renderer`. **Email:** Resend SDK (+ React Email templates). **Bot check:** Cloudflare Turnstile.
- **Package manager:** pnpm. **Lint/format:** ESLint + Prettier. **Types:** `tsc --noEmit`. **Unit tests:** Vitest. **E2E:** Playwright.
- **No plugin-ecommerce [call]:** our flows (COD confirmation, Shiprocket, GST invoices) are specific, and the catalog is tiny, so custom collections are simpler and clearer.

### 10.2 Repository layout (indicative)
```
src/
  app/(frontend)/...        storefront routes
  app/(payload)/...         admin + Payload API (generated)
  app/api/checkout/...      checkout, verify
  app/api/webhooks/...      razorpay, shiprocket
  collections/  globals/    Payload configs
  components/               storefront UI (Playful Pop)
  admin/                    custom admin views/components (Today, order actions)
  lib/commerce/             pricing.ts, eligibility.ts, orderStateMachine.ts, stock.ts, invoice.ts
  lib/integrations/         razorpay/, shiprocket/, email/, turnstile/  (each: types.ts, live.ts, mock.ts, index.ts)
  jobs/                     scheduled tasks
  seed/                     seed script + sample data
tests/unit/  tests/e2e/
docs/
```

### 10.3 Our endpoints
- `POST /api/checkout/quote`: price breakdown, COD eligibility and code validation (§8.3, step 7). It is rate-limited together with checkout attempts, so codes can't be brute-forced.
- `POST /api/checkout`: create the order (§8.3). Returns `{orderNumber, token, razorpay?}`.
- `POST /api/checkout/verify`: prepaid signature verification.
- `GET /api/serviceability?pincode=&cod=`: delivery check (cached per pincode for 24h in memory/DB).
- `GET /api/stock?ids=`: live stock for product pages and cart.
- `POST /api/webhooks/razorpay`, `POST /api/webhooks/shiprocket`
- Admin-only (Payload auth): `POST /api/orders/:id/{confirm|ship|cancel|mark-returned|mark-delivered}`, `GET /api/orders/:id/invoice.pdf`, `GET /api/orders/packing-slips?ids=`
- Public tokenized: `GET /api/orders/:orderNumber?t=` (status page data), `POST /api/track` (orderNumber + phone)
- `GET /api/health`

### 10.4 Admin customisation
- **Scope of customisation [Shoaib approved the mockup]:** two parts are **binding** and must match the mockup in content and layout: the **Today view** and the **order-detail actions panel** (progress line, eligibility note, state-aware action buttons, WhatsApp confirm with message preview). **Every other admin screen is stock Payload** with light branding. Don't restyle Payload's list and edit views.
- **Branding:** the wordmark logo and icon, with Payload's theme in light mode, plus a tomato accent.
- **Today view:** replaces or precedes the default dashboard, and matches `docs/design/mockups/admin-and-architecture.html`:
  - this-week summary
  - Confirm COD orders (WhatsApp + ✓, with an "auto-cancels in Xh" hint)
  - Ready to ship (Ship button, "Print all packing slips")
  - Low stock (≤ 3)
  - On the way
  - Alerts (e.g. late payment refunded, webhook errors)
  - Quick actions
  It is **mobile-first**.
- **Orders list:** status filter tabs and search by order number/phone. The **order edit view** gets custom UI components: a progress line, the serviceability/eligibility note, and action buttons (state-aware: only valid transitions are shown). Raw fields are read-only except notes.
- **Products list:** columns for thumbnail, title, price, stock and status. Stock is editable from the edit view (v1).

### 10.5 Environments and configuration
- Environments are **local** (Docker Postgres, all integrations `mock`) and **production** (Railway). No staging in v1 **[call]**.
- Each integration is selected by env: `RAZORPAY_MODE`, `SHIPROCKET_MODE`, `EMAIL_MODE`, `TURNSTILE_MODE` = `mock` | `live`.
- Secrets are only in env vars, and **never committed**. `.env.example` lists every variable with comments.

---

## 11. Integrations and their mocks

Every integration has a typed interface with `live` and `mock` implementations. **Mocks must make the full journeys work locally and in E2E**:

- **Razorpay mock:** "Pay" opens a local mock payment page (`/dev/mock-pay?order=...`) with **Succeed** and **Fail** buttons. Succeed posts a correctly HMAC-signed payload (using a dev secret) to the real verify endpoint, and fires the same handler as the webhook. The refund mock records the refund.
- **Shiprocket mock** (§11.2): serviceability returns serviceable for all pincodes except a fixed "unserviceable" test pincode (`000000`) and a "no-COD" test pincode (`111111`). Create order/AWB returns fake ids, and AWB `MOCKAWB…`. There is a dev-only admin button "Simulate courier event" (picked up / delivered / RTO) that calls the same webhook handler.
- **Email mock:** writes emails to the server log, and to a `devEmails` collection the E2E tests can read.
- **Turnstile mock:** always passes, except for the token `fail`.
- **Live notes:** Shiprocket uses token auth (email/password, so cache the token for about 9 days). Razorpay uses key id/secret and a webhook secret. Resend uses an API key. Turnstile uses a site key and a secret.
- **Live adapters are written against the official API docs** in milestones 4–5. They stay **unverified** until milestone 6, when they are tested with Razorpay **test-mode** keys (available right after signup, before KYC) and the real Shiprocket account. This is a known risk and is listed in the milestone 6 checklist. Mocks and live adapters must share the same interface, so switching is env-only.

### 11.2 Delivery check
Shiprocket courier serviceability API with `pickup_postcode` (settings), `delivery_postcode`, weight and `cod`. Results are cached for 24h per pincode and COD flag. Show the estimated delivery days from the best courier.

---

## 12. Security and privacy
- Prices, eligibility and stock are always computed server-side. The client sends only ids and quantities.
- Webhook signatures are verified (Razorpay HMAC; Shiprocket shared-token header). Handlers are idempotent.
- Order pages need the random token. `/track` needs order number + phone. Phone numbers are masked on public pages.
- Admin is behind Payload auth with a strong password, and the login is rate-limited (Payload `maxLoginAttempts`).
- No card data touches our servers (Razorpay hosted checkout).
- Basic security headers: CSP allowing Razorpay, Turnstile and Cloudflare analytics; HSTS through Cloudflare.
- Store an IP *hash* instead of the raw IP. Collect no tracking cookies in v1, apart from privacy-friendly Cloudflare Web Analytics.

---

## 13. SEO and sharing
- Per-page `generateMetadata`, with OG images from the `og` media size. Product OG text includes the price.
- `sitemap.xml` (products, categories, collections, pages), `robots.txt` (disallow `/admin`, `/checkout`, `/order`), and canonical URLs.
- JSON-LD: `Organization` (home) and `Product` (product pages).
- Link previews on WhatsApp and Instagram should look good. This matters because links are shared in chats.

---

## 14. Performance targets
- Mobile Lighthouse: Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95 on home and product pages.
- LCP < 2.5s on simulated 4G. Fonts are self-hosted, with the hero image prioritized and other images lazy-loaded.
- Storefront JavaScript stays small. The cart and checkout are client islands, and everything else is server components.

---

## 15. Hosting and operations [Shoaib approved]
- **Railway** (Hobby, Singapore region) runs the app service and Postgres. The app uses the Docker or Nixpacks build, `pnpm build && pnpm start`. Deploys happen on push to `main` from GitHub (private repo).
- The app service is **always on**, with app sleeping disabled, so Payload's `autoRun` jobs keep firing. A 15-minute job interval is acceptable: COD cancellation fires 24h–24h15m after the order, and payment expiry 30–45 min after.
- **Cloudflare:**
  - DNS, with the domain's nameservers moved from GoDaddy.
  - Proxy/CDN in front of the app.
  - R2 bucket `reyan-media` with a custom domain.
  - Turnstile.
  - Email Routing (`hello@reyancollection.in` → Shoaib's inbox).
  - Web Analytics.
- **Resend:** sending domain verified on `reyancollection.in` (DNS records in Cloudflare).
- **Backups:** a GitHub Actions nightly workflow `pg_dump`s to R2 (`backups/`) and keeps 30 days **[call]**.
- **Monitoring:** `/api/health`, plus a free uptime monitor (UptimeRobot or Better Stack). Railway logs.
- **Deploying is a later milestone.** Development first runs fully locally with mocks.

---

## 16. Testing
- **Unit (Vitest):** pricing and eligibility, the order state machine, GST invoice maths (intra- vs inter-state, rounding), invoice numbering across a financial-year boundary, the WhatsApp message builder, stock reservation (against the test DB).
- **E2E (Playwright, against the app in mock mode with a seeded DB):** each test is a **whole journey** and **ends by asserting something visible on screen**:
  1. **Prepaid purchase:**
     - Instagram-style entry at `/links` → shop → product → **pick a colour variant** (the gallery switches) → add to cart → checkout → **apply a discount code** (the totals update) → mock pay success → the order confirmation page shows "Order confirmed", the order number and the variant name.
     - In the admin, the order appears under Ready to ship → Ship → simulate pickup and delivery → the customer status page shows "Delivered".
  2. **COD order:**
     - Checkout with COD → the order page shows "We'll WhatsApp you…".
     - In the admin, Today lists it under Confirm COD → the WhatsApp link contains the right message → Mark confirmed → Ship → simulate RTO → the order shows `RTO` and the phone appears in the COD blocklist → a new checkout with that phone shows COD unavailable.
  3. **Admin content:** log in → create a product with an image and stock 2 → publish → the shop shows it → buy 2 → the product page shows "Out of stock".
  4. **Guards:** unserviceable pincode shows an error; total over the COD limit hides COD; payment failure leaves a pending order → run the expiry job → the order shows "Cancelled" and the stock is restored on the product page.

---

## 17. Open items

**For Shoaib** (settings, so they don't block the build): shipping fee and free-shipping threshold, prepaid discount, COD limit, return window, GSTIN, address/state, WhatsApp number, marketplace URLs and ratings, policy text review, and product data (prices, HSN/GST, weights, dims). Also new photos per product, shot on a plain background, plus a "what's in the box" shot.

**Resolved 2026-10-26 [Shoaib]:** colour variants are in v1 (§7.1). Discount codes are in v1 (§7.1, §8.3). The brand is "Reyan Collections" with the existing logo (§1, §5).

## 18. Left to the builder
Exact component breakdown, file names beyond §10.2, the Tailwind setup details, the email template look (within Playful Pop), the seed data shape, the admin component internals, the choice between Docker and Nixpacks on Railway, and pinned dependency versions.

## 19. Milestones (for the implementation plan)
1. **Foundation:** scaffold, Docker Postgres, tokens/fonts, lint/test tooling, CI-less local scripts.
2. **Content model + seed:** all collections and globals (including variants and discount codes), seeded with the 5 sample products (karaoke, duck track, Mexico container with two colour variants, juicer, helicopter), plus the categories, homepage, links, settings and one sample code.
3. **Storefront:** home, links, shop/category/collection, product, CMS pages, SEO.
4. **Cart + checkout + orders (mock integrations):** pricing, eligibility, stock, Turnstile, mock Razorpay, the order page and `/track`.
5. **Admin operations:** the Today view, order actions, WhatsApp links, mock Shiprocket, invoices, packing slips, jobs, emails.
6. **Go-live:** live integrations, R2, Railway, Cloudflare, backups, uptime, Lighthouse pass.
