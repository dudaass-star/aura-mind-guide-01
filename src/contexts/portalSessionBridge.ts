// Migra a sessão do cliente Supabase padrão (onde o broker OAuth do Lovable
// grava os tokens) para o cliente isolado do portal. Mantém o isolamento
// admin × portal sem perder o login Google.
import { supabase } from "@/integrations/supabase/client";
import { supabasePortal } from "@/integrations/supabase/portal-client";

export async function migrateDefaultSessionToPortal(): Promise<boolean> {
  try {
    const [{ data: portalData }, { data: defaultData }] = await Promise.all([
      supabasePortal.auth.getSession(),
      supabase.auth.getSession(),
    ]);

    if (portalData.session) return false;
    const def = defaultData.session;
    if (!def?.access_token || !def?.refresh_token) return false;

    await supabasePortal.auth.setSession({
      access_token: def.access_token,
      refresh_token: def.refresh_token,
    });

    // signOut local: limpa só o storage do cliente padrão, não invalida o
    // refresh token no servidor (o portal continua usando).
    await supabase.auth.signOut({ scope: "local" });
    return true;
  } catch (e) {
    console.warn("migrateDefaultSessionToPortal failed", e);
    return false;
  }
}