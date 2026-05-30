import { useQuery } from "@tanstack/react-query";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Heart, MessageCircle, Tag, User } from "lucide-react";
import { SectionHeader, EmptyState, PortalLoadingInline } from "./shared";
import { auraWhatsAppLink } from "./whatsapp";

// Agrupa a memória curada da Aura sobre o usuário por importância (camadas).
// Estrutura baseada na tabela existente public.user_insights:
//   (category, key, value, importance int, mentioned_count, last_mentioned_at)

const LAYERS: { title: string; min: number; max: number }[] = [
  { title: "Identidade", min: 10, max: 10 },
  { title: "Valores", min: 7, max: 9 },
  { title: "Temas recorrentes", min: 4, max: 6 },
];

export function SobreVoceTab({ userId }: { userId: string }) {
  const { data: insights, isLoading } = useQuery({
    queryKey: ["portal-user-insights", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("user_insights")
        .select("id, category, key, value, importance, mentioned_count, last_mentioned_at")
        .eq("user_id", userId)
        .order("importance", { ascending: false })
        .order("mentioned_count", { ascending: false })
        .limit(120);
      if (error) return [];
      return data || [];
    },
    enabled: !!userId,
  });

  const { data: themes } = useQuery({
    queryKey: ["portal-session-themes", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("session_themes")
        .select("id, theme_name, status, session_count, last_mentioned_at")
        .eq("user_id", userId)
        .order("session_count", { ascending: false })
        .limit(20);
      if (error) return [];
      return data || [];
    },
    enabled: !!userId,
  });

  if (isLoading) return <PortalLoadingInline />;

  const layered = LAYERS.map((layer) => ({
    ...layer,
    items: (insights || []).filter(
      (i: any) => (i.importance ?? 0) >= layer.min && (i.importance ?? 0) <= layer.max,
    ),
  }));

  const totalItems =
    layered.reduce((s, l) => s + l.items.length, 0) + (themes?.length || 0);

  if (totalItems === 0) {
    return (
      <div className="space-y-5">
        <SectionHeader icon={User} title="Sobre você" />
        <EmptyState
          icon={Heart}
          title="A Aura ainda está te conhecendo"
          description="Conforme vocês conversam, ela vai mapear identidade, valores e temas recorrentes seus aqui."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader icon={User} title="Sobre você" />
      <p className="text-sm text-muted-foreground font-['Nunito'] -mt-2">
        O que a Aura aprendeu sobre você até aqui. Se algo estiver errado, é só pedir pra ela
        corrigir no WhatsApp.
      </p>

      {layered.map(
        (layer) =>
          layer.items.length > 0 && (
            <Layer key={layer.title} title={layer.title} items={layer.items} />
          ),
      )}

      {themes && themes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Tag size={14} className="text-accent" />
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold font-['Nunito']">
              Temas em movimento
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {themes.map((t: any) => (
              <span
                key={t.id}
                className={`px-3 py-1.5 rounded-full text-xs font-medium font-['Nunito'] ${
                  t.status === "resolved"
                    ? "bg-muted text-muted-foreground line-through"
                    : "bg-accent/10 text-accent"
                }`}
              >
                {t.theme_name}
                {t.session_count > 1 && (
                  <span className="ml-1 opacity-70">· {t.session_count}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Layer({ title, items }: { title: string; items: any[] }) {
  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold font-['Nunito']">
        {title}
      </p>
      <div className="space-y-2">
        {items.map((i: any) => (
          <InsightRow key={i.id} insight={i} />
        ))}
      </div>
    </div>
  );
}

function InsightRow({ insight }: { insight: any }) {
  const label = insight.key ? `${insight.key}: ` : "";
  const correction = auraWhatsAppLink(
    `Oi Aura, sobre "${(insight.value || "").slice(0, 80)}" — quero corrigir uma coisa.`,
  );
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start justify-between gap-3 group">
      <p className="text-sm text-foreground font-['Nunito'] leading-relaxed">
        <span className="text-muted-foreground capitalize">{label}</span>
        <span>{insight.value}</span>
      </p>
      <a
        href={correction}
        target="_blank"
        rel="noopener noreferrer"
        title="Corrigir com a Aura"
        className="opacity-60 hover:opacity-100 text-muted-foreground hover:text-accent transition-all shrink-0"
      >
        <MessageCircle size={14} />
      </a>
    </div>
  );
}