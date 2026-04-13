

## Fix: Checkout 3DS validation error

### Root cause
In `supabase/functions/create-checkout/index.ts` line 211, `request_three_d_secure` is set to `'always'`, which is not a valid value for the current Stripe API version. Valid values are: `any`, `challenge`, or `automatic`.

### Change
- **File**: `supabase/functions/create-checkout/index.ts`
- **Line 211**: Change `request_three_d_secure: 'always'` to `request_three_d_secure: 'any'`
  - `'any'` is the closest equivalent to the old `'always'` — it requests 3DS whenever possible, which maintains the same fraud protection behavior

### Technical details
- The Stripe API version `2025-08-27.basil` renamed the accepted values for this parameter
- `'any'` = request 3DS on all transactions where the card supports it (same intent as the old `'always'`)
- No other files need changes; this is a single-line fix
- The edge function will be automatically redeployed

