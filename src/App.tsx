import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import Index from "./pages/Index";
import Checkout from "./pages/Checkout";
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
import UserGuide from "./pages/UserGuide";
import Episode from "./pages/Episode";
import JourneyComplete from "./pages/JourneyComplete";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/obrigado" element={<ThankYou />} />
            <Route path="/cancelar" element={<CancelSubscription />} />
            <Route path="/termos" element={<TermsOfService />} />
            <Route path="/privacidade" element={<PrivacyPolicy />} />
            <Route path="/experimentar" element={<StartTrial />} />
            <Route path="/trial-iniciado" element={<TrialStarted />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/meditacoes" element={<AdminMeditations />} />
            <Route path="/admin/testes" element={<AdminTests />} />
            <Route path="/admin/instancias" element={<AdminInstances />} />
            <Route path="/admin/configuracoes" element={<AdminSettings />} />
            <Route path="/admin/engajamento" element={<AdminEngagement />} />
            <Route path="/admin/mensagens" element={<AdminMessages />} />
            <Route path="/admin/templates" element={<AdminTemplates />} />
            <Route path="/guia" element={<UserGuide />} />
            <Route path="/episodio/:id" element={<Episode />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
