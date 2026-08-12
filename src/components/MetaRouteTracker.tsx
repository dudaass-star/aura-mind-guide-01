import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { persistFbclid, trackMetaPageView } from "@/lib/meta-pixel";

/**
 * Dispara PageView do Meta em toda troca de rota da SPA (espelho do GA4RouteTracker).
 * O index.html dispara o PageView do carregamento inicial; aqui cuidamos das
 * navegações internas, que antes ficavam invisíveis para o Meta.
 */
const MetaRouteTracker = () => {
  const location = useLocation();
  const first = useRef(true);

  useEffect(() => {
    // Guarda o fbclid o quanto antes, antes de qualquer navegação interna.
    persistFbclid();
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return; // o PageView inicial já saiu do index.html
    }
    trackMetaPageView(location.pathname);
  }, [location.pathname]);

  return null;
};

export default MetaRouteTracker;
