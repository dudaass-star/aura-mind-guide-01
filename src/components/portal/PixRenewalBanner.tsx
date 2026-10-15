import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { Button } from "@/components/ui/button";

// Cliente PIX Woovi cujo débito automático não está ativo: perto do fim do
// ciclo, mostra o atalho para renovar com um QR novo (sem novo checkout).
export function PixRenewalBanner({ userId }: { userId: string }) {
  const { data } = useQuery({
    queryKey: ["pix-renewal-check", userId],
    queryFn: async () => {
      const { data, error } = await supabasePortal.functions.invoke("pix-reauth-router", {
        body: { action: "renewal_check" },
      });
      if (error) return null;
      return data as { needsRenewal?: boolean; token?: string | null; expiresAt?: string | null } | null;
    },
    staleTime: 10 * 60 * 1000,
  });

  if (!data?.needsRenewal || !data.token) return null;
  const expires = data.expiresAt ? new Date(data.expiresAt) : null;
  const expired = !!expires && expires.getTime() < Date.now();
  const label = expires
    ? expired
      ? "Seu ciclo venceu"
      : `Seu ciclo vence em ${expires.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })}`
    : "Seu ciclo está terminando";

  return (
    <div className="mx-auto mb-4 flex max-w-2xl items-center gap-3 rounded-xl border border-border bg-card p-4">
      <RefreshCw className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">Seu banco não renova sozinho. Renove via PIX em 1 minuto.</p>
      </div>
      <Button size="sm" onClick={() => { window.location.href = `/reautorizar-pix?token=${encodeURIComponent(data.token!)}`; }}>
        Renovar via PIX
      </Button>
    </div>
  );
}
