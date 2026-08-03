# PRD: Offline Shopping Records App

*Project name: "BuyRight"*

*Status: Shipped MVP + several post-MVP features, live at Vercel (project `dealnuts`). This document reflects the app as currently built, not just the original plan — see the changelog at the bottom for what shipped since the first draft.*

---

## 1. Project Overview (Logical Thinking — What is this?)

A mobile-first web app that helps people who like to browse multiple physical stores before deciding what to buy. As the user walks around and sees products they're interested in, they can quickly log each one — with its location, a photo, and key details — instead of relying on memory. Later, they can review everything they've seen, grouped automatically, compared side by side (with live currency conversion), and decide which item(s) to go back and actually purchase.

**Core problem it solves:** Comparison shopping across physical stores is hard because there's no easy way to remember "that jacket at the store two blocks over" vs. "the similar one I saw this morning" — including price (possibly in a different currency while traveling), exact look, and where it was.

**Target user:** Someone actively shopping in person across multiple stores in one outing (or over several days, possibly across countries/currencies), who wants to compare finds before committing to a purchase.

---

## 2. Skills / Tech Stack (Analytical Thinking — How do we build it?)

Client-only web app — no backend server. Everything (photos, records) stays on-device in the browser; the only network calls are to free, keyless public APIs for reverse geocoding and exchange rates.

- **Frontend:** React + Tailwind CSS, built with Vite
- **Location:** Browser Geolocation API (`navigator.geolocation`) + OpenStreetMap Nominatim for reverse geocoding
- **Camera/Photo:** Two explicit capture paths — `capture="environment"` file input (opens rear camera directly) and a plain file input (photo library picker)
- **Local data storage:** IndexedDB via the `idb` wrapper — not `localStorage`, since it handles structured records + photo blobs without the ~5–10MB cap
- **On-device OCR:** Tesseract.js — reads photographed price tags entirely in-browser (no photo ever leaves the device) to prefill brand, price, category/subcategory, size, and color hints
- **On-device logo matching (built, not yet wired into the capture flow):** TensorFlow.js + a pretrained MobileNet feature extractor, matching the captured photo against a curated reference set of **108 brand logos** (`src/assets/logos/`, sourced from Wikimedia Commons and tracked in `_manifest.json`) via cosine similarity of image embeddings. Complements OCR text matching for brands whose logo is more legible than their printed name. See open questions — this exists in `src/utils/logoMatch.js` but nothing currently calls it, and `logoMatch.js` also expects an `embeddings.json` file in the same folder (precomputed reference embeddings) that hasn't been generated yet.

  **Brands currently in the logo library (108):** Acne Studios, Adidas, Alexander McQueen, American Eagle, Ami Paris, Armani, Ashworth, Asics, Balenciaga, Bally, Banana Republic, Bath & Body Works, Boss, Bottega Veneta, Breitling, Burberry, C.P. Company, Callaway, Calvin Klein, Camper, CASETiFY, Casio, Celine, Chevignon, Chloé, Chow Tai Fook, Citizen, Clarks, Club Monaco, Coach, Cole Haan, Columbia Sportswear, Converse, Crocs, DeLonghi, Descente, Dior, Dolce & Gabbana, Dsquared2, Dunhill, Ecco, Etro, Fendi, Ferragamo, Furla, G2000, Gap, Geox, Givenchy, Gucci, Hamilton, Helly Hansen, J.Lindeberg, Jil Sander, Jimmy Choo, K-Swiss, Kate Spade New York, Kenzo, Lacoste, Le Creuset, Lego, Levi's, Loewe, Longchamp, Longines, Loro Piana, Lululemon, Maison Margiela, Marni, MaxMara, Michael Kors, Miu Miu, Molton Brown, Moncler, Montblanc, New Balance, Nike, Oakley, Off-White, Pandora, Polo Ralph Lauren, Prada, Puma, Ray-Ban, Replay, Saint Laurent, Salomon, Samsonite, Seiko, Skechers, Stone Island, Swarovski, Swatch, Tag Heuer, TaylorMade, The North Face, Timberland, Tissot, Tod's, Tommy Hilfiger, Tory Burch, Tumi, Ugg, Under Armour, Versace, Woolrich, Zegna, Zwilling.

  **Targeted but not yet sourced** (~72 more, per `_manifest.json`): a mix of brands Wikimedia Commons had no clean logo file for (`not_found` — e.g. Valentino, Vivienne Westwood, Marc Jacobs, Diesel, Champion, Fila, Vans) and brands the fetch script simply hadn't reached yet before a network error stopped it (`error` — e.g. Uniqlo, Sandro, Victorinox, The Body Shop, Repetto, MLB, National Geographic). Re-running the fetch for the `error` group should be straightforward since it's a transient failure, not a missing-source problem.
