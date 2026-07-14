import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { BookOpen, Pencil, Trash2, Star, Plus, Check, X, Search, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { EmptyState, PortalLoadingInline, SectionHeader } from "./shared";
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

type Insight = {
  id: string;
  category: string | null;
  key: string;
  value: string;
  importance: number | null;
  mentioned_count: number | null;
  last_mentioned_at: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  pessoas: "Pessoas na sua vida",
  fatos: "Fatos e eventos",
  identidade: "Quem você é",
  rotina: "Sua rotina",
  preferencias: "Preferências",
  user_added: "Você contou pra Aura",
  outros: "Outros",
  // Fallback defensivo caso o extractor grave categoria em inglês
  people: "Pessoas na sua vida",
  facts: "Fatos e eventos",
  identity: "Quem você é",
  routine: "Sua rotina",
  preferences: "Preferências",
  other: "Outros",
};

function labelFor(cat: string | null) {
  if (!cat) return CATEGORY_LABELS.outros;
  return CATEGORY_LABELS[cat] ?? cat;
}

const PAGE_SIZE = 10;
// Ordem preferida das categorias na lista.
const CATEGORY_ORDER = [
  "user_added",
  "pessoas",
  "people",
  "identidade",
  "identity",
  "fatos",
  "facts",
  "rotina",
  "routine",
  "preferencias",
  "preferences",
  "outros",
  "other",
];

function categoryRank(cat: string) {
  const i = CATEGORY_ORDER.indexOf(cat);
  return i === -1 ? 99 : i;
}

export function MemoriaTab({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Insight | null>(null);
  const [query, setQuery] = useState("");
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [pageByCat, setPageByCat] = useState<Record<string, number>>({});

  const toggleCat = (cat: string) =>
    setOpenCats((s) => ({ ...s, [cat]: !s[cat] }));
  const showMore = (cat: string) =>
    setPageByCat((s) => ({ ...s, [cat]: (s[cat] ?? 1) + 1 }));

  const { data: profile } = useQuery({
    queryKey: ["portal-memoria-profile", userId],
    queryFn: async () => {
      const { data } = await supabasePortal
        .from("profiles")
        .select("created_at")
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
  });

  const { data: insights, isLoading } = useQuery({
    queryKey: ["portal-memoria", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal
        .from("user_insights")
        .select("id, category, key, value, importance, mentioned_count, last_mentioned_at")
        .eq("user_id", userId)
        .order("importance", { ascending: false })
        .order("mentioned_count", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Insight[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["portal-memoria", userId] });
    qc.invalidateQueries({ queryKey: ["portal-intimacy", userId] });
  };

  const correctMut = useMutation({
    mutationFn: async ({ item, newVal }: { item: Insight; newVal: string }) => {
      const { error: upErr } = await supabasePortal
        .from("user_insights")
        .update({ value: newVal })
        .eq("id", item.id);
      if (upErr) throw upErr;
      const { error: corrErr } = await supabasePortal.from("user_memory_corrections").insert({
        user_id: userId,
        correction_text: `Sobre "${item.key}": era "${item.value}", é "${newVal}".`,
        source: "user_portal",
        confidence: 1,
      });
      if (corrErr) throw corrErr;
    },
    onSuccess: () => {
      toast({ title: "Corrigido", description: "A Aura vai respeitar essa correção." });
      setEditingId(null);
      invalidate();
    },
    onError: (e: any) => toast({ title: "Não deu", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (item: Insight) => {
      const { error: corrErr } = await supabasePortal.from("user_memory_corrections").insert({
        user_id: userId,
        correction_text: `Ignorar: ${item.key} — ${item.value}.`,
        source: "user_portal",
        confidence: 1,
      });
      if (corrErr) throw corrErr;
      const { error: delErr } = await supabasePortal.from("user_insights").delete().eq("id", item.id);
      if (delErr) throw delErr;
    },
    onSuccess: () => {
      toast({ title: "Apagado", description: "A Aura vai deixar isso de lado." });
      invalidate();
    },
    onError: (e: any) => toast({ title: "Não deu", description: e.message, variant: "destructive" }),
  });

  const importantMut = useMutation({
    mutationFn: async (item: Insight) => {
      const { error } = await supabasePortal
        .from("user_insights")
        .update({ importance: 10 })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Marcado como importante" });
      invalidate();
    },
    onError: (e: any) => toast({ title: "Não deu", description: e.message, variant: "destructive" }),
  });

  const addMut = useMutation({
    mutationFn: async () => {
      if (!newKey.trim() || !newValue.trim()) throw new Error("Preencha os dois campos.");
      const { error } = await supabasePortal.from("user_insights").insert({
        user_id: userId,
        category: "user_added",
        key: newKey.trim(),
        value: newValue.trim(),
        importance: 9,
        mentioned_count: 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Adicionado", description: "A Aura já sabe disso." });
      setAdding(false);
      setNewKey("");
      setNewValue("");
      invalidate();
    },
    onError: (e: any) => toast({ title: "Não deu", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <PortalLoadingInline />;

  // Filtro por busca (case-insensitive, em key + value)
  const q = query.trim().toLowerCase();
  const filtered = (insights ?? []).filter((it) => {
    if (!q) return true;
    return (
      (it.key ?? "").toLowerCase().includes(q) ||
      (it.value ?? "").toLowerCase().includes(q)
    );
  });

  const grouped = new Map<string, Insight[]>();
  for (const it of filtered) {
    const cat = it.category ?? "outros";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(it);
  }
  for (const [, items] of grouped) {
    items.sort(
      (a, b) =>
        (b.importance ?? 0) - (a.importance ?? 0) ||
        (b.mentioned_count ?? 0) - (a.mentioned_count ?? 0),
    );
  }
  const sortedCats = Array.from(grouped.entries()).sort(
    ([a], [b]) => categoryRank(a) - categoryRank(b),
  );

  const isNewUser =
    profile?.created_at &&
    Date.now() - new Date(profile.created_at).getTime() < 7 * 24 * 60 * 60 * 1000;

  return (
    <div className="space-y-5">
      <SectionHeader icon={BookOpen} title="O que a Aura sabe sobre você" />

      <p className="text-sm text-muted-foreground font-['Nunito'] -mt-2">
        Este é o caderno dela. Você pode corrigir, apagar ou marcar como importante — a Aura respeita
        o que você define aqui.
      </p>

      {/* Adicionar */}
      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-accent/40 py-3 text-sm text-accent hover:bg-accent/5 transition-all font-['Nunito']"
        >
          <Plus size={16} />
          Adicionar algo que a Aura deveria saber
        </button>
      ) : (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 space-y-2 animate-fade-in">
          <input
            autoFocus
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="Sobre o quê? (ex: minha irmã Ana)"
            className="w-full bg-background rounded-lg px-3 py-2 text-sm border border-border font-['Nunito']"
          />
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="O que a Aura deveria saber?"
            className="w-full bg-background rounded-lg px-3 py-2 text-sm border border-border font-['Nunito']"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setAdding(false);
                setNewKey("");
                setNewValue("");
              }}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground font-['Nunito']"
            >
              Cancelar
            </button>
            <button
              onClick={() => addMut.mutate()}
              disabled={addMut.isPending}
              className="px-3 py-1.5 text-xs rounded-lg bg-accent text-accent-foreground font-semibold font-['Nunito'] disabled:opacity-60"
            >
              Salvar
            </button>
          </div>
        </div>
      )}

      {/* Busca */}
      {(insights?.length ?? 0) > 0 && (
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar na memória…"
            className="w-full bg-background rounded-xl pl-9 pr-3 py-2.5 text-sm border border-border font-['Nunito'] focus:outline-none focus:border-accent/60"
          />
        </div>
      )}

      {/* Lista ou empty */}
      {(insights?.length ?? 0) === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={isNewUser ? "Nos primeiros dias, a Aura ainda está ouvindo" : "A Aura ainda está te conhecendo"}
          description={
            isNewUser
              ? "O caderno dela começa a preencher conforme vocês conversam. Você também pode adicionar algo aqui em cima."
              : "Conforme vocês conversam, o que ela aprende aparece aqui — e você pode corrigir a qualquer momento."
          }
        />
      ) : sortedCats.length === 0 ? (
        <p className="text-sm text-muted-foreground font-['Nunito'] text-center py-8">
          Nada por aqui com "{query}".
        </p>
      ) : (
        <div className="space-y-3">
          {sortedCats.map(([cat, items]) => {
            // user_added e busca ativa: sempre aberto. Outros: colapsado por default.
            const forcedOpen = cat === "user_added" || !!q;
            const isOpen = forcedOpen || !!openCats[cat];
            const page = pageByCat[cat] ?? 1;
            const visible = items.slice(0, page * PAGE_SIZE);
            const remaining = items.length - visible.length;

            return (
              <div key={cat} className="rounded-xl border border-border/60 bg-card/60 overflow-hidden">
                <button
                  type="button"
                  onClick={() => !forcedOpen && toggleCat(cat)}
                  className={`w-full flex items-center justify-between px-4 py-3 ${
                    forcedOpen ? "cursor-default" : "hover:bg-muted/30"
                  }`}
                >
                  <span className="text-sm font-semibold text-foreground font-['Nunito']">
                    {labelFor(cat)}
                    <span className="ml-2 text-muted-foreground font-normal">({items.length})</span>
                  </span>
                  {!forcedOpen && (
                    <span className="text-muted-foreground">
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </span>
                  )}
                </button>

                {isOpen && (
                  <div className="px-3 pb-3 space-y-2">
                    {visible.map((item) => {
                  const isEditing = editingId === item.id;
                  const isImportant = (item.importance ?? 0) >= 10;
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-border/60 bg-card p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground font-['Nunito'] flex items-center gap-1.5">
                            {item.key}
                            {isImportant && <Star size={12} className="text-accent fill-accent" />}
                          </p>
                          {isEditing ? (
                            <input
                              autoFocus
                              value={draftValue}
                              onChange={(e) => setDraftValue(e.target.value)}
                              className="mt-1 w-full bg-background rounded-lg px-2 py-1.5 text-sm border border-accent font-['Nunito']"
                            />
                          ) : (
                            <p className="text-sm text-muted-foreground font-['Nunito'] mt-0.5 break-words">
                              {item.value}
                            </p>
                          )}
                          {(item.mentioned_count ?? 0) > 1 && !isEditing && (
                            <p className="text-[11px] text-muted-foreground/70 font-['Nunito'] mt-1">
                              Mencionado {item.mentioned_count}× em conversas
                            </p>
                          )}
                        </div>
                        {isEditing ? (
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() =>
                                correctMut.mutate({ item, newVal: draftValue.trim() })
                              }
                              disabled={correctMut.isPending || !draftValue.trim()}
                              className="p-1.5 rounded-lg bg-accent text-accent-foreground disabled:opacity-60"
                              title="Salvar"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted"
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
                                setDraftValue(item.value);
                              }}
                              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="Corrigir"
                            >
                              <Pencil size={14} />
                            </button>
                            {!isImportant && (
                              <button
                                onClick={() => importantMut.mutate(item)}
                                disabled={importantMut.isPending}
                                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-accent"
                                title="Marcar como importante"
                              >
                                <Star size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => setConfirmDelete(item)}
                              disabled={deleteMut.isPending}
                              className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
                    {remaining > 0 && (
                      <button
                        onClick={() => showMore(cat)}
                        className="w-full py-2 text-xs text-muted-foreground hover:text-accent font-['Nunito']"
                      >
                        Ver mais {Math.min(PAGE_SIZE, remaining)} de {remaining}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-['Fraunces']">
              Apagar da memória da Aura?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-['Nunito']">
              {confirmDelete ? (
                <>
                  A Aura vai deixar de considerar <strong>"{confirmDelete.key}"</strong> nas próximas
                  conversas. Isso não apaga o histórico do chat.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-['Nunito']">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) deleteMut.mutate(confirmDelete);
                setConfirmDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-['Nunito']"
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}