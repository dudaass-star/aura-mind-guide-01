import { FormEvent, memo, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ArrowDown, ArrowLeft, ArrowRight, Bell, BookOpen, CalendarDays, Check, CheckCheck, ChevronRight, CreditCard, Download, Headphones, Loader2, LogOut, Mic, MoreVertical, RefreshCw, RotateCcw, Send, Share2, Sparkles, Square, SquarePlus, Sun, Trash2, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { cn } from "@/lib/utils";
import avatarAura from "@/assets/avatar-aura.jpg";
import { InstallAppMenuItem, useInstallApp } from "@/components/portal/InstallAppMenuItem";
import { PushNotificationsDialog } from "@/components/portal/PushNotificationsDialog";
import { reportPushConversion } from "@/lib/push-notifications";
import { reportTodayDirectionProgress } from "@/lib/today-direction";
import { VoiceMessagePlayer } from "@/components/portal/VoiceMessagePlayer";
import type { Json } from "@/integrations/supabase/types";
import { readPortalCache, writePortalCache } from "@/lib/portal-cache";
import { MessageResponse } from "@/components/ai-elements/message";

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

function isAppleMobileDevice() {
  const platform = navigator.platform || "";
  const userAgent = navigator.userAgent || "";
  const touchMac = platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/i.test(userAgent) || touchMac;
}

function selectRecordingMimeType() {
  const appleTypes = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4"];
  const otherTypes = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", ...appleTypes];
  const candidates = isAppleMobileDevice() ? appleTypes : otherTypes;
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

type ReportCardMetadata = {
  kind: "report_card";
  report_type: "weekly" | "monthly";
  report_id?: string;
  path?: string;
  title?: string;
  cta?: string;
};

type JourneyEpisodeCardMetadata = {
  kind: "journey_episode_card";
  episode_id: string;
  path: string;
  journey_title: string;
  episode_number: number;
  total_episodes: number;
  title: string;
  reading_minutes?: number;
  cta?: string;
};

function getReportCard(metadata: unknown): ReportCardMetadata | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata as Record<string, unknown>;
  if (value.kind !== "report_card" || (value.report_type !== "weekly" && value.report_type !== "monthly")) return null;
  return value as ReportCardMetadata;
}

function getJourneyEpisodeCard(metadata: unknown): JourneyEpisodeCardMetadata | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata as Record<string, unknown>;
  if (
    value.kind !== "journey_episode_card"
    || typeof value.episode_id !== "string"
    || typeof value.path !== "string"
    || typeof value.journey_title !== "string"
    || typeof value.title !== "string"
    || typeof value.episode_number !== "number"
    || typeof value.total_episodes !== "number"
  ) return null;
  return value as JourneyEpisodeCardMetadata;
}

function isResponseFailure(message: ChatMessage) {
  if (!message.metadata || typeof message.metadata !== "object" || Array.isArray(message.metadata)) return false;
  return (message.metadata as Record<string, unknown>).kind === "response_failure";
}

type PendingMessage = {
  clientId: string;
  text?: string;
  audioBase64?: string;
  audioMime?: string;
  audioDurationMs?: number;
  journeyEpisodeId?: string;
  createdAt: string;
};

function readOutbox(key: string): PendingMessage[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]") as PendingMessage[] | PendingMessage;
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function orderMessages(messages: ChatMessage[]) {
  return [...messages].sort((a, b) => {
    if (a.sequence_no !== null && b.sequence_no !== null) return a.sequence_no - b.sequence_no;
    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
  });
}

