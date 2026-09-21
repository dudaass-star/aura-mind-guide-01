import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowDown, Check, CheckCheck, Loader2, Mic, Send, Square, X } from "lucide-react";
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
  metadata?: unknown;
  optimistic?: boolean;
};

const PAGE_SIZE = 50;
const MAX_AUDIO_MS = 120_000;

type PendingMessage = {
  clientId: string;
  text?: string;
  audioBase64?: string;
  audioMime?: string;
  audioDurationMs?: number;
  createdAt: string;
};

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

function audioStoragePath(message: ChatMessage) {
  if (!message.metadata || typeof message.metadata !== "object" || Array.isArray(message.metadata)) return null;
  const path = (message.metadata as Record<string, unknown>).audio_storage_path;
  return typeof path === "string" ? path : null;
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
  const [recording, setRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [audioError, setAudioError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const nearBottomRef = useRef(true);
  const latestSequenceRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedRef = useRef(0);
  const recordingTimerRef = useRef<number | null>(null);
  const discardRecordingRef = useRef(false);
  const outboxKey = `aura-chat-outbox:${userId}`;

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
          .select("id,user_id,role,content,created_at,sequence_no,client_message_id,delivery_status,is_audio,audio_url,metadata")
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
        const hydrated = await Promise.all((data as ChatMessage[]).map(async (message) => {
          const storagePath = audioStoragePath(message);
          if (!storagePath) return message;
          const { data: signed } = await supabasePortal.storage.from("chat-audios").createSignedUrl(storagePath, 3600);
          return signed?.signedUrl ? { ...message, audio_url: signed.signedUrl } : message;
        }));
        setMessages(orderMessages(hydrated));
        setHasOlder(data.length === PAGE_SIZE);
        setTimeout(() => scrollToBottom("auto"), 0);
      }
      setResponding(Boolean(state?.is_responding));
      setLoading(false);
    };
    void load();

    let reconnectTimer: number | null = null;
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
      .subscribe((status) => {
        const subscribed = status === "SUBSCRIBED";
        setConnected(subscribed);
        if (subscribed) void reconcile();
        else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
          if (reconnectTimer) window.clearTimeout(reconnectTimer);
          reconnectTimer = window.setTimeout(() => void reconcile(), 1500);
        }
      });

    const reconcile = async () => {
      const { data } = await supabasePortal
        .from("messages")
        .select("id,user_id,role,content,created_at,sequence_no,client_message_id,delivery_status,is_audio,audio_url,metadata")
        .eq("user_id", userId)
        .gt("sequence_no", latestSequenceRef.current)
        .order("sequence_no", { ascending: true });
      if (data?.length) setMessages((current) => (data as ChatMessage[]).reduce<ChatMessage[]>((acc, message) => mergeMessage(acc, message), current));
    };
    const onFocus = () => void reconcile();
    const onVisibility = () => document.visibilityState === "visible" && void reconcile();
    const onOnline = () => void reconcile();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
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
      .select("id,user_id,role,content,created_at,sequence_no,client_message_id,delivery_status,is_audio,audio_url,metadata")
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

  const persistOutbox = (pending: PendingMessage | null) => {
    if (pending) localStorage.setItem(outboxKey, JSON.stringify(pending));
    else localStorage.removeItem(outboxKey);
  };

  const submitMessage = async (pending: PendingMessage) => {
    const { data, error } = await supabasePortal.functions.invoke("app-chat", {
      body: {
        text: pending.text,
        client_message_id: pending.clientId,
        audio_base64: pending.audioBase64,
        audio_mime: pending.audioMime,
        audio_duration_ms: pending.audioDurationMs,
        client_sent_at: pending.createdAt,
      },
    });
    if (error || !data?.accepted) throw error || new Error(data?.error || "Falha no envio");
    persistOutbox(null);
    setMessages((current) => mergeMessage(current, {
      id: data.message.id,
      user_id: userId,
      role: "user",
      content: pending.text || "Áudio enviado",
      created_at: data.message.created_at,
      sequence_no: data.message.sequence_no,
      client_message_id: pending.clientId,
      delivery_status: "delivered",
      is_audio: Boolean(pending.audioBase64),
      audio_url: data.message.audio_url || null,
      optimistic: false,
    }));
  };

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    const clientId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const pending: PendingMessage = { clientId, text, createdAt };
    const optimistic: ChatMessage = {
      id: `local:${clientId}`,
      user_id: userId,
      role: "user",
      content: text,
      created_at: createdAt,
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
    persistOutbox(pending);
    scrollToBottom();

    try {
      await submitMessage(pending);
    } catch {
      setMessages((current) => current.map((message) =>
        message.client_message_id === clientId
          ? { ...message, delivery_status: "failed", optimistic: false }
          : message,
      ));
    }
    setSending(false);
    composerRef.current?.focus();
  };

  useEffect(() => {
    const raw = localStorage.getItem(outboxKey);
    if (!raw || !navigator.onLine) return;
    try {
      const pending = JSON.parse(raw) as PendingMessage;
      setSending(true);
      void submitMessage(pending).catch(() => {}).finally(() => setSending(false));
    } catch {
      localStorage.removeItem(outboxKey);
    }
  }, [outboxKey]);

  const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  const stopRecording = (discard = false) => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    discardRecordingRef.current = discard;
    recorder.stop();
  };

  const startRecording = async () => {
    setAudioError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supported = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = supported ? new MediaRecorder(stream, { mimeType: supported }) : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      discardRecordingRef.current = false;
      chunksRef.current = [];
      recordingStartedRef.current = Date.now();
      recorder.ondataavailable = (event) => event.data.size && chunksRef.current.push(event.data);
      recorder.onstop = async () => {
        if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const duration = Math.min(Date.now() - recordingStartedRef.current, MAX_AUDIO_MS);
        const chunks = chunksRef.current;
        chunksRef.current = [];
        if (discardRecordingRef.current) {
          discardRecordingRef.current = false;
          return;
        }
        if (!chunks.length) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 10 * 1024 * 1024) return setAudioError("O áudio ficou grande demais. Grave até 2 minutos.");
        const clientId = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        const pending: PendingMessage = {
          clientId,
          audioBase64: await blobToBase64(blob),
          audioMime: blob.type,
          audioDurationMs: duration,
          createdAt,
        };
        const localUrl = URL.createObjectURL(blob);
        setMessages((current) => [...current, {
          id: `local:${clientId}`, user_id: userId, role: "user", content: "Áudio enviado",
          created_at: createdAt, sequence_no: null, client_message_id: clientId,
          delivery_status: "sending", is_audio: true, audio_url: localUrl, optimistic: true,
        }]);
        setSending(true);
        persistOutbox(pending);
        scrollToBottom();
        try { await submitMessage(pending); }
        catch {
          setMessages((current) => current.map((message) => message.client_message_id === clientId ? { ...message, delivery_status: "failed", optimistic: false } : message));
        } finally { setSending(false); }
      };
      recorder.start(250);
      setRecording(true);
      setRecordingMs(0);
      recordingTimerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - recordingStartedRef.current;
        setRecordingMs(elapsed);
        if (elapsed >= MAX_AUDIO_MS) stopRecording();
      }, 250);
    } catch {
      setAudioError("Não consegui acessar o microfone. Confira a permissão do navegador.");
    }
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
          {recording ? (
            <>
              <Button type="button" size="icon" variant="ghost" className="h-10 w-10 shrink-0" onClick={() => stopRecording(true)} aria-label="Cancelar gravação"><X /></Button>
              <div className="flex min-h-10 flex-1 items-center gap-2 px-2 text-sm text-foreground" aria-live="polite">
                <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
                Gravando {Math.floor(recordingMs / 60000)}:{String(Math.floor(recordingMs / 1000) % 60).padStart(2, "0")}
              </div>
              <Button type="button" size="icon" className="h-10 w-10 shrink-0" onClick={() => stopRecording()} aria-label="Enviar áudio"><Square /></Button>
            </>
          ) : (
          <>
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
            onFocus={() => setTimeout(() => scrollToBottom(), 250)}
          />
          {!draft.trim() && (
            <Button type="button" size="icon" variant="ghost" className="h-10 w-10 shrink-0" disabled={sending} onClick={() => void startRecording()} aria-label="Gravar áudio"><Mic /></Button>
          )}
          <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={!draft.trim() || sending} aria-label="Enviar mensagem">
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
          </>
          )}
        </div>
        {audioError && <p className="mt-1.5 text-center text-xs text-destructive">{audioError}</p>}
        {!connected && <p className="mt-1.5 text-center text-xs text-muted-foreground">Reconectando. Sua mensagem não será perdida.</p>}
      </form>
    </section>
  );
}