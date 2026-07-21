# Quintessence Commercial Mobile Upgrade

## Design intent

The upgrade uses a mobile-first override layer rather than rewriting the original visual stylesheet. This keeps the established Quintessence desktop identity and measurements while correcting layout behaviour from 320 px phones through tablets and large desktops.

## Responsive catalogue

The public product catalogue now uses a standard CSS grid:

| Viewport | Product columns |
|---|---:|
| Below 360 px | 1 |
| 360–639 px | 2 |
| 640–899 px | 3 |
| 900 px and above | 4 |

Category filters remain horizontally scrollable on small screens and become centred, wrapped controls on desktop. Each filter displays the number of visible products in that category.

## Hero behaviour

- Phones use a bottom-aligned content card with full-width actions.
- Tablets allow two hero actions side by side.
- Desktop returns to the existing 82 vh / 720 px maximum hero measurement and centred message card.
- Low-height landscape devices receive a compact variation.
- Safe-area insets are respected on notched devices.

## Admin: multiple products in one category

The Products tab contains two actions:

1. **Add Product** — the detailed single-item form with cropping and optional product video.
2. **Add Multiple** — a category-level batch form.

Bulk workflow:

1. Select a predefined category or enter a custom category.
2. Enter two or more product rows.
3. Add or remove rows as required, up to 25 items.
4. Optionally select a JPG, PNG, or WebP image for each item, up to 8 MB.
5. Save all products.

The browser uploads item images first, then performs one Supabase insert containing all product records. If the insert fails, the newly uploaded images are removed from storage where possible.

## Database behaviour

A category must not be unique. Each product is an independent row and many rows may contain the same category value. Run the included SQL migration to remove any accidental category-only unique constraint or index and to add non-unique catalogue indexes.

## Security notes

- Supabase anonymous keys are designed to be public; security depends on Row Level Security policies.
- Public users should have `SELECT` access to storefront content only.
- Product inserts, updates, and deletes must require an authenticated user.
- Storage write policies must require authentication.
- Never place the Supabase service-role key in browser JavaScript.

## Release method

Use `patches/Apply-QuintessenceCommercialUpgrade.ps1` for an existing matching source folder. The script:

- checks the original file hashes;
- refuses to overwrite an unexpected source unless `-Force` is explicitly supplied;
- creates a timestamped backup;
- copies files atomically;
- runs the verifier;
- writes an application manifest for rollback.

For a clean deployment, use the complete upgraded project archive instead.
