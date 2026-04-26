import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";
import { User, Loader2, Play, Square } from "lucide-react";
import { textToSign } from "../lib/api";
import { toast } from "sonner";

/**
 * AvatarSign — minimalist humanoid 3D model (head/torso/arms/hands)
 * built from primitive shapes. Plays simple sign-like motions:
 *  - Wave (greeting)
 *  - Heart (love)
 *  - Beats chest (yes/no)
 *  - Both hands open (please/help)
 * Driven by `motionQueue`: array of motion ids to play sequentially.
 */
export default function AvatarSign() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const armsRef = useRef({});
  const animRef = useRef(null);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [playing, setPlaying] = useState(false);
  const queueRef = useRef([]);
  const tRef = useRef(0);

  // Init Three.js scene
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    sceneRef.current = scene;

    const cam = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    cam.position.set(0, 1.4, 4);
    cam.lookAt(0, 1.2, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(2, 5, 3);
    scene.add(dir);

    // Avatar (built from primitives)
    const skin = new THREE.MeshStandardMaterial({ color: 0xfde2c5, roughness: 0.6 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x002fa7, roughness: 0.4 });

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 24), skin);
    head.position.set(0, 1.95, 0);
    scene.add(head);
    // Eyes
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), eyeMat);
    eyeL.position.set(-0.1, 2.0, 0.27);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.1;
    scene.add(eyeL, eyeR);
    // Mouth (small smile)
    const mouth = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.012, 0.01),
      new THREE.MeshStandardMaterial({ color: 0x9b1c1c }),
    );
    mouth.position.set(0, 1.85, 0.3);
    scene.add(mouth);

    // Torso
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.32, 0.85, 16),
      cloth,
    );
    torso.position.set(0, 1.18, 0);
    scene.add(torso);
    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.15, 12), skin);
    neck.position.set(0, 1.7, 0);
    scene.add(neck);

    // Arms — pivot at shoulder so we can rotate them
    const buildArm = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.42, 1.55, 0);

      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 0.5, 12),
        cloth,
      );
      upper.position.y = -0.25;
      pivot.add(upper);

      const elbow = new THREE.Group();
      elbow.position.y = -0.5;
      pivot.add(elbow);

      const fore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.45, 12),
        skin,
      );
      fore.position.y = -0.225;
      elbow.add(fore);

      const hand = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 16, 16),
        skin,
      );
      hand.position.y = -0.5;
      elbow.add(hand);

      scene.add(pivot);
      return { pivot, elbow, hand };
    };

    armsRef.current = {
      L: buildArm(-1),
      R: buildArm(1),
    };
    // Resting pose
    armsRef.current.L.pivot.rotation.z = -0.1;
    armsRef.current.R.pivot.rotation.z = 0.1;

    // Animation loop
    const clock = new THREE.Clock();
    const render = () => {
      const dt = clock.getDelta();
      tRef.current += dt;
      tickMotion(tRef.current);
      renderer.render(scene, cam);
      animRef.current = requestAnimationFrame(render);
    };
    render();

    const handleResize = () => {
      const w2 = mount.clientWidth;
      const h2 = mount.clientHeight;
      cam.aspect = w2 / h2;
      cam.updateProjectionMatrix();
      renderer.setSize(w2, h2);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  // Motion library
  const motionsRef = useRef({
    idle: (t, a) => {
      const sway = Math.sin(t * 1.2) * 0.04;
      a.L.pivot.rotation.z = -0.1 + sway;
      a.R.pivot.rotation.z = 0.1 - sway;
    },
    wave: (t, a) => {
      a.R.pivot.rotation.z = 1.2 + Math.sin(t * 6) * 0.4;
      a.R.pivot.rotation.x = -0.4;
      a.R.elbow.rotation.x = -0.6;
    },
    heart: (t, a) => {
      a.L.pivot.rotation.z = -0.7 - Math.sin(t * 3) * 0.05;
      a.R.pivot.rotation.z = 0.7 + Math.sin(t * 3) * 0.05;
      a.L.elbow.rotation.x = -1.4;
      a.R.elbow.rotation.x = -1.4;
    },
    chest: (t, a) => {
      a.R.pivot.rotation.z = 0.2;
      a.R.elbow.rotation.x = -1.6;
      a.R.pivot.rotation.x = Math.sin(t * 5) * 0.2;
    },
    open: (t, a) => {
      a.L.pivot.rotation.z = -0.6;
      a.R.pivot.rotation.z = 0.6;
      a.L.elbow.rotation.x = -1.2 + Math.sin(t * 2) * 0.3;
      a.R.elbow.rotation.x = -1.2 + Math.sin(t * 2 + 0.3) * 0.3;
    },
    point: (t, a) => {
      a.R.pivot.rotation.z = 1.2;
      a.R.elbow.rotation.x = -0.4;
      a.R.pivot.rotation.x = -0.5;
    },
  });

  const tickMotion = (t) => {
    const a = armsRef.current;
    if (!a.L) return;
    const queue = queueRef.current;
    if (queue.length === 0) {
      motionsRef.current.idle(t, a);
      return;
    }
    const cur = queue[0];
    const elapsed = t - cur.startedAt;
    if (elapsed > cur.duration) {
      queue.shift();
      if (queue.length) queue[0].startedAt = t;
      else setPlaying(false);
      return;
    }
    (motionsRef.current[cur.id] || motionsRef.current.idle)(t, a);
  };

  const motionForWord = (w) => {
    const k = w.toLowerCase().replace(/[^a-záéíóúñ]/gi, "");
    if (/(hola|adios|saludo|hello|bye)/.test(k)) return "wave";
    if (/(amor|querer|love|corazón)/.test(k)) return "heart";
    if (/(sí|si|no|yes|claro)/.test(k)) return "chest";
    if (/(ayuda|favor|please|help|abierto)/.test(k)) return "open";
    if (/(yo|tú|tu|allí|alli|este|ese)/.test(k)) return "point";
    return "open";
  };

  const enqueue = (steps) => {
    const list = (steps || []).slice(0, 8).map((s) => ({
      id: motionForWord(s.word || ""),
      word: s.word,
      duration: 1.6,
      startedAt: 0,
    }));
    if (!list.length) return;
    list[0].startedAt = tRef.current;
    queueRef.current = list;
    setPlaying(true);
  };

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await textToSign(text.trim(), "auto");
      setResult(res);
      enqueue(res.steps);
    } catch (e) {
      toast.error("Error", { description: e?.response?.data?.detail || e?.message });
    } finally {
      setBusy(false);
    }
  };

  const stop = () => {
    queueRef.current = [];
    setPlaying(false);
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-start gap-3 mb-6">
        <span className="w-10 h-10 rounded-md bg-[#002FA7] text-white flex items-center justify-center shrink-0">
          <User className="w-5 h-5" />
        </span>
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold">
            Avatar 3D
          </h1>
          <p className="text-slate-600 dark:text-slate-300 mt-1">
            Escribe un texto y mira al avatar reproducir los signos.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div
            ref={mountRef}
            data-testid="avatar-canvas"
            className="aspect-video w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100"
          />
          {playing && queueRef.current[0] && (
            <div className="mt-3 text-center">
              <Badge className="bg-[#002FA7] text-white border-0 text-base px-4 py-1.5">
                Signando: <strong className="ml-1.5">{queueRef.current[0].word}</strong>
              </Badge>
            </div>
          )}
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
            className="border-slate-300 mb-3"
          />
          <div className="flex gap-2">
            <Button
              data-testid="avatar-play"
              onClick={handleGenerate}
              disabled={busy || !text.trim()}
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
              <Button onClick={stop} variant="outline" className="h-11">
                <Square className="w-4 h-4" />
              </Button>
            )}
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
                {result.steps?.length} signos en cola
              </p>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-500">
              <strong>Nota:</strong> el avatar usa animaciones simbólicas
              estilizadas (saludar, corazón, abrir manos, señalar). No reemplaza
              a un signante humano — sirve como ayuda visual de apoyo.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
