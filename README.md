# BuyRight

A mobile-first web app for logging products you see while browsing physical
stores — photo, location, brand, price, and notes — so you can compare your
finds later and decide where to actually buy.

Everything is stored locally in your browser (IndexedDB). No account, no
server, no cloud sync in this version — see "What's next" below.

## Run it locally

```bash
npm install
npm run dev
```

This opens a local dev server. **Camera and location will not work over
plain `http://localhost` on some setups, and will not work at all if you
open the dev server's network URL from your phone** — mobile browsers
require a secure (HTTPS) connection for those APIs. Use the deploy steps
below to test the full experience on your phone.

## Deploy for free (needed to test camera + location on your phone)

### Option A — Vercel (recommended)

1. Push this folder to a new GitHub repository.
2. Go to [vercel.com](https://vercel.com), sign in with GitHub, and import
   the repository.
3. Vercel auto-detects Vite — just click **Deploy**.
4. Open the `https://your-project.vercel.app` URL it gives you, on your
   phone. Camera and location prompts should work correctly there.

### Option B — Netlify (no GitHub required)

1. Run `npm run build` locally. This creates a `dist/` folder.
2. Go to [app.netlify.com/drop](https://app.netlify.com/drop) and drag the
   `dist/` folder onto the page.
3. Netlify gives you an instant HTTPS URL — open it on your phone.

### Option C — StackBlitz (fastest, no deploy step)

1. Go to [stackblitz.com](https://stackblitz.com), start a new Vite + React
   project, and paste in the files from this project.
2. StackBlitz gives you a live HTTPS preview URL immediately — good for
   quick iteration before you bother with a full deploy.

## Project structure

```
src/
  db.js              IndexedDB storage (entries + manual groups + export)
  utils/
    geolocation.js    GPS capture + free reverse geocoding (OpenStreetMap)
    image.js          Client-side photo resize/compression before saving
    grouping.js        Auto-grouping (category + brand) + formatting helpers
  components/
    TabBar.jsx          Bottom navigation
    EntryCard.jsx        The reusable "price tag" card used throughout
  screens/
    AddEntry.jsx        Log screen: camera, location, manual fields
    Browse.jsx           Finds screen: list, groups, search, export
    Compare.jsx           Side-by-side comparison table
    ItemDetail.jsx        Full record, edit, delete
  App.jsx               Screen routing + shared state
```

## Notes

- Photos are resized client-side (max ~1280px) before being stored, to keep
  IndexedDB usage reasonable over many entries.
- The date/time on each entry is captured automatically and can't be edited
  — it's meant to stay a reliable record of when you actually saw the item.
- Reverse geocoding (turning GPS coordinates into a store name) uses the
  free OpenStreetMap Nominatim API on a best-effort basis. If it doesn't
  resolve a name, you can just type the store name in yourself.
- Data lives only in your browser. Use the **Export** button on the Finds
  screen periodically to download a JSON backup — clearing your browser
  data or switching devices will otherwise lose everything.

## What's next (not built yet)

From the PRD's Milestone 2: OCR text extraction from tag photos, multiple
photos per entry, price history tracking, cloud sync across devices, a map
view of all your stops, and sharing a comparison with someone else.
