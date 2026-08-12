import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { persistFbclid, trackMetaPageView } from "@/lib/meta-pixel";

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
  }, []);

  useEffect(() => {
    // Dispara também no primeiro render: o index.html apenas inicializa o pixel,
    // para que navegador e servidor compartilhem o mesmo event_id.
    trackMetaPageView(location.pathname);
  }, [location.pathname]);

  return null;
};

export default MetaRouteTracker;
