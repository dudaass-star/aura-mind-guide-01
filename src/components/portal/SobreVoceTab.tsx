import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import {
  Heart,
  MessageCircle,
  Tag,
  User,
  Users,
  Sparkles,
  Compass,
  Activity,
  Trophy,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { SectionHeader, EmptyState, PortalLoadingInline } from "./shared";
import { auraWhatsAppLink } from "./whatsapp";

// ============================================================
// Aba "Sobre você" — versão curada
// Lê public.user_insights (category ∈ pessoa | preferencia | objetivo |
// padrao | conquista | trauma | contexto) e session_themes.
// "contexto" nunca aparece (é estado operacional efêmero do agente).
// ============================================================

type Insight = {
  id: string;
  category: string;
  key: string | null;
  value: string | null;
  importance: number | null;
  mentioned_count: number | null;
  last_mentioned_at: string | null;
};

type SectionConfig = {
  id: string;
  title: string;
  description?: string;
  icon: React.ElementType;
  category: string;
  minImportance: number;
  sensitive?: boolean;
};

const SECTIONS: SectionConfig[] = [
  { id: "pessoas", title: "Pessoas da sua vida", icon: Users, category: "pessoa", minImportance: 0 },
  { id: "preferencias", title: "Preferências e gostos", icon: Sparkles, category: "preferencia", minImportance: 6 },
  { id: "objetivos", title: "O que você busca", icon: Compass, category: "objetivo", minImportance: 6 },
  { id: "padroes", title: "Padrões que a Aura percebeu", icon: Activity, category: "padrao", minImportance: 6 },
  { id: "conquistas", title: "Conquistas", icon: Trophy, category: "conquista", minImportance: 0 },
  {
    id: "sensiveis",
    title: "Pontos sensíveis",
    description: "Tópicos delicados que você compartilhou com a Aura.",
    icon: ShieldAlert,
    category: "trauma",
    minImportance: 0,
    sensitive: true,
  },
];

// Chaves operacionais que não dizem nada sobre o usuário.
const KEY_BLACKLIST = new Set([
  "audio",
  "conversar_audio",
  "confusao_texto_audio",
  "compreensao_aura",
  "compreensao_processo",
  "continuar_conversando",
  "interacao_anterior",
  "topico_anterior",
  "assunto_nao_discutir",
  "recusa_de_ajuda",
  "recusa de ajuda",
  "mudanca de assunto",
  "mudanca_de_assunto",
  "tipo de interação",
  "tipo_de_interacao",
  "tipo de serviço",
  "tipo_de_servico",
  "estado",
  "clima",
  "localizacao",
  "frase_ancora",
  "jornada_concluida",
  "tema_episodio",
  "tema_principal",
  "episodio",
  "episodio_atual",
  "episodio_anterior",
  "pessoa_mencionada",
]);

const KEY_PREFIX_BLACKLIST = ["kit_", "estatistica_", "episodio_"];

const VALUE_PLACEHOLDERS = new Set([
  "nao_nomeada",
  "não nomeada",
  "nao nomeada",
  "n/a",
  "na",
  "null",
  "true",
  "false",
  "sim",
  "não",
  "nao",
]);

function isJunk(it: Insight): boolean {
  const rawKey = (it.key || "").trim().toLowerCase();
  const rawValue = (it.value || "").trim();
  if (!rawValue || rawValue.length <= 2) return true;
  if (VALUE_PLACEHOLDERS.has(rawValue.toLowerCase())) return true;
  if (/^\d+$/.test(rawValue)) return true;
  if (/^EP\s/i.test(rawValue)) return true;
  if (KEY_BLACKLIST.has(rawKey)) return true;
  if (KEY_PREFIX_BLACKLIST.some((p) => rawKey.startsWith(p))) return true;
  return false;
}

function prettifyKey(key: string | null): string {
  if (!key) return "";
  const cleaned = key.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  // Title case na primeira letra apenas (preserva acentuação).
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

type DedupedItem = {
  id: string;
  key: string | null;
  values: string[];
  importance: number;
  last_mentioned_at: string | null;
};

function dedupeBySection(items: Insight[], aggregateValues: boolean): DedupedItem[] {
  const map = new Map<string, DedupedItem>();
  for (const it of items) {
    const norm = (it.key || "").trim().toLowerCase();
    const valueTrim = (it.value || "").trim();
    const existing = map.get(norm);
    if (!existing) {
      map.set(norm, {
        id: it.id,
        key: it.key,
        values: [valueTrim],
        importance: it.importance ?? 0,
        last_mentioned_at: it.last_mentioned_at,
      });
      continue;
    }
    if (aggregateValues) {
      // Agrega valores únicos (case-insensitive) até 3 entradas.
      const lowerExisting = new Set(existing.values.map((v) => v.toLowerCase()));
      if (!lowerExisting.has(valueTrim.toLowerCase()) && existing.values.length < 3) {
        existing.values.push(valueTrim);
      }
      if ((it.importance ?? 0) > existing.importance) {
        existing.importance = it.importance ?? 0;
      }
      const dateA = existing.last_mentioned_at ? Date.parse(existing.last_mentioned_at) : 0;
      const dateB = it.last_mentioned_at ? Date.parse(it.last_mentioned_at) : 0;
      if (dateB > dateA) existing.last_mentioned_at = it.last_mentioned_at;
    } else {
      // Mantém o registro mais relevante (importance, depois data).
      const dateExisting = existing.last_mentioned_at ? Date.parse(existing.last_mentioned_at) : 0;
      const dateNew = it.last_mentioned_at ? Date.parse(it.last_mentioned_at) : 0;
      const better =
        (it.importance ?? 0) > existing.importance ||
        ((it.importance ?? 0) === existing.importance && dateNew > dateExisting);
      if (better) {
        map.set(norm, {
          id: it.id,
          key: it.key,
          values: [valueTrim],
          importance: it.importance ?? 0,
          last_mentioned_at: it.last_mentioned_at,
        });
      }
    }
  }
  // Ordena por importance desc, depois data desc.
  return Array.from(map.values()).sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    const dateA = a.last_mentioned_at ? Date.parse(a.last_mentioned_at) : 0;
    const dateB = b.last_mentioned_at ? Date.parse(b.last_mentioned_at) : 0;
    return dateB - dateA;
  });
}

