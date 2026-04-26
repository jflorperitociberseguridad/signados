/**
 * avatarPoses — pose dictionary + interpolation system for the avatar rig.
 *
 * Each pose is a flat object of joint paths → target Euler rotations
 * or position offsets. The interpolator slerps between the current
 * pose and the next one over `transitionMs`, holds for `holdMs`,
 * then transitions to the following pose.
 *
 * Joint paths use dot notation, e.g. "R.shoulder.rotation.x"
 * or fingers: "R.hand.fingers.index.knuckle.rotation.x"
 */

const FIST = {
  thumb: { knuckle: { x: -0.6, z: 0.4 }, mid: { x: -0.7 }, tip: { x: -0.5 } },
  index: { knuckle: { x: -1.5 }, mid: { x: -1.5 }, tip: { x: -1.2 } },
  middle: { knuckle: { x: -1.5 }, mid: { x: -1.5 }, tip: { x: -1.2 } },
  ring: { knuckle: { x: -1.5 }, mid: { x: -1.5 }, tip: { x: -1.2 } },
  pinky: { knuckle: { x: -1.5 }, mid: { x: -1.5 }, tip: { x: -1.2 } },
};

const OPEN = {
  thumb: { knuckle: { x: -0.1, z: 0.6 }, mid: { x: 0 }, tip: { x: 0 } },
  index: { knuckle: { x: -0.05 }, mid: { x: 0 }, tip: { x: 0 } },
  middle: { knuckle: { x: -0.05 }, mid: { x: 0 }, tip: { x: 0 } },
  ring: { knuckle: { x: -0.05 }, mid: { x: 0 }, tip: { x: 0 } },
  pinky: { knuckle: { x: -0.05 }, mid: { x: 0 }, tip: { x: 0 } },
};

const POINT = {
  thumb: { knuckle: { x: -0.6, z: 0.4 }, mid: { x: -0.5 }, tip: { x: -0.5 } },
  index: { knuckle: { x: -0.05 }, mid: { x: 0 }, tip: { x: 0 } },
  middle: { knuckle: { x: -1.5 }, mid: { x: -1.5 }, tip: { x: -1.2 } },
  ring: { knuckle: { x: -1.5 }, mid: { x: -1.5 }, tip: { x: -1.2 } },
  pinky: { knuckle: { x: -1.5 }, mid: { x: -1.5 }, tip: { x: -1.2 } },
};

const ILY = {
  // I-Love-You: thumb, index, pinky extended; middle/ring folded
  thumb: { knuckle: { x: -0.3, z: 0.7 }, mid: { x: -0.2 }, tip: { x: 0 } },
  index: { knuckle: { x: -0.05 }, mid: { x: 0 }, tip: { x: 0 } },
  middle: { knuckle: { x: -1.5 }, mid: { x: -1.5 }, tip: { x: -1.2 } },
  ring: { knuckle: { x: -1.5 }, mid: { x: -1.5 }, tip: { x: -1.2 } },
  pinky: { knuckle: { x: -0.05 }, mid: { x: 0 }, tip: { x: 0 } },
};

const PINCH = {
  // Like "ok"/"comer": thumb meets index, others curled
  thumb: { knuckle: { x: -0.7, z: 1.0 }, mid: { x: -0.4 }, tip: { x: -0.3 } },
  index: { knuckle: { x: -0.9 }, mid: { x: -0.6 }, tip: { x: -0.4 } },
  middle: { knuckle: { x: -1.0 }, mid: { x: -1.0 }, tip: { x: -0.8 } },
  ring: { knuckle: { x: -1.2 }, mid: { x: -1.2 }, tip: { x: -1.0 } },
  pinky: { knuckle: { x: -1.3 }, mid: { x: -1.3 }, tip: { x: -1.0 } },
};

const FLAT = OPEN; // alias — open palm flat

// Helper to build a side-aware pose
const armRest = (side) => ({
  shoulder: { rot: { x: 0, y: 0, z: side * 0.18 } },
  elbow: { rot: { x: -0.05, y: 0, z: 0 } },
  wrist: { rot: { x: 0, y: 0, z: 0 } },
  fingers: OPEN,
});

