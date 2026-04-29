/**
 * Realistic GLB-based avatar — loads Xbot.glb (Mixamo rig) and exposes a
 * pose system that drives the skeleton into sign-language gestures.
 *
 * Mixamo bone naming conventions used:
 *   mixamorigHips, mixamorigSpine, mixamorigSpine1, mixamorigSpine2,
 *   mixamorigNeck, mixamorigHead,
 *   mixamorigLeftShoulder, mixamorigLeftArm, mixamorigLeftForeArm,
 *   mixamorigLeftHand, mixamorigLeftHand{Thumb,Index,Middle,Ring,Pinky}{1..3}
 *   (and mirror for Right)
 *
 * Mixamo rest pose: standing T-pose → Y-up character, arms aligned with X.
 *
 * Coordinate notes:
 *   - For LeftArm bone, rotation.z controls arm-up/down (negative -> arm up).
 *     We use the same mental model on both sides; the loader auto-mirrors via
 *     bone "Left"/"Right" suffix.
 *   - Most "fold finger" rotations live on rotation.x of each finger segment.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const GLB_URL = "/models/avatar.glb";

// Common pose primitives for fingers (radians). x folds, z is "thumb spread".
const F_FIST = { x: -1.5 };
const F_OPEN = { x: 0 };
const F_HALF = { x: -0.7 };
const F_POINT_OPEN = { x: 0 };

const finger = (open) => ({ k: open, m: open, t: open });

const MAKE_FIST = {
  thumb: { k: { x: -0.5, z: 0.6 }, m: F_HALF, t: F_HALF },
  index: finger(F_FIST),
  middle: finger(F_FIST),
  ring: finger(F_FIST),
  pinky: finger(F_FIST),
};
const MAKE_OPEN = {
  thumb: { k: { x: -0.1, z: 0.7 }, m: F_OPEN, t: F_OPEN },
  index: finger(F_OPEN),
  middle: finger(F_OPEN),
  ring: finger(F_OPEN),
  pinky: finger(F_OPEN),
};
const MAKE_POINT = {
  thumb: { k: { x: -0.5, z: 0.5 }, m: F_HALF, t: F_HALF },
  index: finger(F_POINT_OPEN),
  middle: finger(F_FIST),
  ring: finger(F_FIST),
  pinky: finger(F_FIST),
};
const MAKE_ILY = {
  thumb: { k: { x: -0.2, z: 0.7 }, m: F_OPEN, t: F_OPEN },
  index: finger(F_OPEN),
  middle: finger(F_FIST),
  ring: finger(F_FIST),
  pinky: finger(F_OPEN),
};
const MAKE_PINCH = {
  thumb: { k: { x: -0.7, z: 1.0 }, m: F_HALF, t: F_HALF },
  index: finger({ x: -0.9 }),
  middle: finger(F_FIST),
  ring: finger(F_FIST),
  pinky: finger(F_FIST),
};
const MAKE_THUMBS_UP = {
  thumb: { k: { x: 0, z: 0.4 }, m: F_OPEN, t: F_OPEN },
  index: finger(F_FIST),
  middle: finger(F_FIST),
  ring: finger(F_FIST),
  pinky: finger(F_FIST),
};

/**
 * Mixamo Xbot bone-rotation conventions (calibrated empirically):
 *  - Both arms hang down at the side when the upper-arm bone has
 *    rotation.z ≈ +1.45 (roughly +π/2), regardless of side.
 *  - Positive arm.z values KEEP the arm at the side; the FOREARM bone is
 *    the one that bends the elbow via rotation.x.
 *  - To raise an arm overhead from idle, decrease arm.z (e.g. -0.1
 *    points it straight up; 0 keeps it horizontal "T-pose").
 *  - rotation.x on the arm bone bends the shoulder forward/back.
 *  - rotation.y on the arm bone twists the upper arm.
 *
 *  Pose values below are ABSOLUTE local rotations (radians). They are
 *  applied directly to the bone, not added to the rest pose.
 */
const ARM_REST = (_side) => ({
  shoulder: { x: 0, y: 0, z: 0 },
  arm: { x: 0, y: 0, z: 1.45 }, // arm down at side
  forearm: { x: -0.1, y: 0, z: 0 },
  hand: { x: 0, y: 0, z: 0 },
  fingers: MAKE_OPEN,
});

