import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowDown, Check, CheckCheck, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  user_id: string;
  role: string;
  content: string;
  created_at: string | null;
  sequence_no: number | null;
  client_message_id: string | null;
  delivery_status: string;
  is_audio: boolean;
  audio_url: string | null;
  optimistic?: boolean;
};

const PAGE_SIZE = 50;

function orderMessages(messages: ChatMessage[]) {
  return [...messages].sort((a, b) => {
    if (a.sequence_no !== null && b.sequence_no !== null) return a.sequence_no - b.sequence_no;
    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
  });
}

function mergeMessage(messages: ChatMessage[], incoming: ChatMessage) {
  const filtered = messages.filter((message) => {
    if (message.id === incoming.id) return false;
    return !(incoming.client_message_id && message.client_message_id === incoming.client_message_id);
  });
  return orderMessages([...filtered, incoming]);
}

function formatTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function ConversarTab({ userId, firstName }: { userId: string; firstName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [responding, setResponding] = useState(false);
  const [connected, setConnected] = useState(true);
  const [hasOlder, setHasOlder] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const nearBottomRef = useRef(true);
  const latestSequenceRef = useRef(0);

  const latestSequence = useMemo(
    () => messages.reduce((latest, message) => Math.max(latest, message.sequence_no || 0), 0),
    [messages],
  );

  useEffect(() => {
    latestSequenceRef.current = latestSequence;
  }, [latestSequence]);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior }));
    setShowNew(false);
  };

  useEffect(() => {
    const saved = sessionStorage.getItem(`aura-chat-draft:${userId}`);
    if (saved) setDraft(saved);

    const load = async () => {
      const [{ data, error }, { data: state }] = await Promise.all([
        supabasePortal
          .from("messages")
          .select("id,user_id,role,content,created_at,sequence_no,client_message_id,delivery_status,is_audio,audio_url")
          .eq("user_id", userId)
          .order("sequence_no", { ascending: false })
          .limit(PAGE_SIZE),
        supabasePortal
          .from("aura_response_state")
          .select("is_responding")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      if (!error && data) {
        setMessages(orderMessages(data as ChatMessage[]));
        setHasOlder(data.length === PAGE_SIZE);
        setTimeout(() => scrollToBottom("auto"), 0);
      }
      setResponding(Boolean(state?.is_responding));
      setLoading(false);
    };
    void load();

    const channel = supabasePortal
      .channel(`portal-chat:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `user_id=eq.${userId}` },
        (payload) => {
          const incoming = payload.new as ChatMessage;
          setMessages((current) => mergeMessage(current, incoming));
          if (nearBottomRef.current) setTimeout(() => scrollToBottom(), 0);
          else setShowNew(true);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "aura_response_state", filter: `user_id=eq.${userId}` },
        (payload) => setResponding(Boolean(payload.new.is_responding)),
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    const reconcile = async () => {
      const { data } = await supabasePortal
        .from("messages")
        .select("id,user_id,role,content,created_at,sequence_no,client_message_id,delivery_status,is_audio,audio_url")
        .eq("user_id", userId)
        .gt("sequence_no", latestSequenceRef.current)
        .order("sequence_no", { ascending: true });
      if (data?.length) setMessages((current) => data.reduce(mergeMessage, current));
    };
    const onFocus = () => void reconcile();
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      void supabasePortal.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    sessionStorage.setItem(`aura-chat-draft:${userId}`, draft);
    if (composerRef.current) {
      composerRef.current.style.height = "0px";
      composerRef.current.style.height = `${Math.min(composerRef.current.scrollHeight, 128)}px`;
    }
  }, [draft, userId]);

  const loadOlder = async () => {
    const firstSequence = messages.find((message) => message.sequence_no !== null)?.sequence_no;
    if (!firstSequence || !scrollRef.current) return;
    const previousHeight = scrollRef.current.scrollHeight;
    const { data } = await supabasePortal
      .from("messages")
      .select("id,user_id,role,content,created_at,sequence_no,client_message_id,delivery_status,is_audio,audio_url")
      .eq("user_id", userId)
      .lt("sequence_no", firstSequence)
      .order("sequence_no", { ascending: false })
      .limit(PAGE_SIZE);
    if (!data) return;
    setMessages((current) => orderMessages([...(data as ChatMessage[]), ...current]));
    setHasOlder(data.length === PAGE_SIZE);
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop += scrollRef.current.scrollHeight - previousHeight;
    });
  };

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    const clientId = crypto.randomUUID();
    const optimistic: ChatMessage = {
      id: `local:${clientId}`,
      user_id: userId,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
      sequence_no: null,
      client_message_id: clientId,
      delivery_status: "sending",
      is_audio: false,
      audio_url: null,
      optimistic: true,
    };
    setMessages((current) => [...current, optimistic]);
    setDraft("");
    sessionStorage.removeItem(`aura-chat-draft:${userId}`);
    setSending(true);
    scrollToBottom();

    const { data, error } = await supabasePortal.functions.invoke("app-chat", {
      body: { text, client_message_id: clientId },
    });
    if (error || !data?.accepted) {
      setMessages((current) => current.map((message) =>
        message.client_message_id === clientId
          ? { ...message, delivery_status: "failed", optimistic: false }
          : message,
      ));
    } else if (data.message) {
      setMessages((current) => mergeMessage(current, {
        ...optimistic,
        ...data.message,
        content: text,
        delivery_status: "delivered",
        optimistic: false,
      }));
    }
    setSending(false);
    composerRef.current?.focus();
  };

  if (loading) {
    return <div className="flex h-[70dvh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <section className="relative mx-auto flex h-[calc(100dvh-8.75rem)] min-h-[32rem] max-w-2xl flex-col overflow-hidden bg-background">
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground">Conversa com a AURA</h1>
          <p className="text-xs text-muted-foreground">{responding ? "AURA está respondendo" : `Seu espaço, ${firstName}`}</p>
        </div>
        <span className={cn("h-2 w-2 rounded-full", connected ? "bg-primary" : "bg-destructive")} aria-label={connected ? "Conectado" : "Reconectando"} />
      </header>

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const target = event.currentTarget;
          nearBottomRef.current = target.scrollHeight - target.scrollTop - target.clientHeight < 150;
          if (nearBottomRef.current) setShowNew(false);
        }}
        className="flex-1 overflow-y-auto overscroll-contain px-4 py-5"
      >
        {hasOlder && (
          <Button type="button" variant="ghost" size="sm" className="mx-auto mb-5 flex" onClick={() => void loadOlder()}>
            Ver mensagens anteriores
          </Button>
        )}

        {messages.length === 0 && (
          <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center text-center">
            <p className="font-display text-2xl text-foreground">O que está passando por você hoje?</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Pode começar do seu jeito. Estou aqui.</p>
          </div>
        )}

        <div className="space-y-2.5">
          {messages.map((message) => {
            const mine = message.role === "user";
            return (
              <div key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[86%] rounded-lg px-3.5 py-2.5 text-[15px] leading-relaxed shadow-sm",
                  mine ? "bg-primary text-primary-foreground" : "border border-border/60 bg-card text-card-foreground",
                  message.delivery_status === "failed" && "border-destructive/60 bg-destructive/10 text-foreground",
                )}>
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  {message.is_audio && message.audio_url && <audio controls preload="metadata" className="mt-2 max-w-full" src={message.audio_url} />}
                  <div className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    <span>{formatTime(message.created_at)}</span>
                    {mine && message.delivery_status === "sending" && <Check className="h-3 w-3" />}
                    {mine && message.delivery_status === "delivered" && <CheckCheck className="h-3 w-3" />}
                    {mine && message.delivery_status === "failed" && <AlertCircle className="h-3 w-3" />}
                  </div>
                </div>
              </div>
            );
          })}
          {responding && (
            <div className="flex justify-start" aria-live="polite">
              <div className="flex h-9 items-center gap-1 rounded-lg border border-border/60 bg-card px-4">
                {[0, 1, 2].map((dot) => <span key={dot} className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-muted-foreground" style={{ animationDelay: `${dot * 150}ms` }} />)}
              </div>
            </div>
          )}
        </div>
      </div>

      {showNew && (
        <Button type="button" size="icon" className="absolute bottom-24 right-5 h-9 w-9 rounded-full" onClick={() => scrollToBottom()} aria-label="Ir para novas mensagens">
          <ArrowDown />
        </Button>
      )}

      <form onSubmit={send} className="border-t border-border/60 bg-background px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2 rounded-lg border border-input bg-card p-1.5 focus-within:ring-2 focus-within:ring-ring/30">
          <textarea
            ref={composerRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={1}
            maxLength={8000}
            placeholder="Escreva o que está sentindo..."
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground"
            aria-label="Mensagem para a AURA"
          />
          <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={!draft.trim() || sending} aria-label="Enviar mensagem">
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </div>
        {!connected && <p className="mt-1.5 text-center text-xs text-muted-foreground">Reconectando. Sua mensagem não será perdida.</p>}
      </form>
    </section>
  );
}