// Pose: each entry can override left and/or right arm + face
const POSES = {
  idle: {
    L: armRest(-1),
    R: armRest(1),
    head: { rot: { x: 0, y: 0, z: 0 } },
    brow: { y: 0 },
    mouth: { open: 0, smile: 0.2 },
    chest: { rot: { x: 0 } },
  },

  // ---- Saludos / despedidas ----
  hola: {
    R: {
      shoulder: { rot: { x: -0.1, y: -0.2, z: 1.7 } }, // raised up
      elbow: { rot: { x: -0.4, y: 0, z: 0 } },
      wrist: { rot: { x: 0, y: 0, z: 0 } },
      fingers: OPEN,
    },
    head: { rot: { x: 0.05, y: 0.0, z: 0 } },
    brow: { y: 0.02 },
    mouth: { open: 0.5, smile: 0.5 },
  },
  adios: {
    R: {
      shoulder: { rot: { x: -0.2, y: -0.1, z: 1.55 } },
      elbow: { rot: { x: -0.3, y: 0, z: 0 } },
      wrist: { rot: { x: 0, y: 0, z: 0.6 } }, // tilt for waving
      fingers: OPEN,
    },
    head: { rot: { x: 0, y: 0.05, z: 0 } },
    brow: { y: 0.01 },
    mouth: { open: 0.3, smile: 0.4 },
  },

  // ---- Afirmación / negación ----
  si: {
    R: armRest(1),
    head: { rot: { x: 0.35, y: 0, z: 0 } },
    brow: { y: 0.02 },
    mouth: { open: 0.2, smile: 0.3 },
  },
  no: {
    R: {
      shoulder: { rot: { x: -0.1, y: -0.3, z: 1.4 } },
      elbow: { rot: { x: -0.6, y: 0, z: 0 } },
      wrist: { rot: { x: 0, y: 0, z: 0 } },
      fingers: POINT,
    },
    head: { rot: { x: 0, y: 0.45, z: 0 } },
    brow: { y: -0.01 },
    mouth: { open: 0.15, smile: -0.1 },
  },

  // ---- Cortesía ----
  porfavor: {
    L: {
      shoulder: { rot: { x: -0.3, y: 0.2, z: -1.1 } },
      elbow: { rot: { x: -1.1, y: 0, z: 0 } },
      wrist: { rot: { x: -0.3, y: 0, z: 0 } },
      fingers: FLAT,
    },
    R: {
      shoulder: { rot: { x: -0.3, y: -0.2, z: 1.1 } },
      elbow: { rot: { x: -1.1, y: 0, z: 0 } },
      wrist: { rot: { x: -0.3, y: 0, z: 0 } },
      fingers: FLAT,
    },
    head: { rot: { x: 0.1, y: 0, z: 0 } },
    brow: { y: 0.025 },
    mouth: { open: 0.25, smile: 0.3 },
  },
  gracias: {
    R: {
      shoulder: { rot: { x: -0.4, y: -0.05, z: 0.9 } },
      elbow: { rot: { x: -1.4, y: 0, z: 0 } },
      wrist: { rot: { x: -0.2, y: 0, z: 0 } },
      fingers: FLAT,
    },
    head: { rot: { x: 0.15, y: 0, z: 0 } },
    brow: { y: 0.02 },
    mouth: { open: 0.35, smile: 0.45 },
  },

  // ---- Emocional ----
  amor: {
    L: {
      shoulder: { rot: { x: -0.5, y: 0.2, z: -0.7 } },
      elbow: { rot: { x: -1.6, y: 0, z: 0 } },
      wrist: { rot: { x: 0, y: 0, z: 0 } },
      fingers: ILY,
    },
    R: {
      shoulder: { rot: { x: -0.5, y: -0.2, z: 0.7 } },
      elbow: { rot: { x: -1.6, y: 0, z: 0 } },
      wrist: { rot: { x: 0, y: 0, z: 0 } },
      fingers: ILY,
    },
    head: { rot: { x: 0.1, y: 0, z: 0 } },
    brow: { y: 0.02 },
    mouth: { open: 0.25, smile: 0.7 },
  },

  // ---- Pronombres ----
  yo: {
    R: {
      shoulder: { rot: { x: -0.6, y: -0.4, z: 0.4 } },
      elbow: { rot: { x: -1.7, y: 0, z: 0 } },
      wrist: { rot: { x: -0.2, y: 0, z: 0 } },
      fingers: POINT,
    },
    head: { rot: { x: 0.05, y: 0, z: 0 } },
    brow: { y: 0 },
    mouth: { open: 0.2, smile: 0.1 },
  },
  tu: {
    R: {
      shoulder: { rot: { x: -0.6, y: 0.05, z: 0.9 } },
      elbow: { rot: { x: -0.4, y: 0, z: 0 } },
      wrist: { rot: { x: 0, y: 0, z: 0 } },
      fingers: POINT,
    },
    head: { rot: { x: 0, y: 0, z: 0 } },
    brow: { y: 0 },
    mouth: { open: 0.15, smile: 0.1 },
  },

  // ---- Acciones cotidianas ----
  comer: {
    R: {
      shoulder: { rot: { x: -0.7, y: -0.05, z: 0.6 } },
      elbow: { rot: { x: -1.9, y: 0, z: 0 } },
      wrist: { rot: { x: -0.3, y: 0, z: 0 } },
      fingers: PINCH,
    },
    head: { rot: { x: 0.05, y: 0, z: 0 } },
    brow: { y: 0 },
    mouth: { open: 0.6, smile: 0.1 },
  },
  beber: {
    R: {
      shoulder: { rot: { x: -1.0, y: -0.05, z: 0.5 } },
      elbow: { rot: { x: -2.0, y: 0, z: 0 } },
      wrist: { rot: { x: -0.5, y: 0, z: 0 } },
      fingers: {
        thumb: { knuckle: { x: -0.8, z: 0.7 } },
        index: { knuckle: { x: -0.3 } },
        middle: { knuckle: { x: -0.3 } },
        ring: { knuckle: { x: -0.5 } },
        pinky: { knuckle: { x: -0.7 } },
      },
    },
    head: { rot: { x: -0.15, y: 0, z: 0 } },
    brow: { y: 0 },
    mouth: { open: 0.4, smile: 0 },
  },
  casa: {
    L: {
      shoulder: { rot: { x: -0.4, y: 0.1, z: -0.4 } },
      elbow: { rot: { x: -1.8, y: 0, z: 0 } },
      wrist: { rot: { x: -0.2, y: 0, z: 0 } },
      fingers: FLAT,
    },
    R: {
      shoulder: { rot: { x: -0.4, y: -0.1, z: 0.4 } },
      elbow: { rot: { x: -1.8, y: 0, z: 0 } },
      wrist: { rot: { x: -0.2, y: 0, z: 0 } },
      fingers: FLAT,
    },
    head: { rot: { x: 0.05, y: 0, z: 0 } },
    brow: { y: 0 },
    mouth: { open: 0.2, smile: 0.2 },
  },
  pensar: {
    R: {
      shoulder: { rot: { x: -0.3, y: -0.3, z: 1.2 } },
      elbow: { rot: { x: -1.8, y: 0, z: 0 } },
      wrist: { rot: { x: 0, y: 0, z: 0 } },
      fingers: POINT,
    },
    head: { rot: { x: 0.1, y: 0.15, z: 0 } },
    brow: { y: -0.02 },
    mouth: { open: 0.05, smile: 0 },
  },
  bien: {
    R: {
      shoulder: { rot: { x: -0.2, y: -0.05, z: 0.7 } },
      elbow: { rot: { x: -1.8, y: 0, z: 0 } },
      wrist: { rot: { x: 0, y: 0, z: 1.3 } }, // thumbs-up tilt
      fingers: {
        thumb: { knuckle: { x: 0, z: 0.4 }, mid: { x: 0 }, tip: { x: 0 } },
        index: { knuckle: { x: -1.5 }, mid: { x: -1.5 }, tip: { x: -1.2 } },
        middle: { knuckle: { x: -1.5 }, mid: { x: -1.5 }, tip: { x: -1.2 } },
        ring: { knuckle: { x: -1.5 }, mid: { x: -1.5 }, tip: { x: -1.2 } },
        pinky: { knuckle: { x: -1.5 }, mid: { x: -1.5 }, tip: { x: -1.2 } },
      },
    },
    head: { rot: { x: 0.05, y: 0, z: 0 } },
    brow: { y: 0.02 },
    mouth: { open: 0.3, smile: 0.5 },
  },
  mal: {
    R: {
      shoulder: { rot: { x: -0.2, y: -0.05, z: 0.7 } },
      elbow: { rot: { x: -1.8, y: 0, z: 0 } },
      wrist: { rot: { x: 0, y: Math.PI, z: 1.3 } }, // thumbs-down tilt
      fingers: {
        thumb: { knuckle: { x: 0, z: 0.4 }, mid: { x: 0 }, tip: { x: 0 } },
        index: { knuckle: { x: -1.5 }, mid: { x: -1.5 }, tip: { x: -1.2 } },
        middle: { knuckle: { x: -1.5 }, mid: { x: -1.5 }, tip: { x: -1.2 } },
        ring: { knuckle: { x: -1.5 }, mid: { x: -1.5 }, tip: { x: -1.2 } },
        pinky: { knuckle: { x: -1.5 }, mid: { x: -1.5 }, tip: { x: -1.2 } },
      },
    },
    head: { rot: { x: -0.05, y: 0, z: 0 } },
    brow: { y: -0.025 },
    mouth: { open: 0.15, smile: -0.2 },
  },
  ayuda: {
    L: {
      shoulder: { rot: { x: -0.4, y: 0.0, z: -0.5 } },
      elbow: { rot: { x: -1.5, y: 0, z: 0 } },
      wrist: { rot: { x: 0, y: 0, z: 0 } },
      fingers: FIST,
    },
    R: {
      shoulder: { rot: { x: -0.4, y: 0.0, z: 0.5 } },
      elbow: { rot: { x: -1.5, y: 0, z: 0 } },
      wrist: { rot: { x: 0, y: 0, z: 0 } },
      fingers: FLAT,
    },
    head: { rot: { x: 0.05, y: 0, z: 0 } },
    brow: { y: 0.03 },
    mouth: { open: 0.3, smile: 0.1 },
  },
};