const POSES_GLB = {
  idle: {
    L: ARM_REST(-1),
    R: ARM_REST(1),
    head: { x: 0, y: 0, z: 0 },
    spine: { x: 0, y: 0, z: 0 },
  },
  hola: {
    R: {
      shoulder: { x: 0, y: 0, z: 0 },
      // Mixamo RightArm: positive Z lifts arm up (toward overhead from T-pose)
      arm: { x: -0.4, y: 0, z: 1.6 },
      forearm: { x: -0.5, y: 0, z: -0.2 },
      hand: { x: 0, y: 0, z: 0 },
      fingers: MAKE_OPEN,
    },
    L: ARM_REST(-1),
    head: { x: 0.05, y: -0.15, z: 0.05 },
    spine: { x: 0, y: 0, z: 0 },
  },
  adios: {
    R: {
      arm: { x: -0.3, y: 0, z: 1.5 },
      forearm: { x: -0.4, y: 0, z: -0.2 },
      hand: { x: 0, y: 0, z: 0.5 },
      fingers: MAKE_OPEN,
    },
    L: ARM_REST(-1),
    head: { x: 0, y: 0.05, z: 0 },
    spine: {},
  },
  si: {
    R: ARM_REST(1),
    L: ARM_REST(-1),
    head: { x: 0.4, y: 0, z: 0 },
    spine: {},
  },
  no: {
    R: {
      arm: { x: -0.5, y: 0, z: 0.7 },
      forearm: { x: -1.4, y: 0, z: 0 },
      hand: { x: 0, y: 0, z: 0 },
      fingers: MAKE_POINT,
    },
    L: ARM_REST(-1),
    head: { x: 0, y: 0.45, z: 0 },
    spine: {},
  },
  porfavor: {
    L: {
      arm: { x: -1.0, y: 0, z: -0.8 },
      forearm: { x: -1.0, y: 0, z: 0 },
      hand: { x: -0.3, y: 0, z: 0 },
      fingers: MAKE_OPEN,
    },
    R: {
      arm: { x: -1.0, y: 0, z: 0.8 },
      forearm: { x: -1.0, y: 0, z: 0 },
      hand: { x: -0.3, y: 0, z: 0 },
      fingers: MAKE_OPEN,
    },
    head: { x: 0.1, y: 0, z: 0 },
    spine: {},
  },
  gracias: {
    R: {
      arm: { x: -1.0, y: 0, z: 0.7 },
      forearm: { x: -1.4, y: 0, z: 0 },
      hand: { x: -0.2, y: 0, z: 0 },
      fingers: MAKE_OPEN,
    },
    L: ARM_REST(-1),
    head: { x: 0.15, y: 0, z: 0 },
    spine: {},
  },
  amor: {
    L: {
      arm: { x: -1.2, y: 0, z: -0.7 },
      forearm: { x: -1.6, y: 0, z: 0 },
      hand: { x: 0, y: 0, z: 0 },
      fingers: MAKE_ILY,
    },
    R: {
      arm: { x: -1.2, y: 0, z: 0.7 },
      forearm: { x: -1.6, y: 0, z: 0 },
      hand: { x: 0, y: 0, z: 0 },
      fingers: MAKE_ILY,
    },
    head: { x: 0.05, y: 0, z: 0 },
    spine: {},
  },
  yo: {
    R: {
      arm: { x: -1.4, y: 0, z: 0.3 },
      forearm: { x: -1.7, y: 0, z: -0.4 },
      hand: { x: -0.2, y: 0, z: 0 },
      fingers: MAKE_POINT,
    },
    L: ARM_REST(-1),
    head: { x: 0.05, y: 0, z: 0 },
    spine: {},
  },
  tu: {
    R: {
      arm: { x: -1.4, y: 0, z: 0.6 },
      forearm: { x: -0.5, y: 0, z: 0 },
      hand: { x: 0, y: 0, z: 0 },
      fingers: MAKE_POINT,
    },
    L: ARM_REST(-1),
    head: { x: 0, y: 0, z: 0 },
    spine: {},
  },
  comer: {
    R: {
      arm: { x: -1.4, y: 0, z: 0.7 },
      forearm: { x: -1.9, y: 0, z: 0 },
      hand: { x: -0.3, y: 0, z: 0 },
      fingers: MAKE_PINCH,
    },
    L: ARM_REST(-1),
    head: { x: 0.1, y: 0, z: 0 },
    spine: {},
  },
  beber: {
    R: {
      arm: { x: -1.6, y: 0, z: 0.5 },
      forearm: { x: -2.0, y: 0, z: 0 },
      hand: { x: -0.5, y: 0, z: 0 },
      fingers: {
        thumb: { k: { x: -0.8, z: 0.7 }, m: F_HALF, t: F_HALF },
        index: finger({ x: -0.3 }),
        middle: finger({ x: -0.3 }),
        ring: finger({ x: -0.6 }),
        pinky: finger({ x: -0.8 }),
      },
    },
    L: ARM_REST(-1),
    head: { x: -0.15, y: 0, z: 0 },
    spine: {},
  },
  casa: {
    L: {
      arm: { x: -1.0, y: 0, z: -0.6 },
      forearm: { x: -1.7, y: 0, z: 0 },
      hand: { x: -0.2, y: 0, z: 0 },
      fingers: MAKE_OPEN,
    },
    R: {
      arm: { x: -1.0, y: 0, z: 0.6 },
      forearm: { x: -1.7, y: 0, z: 0 },
      hand: { x: -0.2, y: 0, z: 0 },
      fingers: MAKE_OPEN,
    },
    head: { x: 0.05, y: 0, z: 0 },
    spine: {},
  },
  pensar: {
    R: {
      arm: { x: -0.4, y: 0, z: 1.4 },
      forearm: { x: -1.8, y: 0, z: -0.3 },
      hand: { x: 0, y: 0, z: 0 },
      fingers: MAKE_POINT,
    },
    L: ARM_REST(-1),
    head: { x: 0.1, y: 0.15, z: 0 },
    spine: {},
  },
  bien: {
    R: {
      arm: { x: -0.7, y: 0, z: 0.7 },
      forearm: { x: -1.8, y: 0, z: 0 },
      hand: { x: 0, y: 0, z: 1.3 },
      fingers: MAKE_THUMBS_UP,
    },
    L: ARM_REST(-1),
    head: { x: 0.05, y: 0, z: 0 },
    spine: {},
  },
  mal: {
    R: {
      arm: { x: -0.7, y: 0, z: 0.7 },
      forearm: { x: -1.8, y: 0, z: 0 },
      hand: { x: 0, y: Math.PI, z: 1.3 },
      fingers: MAKE_THUMBS_UP,
    },
    L: ARM_REST(-1),
    head: { x: -0.05, y: 0, z: 0 },
    spine: {},
  },
  ayuda: {
    L: {
      arm: { x: -1.0, y: 0, z: -0.6 },
      forearm: { x: -1.5, y: 0, z: 0 },
      hand: { x: 0, y: 0, z: 0 },
      fingers: MAKE_FIST,
    },
    R: {
      arm: { x: -1.0, y: 0, z: 0.6 },
      forearm: { x: -1.5, y: 0, z: 0 },
      hand: { x: 0, y: 0, z: 0 },
      fingers: MAKE_OPEN,
    },
    head: { x: 0.05, y: 0, z: 0 },
    spine: {},
  },
};