export function SobreVoceTab({ userId }: { userId: string }) {
  const { data: insights, isLoading } = useQuery({
    queryKey: ["portal-user-insights", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("user_insights")
        .select("id, category, key, value, importance, mentioned_count, last_mentioned_at")
        .eq("user_id", userId)
        .neq("category", "contexto")
        .order("importance", { ascending: false })
        .order("last_mentioned_at", { ascending: false })
        .limit(400);
      if (error) return [] as Insight[];
      return (data || []) as Insight[];
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
        .limit(40);
      if (error) return [];
      return data || [];
    },
    enabled: !!userId,
  });

  const sections = useMemo(() => {
    const all = insights || [];
    return SECTIONS.map((cfg) => {
      const filtered = all
        .filter((it) => it.category === cfg.category)
        .filter((it) => (it.importance ?? 0) >= cfg.minImportance)
        .filter((it) => !isJunk(it));
      // Para "pessoas" agrega valores diferentes da mesma chave (filha: Selena, Bella).
      const deduped = dedupeBySection(filtered, cfg.category === "pessoa");
      return { ...cfg, items: deduped };
    });
  }, [insights]);

  const dedupedThemes = useMemo(() => {
    const map = new Map<string, any>();
    for (const t of themes || []) {
      const key = (t.theme_name || "").trim().toLowerCase();
      if (!key) continue;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...t });
      } else {
        existing.session_count = (existing.session_count || 0) + (t.session_count || 0);
        if (t.status === "active") existing.status = "active";
        const dateA = existing.last_mentioned_at ? Date.parse(existing.last_mentioned_at) : 0;
        const dateB = t.last_mentioned_at ? Date.parse(t.last_mentioned_at) : 0;
        if (dateB > dateA) existing.last_mentioned_at = t.last_mentioned_at;
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      // Ativos primeiro, depois por contagem.
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return (b.session_count || 0) - (a.session_count || 0);
    });
  }, [themes]);

  if (isLoading) return <PortalLoadingInline />;

  const hasAny =
    sections.some((s) => s.items.length > 0) || dedupedThemes.length > 0;

  if (!hasAny) {
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

      {sections.map(
        (section) =>
          section.items.length > 0 && (
            <Section
              key={section.id}
              title={section.title}
              description={section.description}
              icon={section.icon}
              items={section.items}
              sensitive={section.sensitive}
            />
          ),
      )}

      {dedupedThemes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Tag size={14} className="text-accent" />
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold font-['Nunito']">
              Temas em movimento
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {dedupedThemes.map((t: any) => (
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

const MAX_VISIBLE = 8;

function Section({
  title,
  description,
  icon: Icon,
  items,
  sensitive,
}: {
  title: string;
  description?: string;
  icon: React.ElementType;
  items: DedupedItem[];
  sensitive?: boolean;
}) {
  const [expanded, setExpanded] = useState(!sensitive);
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? items : items.slice(0, MAX_VISIBLE);
  const hasMore = items.length > MAX_VISIBLE;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => sensitive && setExpanded((v) => !v)}
        className={`flex items-center gap-2 w-full text-left ${sensitive ? "cursor-pointer" : "cursor-default"}`}
      >
        <Icon size={14} className="text-accent" />
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold font-['Nunito']">
          {title}
        </p>
        {sensitive && (
          <span className="ml-auto text-muted-foreground">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        )}
      </button>
      {sensitive && description && expanded && (
        <p className="text-xs text-muted-foreground font-['Nunito'] italic">{description}</p>
      )}
      {expanded && (
        <>
          <div className="space-y-2">
            {visible.map((it) => (
              <InsightRow key={it.id} item={it} />
            ))}
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-xs text-accent hover:underline font-['Nunito'] font-medium"
            >
              {showAll ? "Ver menos" : `Ver mais (${items.length - MAX_VISIBLE})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function InsightRow({ item }: { item: DedupedItem }) {
  const label = prettifyKey(item.key);
  const valueDisplay = item.values.join(", ");
  const correction = auraWhatsAppLink(
    `Oi Aura, sobre "${valueDisplay.slice(0, 80)}" — quero corrigir uma coisa.`,
  );
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start justify-between gap-3 group">
      <p className="text-sm text-foreground font-['Nunito'] leading-relaxed">
        {label && <span className="text-muted-foreground">{label}: </span>}
        <span>{valueDisplay}</span>
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