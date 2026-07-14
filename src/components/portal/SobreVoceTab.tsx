import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Target,
  Frown,
  Swords,
  Gem,
  Sprout,
  PenLine,
} from "lucide-react";
import { SectionHeader, EmptyState, PortalLoadingInline } from "./shared";
import { auraWhatsAppLink } from "./whatsapp";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

// Temas operacionais / meta-conversa que não devem aparecer como "temas de vida".
const THEME_BLACKLIST = [
  "mudança de assunto",
  "mudanca de assunto",
  "recusa de agendamento",
  "recusa de ajuda",
  "organizar sessões",
  "organizar sessoes",
  "agendar sessão",
  "agendar sessao",
  "cancelar sessão",
  "cancelar sessao",
  "reagendar sessão",
  "reagendar sessao",
  "setup mensal",
  "preferência por áudio",
  "preferencia por audio",
];

// Normaliza pra sentence-case: primeira letra maiúscula, resto preservando case interno.
// Se vier tudo em lowercase, capitaliza só a inicial; se vier Title Case, mantém.
function normalizeThemeName(raw: string): string {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return s;
  // Se está todo em lowercase → capitaliza só a 1ª letra
  if (s === s.toLowerCase()) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return s;
}

// ---------- COMPONENTES ----------

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
      return (data as unknown as Portrait | null) ?? null;
    },
    enabled: !!userId,
  });

  // Sempre invoca generate-user-portrait ao montar. O backend tem cache por
  // hash dos insights/temas + PROMPT_VERSION: se nada mudou retorna em ms
  // sem chamar LLM (custo zero). Refetch só quando o conteúdo realmente
  // mudou — evita o portal mostrar versão antiga em cache do react-query.
  useEffect(() => {
    if (!userId) return;
    if (isLoading) return;
    supabasePortal.functions
      .invoke("generate-user-portrait", { body: { user_id: userId } })
      .then((res: any) => {
        const cached = res?.data?.cached;
        const newGeneratedAt = res?.data?.portrait?.generated_at;
        if (cached === false || (newGeneratedAt && newGeneratedAt !== portrait?.generated_at)) {
          refetch();
        }
      })
      .catch((e) => console.warn("generate-user-portrait failed", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isLoading]);

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
      const rawName = (t.theme_name || "").trim();
      if (!rawName) continue;
      const lower = rawName.toLowerCase();
      // Banlist operacional (substring)
      if (THEME_BLACKLIST.some((b) => lower.includes(b))) continue;
      const name = normalizeThemeName(rawName);
      const key = name.toLowerCase();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...t, theme_name: name });
      } else {
        existing.session_count = (existing.session_count || 0) + (t.session_count || 0);
        if (t.status === "active") existing.status = "active";
      }
    }
    // Dedup semântico por substring: se "ansiedade" está contido em "Dominando a ansiedade",
    // fundir no mais longo (mais descritivo), somando session_count.
    const items = Array.from(map.values());
    const removed = new Set<string>();
    for (let i = 0; i < items.length; i++) {
      if (removed.has(items[i].theme_name.toLowerCase())) continue;
      for (let j = 0; j < items.length; j++) {
        if (i === j) continue;
        const a = items[i].theme_name.toLowerCase();
        const b = items[j].theme_name.toLowerCase();
        if (removed.has(b)) continue;
        // a contido em b (a mais curto), e mesmo status-família → mesclar em b
        if (a !== b && b.includes(a) && a.length >= 4) {
          items[j].session_count =
            (items[j].session_count || 0) + (items[i].session_count || 0);
          if (items[i].status === "active") items[j].status = "active";
          removed.add(a);
          break;
        }
      }
    }
    return items
      .filter((it) => !removed.has(it.theme_name.toLowerCase()))
      .sort((a, b) => {
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
          title="A Aura ainda está te conhecendo"
          description="Depois de algumas conversas ela mapeia aqui identidade, pessoas próximas, valores e temas recorrentes seus."
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
          <div className="flex flex-wrap gap-2.5">
            {portrait.conquistas.map((v, i) => (
              <span
                key={i}
                className="inline-flex items-start gap-1.5 px-3 py-2 rounded-2xl bg-accent/10 text-accent text-xs font-medium font-['Nunito'] leading-snug max-w-full whitespace-normal"
              >
                <Trophy size={12} className="mt-0.5 shrink-0" />
                <span>{v.replace(/\.$/, "")}</span>
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
              <div className="flex flex-wrap gap-2.5">
                {activeThemes.map((t: any) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center px-3 py-2 rounded-full bg-accent/10 text-accent text-xs font-medium font-['Nunito'] whitespace-nowrap"
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
              <div className="flex flex-wrap gap-2.5">
                {resolvedThemes.map((t: any) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center px-3 py-2 rounded-full bg-muted text-muted-foreground text-xs font-medium font-['Nunito'] line-through opacity-70 whitespace-nowrap"
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

function ProseList({ items, muted }: { items: string[]; muted?: boolean }) {
  return (
    <ul className="space-y-2.5">
      {items.map((v, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="text-accent mt-1.5 select-none leading-none">•</span>
          <span
            className={`text-[14px] font-['Nunito'] leading-relaxed ${
              muted ? "text-foreground/85" : "text-foreground"
            }`}
          >
            {v}
          </span>
        </li>
      ))}
    </ul>
  );
}