import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import {
  Phone,
  PhoneOff,
  Copy,
  Link as LinkIcon,
  Video as VideoIcon,
  Loader2,
  Mic,
  MicOff,
  Camera,
  CameraOff,
  Captions,
  Send,
} from "lucide-react";
import { createRtcRoom, translateFrames, trackEvent } from "../lib/api";
import { useWebRTC } from "../hooks/useWebRTC";

/**
 * 1-to-1 WebRTC video call with live AI sign-language subtitling.
 * - Create a room → share the link.
 * - Both peers connect, see each other.
 * - Signer's local frames are sampled every ~2.5s and translated via the
 *   normal /api/translate/frames endpoint; the resulting subtitle is sent
 *   to the remote peer over the signaling channel and displayed.
 */
export default function VideoCall() {
  const [params, setParams] = useSearchParams();
  const initialRoom = (params.get("sala") || "").toUpperCase();
  const initialRole = params.get("rol") === "oyente" ? "listener" : "signer";

  const [room, setRoom] = useState(initialRoom);
  const [role, setRole] = useState(initialRole);
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [subtitle, setSubtitle] = useState("");
  const [chat, setChat] = useState([]); // {from:"me"|"peer", text}
  const [chatInput, setChatInput] = useState("");

  const rtc = useWebRTC({ room, role });
  const captureCanvasRef = useRef(null);
  const framesRef = useRef([]);
  const captureTimerRef = useRef(null);
  const sendingRef = useRef(false);

  const shareUrl = useMemo(() => {
    if (!room) return "";
    const u = new URL(window.location.href);
    u.search = "";
    u.searchParams.set("sala", room);
    u.searchParams.set("rol", "oyente");
    return u.toString();
  }, [room]);

  // Subscribe to translation/subtitle events from the peer
  useEffect(() => {
    const offSub = rtc.on("subtitle", (d) => {
      setSubtitle(d?.text || "");
    });
    const offTrans = rtc.on("translation", (d) => {
      if (d?.text) setSubtitle(d.text);
    });
    const offChat = rtc.on("chat", (d) => {
      if (d?.text) setChat((c) => [...c, { from: "peer", text: d.text }]);
    });
    return () => {
      offSub();
      offTrans();
      offChat();
    };
  }, [rtc]);

  async function handleCreate() {
    setBusy(true);
    try {
      const r = await createRtcRoom();
      setRoom(r.room);
      setRole("signer");
      setParams({ sala: r.room, rol: "signante" });
      toast.success("Sala creada", { description: r.room });
    } catch (e) {
      toast.error("No se pudo crear la sala");
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (!room || room.length < 4) {
      toast.error("Introduce un código de sala válido");
      return;
    }
    setBusy(true);
    try {
      await rtc.start({ video: true, audio: true });
      setJoined(true);
      trackEvent("rtc_joined", { role });
    } catch {
      toast.error("No se pudo unir a la sala");
    } finally {
      setBusy(false);
    }
  }

  function handleLeave() {
    rtc.stop();
    stopCapture();
    setJoined(false);
    setSubtitle("");
    setChat([]);
  }

  function copyLink() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(
      () => toast.success("Enlace copiado"),
      () => toast.error("No se pudo copiar"),
    );
  }

  function toggleMute() {
    const stream = rtc.localVideoRef.current?.srcObject;
    if (!stream) return;
    const tracks = stream.getAudioTracks?.() || [];
    const next = !muted;
    tracks.forEach((t) => (t.enabled = !next));
    setMuted(next);
  }

  function toggleCam() {
    const stream = rtc.localVideoRef.current?.srcObject;
    if (!stream) return;
    const tracks = stream.getVideoTracks?.() || [];
    const next = !camOff;
    tracks.forEach((t) => (t.enabled = !next));
    setCamOff(next);
  }

  function sendChat() {
    const t = chatInput.trim();
    if (!t) return;
    rtc.sendData({ type: "chat", data: { text: t } });
    setChat((c) => [...c, { from: "me", text: t }]);
    setChatInput("");
  }

  // ---- Live AI subtitle pipeline (only the signer captures + translates) ----
  function captureFrame() {
    if (sendingRef.current) return;
    const v = rtc.localVideoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = captureCanvasRef.current || document.createElement("canvas");
    captureCanvasRef.current = canvas;
    const w = 360;
    const h = Math.round((v.videoHeight / v.videoWidth) * w) || 270;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(v, 0, 0, w, h);
    const url = canvas.toDataURL("image/jpeg", 0.7);
    framesRef.current.push(url.split(",")[1]);

    if (framesRef.current.length >= 6) {
      const batch = framesRef.current.splice(0, framesRef.current.length);
      sendingRef.current = true;
      translateFrames(batch, { mode: "rtc", duration: 2.5 })
        .then((res) => {
          const text = res?.translated_text || "";
          if (text) {
            setSubtitle(text);
            rtc.sendData({ type: "subtitle", data: { text } });
            trackEvent("rtc_subtitle", { lang: res.detected_language });
          }
        })
        .catch(() => {})
        .finally(() => {
          sendingRef.current = false;
        });
    }
  }

  function startCapture() {
    stopCapture();
    framesRef.current = [];
    captureTimerRef.current = setInterval(captureFrame, 420);
  }
  function stopCapture() {
    if (captureTimerRef.current) {
      clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    framesRef.current = [];
  }

  // Auto-start AI subtitling for signer when call goes live
  useEffect(() => {
    if (joined && role === "signer" && rtc.status === "live") startCapture();
    else stopCapture();
    return () => stopCapture();
  }, [joined, role, rtc.status]);

  // If a sala query param is present, focus the join button
  useEffect(() => {
    if (initialRoom && !joined) setRoom(initialRoom);
  }, [initialRoom, joined]);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8 sm:py-10">
      <header className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-6">
        <div>
          <Badge className="bg-emerald-100 text-emerald-700 border-0 mb-2">
            <VideoIcon className="w-3.5 h-3.5 mr-1.5" /> Llamadas WebRTC
          </Badge>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold text-slate-900 dark:text-slate-100">
            Videollamada con subtítulos en directo
          </h1>
          <p className="text-slate-600 dark:text-slate-300 mt-2 max-w-2xl">
            Crea una sala, comparte el enlace, y la IA traducirá tus señas a
            texto en tiempo real para que tu interlocutor las lea como
            subtítulos. Sin instalar nada.
          </p>
        </div>
      </header>

      {!joined ? (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card data-testid="rtc-create-card" className="p-6 rounded-2xl border-slate-200 dark:border-slate-700">
            <h2 className="font-display text-xl font-semibold mb-3">Crear sala</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-5">
              Genera un código único y compártelo con la persona oyente.
            </p>
            <Button
              data-testid="rtc-create-button"
              onClick={handleCreate}
              disabled={busy}
              className="btn-ikb rounded-full px-6 h-11"
            >
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Phone className="w-4 h-4 mr-2" />}
              Generar código
            </Button>
            {room && (
              <div className="mt-5 space-y-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Tu código</div>
                <div
                  data-testid="rtc-room-code"
                  className="font-mono font-bold text-3xl tracking-[0.4em] bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-4 text-center"
                >
                  {room}
                </div>
                <div className="flex items-center gap-2">
                  <Input value={shareUrl} readOnly className="font-mono text-xs" data-testid="rtc-share-url" />
                  <Button onClick={copyLink} variant="outline" data-testid="rtc-copy-link">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <Button
                  data-testid="rtc-start-as-signer"
                  onClick={handleJoin}
                  disabled={busy}
                  className="w-full btn-ikb rounded-full h-11"
                >
                  <VideoIcon className="w-4 h-4 mr-2" /> Iniciar como signante
                </Button>
              </div>
            )}
          </Card>

          <Card data-testid="rtc-join-card" className="p-6 rounded-2xl border-slate-200 dark:border-slate-700">
            <h2 className="font-display text-xl font-semibold mb-3">Unirse a sala</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-5">
              Si te han enviado un código o un enlace, introdúcelo aquí.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <Input
                data-testid="rtc-room-input"
                value={room}
                onChange={(e) => setRoom(e.target.value.toUpperCase().slice(0, 12))}
                placeholder="Ej. K7QR9A"
                className="font-mono uppercase tracking-widest"
              />
            </div>
            <div className="flex gap-2 mb-5 text-sm">
              <button
                data-testid="rtc-role-listener"
                onClick={() => setRole("listener")}
                className={`flex-1 py-2 rounded-md border transition-colors ${
                  role === "listener"
                    ? "bg-[#002FA7] text-white border-[#002FA7]"
                    : "bg-transparent border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                }`}
              >
                Soy oyente
              </button>
              <button
                data-testid="rtc-role-signer"
                onClick={() => setRole("signer")}
                className={`flex-1 py-2 rounded-md border transition-colors ${
                  role === "signer"
                    ? "bg-[#002FA7] text-white border-[#002FA7]"
                    : "bg-transparent border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                }`}
              >
                Soy signante
              </button>
            </div>
            <Button
              data-testid="rtc-join-button"
              onClick={handleJoin}
              disabled={busy || !room}
              className="w-full btn-ikb rounded-full h-11"
            >
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LinkIcon className="w-4 h-4 mr-2" />}
              Entrar a la sala
            </Button>
            {rtc.error && (
              <p className="text-xs text-red-600 mt-3" data-testid="rtc-error">
                {rtc.error}
              </p>
            )}
          </Card>
        </div>
      ) : (
        <div className="grid lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 space-y-3">
            <div className="relative aspect-video rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950">
              <video
                ref={rtc.remoteVideoRef}
                playsInline
                autoPlay
                data-testid="rtc-remote-video"
                className="absolute inset-0 w-full h-full object-cover"
              />
              {rtc.status !== "live" && (
                <div className="absolute inset-0 flex items-center justify-center text-white/85 text-center p-6">
                  <div>
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />
                    <div className="font-display text-lg">
                      {rtc.status === "waiting"
                        ? "Esperando a la otra persona…"
                        : rtc.status === "connecting"
                          ? "Conectando…"
                          : rtc.status === "ended"
                            ? "Llamada finalizada"
                            : "Inicializando"}
                    </div>
                    <div className="text-xs text-white/60 mt-1">Sala {room}</div>
                  </div>
                </div>
              )}

              {/* Subtitle overlay */}
              {subtitle && (
                <div
                  data-testid="rtc-subtitle"
                  className="absolute left-1/2 -translate-x-1/2 bottom-20 max-w-[90%] z-10 fade-in-up"
                >
                  <div className="bg-black/65 backdrop-blur-md text-white text-lg sm:text-2xl font-semibold px-5 py-3 rounded-xl text-center drop-shadow-md flex items-start gap-2">
                    <Captions className="w-5 h-5 mt-1 shrink-0 text-emerald-300" />
                    <span>{subtitle}</span>
                  </div>
                </div>
              )}

              {/* Local PiP */}
              <div className="absolute right-3 bottom-3 w-32 sm:w-44 aspect-video rounded-lg overflow-hidden border border-white/30 shadow-lg">
                <video
                  ref={rtc.localVideoRef}
                  playsInline
                  autoPlay
                  muted
                  data-testid="rtc-local-video"
                  className="w-full h-full object-cover [transform:scaleX(-1)]"
                />
              </div>

              {/* Status pills */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                <Badge className="bg-black/60 text-white border-0 backdrop-blur-md">
                  Sala · <span className="font-mono ml-1">{room}</span>
                </Badge>
                <Badge
                  data-testid="rtc-status"
                  className={`border-0 ${
                    rtc.status === "live"
                      ? "bg-emerald-500/90 text-white"
                      : "bg-black/60 text-white/90 backdrop-blur-md"
                  }`}
                >
                  {rtc.status === "live"
                    ? `En llamada · ${rtc.peers} conectados`
                    : rtc.status}
                </Badge>
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                data-testid="rtc-toggle-mute"
                onClick={toggleMute}
                variant="outline"
                className="rounded-full"
              >
                {muted ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
                {muted ? "Activar micro" : "Silenciar"}
              </Button>
              <Button
                data-testid="rtc-toggle-cam"
                onClick={toggleCam}
                variant="outline"
                className="rounded-full"
              >
                {camOff ? <CameraOff className="w-4 h-4 mr-2" /> : <Camera className="w-4 h-4 mr-2" />}
                {camOff ? "Activar cámara" : "Apagar cámara"}
              </Button>
              <Button
                data-testid="rtc-copy-link-2"
                onClick={copyLink}
                variant="outline"
                className="rounded-full"
              >
                <Copy className="w-4 h-4 mr-2" /> Copiar enlace
              </Button>
              <Button
                data-testid="rtc-leave"
                onClick={handleLeave}
                className="bg-red-500 hover:bg-red-600 text-white rounded-full px-6"
              >
                <PhoneOff className="w-4 h-4 mr-2" /> Colgar
              </Button>
            </div>
          </div>

          <aside className="lg:col-span-4">
            <Card className="rounded-2xl p-4 border-slate-200 dark:border-slate-700 h-full flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-semibold">Chat</h3>
                <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-0">
                  {role === "signer" ? "Signante" : "Oyente"}
                </Badge>
              </div>
              <div
                data-testid="rtc-chat"
                className="flex-1 min-h-[260px] max-h-[400px] overflow-y-auto space-y-2 mb-3 p-2 bg-slate-50 dark:bg-slate-900 rounded-lg"
              >
                {chat.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center mt-8">
                    Los subtítulos aparecen sobre el vídeo. Aquí puedes escribir
                    mensajes en texto plano.
                  </p>
                ) : (
                  chat.map((m, i) => (
                    <div
                      key={i}
                      className={`text-sm rounded-lg px-3 py-2 max-w-[85%] ${
                        m.from === "me"
                          ? "bg-[#002FA7] text-white ml-auto"
                          : "bg-white dark:bg-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      {m.text}
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  data-testid="rtc-chat-input"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChat()}
                  placeholder="Escribe un mensaje…"
                />
                <Button
                  data-testid="rtc-chat-send"
                  onClick={sendChat}
                  className="btn-ikb"
                  disabled={!chatInput.trim()}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
