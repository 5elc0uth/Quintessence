# Quintessence Commercial Storefront

A mobile-first fragrance and personal-care storefront built with HTML, CSS, vanilla JavaScript, and Supabase.

## Commercial upgrade highlights

- Standard responsive catalogue: 2 columns on normal phones, 3 on tablets, and 4 on desktop.
- Desktop hero proportions and visual identity retained.
- Touch-friendly navigation, filters, cards, modals, cart, and admin controls.
- Accessible keyboard interaction and focus states.
- Dynamic category filters with live product counts.
- Admin **Add Multiple** workflow for inserting several independent products into one category in a single operation.
- Per-item bulk fields: name, price, description, image, best-seller flag, and stock status.
- Failed bulk saves clean up newly uploaded images to avoid orphaned storage files.
- Custom product categories continue to work when editing existing products.
- Mobile admin tables render as readable cards instead of compressed desktop tables.

## Files

- `index.html` — storefront and admin markup.
- `style.css` — original Quintessence visual system.
- `commercial.css` — mobile-first commercial override layer.
- `script.js` — storefront, cart, Supabase, and admin behaviour.
- `database/20260721_allow_multiple_products_per_category.sql` — safe catalogue migration and category indexing.
- `docs/COMMERCIAL-MOBILE-UPGRADE.md` — implementation and operation guide.
- `docs/SMOKE-TEST-CHECKLIST.md` — release validation checklist.
- `patches/` — guarded PowerShell apply, verify, and rollback scripts.

## Local preview

From the project folder:

```powershell
python -m http.server 8080
```

Then browse to `http://localhost:8080`.

Do not rely on opening `index.html` directly with `file://`; browser storage, modules, media, and Supabase requests behave more reliably through a local web server.

## Supabase

1. Review and run `database/20260721_allow_multiple_products_per_category.sql` in the Supabase SQL editor.
2. Confirm the public `products` and `videos` storage buckets exist.
3. Confirm Row Level Security permits public reads and authenticated admin writes.
4. Create the admin user in Supabase Authentication.

## Admin access

Open the site with `#admin`, for example:

```text
https://your-domain.example/#admin
```

In **Products**:

- **Add Product** creates or edits one item with the image cropper and optional video.
- **Add Multiple** selects one category and inserts up to 25 separate items together.

Every bulk-created item is still stored as its own `products` table row and can be edited, hidden, restocked, or deleted independently.

## Deployment

The application is static and can be deployed to Azure Static Web Apps, Netlify, Vercel, GitHub Pages, Cloudflare Pages, or any HTTPS web host. Configure the host so `index.html`, CSS, JavaScript, images, and videos are served with their correct MIME types.