// Map a Spanish/English word to a pose key
export function poseForWord(word) {
  const k = (word || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/(hola|hello|hi|saludo|buenos)/.test(k)) return "hola";
  if (/(adios|chao|bye|hasta|despedida)/.test(k)) return "adios";
  if (/(amor|querer|love|corazon|carino)/.test(k)) return "amor";
  if (/(gracias|thanks|thank)/.test(k)) return "gracias";
  if (/(porfavor|por\sfavor|please|favor)/.test(k)) return "porfavor";
  if (/^(si|yes|claro|cierto)$/.test(k)) return "si";
  if (/^(no|nunca|jamas)$/.test(k)) return "no";
  if (/^(yo|i|me|mi)$/.test(k)) return "yo";
  if (/^(tu|tú|usted|you)$/.test(k)) return "tu";
  if (/(comer|comida|food|eat|hambre)/.test(k)) return "comer";
  if (/(beber|agua|drink|sed|bebida)/.test(k)) return "beber";
  if (/(casa|hogar|home|house)/.test(k)) return "casa";
  if (/(pensar|pensa|pienso|think|idea)/.test(k)) return "pensar";
  if (/(bien|good|genial|excelente|ok)/.test(k)) return "bien";
  if (/(mal|malo|bad|terrible|peor)/.test(k)) return "mal";
  if (/(ayuda|help|favor|auxilio)/.test(k)) return "ayuda";
  // fallback — open palm gesture
  return "porfavor";
}