const FINGER_NAMES = ["Thumb", "Index", "Middle", "Ring", "Pinky"];
const FINGER_KEYS = ["thumb", "index", "middle", "ring", "pinky"];

/**
 * Build a bone lookup from a mixamo skeleton.
 * Tolerates both prefixes "mixamorig" and bare names.
 */
function findBones(root) {
  const map = {};
  root.traverse((o) => {
    if (!o.isBone) return;
    const n = o.name.replace(/^mixamorig:?/i, "");
    map[n] = o;
  });

  const get = (n) => map[n] || null;

  const arm = (side) => {
    const SD = side === "L" ? "Left" : "Right";
    const fingers = {};
    FINGER_NAMES.forEach((fn, idx) => {
      fingers[FINGER_KEYS[idx]] = {
        k: get(`${SD}Hand${fn}1`),
        m: get(`${SD}Hand${fn}2`),
        t: get(`${SD}Hand${fn}3`),
      };
    });
    return {
      shoulder: get(`${SD}Shoulder`),
      arm: get(`${SD}Arm`),
      forearm: get(`${SD}ForeArm`),
      hand: get(`${SD}Hand`),
      fingers,
    };
  };

  return {
    hips: get("Hips"),
    spine: get("Spine") || get("Spine1"),
    spine2: get("Spine2"),
    neck: get("Neck"),
    head: get("Head"),
    L: arm("L"),
    R: arm("R"),
  };
}

