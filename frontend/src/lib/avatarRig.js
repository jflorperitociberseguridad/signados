/**
 * AvatarRig — anatomical, primitive-based humanoid skeleton built in Three.js.
 *
 * Bone layout (Group hierarchy, every joint is a Group with rotation pivots):
 *
 *   root
 *   ├─ pelvis
 *   │   └─ spine
 *   │       └─ chest
 *   │           ├─ neck → head → { eyeL, eyeR, browL, browR, mouth, hair }
 *   │           ├─ shoulderL → upperArmL → elbowL → forearmL → wristL → palmL
 *   │           │     └─ fingers[5] (thumb, index, middle, ring, pinky), each: knuckle → mid → tip
 *   │           └─ shoulderR → ... (mirror)
 *   └─ ground (soft contact-shadow plane)
 *
 * Every joint is exposed via `rig.bones` for the pose system.
 */
import * as THREE from "three";

const SKIN = 0xfde2c5;
const SKIN_DARK = 0xeac3a1;
const HAIR = 0x3b2c20;
const CLOTH = 0x002fa7;
const CLOTH_DARK = 0x001a64;
const LIPS = 0xc0392b;

function mat(color, roughness = 0.6, metalness = 0.0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/** Attach a Mesh as visual to a parent Group; returns the parent. */
function decorate(parent, geometry, material, position) {
  const mesh = new THREE.Mesh(geometry, material);
  if (position) mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function buildFinger({ length = 0.085, radius = 0.018, material }) {
  // Three segments: knuckle (proximal) → mid → tip
  const knuckle = new THREE.Group();
  const seg1 = length * 0.45;
  const seg2 = length * 0.32;
  const seg3 = length * 0.23;

  const k = decorate(
    knuckle,
    new THREE.CapsuleGeometry(radius, seg1, 4, 8),
    material,
    [0, -seg1 / 2, 0],
  );
  const mid = new THREE.Group();
  mid.position.y = -seg1;
  knuckle.add(mid);
  decorate(
    mid,
    new THREE.CapsuleGeometry(radius * 0.92, seg2, 4, 8),
    material,
    [0, -seg2 / 2, 0],
  );
  const tip = new THREE.Group();
  tip.position.y = -seg2;
  mid.add(tip);
  decorate(
    tip,
    new THREE.CapsuleGeometry(radius * 0.85, seg3, 4, 8),
    material,
    [0, -seg3 / 2, 0],
  );
  return { knuckle, mid, tip };
}

function buildHand(side) {
  const skinMat = mat(SKIN, 0.55);
  const wrist = new THREE.Group();

  // Palm (slightly flattened box-ish — use a scaled box for stylized look)
  const palm = new THREE.Group();
  decorate(
    palm,
    new THREE.BoxGeometry(0.16, 0.18, 0.06),
    skinMat,
    [0, -0.09, 0],
  );
  // Slight bevel via a smaller sphere on top of the palm
  decorate(
    palm,
    new THREE.SphereGeometry(0.08, 16, 12),
    skinMat,
    [0, -0.02, 0],
  );
  wrist.add(palm);

  // Fingers — 4 digits across the top of the palm, thumb on the side
  const fingers = {};
  const baseY = -0.18;
  const baseZ = 0.02;
  // Thumb (offset to the side, lower position, more rotation)
  const thumb = buildFinger({ length: 0.10, radius: 0.022, material: skinMat });
  thumb.knuckle.position.set(side * 0.085, baseY + 0.07, 0.01);
  thumb.knuckle.rotation.z = side * 1.0;
  thumb.knuckle.rotation.x = -0.4;
  palm.add(thumb.knuckle);
  fingers.thumb = thumb;

  // Index, middle, ring, pinky — fan across the top (-x .. +x for left side)
  const order = ["index", "middle", "ring", "pinky"];
  const lengths = [0.118, 0.128, 0.118, 0.098];
  const x0 = side * 0.06; // start near the thumb side
  for (let i = 0; i < 4; i++) {
    const f = buildFinger({ length: lengths[i], radius: 0.020, material: skinMat });
    f.knuckle.position.set(side * (0.06 - i * 0.04), baseY, baseZ);
    palm.add(f.knuckle);
    fingers[order[i]] = f;
    // tiny default tilt so the relaxed hand isn't flat
    f.knuckle.rotation.x = -0.05;
  }

  return { wrist, palm, fingers };
}

function buildArm(side) {
  const skinMat = mat(SKIN, 0.55);
  const clothMat = mat(CLOTH, 0.45);

  const shoulder = new THREE.Group();
  // Visual shoulder ball
  decorate(
    shoulder,
    new THREE.SphereGeometry(0.10, 16, 12),
    clothMat,
    [0, 0, 0],
  );

  // Upper arm — capsule going downward
  const upper = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.075, 0.42, 6, 12),
    clothMat,
  );
  upper.position.y = -0.26;
  upper.castShadow = true;
  shoulder.add(upper);

  // Elbow joint
  const elbow = new THREE.Group();
  elbow.position.y = -0.5;
  shoulder.add(elbow);

  // Forearm
  const fore = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.062, 0.36, 6, 12),
    skinMat,
  );
  fore.position.y = -0.22;
  fore.castShadow = true;
  elbow.add(fore);

  // Wrist joint + hand
  const wristGroup = new THREE.Group();
  wristGroup.position.y = -0.42;
  elbow.add(wristGroup);

  const hand = buildHand(side);
  wristGroup.add(hand.wrist);

  return { shoulder, elbow, wrist: wristGroup, hand };
}

