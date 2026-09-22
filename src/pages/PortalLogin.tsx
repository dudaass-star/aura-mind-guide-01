import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { lovable } from "@/integrations/lovable";
import { usePortalAuth } from "@/contexts/PortalAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Mail, ArrowRight, MessageCircle, RefreshCw, MessagesSquare, BookOpen, CalendarDays, Headphones } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import logoOlaAura from "@/assets/logo-ola-aura.png";
import avatarAura from "@/assets/avatar-aura.jpg";
import { auraWhatsAppLink } from "@/components/portal/whatsapp";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.79 2.72v2.26h2.9c1.7-1.57 2.69-3.88 2.69-6.63z" />
    <path fill="#34A853" d="M9 18c2.43 0 4.46-.81 5.95-2.18l-2.9-2.26c-.81.54-1.83.86-3.05.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.34A9 9 0 0 0 9 18z" />
    <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.33z" />
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
  </svg>
);

export default function PortalLogin() {
  const { session, loading } = usePortalAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (!loading && session) navigate("/meu-espaco", { replace: true });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => setResendIn((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  const handleGoogle = async () => {
    // O Google é gerenciado pelo broker Lovable (sem client secret no Supabase).
    // O callback grava a sessão no cliente Supabase padrão; ela é migrada pro
    // cliente do portal pelo PortalAuthContext ao aterrissar em /meu-espaco.
    // Marca o alvo como "portal" para o useAdminAuth ignorar essa sessão
    // e não logar o usuário no /admin por engano.
    try {
      sessionStorage.setItem("aura-oauth-target", "portal");
    } catch {}
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/meu-espaco/auth/callback",
    });
    if (result.error) {
      try { sessionStorage.removeItem("aura-oauth-target"); } catch {}
      toast({
        title: "Não conseguimos entrar",
        description: "Tente de novo em instantes.",
        variant: "destructive",
      });
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) {
      toast({ title: "Email inválido", variant: "destructive" });
      return;
    }
    setSending(true);
    const { error } = await supabasePortal.auth.signInWithOtp({
      email: normalized,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin + "/meu-espaco",
      },
    });
    setSending(false);
    if (error) {
      toast({
        title: "Não conseguimos enviar o código",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setStep("otp");
    setResendIn(60);
    toast({
      title: "Código enviado",
      description: "Confere o email — tem um código e um link. Use qualquer um dos dois.",
    });
  };

  const handleResend = async () => {
    if (sending || resendIn > 0) return;
    setSending(true);
    const { error } = await supabasePortal.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin + "/meu-espaco",
      },
    });
    setSending(false);
    if (error) {
      toast({ title: "Não conseguimos reenviar agora", description: "Tente novamente em instantes.", variant: "destructive" });
      return;
    }
    setResendIn(60);
    toast({ title: "Novo código enviado", description: "Use apenas o código mais recente." });
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 8) return;
    setVerifying(true);
    const { error } = await supabasePortal.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: otp.trim(),
      type: "email",
    });
    setVerifying(false);
    if (error) {
      toast({
        title: "Código incorreto",
        description: "Verifique e tente de novo.",
        variant: "destructive",
      });
      return;
    }
    // sucesso: o AuthContext detecta e o useEffect redireciona
  };

  return (
    <>
      <Helmet>
        <title>Entrar no aplicativo | Olá Aura</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="portal-chat-theme portal-login-page min-h-dvh bg-background text-foreground flex flex-col">
        <header className="border-b border-border/70 bg-card/90 backdrop-blur-xl">
          <div className="max-w-lg mx-auto px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center justify-center">
            <Link to="/" aria-label="Olá Aura — página inicial">
              <img src={logoOlaAura} alt="Olá Aura" className="h-12 w-auto" />
            </Link>
          </div>
        </header>

        <main className="flex-1 px-5 py-7 sm:py-9">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-5 flex flex-col items-center text-center">
              <div className="relative mb-3">
                <img src={avatarAura} alt="AURA" className="h-16 w-16 rounded-full object-cover ring-4 ring-secondary" />
                <span className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-[3px] border-background bg-primary" aria-hidden="true" />
              </div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Olá Aura, sempre por perto</p>
              <h1 className="font-display text-[1.75rem] font-semibold leading-tight text-foreground">
                Entre na Olá Aura
              </h1>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground font-body">
                Continue suas conversas e acesse tudo o que acompanha você.
              </p>
            </div>

            <div className="mb-6 grid grid-cols-4 border-y border-border/70 py-3" aria-label="Recursos do aplicativo">
              {[
                { label: "Conversa", icon: MessagesSquare, tone: "portal-area-conversation" },
                { label: "Jornadas", icon: BookOpen, tone: "portal-area-content" },
                { label: "Sessões", icon: CalendarDays, tone: "portal-area-sessions" },
                { label: "Meditações", icon: Headphones, tone: "portal-area-audio" },
              ].map(({ label, icon: Icon, tone }) => (
                <div key={label} className="flex min-w-0 flex-col items-center gap-1.5 px-1 text-center">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}><Icon className="h-4 w-4" /></span>
                  <span className="w-full truncate text-[10px] font-semibold text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>

            {step === "email" && (
              <>
                <Button
                  type="button"
                  className="w-full h-12 mb-4 font-body shadow-sm"
                  onClick={handleGoogle}
                >
                  <GoogleIcon />
                  <span className="ml-2">Continuar com Google</span>
                </Button>

                <form onSubmit={handleSendOtp} className="space-y-3">
                  <label className="block">
                    <span className="text-sm text-muted-foreground font-body mb-1.5 block">
                      Seu email
                    </span>
                    <Input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="voce@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-11 bg-card"
                    />
                  </label>
                  <Button
                    type="submit"
                    disabled={sending}
                    className="w-full h-11 font-body"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Mail size={16} />
                        <span className="ml-2">Entrar por email</span>
                      </>
                    )}
                  </Button>
                </form>

                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground font-body">precisa de ajuda para entrar?</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <Button asChild type="button" variant="ghost" className="w-full min-h-11 h-auto py-2.5 font-body text-muted-foreground">
                  <a
                    href={auraWhatsAppLink("Quero receber um link de acesso ao aplicativo Olá Aura no meu WhatsApp cadastrado.")}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={17} />
                    <span className="ml-2">Receber link pelo WhatsApp</span>
                  </a>
                </Button>
              </>
            )}

            {step === "otp" && (
              <div className="space-y-4">
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="mb-2 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Entrada segura</p>
                  <h2 className="mt-1 font-display text-xl font-semibold text-foreground">Confira seu email</h2>
                </div>
                <p className="text-sm text-muted-foreground font-body text-center">
                  Enviamos um <strong className="text-foreground">código de 8 dígitos</strong> e um <strong className="text-foreground">link</strong> para
                  <br />
                  <strong className="text-foreground">{email}</strong>
                  <br />
                  <span className="text-xs">Use qualquer um dos dois pra entrar.</span>
                </p>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  maxLength={8}
                  placeholder="00000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  autoFocus
                  className="h-12 text-center text-lg tracking-[0.5em] font-mono"
                />
                <Button
                  type="submit"
                  disabled={verifying || otp.length !== 8}
                  className="w-full h-11 font-body"
                >
                  {verifying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <span>Entrar</span>
                      <ArrowRight size={16} className="ml-2" />
                    </>
                  )}
                </Button>
              </form>

                <Button
                  type="button"
                  variant="ghost"
                  disabled={sending || resendIn > 0}
                  onClick={handleResend}
                  className="w-full h-10 text-sm font-body"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw size={15} />}
                  <span className="ml-2">{resendIn > 0 ? `Reenviar código em ${resendIn}s` : "Reenviar código"}</span>
                </Button>

                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground font-body">não recebeu?</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <Button asChild type="button" variant="outline" className="w-full min-h-11 h-auto bg-card py-2.5 font-body">
                  <a
                    href={auraWhatsAppLink("Não recebi o código. Quero entrar no aplicativo Olá Aura.")}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={17} />
                    <span className="ml-2">Entrar pelo WhatsApp cadastrado</span>
                  </a>
                </Button>
                <p className="text-xs text-muted-foreground text-center font-body">
                  Envie a mensagem pronta. A Aura responderá com um link seguro para entrar.
                </p>

                <Button
                  type="button"
                  variant="link"
                  onClick={() => {
                    setStep("email");
                    setOtp("");
                  }}
                  className="mx-auto flex h-auto text-xs text-muted-foreground font-body"
                >
                  Usar outro email
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground text-center mt-7 pb-[max(0.5rem,env(safe-area-inset-bottom))] font-body">
              Ao continuar, você concorda com nossos{" "}
              <Link to="/termos" className="underline">Termos</Link> e{" "}
              <Link to="/privacidade" className="underline">Política de Privacidade</Link>.
            </p>
          </div>
        </main>
      </div>
    </>
  );
}