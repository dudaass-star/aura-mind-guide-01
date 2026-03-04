

# Update admin-send-message with per-user WhatsApp instance routing

## Problem
`admin-send-message` calls `sendTextMessage(cleanPhone, message)` without passing instance config, so it always uses the global env var credentials. This means messages may come from the wrong WhatsApp number for users assigned to different instances.

## Solution
Import `getInstanceConfigForUser` from `instance-helper.ts` (same pattern as `send-zapi-message`) and pass the resolved config to `sendTextMessage`.

## Changes (single file)

**`supabase/functions/admin-send-message/index.ts`**:

1. Add import: `getInstanceConfigForUser` from `../_shared/instance-helper.ts`
2. Move Supabase client creation earlier (before sending), so it's available for instance lookup
3. When `user_id` is provided, call `getInstanceConfigForUser(supabase, user_id)` to get instance-specific Z-API credentials
4. Pass the resolved `zapiConfig` as the third argument to `sendTextMessage(cleanPhone, message, undefined, zapiConfig)`
5. When no `user_id`, fall back to default env var credentials (current behavior)

No database changes needed. No new dependencies.

