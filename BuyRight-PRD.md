# PRD: Offline Shopping Records App

*Project name: "BuyRight"*

*Status: Shipped MVP + several post-MVP feature rounds, live at Vercel (project `dealnuts`). This document reflects the app as currently built, not just the original plan — see the changelog at the bottom for what shipped since the first draft.*

---

## 1. Project Overview (Logical Thinking — What is this?)

A mobile-first web app that helps people who like to browse multiple physical stores before deciding what to buy. As the user walks around and sees products they're interested in, they can quickly log each one — with its location, a photo, and key details — instead of relying on memory. Later, they can review everything they've seen, grouped automatically, compared side by side (with live currency conversion), and decide which item(s) to go back and actually purchase.

**Core problem it solves:** Comparison shopping across physical stores is hard because there's no easy way to remember "that jacket at the store two blocks over" vs. "the similar one I saw this morning" — including price (possibly in a different currency while traveling), exact look, and where it was.

**Target user:** Someone actively shopping in person across multiple stores in one outing (or over several days, possibly across countries/currencies), who wants to compare finds before committing to a purchase.

---

## 2. Skills / Tech Stack (Analytical Thinking — How do we build it?)

Primarily a client-only web app — everything (photos, records) stays on-device in the browser and in IndexedDB. **One exception, added later:** a small serverless backend exists solely to relay cloud-assisted tag scanning to a hosted vision model when on-device OCR comes up short — see "Cloud-assisted scanning" below. Every other feature, including all local OCR, remains fully on-device.