export function listPoseKeys() {
  return Object.keys(POSES);
}

/**
 * Resolve a pose key + side into a flat list of joint setters:
 *   [{ obj: <Group>, prop: "rotation.x" | "scale.y" | "userData.smile",
 *      target: <number> }, ...]
 *
 * Skipped values default to the joint's resting state from `idle`.
 */
function flattenPose(pose, bones, fallback) {
  const setters = [];

  const handleArm = (sideKey) => {
    const arm = bones[sideKey];
    if (!arm) return;
    const armPose = pose[sideKey] || fallback[sideKey] || {};
    if (armPose.shoulder?.rot) {
      const r = armPose.shoulder.rot;
      ["x", "y", "z"].forEach((ax) => {
        if (r[ax] != null) setters.push({ obj: arm.shoulder.rotation, prop: ax, target: r[ax] });
      });
    }
    if (armPose.elbow?.rot) {
      const r = armPose.elbow.rot;
      ["x", "y", "z"].forEach((ax) => {
        if (r[ax] != null) setters.push({ obj: arm.elbow.rotation, prop: ax, target: r[ax] });
      });
    }
    if (armPose.wrist?.rot) {
      const r = armPose.wrist.rot;
      ["x", "y", "z"].forEach((ax) => {
        if (r[ax] != null) setters.push({ obj: arm.wrist.rotation, prop: ax, target: r[ax] });
      });
    }
    const fingers = armPose.fingers || fallback[sideKey]?.fingers || {};
    Object.entries(fingers).forEach(([fname, fconf]) => {
      const finger = arm.hand.fingers[fname];
      if (!finger) return;
      ["knuckle", "mid", "tip"].forEach((seg) => {
        const r = fconf[seg];
        if (!r) return;
        ["x", "y", "z"].forEach((ax) => {
          if (r[ax] != null) {
            setters.push({ obj: finger[seg].rotation, prop: ax, target: r[ax] });
          }
        });
      });
    });
  };

  handleArm("L");
  handleArm("R");

  // Head
  const headRot = pose.head?.rot || fallback.head?.rot || {};
  ["x", "y", "z"].forEach((ax) => {
    if (headRot[ax] != null) setters.push({ obj: bones.head.rotation, prop: ax, target: headRot[ax] });
  });

  // Eyebrow lift (move both brows together via Y position offset)
  const browY = pose.brow?.y;
  if (browY != null) {
    setters.push({ obj: bones.browL.position, prop: "y", target: 0.13 + browY });
    setters.push({ obj: bones.browR.position, prop: "y", target: 0.13 + browY });
  }

  // Mouth — open via scale.y, smile via scale.x
  const mouth = pose.mouth || fallback.mouth || {};
  if (mouth.open != null) {
    setters.push({ obj: bones.mouth.scale, prop: "y", target: 0.18 + mouth.open * 0.7 });
  }
  if (mouth.smile != null) {
    // smile: rotate mouth up at corners by tilting Z slightly
    setters.push({ obj: bones.mouth.rotation, prop: "z", target: 0 });
    setters.push({ obj: bones.mouth.scale, prop: "x", target: 1.1 + mouth.smile * 0.2 });
  }

  // Chest rotation
  const chestRot = pose.chest?.rot || {};
  if (chestRot.x != null) {
    setters.push({ obj: bones.chest.rotation, prop: "x", target: chestRot.x });
  }

  return setters;
}

