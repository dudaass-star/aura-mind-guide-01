import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import Index from "./pages/Index";
import IndexV2 from "./pages/IndexV2";
import IndexV3 from "./pages/IndexV3";
import CheckoutV2 from "./pages/CheckoutV2";
import ThankYou from "./pages/ThankYou";
import CancelSubscription from "./pages/CancelSubscription";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import StartTrial from "./pages/StartTrial";
import TrialStarted from "./pages/TrialStarted";
import AdminMeditations from "./pages/AdminMeditations";
import AdminTests from "./pages/AdminTests";
import AdminInstances from "./pages/AdminInstances";
import AdminLogin from "./pages/AdminLogin";
import AdminSettings from "./pages/AdminSettings";
import AdminEngagement from "./pages/AdminEngagement";
import AdminMessages from "./pages/AdminMessages";
import AdminTemplates from "./pages/AdminTemplates";
import AdminEmails from "./pages/AdminEmails";
import AdminPopupPreview from "./pages/AdminPopupPreview";
import AdminUsers from "./pages/AdminUsers";
import AdminInstagram from "./pages/AdminInstagram";
import AdminSupport from "./pages/AdminSupport";
import AdminSupportKnowledge from "./pages/AdminSupportKnowledge";
import AdminSupportGaps from "./pages/AdminSupportGaps";
import AdminWhatsappRecovery from "./pages/AdminWhatsappRecovery";
import AdminSessions from "./pages/AdminSessions";
import AdminLayout from "./components/admin/AdminLayout";
import UserGuide from "./pages/UserGuide";
import Episode from "./pages/Episode";
import JourneyComplete from "./pages/JourneyComplete";
import Unsubscribe from "./pages/Unsubscribe";
import UserPortal from "./pages/UserPortal";
import PortalLogin from "./pages/PortalLogin";
import ReautorizarPix from "./pages/ReautorizarPix";
import { PortalAuthProvider } from "./contexts/PortalAuthContext";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import Pagamento from "./pages/Pagamento";
import NotFound from "./pages/NotFound";
import GA4RouteTracker from "./components/GA4RouteTracker";
import MetaRouteTracker from "./components/MetaRouteTracker";
import ScrollToTop from "./components/ScrollToTop";

const queryClient = new QueryClient();

/**
 * Redireciona a raiz para /v2 preservando query string e hash.
 * Sem isso o fbclid do anúncio é descartado e o Meta perde a atribuição
 * do clique (Landing Page Views zeradas).
 */
const RootRedirect = () => (
  <Navigate
    to={`/v2${window.location.search}${window.location.hash}`}
    replace
  />
);

// Checkout antigo desativado: mantinha eventos de Lead/InitiateCheckout no Meta
// sem registrar nada no nosso funil, criando divergência de números.
// Redireciona para o /v2/checkout preservando query e hash (fbclid, utm_*).
const LegacyCheckoutRedirect = () => (
  <Navigate
    to={`/v2/checkout${window.location.search}${window.location.hash}`}
    replace
  />
);

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <GA4RouteTracker />
          <MetaRouteTracker />
          <PortalAuthProvider>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/v2" element={<IndexV2 />} />
            <Route path="/v3" element={<IndexV3 />} />
            <Route path="/checkout" element={<LegacyCheckoutRedirect />} />
            <Route path="/v2/checkout" element={<CheckoutV2 />} />
            <Route path="/obrigado" element={<ThankYou />} />
            <Route path="/cancelar" element={<CancelSubscription />} />
            <Route path="/termos" element={<TermsOfService />} />
            <Route path="/privacidade" element={<PrivacyPolicy />} />
            <Route path="/experimentar" element={<StartTrial />} />
            <Route path="/trial-iniciado" element={<TrialStarted />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route element={<AdminLayout />}>
              <Route path="/admin/meditacoes" element={<AdminMeditations />} />
              <Route path="/admin/testes" element={<AdminTests />} />
              <Route path="/admin/instancias" element={<AdminInstances />} />
              <Route path="/admin/configuracoes" element={<AdminSettings />} />
              <Route path="/admin/engajamento" element={<AdminEngagement />} />
              <Route path="/admin/mensagens" element={<AdminMessages />} />
              <Route path="/admin/templates" element={<AdminTemplates />} />
              <Route path="/admin/emails" element={<AdminEmails />} />
              <Route path="/admin/popup-preview" element={<AdminPopupPreview />} />
              <Route path="/admin/usuarios" element={<AdminUsers />} />
              <Route path="/admin/instagram" element={<AdminInstagram />} />
              <Route path="/admin/suporte" element={<AdminSupport />} />
              <Route path="/admin/suporte/conhecimento" element={<AdminSupportKnowledge />} />
              <Route path="/admin/suporte/gaps" element={<AdminSupportGaps />} />
              <Route path="/admin/whatsapp-inbox" element={<AdminWhatsappRecovery />} />
              <Route path="/admin/sessoes" element={<AdminSessions />} />
            </Route>
            <Route path="/guia" element={<UserGuide />} />
            <Route path="/episodio/:id" element={<Episode />} />
            <Route path="/jornada-completa/:journeyId/:userId" element={<JourneyComplete />} />
            <Route path="/unsubscribe" element={<Unsubscribe />} />
            <Route path="/meu-espaco" element={<UserPortal />} />
            <Route path="/meu-espaco/entrar" element={<PortalLogin />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/pagamento" element={<Pagamento />} />
            <Route path="/reautorizar-pix" element={<ReautorizarPix />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </PortalAuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
