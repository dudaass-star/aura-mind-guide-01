import { useEffect, useMemo, useRef, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Send, Loader2, AlertTriangle, Search } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

interface Conversation {
  phone: string;
  name: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_message_preview: string | null;
  last_admin_read_at: string | null;
  checkout_session_id: string | null;
}

interface RecoveryMessage {
  id: string;
  phone: string;
  direction: 'in' | 'out';
  body: string | null;
  media_url: string | null;
  sent_by_admin: boolean;
  created_at: string;
  metadata: any;
}

interface CheckoutContext {
  id: string;
  plan: string | null;
  billing: string | null;
  status: string;
  name: string | null;
  email: string | null;
  created_at: string;
  completed_at: string | null;
}

function formatPhone(p: string) {
  if (!p) return '';
  if (p.length >= 12) {
    return `+${p.slice(0, 2)} (${p.slice(2, 4)}) ${p.slice(4, -4)}-${p.slice(-4)}`;
  }
  return `+${p}`;
}

interface Props {
  /** Altura do container (default: calc(100vh-220px)). Útil quando embedado em abas. */
  heightClass?: string;
}

export default function RecoveryInbox({ heightClass = 'h-[calc(100vh-180px)]' }: Props) {
  const { toast } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<RecoveryMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutContext | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  // Mapas auxiliares para enriquecer a lista
  const [stageByPhone, setStageByPhone] = useState<Record<string, number>>({});
  const [lastInboundByPhone, setLastInboundByPhone] = useState<Record<string, string>>({});
  type FilterKey = 'all' | 'unread' | 'replied' | 'sent_only';
  const [filter, setFilter] = useState<FilterKey>('all');

  const endRef = useRef<HTMLDivElement>(null);

  const fetchList = async () => {
    setLoadingList(true);
    const { data, error } = await supabase
      .from('recovery_conversations')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(400);
    if (error) {
      console.error(error);
      toast({ title: 'Erro ao carregar conversas', variant: 'destructive' });
    } else {
      const ts = (v: string | null) => (v ? new Date(v).getTime() : 0);
      const sorted = (data || []).slice().sort((a: any, b: any) => {
        const ta = Math.max(ts(a.last_inbound_at), ts(a.last_outbound_at));
        const tb = Math.max(ts(b.last_inbound_at), ts(b.last_outbound_at));
        return tb - ta;
      });
      setConversations(sorted);
      void enrichConversations(sorted);
    }
    setLoadingList(false);
  };

  // Carrega estágio de recuperação (por checkout_session) e última mensagem
  // inbound real (para sobrescrever o preview quando o lead respondeu).
  const enrichConversations = async (convs: Conversation[]) => {
    const checkoutIds = convs
      .map(c => c.checkout_session_id)
      .filter((x): x is string => !!x);
    const phonesWithInbound = convs
      .filter(c => c.last_inbound_at)
      .map(c => c.phone);

    const [stagesRes, inboundRes] = await Promise.all([
      checkoutIds.length
        ? supabase
            .from('checkout_sessions')
            .select('id, recovery_stage')
            .in('id', checkoutIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      phonesWithInbound.length
        ? supabase
            .from('recovery_messages')
            .select('phone, body, created_at, direction')
            .in('phone', phonesWithInbound)
            .eq('direction', 'in')
            .order('created_at', { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);

    const stageMap: Record<string, number> = {};
    if (stagesRes.data) {
      const byId: Record<string, number> = {};
      for (const row of stagesRes.data as any[]) {
        byId[row.id] = row.recovery_stage ?? 0;
      }
      for (const c of convs) {
        if (c.checkout_session_id && byId[c.checkout_session_id] != null) {
          stageMap[c.phone] = byId[c.checkout_session_id];
        }
      }
    }
    setStageByPhone(stageMap);

    const inboundMap: Record<string, string> = {};
    if (inboundRes.data) {
      for (const row of inboundRes.data as any[]) {
        if (!inboundMap[row.phone] && row.body) {
          inboundMap[row.phone] = row.body;
        }
      }
    }
    setLastInboundByPhone(inboundMap);
  };

  useEffect(() => {
    fetchList();
    const ch = supabase
      .channel('recovery_conversations_admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recovery_conversations' }, () => {
        fetchList();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const fetchMessages = async (phone: string) => {
    setLoadingMessages(true);
    const { data, error } = await supabase
      .from('recovery_messages')
      .select('*')
      .eq('phone', phone)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) {
      console.error(error);
      toast({ title: 'Erro ao carregar mensagens', variant: 'destructive' });
    } else {
      setMessages((data || []) as RecoveryMessage[]);
    }
    setLoadingMessages(false);
  };

  const fetchCheckout = async (id: string | null) => {
    if (!id) { setCheckout(null); return; }
    const { data } = await supabase
      .from('checkout_sessions')
      .select('id, plan, billing, status, name, email, created_at, completed_at')
      .eq('id', id)
      .maybeSingle();
    setCheckout((data as CheckoutContext) || null);
  };

  useEffect(() => {
    if (!selectedPhone) return;
    fetchMessages(selectedPhone);
    const conv = conversations.find(c => c.phone === selectedPhone);
    fetchCheckout(conv?.checkout_session_id || null);

    const ch = supabase
      .channel(`recovery_messages_${selectedPhone}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'recovery_messages',
        filter: `phone=eq.${selectedPhone}`,
      }, (payload) => {
        setMessages(prev => {
          if (prev.some(m => m.id === (payload.new as any).id)) return prev;
          return [...prev, payload.new as RecoveryMessage];
        });
      })
      .subscribe();

    void supabase.from('recovery_conversations').update({
      last_admin_read_at: new Date().toISOString(),
    }).eq('phone', selectedPhone);

    return () => { supabase.removeChannel(ch); };
  }, [selectedPhone]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const matchesSearch = (c: Conversation) =>
      !q || (c.phone || '').includes(q) || (c.name || '').toLowerCase().includes(q);

    const isUnread = (c: Conversation) =>
      !!c.last_inbound_at && (
        !c.last_admin_read_at ||
        new Date(c.last_inbound_at) > new Date(c.last_admin_read_at)
      );

    let list = conversations.filter(matchesSearch);
    if (filter === 'unread') list = list.filter(isUnread);
    else if (filter === 'replied') list = list.filter(c => !!c.last_inbound_at);
    else if (filter === 'sent_only') list = list.filter(c => !c.last_inbound_at);

    // Em filtros focados em resposta, ordena por última inbound primeiro.
    if (filter === 'unread' || filter === 'replied') {
      list = list.slice().sort((a, b) => {
        const ta = a.last_inbound_at ? new Date(a.last_inbound_at).getTime() : 0;
        const tb = b.last_inbound_at ? new Date(b.last_inbound_at).getTime() : 0;
        return tb - ta;
      });
    }
    return list;
  }, [conversations, search, filter]);

  const counts = useMemo(() => {
    let unread = 0, replied = 0, sentOnly = 0;
    for (const c of conversations) {
      const hasInbound = !!c.last_inbound_at;
      if (hasInbound) {
        replied++;
        if (!c.last_admin_read_at || new Date(c.last_inbound_at!) > new Date(c.last_admin_read_at)) {
          unread++;
        }
      } else {
        sentOnly++;
      }
    }
    return { unread, replied, sentOnly, total: conversations.length };
  }, [conversations]);


  const selectedConv = useMemo(
    () => conversations.find(c => c.phone === selectedPhone) || null,
    [conversations, selectedPhone]
  );

  const windowOpen = useMemo(() => {
    if (!selectedConv?.last_inbound_at) return false;
    return Date.now() - new Date(selectedConv.last_inbound_at).getTime() < 24 * 60 * 60 * 1000;
  }, [selectedConv]);

  const handleSend = async () => {
    if (!reply.trim() || !selectedPhone) return;
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('whatsapp-recovery-admin-reply', {
        body: { phone: selectedPhone, text: reply.trim() },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setReply('');
      toast({ title: 'Mensagem enviada' });
      await fetchMessages(selectedPhone);
    } catch (err: any) {
      console.error(err);
      toast({
        title: 'Erro ao enviar',
        description: err?.message || 'Falha desconhecida',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 ${heightClass}`}>
      {/* Lista */}
      <Card className="flex flex-col overflow-hidden">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por telefone/nome..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {([
              { key: 'all',       label: 'Todas', n: counts.total },
              { key: 'unread',    label: 'Não lidas', n: counts.unread },
              { key: 'replied',   label: 'Responderam', n: counts.replied },
              { key: 'sent_only', label: 'Só envio', n: counts.sentOnly },
            ] as { key: FilterKey; label: string; n: number }[]).map(opt => (
              <button
                key={opt.key}
                onClick={() => setFilter(opt.key)}
                className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                  filter === opt.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted border-border text-muted-foreground'
                }`}
              >
                {opt.label} <span className="opacity-70">({opt.n})</span>
              </button>
            ))}
          </div>
        </div>
        <ScrollArea className="flex-1">
          {loadingList ? (
            <div className="p-4 space-y-3">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">
              Nenhuma conversa neste filtro.
            </p>
          ) : filtered.map(conv => {
            const unread = conv.last_inbound_at && (
              !conv.last_admin_read_at ||
              new Date(conv.last_inbound_at) > new Date(conv.last_admin_read_at)
            );
            const active = selectedPhone === conv.phone;
            const inboundTs = conv.last_inbound_at ? new Date(conv.last_inbound_at).getTime() : 0;
            const outboundTs = conv.last_outbound_at ? new Date(conv.last_outbound_at).getTime() : 0;
            const lastIsInbound = inboundTs >= outboundTs && inboundTs > 0;
            const lastActivityAt = lastIsInbound
              ? conv.last_inbound_at
              : (conv.last_outbound_at || conv.last_inbound_at);
            const hasInbound = !!conv.last_inbound_at;
            const stage = stageByPhone[conv.phone];
            const inboundPreview = lastInboundByPhone[conv.phone];
            const previewText = hasInbound
              ? `↩ Lead: ${inboundPreview || conv.last_message_preview || '—'}`
              : (conv.last_message_preview || '—');
            return (
              <button
                key={conv.phone}
                onClick={() => setSelectedPhone(conv.phone)}
                className={`w-full text-left p-3 border-b hover:bg-muted/50 transition-colors ${
                  active ? 'bg-muted' : (unread ? 'bg-primary/5' : '')
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm truncate ${unread ? 'font-semibold' : 'font-medium'}`}>
                    {conv.name || formatPhone(conv.phone)}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {stage ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        Estágio {stage}
                      </Badge>
                    ) : null}
                    {unread ? (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0">novo</Badge>
                    ) : hasInbound ? (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">respondeu</Badge>
                    ) : null}
                  </div>
                </div>
                {conv.name && (
                  <div className="text-xs text-muted-foreground">{formatPhone(conv.phone)}</div>
                )}
                <p className={`text-xs truncate mt-1 ${hasInbound ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {previewText}
                </p>
                {lastActivityAt && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {lastIsInbound ? 'respondeu ' : 'enviado '}
                    {formatDistanceToNow(new Date(lastActivityAt), { addSuffix: true, locale: ptBR })}
                  </p>
                )}
              </button>
            );
          })}
        </ScrollArea>
      </Card>

      {/* Conversa */}
      <Card className="flex flex-col overflow-hidden">
        {!selectedPhone ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Selecione uma conversa
          </div>
        ) : (
          <>
            <div className="border-b p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">
                    {selectedConv?.name || formatPhone(selectedPhone)}
                  </div>
                  {selectedConv?.name && (
                    <div className="text-xs text-muted-foreground">{formatPhone(selectedPhone)}</div>
                  )}
                </div>
                {windowOpen ? (
                  <Badge variant="secondary" className="text-[10px]">janela 24h aberta</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">janela 24h fechada</Badge>
                )}
              </div>
              {checkout && (
                <div className="mt-2 text-xs bg-muted/40 rounded p-2">
                  <span className="font-medium">Checkout:</span>{' '}
                  plano <b>{checkout.plan || '?'}</b> ({checkout.billing || '?'}) —{' '}
                  status <b>{checkout.status}</b>
                  {checkout.email && <> — {checkout.email}</>}
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    criado {format(new Date(checkout.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    {checkout.completed_at && (
                      <> · concluído {format(new Date(checkout.completed_at), "dd/MM HH:mm", { locale: ptBR })}</>
                    )}
                  </div>
                </div>
              )}
            </div>

            <ScrollArea className="flex-1 p-4">
              {loadingMessages ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-2/3" />)}
                </div>
              ) : messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma mensagem ainda.
                </p>
              ) : (
                <div className="space-y-2">
                  {messages.map(m => (
                    <div
                      key={m.id}
                      className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                          m.direction === 'out'
                            ? (m.sent_by_admin ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground')
                            : 'bg-muted'
                        }`}
                      >
                        {m.sent_by_admin && (
                          <div className="text-[10px] uppercase tracking-wide opacity-70 mb-1">Admin</div>
                        )}
                        {m.direction === 'out' && !m.sent_by_admin && (
                          <div className="text-[10px] uppercase tracking-wide opacity-70 mb-1">
                            {m.metadata?.template ? `Template ${m.metadata.template}` : 'Automático'}
                          </div>
                        )}
                        <div className="whitespace-pre-wrap break-words">{m.body || (m.media_url ? '[mídia]' : '')}</div>
                        {m.media_url && (
                          <button
                            type="button"
                            onClick={() => openMedia(m.media_url!)}
                            disabled={loadingMedia === m.media_url}
                            className="text-xs underline mt-1 inline-block disabled:opacity-60"
                          >
                            {loadingMedia === m.media_url ? 'abrindo…' : 'abrir mídia'}
                          </button>
                        )}
                        <div className="text-[10px] opacity-70 mt-1">
                          {format(new Date(m.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={endRef} />
                </div>
              )}
            </ScrollArea>

            <div className="border-t p-3 space-y-2">
              {!windowOpen && (
                <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded p-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Texto livre só pode ser enviado dentro de 24h após o lead responder.
                    Aguarde uma nova resposta ou envie um template aprovado.
                  </span>
                </div>
              )}
              <div className="flex gap-2">
                <Textarea
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  placeholder={windowOpen ? "Digite sua resposta..." : "Janela 24h fechada"}
                  disabled={!windowOpen || sending}
                  rows={2}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <Button
                  onClick={handleSend}
                  disabled={!windowOpen || sending || !reply.trim()}
                  size="icon"
                  className="self-end h-10 w-10"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}