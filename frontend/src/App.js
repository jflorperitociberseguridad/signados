import "@/App.css";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import LiveTranslation from "@/pages/LiveTranslation";
import TextToSign from "@/pages/TextToSign";
import Dictionary from "@/pages/Dictionary";
import HistoryPage from "@/pages/History";
import Conversation from "@/pages/Conversation";
import Fingerspelling from "@/pages/Fingerspelling";
import SharePage from "@/pages/SharePage";
import Analytics from "@/pages/Analytics";
import Practice from "@/pages/Practice";
import Quiz from "@/pages/Quiz";
import CommunitySign from "@/pages/CommunitySign";
import Pricing from "@/pages/Pricing";
import Admin from "@/pages/Admin";
import AvatarSign from "@/pages/AvatarSign";
import VideoCall from "@/pages/VideoCall";
import Ensenanzas from "@/pages/Ensenanzas";
import OfflineIndicator from "@/components/OfflineIndicator";
import { AdminAuthProvider } from "@/lib/AdminAuthContext";
import { LanguageVariantProvider } from "@/lib/LanguageVariantContext";
import { trackEvent } from "@/lib/api";

function PageTracker() {
  const loc = useLocation();
  useEffect(() => {
    trackEvent("page_view", { path: loc.pathname });
  }, [loc.pathname]);
  return null;
}

// Register service worker for PWA installability (Android/Chrome).
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

export default function App() {
  return (
    <div className="App">
      <AdminAuthProvider>
        <LanguageVariantProvider>
          <BrowserRouter>
          <PageTracker />
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/traducir-en-vivo" element={<LiveTranslation />} />
              <Route path="/texto-a-signos" element={<TextToSign />} />
              <Route path="/traductor" element={<Navigate to="/texto-a-signos" replace />} />
              <Route path="/alfabeto" element={<Fingerspelling />} />
              <Route path="/diccionario" element={<Dictionary />} />
              <Route path="/historial" element={<HistoryPage />} />
              <Route path="/conversacion" element={<Conversation />} />
              <Route path="/practica" element={<Practice />} />
              <Route path="/quiz" element={<Quiz />} />
              <Route path="/comunidad" element={<CommunitySign />} />
              <Route path="/avatar" element={<AvatarSign />} />
              <Route path="/llamada" element={<VideoCall />} />
              <Route path="/precios" element={<Pricing />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/ensenanzas" element={<Ensenanzas />} />
              <Route path="/enseñanzas" element={<Navigate to="/ensenanzas" replace />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/t/:id" element={<SharePage />} />
            </Route>
          </Routes>
          </BrowserRouter>
        </LanguageVariantProvider>
      </AdminAuthProvider>
      <OfflineIndicator />
      <Toaster richColors position="top-right" />
    </div>
  );
}
