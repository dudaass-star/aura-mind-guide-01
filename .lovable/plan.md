

## Changes to Pricing.tsx

**Remove the fire emoji** from the "40% off" badge in the billing period toggle and make the discount more visually prominent while keeping the site's clean, sage-toned aesthetic.

### Specific edits:

1. **Toggle badge (lines 145-150)**: Replace `🔥 40% off` with `40% off` and make the badge more prominent — use a slightly larger size, bolder font, and the sage/primary color scheme. When the "Anual" button is not selected, use a more eye-catching style (e.g., `bg-primary text-primary-foreground` as a small pill) so the discount draws attention even before clicking.

2. **Discount badges on cards (lines ~170-175)**: Check if there's a fire emoji on the yearly discount badges on individual plan cards — remove if present and keep the clean `-40%` style already there.

No other files need changes.

