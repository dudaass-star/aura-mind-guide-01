import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import {
  Heart,
  Tag,
  User,
  Users,
  Compass,
  Activity,
  Trophy,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { SectionHeader, EmptyState, PortalLoadingInline } from "./shared";
import { auraWhatsAppLink } from "./whatsapp";

// ============================================================
// Aba "Sobre você" — versão retrato narrativo
// Lê o retrato curado em public.user_portraits (gerado por edge function via Gemini Flash).
// Se cache estiver vazio/stale, dispara generate-user-portrait em background.
// Temas continuam vindo de session_themes (já curados).
// ============================================================

type Portrait = {
  user_id: string;
  intro: string | null;
  pessoas: { label: string; names: string[]; nota?: string | null }[];
  o_que_te_move: string[];
  padroes: string[];
  preferencias: string[];
  conquistas: string[];
  sensiveis: string[];
  insights_version: string | null;
  generated_at: string;
};

const MAX_THEMES = 12;

// ---------- BLACKLISTS / WHITELISTS ----------

// Chaves operacionais ou vazias que nunca devem aparecer.
const KEY_BLACKLIST = new Set([
  // Operacional do agente
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
  "recusa_de_agendamento",
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
  "interesse_em_sessoes",
  "interesse em sessões",
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

// Relações reconhecidas como "pessoas da vida"
const PEOPLE_KEYS = new Set([
  "filha", "filho", "filhas", "filhos",
  "esposa", "marido", "parceira", "parceiro",
  "mae", "mãe", "pai",
  "irma", "irmã", "irmao", "irmão",
  "sobrinha", "sobrinho",
  "amiga", "amigo",
  "chefe", "colega",
  "ex", "namorada", "namorado",
  "avo", "avó", "avô",
  "tia", "tio",
  "cunhada", "cunhado",
  "sogra", "sogro",
  "prima", "primo",
  "neta", "neto",
  "madrinha", "padrinho",
]);

// ---------- HELPERS ----------

function stripSuffixNumber(key: string): string {
  return key.replace(/_\d+$/, "").replace(/\s+\d+$/, "");
}

function isPeopleKey(rawKey: string): boolean {
  const base = stripSuffixNumber(rawKey.trim().toLowerCase());
  return PEOPLE_KEYS.has(base);
}

function looksLikeProperName(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.length > 40) return false;
  // 1-3 palavras, cada uma começando com maiúscula
  const parts = v.split(/\s+/);
  if (parts.length > 3) return false;
  return parts.every((p) => /^[A-ZÀ-Ý][a-zà-ÿ'-]+$/.test(p));
}

function isGenericAiPhrase(value: string): boolean {
  const v = value.trim().toLowerCase();
  // Frases vagas tipo "fazer as coisas", "dar um passo", "conquistar um espaço novo"
  if (/^(fazer|dar|conquistar|sentir|ser|ter|construir|realizar)\s+(as coisas|um passo|um espaço|mais)/i.test(v)) {
    return true;
  }
  return false;
}

function isJunkBase(it: Insight): boolean {
  const rawKey = (it.key || "").trim().toLowerCase();
  const rawValue = (it.value || "").trim();
  if (!rawValue || rawValue.length <= 2) return true;
  if (VALUE_PLACEHOLDERS.has(rawValue.toLowerCase())) return true;
  if (/^\d+$/.test(rawValue)) return true;
  if (/^EP\s/i.test(rawValue)) return true;
  if (KEY_BLACKLIST.has(rawKey)) return true;
  if (KEY_PREFIX_BLACKLIST.some((p) => rawKey.startsWith(p))) return true;
  if (rawValue.length > 120) return true;
  if (isGenericAiPhrase(rawValue)) return true;
  return false;
}

function prettyLabel(key: string | null): string {
  if (!key) return "";
  const base = stripSuffixNumber(key).replace(/_/g, " ").trim();
  if (!base) return "";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function asSentence(s: string): string {
  const t = s.trim();
  if (!t) return "";
  const first = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?…]$/.test(first) ? first : first + ".";
}

// ---------- TIPOS DE CURADORIA ----------

type PersonGroup = {
  label: string; // ex: "Filhas"
  names: string[]; // pode ser vazio quando a relação foi mencionada mas sem nome próprio
};

function extractUserName(insights: Insight[]): string | null {
  const candidates = insights.filter(
    (i) => (i.key || "").trim().toLowerCase() === "nome" && i.value,
  );
  if (!candidates.length) return null;
  const best = candidates.sort(
    (a, b) => (b.importance ?? 0) - (a.importance ?? 0),
  )[0];
  const v = (best.value || "").trim();
  return looksLikeProperName(v) ? v.split(/\s+/)[0] : null;
}

function curatePeople(insights: Insight[]): PersonGroup[] {
  const byBase = new Map<string, Set<string>>();
  for (const it of insights) {
    if (it.category !== "pessoa") continue;
    if (isJunkBase(it)) continue;
    const rawKey = (it.key || "").trim().toLowerCase();
    if (!isPeopleKey(rawKey)) continue;
    const v = (it.value || "").trim();
    const base = stripSuffixNumber(rawKey);
    const set = byBase.get(base) || new Set<string>();
    // Só adiciona o valor se parecer nome próprio; chips sem nome ainda aparecem.
    if (looksLikeProperName(v)) set.add(v);
    byBase.set(base, set);
  }
  // Pluraliza label quando há 2+ nomes na mesma relação
  const pluralMap: Record<string, string> = {
    filha: "Filhas", filho: "Filhos",
    irma: "Irmãs", irmã: "Irmãs", irmao: "Irmãos", irmão: "Irmãos",
    sobrinha: "Sobrinhas", sobrinho: "Sobrinhos",
    amiga: "Amigas", amigo: "Amigos",
    prima: "Primas", primo: "Primos",
    tia: "Tias", tio: "Tios",
    neta: "Netas", neto: "Netos",
  };
  return Array.from(byBase.entries())
    .map(([base, set]) => {
      const names = Array.from(set);
      const singular = prettyLabel(base);
      const label = names.length > 1 && pluralMap[base] ? pluralMap[base] : singular;
      return { label, names };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

type ProseItem = { key: string | null; value: string };

function curateProseSection(
  insights: Insight[],
  category: string,
  minImportance: number,
  limit: number,
): ProseItem[] {
  const filtered = insights
    .filter((i) => i.category === category)
    .filter((i) => (i.importance ?? 0) >= minImportance)
    .filter((i) => !isJunkBase(i));
  // Dedup por valor (case-insensitive), mantendo o de maior importance
  const map = new Map<string, { key: string | null; value: string; importance: number; date: number }>();
  for (const it of filtered) {
    const v = (it.value || "").trim();
    if (!v) continue;
    const norm = v.toLowerCase();
    const importance = it.importance ?? 0;
    const date = it.last_mentioned_at ? Date.parse(it.last_mentioned_at) : 0;
    const existing = map.get(norm);
    if (!existing || importance > existing.importance ||
        (importance === existing.importance && date > existing.date)) {
      map.set(norm, { key: it.key, value: v, importance, date });
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.importance - a.importance || b.date - a.date)
    .slice(0, limit)
    .map((x) => ({ key: x.key, value: asSentence(x.value) }));
}

// ---------- COMPONENTES ----------

const MAX_PROSE = 6;
const MAX_PEOPLE = 8;
const MAX_THEMES = 12;

export function SobreVoceTab({ userId }: { userId: string }) {
  const { data: profile } = useQuery({
    queryKey: ["portal-profile-name", userId],
    queryFn: async () => {
      const { data } = await supabasePortal
        .from("profiles")
        .select("name")
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
    enabled: !!userId,
  });

  const { data: portrait, isLoading, refetch } = useQuery({
    queryKey: ["portal-user-portrait", userId],
    queryFn: async () => {
      const { data } = await supabasePortal
        .from("user_portraits" as any)
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      return (data as Portrait | null) ?? null;
    },
    enabled: !!userId,
  });

  // Dispara geração em background se: não tem retrato OU >24h
  useEffect(() => {
    if (!userId) return;
    if (isLoading) return;
    const stale = !portrait ||
      (Date.now() - new Date(portrait.generated_at).getTime()) / 36e5 > 24;
    if (!stale) return;
    supabasePortal.functions
      .invoke("generate-user-portrait", { body: { user_id: userId } })
      .then(() => refetch())
      .catch((e) => console.warn("generate-user-portrait failed", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isLoading, portrait?.generated_at]);

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

  const dedupedThemes = useMemo(() => {
    const map = new Map<string, any>();
    for (const t of themes || []) {
      const name = (t.theme_name || "").trim();
      const key = name.toLowerCase();
      if (!key) continue;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...t, theme_name: name });
      } else {
        existing.session_count = (existing.session_count || 0) + (t.session_count || 0);
        if (t.status === "active") existing.status = "active";
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return (b.session_count || 0) - (a.session_count || 0);
    });
  }, [themes]);

  const activeThemes = dedupedThemes.filter((t) => t.status !== "resolved").slice(0, MAX_THEMES);
  const resolvedThemes = dedupedThemes.filter((t) => t.status === "resolved").slice(0, MAX_THEMES);

  if (isLoading) return <PortalLoadingInline />;

  const firstName = (profile?.name || "").trim().split(/\s+/)[0] || null;

  const hasAny =
    !!portrait?.intro ||
    (portrait?.pessoas?.length ?? 0) > 0 ||
    (portrait?.o_que_te_move?.length ?? 0) > 0 ||
    (portrait?.padroes?.length ?? 0) > 0 ||
    (portrait?.preferencias?.length ?? 0) > 0 ||
    (portrait?.conquistas?.length ?? 0) > 0 ||
    (portrait?.sensiveis?.length ?? 0) > 0 ||
    activeThemes.length > 0 ||
    resolvedThemes.length > 0;

  if (!hasAny) {
    return (
      <div className="space-y-5">
        <SectionHeader icon={User} title="Sobre você" />
        <EmptyState
          icon={Heart}
          title={portrait ? "A Aura ainda está te conhecendo" : "Organizando o que sei sobre você…"}
          description={portrait
            ? "Conforme vocês conversam, ela vai mapear identidade, valores e temas recorrentes seus aqui."
            : "Isso leva alguns segundos. Volte daqui a pouco e o seu retrato vai estar aqui."}
        />
      </div>
    );
  }

  const greeting = firstName ? `Oi, ${firstName}` : "Sobre você";

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="animate-in fade-in slide-in-from-top-2 duration-500">
        <h2 className="text-2xl font-semibold text-foreground font-['Nunito'] tracking-tight">
          {greeting}
        </h2>
        <p className="text-sm text-muted-foreground font-['Nunito'] mt-1">
          Aqui está o que eu fui aprendendo sobre você nas nossas conversas.
        </p>
      </div>

      {/* Intro narrativa — card destaque */}
      {portrait?.intro && (
        <div className="relative overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/8 via-accent/3 to-transparent p-5 animate-in fade-in duration-700">
          <Sparkles size={16} className="text-accent absolute top-4 right-4 opacity-60" />
          <p className="text-[15px] text-foreground font-['Nunito'] leading-relaxed italic pr-6">
            {portrait.intro}
          </p>
        </div>
      )}

      {/* Pessoas — chips */}
      {portrait?.pessoas && portrait.pessoas.length > 0 && (
        <SectionShell title="Pessoas da sua vida" icon={Users}>
          <div className="grid grid-cols-2 gap-2">
            {portrait.pessoas.map((p, i) => (
              <div
                key={`${p.label}-${i}`}
                className="rounded-xl border border-border bg-card px-3 py-2.5"
              >
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold font-['Nunito']">
                  {p.label}
                </p>
                {p.names.length > 0 && (
                  <p className="text-sm text-foreground font-['Nunito'] leading-snug mt-0.5">
                    {p.names.join(", ")}
                  </p>
                )}
                {p.nota && (
                  <p className="text-xs text-muted-foreground font-['Nunito'] leading-snug mt-0.5 italic">
                    {p.nota}
                  </p>
                )}
              </div>
            ))}
          </div>
        </SectionShell>
      )}

      {/* O que te move */}
      {portrait?.o_que_te_move && portrait.o_que_te_move.length > 0 && (
        <SectionShell title="O que te move" icon={Compass}>
          <ProseList items={portrait.o_que_te_move} />
        </SectionShell>
      )}

      {/* Padrões */}
      {portrait?.padroes && portrait.padroes.length > 0 && (
        <SectionShell title="Padrões que a Aura percebeu" icon={Activity}>
          <div className="space-y-3">
            {portrait.padroes.map((v, i) => (
              <blockquote key={i} className="border-l-2 border-accent/40 pl-3">
                <p className="text-sm text-foreground/90 font-['Nunito'] italic leading-relaxed">
                  {v}
                </p>
              </blockquote>
            ))}
          </div>
        </SectionShell>
      )}

      {/* Preferências */}
      {portrait?.preferencias && portrait.preferencias.length > 0 && (
        <SectionShell title="Preferências e gostos" icon={Heart}>
          <ProseList items={portrait.preferencias} />
        </SectionShell>
      )}

      {/* Conquistas */}
      {portrait?.conquistas && portrait.conquistas.length > 0 && (
        <SectionShell title="Conquistas" icon={Trophy}>
          <div className="flex flex-wrap gap-2">
            {portrait.conquistas.map((v, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-xs font-medium font-['Nunito']"
              >
                <Trophy size={12} />
                {v.replace(/\.$/, "")}
              </span>
            ))}
          </div>
        </SectionShell>
      )}

      {/* Sensíveis */}
      {portrait?.sensiveis && portrait.sensiveis.length > 0 && (
        <CollapsibleShell title="Pontos sensíveis" icon={ShieldAlert}>
          <p className="text-xs text-muted-foreground italic font-['Nunito']">
            Tópicos delicados que você compartilhou com a Aura.
          </p>
          <ProseList items={portrait.sensiveis} muted />
        </CollapsibleShell>
      )}

      {/* Temas em movimento */}
      {(activeThemes.length > 0 || resolvedThemes.length > 0) && (
        <div className="space-y-4">
          {activeThemes.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Tag size={14} className="text-accent" />
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold font-['Nunito']">
                  Temas em movimento
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {activeThemes.map((t: any) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center px-3 py-1.5 rounded-full bg-accent/10 text-accent text-xs font-medium font-['Nunito']"
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
          {resolvedThemes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground/70 font-semibold font-['Nunito']">
                Já trabalhados
              </p>
              <div className="flex flex-wrap gap-2">
                {resolvedThemes.map((t: any) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-xs font-medium font-['Nunito'] line-through opacity-70"
                  >
                    {t.theme_name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rodapé: corrigir no WhatsApp */}
      <a
        href={auraWhatsAppLink("Oi Aura, queria corrigir uma coisa no que você sabe sobre mim.")}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 mt-2 px-4 py-3 rounded-xl border border-border bg-card text-sm text-muted-foreground hover:text-accent hover:border-accent/40 transition-colors font-['Nunito']"
      >
        <MessageCircle size={14} />
        Algo aqui não bate? Me corrige no WhatsApp →
      </a>
    </div>
  );
}

// ---------- SHELLS ----------

function SectionShell({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-accent" />
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold font-['Nunito']">
          {title}
        </p>
      </div>
      {children}
    </div>
  );
}

function CollapsibleShell({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left"
      >
        <Icon size={14} className="text-accent" />
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold font-['Nunito']">
          {title}
        </p>
        <span className="ml-auto text-muted-foreground">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {open && <div className="space-y-3">{children}</div>}
    </div>
  );
}

function ProseCard({ item, muted }: { item: ProseItem; muted?: boolean }) {
  return (
    <div className="space-y-0.5">
      {item.key && (
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold font-['Nunito']">
          {prettyLabel(item.key)}
        </p>
      )}
      <p
        className={`text-sm font-['Nunito'] leading-relaxed ${
          muted ? "text-foreground/85" : "text-foreground"
        }`}
      >
        {item.value}
      </p>
    </div>
  );
}