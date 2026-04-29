import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";
import {
  User,
  Loader2,
  Play,
  Square,
  RotateCcw,
  Sparkles,
  Gauge,
  UserCircle2,
  Wand2,
} from "lucide-react";
import { textToSign, videoForWord, fetchVideoBlobUrl } from "../lib/api";
import { toast } from "sonner";
import { buildAvatar } from "../lib/avatarRig";
import { PoseAnimator, POSE_KEYS } from "../lib/avatarPoses";
import { RealisticAvatar } from "../lib/avatarRealistic";
import { useAdminAuth } from "../lib/AdminAuthContext";
import { useLanguageVariant } from "../lib/LanguageVariantContext";

/**
 * SCENE_REGISTRY — module-level registry keyed by the mount DOM element.
 * React.StrictMode double-mounts the component (mount → cleanup → mount),
 * but the DOM element survives across both mounts. By caching the WebGL
 * scene against that element, we can:
 *   1. Skip re-creating the renderer on the second mount
 *   2. Cancel a pending disposal if the component re-mounts within ~50ms
 *
 * This avoids the WebGL context-limit error ("Error creating WebGL context").
 */
const SCENE_REGISTRY = new WeakMap();

const SHORTCUTS = [
  "Hola", "Adiós", "Sí", "No", "Por favor", "Gracias",
  "Te quiero", "Yo", "Tú", "Comer", "Beber", "Casa", "Pensar",
  "Bien", "Mal", "Ayuda",
];

const MODE_REALISTIC = "realistic";
const MODE_STYLIZED = "stylized";

