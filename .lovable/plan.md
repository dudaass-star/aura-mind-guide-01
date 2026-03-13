

# Fix: AI Model selector showing blank

## Problem

The "Modelo ativo" label and/or the Select trigger for the AI model is showing blank, even though the database has the correct value (`google/gemini-2.5-flash`).

## Root Cause

The value is stored in a JSONB column using `JSON.stringify()`, which wraps it in extra quotes. The current parsing logic on line 58 may not consistently strip these, causing a mismatch with the `AI_MODELS` array values.

## Fix — `src/pages/AdminSettings.tsx`

1. **Improve value parsing** in `loadConfig()` — use `JSON.parse()` instead of the fragile string replace approach:
   ```typescript
   for (const row of data || []) {
     let val: string;
     try {
       val = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
     } catch {
       val = String(row.value).replace(/"/g, '');
     }
     // ... set state
   }
   ```

2. **Add fallback display** for "Modelo ativo" — show the raw value if no matching model is found in the array:
   ```typescript
   AI_MODELS.find(m => m.value === currentModel)?.label || currentModel
   ```

3. **Add placeholder** to `<SelectValue>` for both selectors to prevent blank state.

## Files changed

| File | Change |
|------|--------|
| `src/pages/AdminSettings.tsx` | Fix value parsing + fallback label display |

