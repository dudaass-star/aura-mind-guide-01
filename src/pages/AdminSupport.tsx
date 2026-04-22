import { useEffect, useState, useCallback } from 'react';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, RefreshCw, Send, Pause, X, CheckCircle2, AlertTriangle, Mail, Paperclip, Loader2, Sparkles, Inbox, BookOpen, Bot, AlertOctagon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface Ticket {
  id: string;
  customer_email: string;
  customer_name: string | null;
  subject: string;
  status: string;
  category: string | null;
  severity: string | null;
  profile_user_id: string | null;
  last_inbound_at: string;
  last_outbound_at: string | null;
  created_at: string;
  auto_sent?: boolean;
  auto_sent_at?: string | null;
  recurring_customer?: boolean;
}

interface TicketMessage {
  id: string;
  direction: string;
  from_email: string;
  to_email: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  attachments: Array<{ path: string; name: string; content_type?: string; size?: number }>;
  created_at: string;
}

interface Draft {
  id: string;
  draft_body: string;
  suggested_action: { type: string; reason: string; params?: Record<string, unknown> };
  context_snapshot: Record<string, unknown>;
  generated_at: string;
  ai_model: string;
  auto_eligible?: boolean;
  kb_top_score?: number | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_review: { label: 'Aguardando', color: 'bg-yellow-500' },
  replied: { label: 'Respondido', color: 'bg-green-500' },
  manual: { label: 'Manual', color: 'bg-blue-500' },
  snoozed: { label: 'Snooze', color: 'bg-gray-500' },
  closed: { label: 'Fechado', color: 'bg-gray-400' },
};

const SEVERITY_COLORS: Record<string, string> = {
  alta: 'destructive',
  media: 'default',
  baixa: 'secondary',
};

const ACTION_LABELS: Record<string, string> = {
  none: 'Apenas responder',
  send_portal_link: 'Enviar link do portal',
  send_stripe_billing_portal: 'Link de gestão Stripe',
  cancel_subscription: 'Cancelar assinatura',
  pause_subscription: 'Pausar assinatura',
  refund_invoice: 'Reembolsar fatura',
  retry_payment: 'Tentar cobrar novamente',
  change_plan: 'Trocar plano',
};

