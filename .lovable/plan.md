

# Admin WhatsApp Templates Page

New page at `/admin/templates` to manage the `whatsapp_templates` table.

## Features
- Table listing all 7 templates with columns: Category, Template Name, Content SID, Meta Category, Status (active/inactive)
- Inline edit Content SID via click-to-edit input
- Toggle `is_active` via Switch component
- Visual indicator: "PENDING_APPROVAL" SIDs shown in red badge
- Back button to admin navigation (same pattern as other admin pages)

## Implementation

### 1. Create `src/pages/AdminTemplates.tsx`
- Follow same auth pattern as `AdminInstances.tsx` (useAdminAuth + redirectIfNotAdmin)
- Fetch from `supabase.from('whatsapp_templates').select('*').order('category')`
- For editing Content SID: click cell → show Input, save on blur/Enter via edge function or direct update
- For toggling active: Switch component, update via edge function
- Since RLS only allows SELECT for admins, updates need a small edge function

### 2. Create `supabase/functions/admin-update-template/index.ts`
- Accepts `{ id, twilio_content_sid?, is_active? }`
- Validates admin auth via JWT
- Updates `whatsapp_templates` row using service role client
- Returns updated row

### 3. Add route in `App.tsx`
- `<Route path="/admin/templates" element={<AdminTemplates />} />`
- Import `AdminTemplates` component

### 4. Add navigation link
- Add "Templates" link in existing admin pages' back/nav area (consistent with other admin pages)

## Files
| File | Action |
|---|---|
| `src/pages/AdminTemplates.tsx` | Create |
| `supabase/functions/admin-update-template/index.ts` | Create |
| `src/App.tsx` | Add route |

