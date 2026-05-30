import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Target, CheckCircle2, Lock, Play, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionHeader, EmptyState } from "./shared";

interface JornadasTabProps {
  userId: string;
  profile: any;
  portalToken?: string;
}

export function JornadasTab({ userId, profile, portalToken }: JornadasTabProps) {
  const currentJourneyId = profile?.current_journey_id;
  const currentEpisode = profile?.current_episode || 0;
  const [expandedJourney, setExpandedJourney] = useState<string | null>(currentJourneyId || null);
  const [query, setQuery] = useState("");
  const [lengthFilter, setLengthFilter] = useState<string>("all");

  const { data: journeyHistory } = useQuery({
    queryKey: ["portal-journey-history", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_journey_history")
        .select("journey_id, completed_at")
        .eq("user_id", userId)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const { data: allJourneys } = useQuery({
    queryKey: ["portal-all-journeys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_journeys")
        .select("id, title, description, topic, total_episodes")
        .eq("is_active", true)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: allEpisodes } = useQuery({
    queryKey: ["portal-all-episodes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journey_episodes")
        .select("id, episode_number, title, stage_title, journey_id")
        .order("episode_number");
      if (error) throw error;
      return data;
    },
  });

  // Mapa journey_id -> completed_at para ordenar concluídas pela mais recente
  const completedAtMap = new Map<string, string>(
    (journeyHistory || []).map((h: any) => [h.journey_id, h.completed_at]),
  );
  const completedJourneyIds = new Set(completedAtMap.keys());

  const episodesByJourney = (allEpisodes || []).reduce((acc: Record<string, any[]>, ep: any) => {
    if (!acc[ep.journey_id]) acc[ep.journey_id] = [];
    acc[ep.journey_id].push(ep);
    return acc;
  }, {});

  // Mostra todas as jornadas ativas, classificadas em três estados
  type JourneyStatus = "current" | "completed" | "available";
  const journeysWithStatus = (allJourneys || []).map((j: any) => {
    let status: JourneyStatus = "available";
    if (j.id === currentJourneyId) status = "current";
    else if (completedJourneyIds.has(j.id)) status = "completed";
    return { ...j, status };
  });

  if (journeysWithStatus.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="Nenhuma jornada disponível"
        description="Sua jornada será iniciada em breve. Continue conversando com a Aura!"
      />
    );
  }

  // Ordem: Atual → Concluídas (mais recente primeiro) → Disponíveis (ordem do catálogo)
  const statusRank: Record<JourneyStatus, number> = { current: 0, completed: 1, available: 2 };
  const sortedJourneys = [...journeysWithStatus].sort((a: any, b: any) => {
    const r = statusRank[a.status as JourneyStatus] - statusRank[b.status as JourneyStatus];
    if (r !== 0) return r;
    if (a.status === "completed") {
      const da = completedAtMap.get(a.id) || "";
      const db = completedAtMap.get(b.id) || "";
      return db.localeCompare(da);
    }
    return 0;
  });

  // Fonte única de verdade: user_journey_history. Evita dissonância com o
  // contador inflado em profile.journeys_completed (perfis antigos sem histórico).
  const completedCount = completedJourneyIds.size;

  const q = query.trim().toLowerCase();
  const filteredJourneys = useMemo(() => {
    return sortedJourneys.filter((j: any) => {
      const total = j.total_episodes || 8;
      if (lengthFilter === "short" && total > 4) return false;
      if (lengthFilter === "medium" && (total <= 4 || total > 8)) return false;
      if (lengthFilter === "long" && total <= 8) return false;
      if (q) {
        const haystack = `${j.title || ""} ${j.description || ""} ${j.topic || ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [sortedJourneys, q, lengthFilter]);

  return (
    <div className="space-y-5">
      <SectionHeader icon={Target} title="Suas Jornadas" />

      {completedCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground font-['Nunito'] animate-fade-in">
          <CheckCircle2 size={16} className="text-accent" />
          <span>
            {completedCount} jornada{completedCount > 1 ? "s" : ""} completada{completedCount > 1 ? "s" : ""}
          </span>
        </div>
      )}

      <div className="space-y-2 animate-fade-in">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar jornada..."
            className="pl-9 h-10 font-['Nunito'] text-sm"
          />
        </div>
        <Select value={lengthFilter} onValueChange={setLengthFilter}>
          <SelectTrigger className="h-9 text-xs font-['Nunito']">
            <SelectValue placeholder="Duração" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Qualquer duração</SelectItem>
            <SelectItem value="short">Curtas (até 4 episódios)</SelectItem>
            <SelectItem value="medium">Médias (5–8 episódios)</SelectItem>
            <SelectItem value="long">Longas (9+ episódios)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredJourneys.length === 0 && (
        <p className="text-sm text-muted-foreground font-['Nunito'] text-center py-6">
          Nenhuma jornada corresponde aos filtros.
        </p>
      )}

      {filteredJourneys.map((journey: any, idx: number) => {
        const isCurrent = journey.status === "current";
        const isCompleted = journey.status === "completed";
        const isAvailable = journey.status === "available";
        const isExpanded = expandedJourney === journey.id;
        const episodes = episodesByJourney[journey.id] || [];
        const totalEpisodes = journey.total_episodes || 8;
        const completedEps = isCurrent ? currentEpisode : isCompleted ? totalEpisodes : 0;
        const progressPercent = (completedEps / totalEpisodes) * 100;

        const badgeLabel = isCurrent
          ? "Jornada Atual"
          : isCompleted
            ? "Jornada Completada"
            : "Disponível";

        return (
          <div key={journey.id} className={`space-y-2 animate-fade-up`} style={{ animationDelay: `${idx * 100}ms` }}>
            <div
              className={`rounded-2xl border p-5 cursor-pointer transition-all hover:shadow-card ${
                isCurrent
                  ? "border-accent/20 bg-gradient-to-br from-accent/5 to-transparent"
                  : isCompleted
                    ? "border-border bg-card hover:shadow-sm"
                    : "border-border/60 bg-muted/20 hover:shadow-sm"
              }`}
              onClick={() => setExpandedJourney(isExpanded ? null : journey.id)}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className={`text-xs uppercase tracking-wider font-semibold font-['Nunito'] ${isCurrent ? "text-accent" : "text-muted-foreground"}`}>
                    {badgeLabel}
                  </p>
                  <p className="font-['Fraunces'] font-semibold text-foreground text-lg mt-1">{journey.title}</p>
                </div>
                <div className={`rounded-full p-2 ${isCurrent ? "bg-accent/10" : "bg-muted"}`}>
                  {isCurrent ? (
                    <Target size={20} className="text-accent" />
                  ) : isCompleted ? (
                    <CheckCircle2 size={20} className="text-accent" />
                  ) : (
                    <Lock size={18} className="text-muted-foreground" />
                  )}
                </div>
              </div>
              {journey.description && (
                <p className="text-sm text-muted-foreground font-['Nunito'] mb-3">{journey.description}</p>
              )}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-700"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground font-['Nunito'] font-medium">
                  {completedEps}/{totalEpisodes}
                </span>
              </div>
            </div>

            {isExpanded && episodes.length > 0 && (
              <div className="space-y-2 pl-2">
                <p className="text-sm font-semibold text-foreground font-['Nunito']">Episódios</p>
                {isAvailable && (
                  <p className="text-xs text-muted-foreground font-['Nunito']">
                    A Aura vai te guiar até esta jornada na hora certa.
                  </p>
                )}
                {episodes.map((ep: any, epIdx: number) => {
                  const isUnlocked =
                    isCompleted || (isCurrent && ep.episode_number <= currentEpisode);
                  return (
                    <div
                      key={ep.id}
                      className={`rounded-xl border p-4 flex items-center gap-3 transition-all animate-fade-up ${
                        isUnlocked
                          ? "border-border bg-card hover:shadow-sm hover:scale-[1.01] cursor-pointer"
                          : "border-border/50 bg-muted/30 opacity-60"
                      }`}
                      style={{ animationDelay: `${epIdx * 50}ms` }}
                      title={!isUnlocked && isAvailable ? "A Aura vai te guiar até esta jornada na hora certa" : undefined}
                      onClick={() => {
                        if (!isUnlocked) return;
                        const params = new URLSearchParams({ u: userId });
                        if (portalToken) params.set("t", portalToken);
                        window.open(`/episodio/${ep.id}?${params.toString()}`, "_blank");
                      }}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isUnlocked ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}`}>
                        {isUnlocked ? <CheckCircle2 size={16} /> : <Lock size={14} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground font-['Nunito'] truncate">
                          {ep.episode_number}. {ep.title}
                        </p>
                        {ep.stage_title && (
                          <p className="text-xs text-muted-foreground font-['Nunito']">{ep.stage_title}</p>
                        )}
                      </div>
                      {isUnlocked && <Play size={14} className="text-accent shrink-0" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
