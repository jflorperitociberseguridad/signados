/**
 * useMediaPipe — runs Hand + Face + Pose landmark detection on a <video>
 * element entirely on the client (WASM/GPU). Provides:
 *  - latest landmarks (no network latency)
 *  - movement / "is-signing" signal based on landmark variance
 *  - a draw helper to render the skeleton on a canvas overlay
 */
import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  HandLandmarker,
  FaceLandmarker,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

let _vision = null;
async function loadVision() {
  if (!_vision) _vision = await FilesetResolver.forVisionTasks(WASM_URL);
  return _vision;
}

export function useMediaPipe(videoRef, { enabled = true, onMotion } = {}) {
  const handRef = useRef(null);
  const faceRef = useRef(null);
  const poseRef = useRef(null);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(0);
  const lastSampleRef = useRef([]);
  const movingFramesRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [landmarks, setLandmarks] = useState({
    hands: [],
    face: null,
    pose: null,
  });
  const [moving, setMoving] = useState(false);

  // load models once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const vision = await loadVision();
        if (cancelled) return;

        const [hand, face, pose] = await Promise.all([
          HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
            runningMode: "VIDEO",
            numHands: 2,
          }),
          FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
            runningMode: "VIDEO",
            outputFaceBlendshapes: false,
            numFaces: 1,
          }),
          PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
            runningMode: "VIDEO",
            numPoses: 1,
          }),
        ]);

        if (cancelled) {
          hand.close();
          face.close();
          pose.close();
          return;
        }
        handRef.current = hand;
        faceRef.current = face;
        poseRef.current = pose;
        setReady(true);
      } catch (e) {
        // model load failed (CDN block, GPU unavail) — silently degrade
        console.warn("MediaPipe load failed", e);
      }
    })();
    return () => {
      cancelled = true;
      try {
        handRef.current?.close();
        faceRef.current?.close();
        poseRef.current?.close();
      } catch {}
    };
  }, []);

  // detection loop
  useEffect(() => {
    if (!ready || !enabled) return;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.paused) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const t = performance.now();
      if (t - lastTimeRef.current < 50) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      lastTimeRef.current = t;

      let hRes, fRes, pRes;
      try {
        hRes = handRef.current?.detectForVideo(video, t);
      } catch {}
      try {
        fRes = faceRef.current?.detectForVideo(video, t);
      } catch {}
      try {
        pRes = poseRef.current?.detectForVideo(video, t);
      } catch {}

      const hands = hRes?.landmarks || [];
      const face = fRes?.faceLandmarks?.[0] || null;
      const pose = pRes?.landmarks?.[0] || null;
      setLandmarks({ hands, face, pose });

      // motion signal: average displacement of hand landmarks vs last sample
      const flat = hands.flat().map((p) => [p.x, p.y]);
      const prev = lastSampleRef.current;
      if (prev.length > 0 && flat.length === prev.length) {
        let total = 0;
        for (let i = 0; i < flat.length; i++) {
          const dx = flat[i][0] - prev[i][0];
          const dy = flat[i][1] - prev[i][1];
          total += Math.sqrt(dx * dx + dy * dy);
        }
        const avg = total / flat.length;
        const isMoving = avg > 0.01 && hands.length > 0;
        if (isMoving) movingFramesRef.current += 1;
        else movingFramesRef.current = Math.max(0, movingFramesRef.current - 1);
        const now = movingFramesRef.current >= 2;
        setMoving((m) => (m === now ? m : (onMotion?.(now), now)));
      }
      lastSampleRef.current = flat;

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [ready, enabled, videoRef, onMotion]);

  return { ready, landmarks, moving };
}

// Draw landmarks on an absolutely-positioned canvas matching the video size.
export function drawLandmarks(canvas, landmarks, { mirror = true, color = "#3B82F6" } = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!landmarks) return;

  ctx.save();
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }

  const drawPoints = (pts, r, fill) => {
    if (!pts) return;
    ctx.fillStyle = fill;
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, r, 0, 2 * Math.PI);
      ctx.fill();
    }
  };

  const drawConnections = (pts, conns, stroke, lw = 2) => {
    if (!pts) return;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    for (const [a, b] of conns) {
      const pa = pts[a];
      const pb = pts[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x * w, pa.y * h);
      ctx.lineTo(pb.x * w, pb.y * h);
      ctx.stroke();
    }
  };

  // Pose
  const POSE_CONN = [
    [11, 13], [13, 15],
    [12, 14], [14, 16],
    [11, 12], [11, 23], [12, 24], [23, 24],
  ];
  drawConnections(landmarks.pose, POSE_CONN, "rgba(16, 185, 129, 0.85)", 3);
  drawPoints(
    landmarks.pose ? landmarks.pose.slice(11, 25) : null,
    3,
    "#10b981",
  );

  // Face (only outline + eyes + lips for performance)
  if (landmarks.face) {
    const lipsIdx = [
      61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,
      308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78,
    ];
    ctx.fillStyle = "rgba(244, 114, 182, 0.9)";
    for (const i of lipsIdx) {
      const p = landmarks.face[i];
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 1.6, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  // Hands
  const HAND_CONN = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17],
  ];
  for (const handLm of landmarks.hands) {
    drawConnections(handLm, HAND_CONN, color, 2.5);
    drawPoints(handLm, 3, "#fbbf24");
  }

  ctx.restore();
}
