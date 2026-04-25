import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Camera,
  CameraOff,
  Square,
  Loader2,
  AlertTriangle,
  RadioTower,
  Zap,
} from "lucide-react";

/**
 * SignCamera — webcam capture supporting:
 *  - Manual record (click to start/stop a single clip)
 *  - Live clip mode (auto re-record every clipDuration seconds, NON-BLOCKING)
 *  - Streaming mode (capture jpeg frames every 400ms and ship batches)
 *
 * Props:
 *  - mode: "manual" | "live" | "streaming"
 *  - clipDuration: seconds per auto clip (live mode)
 *  - frameRateMs: ms between captured frames (streaming mode, default 400)
 *  - batchEvery: number of frames per batch sent to onFramesReady (streaming)
 *  - onClipReady(blob, durationSec)         (manual + live)
 *  - onFramesReady(framesBase64Array, durationSec)  (streaming)
 *  - statusText, detectedLanguage, busy
 *  - testIdPrefix
 */
export default function SignCamera({
  mode = "manual",
  clipDuration = 5,
  frameRateMs = 400,
  batchEvery = 6,
  onClipReady,
  onFramesReady,
  statusText = "",
  detectedLanguage = "",
  busy = false,
  testIdPrefix = "cam",
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const liveTimerRef = useRef(null);
  const startTimeRef = useRef(0);
  const frameTimerRef = useRef(null);
  const framesBufRef = useRef([]);
  const batchStartRef = useRef(0);

  const [cameraOn, setCameraOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    return () => stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let t;
    if (recording) {
      t = setInterval(() => {
        setElapsed(((Date.now() - startTimeRef.current) / 1000).toFixed(1));
      }, 100);
    } else {
      setElapsed(0);
    }
    return () => clearInterval(t);
  }, [recording]);

  async function startCamera() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 1280, height: 720 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch (e) {
      setError("No se pudo acceder a la cámara. Concede permisos en tu navegador.");
    }
  }

  function stopCamera() {
    stopRecording();
    stopFrameCapture();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }

  function stopAll() {
    if (liveTimerRef.current) {
      clearTimeout(liveTimerRef.current);
      liveTimerRef.current = null;
    }
    stopCamera();
  }

  function pickMime() {
    const candidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
    ];
    for (const m of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    }
    return "";
  }

  function startRecording() {
    if (!streamRef.current) return;
    const mime = pickMime();
    chunksRef.current = [];
    try {
      const rec = new MediaRecorder(
        streamRef.current,
        mime ? { mimeType: mime } : undefined,
      );
      recorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = mime || "video/webm";
        const blob = new Blob(chunksRef.current, { type });
        const dur = (Date.now() - startTimeRef.current) / 1000;
        if (blob.size > 0 && onClipReady) onClipReady(blob, dur);
      };
      startTimeRef.current = Date.now();
      rec.start();
      setRecording(true);
    } catch {
      setError("Tu navegador no soporta grabación de video.");
    }
  }

  function stopRecording() {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    setRecording(false);
  }

  // ---------- Streaming (image frames) ----------
  function captureFrame() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const canvas = canvasRef.current || document.createElement("canvas");
    canvasRef.current = canvas;
    const w = 480;
    const h = Math.round((video.videoHeight / video.videoWidth) * w) || 360;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    const b64 = dataUrl.split(",")[1];
    framesBufRef.current.push(b64);

    if (framesBufRef.current.length >= batchEvery) {
      const batch = framesBufRef.current.splice(0, framesBufRef.current.length);
      const dur = (Date.now() - batchStartRef.current) / 1000;
      batchStartRef.current = Date.now();
      onFramesReady && onFramesReady(batch, dur);
    }
  }

  function startFrameCapture() {
    stopFrameCapture();
    framesBufRef.current = [];
    batchStartRef.current = Date.now();
    setRecording(true);
    startTimeRef.current = Date.now();
    frameTimerRef.current = setInterval(captureFrame, frameRateMs);
  }

  function stopFrameCapture() {
    if (frameTimerRef.current) {
      clearInterval(frameTimerRef.current);
      frameTimerRef.current = null;
    }
    setRecording(false);
  }

  // ---------- Mode controllers ----------
  // Live clip mode: continuously record clips of clipDuration. Non-blocking.
  useEffect(() => {
    if (mode !== "live" || !cameraOn) return;
    let cancelled = false;

    const cycle = () => {
      if (cancelled || !streamRef.current) return;
      startRecording();
      liveTimerRef.current = setTimeout(() => {
        stopRecording();
        // restart immediately (do not wait for previous clip processing)
        liveTimerRef.current = setTimeout(cycle, 80);
      }, clipDuration * 1000);
    };
    cycle();

    return () => {
      cancelled = true;
      if (liveTimerRef.current) {
        clearTimeout(liveTimerRef.current);
        liveTimerRef.current = null;
      }
      stopRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cameraOn, clipDuration]);

  // Streaming mode
  useEffect(() => {
    if (mode !== "streaming" || !cameraOn) return;
    startFrameCapture();
    return () => stopFrameCapture();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cameraOn, frameRateMs, batchEvery]);

  return (
    <div
      data-testid={`${testIdPrefix}-container`}
      className={`relative aspect-video w-full overflow-hidden rounded-2xl border ${
        recording ? "border-red-400 recording-ring" : "border-slate-200"
      } bg-slate-950`}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        data-testid={`${testIdPrefix}-video`}
        className="absolute inset-0 w-full h-full object-cover [transform:scaleX(-1)]"
      />

      {!cameraOn && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white p-8 bg-gradient-to-b from-slate-900 to-slate-950">
          <Camera className="w-12 h-12 mb-3 opacity-80" />
          <h3 className="font-display text-2xl font-semibold mb-2">
            Cámara apagada
          </h3>
          <p className="text-sm text-slate-300 max-w-md mb-5">
            Activa tu cámara para que la IA pueda interpretar tus señas, gestos
            de la boca y expresiones faciales.
          </p>
          <Button
            data-testid={`${testIdPrefix}-start-camera-button`}
            onClick={startCamera}
            className="btn-ikb"
          >
            <Camera className="w-4 h-4 mr-2" /> Iniciar cámara
          </Button>
          {error && (
            <div
              data-testid={`${testIdPrefix}-error`}
              className="mt-4 flex items-center gap-2 text-red-300 text-sm"
            >
              <AlertTriangle className="w-4 h-4" />
              {error}
            </div>
          )}
        </div>
      )}

      {cameraOn && (
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 z-10">
          <div className="flex items-center gap-2 flex-wrap">
            {recording && (
              <Badge
                data-testid={`${testIdPrefix}-rec-badge`}
                className="bg-red-500 hover:bg-red-500 text-white border-0"
              >
                <span className="w-2 h-2 rounded-full bg-white mr-1.5 animate-pulse" />
                REC · {elapsed}s
              </Badge>
            )}
            {mode === "live" && (
              <Badge className="bg-black/60 text-white border-0 backdrop-blur-md">
                <RadioTower className="w-3 h-3 mr-1" /> Vivo {clipDuration}s
              </Badge>
            )}
            {mode === "streaming" && (
              <Badge className="bg-black/60 text-white border-0 backdrop-blur-md">
                <Zap className="w-3 h-3 mr-1" /> Streaming
              </Badge>
            )}
            {busy && (
              <Badge className="bg-black/60 text-white border-0 backdrop-blur-md">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Analizando…
              </Badge>
            )}
          </div>
          {detectedLanguage && (
            <Badge
              data-testid={`${testIdPrefix}-lang-badge`}
              className="bg-white/90 text-slate-900 border-0 backdrop-blur-md"
            >
              {detectedLanguage}
            </Badge>
          )}
        </div>
      )}

      {cameraOn && statusText && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-24 max-w-[90%] z-10 fade-in-up">
          <div
            data-testid={`${testIdPrefix}-subtitle`}
            className="bg-black/55 backdrop-blur-md text-white text-xl sm:text-2xl md:text-3xl font-semibold px-5 py-3 rounded-xl text-center drop-shadow-md"
          >
            {statusText}
          </div>
        </div>
      )}

      {cameraOn && (
        <div className="absolute left-0 right-0 bottom-4 flex items-center justify-center gap-3 z-10">
          {mode === "manual" && !recording && (
            <Button
              data-testid={`${testIdPrefix}-record-button`}
              onClick={startRecording}
              disabled={busy}
              className="btn-ikb rounded-full px-6"
            >
              <span className="w-3 h-3 rounded-full bg-red-400 mr-2" />
              Grabar
            </Button>
          )}
          {mode === "manual" && recording && (
            <Button
              data-testid={`${testIdPrefix}-stop-record-button`}
              onClick={stopRecording}
              className="bg-red-500 hover:bg-red-600 text-white rounded-full px-6"
            >
              <Square className="w-4 h-4 mr-2" /> Detener y traducir
            </Button>
          )}
          <Button
            data-testid={`${testIdPrefix}-stop-camera-button`}
            onClick={stopCamera}
            variant="outline"
            className="rounded-full bg-black/40 text-white border-white/20 hover:bg-black/60 hover:text-white"
          >
            <CameraOff className="w-4 h-4 mr-2" /> Apagar
          </Button>
        </div>
      )}
    </div>
  );
}
