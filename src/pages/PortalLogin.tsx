import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { lovable } from "@/integrations/lovable";
import { usePortalAuth } from "@/contexts/PortalAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Mail, ArrowRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import logoOlaAura from "@/assets/logo-ola-aura.png";

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

  useEffect(() => {
    if (!loading && session) navigate("/meu-espaco", { replace: true });
  }, [loading, session, navigate]);

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
      redirect_uri: window.location.origin + "/meu-espaco",
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
    toast({
      title: "Código enviado",
      description: "Confere o email — tem um código e um link. Use qualquer um dos dois.",
    });
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) return;
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
        <title>Entrar | Meu Espaço Aura</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="min-h-screen bg-background flex flex-col">
        <div className="bg-card border-b border-border/40">
          <div className="max-w-2xl mx-auto px-5 py-3 flex items-center justify-between">
            <Link to="/">
              <img src={logoOlaAura} alt="Olá AURA" className="h-12 w-auto" />
            </Link>
            <span className="text-xs uppercase tracking-widest text-accent font-semibold font-['Nunito']">
              Meu Espaço
            </span>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-5 py-10">
          <div className="w-full max-w-sm">
            <h1 className="font-['Fraunces'] text-2xl text-foreground text-center mb-2">
              Entrar no Meu Espaço
            </h1>
            <p className="text-sm text-muted-foreground text-center mb-8 font-['Nunito']">
              Acesso seguro às suas jornadas, resumos e cápsulas.
            </p>

            {step === "email" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 mb-4 font-['Nunito']"
                  onClick={handleGoogle}
                >
                  <GoogleIcon />
                  <span className="ml-2">Continuar com Google</span>
                </Button>

                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground font-['Nunito']">ou</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <form onSubmit={handleSendOtp} className="space-y-3">
                  <label className="block">
                    <span className="text-sm text-muted-foreground font-['Nunito'] mb-1.5 block">
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
                      className="h-11"
                    />
                  </label>
                  <Button
                    type="submit"
                    disabled={sending}
                    className="w-full h-11 font-['Nunito']"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Mail size={16} />
                        <span className="ml-2">Receber código por email</span>
                      </>
                    )}
                  </Button>
                </form>
              </>
            )}

            {step === "otp" && (
              <form onSubmit={handleVerify} className="space-y-4">
                <p className="text-sm text-muted-foreground font-['Nunito'] text-center">
                  Enviamos um <strong className="text-foreground">código de 6 dígitos</strong> e um <strong className="text-foreground">link</strong> para
                  <br />
                  <strong className="text-foreground">{email}</strong>
                  <br />
                  <span className="text-xs">Use qualquer um dos dois pra entrar.</span>
                </p>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  autoFocus
                  className="h-12 text-center text-lg tracking-[0.5em] font-mono"
                />
                <p className="text-xs text-muted-foreground text-center font-['Nunito']">
                  Não chegou? Confere o spam ou clica no link do email.
                </p>
                <Button
                  type="submit"
                  disabled={verifying || otp.length < 6}
                  className="w-full h-11 font-['Nunito']"
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
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setOtp("");
                  }}
                  className="block text-xs text-muted-foreground hover:text-accent mx-auto font-['Nunito']"
                >
                  Usar outro email
                </button>
              </form>
            )}

            <p className="text-xs text-muted-foreground text-center mt-8 font-['Nunito']">
              Ao continuar, você concorda com nossos{" "}
              <Link to="/termos" className="underline">Termos</Link> e{" "}
              <Link to="/privacidade" className="underline">Política de Privacidade</Link>.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}