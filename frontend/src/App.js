import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import LiveTranslation from "@/pages/LiveTranslation";
import TextToSign from "@/pages/TextToSign";
import Dictionary from "@/pages/Dictionary";
import HistoryPage from "@/pages/History";
import Conversation from "@/pages/Conversation";

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/traducir-en-vivo" element={<LiveTranslation />} />
            <Route path="/texto-a-signos" element={<TextToSign />} />
            <Route path="/diccionario" element={<Dictionary />} />
            <Route path="/historial" element={<HistoryPage />} />
            <Route path="/conversacion" element={<Conversation />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-right" />
    </div>
  );
}