- **Live currency conversion:** [open.er-api.com](https://open.er-api.com) — free, no API key, covers all 14 supported currencies including TWD (which ruled out the ECB/Frankfurter alternative)
- **Deployment:** Vercel, connected to GitHub (`ddeenn-11/dealnuts`), auto-deploys on push to `main`

---

## 3. Key Features (Computational Thinking — How does it all fit together?)

### Shipped

**A. Add Entry (capture flow)**
- Auto-capture GPS coordinates on load (permission asked once); reverse-geocoded into an editable **Location** field — stays editable because GPS/reverse-geocoding is frequently wrong or unavailable indoors (malls), which is exactly where this app gets used most
- Optional **Store #** field next to Location, for mall unit numbers
- Auto-capture date/time on creation — permanent, never editable, so it stays a reliable "when I actually saw this" record
- **Two explicit photo buttons** — "Take Photo" (opens rear camera directly) and "Choose from Library" — instead of a single camera-only control
- **On-device OCR auto-scan** runs the moment a photo is attached: best-effort extraction of brand, price, category/subcategory, size, and color from the tag text (plus a dominant-pixel-color fallback when no color word is found). Every field it fills stays editable and is only prefilled if the user hasn't already typed something there — it never silently overwrites a manual entry.
- Manual fields: Brand, Category (12 top-level) + Subcategory (per-category list), Price + Currency (14 ISO codes, default HKD), Description (free text)
- Save entry locally (IndexedDB)

**B. Browse / "Finds" screen**
- List of all saved entries, grouped and sorted newest-first within each group
- Every card renders identically sized regardless of content: Brand / Price / Category·Subcategory / Location·Date, each on its own line with proper truncation — a long location name or big price no longer changes a card's height
- **Auto-grouping by Category + Subcategory** (brand is no longer part of the grouping key — a "Clothing" group holds every clothing item regardless of brand). Groups are ordered by taxonomy order (Clothing → Shoes → ... → Other), not by group size. Missing subcategory falls back to a category-only group.
- **Manual grouping** — user-created named groups ("My groups" tab), independent of auto-grouping
- **Tap-to-select is always on** — no separate "Select mode" toggle. Tapping any card toggles its checkbox directly.
  - **Edit** button (enabled only when exactly one item is checked) opens that item's detail/edit view
  - **Delete** button (enabled when one or more checked) bulk-deletes after one confirmation
  - Selecting 2+ shows a floating **"Compare N finds"** button — the only way to start a comparison
- Search across brand, category, subcategory, location, store #, and description
- **Export** — downloads all entries + photos as a single JSON backup file (the safety net for local-only storage — see §6)

**C. Compare**
- Selection happens exclusively in Finds; the Compare screen itself has no picker anymore — it's purely a viewer/actions surface for whatever's currently selected
- Opening the Compare tab directly (not via Finds) shows your **last comparison**, persisted in `localStorage`, instead of starting empty every time
- **"Clear all"** button, top-right, above the currency selector
- **Currency conversion**: pick one currency to compare everything in (default HKD); live rates fetched from open.er-api.com, with the applied rate(s) and fetch timestamp shown above the table. Falls back to showing original (unconverted) prices if the rate fetch fails, rather than breaking.
- Table fits exactly 2 entries on a phone screen with no horizontal scroll (full-width, fixed layout); 3+ entries reverts to a scrollable wide table
- Rows: Price (converted), Category·Subcategory, Location, Store #, Map link, Description, Logged date/time

**D. Item Detail View**
- Full-size photo, all recorded fields (including Location, Store #, Category/Subcategory, Price+Currency), a map link if coordinates were captured, and the immutable logged timestamp
- Edit or delete the entry

**E. Data Safety Net**
- **Export to JSON** — the primary backup mechanism (see §6 for why this matters more than it sounds)
- Copyright footer ("© 2026 BuyRight. All rights reserved.") shown on every screen, below the tab bar

### Not built (future)

- Wiring the built-but-unused logo-matching model into the capture flow
- Multiple photos per entry
- Price history tracking (same item seen again, at a different store or time)
- Cloud account + login for cross-device sync — deliberately out of scope; local-only is the model
- Aggregate map view of all shopping-trip pins (currently only a per-entry "View map" link)
- Share a comparison or group with someone else
- Sort by distance from current location

---

## 4. Data Model (as built)

```
Entry {
  id: string
  photo: blob | null
  latitude: number | null
  longitude: number | null
  storeName: string        // "Location" in the UI — reverse-geocoded, editable
  storeNumber: string       // optional — mall unit/store number
  brand: string
  category: string          // one of 12 top-level taxonomy values (see below)
  subcategory: string        // optional — from that category's subcategory list
  price: number | null
  currency: string           // one of 14 ISO codes; default "HKD"
  description: string        // free text; OCR may prefill "Color: X" / size hints
  dateAdded: timestamp        // auto-set on creation, immutable
}

Group {
  id: string
  name: string
  isAutoGenerated: boolean
  entryIds: string[]
}
```

**Category taxonomy** (`src/utils/grouping.js`) — 12 top-level categories, each with 4–6 subcategories: Clothing, Shoes, Bags, Accessories, Home, Beauty, Outdoors, Electronics, Food, Babies, Entertainment, Other (no subcategories).

**Currencies** (`src/utils/currency.js`): HKD (default), JPY, KRW, CNY, TWD, THB, SGD, USD, EUR, CAD, GBP, AUD, NZD, CHF.

---

## 5. UX Notes (Procedural Thinking — How do we make it genuinely good, not just functional?)

- **Speed matters.** Camera-first capture, OCR prefill to cut typing, save in as few taps as possible.
- **Location capture is silent and automatic**, but never loses the ability to be corrected — indoor GPS accuracy (malls, department stores) is unreliable enough that a non-editable field would actively hurt the core use case.
- **Camera opens directly** on "Take Photo"; "Choose from Library" is a separate, explicit action rather than folding both into one ambiguous control.
- **Auto-grouping is forgiving** — missing subcategory falls back to category-only, never an empty-looking label.
- **Selection is a single, consistent gesture** (tap = select) reused for edit, delete, and compare, rather than three different modes with their own toggles.
- **OCR/logo hints never overwrite user input.** Every auto-filled field is a suggestion, not a commitment — if the user already typed something, the scan result is dropped for that field.
- **Comparison currency defaults to HKD** but is a one-tap change; the rate actually used is always shown so the number isn't a black box.

---

## 6. Data Safety Net — Assumptions & Real Risk

<assumption>Local-only storage (IndexedDB) means data is tied to one device/browser. Closing the app, restarting the phone, etc. does not lose data — but a few things genuinely can:</assumption>

- Manually clearing browser/site data, or using Private/Incognito mode
- **iOS Safari's 7-day script-writable-storage eviction** — if the site isn't visited for 7 days, Safari can silently wipe IndexedDB. This is the most realistic risk for an app used in bursts across a multi-day trip. **Mitigation:** "Add to Home Screen" exempts a site from this eviction policy; the in-app **Export** button is the fallback backup for anyone who doesn't do that.
- Switching phones or reinstalling the browser (data doesn't transfer — there's no account/sync)

---

## 7. Assumptions & Open Questions

<assumption>Category taxonomy is a fixed two-level list (12 categories × 4–6 subcategories each) rather than an open/user-extensible taxonomy, to keep auto-grouping consistent. This has now shipped and been used through several rounds of testing.</assumption>

<assumption>Multi-currency support (14 currencies, live conversion) was originally out of scope for the MVP but was added after real usage — international/cross-border shopping comparisons turned out to matter.</assumption>

- **Logo matching is built but disconnected.** `matchLogo()` in `src/utils/logoMatch.js` works standalone (loads MobileNet, embeds the photo, cosine-matches against the reference set) but nothing in `AddEntry.jsx` calls it yet. Open question: should it run alongside OCR on every capture, or only as a fallback when OCR's brand guess is empty/low-confidence? Given it's a real, sizeable client-side model (TensorFlow.js + MobileNet), also worth deciding whether to lazy-load it only on first use to avoid bloating initial page load for users who never need it.
- Should photos be compressed/resized before storing? — **Resolved, shipped**: yes, client-side resize to ~1280px max dimension before saving.
- Should there be a limit or archive/cleanup mechanism for old entries? — Still open; not built.
- Should the OCR-guessed category/subcategory and the logo-matched brand ever be shown to the user as "confidence" hints (vs. silently prefilling), so a low-confidence guess is visually distinguishable from a firm one?

---

## 8. Changelog (high-level, since the original MVP draft)

1. Two-button photo capture (camera vs. library) replacing camera-only
2. On-device OCR auto-scan (Tesseract.js) for brand/price/size, later extended to category/subcategory keyword matching and color detection (text + dominant-pixel fallback)
3. Category taxonomy expanded from 6 flat categories to 12 categories with subcategories
4. "Store" renamed to "Location" (GPS-editable) + new optional "Store #" field
5. Price gained a currency field (14 currencies, default HKD)
6. Compare screen gained live currency conversion (open.er-api.com), rate/timestamp display, a persistent "last comparison," and a "Clear all" action
7. Compare's own item picker was removed — selection now happens only in Finds
8. Compare table redesigned to fit 2 items without horizontal scroll
9. Finds screen: bulk delete, then a full selection-model redesign (always-on tap-to-select, Select button replaced by Edit)
10. Auto-grouping changed from Category+Brand to Category+Subcategory
11. Finds cards redesigned to a fixed, uniform layout
12. Copyright footer added app-wide
13. Deployed to Vercel, connected to GitHub for auto-deploy on push
14. (In progress, uncommitted) On-device brand-logo matching via TensorFlow.js/MobileNet — built, not yet wired in
