import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Garante que toda navegação entre rotas comece no topo da página.
const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [pathname]);

  return null;
};

export default ScrollToTop;