/**
 * Capture each bone's rest pose so we can lerp targets relative to rest.
 */
function captureRest(bones) {
  const rest = {};
  const cap = (b) => (b ? { x: b.rotation.x, y: b.rotation.y, z: b.rotation.z } : null);

  const armRest = (a) => {
    if (!a) return null;
    const r = {
      shoulder: cap(a.shoulder),
      arm: cap(a.arm),
      forearm: cap(a.forearm),
      hand: cap(a.hand),
      fingers: {},
    };
    FINGER_KEYS.forEach((fk) => {
      const f = a.fingers[fk];
      if (!f) return;
      r.fingers[fk] = { k: cap(f.k), m: cap(f.m), t: cap(f.t) };
    });
    return r;
  };

  rest.head = cap(bones.head);
  rest.spine = cap(bones.spine);
  rest.L = armRest(bones.L);
  rest.R = armRest(bones.R);
  return rest;
}

/**
 * Resolve the target rotation list for a pose.
 * Each setter: { bone, axis, target }
 *
 * Pose values are interpreted as ABSOLUTE local rotations (radians).
 * The rest dictionary is captured but no longer added — making poses
 * device-rig-independent and predictable.
 */
function resolveSetters(pose, bones, _rest) {
  const setters = [];
  const push = (bone, axis, target) => {
    if (!bone || target == null) return;
    setters.push({ bone, axis, target });
  };

  const applyArm = (sideKey) => {
    const armPose = pose[sideKey];
    const a = bones[sideKey];
    if (!a) return;
    const partKeys = ["shoulder", "arm", "forearm", "hand"];
    partKeys.forEach((pk) => {
      const tgt = armPose?.[pk] || {};
      ["x", "y", "z"].forEach((ax) => {
        const v = tgt[ax];
        if (v != null) push(a[pk], ax, v);
      });
    });
    const fingers = armPose?.fingers || {};
    FINGER_KEYS.forEach((fk) => {
      const f = a.fingers[fk];
      const fp = fingers[fk] || {};
      ["k", "m", "t"].forEach((seg) => {
        const target = fp[seg] || {};
        ["x", "y", "z"].forEach((ax) => {
          const v = target[ax];
          if (v != null) push(f[seg], ax, v);
        });
      });
    });
  };

  applyArm("L");
  applyArm("R");

  if (pose.head && bones.head) {
    ["x", "y", "z"].forEach((ax) => {
      const v = pose.head[ax];
      if (v != null) push(bones.head, ax, v);
    });
  }
  if (pose.spine && bones.spine) {
    ["x", "y", "z"].forEach((ax) => {
      const v = pose.spine[ax];
      if (v != null) push(bones.spine, ax, v);
    });
  }
  return setters;
}