- **Frontend:** React + Tailwind CSS, built with Vite
- **Location:** Browser Geolocation API (`navigator.geolocation`), then two geocoding lookups in priority order (see "Location" under Add Entry below)
- **Camera/Photo:** Two explicit capture paths — `capture="environment"` file input (opens rear camera directly) and a plain file input (photo library picker). Captured photos are compressed to **1024px max dimension / quality 0.7** before storage.
- **Local data storage:** IndexedDB via the `idb` wrapper — not `localStorage`, since it handles structured records + photo blobs without the ~5–10MB cap
- **On-device OCR:** Tesseract.js — reads photographed price tags entirely in-browser to extract price, currency, size, color, quantity (weight/volume), and category hints. The worker (WASM + language data) is preloaded as soon as the Add Entry screen opens, so its one-time initialization cost lands during idle screen time rather than on the first scan. Runs a second pass with a different page-segmentation mode (SPARSE_TEXT) only when the first pass leaves color, size, or quantity blank, and OCR itself runs against a separate, higher-resolution copy of the photo (1600px/0.9) than the one that gets stored, since small tag text needs more pixels than the stored copy has; that copy is compressed in parallel with the stored copy rather than after it. Local results are applied to the form as soon as this pass resolves — the form doesn't wait on a possible cloud round-trip too before showing what local OCR already found.
- **Price and currency are read together, off the same match** — not as two independent scans. Currency used to come from a standalone whole-document search for any known symbol/code, which meant a single character Tesseract hallucinates out of unrelated image noise (a logo, an icon) on a busy tag could report the wrong currency even when an actual, legible price marker (e.g. "$") sat right next to the number. Currency is now derived from whichever pattern actually matched the price; a whole-document scan is still used as a last resort, but only for standalone 3-letter ISO codes, which are far less prone to false-positive hallucination than a lone symbol character.
- **Brand recognition — closed-vocabulary, text-only (no ML model):** `src/utils/brands.js` holds a curated list of 244 brand names mapped to one or more of this app's categories (`BRAND_CATEGORIES`). OCR only ever returns a brand name that's an exact (accent- and punctuation-insensitive) match against this list — never a heuristic guess. This replaced an earlier on-device logo-matching feature (TensorFlow.js + MobileNet, ~17MB of bundled model/image assets) that was removed after real-world testing showed it confidently misidentifying brands more often than not; trading recall for precision was a deliberate choice — a brand that isn't in the list yet won't be picked up, but nothing gets invented.
- **Category guessing:** keyword matching (`src/utils/categorize.js`) is word-boundary anchored, not a plain substring search — an earlier version matched "tee" (Clothing's Tops keyword) inside "Estée" (Estée Lauder, OCR'd without its accent), silently mis-categorizing recognized brands. When no keyword matches at all but a brand was recognized, category falls back to that brand's own mapping in `BRAND_CATEGORIES` — but only when it maps to exactly one category; a brand spanning several (e.g. Adidas: shoes and clothing) is genuinely ambiguous and is left for the user to pick. If neither a keyword nor an unambiguous brand mapping produces a category, category is left as a genuine unknown internally (distinct from the form's own default dropdown value) so downstream logic like the description auto-fill below doesn't mistake "nothing detected" for "Clothing detected."
- **Cloud-assisted scanning (the one non-local path):** when local OCR leaves brand *or* price blank, the app calls a Vercel serverless function (`api/scan-tag.js`), which sends the *same* ~1600px/0.9 copy local OCR already used (previously a separately-downscaled 768px copy — raised because cloud only ever runs on tags local OCR already struggled with, so handing it a blurrier image than local got was working against itself) to Gemini (`gemini-flash-latest`) and asks it to return brand, price, currency, category, and subcategory as JSON, constrained to this app's actual category/subcategory/currency enums. The response only ever fills in fields the local pass left blank — it never overrides an already-found local result. Currency responses are normalized from common symbol forms (e.g. "HK$", "¥", "RMB") to their ISO code before validation, rather than discarded outright when they don't exactly match the enum. The function is rate-limited per IP (10 calls/min) and payload-capped (4MB, raised alongside the image-size increase), since the app has no login. Usage is tracked via Upstash Redis and readable at a separate, un-linked `/api/usage` endpoint (not surfaced in the app UI). The Gemini API key lives only in a server-side environment variable, never in client code.
- **Live currency conversion:** [open.er-api.com](https://open.er-api.com) — free, no API key, covers all 14 supported currencies including TWD (which ruled out the ECB/Frankfurter alternative). Currency is also auto-detected from the tag's own text (symbol or printed code) during OCR, not just manually selected.
- **Deployment:** Vercel, connected to GitHub (`ddeenn-11/dealnuts`), auto-deploys on push to `main`

---

## 3. Key Features (Computational Thinking — How does it all fit together?)

### Shipped

**A. Add Entry (capture flow)**
- Auto-capture GPS coordinates on load (permission asked once)
- **Location** resolves in priority order: (1) the nearest named shopping landmark — mall, department store, market — within 300m, via OpenStreetMap's Overpass API, since that's what's actually useful while shopping and a raw reverse-geocode of the exact point tends to return an unclear street or unnamed-building result; (2) falling back to a plain address lookup (OpenStreetMap Nominatim) if nothing notable is nearby. Always stays editable — GPS/geocoding is frequently wrong or unavailable indoors, which is exactly where this app gets used most.
- Optional **Store #** field next to Location, for mall unit numbers
- Auto-capture date/time on creation — permanent, never editable
- **Two explicit photo buttons** — "Take Photo" and "Choose from Library"
- **On-device OCR auto-scan** runs the moment a photo is attached: extracts price, currency, size, color, quantity (weight/volume), category/subcategory, and brand (matched against the curated 244-brand list only — see Tech Stack). Every field it fills stays editable and is only prefilled if the user hasn't already typed something there.
- **Cloud-assisted scanning** escalates automatically (no user action) when local OCR leaves brand or price blank — see Tech Stack for how.
- **Scan status is a visible spinner overlaid on the photo**, not just a text line — with phase-specific copy ("Reading tag…" while local OCR runs, "Double-checking price & brand…" during a cloud escalation) so a slow scan doesn't read as a frozen screen.
- **Description auto-fill** applies one of two hint shapes depending on the entry's category, and only when a category was genuinely detected (by OCR or an explicit user choice) — not when the field is merely sitting at its untouched default:
  - **Color/Size** for Clothing, Shoes, Luxury, or Bags & Luggage
  - **Quantity** (weight/volume — ml, cl, dl, l, fl oz, pt, gal, mg, g, kg, oz, lb) for Beauty or Groceries
- **Taking or importing a new photo clears the previous scan's fields** (brand, price, currency, category, subcategory, description) so an unsaved previous find can't bleed into the next one. Location and Store # are deliberately *not* cleared — they're not scan output, and stay correct for the next item found at the same place.
- Manual fields: Brand, Category (12 top-level) + Subcategory (per-category list), Price + Currency (14 ISO codes, default HKD), Description (free text)
- Save entry locally (IndexedDB); saving also fully resets the form (this time including Location/Store #, since a save means the current shopping context is "done")

**B. Browse / "Finds" screen**
- List of all saved entries, grouped and sorted newest-first within each group
- Every card renders identically sized regardless of content, showing the whole (uncropped) photo — letterboxed rather than cropped, so nothing important gets cut off
- **Auto-grouping by Category + Subcategory**. Groups are ordered by taxonomy order, not by group size. Missing subcategory falls back to a category-only group.
- **Manual grouping** — user-created named groups ("My groups" tab), independent of auto-grouping
- **Tap-to-select is always on** — no separate "Select mode" toggle.
  - **Edit** button (enabled only when exactly one item is checked) opens that item's detail/edit view
  - **Delete** button (enabled when one or more checked) bulk-deletes after one confirmation
  - Selecting 2+ shows a floating **"Compare N finds"** button — the only way to start a comparison
- Search across brand, category, subcategory, location, store #, and description
- **Export** — downloads all entries + photos as a single JSON backup file (the safety net for local-only storage — see §6)

**C. Compare**
- Selection happens exclusively in Finds
- Opening the Compare tab directly shows your **last comparison**, persisted in `localStorage`
- **"Clear all"** button, top-right, above the currency selector
- **Currency conversion**: pick one currency to compare everything in (default HKD); live rates fetched from open.er-api.com, with the applied rate(s) and fetch timestamp shown above the table. Falls back to original (unconverted) prices if the rate fetch fails.
- Table fits exactly 2 entries on a phone screen with no horizontal scroll; 3+ entries reverts to a scrollable wide table
- Rows: Price (converted), Category·Subcategory, Location, Store #, Map link, Description, Logged date/time

**D. Item Detail View**
- Full-size photo, all recorded fields, a map link if coordinates were captured, and the immutable logged timestamp
- Edit or delete the entry

**E. Data Safety Net**
- **Export to JSON** — the primary backup mechanism (see §6)
- Copyright footer shown on every screen

### Not built (future)

- Multiple photos per entry
- Price history tracking (same item seen again, at a different store or time)
- Cloud account + login for cross-device sync — deliberately out of scope; local-only is the model
- Aggregate map view of all shopping-trip pins (currently only a per-entry "View map" link)
- Share a comparison or group with someone else
- Sort by distance from current location
- Brand picker/autocomplete UI backed by `BRAND_CATEGORIES` (data exists, no UI built yet — see §7)
- A hard spending cap on cloud-assisted scanning (usage is tracked, but no ceiling enforced yet)

---

## 4. Data Model (as built)

```
Entry {
  id: string
  photo: blob | null
  latitude: number | null
  longitude: number | null
  storeName: string        // "Location" in the UI — landmark or address, editable
  storeNumber: string       // optional — mall unit/store number
  brand: string
  category: string          // one of 12 top-level taxonomy values (see below)
  subcategory: string        // optional — from that category's subcategory list
  price: number | null
  currency: string           // one of 14 ISO codes; default "HKD"
  description: string        // free text; OCR may prefill "Color: X, Size Y" (Clothing/Shoes/Luxury/Bags) or "Qty: X" (Beauty/Groceries)
  dateAdded: timestamp        // auto-set on creation, immutable
}

Group {
  id: string
  name: string
  isAutoGenerated: boolean
  entryIds: string[]
}
```

**Category taxonomy** (`src/utils/grouping.js`) — 12 top-level categories:

| Category | Subcategories |
|---|---|
| Clothing | Tops, Bottoms, Outerwear, Dresses, Activewear, Other clothing |
| Shoes | Sneakers, Boots, Heels, Sandals, Flats, Other shoes |
| Bags & Luggage | Handbags, Backpacks, Totes, Wallets & small goods, Luggage, Other bags |
| Accessories | Jewelry, Belts, Hats, Scarves, Sunglasses, Other accessories |
| Luxury | *(none)* |
| Home | Furniture, Kitchen & dining, Decor, Bedding & bath, Storage & organization, Other home |
| Beauty | Skincare, Makeup, Haircare, Fragrance, Tools & accessories, Other beauty |
| Outdoors | Camping & hiking, Sportswear, Cycling, Water sports, Equipment, Other outdoors |
| Electronics | Audio, Wearables, Watches, Phones & tablets, Computers & accessories, Cameras, Other electronics |
| Kids | Clothing, Toys, Feeding, Gear, Other kids |
| Groceries | Food & Beverage, Household & cleaning, Personal care, Health & wellness, Other groceries |
| Other | *(none)* |

**Currencies** (`src/utils/currency.js`): HKD (default), JPY, KRW, CNY, TWD, THB, SGD, USD, EUR, CAD, GBP, AUD, NZD, CHF.

**Brand reference data** (`src/utils/brands.js`): 244 brand names, each mapped to one or more category values above (`BRAND_CATEGORIES`). Category-only by design — deliberately no subcategory linkage, to avoid an excessive number of brand↔taxonomy associations to maintain. Not yet wired into any picker UI (see §7), but now serves two purposes internally: OCR's closed-vocabulary brand matcher, and a category-guessing fallback when keyword matching finds nothing and the matched brand maps to exactly one category.

---

## 5. UX Notes (Procedural Thinking — How do we make it genuinely good, not just functional?)

- **Speed matters.** Camera-first capture, OCR prefill to cut typing, save in as few taps as possible.
- **Location capture is silent and automatic**, but never loses the ability to be corrected.
- **Camera opens directly** on "Take Photo"; "Choose from Library" is a separate, explicit action.
- **Auto-grouping is forgiving** — missing subcategory falls back to category-only.
- **Selection is a single, consistent gesture** (tap = select) reused for edit, delete, and compare.
- **OCR/cloud hints never overwrite user input**, and never override each other either — local wins when both find something; cloud only fills what local left blank.
- **Scanning never looks frozen.** Local OCR results land in the form the moment they're ready, rather than waiting on a possible cloud round-trip too — and the scan indicator itself is an animated overlay with phase-specific text, not a static line easy to miss.
- **A wrong brand guess never happens silently** — the brand matcher would rather return nothing than something invented, on both the local and cloud paths.
- **Comparison currency defaults to HKD** but is a one-tap change; the rate actually used is always shown.
- **Starting a new photo means starting a new find** — whatever the previous unsaved scan filled in gets cleared, so results from two different items can never merge into one entry by accident.

---

## 6. Data Safety Net — Assumptions & Real Risk

<assumption>Local-only storage (IndexedDB) means data is tied to one device/browser. Closing the app, restarting the phone, etc. does not lose data — but a few things genuinely can:</assumption>

- Manually clearing browser/site data, or using Private/Incognito mode
- **iOS Safari's 7-day script-writable-storage eviction** — if the site isn't visited for 7 days, Safari can silently wipe IndexedDB. **Mitigation:** "Add to Home Screen" exempts a site from this eviction policy; the in-app **Export** button is the fallback backup for anyone who doesn't do that.
- Switching phones or reinstalling the browser (data doesn't transfer — there's no account/sync)

**Privacy note (updated):** photos no longer *always* stay on-device. When local OCR can't find a brand or price, a copy of the photo (the same ~1600px/0.9 resolution local OCR itself used, not a separately smaller one) is sent to Gemini via the app's own serverless relay for that one scan. This isn't currently surfaced to the user beyond the scan status overlay's "Double-checking price & brand…" text — see open question below.

---

## 7. Assumptions & Open Questions

<assumption>Category taxonomy is a fixed two-level list (12 categories, each with 0–7 subcategories) rather than an open/user-extensible taxonomy, to keep auto-grouping consistent.</assumption>

<assumption>Multi-currency support (14 currencies, live conversion, auto-detection from tag text) was originally out of scope for the MVP but was added after real usage — international/cross-border shopping comparisons turned out to matter.</assumption>

- **The cloud escalation's privacy tradeoff isn't surfaced to the user.** The app used to be able to honestly say "no photo ever leaves the device"; that's no longer true whenever brand/price aren't found locally (in practice, a large fraction of scans, since brand matching is deliberately conservative). Worth deciding whether this needs any user-facing disclosure beyond the scan overlay's phase text.
- **No hard cap on cloud-scan spend yet** — usage is tracked (`/api/usage`) but nothing stops calls once a threshold is hit. Deferred intentionally until real usage volume is observed.
- **Landmark search (300m radius, mall/department-store/marketplace tags) is tuned from a handful of manual test coordinates in Hong Kong**, not systematically validated — likely to perform worse in areas with sparser OpenStreetMap tagging (suburban/rural), where it should still gracefully fall back to the address-based lookup.
- **`BRAND_CATEGORIES` (244 brands) has no UI yet.** Built for a future brand picker/autocomplete on the Brand field; whatever UI gets built on top of it must still allow free-text entry for brands not in the list, since no curated list this size will ever be complete.
- Should the OCR-guessed category/subcategory and any cloud-sourced fields ever be shown to the user as "confidence" hints (vs. silently prefilling)?
- Should there be a limit or archive/cleanup mechanism for old entries? — Still open; not built.

---

## 8. Changelog (high-level, since the original MVP draft)

1. Two-button photo capture (camera vs. library) replacing camera-only
2. On-device OCR auto-scan (Tesseract.js) for brand/price/size, later extended to category/subcategory keyword matching and color detection
3. Category taxonomy expanded from 6 flat categories to 12 categories with subcategories
4. "Store" renamed to "Location" (GPS-editable) + new optional "Store #" field
5. Price gained a currency field (14 currencies, default HKD)
6. Compare screen gained live currency conversion, rate/timestamp display, a persistent "last comparison," and a "Clear all" action
7. Compare's own item picker removed — selection now happens only in Finds
8. Compare table redesigned to fit 2 items without horizontal scroll
9. Finds screen: bulk delete, then a full selection-model redesign (always-on tap-to-select)
10. Auto-grouping changed from Category+Brand to Category+Subcategory
11. Finds cards redesigned to a fixed, uniform layout
12. Copyright footer added app-wide
13. Deployed to Vercel, connected to GitHub for auto-deploy on push
14. On-device brand-logo matching via TensorFlow.js/MobileNet added, then made color-invariant (Sobel outline preprocessing) — **later removed, see #18**
15. Fixed OCR brand-detection regex rejecting brand names ending in digits; fixed dominant-color detection missing gray/silver items
16. Finds/Compare thumbnails switched to show the whole photo (letterboxed) instead of cropping it; stored-photo compression reduced (1024px/0.7)
17. **Removed on-device logo matching entirely** (~17MB of bundled model/image assets) after real-world testing showed it confidently misidentifying brands more often than not
18. Brand recognition rebuilt as closed-vocabulary text matching against a new curated list (`brands.js`, 244 brands mapped to category); a curated `BRAND_CATEGORIES` reference replaces the old logo image library
19. Category taxonomy reworked: added Luxury and Groceries, renamed Babies → Kids, restored Bags as "Bags & Luggage", added Watches under Electronics, removed Food and Entertainment as top-level categories
20. Currency auto-detected from tag text (symbol or code); price extraction broadened to whole-number amounts and both code-before/after-amount orderings
21. OCR gained a second recognition pass (different page-segmentation mode) for when the first leaves color/size blank, plus its own higher-resolution capture pass separate from the stored photo
22. **Added cloud-assisted scanning**: escalates to Gemini via a new serverless function when local OCR leaves brand or price blank — the app's first non-fully-client-only feature. Rate-limited, payload-capped, and usage-tracked (Upstash Redis)
23. Location now prefers the nearest named shopping landmark (via OpenStreetMap Overpass) over a plain street/address lookup
24. Form now resets scan-derived fields when a new photo is taken (not just after Save), and description auto-fill is gated to categories where color/size are meaningful (Clothing, Shoes, Luxury, Bags & Luggage)
25. Scan speed: OCR worker preloaded on screen mount instead of cold-starting on the first photo; stored/OCR image compression now run in parallel instead of serially; local OCR results apply to the form immediately instead of waiting on a possible cloud round-trip too
26. Scan status changed from a static "Scanning…" text line to an animated spinner overlaid on the photo, with phase-specific text ("Reading tag…" / "Double-checking price & brand…")
27. Description auto-fill gained a Quantity hint (weight/volume — ml, cl, dl, l, fl oz, pt, gal, mg, g, kg, oz, lb) for Beauty and Groceries, alongside the existing Color/Size hint for Clothing/Shoes/Luxury/Bags
28. Fixed category-keyword matching to require word boundaries instead of plain substrings (was matching "tee" inside "Estée", mis-categorizing recognized brands as Clothing); added a fallback to a recognized brand's own `BRAND_CATEGORIES` mapping when no keyword matches and that mapping is unambiguous
29. Cloud-assisted scanning raised from a separately-downscaled 768px image to the same ~1600px/0.9 copy local OCR already uses (and dropped the now-redundant extra downscale step entirely), since cloud only ever runs on tags local OCR already struggled with
30. Cloud currency responses normalized from common symbol forms ("HK$", "¥", "RMB", etc.) to their ISO code instead of being discarded when they don't exactly match the enum
31. Currency detection reworked to read off the same match that found the price, instead of an independent whole-document symbol scan — closes a bug where a single OCR-hallucinated stray symbol elsewhere on a busy tag could report the wrong currency despite a legible, correct price marker being present
32. Fixed a bug where an entry OCR couldn't categorize at all (no keyword match, no unambiguous brand) had its description auto-filled with bogus Color/Size text, because the form's own untouched default category value was being mistaken for a real detection