/**
 * PoseAnimator — drives the rig between poses with smooth lerping,
 * idle breathing, and random blinks.
 */
export class PoseAnimator {
  constructor(rigBones) {
    this.bones = rigBones;
    this.queue = []; // [{ poseKey, word, hold, transition }]
    this.current = "idle";
    this.next = null;
    this.transitionTime = 0;
    this.transitionDuration = 0.5;
    this.holdTime = 0;
    this.holdDuration = 0.8;
    this.state = "hold"; // "hold" | "transition"
    this.blinkTimer = 2 + Math.random() * 3;
    this.blinkPhase = 0;
    this.speed = 1.0;
    this.onWord = null;
  }

  setSpeed(s) {
    this.speed = Math.max(0.25, Math.min(3, s));
  }

  setQueue(seq) {
    this.queue = seq.map((s) => ({
      poseKey: poseForWord(s.word || s),
      word: s.word || s,
      hold: 0.7,
      transition: 0.45,
    }));
    if (this.queue.length) {
      this.next = this.queue.shift();
      this.state = "transition";
      this.transitionTime = 0;
      this.transitionDuration = this.next.transition;
    }
  }

  clear() {
    this.queue = [];
    this.next = { poseKey: "idle", word: "", hold: 0, transition: 0.4 };
    this.state = "transition";
    this.transitionTime = 0;
    this.transitionDuration = 0.4;
  }

