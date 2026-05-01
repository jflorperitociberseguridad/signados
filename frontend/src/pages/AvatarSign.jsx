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
/**
 * GLOBAL_THREE — module-level singleton holding the WebGL renderer, scene,
 * camera, lights, floor and orbit state. Created lazily ONCE on the first
 * mount of AvatarSign and reused for the entire page lifetime.
 *
 * Why a module-level singleton instead of a per-mount WeakMap?
 *   Browsers cap the number of live WebGL contexts per page (~16). When the
 *   user navigates away and back to /avatar, React mounts a fresh DOM div,
 *   so a div-keyed WeakMap can't help — we'd build a brand-new context every
 *   visit and quickly hit the cap → "Error creating WebGL context".
 *   By keeping a single context attached to whichever <div> is currently
 *   mounted, we never create more than one context, no matter how many times
 *   the user navigates to /avatar.
 */
let GLOBAL_THREE = null;

function getOrCreateGlobalThree() {
  if (GLOBAL_THREE) return GLOBAL_THREE;

  const scene = new THREE.Scene();

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

  const cam = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 100);
  cam.position.set(0, 1.65, 3.4);
  cam.lookAt(0, 1.55, 0);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "default",
    failIfMajorPerformanceCaveat: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const keyL = new THREE.DirectionalLight(0xffffff, 1.4);
  keyL.position.set(2.5, 4.2, 2.5);
  keyL.castShadow = true;
  keyL.shadow.mapSize.set(1024, 1024);
  keyL.shadow.camera.near = 0.5;
  keyL.shadow.camera.far = 12;
  keyL.shadow.camera.left = -3;
  keyL.shadow.camera.right = 3;
  keyL.shadow.camera.top = 4;
  keyL.shadow.camera.bottom = -1;
  keyL.shadow.bias = -0.0005;
  keyL.shadow.radius = 4;
  scene.add(keyL);

  const fill = new THREE.DirectionalLight(0x88a8ff, 0.55);
  fill.position.set(-3, 2, 1.5);
  scene.add(fill);

  const rim = new THREE.SpotLight(0xffe6c9, 1.6, 12, Math.PI / 6, 0.4, 1);
  rim.position.set(-1.5, 3.5, -3);
  rim.target.position.set(0, 1.5, 0);
  scene.add(rim, rim.target);

  scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x453525, 0.35));

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 64),
    new THREE.MeshStandardMaterial({ color: 0x9aa6b8, roughness: 0.9, metalness: 0.0 }),
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

  GLOBAL_THREE = {
    scene,
    cam,
    renderer,
    orbit: { azim: 0, polar: 1.45, dist: 3.4, dragging: false, lastX: 0, lastY: 0 },
    clock: new THREE.Clock(),
    animActive: false,
    animFrameId: null,
    // Per-mount step callback supplied by AvatarSign; allows the singleton's
    // tick() to drive whichever avatar instances the active component owns.
    stepCallback: null,
  };
  return GLOBAL_THREE;
}

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

  // ----- Attach the global Three.js singleton to the current mount -----
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const G = getOrCreateGlobalThree();
    sceneRef.current = G.scene;
    rendererRef.current = G.renderer;
    camRef.current = G.cam;
    orbitRef.current = G.orbit;

    // Move (or first-attach) the renderer canvas to this mount
    if (G.renderer.domElement.parentNode !== mount) {
      mount.appendChild(G.renderer.domElement);
    }
    const w = mount.clientWidth || 640;
    const h = mount.clientHeight || 480;
    G.renderer.setSize(w, h);
    G.cam.aspect = w / h;
    G.cam.updateProjectionMatrix();

    // ----- Mouse / touch orbit controls (per-mount, removed on cleanup) -----
    const dom = G.renderer.domElement;
    dom.style.cursor = "grab";
    const onDown = (e) => {
      G.orbit.dragging = true;
      G.orbit.lastX = e.clientX;
      G.orbit.lastY = e.clientY;
      dom.style.cursor = "grabbing";
    };
    const onUp = () => {
      G.orbit.dragging = false;
      dom.style.cursor = "grab";
    };
    const onMove = (e) => {
      if (!G.orbit.dragging) return;
      const dx = e.clientX - G.orbit.lastX;
      const dy = e.clientY - G.orbit.lastY;
      G.orbit.lastX = e.clientX;
      G.orbit.lastY = e.clientY;
      G.orbit.azim -= dx * 0.008;
      G.orbit.polar = Math.max(0.6, Math.min(2.2, G.orbit.polar - dy * 0.006));
    };
    const onWheel = (e) => {
      e.preventDefault();
      G.orbit.dist = Math.max(2.4, Math.min(7, G.orbit.dist + e.deltaY * 0.003));
    };
    dom.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    dom.addEventListener("wheel", onWheel, { passive: false });

    let touchPinch = null;
    const onTStart = (e) => {
      if (e.touches.length === 1) {
        G.orbit.dragging = true;
        G.orbit.lastX = e.touches[0].clientX;
        G.orbit.lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        const a = e.touches[0];
        const b = e.touches[1];
        touchPinch = {
          dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
          startDist: G.orbit.dist,
        };
      }
    };
    const onTMove = (e) => {
      if (e.touches.length === 1 && G.orbit.dragging) {
        const t = e.touches[0];
        const dx = t.clientX - G.orbit.lastX;
        const dy = t.clientY - G.orbit.lastY;
        G.orbit.lastX = t.clientX;
        G.orbit.lastY = t.clientY;
        G.orbit.azim -= dx * 0.008;
        G.orbit.polar = Math.max(0.6, Math.min(2.2, G.orbit.polar - dy * 0.006));
      } else if (e.touches.length === 2 && touchPinch) {
        const a = e.touches[0];
        const b = e.touches[1];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
        G.orbit.dist = Math.max(2.4, Math.min(7, touchPinch.startDist * (touchPinch.dist / d)));
      }
    };
    const onTEnd = () => {
      G.orbit.dragging = false;
      touchPinch = null;
    };
    dom.addEventListener("touchstart", onTStart, { passive: true });
    dom.addEventListener("touchmove", onTMove, { passive: true });
    dom.addEventListener("touchend", onTEnd);

    // ----- Animation loop driven by the singleton -----
    G.stepCallback = (dt) => {
      stylizedAnimRef.current?.step(dt);
      realisticRef.current?.step(dt);
    };
    const tick = () => {
      if (!G.animActive) return;
      const dt = Math.min(0.05, G.clock.getDelta());
      G.stepCallback?.(dt);
      const o = G.orbit;
      const cx = Math.sin(o.azim) * Math.sin(o.polar) * o.dist;
      const cy = Math.cos(o.polar) * o.dist + 1.4;
      const cz = Math.cos(o.azim) * Math.sin(o.polar) * o.dist;
      G.cam.position.set(cx, cy, cz);
      G.cam.lookAt(0, 1.55, 0);
      G.renderer.render(G.scene, G.cam);
      G.animFrameId = requestAnimationFrame(tick);
    };
    G.animActive = true;
    G.clock.start();
    tick();

    const onResize = () => {
      const w2 = mount.clientWidth;
      const h2 = mount.clientHeight;
      if (!w2 || !h2) return;
      G.cam.aspect = w2 / h2;
      G.cam.updateProjectionMatrix();
      G.renderer.setSize(w2, h2);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);
    window.addEventListener("resize", onResize);

    return () => {
      // Stop the loop; KEEP the WebGL context alive so the next mount of
      // /avatar can reuse it without hitting the per-page context limit.
      G.animActive = false;
      cancelAnimationFrame(G.animFrameId);
      G.stepCallback = null;
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      dom.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("touchstart", onTStart);
      dom.removeEventListener("touchmove", onTMove);
      dom.removeEventListener("touchend", onTEnd);
      // Detach canvas from this mount (don't dispose — singleton survives)
      if (mount.contains(G.renderer.domElement)) {
        mount.removeChild(G.renderer.domElement);
      }
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
      // Important: when AvatarSign unmounts (e.g., user navigates away),
      // also drop the avatar from the shared singleton scene so the next
      // mount starts clean. The Three.js renderer + scene survive; only
      // the avatar mesh is recreated.
      if (realisticRef.current) {
        try { realisticRef.current.dispose(); } catch {}
        realisticRef.current = null;
      }
      if (stylizedRootRef.current && sceneRef.current) {
        try { sceneRef.current.remove(stylizedRootRef.current); } catch {}
        stylizedRootRef.current = null;
      }
      stylizedAnimRef.current = null;
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