export default function AdminSupport() {
  const { isLoading: authLoading, isAdmin, redirectIfNotAdmin } = useAdminAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('pending_review');
  const [search, setSearch] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editedBody, setEditedBody] = useState('');
  const [actionEnabled, setActionEnabled] = useState(true);
  const [sending, setSending] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [hint, setHint] = useState('');
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    redirectIfNotAdmin();
  }, [authLoading, isAdmin]);

  const fetchTickets = useCallback(async () => {
    setLoadingList(true);
    let query = supabase.from('support_tickets').select('*').order('last_inbound_at', { ascending: false }).limit(200);
    if (statusFilter === 'auto_sent') {
      query = query.eq('auto_sent', true);
    } else if (statusFilter === 'recurring') {
      query = query.eq('recurring_customer', true);
    } else if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
    const { data, error } = await query;
    if (error) {
      toast({ title: 'Erro ao carregar tickets', description: error.message, variant: 'destructive' });
    } else {
      setTickets(data || []);
    }
    setLoadingList(false);
  }, [statusFilter, toast]);

  useEffect(() => {
    if (isAdmin) fetchTickets();
  }, [isAdmin, fetchTickets]);

  // Realtime
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel('support-tickets-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => fetchTickets())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAdmin, fetchTickets]);

  const loadTicketDetail = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setLoadingDetail(true);
    setDraft(null);
    setMessages([]);
    setEditedBody('');

    const [msgsRes, draftRes] = await Promise.all([
      supabase.from('support_ticket_messages').select('*').eq('ticket_id', ticket.id).order('created_at'),
      supabase.from('support_ticket_drafts').select('*').eq('ticket_id', ticket.id).eq('is_current', true).maybeSingle(),
    ]);

    setMessages((msgsRes.data || []) as unknown as TicketMessage[]);
    if (draftRes.data) {
      const d = draftRes.data as unknown as Draft;
      setDraft(d);
      setEditedBody(d.draft_body);
      setActionEnabled(d.suggested_action?.type !== 'none');
    }
    setLoadingDetail(false);
  };

  const handleApproveSend = async (executeAction: boolean) => {
    if (!selectedTicket || !editedBody.trim()) return;
    setSending(true);
    try {
      // 1. Send email
      const { data: sendData, error: sendErr } = await supabase.functions.invoke('support-send-reply', {
        body: { ticket_id: selectedTicket.id, body: editedBody },
      });
      if (sendErr) throw sendErr;

      // 2. Execute action if enabled and not "none"
      if (executeAction && draft && draft.suggested_action.type !== 'none') {
        const { error: actErr } = await supabase.functions.invoke('support-execute-action', {
          body: { ticket_id: selectedTicket.id, action: draft.suggested_action },
        });
        if (actErr) {
          toast({ title: 'Email enviado, mas ação falhou', description: actErr.message, variant: 'destructive' });
        }
      }

      toast({ title: 'Resposta enviada', description: 'Email despachado e ticket marcado como respondido.' });
      setSelectedTicket(null);
      fetchTickets();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: 'Erro ao enviar', description: msg, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleRegenerate = async () => {
    if (!selectedTicket) return;
    setRegenerating(true);
    try {
      const { error } = await supabase.functions.invoke('support-agent', {
        body: { ticket_id: selectedTicket.id, hint: hint || undefined },
      });
      if (error) throw error;
      await loadTicketDetail(selectedTicket);
      setHint('');
      toast({ title: 'Rascunho regenerado' });
    } catch (e) {
      toast({ title: 'Erro ao regenerar', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setRegenerating(false);
    }
  };

  const handleSnooze = async () => {
    if (!selectedTicket) return;
    const snoozeUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('support_tickets').update({ status: 'snoozed', snooze_until: snoozeUntil }).eq('id', selectedTicket.id);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Snoozed por 24h' }); setSelectedTicket(null); fetchTickets(); }
  };

  const handleClose = async () => {
    if (!selectedTicket) return;
    const { error } = await supabase.from('support_tickets').update({ status: 'closed' }).eq('id', selectedTicket.id);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Ticket fechado' }); setSelectedTicket(null); fetchTickets(); }
  };

  const handlePoll = async () => {
    setPolling(true);
    try {
      const { data, error } = await supabase.functions.invoke('support-imap-poll');
      if (error) throw error;
      toast({ title: 'Caixa verificada', description: `${data?.processed_count || 0} novas mensagens` });
      fetchTickets();
    } catch (e) {
      toast({ title: 'Erro ao verificar', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setPolling(false);
    }
  };

  const openAttachment = async (path: string) => {
    const { data, error } = await supabase.functions.invoke('support-attachment-url', { body: { path } });
    if (error || !data?.url) {
      toast({ title: 'Erro ao abrir anexo', variant: 'destructive' });
      return;
    }
    window.open(data.url, '_blank');
  };

  const filteredTickets = tickets.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (t.customer_email || '').toLowerCase().includes(q) ||
      (t.subject || '').toLowerCase().includes(q) ||
      (t.customer_name || '').toLowerCase().includes(q);
  });

  if (authLoading || !isAdmin) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/usuarios')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <Mail className="h-5 w-5" /> Suporte por Email
              </h1>
              <p className="text-xs text-muted-foreground">suporte@olaaura.com.br · IA assistida com aprovação humana</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => navigate('/admin/suporte/conhecimento')} variant="outline" size="sm">
              <BookOpen className="h-4 w-4 mr-1" /> Base de Conhecimento
            </Button>
            <Button onClick={handlePoll} disabled={polling} variant="outline" size="sm">
              {polling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Inbox className="h-4 w-4" />}
              Verificar caixa
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4 grid grid-cols-1 lg:grid-cols-[320px_1fr_400px] gap-4 h-[calc(100vh-80px)]">
        {/* LEFT: ticket list */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="pb-3 space-y-2">
            <Input placeholder="Buscar email/assunto..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending_review">Aguardando</SelectItem>
                <SelectItem value="replied">Respondido</SelectItem>
                <SelectItem value="auto_sent">Auto-respondidos</SelectItem>
                <SelectItem value="recurring">Clientes recorrentes</SelectItem>
                <SelectItem value="snoozed">Snooze</SelectItem>
                <SelectItem value="closed">Fechado</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <ScrollArea className="flex-1">
            <CardContent className="p-2 space-y-1">
              {loadingList && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
              {!loadingList && filteredTickets.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum ticket</p>
              )}
              {filteredTickets.map((t) => {
                const status = STATUS_LABELS[t.status] || { label: t.status, color: 'bg-gray-400' };
                return (
                  <button key={t.id} onClick={() => loadTicketDetail(t)}
                    className={`w-full text-left p-3 rounded-md border transition-colors hover:bg-muted ${selectedTicket?.id === t.id ? 'bg-muted border-primary' : 'border-border'}`}>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-sm font-medium truncate">{t.customer_name || t.customer_email}</span>
                      <div className={`h-2 w-2 rounded-full ${status.color} flex-shrink-0 mt-1.5`} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{t.subject}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {t.severity && (
                        <Badge variant={SEVERITY_COLORS[t.severity] as any || 'outline'} className="text-[10px] py-0 px-1.5">
                          {t.severity}
                        </Badge>
                      )}
                      {t.category && <Badge variant="outline" className="text-[10px] py-0 px-1.5">{t.category}</Badge>}
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {format(new Date(t.last_inbound_at), 'dd/MM HH:mm', { locale: ptBR })}
                      </span>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </ScrollArea>
        </Card>

        {/* CENTER: thread */}
        <Card className="flex flex-col overflow-hidden">
          {!selectedTicket ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Selecione um ticket à esquerda
            </div>
          ) : loadingDetail ? (
            <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin" /></div>
          ) : (
            <>
              <CardHeader className="border-b">
                <CardTitle className="text-base">{selectedTicket.subject}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {selectedTicket.customer_name && `${selectedTicket.customer_name} · `}
                  {selectedTicket.customer_email}
                </p>
              </CardHeader>
              <ScrollArea className="flex-1">
                <CardContent className="p-4 space-y-3">
                  {messages.map((m) => (
                    <div key={m.id} className={`p-3 rounded-md border ${m.direction === 'inbound' ? 'bg-muted/50' : 'bg-primary/5 border-primary/20'}`}>
                      <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground">
                        <span className="font-medium">
                          {m.direction === 'inbound' ? '← ' : '→ '}{m.from_email}
                        </span>
                        <span>{format(new Date(m.created_at), 'dd/MM/yy HH:mm', { locale: ptBR })}</span>
                      </div>
                      <div className="text-sm whitespace-pre-wrap">{m.body_text || '(sem corpo de texto)'}</div>
                      {m.attachments && m.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {m.attachments.map((a) => (
                            <Button key={a.path} variant="outline" size="sm" onClick={() => openAttachment(a.path)} className="h-7 text-xs">
                              <Paperclip className="h-3 w-3" /> {a.name}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Customer context */}
                  {draft?.context_snapshot && (
                    <Collapsible>
                      <CollapsibleTrigger className="text-xs text-muted-foreground hover:text-foreground">
                        ▸ Ver contexto do cliente (perfil + Stripe + WhatsApp)
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <pre className="text-[10px] bg-muted p-2 rounded mt-2 overflow-auto max-h-80">
                          {JSON.stringify(draft.context_snapshot, null, 2)}
                        </pre>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </CardContent>
              </ScrollArea>
            </>
          )}
        </Card>

        {/* RIGHT: action panel */}
        <Card className="flex flex-col overflow-hidden">
          {!selectedTicket ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4 text-center">
              Selecione um ticket para ver o rascunho da Aura
            </div>
          ) : loadingDetail ? (
            <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin" /></div>
          ) : !draft ? (
            <CardContent className="p-4 space-y-3 flex-1 flex flex-col">
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Sem rascunho ainda
              </div>
              <Button onClick={handleRegenerate} disabled={regenerating} className="w-full">
                {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Gerar rascunho com IA
              </Button>
              <Textarea value={editedBody} onChange={(e) => setEditedBody(e.target.value)} placeholder="Ou escreva manualmente..." className="flex-1 min-h-[200px]" />
              <Button onClick={() => handleApproveSend(false)} disabled={sending || !editedBody.trim()} className="w-full">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar manual
              </Button>
            </CardContent>
          ) : (
            <CardContent className="p-4 space-y-3 flex-1 flex flex-col overflow-hidden">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <Sparkles className="h-3 w-3 text-primary" />
                  <span className="text-muted-foreground">Rascunho · {draft.ai_model}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Gerado {format(new Date(draft.generated_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>

              <Textarea value={editedBody} onChange={(e) => setEditedBody(e.target.value)} className="flex-1 min-h-[180px] text-sm" />

              <div className="rounded-md border p-3 space-y-2 bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Ação sugerida</span>
                  {draft.suggested_action.type !== 'none' && (
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <input type="checkbox" checked={actionEnabled} onChange={(e) => setActionEnabled(e.target.checked)} />
                      Executar
                    </label>
                  )}
                </div>
                <Badge variant={draft.suggested_action.type === 'none' ? 'secondary' : 'default'}>
                  {ACTION_LABELS[draft.suggested_action.type] || draft.suggested_action.type}
                </Badge>
                <p className="text-xs text-muted-foreground">{draft.suggested_action.reason}</p>
                {draft.suggested_action.params && Object.keys(draft.suggested_action.params).length > 0 && (
                  <pre className="text-[10px] bg-background p-1.5 rounded">{JSON.stringify(draft.suggested_action.params, null, 2)}</pre>
                )}
              </div>

              <div className="space-y-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button disabled={sending || !editedBody.trim()} className="w-full" variant="default">
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Aprovar e enviar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirmar envio</AlertDialogTitle>
                      <AlertDialogDescription>
                        Vai enviar a resposta para <strong>{selectedTicket.customer_email}</strong>
                        {actionEnabled && draft.suggested_action.type !== 'none' && (
                          <> e executar a ação <strong>{ACTION_LABELS[draft.suggested_action.type]}</strong></>
                        )}.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleApproveSend(actionEnabled)}>Confirmar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <div className="flex gap-2">
                  <Input placeholder="Hint p/ regenerar (ex: mais empático)" value={hint} onChange={(e) => setHint(e.target.value)} className="text-xs" />
                  <Button onClick={handleRegenerate} disabled={regenerating} variant="outline" size="icon">
                    {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSnooze} variant="outline" size="sm" className="flex-1">
                    <Pause className="h-3 w-3" /> Snooze 24h
                  </Button>
                  <Button onClick={handleClose} variant="outline" size="sm" className="flex-1">
                    <X className="h-3 w-3" /> Fechar
                  </Button>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}