function buildHead() {
  const skinMat = mat(SKIN, 0.55);
  const hairMat = mat(HAIR, 0.85);
  const lipsMat = mat(LIPS, 0.5);
  const eyeWhite = mat(0xffffff, 0.3);
  const eyeIris = mat(0x1e3a8a, 0.4);
  const browMat = mat(0x2a1a0e, 0.7);

  const head = new THREE.Group();

  // Skull
  decorate(
    head,
    new THREE.SphereGeometry(0.34, 32, 28),
    skinMat,
    [0, 0, 0],
  );
  // Hair — top half-sphere
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hairMat,
  );
  hair.position.y = 0.03;
  hair.castShadow = true;
  head.add(hair);

  // Eyes — two small spheres with iris
  const buildEye = (x) => {
    const eye = new THREE.Group();
    eye.position.set(x, 0.05, 0.30);
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), eyeWhite);
    eye.add(white);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 12), eyeIris);
    iris.position.z = 0.028;
    eye.add(iris);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 10), mat(0x000000));
    pupil.position.z = 0.045;
    eye.add(pupil);
    // Upper lid (a thin curved disk we can "scale" to blink)
    const lid = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      skinMat,
    );
    lid.position.y = 0;
    lid.scale.y = 0.001; // open
    eye.add(lid);
    return { eye, lid, iris };
  };

  const eyeL = buildEye(-0.12);
  const eyeR = buildEye(0.12);
  head.add(eyeL.eye, eyeR.eye);

  // Eyebrows (thin boxes)
  const browL = decorate(head, new THREE.BoxGeometry(0.10, 0.018, 0.02), browMat, [-0.12, 0.13, 0.30]);
  const browR = decorate(head, new THREE.BoxGeometry(0.10, 0.018, 0.02), browMat, [0.12, 0.13, 0.30]);

  // Mouth — flat capsule that we can scale Y to "open" and X for smile/frown
  const mouth = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 24, 12, 0, Math.PI * 2, 0, Math.PI),
    lipsMat,
  );
  mouth.position.set(0, -0.13, 0.31);
  mouth.scale.set(1.1, 0.18, 0.5);
  head.add(mouth);

  // Subtle ears
  decorate(head, new THREE.SphereGeometry(0.06, 12, 10), skinMat, [-0.32, 0.0, 0.0]).scale.set(0.5, 1, 0.6);
  decorate(head, new THREE.SphereGeometry(0.06, 12, 10), skinMat, [0.32, 0.0, 0.0]).scale.set(0.5, 1, 0.6);

  // Nose (small bridge + tip)
  const noseMat = mat(SKIN_DARK, 0.55);
  decorate(head, new THREE.ConeGeometry(0.035, 0.10, 12), noseMat, [0, -0.04, 0.31]).rotation.x = Math.PI;
  decorate(head, new THREE.SphereGeometry(0.030, 12, 10), noseMat, [0, -0.085, 0.34]);

  // Cheeks (very subtle blush spheres)
  const cheekMat = new THREE.MeshStandardMaterial({
    color: 0xd97a6a,
    roughness: 0.85,
    transparent: true,
    opacity: 0.35,
  });
  decorate(head, new THREE.SphereGeometry(0.05, 12, 10), cheekMat, [-0.18, -0.07, 0.27]).scale.set(1, 0.6, 0.4);
  decorate(head, new THREE.SphereGeometry(0.05, 12, 10), cheekMat, [0.18, -0.07, 0.27]).scale.set(1, 0.6, 0.4);

  return { head, eyeL, eyeR, browL, browR, mouth };
}

export function buildAvatar() {
  const root = new THREE.Group();
  const skinMat = mat(SKIN, 0.55);
  const clothMat = mat(CLOTH, 0.45);
  const clothDarkMat = mat(CLOTH_DARK, 0.5);

  const pelvis = new THREE.Group();
  pelvis.position.y = 0.95;
  root.add(pelvis);

  // Hip box (under torso)
  decorate(
    pelvis,
    new THREE.BoxGeometry(0.6, 0.18, 0.34),
    clothDarkMat,
    [0, -0.04, 0],
  );

  const spine = new THREE.Group();
  spine.position.y = 0.10;
  pelvis.add(spine);

  const chest = new THREE.Group();
  chest.position.y = 0.30;
  spine.add(chest);

  // Torso (slight taper, capsule-like)
  const torsoTop = decorate(
    chest,
    new THREE.CylinderGeometry(0.34, 0.40, 0.74, 24, 1, false),
    clothMat,
    [0, -0.07, 0],
  );
  // Shoulders — flat top
  decorate(
    chest,
    new THREE.SphereGeometry(0.36, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    clothMat,
    [0, 0.30, 0],
  );

  // Neck
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.10, 0.12, 0.16, 16),
    skinMat,
  );
  neck.position.y = 0.42;
  neck.castShadow = true;
  chest.add(neck);

  // Head (with sub-rig)
  const headRig = buildHead();
  headRig.head.position.y = 0.79;
  chest.add(headRig.head);

  // Arms — attached to chest, offset L/R
  const armL = buildArm(-1);
  armL.shoulder.position.set(-0.45, 0.30, 0);
  armL.shoulder.rotation.z = -0.18; // natural rest angle
  chest.add(armL.shoulder);

  const armR = buildArm(1);
  armR.shoulder.position.set(0.45, 0.30, 0);
  armR.shoulder.rotation.z = 0.18;
  chest.add(armR.shoulder);

  // Bones map (everything the pose system can drive)
  const bones = {
    root,
    pelvis,
    spine,
    chest,
    neck,
    head: headRig.head,
    eyeL: headRig.eyeL,
    eyeR: headRig.eyeR,
    browL: headRig.browL,
    browR: headRig.browR,
    mouth: headRig.mouth,
    L: armL,
    R: armR,
  };

  return { root, bones };
}
