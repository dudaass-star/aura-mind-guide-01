import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { migrateDefaultSessionToPortal } from "./portalSessionBridge";
import type { Session, User } from "@supabase/supabase-js";

const LINK_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function linkedRecently(userId: string) {
  const linkedAt = Number(localStorage.getItem(`aura-portal-linked:${userId}`) || 0);
  return linkedAt > 0 && Date.now() - linkedAt < LINK_CACHE_TTL_MS;
}

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
  const linkPromiseRef = useRef<Promise<LinkStatus> | null>(null);

  const runLink = async (phone?: string, expectedUserId?: string): Promise<LinkStatus> => {
    if (linkPromiseRef.current) return linkPromiseRef.current;
    const request = (async (): Promise<LinkStatus> => {
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
        const next: LinkStatus = data?.linked
          ? "linked"
          : data?.reason === "phone_taken"
            ? "phone_taken"
            : "needs_phone";
        setLinkStatus(next);
        const linkedUserId = expectedUserId || session?.user?.id;
        if (next === "linked" && linkedUserId) {
          localStorage.setItem(`aura-portal-linked:${linkedUserId}`, String(Date.now()));
        }
        return next;
      } catch (e) {
        console.warn("link-portal-account threw", e);
        setLinkStatus("error");
        return "error";
      } finally {
        linkPromiseRef.current = null;
      }
    })();
    linkPromiseRef.current = request;
    return request;
  };

  useEffect(() => {
    // Listener PRIMEIRO para não perder evento
    const { data: sub } = supabasePortal.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        if (linkedRecently(s.user.id)) setLinkStatus("linked");
        else void runLink(undefined, s.user.id);
      } else {
        setLinkStatus("idle");
      }
    });

    (async () => {
      // A sessão persistida do aplicativo é lida primeiro. A migração só é
      // necessária no primeiro retorno do login, não em toda reabertura.
      let { data } = await supabasePortal.auth.getSession();
      if (!data.session) {
        await migrateDefaultSessionToPortal();
        ({ data } = await supabasePortal.auth.getSession());
      }
      setSession(data.session);
      setLoading(false);
      if (data.session?.user) {
        if (linkedRecently(data.session.user.id)) setLinkStatus("linked");
        else void runLink(undefined, data.session.user.id);
      }
    })();

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    // scope: "local" garante limpeza imediata do storage do portal,
    // sem depender da resposta do servidor (evita ficar travado se o
    // token já estiver inválido).
    try {
      await supabasePortal.auth.signOut({ scope: "local" });
    } catch (e) {
      console.warn("portal signOut failed", e);
    }
    try { sessionStorage.removeItem("aura-oauth-target"); } catch {}
    if (session?.user?.id) localStorage.removeItem(`aura-portal-linked:${session.user.id}`);
    setSession(null);
    setLinkStatus("idle");
  };

  return (
    <PortalAuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signOut,
        linkStatus,
        linkByPhone: (phone: string) => runLink(phone, session?.user?.id),
      }}
    >
      {children}
    </PortalAuthContext.Provider>
  );
}

export const usePortalAuth = () => useContext(PortalAuthContext);