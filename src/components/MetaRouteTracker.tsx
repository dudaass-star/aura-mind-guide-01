import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { persistFbclid, trackMetaPageView } from "@/lib/meta-pixel";
import { oaiqPageView } from "@/lib/openai-pixel";
import { logFunnel } from "@/lib/checkout-funnel";

/**
 * Registra a chegada vinda de anúncio na primeira carga da página.
 * É a nossa medição própria de "clique que virou visita", independente do
 * Meta (cujas "Visualizações da página de destino" são subnotificadas).
 */
const logAdLanding = (path: string): void => {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const fbclid = params.get("fbclid");
  const utmSource = params.get("utm_source");
  const utmCampaign = params.get("utm_campaign");
  const gclid = params.get("gclid");
  if (!fbclid && !utmSource && !utmCampaign && !gclid) return;
  try {
    if (sessionStorage.getItem("aura_ad_landing")) return;
    sessionStorage.setItem("aura_ad_landing", "1");
  } catch {
    /* noop */
  }
  logFunnel("ad_landing", {
    detail: fbclid ? "fbclid" : gclid ? "gclid" : (utmSource ?? "utm"),
    meta: {
      entry_path: path,
      has_fbclid: !!fbclid,
      has_gclid: !!gclid,
      utm_source: utmSource,
      utm_campaign: utmCampaign,
      utm_medium: params.get("utm_medium"),
      referrer: typeof document !== "undefined" ? document.referrer.slice(0, 200) : null,
    },
  });
};

/**
 * Dispara PageView do Meta no carregamento e em toda troca de rota da SPA.
 * O index.html só inicializa o pixel; o disparo acontece aqui para que
 * navegador e CAPI usem o mesmo event_id (deduplicação garantida).
 */
const MetaRouteTracker = () => {
  const location = useLocation();

  useEffect(() => {
    // Guarda o fbclid antes de qualquer navegação interna apagar a query.
    persistFbclid();
    // Chegada do anúncio: medida na rota de entrada, antes de qualquer redirect.
    logAdLanding(window.location.pathname);
  }, []);

  useEffect(() => {
    // Dispara também no primeiro render: o index.html apenas inicializa o pixel,
    // para que navegador e servidor compartilhem o mesmo event_id.
    trackMetaPageView(location.pathname);
    // ChatGPT Ads: o script base não acompanha navegação interna da SPA.
    oaiqPageView(location.pathname);
  }, [location.pathname]);

  return null;
};

export default MetaRouteTracker;