export default function AvatarSign() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const camRef = useRef(null);
  const animFrameRef = useRef(null);

  const stylizedAnimRef = useRef(null);
  const realisticRef = useRef(null);
  const stylizedRootRef = useRef(null);

  const orbitRef = useRef({
    azim: 0,
    polar: 1.45,
    dist: 3.4,
    dragging: false,
    lastX: 0,
    lastY: 0,
  });

  const [mode, setMode] = useState(MODE_REALISTIC);
  const [loadingModel, setLoadingModel] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [currentWord, setCurrentWord] = useState("");
  const [speed, setSpeed] = useState(1.0);

  // Reference video overlay (admin only)
  const { isAdmin, password } = useAdminAuth();
  const { variant } = useLanguageVariant();
  const [refVideo, setRefVideo] = useState(null); // { url, label, kb }
  const [refVideoLoading, setRefVideoLoading] = useState(false);
  const refBlobRef = useRef(null);

  // ----- Initialize Three.js scene -----
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── StrictMode + WebGL safe-init ──
    // If the previous mount scheduled a disposal, cancel it and reuse.
    const cached = SCENE_REGISTRY.get(mount);
    if (cached) {
      if (cached.disposeTimer) {
        clearTimeout(cached.disposeTimer);
        cached.disposeTimer = null;
      }
      // Reuse existing scene/renderer/camera and rebind animation refs
      sceneRef.current = cached.scene;
      rendererRef.current = cached.renderer;
      camRef.current = cached.cam;
      orbitRef.current = cached.orbit;
      // Resume the animation loop (we paused it in cleanup)
      cached.resume?.();
      return () => {
        // On the next cleanup, schedule actual disposal (cancellable)
        cached.disposeTimer = setTimeout(() => cached.dispose?.(), 80);
      };
    }

    // First-ever mount: build the scene from scratch.
    const w = mount.clientWidth || 640;
    const h = mount.clientHeight || 480;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Soft vertical-gradient background
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#1e293b");
    grad.addColorStop(0.6, "#475569");
    grad.addColorStop(1, "#cbd5e1");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 256);
    const bgTex = new THREE.CanvasTexture(canvas);
    bgTex.colorSpace = THREE.SRGBColorSpace;
    scene.background = bgTex;

    const cam = new THREE.PerspectiveCamera(34, w / h, 0.1, 100);
    cam.position.set(0, 1.65, 3.4);
    cam.lookAt(0, 1.55, 0);
    camRef.current = cam;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "default",
      failIfMajorPerformanceCaveat: false,
    });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 0.35));

    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(2.5, 4.2, 2.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 12;
    key.shadow.camera.left = -3;
    key.shadow.camera.right = 3;
    key.shadow.camera.top = 4;
    key.shadow.camera.bottom = -1;
    key.shadow.bias = -0.0005;
    key.shadow.radius = 4;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x88a8ff, 0.55);
    fill.position.set(-3, 2, 1.5);
    scene.add(fill);

    const rim = new THREE.SpotLight(0xffe6c9, 1.6, 12, Math.PI / 6, 0.4, 1);
    rim.position.set(-1.5, 3.5, -3);
    rim.target.position.set(0, 1.5, 0);
    scene.add(rim, rim.target);

    const hemi = new THREE.HemisphereLight(0xeaf2ff, 0x453525, 0.35);
    scene.add(hemi);

    // Floor
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(3.4, 64),
      new THREE.MeshStandardMaterial({
        color: 0x9aa6b8,
        roughness: 0.9,
        metalness: 0.0,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const ao = new THREE.Mesh(
      new THREE.RingGeometry(0.05, 1.2, 64),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }),
    );
    ao.rotation.x = -Math.PI / 2;
    ao.position.y = 0.001;
    scene.add(ao);

    // ----- Mouse orbit -----
    const dom = renderer.domElement;
    dom.style.cursor = "grab";
    const onDown = (e) => {
      orbitRef.current.dragging = true;
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;
      dom.style.cursor = "grabbing";
    };
    const onUp = () => {
      orbitRef.current.dragging = false;
      dom.style.cursor = "grab";
    };
    const onMove = (e) => {
      if (!orbitRef.current.dragging) return;
      const dx = e.clientX - orbitRef.current.lastX;
      const dy = e.clientY - orbitRef.current.lastY;
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;
      orbitRef.current.azim -= dx * 0.008;
      orbitRef.current.polar = Math.max(0.6, Math.min(2.2, orbitRef.current.polar - dy * 0.006));
    };
    const onWheel = (e) => {
      e.preventDefault();
      orbitRef.current.dist = Math.max(2.4, Math.min(7, orbitRef.current.dist + e.deltaY * 0.003));
    };
    dom.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    dom.addEventListener("wheel", onWheel, { passive: false });

    let touchPinch = null;
    const onTStart = (e) => {
      if (e.touches.length === 1) {
        orbitRef.current.dragging = true;
        orbitRef.current.lastX = e.touches[0].clientX;
        orbitRef.current.lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        const a = e.touches[0];
        const b = e.touches[1];
        touchPinch = {
          dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
          startDist: orbitRef.current.dist,
        };
      }
    };
    const onTMove = (e) => {
      if (e.touches.length === 1 && orbitRef.current.dragging) {
        const t = e.touches[0];
        const dx = t.clientX - orbitRef.current.lastX;
        const dy = t.clientY - orbitRef.current.lastY;
        orbitRef.current.lastX = t.clientX;
        orbitRef.current.lastY = t.clientY;
        orbitRef.current.azim -= dx * 0.008;
        orbitRef.current.polar = Math.max(0.6, Math.min(2.2, orbitRef.current.polar - dy * 0.006));
      } else if (e.touches.length === 2 && touchPinch) {
        const a = e.touches[0];
        const b = e.touches[1];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
        orbitRef.current.dist = Math.max(2.4, Math.min(7, touchPinch.startDist * (touchPinch.dist / d)));
      }
    };
    const onTEnd = () => {
      orbitRef.current.dragging = false;
      touchPinch = null;
    };
    dom.addEventListener("touchstart", onTStart, { passive: true });
    dom.addEventListener("touchmove", onTMove, { passive: true });
    dom.addEventListener("touchend", onTEnd);

    // ----- Animation loop (pausable) -----
    const clock = new THREE.Clock();
    let animActive = true;
    const tick = () => {
      if (!animActive) return;
      const dt = Math.min(0.05, clock.getDelta());
      stylizedAnimRef.current?.step(dt);
      realisticRef.current?.step(dt);

      const o = orbitRef.current;
      const cx = Math.sin(o.azim) * Math.sin(o.polar) * o.dist;
      const cy = Math.cos(o.polar) * o.dist + 1.4;
      const cz = Math.cos(o.azim) * Math.sin(o.polar) * o.dist;
      cam.position.set(cx, cy, cz);
      cam.lookAt(0, 1.55, 0);

      renderer.render(scene, cam);
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();

    const onResize = () => {
      const w2 = mount.clientWidth;
      const h2 = mount.clientHeight;
      cam.aspect = w2 / h2;
      cam.updateProjectionMatrix();
      renderer.setSize(w2, h2);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);
    window.addEventListener("resize", onResize);

    // Register the scene so a re-mount within 80ms reuses it (StrictMode)
    const reg = {
      scene,
      cam,
      renderer,
      orbit: orbitRef.current,
      disposeTimer: null,
      resume() {
        if (animActive) return;
        animActive = true;
        clock.start();
        tick();
      },
      dispose() {
        animActive = false;
        cancelAnimationFrame(animFrameRef.current);
        window.removeEventListener("resize", onResize);
        ro.disconnect();
        dom.removeEventListener("mousedown", onDown);
        window.removeEventListener("mouseup", onUp);
        window.removeEventListener("mousemove", onMove);
        dom.removeEventListener("wheel", onWheel);
        dom.removeEventListener("touchstart", onTStart);
        dom.removeEventListener("touchmove", onTMove);
        dom.removeEventListener("touchend", onTEnd);
        try {
          renderer.forceContextLoss?.();
        } catch {}
        try {
          renderer.dispose();
          if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
        } catch {}
        SCENE_REGISTRY.delete(mount);
      },
    };
    SCENE_REGISTRY.set(mount, reg);

    return () => {
      // Pause the animation loop so a quick re-mount can resume it without re-init.
      animActive = false;
      cancelAnimationFrame(animFrameRef.current);
      // Schedule disposal — cancelled if the component remounts in <80ms (StrictMode).
      reg.disposeTimer = setTimeout(() => reg.dispose(), 80);
    };
  }, []);

  // ----- Swap avatar mode (Realistic <-> Stylized) -----
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    let cancelled = false;
    const swap = async () => {
      // Tear down whichever is active
      if (realisticRef.current) {
        realisticRef.current.dispose();
        realisticRef.current = null;
      }
      if (stylizedRootRef.current) {
        scene.remove(stylizedRootRef.current);
        stylizedRootRef.current = null;
      }
      stylizedAnimRef.current = null;

      setLoadError("");
      setCurrentWord("");

      if (mode === MODE_REALISTIC) {
        setLoadingModel(true);
        try {
          const r = new RealisticAvatar(scene, {
            onWord: (w) => setCurrentWord(w || ""),
          });
          await r.load();
          if (cancelled) {
            r.dispose();
            return;
          }
          realisticRef.current = r;
        } catch (e) {
          setLoadError("No se pudo cargar el modelo realista. Volviendo al estilizado.");
          // Fallback to stylized so user is never stuck
          setMode(MODE_STYLIZED);
        } finally {
          setLoadingModel(false);
        }
      } else {
        // Build the procedural avatar
        const { root, bones } = buildAvatar();
        root.traverse((o) => {
          if (o.isMesh) o.castShadow = true;
        });
        scene.add(root);
        stylizedRootRef.current = root;
        const animator = new PoseAnimator(bones);
        animator.onWord = (w) => setCurrentWord(w || "");
        stylizedAnimRef.current = animator;
        setLoadingModel(false);
      }
    };
    swap();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  // Sync animator speed
  useEffect(() => {
    stylizedAnimRef.current?.setSpeed(speed);
    realisticRef.current?.setSpeed(speed);
  }, [speed]);

  // ---- Actions ----
  const playWords = (words) => {
    const target = realisticRef.current || stylizedAnimRef.current;
    if (!target) return;
    if (target instanceof RealisticAvatar) {
      target.setQueue(words);
    } else {
      target.setQueue(words.map((w) => ({ word: w })));
    }
    setPlaying(true);
    const totalMs = words.length * 1300 + 900;
    setTimeout(() => setPlaying(false), totalMs / Math.max(0.4, speed));
  };

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await textToSign(text.trim(), "auto");
      setResult(res);
      const words = (res.steps || []).map((s) => s.word).filter(Boolean);
      playWords(words.length ? words.slice(0, 12) : text.trim().split(/\s+/).slice(0, 12));
    } catch (e) {
      toast.error("Error", { description: e?.response?.data?.detail || e?.message });
    } finally {
      setBusy(false);
    }
  };

  const handleQuickPose = (w) => {
    setText(w);
    playWords([w]);
  };

  const stop = () => {
    realisticRef.current?.clear();
    stylizedAnimRef.current?.clear();
    setPlaying(false);
  };

  // ----- Reference video lookup (admin only) -----
  // When the current word changes, ask the backend whether there's an
  // uploaded video that contains this sign. If so, fetch & show it.
  useEffect(() => {
    let cancelled = false;
    if (refBlobRef.current) {
      try {
        URL.revokeObjectURL(refBlobRef.current);
      } catch {}
      refBlobRef.current = null;
    }
    setRefVideo(null);
    if (!isAdmin || !currentWord) return;

    setRefVideoLoading(true);
    (async () => {
      try {
        const data = await videoForWord(password, currentWord, variant);
        if (cancelled || !data?.video) return;
        const url = await fetchVideoBlobUrl(password, data.video.file_id);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        refBlobRef.current = url;
        setRefVideo({ url, label: data.video.label || data.video.filename, kb: data.kb });
      } catch {
        // No video found, ignore
      } finally {
        if (!cancelled) setRefVideoLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentWord, isAdmin, password, variant]);

  const resetCam = () => {
    orbitRef.current.azim = 0;
    orbitRef.current.polar = 1.45;
    orbitRef.current.dist = 3.4;
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-start gap-3 mb-6">
        <span className="w-10 h-10 rounded-md bg-[#002FA7] text-white flex items-center justify-center shrink-0">
          <User className="w-5 h-5" />
        </span>
        <div className="flex-1">
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-slate-900 dark:text-slate-100">
            Avatar 3D
          </h1>
          <p className="text-slate-600 dark:text-slate-300 mt-1">
            {mode === MODE_REALISTIC
              ? "Avatar humano realista de cuerpo entero (Michelle) con piel, ropa y cara. Hombros, brazos, manos y dedos completamente articulados."
              : "Avatar humanoide estilizado con 17 poses. Más liviano, ideal para móviles."}
          </p>
        </div>
        <Badge className="bg-emerald-100 text-emerald-700 border-0 hidden sm:inline-flex">
          <Sparkles className="w-3.5 h-3.5 mr-1" /> Mejorado
        </Badge>
      </div>

      {/* Mode selector */}
      <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="avatar-mode-selector">
        <span className="text-xs uppercase tracking-wide text-slate-500">Modelo:</span>
        <button
          data-testid="avatar-mode-realistic"
          onClick={() => setMode(MODE_REALISTIC)}
          className={`px-4 py-1.5 rounded-full text-sm border transition-colors flex items-center gap-1.5 ${
            mode === MODE_REALISTIC
              ? "bg-[#002FA7] text-white border-[#002FA7]"
              : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#002FA7]"
          }`}
        >
          <UserCircle2 className="w-4 h-4" /> Realista
          <span className="text-[10px] opacity-75 ml-0.5">GLB</span>
        </button>
        <button
          data-testid="avatar-mode-stylized"
          onClick={() => setMode(MODE_STYLIZED)}
          className={`px-4 py-1.5 rounded-full text-sm border transition-colors flex items-center gap-1.5 ${
            mode === MODE_STYLIZED
              ? "bg-[#002FA7] text-white border-[#002FA7]"
              : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#002FA7]"
          }`}
        >
          <Wand2 className="w-4 h-4" /> Estilizado
        </button>
        {loadError && (
          <span className="text-xs text-red-600" data-testid="avatar-load-error">
            {loadError}
          </span>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="relative">
            <div
              ref={mountRef}
              data-testid="avatar-canvas"
              className="aspect-video w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-lg cursor-grab"
              style={{ minHeight: 380 }}
            />

            {loadingModel && (
              <div
                data-testid="avatar-loading"
                className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-2xl"
              >
                <div className="text-center text-white">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                  <div className="text-sm font-medium">
                    {mode === MODE_REALISTIC ? "Cargando modelo realista…" : "Cargando…"}
                  </div>
                  <div className="text-xs text-white/70 mt-1">~2.8 MB</div>
                </div>
              </div>
            )}

            <div className="absolute top-3 right-3 flex items-center gap-2">
              <Badge
                data-testid="avatar-speed-badge"
                className="bg-black/55 text-white border-0 backdrop-blur-md"
              >
                <Gauge className="w-3 h-3 mr-1" /> {speed.toFixed(2)}x
              </Badge>
              <button
                data-testid="avatar-reset-camera"
                onClick={resetCam}
                title="Restablecer cámara"
                className="p-2 rounded-full bg-black/55 text-white hover:bg-black/75 backdrop-blur-md transition"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {currentWord && playing && (
              <div
                data-testid="avatar-current-word"
                className="absolute left-1/2 -translate-x-1/2 bottom-4 fade-in-up"
              >
                <Badge className="bg-[#002FA7] text-white border-0 text-base px-4 py-1.5 shadow-lg">
                  Signando: <strong className="ml-1.5">{currentWord}</strong>
                </Badge>
              </div>
            )}

            {/* Admin-only reference video overlay */}
            {isAdmin && refVideo && (
              <div
                data-testid="avatar-ref-video"
                className="absolute left-3 bottom-3 w-44 sm:w-56 rounded-lg overflow-hidden border-2 border-violet-400/80 shadow-xl bg-black"
              >
                <div className="aspect-video bg-black">
                  <video
                    src={refVideo.url}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="bg-violet-600 text-white text-[10px] px-2 py-1 truncate">
                  📹 Referencia: {refVideo.label}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
              Probar una seña rápida
            </div>
            <div className="flex flex-wrap gap-2">
              {SHORTCUTS.map((w) => (
                <button
                  key={w}
                  data-testid={`avatar-quick-${w.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => handleQuickPose(w)}
                  disabled={loadingModel}
                  className="px-3 py-1.5 rounded-full text-sm bg-slate-100 hover:bg-[#002FA7] hover:text-white text-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-[#002FA7] dark:hover:text-white border border-slate-200 dark:border-slate-700 transition-all disabled:opacity-50"
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Card className="p-5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-xl h-fit">
          <h2 className="font-display text-lg font-semibold mb-3">
            Texto a representar
          </h2>
          <Textarea
            data-testid="avatar-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Hola, te quiero mucho"
            rows={4}
            className="border-slate-300 dark:border-slate-700 mb-3"
          />
          <div className="flex gap-2">
            <Button
              data-testid="avatar-play"
              onClick={handleGenerate}
              disabled={busy || !text.trim() || loadingModel}
              className="btn-ikb flex-1 h-11"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generando…
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" /> Reproducir
                </>
              )}
            </Button>
            {playing && (
              <Button
                data-testid="avatar-stop"
                onClick={stop}
                variant="outline"
                className="h-11"
              >
                <Square className="w-4 h-4" />
              </Button>
            )}
          </div>

          <div className="mt-4">
            <label className="text-xs uppercase tracking-wide text-slate-500 flex items-center justify-between">
              <span>Velocidad</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {speed.toFixed(2)}x
              </span>
            </label>
            <input
              data-testid="avatar-speed"
              type="range"
              min="0.4"
              max="2.0"
              step="0.05"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-full mt-1.5 accent-[#002FA7]"
            />
          </div>

          {result && (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Badge className="bg-[#002FA7] text-white border-0 mb-2">
                {result.language}
              </Badge>
              <p className="text-sm text-slate-700 dark:text-slate-200">
                {result.summary}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                {result.steps?.length || 0} signos en cola
              </p>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 space-y-1">
            <p>
              <strong>Modo Realista:</strong> avatar humano femenino con piel,
              ropa y cara realista (cuerpo entero, hombros, brazos, manos y dedos).
            </p>
            <p>
              <strong>Modo Estilizado:</strong> {POSE_KEYS.length} poses
              precalibradas, sin descarga, ideal para móviles.
            </p>
            <p>
              <strong>Cámara:</strong> arrastrar · rueda/pellizco · botón ↻ para reset.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