export class RealisticAvatar {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.root = null;
    this.bones = null;
    this.rest = null;
    this.queue = [];
    this.current = "idle";
    this.next = null;
    this.state = "hold";
    this.transitionTime = 0;
    this.transitionDuration = 0.5;
    this.holdTime = 0;
    this.holdDuration = 0.7;
    this.speed = 1.0;
    this.onWord = opts.onWord || null;
    this.loaded = false;
  }

  async load() {
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
      loader.load(
        GLB_URL,
        (gltf) => {
          const root = gltf.scene;
          root.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = false;
              if (o.material) {
                o.material.envMapIntensity = 0.7;
                if (o.material.metalness != null) o.material.metalness = Math.min(0.05, o.material.metalness);
                if (o.material.roughness != null) o.material.roughness = Math.max(0.7, o.material.roughness);
              }
            }
          });
          // Center on origin and scale to ~1.7 m tall
          const box = new THREE.Box3().setFromObject(root);
          const size = box.getSize(new THREE.Vector3());
          const targetH = 1.85;
          const s = targetH / Math.max(0.001, size.y);
          root.scale.setScalar(s);
          // Re-evaluate after scale
          const box2 = new THREE.Box3().setFromObject(root);
          root.position.y -= box2.min.y;

          this.scene.add(root);
          this.root = root;
          this.bones = findBones(root);
          this.rest = captureRest(this.bones);
          this.loaded = true;
          resolve(root);
        },
        undefined,
        (err) => reject(err),
      );
    });
  }

  dispose() {
    if (this.root) {
      this.scene.remove(this.root);
      this.root.traverse((o) => {
        if (o.isMesh) {
          o.geometry?.dispose();
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material?.dispose();
        }
      });
      this.root = null;
    }
  }

  setSpeed(s) {
    this.speed = Math.max(0.25, Math.min(3, s));
  }

  setQueue(words) {
    if (!this.loaded) return;
    this.queue = words.map((w) => ({
      poseKey: poseKeyForWord(w),
      word: w,
      hold: 0.7,
      transition: 0.5,
    }));
    if (this.queue.length) {
      this.next = this.queue.shift();
      this.state = "transition";
      this.transitionTime = 0;
      this.transitionDuration = this.next.transition;
    }
  }

  clear() {
    if (!this.loaded) return;
    this.queue = [];
    this.next = { poseKey: "idle", word: "", hold: 0, transition: 0.5 };
    this.state = "transition";
    this.transitionTime = 0;
    this.transitionDuration = 0.5;
  }

  step(dt) {
    if (!this.loaded || !this.bones) return;
    const t = dt * this.speed;
    const targetPose = POSES_GLB[this.next ? this.next.poseKey : this.current] || POSES_GLB.idle;
    const setters = resolveSetters(targetPose, this.bones, this.rest);

    if (this.state === "transition" && this.next) {
      this.transitionTime += t;
      const k = Math.min(1, this.transitionTime / Math.max(0.001, this.transitionDuration));
      const ease = 0.5 - 0.5 * Math.cos(Math.PI * k);
      for (const s of setters) {
        const cur = s.bone.rotation[s.axis];
        s.bone.rotation[s.axis] = cur + (s.target - cur) * ease * 0.45;
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
      for (const s of setters) {
        const cur = s.bone.rotation[s.axis];
        s.bone.rotation[s.axis] = cur + (s.target - cur) * 0.18;
      }
      if (this.holdTime >= this.holdDuration) {
        if (this.queue.length) {
          this.next = this.queue.shift();
          this.state = "transition";
          this.transitionTime = 0;
          this.transitionDuration = this.next.transition;
        } else if (this.current !== "idle") {
          this.next = { poseKey: "idle", word: "", hold: 0, transition: 0.6 };
          this.state = "transition";
          this.transitionTime = 0;
          this.transitionDuration = 0.6;
        }
      }
    }

    // Subtle idle motion on the spine for "alive"-ness
    if (this.bones.spine) {
      this.bones.spine.rotation.y =
        (this.rest.spine?.y || 0) + Math.sin(performance.now() * 0.0008) * 0.03;
    }
    if (this.bones.spine2) {
      this.bones.spine2.position.y =
        (this.bones.spine2.userData.restY ??=
          this.bones.spine2.position.y) + Math.sin(performance.now() * 0.0014) * 0.005;
    }
  }
}

export function poseKeyForWord(word) {
  const w = (word || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/(hola|hello|hi|saludo|buenos)/.test(w)) return "hola";
  if (/(adios|chao|bye|hasta|despedida)/.test(w)) return "adios";
  if (/(amor|querer|love|corazon|carino|quiero)/.test(w)) return "amor";
  if (/(gracias|thanks|thank)/.test(w)) return "gracias";
  if (/(porfavor|por\sfavor|please|favor)/.test(w)) return "porfavor";
  if (/^(si|yes|claro|cierto)$/.test(w)) return "si";
  if (/^(no|nunca|jamas)$/.test(w)) return "no";
  if (/^(yo|i|me|mi)$/.test(w)) return "yo";
  if (/^(tu|usted|you)$/.test(w)) return "tu";
  if (/(comer|comida|food|eat|hambre)/.test(w)) return "comer";
  if (/(beber|agua|drink|sed|bebida)/.test(w)) return "beber";
  if (/(casa|hogar|home|house)/.test(w)) return "casa";
  if (/(pensar|pensa|pienso|think|idea)/.test(w)) return "pensar";
  if (/(bien|good|genial|excelente|ok)/.test(w)) return "bien";
  if (/(mal|malo|bad|terrible|peor)/.test(w)) return "mal";
  if (/(ayuda|help|favor|auxilio)/.test(w)) return "ayuda";
  return "porfavor";
}

export const REALISTIC_POSE_KEYS = Object.keys(POSES_GLB);
