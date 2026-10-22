# Receipt Snap

Photograph or upload a receipt and the expense sheet fills itself in: date, shop, amount and category.

▶ **[Open it live](https://naweenkavinda.github.io/receipt-snap/)**. Works on phones, tablets and computers. Install it with **Add to Home Screen** to use it like an app.

## What it does

- Take a photo of a receipt or upload one, and the text is read right in your browser
- Picks out the date, shop name, total (skipping subtotal, cash and change lines), currency and a category
- Lets you check and edit every field before saving, or add an expense without a photo
- Keeps an expense sheet with a month filter and per-currency totals
- Exports to CSV for Excel or Google Sheets, plus a JSON backup you can import again
- Works offline after the first scan, with light and dark themes and smooth page and button animations

## Notes and limits

- Everything stays on your device. Photos are never uploaded and there are no accounts or servers.
- The free on-device reader handles clear printed receipts well. Faded thermal paper or crumpled receipts may need a few fixes before saving.
- Expenses live in this browser only, so export a backup before clearing browser data or switching phones.

## Tech

- Tesseract.js 5 for on-device text recognition (OCR), loaded from jsDelivr on first scan
- Vanilla HTML, CSS and JavaScript, no frameworks or build step
- IndexedDB for storage, a service worker for offline use, installable PWA
- Receipt parser tuned for Sri Lankan receipts (LKR, DD/MM dates) that also handles USD, EUR, GBP, INR, AUD, SGD and AED, with a browser test page in `tests/`

---

Part of my portfolio: [naweenkavinda.github.io/portfolio](https://naweenkavinda.github.io/portfolio/)