  /** Current target poses to lerp between. */
  _resolveSetters() {
    // We always lerp from the rig's CURRENT values (read from bones)
    // toward the target pose's setters.
    const targetPose = POSES[this.next ? this.next.poseKey : this.current] || POSES.idle;
    return flattenPose(targetPose, this.bones, POSES.idle);
  }

  step(dt) {
    const t = dt * this.speed;

    // --- Pose transition + hold loop ---
    if (this.state === "transition" && this.next) {
      this.transitionTime += t;
      const k = Math.min(1, this.transitionTime / Math.max(0.001, this.transitionDuration));
      const ease = 0.5 - 0.5 * Math.cos(Math.PI * k); // smoothstep
      const setters = this._resolveSetters();
      for (const s of setters) {
        const cur = s.obj[s.prop];
        s.obj[s.prop] = cur + (s.target - cur) * ease * 0.35;
      }
      if (k >= 1) {
        this.current = this.next.poseKey;
        this.holdTime = 0;
        this.holdDuration = this.next.hold;
        if (this.onWord) this.onWord(this.next.word, this.next.poseKey);
        this.state = "hold";
      }
    } else if (this.state === "hold") {
      this.holdTime += t;
      // Subtle micro-motion during the hold
      const setters = this._resolveSetters();
      for (const s of setters) {
        const cur = s.obj[s.prop];
        s.obj[s.prop] = cur + (s.target - cur) * 0.12;
      }
      if (this.holdTime >= this.holdDuration) {
        if (this.queue.length) {
          this.next = this.queue.shift();
          this.state = "transition";
          this.transitionTime = 0;
          this.transitionDuration = this.next.transition;
        } else if (this.current !== "idle") {
          // return to idle after the queue empties
          this.next = { poseKey: "idle", word: "", hold: 0, transition: 0.6 };
          this.state = "transition";
          this.transitionTime = 0;
          this.transitionDuration = 0.6;
        }
      }
    }

    // --- Idle breathing on chest + slight body sway ---
    const breathe = Math.sin(performance.now() * 0.0014) * 0.012;
    if (this.bones.chest) this.bones.chest.scale.y = 1.0 + breathe;
    if (this.bones.spine) this.bones.spine.rotation.y = Math.sin(performance.now() * 0.0008) * 0.04;

    // --- Blinks ---
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0 && this.blinkPhase === 0) {
      this.blinkPhase = 1;
    }
    if (this.blinkPhase > 0) {
      // Quick close / open over ~150ms
      const lid = (1 - Math.abs(this.blinkPhase - 1)) * 1.2;
      const sY = Math.max(0.001, 1.2 - lid);
      if (this.bones.eyeL?.lid) this.bones.eyeL.lid.scale.y = sY;
      if (this.bones.eyeR?.lid) this.bones.eyeR.lid.scale.y = sY;
      this.blinkPhase += dt * 8;
      if (this.blinkPhase >= 2) {
        this.blinkPhase = 0;
        this.blinkTimer = 2 + Math.random() * 4;
        if (this.bones.eyeL?.lid) this.bones.eyeL.lid.scale.y = 0.001;
        if (this.bones.eyeR?.lid) this.bones.eyeR.lid.scale.y = 0.001;
      }
    }
  }
}

export const POSE_KEYS = Object.keys(POSES);
