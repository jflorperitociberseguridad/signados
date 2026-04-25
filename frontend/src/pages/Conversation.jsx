import { useState } from "react";
import SignCamera from "../components/SignCamera";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";
import { translateVideo, textToSign } from "../lib/api";
import { toast } from "sonner";
import {
  Loader2,
  MessageSquare,
  Sparkles,
  Hand,
  Smile,
  Eye,
} from "lucide-react";

export default function Conversation() {
  const [busyA, setBusyA] = useState(false);
  const [busyB, setBusyB] = useState(false);
  const [signerLatest, setSignerLatest] = useState("");
  const [signerLang, setSignerLang] = useState("");
  const [messages, setMessages] = useState([]); // [{from:'signer'|'speaker', text, lang, steps?}]

  const [speakerText, setSpeakerText] = useState("");

  async function handleSignerClip(blob, duration) {
    if (!blob || blob.size < 1000) return;
    setBusyA(true);
    try {
      const res = await translateVideo(blob, { mode: "live", duration });
      const text = (res.translated_text || "").trim();
      if (text) {
        setSignerLatest(text);
        setSignerLang(res.detected_language || "");
        setMessages((p) => [
          ...p,
          { from: "signer", text, lang: res.detected_language },
        ]);
      }
    } catch (e) {
      toast.error("Error", {
        description: e?.response?.data?.detail || e?.message,
      });
    } finally {
      setBusyA(false);
    }
  }

  async function handleSpeak() {
    if (!speakerText.trim()) return;
    setBusyB(true);
    try {
      const res = await textToSign(speakerText.trim(), "auto");
      setMessages((p) => [
        ...p,
        {
          from: "speaker",
          text: speakerText.trim(),
          lang: res.language,
          steps: res.steps,
          summary: res.summary,
        },
      ]);
      setSpeakerText("");
    } catch (e) {
      toast.error("Error", {
        description: e?.response?.data?.detail || e?.message,
      });
    } finally {
      setBusyB(false);
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-start gap-3 mb-6">
        <span className="w-10 h-10 rounded-md bg-[#002FA7] text-white flex items-center justify-center shrink-0">
          <MessageSquare className="w-5 h-5" />
        </span>
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-slate-900">
            Modo conversación
          </h1>
          <p className="text-slate-600 mt-1">
            Comunicación bidireccional entre persona signante y persona oyente.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Signer side */}
        <Card className="p-5 border border-slate-200 bg-white rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Persona signante
            </h2>
            <Badge variant="outline" className="border-slate-200">
              Cámara → texto
            </Badge>
          </div>
          <SignCamera
            liveMode={true}
            clipDuration={5}
            onClipReady={handleSignerClip}
            statusText={busyA && !signerLatest ? "Analizando…" : signerLatest}
            detectedLanguage={signerLang}
            busy={busyA}
            testIdPrefix="conv-signer"
          />
        </Card>

        {/* Speaker side */}
        <Card className="p-5 border border-slate-200 bg-white rounded-xl flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Persona oyente
            </h2>
            <Badge variant="outline" className="border-slate-200">
              Texto → signos
            </Badge>
          </div>
          <Textarea
            data-testid="conv-speaker-input"
            value={speakerText}
            onChange={(e) => setSpeakerText(e.target.value)}
            placeholder="Escribe lo que quieres decir…"
            rows={3}
            className="border-slate-300 mb-3"
          />
          <Button
            data-testid="conv-speaker-send"
            onClick={handleSpeak}
            disabled={busyB || !speakerText.trim()}
            className="btn-ikb h-11 w-full"
          >
            {busyB ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generando…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" /> Enviar
              </>
            )}
          </Button>
        </Card>
      </div>

      {/* Conversation feed */}
      <Card className="mt-6 p-5 border border-slate-200 bg-slate-50 rounded-xl">
        <h2 className="font-display text-lg font-semibold text-slate-900 mb-3">
          Conversación
        </h2>
        <div
          data-testid="conv-feed"
          className="space-y-3 max-h-[60vh] overflow-y-auto pr-2"
        >
          {messages.length === 0 && (
            <p className="text-sm text-slate-500">
              La conversación aparecerá aquí. Empieza signando o escribiendo.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${
                m.from === "signer" ? "justify-start" : "justify-end"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 fade-in-up ${
                  m.from === "signer"
                    ? "bg-white border border-slate-200"
                    : "bg-[#002FA7] text-white"
                }`}
              >
                <div className="flex items-center gap-2 mb-1 text-xs opacity-80">
                  <span>
                    {m.from === "signer" ? "Signante" : "Oyente"}
                  </span>
                  {m.lang && (
                    <Badge
                      className={`border-0 text-[10px] py-0 px-1.5 ${
                        m.from === "signer"
                          ? "bg-slate-100 text-slate-700"
                          : "bg-white/20 text-white"
                      }`}
                    >
                      {m.lang}
                    </Badge>
                  )}
                </div>
                <p
                  className={`leading-snug ${
                    m.from === "signer" ? "text-slate-900" : "text-white"
                  }`}
                >
                  {m.text}
                </p>
                {m.summary && m.from === "speaker" && (
                  <p className="mt-1 text-xs text-white/85 italic">
                    {m.summary}
                  </p>
                )}
                {m.steps && m.steps.length > 0 && (
                  <div className="mt-3 space-y-2 text-xs">
                    {m.steps.slice(0, 6).map((s, j) => (
                      <div
                        key={j}
                        className={`rounded-lg p-2 ${
                          m.from === "signer"
                            ? "bg-slate-50"
                            : "bg-white/10"
                        }`}
                      >
                        <div className="font-medium mb-1">
                          {String(s.step ?? j + 1).padStart(2, "0")}. {s.word}
                        </div>
                        <MiniRow icon={Hand} text={s.hands} dark={m.from === "speaker"} />
                        <MiniRow icon={Smile} text={s.mouth} dark={m.from === "speaker"} />
                        <MiniRow icon={Eye} text={s.expression} dark={m.from === "speaker"} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

const MiniRow = ({ icon: Icon, text, dark }) =>
  text ? (
    <div className={`flex items-start gap-1.5 ${dark ? "text-white/90" : "text-slate-700"}`}>
      <Icon className="w-3 h-3 mt-0.5 shrink-0 opacity-80" />
      <span>{text}</span>
    </div>
  ) : null;
