import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_PUBLISHABLE_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("session-extractor rejects request without session_id", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/session-extractor`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({}),
  });
  const body = await res.json();
  assertEquals(res.status, 400);
  assert(typeof body.error === "string");
});

Deno.test("session-extractor returns 404 for unknown session", async () => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/session-extractor`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ session_id: "00000000-0000-0000-0000-000000000000" }),
  });
  const body = await res.json();
  assertEquals(res.status, 404);
  assertEquals(body.error, "session not found");
});