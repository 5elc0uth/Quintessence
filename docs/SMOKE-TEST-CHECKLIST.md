# Quintessence Release Smoke-Test Checklist

## Public storefront

- [ ] Page loads over HTTPS without JavaScript errors.
- [ ] Hero first image and text appear on 390 × 844 mobile viewport.
- [ ] Mobile menu opens, closes, and exposes the WhatsApp order action.
- [ ] Cart button remains visible and usable.
- [ ] Products render as two columns on a normal phone.
- [ ] Products render as three columns on a tablet.
- [ ] Products render as four columns on desktop.
- [ ] Category filters show correct counts.
- [ ] Search matches product name, description, and category.
- [ ] Product card opens the product detail modal with keyboard Enter/Space.
- [ ] Out-of-stock products show the correct state.
- [ ] Add-to-cart and checkout-to-WhatsApp work.
- [ ] Best sellers, reviews, newsletter, and footer remain readable.

## Admin

- [ ] `#admin` opens the login screen.
- [ ] Admin authentication succeeds.
- [ ] Product table is a standard table on desktop.
- [ ] Product table becomes readable cards on mobile.
- [ ] Category summary chips show correct product counts.
- [ ] Single-product creation still works.
- [ ] Editing a custom category retains the custom category value.
- [ ] **Add Multiple** opens with two rows.
- [ ] Rows can be added and removed.
- [ ] Two products can be saved into the same category.
- [ ] Each saved product can be edited independently.
- [ ] Bulk image type and 8 MB size checks work.
- [ ] A failed bulk insert does not leave newly uploaded images behind.

## Database verification

- [ ] The included migration completes successfully.
- [ ] The migration verification query returns two temporary rows in the same category.
- [ ] Temporary verification rows are rolled back.
- [ ] RLS prevents anonymous writes to `products`.
- [ ] Authenticated admin writes succeed.
