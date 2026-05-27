import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { migrateDefaultSessionToPortal } from "./portalSessionBridge";
import type { Session, User } from "@supabase/supabase-js";

export type LinkStatus =
  | "idle"
  | "linking"
  | "linked"
  | "needs_phone"
  | "phone_taken"
  | "error";

type Ctx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  linkStatus: LinkStatus;
  linkByPhone: (phone: string) => Promise<LinkStatus>;
};

const PortalAuthContext = createContext<Ctx>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
  linkStatus: "idle",
  linkByPhone: async () => "idle",
});

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkStatus, setLinkStatus] = useState<LinkStatus>("idle");

  const runLink = async (phone?: string): Promise<LinkStatus> => {
    setLinkStatus("linking");
    try {
      const { data, error } = await supabasePortal.functions.invoke("link-portal-account", {
        body: phone ? { phone } : undefined,
      });
      if (error) {
        console.warn("link-portal-account error", error);
        setLinkStatus("error");
        return "error";
      }
      if (data?.linked) {
        setLinkStatus("linked");
        return "linked";
      }
      if (data?.reason === "phone_taken") {
        setLinkStatus("phone_taken");
        return "phone_taken";
      }
      // no_profile / no_email → precisa do telefone
      setLinkStatus("needs_phone");
      return "needs_phone";
    } catch (e) {
      console.warn("link-portal-account threw", e);
      setLinkStatus("error");
      return "error";
    }
  };

  useEffect(() => {
    // Listener PRIMEIRO para não perder evento
    const { data: sub } = supabasePortal.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        // Primeiro tenta vincular por email (sem body).
        runLink();
      } else {
        setLinkStatus("idle");
      }
    });

    (async () => {
      // Se o usuário acabou de voltar do OAuth do Lovable, a sessão está no
      // cliente padrão — migramos pro storage do portal antes de tudo.
      await migrateDefaultSessionToPortal();
      const { data } = await supabasePortal.auth.getSession();
      setSession(data.session);
      setLoading(false);
      if (data.session?.user) runLink();
    })();

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabasePortal.auth.signOut();
  };

  return (
    <PortalAuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signOut,
        linkStatus,
        linkByPhone: (phone: string) => runLink(phone),
      }}
    >
      {children}
    </PortalAuthContext.Provider>
  );
}

export const usePortalAuth = () => useContext(PortalAuthContext);