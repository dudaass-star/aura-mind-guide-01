import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, Plus, Trash2, Search, Sparkles, Loader2, X, Save, BookOpen, ThumbsUp, ThumbsDown, Pencil } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface KBArticle {
  id: string;
  title: string;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
  is_active: boolean;
  usage_count: number;
  embedding: unknown | null;
  created_at: string;
  updated_at: string;
  approved_count?: number;
  edited_count?: number;
  rejected_count?: number;
}

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'cobranca', label: 'Cobrança & Pagamento' },
  { value: 'assinatura', label: 'Assinatura' },
  { value: 'produto', label: 'Produto & Técnico' },
  { value: 'privacidade', label: 'Privacidade & Legal' },
  { value: 'outro', label: 'Outro' },
];

const CATEGORY_COLORS: Record<string, string> = {
  cobranca: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  assinatura: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  produto: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  privacidade: 'bg-purple-500/15 text-purple-700 dark:text-purple-300',
  outro: 'bg-muted text-muted-foreground',
};

const EMPTY: Partial<KBArticle> = {
  title: '',
  category: 'cobranca',
  question: '',
  answer: '',
  keywords: [],
  is_active: true,
};

export default function AdminSupportKnowledge() {
  const { isLoading: authLoading, isAdmin, redirectIfNotAdmin } = useAdminAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<KBArticle>>(EMPTY);
  const [keywordInput, setKeywordInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testQuery, setTestQuery] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<Array<{ id: string; title: string; category: string; similarity: number; question: string }>>([]);

  useEffect(() => { if (!authLoading) redirectIfNotAdmin(); }, [authLoading, redirectIfNotAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('support_knowledge_base')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) {
      toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
    } else {
      setArticles((data || []) as KBArticle[]);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  // Pré-preenchimento a partir de um gap (?from_gap=...&question=...)
  useEffect(() => {
    const fromGap = searchParams.get('from_gap');
    const questionParam = searchParams.get('question');
    if (fromGap && questionParam) {
      setSelectedId(null);
      setDraft({
        ...EMPTY,
        question: questionParam,
        title: questionParam.slice(0, 80),
      });
      // Limpa os params pra não re-aplicar em re-renders
      const next = new URLSearchParams(searchParams);
      next.delete('from_gap');
      next.delete('question');
      setSearchParams(next, { replace: true });
      toast({ title: 'Pré-preenchido a partir do gap', description: 'Edite título, resposta e palavras-chave antes de salvar.' });
    }
  }, [searchParams, setSearchParams, toast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return articles.filter((a) => {
      if (filterCat !== 'all' && a.category !== filterCat) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.question.toLowerCase().includes(q) ||
        a.keywords.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [articles, search, filterCat]);

  const grouped = useMemo(() => {
    const map = new Map<string, KBArticle[]>();
    for (const a of filtered) {
      if (!map.has(a.category)) map.set(a.category, []);
      map.get(a.category)!.push(a);
    }
    return map;
  }, [filtered]);

  const startNew = () => {
    setSelectedId(null);
    setDraft(EMPTY);
    setKeywordInput('');
  };

  const selectArticle = (a: KBArticle) => {
    setSelectedId(a.id);
    setDraft({
      title: a.title,
      category: a.category,
      question: a.question,
      answer: a.answer,
      keywords: [...a.keywords],
      is_active: a.is_active,
    });
    setKeywordInput('');
  };

  const addKeyword = () => {
    const k = keywordInput.trim();
    if (!k) return;
    if ((draft.keywords || []).includes(k)) return;
    setDraft({ ...draft, keywords: [...(draft.keywords || []), k] });
    setKeywordInput('');
  };

  const removeKeyword = (k: string) => {
    setDraft({ ...draft, keywords: (draft.keywords || []).filter((x) => x !== k) });
  };

  const handleSave = async () => {
    if (!draft.title?.trim() || !draft.question?.trim() || !draft.answer?.trim()) {
      toast({ title: 'Campos obrigatórios', description: 'Preencha título, pergunta e resposta.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        title: draft.title!.trim(),
        category: draft.category!,
        question: draft.question!.trim(),
        answer: draft.answer!.trim(),
        keywords: draft.keywords || [],
        is_active: draft.is_active ?? true,
      };

      let savedId = selectedId;
      if (selectedId) {
        const { error } = await supabase
          .from('support_knowledge_base')
          .update(payload)
          .eq('id', selectedId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('support_knowledge_base')
          .insert({ ...payload, created_by: user?.id ?? null })
          .select('id')
          .single();
        if (error) throw error;
        savedId = data.id;
        setSelectedId(savedId);
      }

      // Trigger embedding generation
      const { error: embErr } = await supabase.functions.invoke('support-kb-embed', { body: { id: savedId } });
      if (embErr) {
        toast({ title: 'Salvo, mas embedding falhou', description: embErr.message, variant: 'destructive' });
      } else {
        toast({ title: 'Artigo salvo', description: 'Embedding gerado com sucesso.' });
      }
      await load();
    } catch (e) {
      toast({ title: 'Erro ao salvar', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!confirm('Excluir este artigo? Esta ação não pode ser desfeita.')) return;
    const { error } = await supabase.from('support_knowledge_base').delete().eq('id', selectedId);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Artigo excluído' });
    startNew();
    await load();
  };

  const runTest = async () => {
    if (!testQuery.trim()) return;
    setTesting(true);
    setTestResults([]);
    try {
      const { data, error } = await supabase.functions.invoke('support-kb-search', {
        body: { query: testQuery, threshold: 0.3, count: 5 },
      });
      if (error) throw error;
      setTestResults(data?.matches || []);
    } catch (e) {
      toast({ title: 'Erro na busca', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  if (authLoading || (!isAdmin && !authLoading)) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin/suporte')}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar ao Suporte
            </Button>
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              <h1 className="text-xl font-semibold">Base de Conhecimento</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setTestOpen(true)}>
              <Search className="w-4 h-4 mr-1" /> Testar busca
            </Button>
            <Button size="sm" onClick={startNew}>
              <Plus className="w-4 h-4 mr-1" /> Novo artigo
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 grid lg:grid-cols-[360px_1fr] gap-6">
        {/* List */}
        <Card className="h-[calc(100vh-140px)] flex flex-col">
          <CardHeader className="pb-3 space-y-3">
            <CardTitle className="text-base">Artigos ({articles.length})</CardTitle>
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={filterCat} onValueChange={setFilterCat}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <ScrollArea className="h-full px-4 pb-4">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum artigo encontrado.</p>
              ) : (
                Array.from(grouped.entries()).map(([cat, items]) => (
                  <div key={cat} className="mb-4">
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-2 px-1">
                      {CATEGORIES.find((c) => c.value === cat)?.label || cat}
                    </p>
                    <div className="space-y-1">
                      {items.map((a) => (
                        ((): null | React.ReactNode => null)() ||
                        <button
                          key={a.id}
                          onClick={() => selectArticle(a)}
                          className={`w-full text-left px-3 py-2 rounded-md transition-colors border ${
                            selectedId === a.id
                              ? 'bg-primary/10 border-primary/30'
                              : 'border-transparent hover:bg-accent'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium truncate flex-1">{a.title}</p>
                            {a.usage_count > 0 && (
                              <Badge variant="secondary" className="text-xs h-5 shrink-0">
                                <Sparkles className="w-3 h-3 mr-0.5" />{a.usage_count}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            {!a.is_active && <Badge variant="outline" className="text-[10px] h-4">inativo</Badge>}
                            {!a.embedding && <Badge variant="destructive" className="text-[10px] h-4">sem embedding</Badge>}
                            {(() => {
                              const total = (a.approved_count || 0) + (a.edited_count || 0) + (a.rejected_count || 0);
                              if (total === 0) return null;
                              const rate = ((a.approved_count || 0) / total) * 100;
                              const variant = rate >= 75 ? 'default' : rate >= 50 ? 'secondary' : 'destructive';
                              return (
                                <Badge variant={variant as 'default' | 'secondary' | 'destructive'} className="text-[10px] h-4" title={`${a.approved_count || 0} aprovados, ${a.edited_count || 0} editados, ${a.rejected_count || 0} rejeitados`}>
                                  {rate.toFixed(0)}% aprov.
                                </Badge>
                              );
                            })()}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Editor */}
        <Card className="h-[calc(100vh-140px)] flex flex-col">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              {selectedId ? 'Editar artigo' : 'Novo artigo'}
            </CardTitle>
            <div className="flex items-center gap-2">
              {selectedId && (
                <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Salvar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto space-y-4">
            <div className="grid sm:grid-cols-[1fr_220px] gap-3">
              <div>
                <Label htmlFor="kb-title">Título *</Label>
                <Input
                  id="kb-title"
                  value={draft.title || ''}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Ex: Política de reembolso"
                />
              </div>
              <div>
                <Label htmlFor="kb-cat">Categoria</Label>
                <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
                  <SelectTrigger id="kb-cat"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="kb-q">Pergunta canônica *</Label>
              <Input
                id="kb-q"
                value={draft.question || ''}
                onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                placeholder="Como funciona o reembolso?"
              />
            </div>

            <div>
              <Label htmlFor="kb-a">Resposta oficial * (markdown)</Label>
              <Textarea
                id="kb-a"
                value={draft.answer || ''}
                onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
                placeholder="Resposta detalhada, com prazos, condições e quando escalar..."
                className="min-h-[260px] font-mono text-sm"
              />
            </div>

            <div>
              <Label>Palavras-chave (sinônimos)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                  placeholder="estornar, devolver dinheiro..."
                />
                <Button type="button" variant="outline" size="sm" onClick={addKeyword}>Adicionar</Button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(draft.keywords || []).map((k) => (
                  <Badge key={k} variant="secondary" className="gap-1">
                    {k}
                    <button onClick={() => removeKeyword(k)} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <div>
                <Label htmlFor="kb-active">Ativo (visível para a IA)</Label>
                <p className="text-xs text-muted-foreground">Desativar oculta o artigo da busca semântica.</p>
              </div>
              <Switch
                id="kb-active"
                checked={draft.is_active ?? true}
                onCheckedChange={(v) => setDraft({ ...draft, is_active: v })}
              />
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Test search dialog */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Testar busca semântica</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Digite uma pergunta de cliente..."
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runTest(); }}
              />
              <Button onClick={runTest} disabled={testing || !testQuery.trim()}>
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
            <ScrollArea className="h-[400px] border rounded-md p-3">
              {testResults.length === 0 && !testing && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Digite uma pergunta e veja os artigos mais relevantes.
                </p>
              )}
              {testResults.map((r, i) => (
                <div key={r.id} className="mb-3 pb-3 border-b last:border-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={CATEGORY_COLORS[r.category] || ''} variant="secondary">
                      #{i + 1} · {r.category}
                    </Badge>
                    <Badge variant={r.similarity > 0.7 ? 'default' : r.similarity > 0.5 ? 'secondary' : 'outline'}>
                      {(r.similarity * 100).toFixed(0)}%
                    </Badge>
                  </div>
                  <p className="font-medium text-sm">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{r.question}</p>
                </div>
              ))}
            </ScrollArea>
            <p className="text-xs text-muted-foreground">
              💡 O support-agent usa threshold 0.55. Resultados acima de 70% são fortes; entre 55-70% ainda servem como contexto; abaixo disso são descartados.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}