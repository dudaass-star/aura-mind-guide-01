import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, Headphones, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabasePortal } from "@/integrations/supabase/portal-client";

type ValueFeature = "session" | "journey" | "practice" | "progress";
type Destination = "sessoes" | "insights" | "meditacoes";

const DISCOVERY: Record<ValueFeature, {
  eyebrow: string;
  title: string;
  description: string;
  action: string;
  destination: Destination;
  icon: typeof CalendarDays;
}> = {
  session: {
    eyebrow: "Um próximo passo",
    title: "Tenha um encontro só seu",
    description: "Nas sessões, a conversa ganha tempo, direção e continuidade.",
    action: "Conhecer sessões",
    destination: "sessoes",
    icon: CalendarDays,
  },
  journey: {
    eyebrow: "Continue entre conversas",
    title: "Sua jornada também acontece fora do chat",
    description: "O Percurso reúne conteúdos e movimentos para acompanhar seu momento.",
    action: "Ver meu percurso",
    destination: "insights",
    icon: Sparkles,
  },
  practice: {
    eyebrow: "Para usar no seu tempo",
    title: "Leve a AURA com você em áudio",
    description: "Encontre práticas guiadas para momentos em que ouvir ajuda mais do que ler.",
    action: "Explorar áudios",
    destination: "meditacoes",
    icon: Headphones,
  },
  progress: {
    eyebrow: "O que já está se formando",
    title: "Veja seu caminho ganhar forma",
    description: "Reúna sessões, aprendizados e mudanças para perceber o que está avançando.",
    action: "Ver meu progresso",
    destination: "insights",
    icon: TrendingUp,
  },
};

async function recordValueEvent(userId: string, feature: ValueFeature, eventType: "presented" | "opened" | "experienced") {
  const { error } = await supabasePortal.from("portal_value_events").insert({
    user_id: userId,
    feature,
    event_type: eventType,
    source: "app",
  });
  if (error?.code !== "23505") return;
}

export function ValueDiscoveryCard({
  userId,
  hasConversation,
  onNavigate,
}: {
  userId: string;
  hasConversation: boolean;
  onNavigate?: (tab: Destination) => void;
}) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["portal-value-discovery", userId],
    queryFn: async () => {
      const [events, sessions, journeys, practices, progress] = await Promise.all([
        supabasePortal.from("portal_value_events").select("feature,event_type").eq("user_id", userId),
        supabasePortal.from("sessions").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed"),
        supabasePortal.from("user_journey_history").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabasePortal.from("user_meditation_history").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabasePortal.from("user_evolution_summary").select("user_id", { count: "exact", head: true }).eq("user_id", userId),
      ]);
      return {
        events: events.data ?? [],
        sessions: sessions.count ?? 0,
        journeys: journeys.count ?? 0,
        practices: practices.count ?? 0,
        progress: progress.count ?? 0,
      };
    },
    enabled: Boolean(userId && hasConversation),
    staleTime: 0,
  });

  useEffect(() => {
    if (!data) return;
    const experienced: ValueFeature[] = [];
    if (data.sessions > 0) experienced.push("session");
    if (data.journeys > 0) experienced.push("journey");
    if (data.practices > 0) experienced.push("practice");
    if (data.progress > 0) experienced.push("progress");
    for (const item of experienced) void recordValueEvent(userId, item, "experienced");
  }, [data, userId]);

  const feature = useMemo<ValueFeature | null>(() => {
    if (!data || !hasConversation) return null;
    const opened = new Set(data.events.filter((event) => event.event_type === "opened").map((event) => event.feature));
    if (data.sessions === 0 && !opened.has("session")) return "session";
    if (data.journeys === 0 && !opened.has("journey")) return "journey";
    if (data.practices === 0 && !opened.has("practice")) return "practice";
    if (data.progress === 0 && !opened.has("progress")) return "progress";
    return null;
  }, [data, hasConversation]);

  useEffect(() => {
    if (feature) void recordValueEvent(userId, feature, "presented");
  }, [feature, userId]);

  if (!feature) return null;
  const item = DISCOVERY[feature];
  const Icon = item.icon;

  return (
    <div className="mx-4 mb-4 rounded-lg border border-primary/20 bg-card p-4 shadow-sm animate-fade-in">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{item.eyebrow}</p>
          <h2 className="mt-1 font-display text-lg font-semibold leading-snug text-foreground">{item.title}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
          <Button
            type="button"
            variant="link"
            className="mt-2 h-auto p-0 font-body font-bold text-primary"
            onClick={() => {
              void recordValueEvent(userId, feature, "opened").finally(() => {
                void queryClient.invalidateQueries({ queryKey: ["portal-value-discovery", userId] });
                onNavigate?.(item.destination);
              });
            }}
          >
            {item.action}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}