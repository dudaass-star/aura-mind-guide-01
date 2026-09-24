import { useQuery } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, Sprout } from "lucide-react";
import { supabasePortal } from "@/integrations/supabase/portal-client";

export type ContinuityStage = {
  key: "inicio" | "contexto" | "continuidade";
  title: string;
  description: string;
  icon: typeof Sprout;
};

export function computeContinuityStage(sessions: number, themes: number): ContinuityStage {
  if (sessions >= 10 && themes >= 5) {
    return {
      key: "continuidade",
      title: "Continuidade construída",
      description: "Já existe um histórico consistente de encontros e assuntos para apoiar suas próximas conversas.",
      icon: CheckCircle2,
    };
  }
  if (sessions >= 3 || themes >= 3) {
    return {
      key: "contexto",
      title: "Sua história ganhando contexto",
      description: "Os assuntos e encontros anteriores já ajudam a dar continuidade ao que importa para você.",
      icon: BookOpen,
    };
  }
  return {
    key: "inicio",
    title: "Começando a conhecer você",
    description: "A cada conversa ou encontro, a AURA passa a ter mais contexto para acompanhar sua história.",
    icon: Sprout,
  };
}

export function ContinuitySignal({ userId }: { userId: string }) {
  const { data, isError } = useQuery({
    queryKey: ["portal-continuity-signal", userId],
    queryFn: async () => {
      const [sessionsRes, themesRes] = await Promise.all([
        supabasePortal
          .from("sessions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "completed"),
        supabasePortal
          .from("session_themes")
          .select("theme_name")
          .eq("user_id", userId),
      ]);
      if (sessionsRes.error) throw sessionsRes.error;
      if (themesRes.error) throw themesRes.error;
      const sessions = sessionsRes.count ?? 0;
      const themes = new Set((themesRes.data ?? []).map((t: any) => t.theme_name)).size;
      return { sessions, themes };
    },
  });

  if (!data || isError) return null;
  const stage = computeContinuityStage(data.sessions, data.themes);
  const Icon = stage.icon;

  return (
    <section className="mt-4 flex items-start gap-3 rounded-lg border border-[hsl(var(--portal-area-foreground)/0.18)] bg-[hsl(var(--portal-area-surface)/0.58)] p-4" aria-label="Continuidade com a AURA" data-continuity-stage={stage.key}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--portal-area-foreground)/0.12)] text-[hsl(var(--portal-area-foreground))]" aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase text-[hsl(var(--portal-area-foreground))]">Contexto construído</p>
        <h2 className="mt-0.5 text-sm font-semibold text-foreground">{stage.title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{stage.description}</p>
      </div>
    </section>
  );
}