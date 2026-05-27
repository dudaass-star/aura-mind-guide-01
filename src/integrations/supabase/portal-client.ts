// Cliente Supabase exclusivo do /meu-espaco.
// Mantém a sessão do portal isolada da sessão de /admin
// (cada um grava em uma storageKey diferente do localStorage).
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabasePortal = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      storageKey: "aura-portal-auth",
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);