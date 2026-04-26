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
  RefreshCw,
  Smartphone,
  Monitor,
  Activity,
  ZoomIn,
  ZoomOut,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useMediaPipe, drawLandmarks } from "../hooks/useMediaPipe";

/**
 * SignCamera with:
 *  - mode: "manual" | "live" | "streaming"
 *  - orientation: "horizontal" (16:9) | "vertical" (9:16, half-body)
 *  - facing: "user" | "environment" (flip)
 *  - showSkeleton (MediaPipe overlay)
 *  - motionGated: only deliver clips/frames when MediaPipe detects movement
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
  showSkeleton = true,
  motionGated = false,
  initialOrientation = "auto",
}) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const liveTimerRef = useRef(null);
  const startTimeRef = useRef(0);
  const frameTimerRef = useRef(null);
  const framesBufRef = useRef([]);
  const batchStartRef = useRef(0);
  const movingRef = useRef(false);
  const drawRafRef = useRef(null);
  const containerRef = useRef(null);
  const zoomLayerRef = useRef(null);
  // Pinch / pan transient state
  const pinchRef = useRef({
    active: false,
    startDist: 0,
    startScale: 1,
  });
  const panRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startTx: 0,
    startTy: 0,
    moved: false,
  });

  const [cameraOn, setCameraOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  // auto-detect mobile to default to vertical
  const isMobileUA =
    typeof navigator !== "undefined" &&
    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const [orientation, setOrientation] = useState(
    initialOrientation === "auto"
      ? isMobileUA
        ? "vertical"
        : "horizontal"
      : initialOrientation,
  );
  const [facing, setFacing] = useState("user"); // user | environment
  const [zoom, setZoom] = useState(1); // 0.5..3 (visual CSS scale)
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [animating, setAnimating] = useState(false);

  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 3;

  /** Clamp pan so the image edge never reveals the container background. */
  const clampPan = (nx, ny, s = zoom) => {
    const c = containerRef.current;
    if (!c) return { x: 0, y: 0 };
    const W = c.clientWidth;
    const H = c.clientHeight;
    // For s >= 1, the scaled image extends beyond container, so we can pan by
    // up to (s-1)*W/2 on each side. For s < 1, we forbid panning (image is
    // smaller than container — keep it centered).
    if (s <= 1) return { x: 0, y: 0 };
    const maxX = ((s - 1) * W) / 2;
    const maxY = ((s - 1) * H) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, nx)),
      y: Math.max(-maxY, Math.min(maxY, ny)),
    };
  };

  /** Set zoom while keeping the focal point under the cursor stable. */
  const zoomTo = (next, focal) => {
    next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, +next.toFixed(3)));
    if (next === zoom) return;
    const c = containerRef.current;
    if (!c || !focal) {
      const p = clampPan(tx, ty, next);
      setZoom(next);
      setTx(p.x);
      setTy(p.y);
      return;
    }
    const rect = c.getBoundingClientRect();
    // focal in container coords
    const fx = focal.x - rect.left - rect.width / 2;
    const fy = focal.y - rect.top - rect.height / 2;
    // image-space coordinates of focal under current scale
    const ix = (fx - tx) / zoom;
    const iy = (fy - ty) / zoom;
    // new translation so the same image-point stays under cursor
    const newTx = fx - ix * next;
    const newTy = fy - iy * next;
    const p = clampPan(newTx, newTy, next);
    setZoom(next);
    setTx(p.x);
    setTy(p.y);
  };

  // Reset zoom helper (double-tap / double-click)
  const resetZoom = () => {
    setAnimating(true);
    setZoom(1);
    setTx(0);
    setTy(0);
    setTimeout(() => setAnimating(false), 220);
  };

  // ---- Wheel zoom ----
  const onWheel = (e) => {
    if (!cameraOn) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015); // smooth log scale
    zoomTo(zoom * factor, { x: e.clientX, y: e.clientY });
  };

  // ---- Touch (pinch + pan) ----
  const onTouchStart = (e) => {
    if (!cameraOn) return;
    if (e.touches.length === 2) {
      const [a, b] = e.touches;
      pinchRef.current = {
        active: true,
        startDist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
        startScale: zoom,
      };
    } else if (e.touches.length === 1 && zoom > 1) {
      const t = e.touches[0];
      panRef.current = {
        active: true,
        startX: t.clientX,
        startY: t.clientY,
        startTx: tx,
        startTy: ty,
        moved: false,
      };
    }
  };
  const onTouchMove = (e) => {
    if (!cameraOn) return;
    if (pinchRef.current.active && e.touches.length === 2) {
      e.preventDefault();
      const [a, b] = e.touches;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
      const ratio = d / pinchRef.current.startDist;
      const focal = {
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
      };
      zoomTo(pinchRef.current.startScale * ratio, focal);
    } else if (panRef.current.active && e.touches.length === 1) {
      e.preventDefault();
      const t = e.touches[0];
      const nx = panRef.current.startTx + (t.clientX - panRef.current.startX);
      const ny = panRef.current.startTy + (t.clientY - panRef.current.startY);
      const p = clampPan(nx, ny);
      setTx(p.x);
      setTy(p.y);
    }
  };
  const onTouchEnd = (e) => {
    if (e.touches.length < 2) pinchRef.current.active = false;
    if (e.touches.length === 0) panRef.current.active = false;
  };

  // ---- Mouse drag pan ----
  const onMouseDown = (e) => {
    if (!cameraOn || zoom <= 1 || e.button !== 0) return;
    panRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startTx: tx,
      startTy: ty,
      moved: false,
    };
  };
  const onMouseMove = (e) => {
    if (!panRef.current.active) return;
    const nx = panRef.current.startTx + (e.clientX - panRef.current.startX);
    const ny = panRef.current.startTy + (e.clientY - panRef.current.startY);
    const p = clampPan(nx, ny);
    setTx(p.x);
    setTy(p.y);
  };
  const endDrag = () => {
    panRef.current.active = false;
  };

  // Re-clamp pan if zoom changes via slider/buttons (so if zoom drops to <=1
  // the image snaps back to center).
  useEffect(() => {
    const p = clampPan(tx, ty, zoom);
    if (p.x !== tx || p.y !== ty) {
      setTx(p.x);
      setTy(p.y);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  const mp = useMediaPipe(videoRef, {
    enabled: cameraOn && showSkeleton,
    onMotion: (v) => {
      movingRef.current = v;
    },
  });

  // overlay draw loop (runs alongside MediaPipe detection loop)
  useEffect(() => {
    if (!cameraOn || !showSkeleton) return;
    const tick = () => {
      const v = videoRef.current;
      const c = overlayRef.current;
      if (v && c && v.videoWidth) {
        if (c.width !== v.videoWidth) c.width = v.videoWidth;
        if (c.height !== v.videoHeight) c.height = v.videoHeight;
        drawLandmarks(c, mp.landmarks, { mirror: facing === "user" });
      }
      drawRafRef.current = requestAnimationFrame(tick);
    };
    drawRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (drawRafRef.current) cancelAnimationFrame(drawRafRef.current);
    };
  }, [cameraOn, showSkeleton, mp.landmarks, facing]);

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
    } else setElapsed(0);
    return () => clearInterval(t);
  }, [recording]);

  // restart camera when orientation/facing changes
  useEffect(() => {
    if (!cameraOn) return;
    restartStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orientation, facing]);

  async function startCamera() {
    setError("");
    await openStream();
  }

  async function openStream() {
    try {
      const isVertical = orientation === "vertical";
      const constraints = {
        video: {
          facingMode: facing,
          width: { ideal: isVertical ? 720 : 1280 },
          height: { ideal: isVertical ? 1280 : 720 },
          aspectRatio: isVertical ? 9 / 16 : 16 / 9,
        },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setError("No se pudo acceder a la cámara. Concede permisos en tu navegador.");
    }
  }

  async function restartStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    await openStream();
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
    const c = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
    for (const m of c) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    return "";
  }

  function startRecording() {
    if (!streamRef.current) return;
    const mime = pickMime();
    chunksRef.current = [];
    try {
      const rec = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = mime || "video/webm";
        const blob = new Blob(chunksRef.current, { type });
        const dur = (Date.now() - startTimeRef.current) / 1000;
        if (blob.size > 0 && onClipReady) {
          if (motionGated && !movingRef.current) return; // skip empty clip
          onClipReady(blob, dur);
        }
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

  function captureFrame() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const canvas = captureCanvasRef.current || document.createElement("canvas");
    captureCanvasRef.current = canvas;
    const w = orientation === "vertical" ? 360 : 480;
    const h = Math.round((video.videoHeight / video.videoWidth) * w) || 360;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    framesBufRef.current.push(dataUrl.split(",")[1]);

    if (framesBufRef.current.length >= batchEvery) {
      const batch = framesBufRef.current.splice(0, framesBufRef.current.length);
      const dur = (Date.now() - batchStartRef.current) / 1000;
      batchStartRef.current = Date.now();
      if (motionGated && !movingRef.current) return; // skip empty batch
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

  // live cycle (non-blocking)
  useEffect(() => {
    if (mode !== "live" || !cameraOn) return;
    let cancelled = false;
    const cycle = () => {
      if (cancelled || !streamRef.current) return;
      startRecording();
      liveTimerRef.current = setTimeout(() => {
        stopRecording();
        liveTimerRef.current = setTimeout(cycle, 80);
      }, clipDuration * 1000);
    };
    cycle();
    return () => {
      cancelled = true;
      if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
      stopRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cameraOn, clipDuration]);

  // streaming mode
  useEffect(() => {
    if (mode !== "streaming" || !cameraOn) return;
    startFrameCapture();
    return () => stopFrameCapture();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cameraOn, frameRateMs, batchEvery]);

  const isVertical = orientation === "vertical";

  return (
    <div
      ref={containerRef}
      data-testid={`${testIdPrefix}-container`}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      onDoubleClick={resetZoom}
      style={{ touchAction: zoom > 1 ? "none" : "pinch-zoom" }}
      className={`relative w-full overflow-hidden rounded-2xl border ${
        recording ? "border-red-400 recording-ring" : "border-slate-200 dark:border-slate-700"
      } bg-slate-950 mx-auto select-none ${
        zoom > 1 ? (panRef.current?.active ? "cursor-grabbing" : "cursor-grab") : ""
      } ${isVertical ? "aspect-[9/16] max-w-md" : "aspect-video"}`}
    >
      {/* Zoom-able layer: contains video + overlay so they stay aligned */}
      <div
        ref={zoomLayerRef}
        data-testid={`${testIdPrefix}-zoom-layer`}
        className="absolute inset-0 will-change-transform"
        style={{
          transform: `translate3d(${tx}px, ${ty}px, 0) scale(${zoom})`,
          transformOrigin: "center center",
          transition: animating
            ? "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)"
            : "transform 90ms linear",
        }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          data-testid={`${testIdPrefix}-video`}
          draggable={false}
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none ${
            facing === "user" ? "[transform:scaleX(-1)]" : ""
          }`}
        />

        {showSkeleton && cameraOn && (
          <canvas
            ref={overlayRef}
            data-testid={`${testIdPrefix}-skeleton`}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
        )}
      </div>

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
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setOrientation("horizontal")}
              data-testid={`${testIdPrefix}-set-horizontal`}
              className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors ${
                orientation === "horizontal"
                  ? "bg-[#002FA7] text-white"
                  : "bg-white/10 text-white/80 hover:bg-white/20"
              }`}
            >
              <Monitor className="w-3.5 h-3.5" /> Horizontal
            </button>
            <button
              onClick={() => setOrientation("vertical")}
              data-testid={`${testIdPrefix}-set-vertical`}
              className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors ${
                orientation === "vertical"
                  ? "bg-[#002FA7] text-white"
                  : "bg-white/10 text-white/80 hover:bg-white/20"
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" /> Vertical
            </button>
          </div>
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
            {showSkeleton && mp.ready && (
              <Badge className="bg-emerald-500/90 text-white border-0">
                <Activity className="w-3 h-3 mr-1" /> MediaPipe
              </Badge>
            )}
            {showSkeleton && mp.ready && cameraOn && (
              <QualityBadge quality={mp.quality} />
            )}
            {busy && (
              <Badge className="bg-black/60 text-white border-0 backdrop-blur-md">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Analizando…
              </Badge>
            )}
            {motionGated && (
              <Badge
                className={`border-0 ${
                  movingRef.current
                    ? "bg-emerald-500/90 text-white"
                    : "bg-black/60 text-white/80 backdrop-blur-md"
                }`}
              >
                {movingRef.current ? "Movimiento ✓" : "Sin movimiento"}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {detectedLanguage && (
              <Badge
                data-testid={`${testIdPrefix}-lang-badge`}
                className="bg-white/90 text-slate-900 border-0 backdrop-blur-md"
              >
                {detectedLanguage}
              </Badge>
            )}
            <button
              data-testid={`${testIdPrefix}-zoom-out`}
              onClick={() => {
                setAnimating(true);
                zoomTo(zoom - 0.2);
                setTimeout(() => setAnimating(false), 220);
              }}
              disabled={zoom <= ZOOM_MIN}
              className="p-2 rounded-full bg-black/55 text-white hover:bg-black/75 backdrop-blur-md transition-all duration-200 disabled:opacity-40"
              aria-label="Alejar"
              title="Alejar (zoom out)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              data-testid={`${testIdPrefix}-zoom-in`}
              onClick={() => {
                setAnimating(true);
                zoomTo(zoom + 0.2);
                setTimeout(() => setAnimating(false), 220);
              }}
              disabled={zoom >= ZOOM_MAX}
              className="p-2 rounded-full bg-black/55 text-white hover:bg-black/75 backdrop-blur-md transition-all duration-200 disabled:opacity-40"
              aria-label="Acercar"
              title="Acercar (zoom in)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              data-testid={`${testIdPrefix}-flip-button`}
              onClick={() =>
                setFacing((f) => (f === "user" ? "environment" : "user"))
              }
              className="p-2 rounded-full bg-black/55 text-white hover:bg-black/75 backdrop-blur-md transition-all duration-200"
              aria-label="Cambiar cámara"
              title="Cambiar cámara"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
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

      {/* Vertical zoom slider on the right edge (visible on cam-on state) */}
      {cameraOn && (
        <div
          data-testid={`${testIdPrefix}-zoom-slider`}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-2 bg-black/55 backdrop-blur-md rounded-full px-2 py-3"
        >
          <button
            onClick={() => {
              setAnimating(true);
              zoomTo(zoom + 0.2);
              setTimeout(() => setAnimating(false), 220);
            }}
            disabled={zoom >= ZOOM_MAX}
            className="text-white hover:bg-white/10 rounded-full p-1 disabled:opacity-40"
            aria-label="Acercar"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step="0.05"
            value={zoom}
            onChange={(e) => {
              setAnimating(false);
              zoomTo(parseFloat(e.target.value));
            }}
            className="h-24 cursor-pointer accent-white"
            style={{
              writingMode: "vertical-lr",
              WebkitAppearance: "slider-vertical",
              direction: "rtl",
              width: 16,
            }}
            aria-label="Nivel de zoom"
          />
          <button
            onClick={() => {
              setAnimating(true);
              zoomTo(zoom - 0.2);
              setTimeout(() => setAnimating(false), 220);
            }}
            disabled={zoom <= ZOOM_MIN}
            className="text-white hover:bg-white/10 rounded-full p-1 disabled:opacity-40"
            aria-label="Alejar"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span
            className="text-[10px] text-white/80 font-mono tabular-nums cursor-pointer hover:text-white"
            onClick={resetZoom}
            title="Restablecer zoom (doble clic en imagen)"
          >
            {Math.round(zoom * 100)}%
          </span>
        </div>
      )}

      {cameraOn && (
        <div className="absolute left-0 right-0 bottom-4 flex items-center justify-center gap-3 z-10 px-3 flex-wrap">
          <button
            data-testid={`${testIdPrefix}-orientation-toggle`}
            onClick={() =>
              setOrientation((o) =>
                o === "horizontal" ? "vertical" : "horizontal",
              )
            }
            className="px-3 py-2 rounded-full bg-black/55 text-white hover:bg-black/75 backdrop-blur-md text-xs flex items-center gap-1.5"
            title="Cambiar orientación"
          >
            {isVertical ? (
              <>
                <Monitor className="w-3.5 h-3.5" /> Horizontal
              </>
            ) : (
              <>
                <Smartphone className="w-3.5 h-3.5" /> Vertical
              </>
            )}
          </button>

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

const ISSUE_LABEL = {
  "face-missing": "Cara fuera de cuadro",
  "face-cropped": "Cara cortada en el borde",
  "hands-missing": "Manos no visibles",
  "hand-cropped": "Mano cortada en el borde",
  "torso-not-visible": "Acerca el torso",
};

function QualityBadge({ quality }) {
  if (!quality) return null;
  const { score, level, issues } = quality;
  const map = {
    good: {
      bg: "bg-emerald-500/90",
      icon: <CheckCircle2 className="w-3 h-3 mr-1" />,
      text: "Excelente",
    },
    fair: {
      bg: "bg-amber-500/90",
      icon: <AlertCircle className="w-3 h-3 mr-1" />,
      text: "Aceptable",
    },
    poor: {
      bg: "bg-red-500/90",
      icon: <AlertTriangle className="w-3 h-3 mr-1" />,
      text: "Encuadre pobre",
    },
    off: {
      bg: "bg-slate-500/80",
      icon: <AlertCircle className="w-3 h-3 mr-1" />,
      text: "Calculando…",
    },
  };
  const cfg = map[level] || map.off;
  const tip = issues.map((i) => ISSUE_LABEL[i] || i).join(" · ");
  return (
    <Badge
      data-testid="quality-badge"
      data-level={level}
      title={tip || `Calidad ${score}/100`}
      className={`${cfg.bg} text-white border-0 cursor-help`}
    >
      {cfg.icon}
      {cfg.text}
      <span className="ml-1 font-mono text-[10px] opacity-80">{score}</span>
    </Badge>
  );
}