function mergeMessage(messages: ChatMessage[], incoming: ChatMessage) {
  const matchingLocalAudio = incoming.client_message_id
    ? messages.find((message) => (
      message.client_message_id === incoming.client_message_id
      && message.is_audio
      && message.audio_url?.startsWith("blob:")
    ))
    : undefined;
  const mergedIncoming = matchingLocalAudio
    ? { ...incoming, audio_url: matchingLocalAudio.audio_url }
    : incoming;
  const filtered = messages.filter((message) => {
    if (message.id === incoming.id) return false;
    return !(incoming.client_message_id && message.client_message_id === incoming.client_message_id);
  });
  return orderMessages([...filtered, mergedIncoming]);
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

function audioDurationMs(message: ChatMessage) {
  if (!message.metadata || typeof message.metadata !== "object" || Array.isArray(message.metadata)) return null;
  const duration = (message.metadata as Record<string, unknown>).audio_duration_ms;
  return typeof duration === "number" && duration > 0 ? duration : null;
}

function audioMimeType(message: ChatMessage) {
  if (!message.metadata || typeof message.metadata !== "object" || Array.isArray(message.metadata)) return undefined;
  const mime = (message.metadata as Record<string, unknown>).audio_mime;
  return typeof mime === "string" && mime ? mime : undefined;
}

function replyTargetId(message: ChatMessage) {
  if (!message.metadata || typeof message.metadata !== "object" || Array.isArray(message.metadata)) return null;
  const value = (message.metadata as Record<string, unknown>).reply_to_message_id;
  return typeof value === "string" ? value : null;
}

function recordConversationEvent(userId: string, eventType: string, metadata: Record<string, unknown> = {}) {
  void supabasePortal.from("portal_value_events").insert([{
    user_id: userId,
    feature: "conversation",
    event_type: eventType,
    source: "app",
    metadata: metadata as Json,
  }]).then(({ error }) => {
    if (error && error.code !== "23505") console.warn("Não foi possível registrar a interação na conversa");
  });
}

function dayKeyBrt() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function hydrateAudioUrls(messages: ChatMessage[]) {
  const paths = [...new Set(messages.map(audioStoragePath).filter((path): path is string => Boolean(path)))];
  if (!paths.length) return messages;
  const { data: signedAudios } = await supabasePortal.storage.from("chat-audios").createSignedUrls(paths, 3600);
  const signedByPath = new Map<string, string>();
  signedAudios?.forEach((signed, index) => {
    const path = paths[index];
    if (path && signed.signedUrl) signedByPath.set(path, signed.signedUrl);
  });
  return messages.map((message) => {
    const path = audioStoragePath(message);
    const signedUrl = path ? signedByPath.get(path) : null;
    return signedUrl ? { ...message, audio_url: signedUrl } : message;
  });
}

const MessageTimeline = memo(function MessageTimeline({
  messages,
  responding,
  onOpenReport,
  onOpenEpisode,
  onRetry,
  onDelete,
}: {
  messages: ChatMessage[];
  responding: boolean;
  onOpenReport: (report: ReportCardMetadata) => void;
  onOpenEpisode: (episode: JourneyEpisodeCardMetadata) => void;
  onRetry: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
}) {
  return (
    <div className="space-y-5">
      {messages.map((message) => {
        const mine = message.role === "user";
        const reportCard = getReportCard(message.metadata);
        const episodeCard = getJourneyEpisodeCard(message.metadata);
        return (
          <div key={message.id} data-chat-message className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
            <div className={cn(
              "min-w-0 max-w-[86%] text-[15px] leading-relaxed md:max-w-[76%]",
              message.is_audio && message.audio_url ? "px-2.5 py-2" : "px-4 py-3",
              mine ? "rounded-2xl rounded-tr-sm border border-primary/80 bg-primary text-primary-foreground shadow-md" : message.is_audio ? "rounded-2xl rounded-tl-sm border border-border/70 bg-card text-foreground shadow-sm" : "text-foreground",
              message.delivery_status === "failed" && "border-destructive/60 bg-destructive/10 text-foreground",
            )} data-message-bubble>
              {episodeCard ? (
                <div className="portal-chat-report-card w-[min(19rem,76vw)] max-w-full space-y-3">
                  <div className="flex items-center justify-between gap-3 text-primary">
                    <span className="flex items-center gap-2"><BookOpen className="h-4 w-4" /><span className="text-[10px] font-bold uppercase">Novo episódio</span></span>
                    <span className="text-[10px] font-semibold">{episodeCard.episode_number} de {episodeCard.total_episodes}</span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">{episodeCard.journey_title}</p>
                    <p className="mt-1 font-display text-lg font-semibold leading-snug text-foreground">{episodeCard.title}</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message.content}</p>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{episodeCard.reading_minutes || 1} min de leitura</span>
                    <span>EP {episodeCard.episode_number}/{episodeCard.total_episodes}</span>
                  </div>
                  <Button type="button" size="sm" className="w-full justify-between" onClick={() => onOpenEpisode(episodeCard)}>{episodeCard.cta || "Abrir episódio"}<ArrowRight className="h-4 w-4" /></Button>
                </div>
              ) : reportCard ? (
                <div className="portal-chat-report-card w-[min(18rem,74vw)] max-w-full space-y-3">
                  <div className="flex items-center gap-2 text-primary"><Sparkles className="h-4 w-4" /><span className="text-[10px] font-bold uppercase">{reportCard.report_type === "weekly" ? "Resumo semanal" : "Relatório mensal"}</span></div>
                  <div><p className="font-display text-lg font-semibold text-foreground">{reportCard.title || (reportCard.report_type === "weekly" ? "Sua semana na Olá Aura" : "Seu mês em perspectiva")}</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{message.content}</p></div>
                  <Button type="button" size="sm" className="w-full justify-between" onClick={() => onOpenReport(reportCard)}>{reportCard.cta || "Ver no Percurso"}<ArrowRight className="h-4 w-4" /></Button>
                </div>
              ) : isResponseFailure(message) ? (
                <div className="space-y-2">
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  {replyTargetId(message) && (
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onRetry({ ...message, id: replyTargetId(message) || message.id })}>
                      <RotateCcw className="h-3.5 w-3.5" /> Tentar responder novamente
                    </Button>
                  )}
                </div>
              ) : (!message.is_audio || !message.audio_url) && (mine
                ? <p className="whitespace-pre-wrap break-words">{message.content}</p>
                : <MessageResponse className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{message.content}</MessageResponse>)}
              {message.is_audio && message.audio_url && (
                <VoiceMessagePlayer src={message.audio_url} mine={mine} durationMs={audioDurationMs(message)} mimeType={audioMimeType(message)} />
              )}
            </div>
            <div className={cn("mt-1.5 flex items-center gap-1 px-1 text-[10px] font-medium text-muted-foreground", mine && "justify-end")}>
              <span>{formatTime(message.created_at)}</span>
              {mine && message.delivery_status === "sending" && <Check className="h-3 w-3" />}
              {mine && message.delivery_status === "delivered" && <CheckCheck className="h-3 w-3 text-primary" />}
              {mine && message.delivery_status === "failed" && <AlertCircle className="h-3 w-3 text-destructive" />}
            </div>
            {mine && message.delivery_status === "failed" && (
              <div className="mt-1 flex items-center gap-1" aria-label="Mensagem não enviada">
                <span className="mr-1 text-xs font-semibold text-destructive">Não enviada</span>
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => onRetry(message)}>
                  <RotateCcw className="h-3.5 w-3.5" /> Tentar novamente
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => onDelete(message)} aria-label="Excluir mensagem não enviada">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        );
      })}
      {responding && (
        <div className="flex scroll-mb-3 justify-start" aria-live="polite" data-typing-indicator>
          <div className="flex h-10 items-center gap-1.5 rounded-2xl rounded-tl-sm border border-border/70 bg-card px-4 shadow-sm" aria-label="AURA está respondendo">
            {[0, 1, 2].map((dot) => <span key={dot} className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-muted-foreground" style={{ animationDelay: `${dot * 150}ms` }} />)}
          </div>
        </div>
      )}
    </div>
  );
});

export function ConversarTab({
  userId,
  firstName,
  onNavigate,
  onPrefetch,
  onOpenBilling,
  onChangePlan,
  onSignOut,
  billingLabel,
  accountLoading = false,
  isDemo = false,
  isActive = true,
  initialChatOpen = false,
  initialDraft,
  discussionEpisodeId,
  entryContext = "regular",
}: {
  userId: string;
  firstName: string;
  onNavigate?: (tab: "hoje" | "sessoes" | "jornadas" | "insights" | "sobre" | "meditacoes") => void;
  onPrefetch?: (tab: "hoje" | "sessoes" | "jornadas" | "insights" | "sobre" | "meditacoes") => void;
  onOpenBilling: () => void;
  onChangePlan: () => void;
  onSignOut: () => void;
  billingLabel: string;
  accountLoading?: boolean;
  isDemo?: boolean;
  isActive?: boolean;
  initialChatOpen?: boolean;
  initialDraft?: string;
  discussionEpisodeId?: string;
  entryContext?: "new" | "migration" | "regular";
}) {
  const navigate = useNavigate();
  const messageCacheKey = `aura-chat-messages:${userId}`;
  const cachedMessages = useMemo(
    () => readPortalCache<ChatMessage[]>(messageCacheKey, 7 * 24 * 60 * 60 * 1000)?.value ?? [],
    [messageCacheKey],
  );
  const [messages, setMessages] = useState<ChatMessage[]>(cachedMessages);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(cachedMessages.length === 0);
  const [sending, setSending] = useState(false);
  const [responding, setResponding] = useState(false);
  const [responseIssue, setResponseIssue] = useState<string | null>(null);
  const [retryingResponse, setRetryingResponse] = useState(false);
  const [connected, setConnected] = useState(true);
  const [hasOlder, setHasOlder] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [audioError, setAudioError] = useState("");
  const [activeDiscussionEpisodeId, setActiveDiscussionEpisodeId] = useState(discussionEpisodeId);
  const [chatOpen, setChatOpen] = useState(() => initialChatOpen || localStorage.getItem(`aura-chat-open:${userId}`) === "true");
  const [showIosInstallGuide, setShowIosInstallGuide] = useState(false);
  const [showInstallInvite, setShowInstallInvite] = useState(false);
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [installInviteResolved, setInstallInviteResolved] = useState(() => {
    const dismissedUntil = Number(localStorage.getItem(`aura-install-dismissed-until:${userId}`) || 0);
    return dismissedUntil > Date.now();
  });
  const [installBannerHidden, setInstallBannerHidden] = useState(() => {
    const dismissedUntil = Number(localStorage.getItem(`aura-install-banner-dismissed-until:${userId}`) || 0);
    return dismissedUntil > Date.now();
  });
  const installApp = useInstallApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [mobileViewport, setMobileViewport] = useState<{ height: number; top: number } | null>(null);
  const nearBottomRef = useRef(true);
  const latestSequenceRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedRef = useRef(0);
  const recordingTimerRef = useRef<number | null>(null);
  const discardRecordingRef = useRef(false);
  const awaitingResponseRef = useRef<{ clientId: string; messageId: string; createdAt: number } | null>(null);
  const responseTimerRef = useRef<number | null>(null);
  const appliedInitialDraftRef = useRef<string | null>(null);
  const outboxKey = `aura-chat-outbox:${userId}`;
  const openReport = (report: ReportCardMetadata) => {
    const url = new URL(report.path || "/meu-espaco?tab=percurso", window.location.origin);
    if (report.report_id) url.searchParams.set("id", report.report_id);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    onNavigate?.("insights");
  };
  const openEpisode = (episode: JourneyEpisodeCardMetadata) => {
    void supabasePortal.from("portal_value_events").insert({ user_id: userId, feature: "journey", event_type: "journey_card_opened", source: "conversation", metadata: { episode_id: episode.episode_id } as Json });
    navigate(episode.path);
  };

  useEffect(() => {
    if (!installApp.available || installApp.installed || chatOpen || responding || draft.trim() || recording) return;
    if (!messages.some((message) => message.role === "assistant")) return;
    const dismissedUntil = Number(localStorage.getItem(`aura-install-dismissed-until:${userId}`) || 0);
    if (dismissedUntil > Date.now()) return;
    const timer = window.setTimeout(() => setShowInstallInvite(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [chatOpen, draft, installApp.available, installApp.installed, messages, recording, responding, userId]);

  useEffect(() => {
    const openPush = () => setShowPushDialog(true);
    window.addEventListener("aura:open-push", openPush);
    return () => window.removeEventListener("aura:open-push", openPush);
  }, []);

  useEffect(() => {
    if (!isActive || chatOpen || recording || responding || draft.trim() || showInstallInvite || installApp.available || localStorage.getItem("aura-push-enabled") === "true") return;
    if (!messages.some((message) => message.role === "assistant")) return;
    const dismissedUntil = Number(localStorage.getItem(`aura-push-dismissed-until:${userId}`) || 0);
    if (dismissedUntil > Date.now()) return;
    const timer = window.setTimeout(() => setShowPushDialog(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [chatOpen, draft, installApp.available, isActive, messages, recording, responding, showInstallInvite, userId]);

  useEffect(() => {
    if (initialChatOpen) setChatOpen(true);
  }, [initialChatOpen]);

  useEffect(() => {
    if (!initialDraft || appliedInitialDraftRef.current === initialDraft) return;
    appliedInitialDraftRef.current = initialDraft;
    setActiveDiscussionEpisodeId(discussionEpisodeId);
    setDraft((current) => {
      if (!current.trim()) return initialDraft;
      if (current.includes(initialDraft)) return current;
      return `${initialDraft}\n\n${current}`;
    });
    setChatOpen(true);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }, [discussionEpisodeId, initialDraft]);

  useEffect(() => {
    const openChat = () => setChatOpen(true);
    window.addEventListener("aura:open-chat", openChat);
    return () => window.removeEventListener("aura:open-chat", openChat);
  }, []);

  useEffect(() => {
    if (!chatOpen || !isActive) return;
    const key = `aura-conversation-opened:${userId}:${dayKeyBrt()}`;
    if (sessionStorage.getItem(key) === "true") return;
    sessionStorage.setItem(key, "true");
    recordConversationEvent(userId, "conversation_opened", { day_brt: dayKeyBrt() });
  }, [chatOpen, isActive, userId]);

  const postponeInstall = () => {
    localStorage.setItem(`aura-install-dismissed-until:${userId}`, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    setShowInstallInvite(false);
    setInstallInviteResolved(true);
  };

  const hideInstallBanner = () => {
    localStorage.setItem(`aura-install-banner-dismissed-until:${userId}`, String(Date.now() + 3 * 24 * 60 * 60 * 1000));
    setInstallBannerHidden(true);
  };

  const beginInstall = async () => {
    setShowInstallInvite(false);
    if (installApp.ios) setShowIosInstallGuide(true);
    else await installApp.install();
  };

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
    const viewport = window.visualViewport;
    if (!viewport) return;

    let frame = 0;
    const syncViewport = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!window.matchMedia("(max-width: 767px)").matches) {
          setMobileViewport(null);
          return;
        }
        setMobileViewport({
          height: Math.round(viewport.height),
          top: Math.round(viewport.offsetTop),
        });
        if (document.activeElement === composerRef.current) {
          scrollToBottom("auto");
        }
      });
    };

    syncViewport();
    viewport.addEventListener("resize", syncViewport);
    viewport.addEventListener("scroll", syncViewport);
    window.addEventListener("orientationchange", syncViewport);
    return () => {
      window.cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", syncViewport);
      viewport.removeEventListener("scroll", syncViewport);
      window.removeEventListener("orientationchange", syncViewport);
    };
  }, []);

  useEffect(() => {
    if (!chatOpen) return;

    nearBottomRef.current = true;
    setShowNew(false);
    let finalFrame = 0;
    const openingFrame = window.requestAnimationFrame(() => {
      finalFrame = window.requestAnimationFrame(() => {
        const conversation = scrollRef.current;
        if (conversation) conversation.scrollTo({ top: conversation.scrollHeight, behavior: "auto" });
      });
    });

    return () => {
      window.cancelAnimationFrame(openingFrame);
      window.cancelAnimationFrame(finalFrame);
    };
  }, [chatOpen]);

  useEffect(() => {
    if (!responding || !nearBottomRef.current) return;
    const timer = window.setTimeout(() => scrollToBottom("smooth"), 80);
    return () => window.clearTimeout(timer);
  }, [responding]);

  useEffect(() => {
    localStorage.removeItem(`aura-chat-open:${userId}`);
    const saved = localStorage.getItem(`aura-chat-draft:${userId}`);
    if (saved) setDraft(saved);

    const load = async () => {
      const { data: initialization } = await supabasePortal.functions.invoke("app-chat", {
        body: { action: "initialize", entry_context: entryContext },
      });
      if (initialization?.message) setChatOpen(true);
      const [{ data, error }, { data: state }] = await Promise.all([
        supabasePortal
          .from("messages")
          .select("id,user_id,role,content,created_at,sequence_no,client_message_id,delivery_status,is_audio,audio_url,metadata")
          .eq("user_id", userId)
          .order("sequence_no", { ascending: false })
          .limit(PAGE_SIZE),
        supabasePortal
          .from("aura_response_state")
          .select("is_responding,response_started_at")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      if (!error && data) {
        const hydrated = await hydrateAudioUrls(data as ChatMessage[]);
        const ordered = orderMessages(hydrated);
        setMessages(ordered);
        writePortalCache(messageCacheKey, ordered.map((message) => ({
          ...message,
          audio_url: message.audio_url?.startsWith("blob:") ? null : message.audio_url,
          optimistic: false,
        })));
        setHasOlder(data.length === PAGE_SIZE);
        setTimeout(() => scrollToBottom("auto"), 0);
      }
      const responseStartedAt = state?.response_started_at ? new Date(state.response_started_at).getTime() : 0;
      const responseAge = responseStartedAt ? Date.now() - responseStartedAt : 0;
      const responseIsStale = Boolean(state?.is_responding && responseAge > 40_000);
      setResponding(Boolean(state?.is_responding && !responseIsStale));
      if (responseIsStale && data) {
        const latestUserMessage = (data as ChatMessage[]).find((message) => message.role === "user");
        if (latestUserMessage) {
          awaitingResponseRef.current = {
            clientId: latestUserMessage.client_message_id || latestUserMessage.id,
            messageId: latestUserMessage.id,
            createdAt: responseStartedAt,
          };
          setResponseIssue("A resposta demorou mais que o esperado.");
        }
      }
      setLoading(false);
    };
    void load();

    let reconnectTimer: number | null = null;
    const channel = supabasePortal
      .channel(`portal-chat:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `user_id=eq.${userId}` },
        async (payload) => {
          const incoming = payload.new as ChatMessage;
          const [hydratedIncoming] = await hydrateAudioUrls([incoming]);
          if (hydratedIncoming) {
            setMessages((current) => mergeMessage(current, hydratedIncoming));
            if (hydratedIncoming.role === "assistant") {
              const awaiting = awaitingResponseRef.current;
              if (!awaiting || !replyTargetId(hydratedIncoming) || replyTargetId(hydratedIncoming) === awaiting.messageId) {
                awaitingResponseRef.current = null;
                if (responseTimerRef.current) window.clearTimeout(responseTimerRef.current);
                setResponseIssue(null);
                recordConversationEvent(userId, "response_received", {
                  response_seconds: awaiting ? Math.round((Date.now() - awaiting.createdAt) / 100) / 10 : null,
                });
              }
            }
          }
          if (nearBottomRef.current) setTimeout(() => scrollToBottom(), 0);
          else setShowNew(true);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "aura_response_state", filter: `user_id=eq.${userId}` },
        (payload) => {
          const isResponding = Boolean(payload.new.is_responding);
          setResponding(isResponding);
          if (responseTimerRef.current) window.clearTimeout(responseTimerRef.current);
          if (!isResponding) return;

          const startedAt = typeof payload.new.response_started_at === "string"
            ? new Date(payload.new.response_started_at).getTime()
            : Date.now();
          const remainingMs = Math.max(0, 40_000 - Math.max(0, Date.now() - startedAt));
          responseTimerRef.current = window.setTimeout(() => {
            setResponding(false);
            setResponseIssue("A resposta demorou mais que o esperado.");
            recordConversationEvent(userId, "response_timeout", { seconds: 40, source: "response_state" });
          }, remainingMs);
        },
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
        .order("sequence_no", { ascending: true })
        .limit(PAGE_SIZE);
      if (data?.length) {
        const hydrated = await hydrateAudioUrls(data as ChatMessage[]);
        setMessages((current) => hydrated.reduce<ChatMessage[]>((acc, message) => mergeMessage(acc, message), current));
      }
    };
    const onFocus = () => void reconcile();
    const onVisibility = () => document.visibilityState === "visible" && void reconcile();
    const onOnline = () => void reconcile();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (responseTimerRef.current) window.clearTimeout(responseTimerRef.current);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabasePortal.removeChannel(channel);
    };
  }, [entryContext, messageCacheKey, userId]);

  useEffect(() => {
    if (loading || messages.length === 0) return;
    const timer = window.setTimeout(() => {
      writePortalCache(messageCacheKey, messages.slice(-PAGE_SIZE).map((message) => ({
        ...message,
        audio_url: message.audio_url?.startsWith("blob:") ? null : message.audio_url,
        optimistic: false,
      })));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loading, messageCacheKey, messages]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const composer = composerRef.current;
      if (!composer) return;
      composer.style.height = "0px";
      composer.style.height = `${Math.min(composer.scrollHeight, 128)}px`;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [draft]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draft) localStorage.setItem(`aura-chat-draft:${userId}`, draft);
      else localStorage.removeItem(`aura-chat-draft:${userId}`);
    }, 400);
    return () => window.clearTimeout(timer);
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
    const hydrated = await hydrateAudioUrls(data as ChatMessage[]);
    setMessages((current) => orderMessages([...hydrated, ...current]));
    setHasOlder(data.length === PAGE_SIZE);
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop += scrollRef.current.scrollHeight - previousHeight;
    });
  };

  const enqueueOutbox = (pending: PendingMessage) => {
    const queue = readOutbox(outboxKey).filter((item) => item.clientId !== pending.clientId);
    localStorage.setItem(outboxKey, JSON.stringify([...queue, pending]));
  };

  const removeFromOutbox = (clientId: string) => {
    const queue = readOutbox(outboxKey).filter((item) => item.clientId !== clientId);
    if (queue.length) localStorage.setItem(outboxKey, JSON.stringify(queue));
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
        journey_episode_id: pending.journeyEpisodeId,
        client_sent_at: pending.createdAt,
      },
    });
    if (error || !data?.accepted) throw error || new Error(data?.error || "Falha no envio");
    void reportPushConversion("/meu-espaco?tab=conversar", "first14_conversation");
    reportTodayDirectionProgress(userId, "completed", "conversation");
    if (pending.journeyEpisodeId) setActiveDiscussionEpisodeId(undefined);
    removeFromOutbox(pending.clientId);
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
      metadata: data.message.metadata,
      optimistic: false,
    }));
    awaitingResponseRef.current = { clientId: pending.clientId, messageId: data.message.id, createdAt: Date.now() };
    setResponding(true);
    setResponseIssue(null);
    if (responseTimerRef.current) window.clearTimeout(responseTimerRef.current);
    responseTimerRef.current = window.setTimeout(() => {
      if (!awaitingResponseRef.current) return;
      setResponding(false);
      setResponseIssue("A resposta demorou mais que o esperado.");
      recordConversationEvent(userId, "response_timeout", { seconds: 40 });
    }, 40_000);
  };

  const retryFailedMessage = async (message: ChatMessage) => {
    if (message.role === "assistant" && isResponseFailure(message)) {
      awaitingResponseRef.current = { clientId: crypto.randomUUID(), messageId: message.id, createdAt: Date.now() };
      await retryResponseFor(message.id);
      return;
    }
    const clientId = message.client_message_id;
    if (!clientId || sending) return;
    const pending = readOutbox(outboxKey).find((item) => item.clientId === clientId);
    if (!pending) {
      setMessages((current) => current.filter((item) => item.id !== message.id));
      if (!message.is_audio) setDraft(message.content);
      return;
    }
    setMessages((current) => current.map((item) => item.client_message_id === clientId ? { ...item, delivery_status: "sending" } : item));
    setSending(true);
    recordConversationEvent(userId, "send_retry", { kind: message.is_audio ? "audio" : "text" });
    try {
      await submitMessage(pending);
    } catch {
      setMessages((current) => current.map((item) => item.client_message_id === clientId ? { ...item, delivery_status: "failed" } : item));
    } finally {
      setSending(false);
    }
  };

  const deleteFailedMessage = (message: ChatMessage) => {
    if (message.client_message_id) removeFromOutbox(message.client_message_id);
    if (message.audio_url?.startsWith("blob:")) URL.revokeObjectURL(message.audio_url);
    setMessages((current) => current.filter((item) => item.id !== message.id));
    recordConversationEvent(userId, "failed_message_deleted", { kind: message.is_audio ? "audio" : "text" });
  };

  const retryResponseFor = async (sourceMessageId?: string) => {
    const awaiting = awaitingResponseRef.current;
    if (!awaiting || retryingResponse) return;
    setRetryingResponse(true);
    setResponseIssue(null);
    setResponding(true);
    recordConversationEvent(userId, "response_retry");
    const { data, error } = await supabasePortal.functions.invoke("app-chat", {
      body: { action: "retry_response", source_message_id: sourceMessageId || awaiting.messageId },
    });
    if (error || !data?.accepted) {
      setResponding(false);
      setResponseIssue("Não consegui retomar agora. Tente mais uma vez em instantes.");
    } else if (data.already_answered) {
      awaitingResponseRef.current = null;
      setResponding(false);
      setResponseIssue(null);
    } else {
      awaitingResponseRef.current = { ...awaiting, clientId: data.retry_id || awaiting.clientId, createdAt: Date.now() };
      if (responseTimerRef.current) window.clearTimeout(responseTimerRef.current);
      responseTimerRef.current = window.setTimeout(() => {
        if (!awaitingResponseRef.current) return;
        setResponding(false);
        setResponseIssue("A resposta ainda não chegou. Você pode tentar novamente.");
      }, 40_000);
    }
    setRetryingResponse(false);
  };

  const retryResponse = () => retryResponseFor();

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    const clientId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const pending: PendingMessage = { clientId, text, journeyEpisodeId: activeDiscussionEpisodeId, createdAt };
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
    localStorage.removeItem(`aura-chat-draft:${userId}`);
    setSending(true);
    setResponding(true);
    setResponseIssue(null);
    enqueueOutbox(pending);
    scrollToBottom();

    try {
      await submitMessage(pending);
    } catch {
      setResponding(false);
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
    const flushOutbox = () => {
      const queue = readOutbox(outboxKey);
      if (!queue.length || !navigator.onLine) return;
      setSending(true);
      void queue.reduce(
        (chain, pending) => chain.then(() => submitMessage(pending)).catch(() => undefined),
        Promise.resolve(),
      ).finally(() => setSending(false));
    };

    flushOutbox();
    window.addEventListener("online", flushOutbox);
    return () => window.removeEventListener("online", flushOutbox);
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
      const supported = selectRecordingMimeType();
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
        const recordedType = recorder.mimeType || chunks.find((chunk) => chunk.type)?.type || "audio/mp4";
        const blob = new Blob(chunks, { type: recordedType });
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
           metadata: { audio_duration_ms: duration, audio_mime: blob.type },
        }]);
        setSending(true);
        setResponding(true);
        setResponseIssue(null);
        enqueueOutbox(pending);
        scrollToBottom();
        try { await submitMessage(pending); }
        catch {
          setResponding(false);
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
    return <div className="flex h-dvh items-center justify-center bg-background"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  const latestMessage = messages[messages.length - 1];
  const latestPreview = latestMessage?.is_audio
    ? "Áudio"
    : latestMessage?.content?.replace(/\s+/g, " ").trim() || "Sua conversa com a AURA começa aqui.";
  const appAreas = [
    { label: "Hoje", detail: "O que te acompanha agora", tab: "hoje", icon: Sun, tone: "portal-area-today" },
    { label: "Sessões", detail: "Seus encontros com a AURA", tab: "sessoes", icon: CalendarDays, tone: "portal-area-sessions" },
    { label: "Jornadas", detail: "Conteúdos para acompanhar você", tab: "jornadas", icon: BookOpen, tone: "portal-area-content" },
    { label: "Percurso", detail: "O que vem mudando", tab: "insights", icon: Sparkles, tone: "portal-area-journey" },
    { label: "Meditações", detail: "Pausas guiadas para você", tab: "meditacoes", icon: Headphones, tone: "portal-area-audio" },
    { label: "Sobre você", detail: "Sua história reunida", tab: "sobre", icon: UserRound, tone: "portal-area-profile" },
  ] as const;
  const navigateFromConversation = (tab: typeof appAreas[number]["tab"]) => {
    recordConversationEvent(userId, "area_opened_from_conversation", { destination: tab });
    onNavigate?.(tab);
  };

  const conversationList = (
    <aside className={cn(
       "flex h-dvh min-h-0 w-full flex-col bg-background md:h-[min(820px,calc(100dvh-3rem))] md:min-h-[36rem]",
       chatOpen && "hidden",
    )}>
      <header className="border-b border-border/70 bg-card/90 pb-5 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-[max(1.25rem,env(safe-area-inset-top))] shadow-sm backdrop-blur-xl md:pt-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Olá, {firstName}</p>
            <h1 className="font-display text-[2rem] font-semibold leading-none text-foreground">Conversas</h1>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-full border border-border bg-card shadow-sm" aria-label="Abrir menu da conta">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} collisionPadding={16} className="z-[70] w-64 max-w-[calc(100vw-2rem)] rounded-lg border-border bg-background p-1.5 shadow-card">
              {!isDemo && <DropdownMenuItem onSelect={onOpenBilling} disabled={accountLoading} className="gap-3 px-3 py-3 font-body">
                {accountLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                <span>{accountLoading ? "Abrindo…" : billingLabel}</span>
              </DropdownMenuItem>}
              {!isDemo && <DropdownMenuItem onSelect={onChangePlan} className="gap-3 px-3 py-3 font-body">
                <RefreshCw className="h-4 w-4" />
                <span>Trocar de plano</span>
              </DropdownMenuItem>}
              <InstallAppMenuItem
                available={installApp.available}
                ios={installApp.ios}
                onInstall={installApp.install}
                onShowIosGuide={() => setShowIosInstallGuide(true)}
              />
              {!isDemo && <DropdownMenuItem onSelect={() => setShowPushDialog(true)} className="gap-3 px-3 py-3 font-body">
                <Bell className="h-4 w-4" />
                <span>Notificações</span>
              </DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onSignOut} className="gap-3 px-3 py-3 font-body text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" />
                <span>Sair</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {installApp.available && !installApp.installed && installInviteResolved && !installBannerHidden && (
        <div className="px-4 pt-4">
          <div className="portal-area-content flex items-center gap-3 rounded-2xl border border-current/15 px-3 py-3 shadow-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background/70" aria-hidden="true">
              <Download className="h-5 w-5" />
            </span>
            <Button type="button" variant="ghost" className="h-auto min-w-0 flex-1 justify-start p-0 text-left hover:bg-transparent" onClick={() => void beginInstall()}>
              <span className="min-w-0 whitespace-normal">
              <span className="block text-sm font-bold text-foreground">Tenha a Olá Aura sempre por perto</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Adicione à tela inicial para entrar com um toque.</span>
              </span>
            </Button>
            <Button type="button" size="sm" className="h-9 shrink-0 px-3 font-body" onClick={() => void beginInstall()}>
              Instalar
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={hideInstallBanner} aria-label="Ocultar convite para instalar">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="px-4 pb-3 pt-5">
        <p className="mb-3 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Conversa principal</p>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setChatOpen(true)}
          className="portal-primary-conversation group h-auto w-full justify-start gap-3 rounded-2xl border px-3 py-4 text-left shadow-sm transition-transform active:scale-[0.99] hover:border-primary/30"
          aria-label="Abrir conversa com a AURA"
        >
          <div className="relative shrink-0">
            <img src={avatarAura} alt="AURA" className="h-14 w-14 rounded-full object-cover ring-1 ring-border" />
            <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background bg-primary" aria-label="AURA disponível" />
          </div>
           <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-body text-base font-bold text-foreground">AURA</span>
              <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{formatTime(latestMessage?.created_at || null)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-normal text-muted-foreground">{latestPreview}</p>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto border-t border-border/50 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">No app Olá Aura</p>
          <p className="text-[11px] text-muted-foreground">Tudo em um só lugar</p>
        </div>
        <div className="space-y-1">
          {appAreas.map(({ label, detail, tab, icon: Icon, tone }) => (
            <Button
              key={tab}
              type="button"
              variant="ghost"
              onClick={() => navigateFromConversation(tab)}
              onPointerEnter={() => onPrefetch?.(tab)}
              onFocus={() => onPrefetch?.(tab)}
              onTouchStart={() => onPrefetch?.(tab)}
              className="group h-auto w-full justify-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-card"
            >
              <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105", tone)}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-foreground">{label}</span>
                <span className="block truncate text-xs font-normal text-muted-foreground">{detail}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5" />
            </Button>
          ))}
        </div>
      </div>
    </aside>
  );

  const openConversation = (
    <section className={cn(
       "relative h-dvh min-h-0 flex-1 flex-col overflow-hidden bg-background md:h-[min(820px,calc(100dvh-3rem))] md:min-h-[36rem]",
      chatOpen ? "flex" : "hidden",
    )}>
      <header className="flex min-h-[calc(4.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-3 border-b border-border/70 bg-card/90 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] shadow-sm backdrop-blur-xl md:min-h-[4.5rem] md:px-5 md:pt-0">
         <Button type="button" variant="ghost" size="icon" className="h-10 w-10 rounded-full" onClick={() => setChatOpen(false)} aria-label="Voltar para conversas">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="relative shrink-0">
          <img src={avatarAura} alt="AURA" className="h-11 w-11 rounded-full object-cover ring-2 ring-primary/20" />
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-body text-base font-bold text-foreground">AURA</h2>
           <p className="truncate text-xs text-muted-foreground">{responding ? "respondendo…" : connected ? "disponível" : "reconectando…"}</p>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const target = event.currentTarget;
          nearBottomRef.current = target.scrollHeight - target.scrollTop - target.clientHeight < 150;
          if (nearBottomRef.current) setShowNew(false);
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-secondary/45 px-4 py-5 sm:px-5"
      >
        {hasOlder && (
          <Button type="button" variant="ghost" size="sm" className="mx-auto mb-5 flex" onClick={() => void loadOlder()}>
            Ver mensagens anteriores
          </Button>
        )}

        {messages.length === 0 && (
          <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center text-center">
            <img src={avatarAura} alt="AURA" className="mb-4 h-16 w-16 rounded-full object-cover ring-4 ring-card" />
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Sua conversa com a AURA</p>
            <p className="mt-2 font-display text-2xl text-foreground">Pode falar do seu jeito.</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">A AURA está disponível por texto ou áudio.</p>
          </div>
        )}

          <MessageTimeline messages={messages} responding={responding} onOpenReport={openReport} onOpenEpisode={openEpisode} onRetry={(message) => void retryFailedMessage(message)} onDelete={deleteFailedMessage} />
      </div>

      {showNew && (
        <Button type="button" size="icon" className="absolute bottom-24 right-5 h-9 w-9 rounded-full" onClick={() => scrollToBottom()} aria-label="Ir para novas mensagens">
          <ArrowDown />
        </Button>
      )}

         <form onSubmit={send} className="shrink-0 border-t border-border/60 bg-card/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-3 backdrop-blur-xl">
          {responseIssue && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2" role="status">
              <p className="text-xs font-medium text-foreground">{responseIssue}</p>
              <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 gap-1 px-2 text-xs" disabled={retryingResponse} onClick={() => void retryResponse()}>
                {retryingResponse ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Tentar de novo
              </Button>
            </div>
          )}
         <div className="flex items-end gap-2 rounded-2xl border border-input bg-secondary/55 p-1.5 shadow-inner focus-within:border-primary/50 focus-within:bg-card focus-within:ring-2 focus-within:ring-ring/20">
          {recording ? (
            <>
              <Button type="button" size="icon" variant="ghost" className="h-10 w-10 shrink-0" onClick={() => stopRecording(true)} aria-label="Cancelar gravação"><X /></Button>
               <div className="flex min-h-10 flex-1 items-center gap-2 px-2 text-sm text-foreground" aria-live="polite">
                 <span className="flex h-5 items-center gap-0.5" aria-hidden="true">
                   {[0, 1, 2, 3].map((bar) => <span key={bar} className="w-0.5 animate-waveform rounded-full bg-destructive" style={{ animationDelay: `${bar * 90}ms` }} />)}
                 </span>
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
             placeholder="Mensagem..."
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground"
            aria-label="Mensagem para a AURA"
            onFocus={() => {
              setTimeout(() => scrollToBottom("auto"), 120);
              setTimeout(() => scrollToBottom("auto"), 350);
            }}
          />
          {!draft.trim() && (
            <Button type="button" size="icon" variant="ghost" className="h-10 w-10 shrink-0" disabled={sending} onClick={() => void startRecording()} aria-label="Gravar áudio"><Mic /></Button>
          )}
           <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-full shadow-sm" disabled={!draft.trim() || sending} aria-label="Enviar mensagem">
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

  return (
    <main
      className="portal-chat-theme fixed inset-x-0 min-h-0 overflow-hidden bg-foreground/10 md:relative md:inset-auto md:min-h-dvh md:overflow-visible md:flex md:items-center md:justify-center md:p-6"
      style={mobileViewport ? { height: `${mobileViewport.height}px`, top: `${mobileViewport.top}px` } : { height: "100dvh", top: 0 }}
    >
       <div className={cn("mx-auto flex w-full overflow-hidden bg-background md:rounded-2xl md:border md:border-border/70 md:shadow-card", chatOpen ? "max-w-4xl" : "max-w-lg")}>
        {conversationList}
        {openConversation}
      </div>
      <Dialog open={showIosInstallGuide} onOpenChange={setShowIosInstallGuide}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-lg border-border bg-background p-6 shadow-card">
          <DialogHeader className="text-left">
            <DialogTitle className="font-display text-xl text-foreground">Instalar o Olá Aura no iPhone</DialogTitle>
            <DialogDescription className="pt-1 font-body leading-relaxed">
              Faça isso no Safari para deixar o Olá Aura na sua tela inicial.
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-4 pt-2 font-body text-sm text-foreground">
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary"><Share2 className="h-4 w-4" /></span>
              <span className="pt-1.5">Toque em <strong>Compartilhar</strong> na barra do Safari.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary"><SquarePlus className="h-4 w-4" /></span>
              <span className="pt-1.5">Escolha <strong>Adicionar à Tela de Início</strong> e confirme.</span>
            </li>
          </ol>
        </DialogContent>
      </Dialog>
      <Dialog open={showInstallInvite} onOpenChange={(open) => open ? setShowInstallInvite(true) : postponeInstall()}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-lg border-border bg-background p-6 shadow-card">
          <DialogHeader className="text-left">
            <DialogTitle className="font-display text-2xl text-foreground">Deixe o Olá Aura mais perto</DialogTitle>
            <DialogDescription className="pt-1 font-body leading-relaxed">
              Adicione o Olá Aura à sua tela inicial. Depois, é só tocar no ícone para voltar às suas conversas com a AURA.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-2">
            <Button type="button" className="h-11 w-full font-body" onClick={() => void beginInstall()}>
              <Download className="h-4 w-4" />
              {installApp.ios ? "Ver como adicionar" : "Instalar Olá Aura"}
            </Button>
            <Button type="button" variant="ghost" className="h-10 w-full font-body text-muted-foreground" onClick={postponeInstall}>
              Agora não
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <PushNotificationsDialog
        open={showPushDialog}
        onOpenChange={(open) => {
          setShowPushDialog(open);
          if (!open && localStorage.getItem("aura-push-enabled") !== "true") {
            localStorage.setItem(`aura-push-dismissed-until:${userId}`, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
          }
        }}
        onInstallNeeded={() => {
          setShowPushDialog(false);
          setShowIosInstallGuide(true);
        }}
      />
    </main>
  );
}