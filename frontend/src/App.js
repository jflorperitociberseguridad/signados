import "@/App.css";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
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
      <BrowserRouter>
        <PageTracker />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/traducir-en-vivo" element={<LiveTranslation />} />
            <Route path="/texto-a-signos" element={<TextToSign />} />
            <Route path="/alfabeto" element={<Fingerspelling />} />
            <Route path="/diccionario" element={<Dictionary />} />
            <Route path="/historial" element={<HistoryPage />} />
            <Route path="/conversacion" element={<Conversation />} />
            <Route path="/practica" element={<Practice />} />
            <Route path="/quiz" element={<Quiz />} />
            <Route path="/comunidad" element={<CommunitySign />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/t/:id" element={<SharePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-right" />
    </div>
  );
}
