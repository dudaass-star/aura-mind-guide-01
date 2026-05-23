import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

type Ctx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const PortalAuthContext = createContext<Ctx>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listener PRIMEIRO para não perder evento
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Quando o usuário acabou de logar, dispara vinculação ao profile legado.
      if (s?.user) {
        // fire-and-forget, idempotente
        supabase.functions
          .invoke("link-portal-account")
          .catch((e) => console.warn("link-portal-account failed", e));
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <PortalAuthContext.Provider
      value={{ session, user: session?.user ?? null, loading, signOut }}
    >
      {children}
    </PortalAuthContext.Provider>
  );
}

export const usePortalAuth = () => useContext(PortalAuthContext);