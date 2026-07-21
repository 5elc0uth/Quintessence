# Quintessence Commercial Upgrade Change Summary

## Public storefront

- Added `commercial.css` as a mobile-first override layer loaded after the original stylesheet.
- Preserved the desktop hero at 82 vh with a 720 px maximum while introducing phone and tablet-specific layouts.
- Converted the catalogue from a horizontal product strip to a standard responsive grid.
- Added live category counts to storefront filters.
- Added product category labels, keyboard-operable product cards, lazy images, and safer HTML rendering.
- Added a WhatsApp action to the mobile menu for small devices where the navbar order button is hidden.
- Added safe-area, touch-target, focus-visible, reduced-motion, landscape, modal, cart, and footer refinements.

## Admin

- Added **Add Multiple** beside the existing **Add Product** action.
- Added a shared-category batch form supporting up to 25 independent products.
- Added per-item name, price, description, image, best-seller, and stock controls.
- Added validation for image type and 8 MB size limit.
- Added cleanup of uploaded images when the database insert fails.
- Added category inventory count chips.
- Converted mobile admin tables to readable card layouts.
- Fixed editing of custom categories that are not in the predefined category dropdown.

## Data and security-related hardening

- Added a migration that removes accidental category-only uniqueness rules.
- Added catalogue indexes for category, visibility, creation date, and best sellers.
- Escaped product values before inserting them into storefront/admin HTML templates.
- Removed a dead JavaScript block that created an unused admin overlay.

## Operational files

- Added full implementation guidance.
- Added a release smoke-test checklist.
- Added guarded PowerShell apply, verify, and rollback scripts.
- Added baseline and payload SHA256 validation.
- Added automatic timestamped backups and rollback on failed application.
