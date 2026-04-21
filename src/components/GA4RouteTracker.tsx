import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "@/lib/ga4";

/**
 * Fires a GA4 page_view event whenever the route changes (only on marketing routes).
 * Must be rendered inside <BrowserRouter>.
 */
const GA4RouteTracker = () => {
  const location = useLocation();

  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  return null;
};

export default GA4RouteTracker;