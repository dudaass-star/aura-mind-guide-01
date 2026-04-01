

# Fix: Outbound WhatsApp messages not being delivered via Twilio

## Root Cause

Two issues preventing message delivery:

1. **`getFromNumber()` has no normalization** — If `TWILIO_WHATSAPP_FROM` is stored as `whatsapp:+12604684990` (which you confirmed), the `whatsapp:+` prefix is already there. But the function just returns it raw. This is likely fine, but fragile — any variation in how it was stored could break things.

2. **`admin-send-message` uses `sendMessage()` which calls `sendFreeText()`** — Free text only works inside the 24h window. Since Eduardo hasn't messaged Aura recently via the Twilio number, the window is closed and Twilio silently drops the message. It should use `sendProactive()` which falls back to templates when outside the window.

## Changes

### 1. Normalize `getFromNumber()` in `whatsapp-official.ts`
Make it robust regardless of how the secret was stored:
```typescript
function getFromNumber(): string {
  const raw = Deno.env.get('TWILIO_WHATSAPP_FROM');
  if (!raw) throw new Error('TWILIO_WHATSAPP_FROM is not configured');
  // Already has whatsapp: prefix
  if (raw.startsWith('whatsapp:')) return raw;
  // Just digits or +digits — normalize
  const digits = raw.replace(/\D/g, '');
  return `whatsapp:+${digits}`;
}
```

### 2. Update `admin-send-message` to use `sendProactive()`
Replace `sendMessage` with `sendProactive` so it automatically uses templates when outside the 24h window:
```typescript
import { sendProactive } from "../_shared/whatsapp-provider.ts";
// ...
const result = await sendProactive(cleanPhone, message, 'checkin', user_id);
```
Also improve error handling to surface the actual provider error in the response.

### 3. Add detailed logging to `sendFreeText()`
Log the full request params (From, To) before sending so failures can be diagnosed from logs.

## Expected Result
- `From` number always correctly formatted regardless of secret format
- Admin messages use templates when outside 24h window
- Clearer error messages when delivery fails

