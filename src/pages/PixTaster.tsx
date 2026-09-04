import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, Copy, Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface TasterInfo {
  valueCents: number;
  qrImage: string | null;
  copyPaste: string | null;
  paid: boolean;
  expired: boolean;
  firstName: string | null;
}

/**
 * Página pública do encontro guiado avulso de R$ 6,90.
 * O link chega pelo WhatsApp em vez do copia-e-cola escrito no chat: aqui a
 * pessoa vê o valor, o QR Code e um botão único de copiar o código.
 */
export default function PixTaster() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<TasterInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke("pix-taster-info", {
        body: { token },
      });
      // Erro da função vem como "non-2xx": a mensagem de verdade está no corpo.
      if (fnError) {
        let detalhe = "Link inválido ou expirado";
        try {
          const corpo = fnError instanceof FunctionsHttpError ? await fnError.context.text() : "";
          const parsed = corpo ? JSON.parse(corpo) : null;
          if (parsed?.error) detalhe = String(parsed.error);
        } catch { /* mantém a mensagem amigável */ }
        throw new Error(detalhe);
      }
      if (!data || (data as { error?: string }).error) {
        throw new Error((data as { error?: string })?.error || "Link inválido ou expirado");
      }
      setInfo(data as TasterInfo);
      setError(null);
    } catch (e) {
      setError((e as Error)?.message || "Não conseguimos abrir esse link.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);

  // Enquanto não pagou, confere a cada 8s pra a tela virar sozinha na confirmação.
  useEffect(() => {
    if (!info || info.paid || info.expired) return;
    const id = setInterval(carregar, 8000);
    return () => clearInterval(id);
  }, [info, carregar]);

  const copiar = async () => {
    if (!info?.copyPaste) return;
    try {
      await navigator.clipboard.writeText(info.copyPaste);
    } catch {
      const el = document.createElement("textarea");
      el.value = info.copyPaste;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    toast.success("Código copiado. Cole no PIX do seu banco.");
    setTimeout(() => setCopied(false), 4000);
  };

  const valor = info ? (info.valueCents / 100).toFixed(2).replace(".", ",") : "6,90";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <Helmet>
        <title>Encontro guiado de 45 minutos | Aura</title>
        <meta name="description" content="Pague o encontro guiado de 45 minutos da Aura por PIX comum, sem autorização automática." />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <Card className="w-full max-w-md p-6 space-y-5">
        <header className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold text-foreground">
            Encontro guiado de 45 minutos
          </h1>
          <p className="text-sm text-muted-foreground">
            PIX comum, uma única vez. Sem autorizar nada automático.
          </p>
        </header>

        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && error && (
          <div className="flex gap-3 rounded-lg border border-border p-4 text-sm text-muted-foreground">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
            <p>{error} Se precisar, responde no WhatsApp que a gente gera um código novo.</p>
          </div>
        )}

        {!loading && info?.paid && (
          <div className="space-y-3 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Check className="h-6 w-6 text-primary" />
            </div>
            <p className="text-foreground font-medium">Pagamento confirmado</p>
            <p className="text-sm text-muted-foreground">
              A Aura te chama no WhatsApp pra vocês marcarem o horário. Você tem 48h pra fazer o encontro.
            </p>
          </div>
        )}

        {!loading && info && !info.paid && info.expired && (
          <div className="space-y-3 text-center text-sm text-muted-foreground">
            <p className="text-foreground font-medium">Esse código expirou</p>
            <p>Responde no WhatsApp que a gente gera outro na hora.</p>
          </div>
        )}

        {!loading && info && !info.paid && !info.expired && (
          <div className="space-y-5">
            <div className="text-center">
              <span className="text-3xl font-semibold text-foreground">R$ {valor}</span>
            </div>

            {info.qrImage && (
              <div className="flex justify-center">
                <img
                  src={info.qrImage}
                  alt="QR Code do PIX do encontro guiado de 45 minutos"
                  className="h-56 w-56 rounded-lg border border-border bg-card p-2"
                  loading="lazy"
                />
              </div>
            )}

            <Button onClick={copiar} className="w-full" size="lg" disabled={!info.copyPaste}>
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? "Código copiado" : "Copiar código PIX"}
            </Button>

            <ol className="space-y-2 text-sm text-muted-foreground">
              <li>1. Abra o app do seu banco e escolha PIX.</li>
              <li>2. Leia o QR Code ou cole o código copiado.</li>
              <li>3. Confirme o valor de R$ {valor} e pronto.</li>
            </ol>

            <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Cobrança única. Não vira assinatura e não fica nada autorizado no seu banco.
                Esta tela confirma sozinha quando o pagamento cair.
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
