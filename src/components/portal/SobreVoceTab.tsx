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
import { sanitizePortalText } from "./sanitize";
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
      {/* Hero navy — retrato narrativo */}
      <div className="relative overflow-hidden rounded-3xl bg-[#1B2A4E] p-6 animate-in fade-in slide-in-from-top-2 duration-500">
        <Sparkles size={16} className="text-[#B8A5D9] absolute top-5 right-5 opacity-70" />
        <p className="text-[10px] uppercase tracking-[0.2em] text-[#B8A5D9] font-bold font-['Nunito']">
          Retrato
        </p>
        <h2 className="font-['Fraunces'] text-3xl font-semibold text-[#F5F0E8] mt-1 tracking-tight">
          {greeting}
        </h2>
        {portrait?.intro ? (
          <p className="text-[15px] text-[#F5F0E8]/85 font-['Nunito'] leading-relaxed mt-3 pr-6">
            {sanitizePortalText(portrait.intro)}
          </p>
        ) : (
          <p className="text-sm text-[#F5F0E8]/70 font-['Nunito'] mt-2">
            O que fui aprendendo sobre você nas nossas conversas.
          </p>
        )}
      </div>

      {/* Pessoas — chips */}
      {portrait?.pessoas && portrait.pessoas.length > 0 && (
        <SectionShell title="Pessoas da sua vida" icon={Users}>
          <div className="grid grid-cols-2 gap-2">
            {portrait.pessoas.map((p, i) => (
              <div
                key={`${p.label}-${i}`}
                className="rounded-xl border border-[#87A878]/15 bg-white/60 px-3 py-2.5"
              >
                <p className="text-[10px] uppercase tracking-[0.15em] text-[#87A878] font-bold font-['Nunito']">
                  {p.label}
                </p>
                {p.names.length > 0 && (
                  <p className="text-sm text-[#1B2A4E] font-['Nunito'] font-semibold leading-snug mt-0.5">
                    {p.names.join(", ")}
                  </p>
                )}
                {p.nota && (
                  <p className="text-xs text-[#2A2A2A]/60 font-['Nunito'] leading-snug mt-0.5 italic">
                    {sanitizePortalText(p.nota)}
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
              <blockquote key={i} className="border-l-[3px] border-[#B8A5D9] pl-4 py-1">
                <p className="text-[15px] text-[#1B2A4E]/85 font-['Fraunces'] italic leading-relaxed">
                  {sanitizePortalText(v)}
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
                className="inline-flex items-start gap-1.5 px-3 py-2 rounded-2xl bg-[#B8A5D9]/20 text-[#1B2A4E] text-xs font-semibold font-['Nunito'] leading-snug max-w-full whitespace-normal"
              >
                <Trophy size={12} className="mt-0.5 shrink-0 text-[#87A878]" />
                <span>{sanitizePortalText(v).replace(/\.$/, "")}</span>
              </span>
            ))}
          </div>
        </SectionShell>
      )}

      {/* Sensíveis */}
      {portrait?.sensiveis && portrait.sensiveis.length > 0 && (
        <CollapsibleShell title="Pontos sensíveis" icon={ShieldAlert}>
          <p className="text-xs text-[#2A2A2A]/60 italic font-['Nunito']">
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
                <Tag size={14} className="text-[#87A878]" />
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#1B2A4E] font-bold font-['Nunito']">
                  Temas em movimento
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {activeThemes.map((t: any) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center px-3 py-2 rounded-full bg-[#87A878]/15 text-[#1B2A4E] text-xs font-semibold font-['Nunito'] whitespace-nowrap"
                  >
                    {t.theme_name}
                    {t.session_count > 1 && (
                      <span className="ml-1 opacity-60">· {t.session_count}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
          {resolvedThemes.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#2A2A2A]/50 font-bold font-['Nunito']">
                Já trabalhados
              </p>
              <div className="flex flex-wrap gap-2.5">
                {resolvedThemes.map((t: any) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center px-3 py-2 rounded-full bg-[#F5F0E8] text-[#2A2A2A]/60 text-xs font-medium font-['Nunito'] line-through whitespace-nowrap border border-[#87A878]/10"
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
      <ContribuicaoUsuario userId={userId} />

      <a
        href={auraWhatsAppLink("Oi Aura, queria corrigir uma coisa no que você sabe sobre mim.")}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 mt-2 px-4 py-3 rounded-xl border border-[#87A878]/20 bg-white/60 text-sm text-[#1B2A4E]/70 hover:text-[#1B2A4E] hover:border-[#87A878]/50 transition-colors font-['Nunito']"
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
        <Icon size={14} className="text-[#87A878]" />
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#1B2A4E] font-bold font-['Nunito']">
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
        <Icon size={14} className="text-[#87A878]" />
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#1B2A4E] font-bold font-['Nunito']">
          {title}
        </p>
        <span className="ml-auto text-[#1B2A4E]/50">
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
          <span className="text-[#87A878] mt-1.5 select-none leading-none">•</span>
          <span
            className={`text-[14px] font-['Nunito'] leading-relaxed ${
              muted ? "text-[#2A2A2A]/75" : "text-[#2A2A2A]"
            }`}
          >
            {sanitizePortalText(v)}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ============================================================
// ContribuicaoUsuario — "O que você quer que a Aura saiba"
// Absorve o CRUD que antes vivia na aba Memória, mas com convite ativo
// por prompts (medos, objetivos, desafios, valores) em vez de campo em branco.
// Lê/grava em user_insights com source implícito via category="user_added".
// ============================================================

type UserAdded = {
  id: string;
  key: string;
  value: string;
  created_at: string | null;
};

type PromptOption = {
  id: string;
  icon: React.ElementType;
  label: string;
  placeholder: string;
  keyLabel: string; // como fica salvo no campo "key" do insight
};

const PROMPTS: PromptOption[] = [
  {
    id: "objetivo",
    icon: Target,
    label: "Um objetivo importante",
    placeholder: "Onde eu quero chegar em...",
    keyLabel: "Objetivo",
  },
  {
    id: "medo",
    icon: Frown,
    label: "Um medo ou receio",
    placeholder: "Uma coisa que me trava é...",
    keyLabel: "Medo",
  },
  {
    id: "desafio",
    icon: Swords,
    label: "Um desafio atual",
    placeholder: "O que estou enfrentando agora é...",
    keyLabel: "Desafio",
  },
  {
    id: "valor",
    icon: Gem,
    label: "Um valor inegociável",
    placeholder: "Uma coisa que eu não abro mão é...",
    keyLabel: "Valor",
  },
  {
    id: "quem",
    icon: Sprout,
    label: "Quem eu quero me tornar",
    placeholder: "A pessoa que eu quero me tornar é...",
    keyLabel: "Aspiração",
  },
  {
    id: "outro",
    icon: PenLine,
    label: "Outra coisa",
    placeholder: "O que a Aura deveria saber sobre você?",
    keyLabel: "Sobre mim",
  },
];

function ContribuicaoUsuario({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [selectedPrompt, setSelectedPrompt] = useState<PromptOption | null>(null);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<UserAdded | null>(null);

  const { data: items, isLoading } = useQuery({
    queryKey: ["portal-user-added", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("user_insights")
        .select("id, key, value, created_at")
        .eq("user_id", userId)
        .eq("category", "user_added")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as UserAdded[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["portal-user-added", userId] });
    qc.invalidateQueries({ queryKey: ["portal-user-portrait", userId] });
  };

  const addMut = useMutation({
    mutationFn: async () => {
      if (!selectedPrompt) throw new Error("Escolha um tema.");
      const val = draft.trim();
      if (!val) throw new Error("Escreve alguma coisa antes de salvar.");
      const { error } = await supabasePortal.from("user_insights").insert({
        user_id: userId,
        category: "user_added",
        key: selectedPrompt.keyLabel,
        value: val,
        importance: 9,
        mentioned_count: 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Guardado", description: "A Aura já sabe disso." });
      setSelectedPrompt(null);
      setDraft("");
      invalidate();
    },
    onError: (e: any) =>
      toast({ title: "Não deu", description: e.message, variant: "destructive" }),
  });

  const editMut = useMutation({
    mutationFn: async ({ item, newVal }: { item: UserAdded; newVal: string }) => {
      const { error } = await supabasePortal
        .from("user_insights")
        .update({ value: newVal })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Atualizado" });
      setEditingId(null);
      invalidate();
    },
    onError: (e: any) =>
      toast({ title: "Não deu", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (item: UserAdded) => {
      const { error: corrErr } = await supabasePortal.from("user_memory_corrections").insert({
        user_id: userId,
        correction_text: `Ignorar: ${item.key} — ${item.value}.`,
        source: "user_portal",
        confidence: 1,
      });
      if (corrErr) throw corrErr;
      const { error } = await supabasePortal.from("user_insights").delete().eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Apagado" });
      setConfirmDelete(null);
      invalidate();
    },
    onError: (e: any) =>
      toast({ title: "Não deu", description: e.message, variant: "destructive" }),
  });

  const list = items ?? [];

  return (
    <div className="pt-2 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-[#87A878]" />
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#1B2A4E] font-bold font-['Nunito']">
          O que você quer que a Aura saiba
        </p>
      </div>
      <p className="text-sm text-[#2A2A2A]/65 font-['Nunito'] -mt-2">
        Reforce coisas suas que ainda não apareceram nas conversas — a Aura leva em conta.
      </p>

      {/* Itens já adicionados */}
      {!isLoading && list.length > 0 && (
        <div className="space-y-2">
          {list.map((item) => {
            const isEditing = editingId === item.id;
            return (
              <div
                key={item.id}
                className="rounded-xl border border-[#87A878]/15 bg-white/60 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-[#87A878] font-bold font-['Nunito']">
                      {item.key}
                    </p>
                    {isEditing ? (
                      <textarea
                        autoFocus
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={2}
                        className="mt-1 w-full bg-[#F5F0E8] rounded-lg px-2 py-1.5 text-sm border border-[#87A878] font-['Nunito'] resize-none text-[#1B2A4E]"
                      />
                    ) : (
                      <p className="text-sm text-[#1B2A4E] font-['Nunito'] mt-0.5 break-words leading-relaxed">
                        {sanitizePortalText(item.value)}
                      </p>
                    )}
                  </div>
                  {isEditing ? (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() =>
                          editMut.mutate({ item, newVal: editDraft.trim() })
                        }
                        disabled={editMut.isPending || !editDraft.trim()}
                        className="p-1.5 rounded-lg bg-[#1B2A4E] text-[#F5F0E8] disabled:opacity-60"
                        title="Salvar"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1.5 rounded-lg text-[#2A2A2A]/60 hover:bg-[#F5F0E8]"
                        title="Cancelar"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1 shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setEditingId(item.id);
                          setEditDraft(item.value);
                        }}
                        className="p-1.5 rounded-lg text-[#2A2A2A]/60 hover:bg-[#F5F0E8] hover:text-[#1B2A4E]"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(item)}
                        disabled={deleteMut.isPending}
                        className="p-1.5 rounded-lg text-[#2A2A2A]/60 hover:bg-destructive/10 hover:text-destructive"
                        title="Apagar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Formulário aberto */}
      {selectedPrompt ? (
        <div className="rounded-xl border border-[#87A878]/30 bg-[#87A878]/8 p-4 space-y-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <selectedPrompt.icon size={16} className="text-[#1B2A4E]" />
            <p className="text-sm font-bold text-[#1B2A4E] font-['Nunito']">
              {selectedPrompt.label}
            </p>
          </div>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={selectedPrompt.placeholder}
            rows={3}
            className="w-full bg-white rounded-lg px-3 py-2 text-sm border border-[#87A878]/25 font-['Nunito'] resize-none focus:outline-none focus:border-[#1B2A4E] text-[#1B2A4E]"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setSelectedPrompt(null);
                setDraft("");
              }}
              className="px-3 py-1.5 text-xs text-[#2A2A2A]/60 hover:text-[#1B2A4E] font-['Nunito']"
            >
              Cancelar
            </button>
            <button
              onClick={() => addMut.mutate()}
              disabled={addMut.isPending || !draft.trim()}
              className="px-4 py-2 text-xs rounded-full bg-[#1B2A4E] text-[#F5F0E8] font-bold font-['Nunito'] disabled:opacity-60 hover:bg-[#1B2A4E]/90"
            >
              Salvar
            </button>
          </div>
        </div>
      ) : (
        // Seletor de prompts
        <div>
          <p className="text-xs text-[#2A2A2A]/60 font-['Nunito'] mb-2 flex items-center gap-1.5">
            <Plus size={12} />
            Sobre o quê você quer contar?
          </p>
          <div className="grid grid-cols-2 gap-2">
            {PROMPTS.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedPrompt(p);
                    setDraft("");
                  }}
                  className="flex items-center gap-2 rounded-xl border border-[#87A878]/15 bg-white/60 px-3 py-3 text-left hover:border-[#1B2A4E]/30 hover:bg-white transition-colors"
                >
                  <Icon size={14} className="text-[#87A878] shrink-0" />
                  <span className="text-xs text-[#1B2A4E] font-['Nunito'] font-semibold leading-tight">
                    {p.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar isto?</AlertDialogTitle>
            <AlertDialogDescription>
              A Aura vai deixar de considerar "{confirmDelete?.value}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && deleteMut.mutate(confirmDelete)}
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}