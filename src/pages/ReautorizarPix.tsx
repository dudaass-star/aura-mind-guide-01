import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Copy, Check, ShieldCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface QrData {
  authorizationId: string;
  amount: number;
  qrCodeImage: string;
  copyPaste: string;
  expiresAt?: string;
  plan?: string;
  billing?: string;
}

const PLAN_LABELS: Record<string, string> = {
  essencial: "Essencial",
  direcao: "Direção",
  transformacao: "Transformação",
};

/**
 * Página de reautorização do PIX Automático (Bacen).
 * O usuário chega por link com token do portal (sem senha). O QR gerado cobra o
 * ciclo na hora e, no mesmo escaneamento, restabelece o mandato de recorrência.
 */
export default function ReautorizarPix() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  // Oferta de retenção aceita: o mandato novo nasce já no valor reduzido.
  const offer = params.get("offer") || "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<QrData | null>(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<string>("PENDING");
  const [confirmed, setConfirmed] = useState(false);

  const gerarQr = useCallback(async () => {
    if (!token) {
      setError("Link inválido. Abra o link direto do e-mail que enviamos.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "pix-reauth-router",
        { body: { action: "create", token, ...(offer ? { offer } : {}) } },
      );
      if (fnError) throw new Error(fnError.message);
      if (!data || (data as { error?: string }).error) {
        throw new Error((data as { error?: string })?.error || "Falha ao gerar o QR Code");
      }
      setQr(data as QrData);
    } catch (e) {
      setError(
        (e as Error).message ||
          "Não conseguimos gerar o QR Code agora. Tente novamente em alguns minutos.",
      );
    } finally {
      setLoading(false);
    }
  }, [token, offer]);

  // Polling do status da autorização enquanto o QR está na tela.
  useEffect(() => {
    if (!qr?.authorizationId || confirmed) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke("pix-reauth-router", {
          body: { action: "status", token, authorizationId: qr.authorizationId },
        });
        const st = data as { state?: string; status?: string } | null;
        if (st?.status) setStatus(st.status);
        if (st?.state === "active") {
          setConfirmed(true);
          clearInterval(interval);
        }
      } catch {
        /* silencioso: polling é best-effort */
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [qr?.authorizationId, confirmed, token]);

  const copiar = async () => {
    if (!qr?.copyPaste) return;
    await navigator.clipboard.writeText(qr.copyPaste);
    setCopied(true);
    toast.success("Código PIX copiado");
    setTimeout(() => setCopied(false), 2500);
  };

  const planLabel = qr?.plan ? PLAN_LABELS[qr.plan] || qr.plan : "";

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Reativar renovação automática por PIX | AURA</title>
        <meta
          name="description"
          content="Reative em um minuto a renovação automática da sua assinatura AURA por PIX Automático."
        />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <main className="mx-auto max-w-lg px-5 py-10">
        <h1 className="font-serif text-2xl text-foreground">
          Reativar sua renovação automática
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {offer
            ? "Um escaneamento resolve: o pagamento abaixo já é o do novo valor combinado e reativa a renovação automática. Você pode usar qualquer conta sua."
            : "Sua autorização de cobrança automática por PIX foi cancelada no app do banco. Um escaneamento resolve: o pagamento abaixo já é o do próximo ciclo e restabelece a renovação automática ao mesmo tempo."}
        </p>

        {confirmed ? (
          <Card className="mt-6 border-primary/30 bg-primary/5 p-6 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
            <h2 className="mt-3 font-serif text-xl text-foreground">Tudo certo!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Recebemos sua confirmação. Sua assinatura segue ativa e a renovação automática está
              restabelecida. A Aura continua com você, sem interrupção.
            </p>
            <Button asChild className="mt-5">
              <a href="/meu-espaco">Voltar ao meu espaço</a>
            </Button>
          </Card>
        ) : qr ? (
          <Card className="mt-6 p-6">
            <div className="text-center">
              {planLabel && (
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Plano {planLabel}
                </p>
              )}
              <p className="mt-1 font-serif text-2xl text-foreground">
                R$ {Number(qr.amount).toFixed(2).replace(".", ",")}
              </p>
              {qr.qrCodeImage && (
                <img
                  src={
                    qr.qrCodeImage.startsWith("data:")
                      ? qr.qrCodeImage
                      : `data:image/png;base64,${qr.qrCodeImage}`
                  }
                  alt="QR Code para reautorizar a cobrança automática por PIX"
                  className="mx-auto mt-4 h-56 w-56 rounded-xl bg-white p-2"
                />
              )}
            </div>

            <Button variant="outline" className="mt-5 w-full" onClick={copiar}>
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" /> Código copiado
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" /> Copiar código PIX
                </>
              )}
            </Button>

            <div className="mt-5 rounded-xl bg-muted/60 p-4">
              <p className="text-sm font-medium text-foreground">
                O app do banco vai pedir duas confirmações
              </p>
              <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li>1. Confirmar o pagamento deste valor.</li>
                <li>
                  2. Autorizar a <strong>cobrança automática recorrente</strong> — é esta que evita
                  a interrupção nos próximos meses.
                </li>
              </ol>
            </div>

            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Aguardando confirmação do banco{status !== "PENDING" ? ` · ${status}` : ""}
            </p>
          </Card>
        ) : (
          <Card className="mt-6 p-6">
            {error && (
              <p className="mb-4 flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
            )}
            <Button className="w-full" onClick={gerarQr} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando QR Code...
                </>
              ) : (
                "Gerar QR Code de reativação"
              )}
            </Button>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Prefere cartão?{" "}
              <a href="/v2" className="underline">
                Assinar com cartão
              </a>
            </p>
          </Card>
        )}
      </main>
    </div>
  );
}