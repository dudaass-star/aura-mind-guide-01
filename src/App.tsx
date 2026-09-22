import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { lazy, Suspense } from "react";
import { PortalAuthProvider } from "./contexts/PortalAuthContext";
import GA4RouteTracker from "./components/GA4RouteTracker";
import MetaRouteTracker from "./components/MetaRouteTracker";
import ScrollToTop from "./components/ScrollToTop";

const IndexV2 = lazy(() => import("./pages/IndexV2"));
const IndexV3 = lazy(() => import("./pages/IndexV3"));
const CheckoutV2 = lazy(() => import("./pages/CheckoutV2"));
const ThankYou = lazy(() => import("./pages/ThankYou"));
const CancelSubscription = lazy(() => import("./pages/CancelSubscription"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const StartTrial = lazy(() => import("./pages/StartTrial"));
const TrialStarted = lazy(() => import("./pages/TrialStarted"));
const AdminMeditations = lazy(() => import("./pages/AdminMeditations"));
const AdminTests = lazy(() => import("./pages/AdminTests"));
const AdminInstances = lazy(() => import("./pages/AdminInstances"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminSettings = lazy(() => import("./pages/AdminSettings"));
const AdminEngagement = lazy(() => import("./pages/AdminEngagement"));
const AdminMessages = lazy(() => import("./pages/AdminMessages"));
const AdminTemplates = lazy(() => import("./pages/AdminTemplates"));
const AdminEmails = lazy(() => import("./pages/AdminEmails"));
const AdminPopupPreview = lazy(() => import("./pages/AdminPopupPreview"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminInstagram = lazy(() => import("./pages/AdminInstagram"));
const AdminSupport = lazy(() => import("./pages/AdminSupport"));
const AdminSupportKnowledge = lazy(() => import("./pages/AdminSupportKnowledge"));
const AdminSupportGaps = lazy(() => import("./pages/AdminSupportGaps"));
const AdminWhatsappRecovery = lazy(() => import("./pages/AdminWhatsappRecovery"));
const AdminSessions = lazy(() => import("./pages/AdminSessions"));
const AdminLayout = lazy(() => import("./components/admin/AdminLayout"));
const UserGuide = lazy(() => import("./pages/UserGuide"));
const Episode = lazy(() => import("./pages/Episode"));
const JourneyComplete = lazy(() => import("./pages/JourneyComplete"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const UserPortal = lazy(() => import("./pages/UserPortal"));
const PortalLogin = lazy(() => import("./pages/PortalLogin"));
const PortalWhatsAppAccess = lazy(() => import("./pages/PortalWhatsAppAccess"));
const PortalAuthCallback = lazy(() => import("./pages/PortalAuthCallback"));
const ReautorizarPix = lazy(() => import("./pages/ReautorizarPix"));
const PixTaster = lazy(() => import("./pages/PixTaster"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const Pagamento = lazy(() => import("./pages/Pagamento"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

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
          <Suspense fallback={<div className="min-h-screen bg-background" aria-label="Abrindo Olá Aura" />}>
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
            <Route path="/meu-espaco/auth/callback" element={<PortalAuthCallback />} />
            <Route path="/meu-espaco/acesso-whatsapp" element={<PortalWhatsAppAccess />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/pagamento" element={<Pagamento />} />
            <Route path="/reautorizar-pix" element={<ReautorizarPix />} />
            <Route path="/pix/:token" element={<PixTaster />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </PortalAuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
