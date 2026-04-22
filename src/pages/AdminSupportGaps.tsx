import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, HelpCircle, Loader2, Sparkles, Check, X, BookOpen } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface KbGap {
  id: string;
  question_text: string;
  ticket_subject: string | null;
  best_kb_score: number | null;
  occurrence_count: number;
  status: string;
  source_ticket_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

const STATUS_OPTIONS = [
  { value: 'open', label: 'Em aberto' },
  { value: 'reviewing', label: 'Em revisão' },
  { value: 'resolved', label: 'Resolvidos' },
  { value: 'ignored', label: 'Ignorados' },
];

export default function AdminSupportGaps() {
  const { isLoading: authLoading, isAdmin, redirectIfNotAdmin } = useAdminAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [gaps, setGaps] = useState<KbGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('open');

  useEffect(() => { if (!authLoading) redirectIfNotAdmin(); }, [authLoading, redirectIfNotAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('support_kb_gaps')
      .select('*')
      .eq('status', statusFilter)
      .order('occurrence_count', { ascending: false })
      .order('last_seen_at', { ascending: false })
      .limit(100);
    if (error) {
      toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
    } else {
      setGaps((data || []) as KbGap[]);
    }
    setLoading(false);
  }, [statusFilter, toast]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from('support_kb_gaps')
      .update({ status, ...(status === 'resolved' || status === 'ignored' ? { resolved_at: new Date().toISOString() } : {}) })
      .eq('id', id);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Atualizado' });
    load();
  };

  const createArticleFromGap = (gap: KbGap) => {
    // Passa pergunta via query string pra pré-preencher o editor
    const params = new URLSearchParams({
      from_gap: gap.id,
      question: gap.question_text.slice(0, 500),
    });
    navigate(`/admin/suporte/conhecimento?${params.toString()}`);
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
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
            <div className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-primary" />
              <h1 className="text-xl font-semibold">Perguntas sem cobertura</h1>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/admin/suporte/conhecimento')}>
            <BookOpen className="w-4 h-4 mr-1" /> Base de conhecimento
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">
                Lacunas da base de conhecimento
              </CardTitle>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Perguntas que a IA recebeu mas não encontrou cobertura na KB (score &lt; 0.55).
              Crie artigos pra reduzir a taxa de escalação.
            </p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[calc(100vh-260px)]">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
              ) : gaps.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-12">
                  {statusFilter === 'open'
                    ? '🎉 Nenhum gap aberto. A KB está cobrindo bem as perguntas.'
                    : 'Nenhum item nesta categoria.'}
                </p>
              ) : (
                <div className="space-y-3">
                  {gaps.map((gap) => (
                    <div key={gap.id} className="border border-border rounded-md p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {gap.occurrence_count > 1 && (
                              <Badge variant="default" className="text-[10px]">
                                {gap.occurrence_count}x recebida
                              </Badge>
                            )}
                            {gap.best_kb_score !== null && (
                              <Badge variant="outline" className="text-[10px]">
                                Melhor match: {(gap.best_kb_score * 100).toFixed(0)}%
                              </Badge>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              Visto pela última vez {format(new Date(gap.last_seen_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                          {gap.ticket_subject && (
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              Assunto: {gap.ticket_subject}
                            </p>
                          )}
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {gap.question_text.slice(0, 400)}
                            {gap.question_text.length > 400 && '…'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-border">
                        {statusFilter === 'open' && (
                          <>
                            <Button size="sm" onClick={() => createArticleFromGap(gap)}>
                              <Sparkles className="w-3 h-3 mr-1" /> Criar artigo
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => updateStatus(gap.id, 'reviewing')}>
                              Marcar em revisão
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => updateStatus(gap.id, 'ignored')}>
                              <X className="w-3 h-3 mr-1" /> Ignorar
                            </Button>
                          </>
                        )}
                        {statusFilter === 'reviewing' && (
                          <>
                            <Button size="sm" onClick={() => createArticleFromGap(gap)}>
                              <Sparkles className="w-3 h-3 mr-1" /> Criar artigo
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => updateStatus(gap.id, 'resolved')}>
                              <Check className="w-3 h-3 mr-1" /> Marcar resolvido
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => updateStatus(gap.id, 'open')}>
                              Voltar pra aberto
                            </Button>
                          </>
                        )}
                        {(statusFilter === 'resolved' || statusFilter === 'ignored') && (
                          <Button size="sm" variant="outline" onClick={() => updateStatus(gap.id, 'open')}>
                            Reabrir
                          </Button>
                        )}
                        {gap.source_ticket_id && (
                          <Button size="sm" variant="ghost" className="ml-auto text-xs" onClick={() => navigate(`/admin/suporte`)}>
                            Ver ticket original
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}