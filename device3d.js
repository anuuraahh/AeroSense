/* ==========================================================
   AeroSense — interactive 3D device (three.js)
   ----------------------------------------------------------
   • Builds a procedural CONCEPT model of the reader + cartridge.
   • When the SolidWorks model is ready, export it as GLB and set
     window.AEROSENSE_MODEL = "models/aerosense.glb" in the page.
     Parts are matched by node name (see PART_NAME_HINTS).
   • Three viewers share this module: hero, scroll story, explorer.
   ========================================================== */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ACCENT = 0x5b6ee1, BLUE = 0x238bc4, AMBER = 0xe0a21a, RED = 0xe0483f, GREEN = 0x19c28f;

/* ---------- part metadata (explorer chips + hotspots) ---------- */
export const PARTS = [
  { key: "cartridge", name: "Single-use cartridge", k: "consumable", info: "Mouthpiece, micro-impactor nozzle and sealed buffer blister. It clicks into the top of the reader and is thrown away after one test, so nothing carries over between people." },
  { key: "strip", name: "Screen-printed electrode", k: "sensing surface", info: "A three-electrode strip (working, reference, counter) sitting under the nozzle. Breath droplets land here, and the buffer turns them into something the electronics can measure." },
  { key: "heater", name: "37 °C chamber heater", k: "conditioning", info: "Keeps the impaction zone at body temperature so breath moisture doesn't condense unevenly and skew the reading." },
  { key: "pressure", name: "Breath flow sensor", k: "sample quality", info: "A differential pressure sensor that measures flow and exhaled volume. No result is given until the breath is deep enough." },
  { key: "afe", name: "Potentiostat front-end", k: "measurement", info: "Applies a voltage sweep across the strip and measures the tiny currents that come back: the voltammetry curve." },
  { key: "esp32", name: "ESP32 controller", k: "brain", info: "Runs the test sequence and the on-device ML model that classifies the curve. It needs no internet connection." },
  { key: "battery", name: "18650 Li-ion cell", k: "power", info: "Rechargeable over USB-C, sized for a full shift of roadside or clinic testing." },
  { key: "front", name: "Display & result lights", k: "interface", info: "OLED screen plus green, amber and red lights, so an officer can read the result without training." },
];
/* keywords used to map GLB node names → part keys when a CAD model is loaded */
const PART_NAME_HINTS = {
  cartridge: ["cartridge", "mouth", "nozzle"], strip: ["strip", "electrode", "spe"], heater: ["heater", "chamber"],
  pressure: ["pressure", "mpx", "flow"], afe: ["potentio", "afe", "lmp"], esp32: ["esp", "mcu", "controller"],
  battery: ["battery", "18650", "cell"], front: ["front", "display", "oled", "top_shell", "lid"], back: ["back", "rear", "bottom_shell", "base"],
  pcb: ["pcb", "board"],
};

/* ---------- small helpers ---------- */
const mat = (o) => new THREE.MeshPhysicalMaterial(Object.assign({ roughness: 0.45, metalness: 0 }, o));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

/* One half of the 6 × 13 × 3.2 body block. sign = 1 keeps the front (z ≥ 0), -1 the back.
   Everything on the other side of the cut is flattened onto z = 0, which closes the half with a flat
   cut face; the result is re-centred on its own half (±0.8) to match the front/back groups. */
function bodyHalf(sign) {
  const g = new RoundedBoxGeometry(6, 13, 3.2, 6, 0.6);
  const pos = g.attributes.position, nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) * sign < 0) {
      pos.setZ(i, 0);
      if (nor.getZ(i) * sign < -0.01) nor.setXYZ(i, 0, 0, -sign);      // flattened part becomes the cut face
    }
    pos.setZ(i, pos.getZ(i) - sign * 0.8);
  }
  pos.needsUpdate = true; nor.needsUpdate = true;
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

function screenCanvas() {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 320;
  return c;
}

/* Draws the device's OLED. state: {title, line, result, cls, curve:{peak, upto}, vol} */
function drawScreen(canvas, s) {
  const g = canvas.getContext("2d"), w = canvas.width, h = canvas.height;
  g.fillStyle = "#0d1024"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#9aa6ff"; g.font = "600 30px JetBrains Mono, monospace";
  g.fillText("AEROSENSE", 28, 52);
  g.fillStyle = "#262b52"; g.fillRect(28, 66, w - 56, 2);
  g.fillStyle = "#d3d8ff"; g.font = "500 34px JetBrains Mono, monospace";
  g.fillText(s.title || "READY", 28, 118);
  g.fillStyle = "#8a90c0"; g.font = "400 24px JetBrains Mono, monospace";
  g.fillText(s.line || "insert cartridge", 28, 156);
  if (s.vol != null) {
    g.fillStyle = "#262b52"; g.fillRect(28, 190, w - 56, 22);
    g.fillStyle = s.vol >= 1.5 ? "#5fe0a0" : "#5aa8e0"; g.fillRect(28, 190, (w - 56) * Math.min(1, s.vol / 2.1), 22);
    g.fillStyle = "#f6c355"; g.fillRect(28 + (w - 56) * (1.5 / 2.1), 184, 3, 34);
  }
  if (s.curve) {
    const x0 = 28, y0 = 300, cw = w - 56, ch = 100;
    const f = (x, p) => 0.12 + 0.1 * x + p * 0.62 * Math.exp(-Math.pow((x - 0.55) / 0.13, 2));
    g.strokeStyle = "#4a5080"; g.setLineDash([8, 8]); g.lineWidth = 2; g.beginPath();
    for (let i = 0; i <= 80; i++) { const x = i / 80; const y = y0 - f(x, 1) * ch; i ? g.lineTo(x0 + x * cw, y) : g.moveTo(x0 + x * cw, y); }
    g.stroke(); g.setLineDash([]);
    g.strokeStyle = s.cls === "abnormal" ? "#ff7a73" : s.cls === "inconclusive" ? "#f6c355" : "#5fe0a0"; g.lineWidth = 4; g.beginPath();
    for (let i = 0; i <= 80 * s.curve.upto; i++) { const x = i / 80; const y = y0 - f(x, s.curve.peak) * ch; i ? g.lineTo(x0 + x * cw, y) : g.moveTo(x0 + x * cw, y); }
    g.stroke();
  }
  if (s.result) {
    g.fillStyle = s.cls === "abnormal" ? "#ff7a73" : s.cls === "inconclusive" ? "#f6c355" : "#5fe0a0";
    g.font = "700 36px JetBrains Mono, monospace";
    g.fillText(s.result, 28, s.curve ? 196 : 250);
  }
}

/* ==========================================================
   Procedural concept model
   Units ≈ cm. Reader body 6 × 13 × 3.2, centred on origin.
   ========================================================== */
/* opts.solid = true builds the finished-product look used on the landing page: every part opaque.
   Without it (inside the portfolio) the cartridge chamber stays see-through. */
export function buildConceptModel(opts = {}) {
  const solid = !!opts.solid;
  const root = new THREE.Group();
  const parts = {};           // key -> { obj, base: Vector3, off: Vector3 }
  const add = (key, obj, off) => { root.add(obj); parts[key] = { obj, base: obj.position.clone(), off: new THREE.Vector3(...off) }; return obj; };

  /* dark metallic grey body with black parts */
  const white = mat({ color: 0x383b42, metalness: 0.85, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 });  // one body colour: gunmetal with a little black
  const shellBackMat = white;                                                                                           // back shell is the same colour (no two-tone)
  const trim = mat({ color: 0x131418, metalness: 0.5, roughness: 0.4 });                                                // grill slats
  const accent = mat({ color: ACCENT, roughness: 0.35 });
  const black = mat({ color: 0x131418, metalness: 0.4, roughness: 0.38 });
  const glass = solid
    ? mat({ color: 0x3c4049, metalness: 0.8, roughness: 0.3, clearcoat: 0.5 })
    : mat({ color: 0xaeb5d6, roughness: 0.08, transparent: true, opacity: 0.38, depthWrite: false });
  const dark = mat({ color: 0x1b1e2c, roughness: 0.4 });
  const metal = mat({ color: 0xc9cfd1, metalness: 1, roughness: 0.32 });

  /* front shell (with screen, LEDs, button) */
  const front = new THREE.Group(); front.position.set(0, 0, 0.8);
  /* the body is ONE rounded block, cut down the middle: the two halves sit flush so it reads as a single
     piece, and when the model is taken apart they separate like a block sliced in two */
  const fShell = new THREE.Mesh(bodyHalf(1), white); front.add(fShell);
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(4.6, 3.2, 0.1, 3, 0.2), dark); bezel.position.set(0, 2.7, 0.8); front.add(bezel);
  const sc = screenCanvas(); drawScreen(sc, { title: "READY", line: "insert cartridge" });
  const scTex = new THREE.CanvasTexture(sc); scTex.colorSpace = THREE.SRGBColorSpace; scTex.anisotropy = 4;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.625), new THREE.MeshBasicMaterial({ map: scTex, toneMapped: false }));
  screen.userData.keepMat = true; screen.position.set(0, 2.7, 0.86); front.add(screen);
  /* three result LEDs, centred in a row just above the button: abnormal (red), inconclusive (amber), normal (green) */
  const leds = {};
  [["r", -0.9, RED], ["y", 0, AMBER], ["g", 0.9, GREEN]].forEach(([k, x, c]) => {
    const tint = new THREE.Color(c).lerp(new THREE.Color(0x202226), 0.55);
    const m = new THREE.MeshStandardMaterial({ color: tint, emissive: c, emissiveIntensity: 0.15, roughness: 0.2 });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 16), m); led.userData.keepMat = true; led.scale.z = 0.6; led.position.set(x, -0.4, 0.84); front.add(led); leds[k] = m;
    const bezelRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 10, 32), black); bezelRing.position.set(x, -0.4, 0.82); front.add(bezelRing);
  });
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.18, 40), accent); btn.rotation.x = Math.PI / 2; btn.position.set(0, -1.7, 0.84); front.add(btn);
  const grill = new THREE.Group();
  for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.12, 0.06, 2, 0.05), trim); s.position.set(0, -4.2 - i * 0.38, 0.81); grill.add(s); }
  front.add(grill);
  add("front", front, [0, 0, 4.4]);

  /* back shell */
  const back = new THREE.Group(); back.position.set(0, 0, -0.8);
  back.add(new THREE.Mesh(bodyHalf(-1), shellBackMat));
  const usb = new THREE.Mesh(new RoundedBoxGeometry(1, 0.34, 0.5, 2, 0.12), dark); usb.position.set(0, -6.45, 0.75); back.add(usb);
  add("back", back, [0, 0, -4.4]);

  /* PCB */
  const pcb = new THREE.Group(); pcb.position.set(0, 0.4, 0.05);
  pcb.add(new THREE.Mesh(new RoundedBoxGeometry(4.8, 9.2, 0.12, 2, 0.1), mat({ color: 0x1d6a4e, roughness: 0.6 })));
  for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.1), dark); r.position.set(-1.6 + i * 0.64, -3.4, 0.1); pcb.add(r); }
  add("pcb", pcb, [0, 0, 0.9]);

  const esp = new THREE.Group(); esp.position.set(-1.05, 1.9, 0.33);
  esp.add(new THREE.Mesh(new RoundedBoxGeometry(1.8, 2.5, 0.3, 2, 0.05), metal));
  const ant = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 0.32), dark); ant.position.y = 1.0; esp.add(ant);
  add("esp32", esp, [0, 0, 2.4]);

  const afe = new THREE.Group(); afe.position.set(1.25, 2.6, 0.2);
  afe.add(new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.9, 0.14, 2, 0.04), dark));
  const adc = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.5, 0.12, 2, 0.04), dark); adc.position.set(0, -0.9, 0); afe.add(adc);
  add("afe", afe, [0, 0, 2.9]);

  const pres = new THREE.Group(); pres.position.set(1.3, 4.3, 0.45);
  pres.add(new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.9, 0.7, 2, 0.1), mat({ color: 0x2b2e3d, roughness: 0.5 })));
  [-0.25, 0.25].forEach((x) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 16), metal); p.position.set(x, 0.6, 0); pres.add(p); });
  const tubeCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.25, 0.8, 0), new THREE.Vector3(-0.3, 1.5, -0.1), new THREE.Vector3(-0.8, 2.0, -0.35)]);
  pres.add(new THREE.Mesh(new THREE.TubeGeometry(tubeCurve, 24, 0.09, 10), solid ? black : mat({ color: 0x9aa0b4, roughness: 0.3, transparent: true, opacity: 0.8 })));
  add("pressure", pres, [1.4, 0.6, 2.4]);

  /* battery (behind the PCB) */
  const bat = new THREE.Group(); bat.position.set(0, -2.3, -0.74);   // kept inside the body so it never shows through the back
  bat.add(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 6.2, 40), mat({ color: 0x2a6fb0, roughness: 0.35, clearcoat: 0.5 })));
  [-3.15, 3.15].forEach((y) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 32), metal); c.position.y = y; bat.add(c); });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.71, 0.71, 0.5, 40), black); band.position.y = 2.3; bat.add(band);
  add("battery", bat, [0, -0.4, -2.6]);

  /* heated impaction seat at the top of the reader */
  const heater = new THREE.Group(); heater.position.set(0, 6.45, 0);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.09, 12, 48), mat({ color: 0xe0802a, roughness: 0.4, emissive: 0x5a2a00, emissiveIntensity: 0.3 }));
  ring.rotation.x = Math.PI / 2; heater.add(ring);
  add("heater", heater, [-3.4, 1.4, 0.6]);

  /* cartridge: housing + nozzle + mouthpiece + blister */
  const cart = new THREE.Group(); cart.position.set(0, 7.75, 0);
  const housing = new THREE.Mesh(new RoundedBoxGeometry(3.4, 2.4, 2.6, 4, 0.35), glass); cart.add(housing);
  const base = new THREE.Mesh(new RoundedBoxGeometry(3.6, 0.3, 2.8, 3, 0.12), accent); base.position.y = -1.2; cart.add(base);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.16, 1.1, 32, 1, true), mat({ color: 0x2a2d34, metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }));
  nozzle.position.set(0, -0.05, 0); cart.add(nozzle);
  /* mouthpiece: a tube that runs forward from the chamber and bends down into its top */
  const mouthMat = solid ? mat({ color: 0x17181c, metalness: 0.3, roughness: 0.35, side: THREE.DoubleSide })
    : mat({ color: 0x3a3e48, metalness: 0.2, roughness: 0.25, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  const mouthPath = new THREE.CurvePath();
  mouthPath.add(new THREE.LineCurve3(new THREE.Vector3(0, 1.95, 3.5), new THREE.Vector3(0, 1.95, 0.75)));
  mouthPath.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 1.95, 0.75), new THREE.Vector3(0, 1.95, 0), new THREE.Vector3(0, 1.15, 0)));
  const mouth = new THREE.Mesh(new THREE.TubeGeometry(mouthPath, 64, 0.55, 40, false), mouthMat); cart.add(mouth);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.78, 0.3, 40), black); collar.position.set(0, 1.28, 0); cart.add(collar);   // where it joins the chamber
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.08, 12, 40), accent); lip.position.set(0, 1.95, 3.5); cart.add(lip);
  const blister = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), metal);
  blister.rotation.z = -Math.PI / 2; blister.position.set(1.72, 0.2, -0.4); cart.add(blister);
  add("cartridge", cart, [0, 5.2, 0]);

  /* electrode strip (slides out sideways when exploded) */
  const strip = new THREE.Group(); strip.position.set(0, 6.95, 0);
  const sc2 = document.createElement("canvas"); sc2.width = 256; sc2.height = 400;
  const g2 = sc2.getContext("2d");
  g2.fillStyle = "#f5f6fa"; g2.fillRect(0, 0, 256, 400);
  g2.fillStyle = "#26302d"; g2.beginPath(); g2.arc(128, 110, 46, 0, Math.PI * 2); g2.fill();
  g2.strokeStyle = "#9aa3a0"; g2.lineWidth = 16; g2.beginPath(); g2.arc(128, 110, 72, Math.PI * 0.15, Math.PI * 0.85, true); g2.stroke();
  g2.strokeStyle = "#26302d"; g2.beginPath(); g2.arc(128, 110, 72, Math.PI * 0.95, Math.PI * 1.25); g2.stroke();
  g2.fillStyle = "#26302d"; [70, 128, 186].forEach((x) => g2.fillRect(x - 8, 190, 16, 190));
  const stripTex = new THREE.CanvasTexture(sc2); stripTex.colorSpace = THREE.SRGBColorSpace;
  const stripMesh = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 2.1), [
    mat({ color: 0xf5f6fa }), mat({ color: 0xf5f6fa }), mat({ map: stripTex, roughness: 0.6 }), mat({ color: 0xf5f6fa }), mat({ color: 0xf5f6fa }), mat({ color: 0xf5f6fa }),
  ]);
  stripMesh.rotation.y = Math.PI; strip.add(stripMesh);
  add("strip", strip, [4.4, 5.2, 0.4]);

  /* shared materials would make highlighting one part tint another, so every mesh gets its own copy */
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    if (!o.userData.keepMat) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
  });

  /* particles: droplets (teal) + gas (blue) following the impactor path */
  const particles = makeParticles();
  root.add(particles.group);

  return {
    root, parts, particles,
    setScreen: (s) => { drawScreen(sc, s); scTex.needsUpdate = true; },
    setLeds: (on) => { ["g", "y", "r"].forEach((k) => (leds[k].emissiveIntensity = on === k ? 2.6 : 0.15)); },
  };
}

/* Droplets fall straight onto the strip; gas turns and leaves through side vents. */
function makeParticles() {
  const group = new THREE.Group();
  const N = 70, M = 90;
  const dGeo = new THREE.SphereGeometry(0.075, 10, 8), aGeo = new THREE.SphereGeometry(0.045, 8, 6);
  const drops = new THREE.InstancedMesh(dGeo, new THREE.MeshBasicMaterial({ color: ACCENT }), N);
  const air = new THREE.InstancedMesh(aGeo, new THREE.MeshBasicMaterial({ color: BLUE, transparent: true, opacity: 0.7 }), M);
  group.add(drops, air);
  const seeds = (n) => Array.from({ length: n }, () => ({ t: Math.random(), j: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), side: Math.random() < 0.5 ? -1 : 1, sp: 0.35 + Math.random() * 0.25 }));
  const ds = seeds(N), as = seeds(M);
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3();
  const path = (pts, t) => {
    const n = pts.length - 1, f = Math.min(n - 1e-6, t * n), i = Math.floor(f), u = f - i;
    return v.copy(pts[i]).lerp(pts[i + 1], u);
  };
  const common = [new THREE.Vector3(0, 9.7, 4.6), new THREE.Vector3(0, 9.7, 0.9), new THREE.Vector3(0, 9.4, 0.25), new THREE.Vector3(0, 8.9, 0), new THREE.Vector3(0, 8.1, 0)];   // in through the mouthpiece, down the bend, into the nozzle
  let level = 0, target = 0;
  const step = (dt) => {
    level = damp(level, target, 4, dt);
    group.visible = level > 0.02;
    if (!group.visible) return;
    ds.forEach((p, i) => {
      p.t += dt * p.sp * 0.5; if (p.t > 1) p.t -= 1;
      const pts = [...common, new THREE.Vector3(p.j.x * 0.5, 7.0, p.j.z * 0.7)];
      path(pts, p.t);
      if (p.t < 0.8) v.addScaledVector(p.j, 0.35 * (1 - p.t));
      const s = level * (p.t > 0.97 ? 0.6 : 1);
      m4.makeScale(s, s, s).setPosition(v); drops.setMatrixAt(i, m4);
    });
    as.forEach((p, i) => {
      p.t += dt * p.sp * 0.7; if (p.t > 1) p.t -= 1;
      const pts = [...common, new THREE.Vector3(0, 7.35, 0), new THREE.Vector3(p.side * 1.6, 7.4, p.j.z), new THREE.Vector3(p.side * 3.4, 7.6 + p.j.y, p.j.z)];
      path(pts, p.t);
      v.addScaledVector(p.j, 0.4);
      const s = level * (1 - Math.max(0, p.t - 0.85) * 6);
      m4.makeScale(Math.max(0, s), Math.max(0, s), Math.max(0, s)).setPosition(v); air.setMatrixAt(i, m4);
    });
    drops.instanceMatrix.needsUpdate = true; air.instanceMatrix.needsUpdate = true;
  };
  return { group, step, set: (on) => (target = on ? 1 : 0) };
}

/* ==========================================================
   Loading a CAD export (GLB) instead of the concept model
   ========================================================== */
async function tryLoadCAD(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const scene = gltf.scene;
  const box = new THREE.Box3().setFromObject(scene), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const s = 13 / Math.max(size.x, size.y, size.z);
  scene.scale.setScalar(s); scene.position.sub(c.multiplyScalar(s));
  const root = new THREE.Group(); root.add(scene);
  const parts = {};
  const top = scene.children.length === 1 && scene.children[0].children.length > 1 ? scene.children[0].children : scene.children;
  top.forEach((o, i) => {
    const n = (o.name || "").toLowerCase();
    let key = Object.keys(PART_NAME_HINTS).find((k) => PART_NAME_HINTS[k].some((h) => n.includes(h))) || "part" + i;
    if (parts[key]) key += "_" + i;
    const ob = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
    const dir = ob.clone().setY(ob.y * 0.6); if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0);
    parts[key] = { obj: o, base: o.position.clone(), off: dir.normalize().multiplyScalar(4 / s) };
  });
  root.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.material = o.material.clone(); } });
  const particles = makeParticles(); root.add(particles.group);
  return { root, parts, particles, setScreen: () => {}, setLeds: () => {}, cad: true };
}

/* ==========================================================
   Viewer
   ========================================================== */
const VIEWS = {
  hero: { pos: [21, 11.5, 32], target: [0, 2, 0] },
  front: { pos: [15.2, 7.7, 36], target: [0, 2, 0] },
  top: { pos: [8.2, 16, 12], target: [0, 7.2, 0] },
  side: { pos: [20.8, 9.7, 7.8], target: [0, 7.5, 0] },
  lifted: { pos: [21, 12, 8.5], target: [0, 8.8, 0] },
  wide: { pos: [28.5, 14, 35], target: [0, 3.2, 0] },
  back: { pos: [-20, 7, -26], target: [0, 1, 0] },
  screen: { pos: [3.4, 4.0, 13.5], target: [0, 2.4, 1.6] },          // close on the display, used for the test result
};

export class DeviceViewer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas; this.opts = opts;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.camera = new THREE.PerspectiveCamera(opts.fov || 32, 1, 0.1, 200);
    const v = VIEWS[opts.view || "hero"];
    this.goal = { pos: new THREE.Vector3(), target: new THREE.Vector3(...v.target), tween: false };
    this.goal.pos.set(...v.pos).sub(this.goal.target).multiplyScalar(opts.zoom || 1).add(this.goal.target);
    this.camera.position.copy(this.goal.pos);

    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(8, 18, 12); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -14; key.shadow.camera.right = 14; key.shadow.camera.top = 16; key.shadow.camera.bottom = -14; key.shadow.radius = 6; key.shadow.bias = -0.0005;
    this.scene.add(key, new THREE.HemisphereLight(0xdfe3ff, 0x1a1d30, 0.7));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.ShadowMaterial({ opacity: 0.45 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -6.9; floor.receiveShadow = true; this.scene.add(floor);

    this.pivot = new THREE.Group(); this.scene.add(this.pivot);
    this.explode = {}; this.focusKey = null; this.spin = opts.autoRotate ? 1 : 0; this.t = 0;

    if (opts.orbit) {
      const c = (this.controls = new OrbitControls(this.camera, canvas));
      c.enableDamping = true; c.enableZoom = false; c.enablePan = false;
      c.minPolarAngle = 0.2; c.maxPolarAngle = Math.PI * 0.62;
      c.target.copy(this.goal.target);
      canvas.style.touchAction = "pan-y"; // let the page scroll vertically on touch screens
      c.addEventListener("start", () => { this.dragging = true; this.goal.tween = false; this.spin = 0; clearTimeout(this._resume); });
      /* the hero model starts turning again a few seconds after the visitor lets go */
      c.addEventListener("end", () => { this.dragging = false; if (opts.autoRotate) this._resume = setTimeout(() => (this.spin = 1), 3500); });
    } else {
      this._tgt = this.goal.target.clone();   // scripted camera: remember where it's looking so moves glide
      this.camera.lookAt(this._tgt);
    }
    this.clock = new THREE.Clock();
    this.visible = true;
    new IntersectionObserver((e) => (this.visible = e[0].isIntersecting), { rootMargin: "100px" }).observe(canvas);
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  setModel(m) {
    if (this.model) this.pivot.remove(this.model.root);
    this.model = m; this.pivot.add(m.root);
    try { this.renderer.compile(this.scene, this.camera); } catch (e) {}   // compile shaders now, not on the first visible frame
    this.meshes = [];
    Object.entries(m.parts).forEach(([key, p]) => {
      p.obj.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((mm) => { mm.userData.base = { opacity: mm.opacity, transparent: mm.transparent, depthWrite: mm.depthWrite, emissive: mm.emissive ? mm.emissive.clone() : null, ei: mm.emissiveIntensity }; });
        this.meshes.push({ key, mats, keep: !!o.userData.keepMat });
      });
      this.explode[key] = this.explode[key] || { cur: 0, goal: 0 };
    });
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = (this.opts.fov || 32) * (w / h < 0.8 ? 1.25 : 1);
    this.camera.updateProjectionMatrix();
  }

  view(name) {
    const v = VIEWS[name]; if (!v) return;
    this.goal.target.set(...v.target);
    this.goal.pos.set(...v.pos).sub(this.goal.target).multiplyScalar(this.opts.zoom || 1).add(this.goal.target);   // zoom > 1 pulls the camera back
    this.goal.tween = true;
  }
  lookAtPart(key) {
    const p = this.model?.parts[key]; if (!p) return;
    const c = this.anchor(key, true);
    const dir = this.camera.position.clone().sub(this.controls ? this.controls.target : this.goal.target).normalize();
    this.goal.target.copy(c); this.goal.pos.copy(c).addScaledVector(dir, 17 * (this.opts.zoom || 1)); this.goal.tween = true;
  }
  /* amount 0..1 for all parts, or {key: amount} */
  setExplode(a) {
    Object.keys(this.explode).forEach((k) => (this.explode[k].goal = typeof a === "number" ? a : a[k] || 0));
  }
  setFocus(keys) {
    const set = keys == null ? null : new Set([].concat(keys));
    this.focusKey = set;
    this.meshes.forEach(({ key, mats, keep }) => mats.forEach((m) => {
      const b = m.userData.base;
      const inFocus = set && set.has(key);
      if (!set || inFocus) {
        m.transparent = b.transparent; m.opacity = b.opacity; m.depthWrite = b.depthWrite;
        if (!keep && m.emissive && b.emissive) { if (inFocus) { m.emissive.setHex(ACCENT); m.emissiveIntensity = 0.22; } else { m.emissive.copy(b.emissive); m.emissiveIntensity = b.ei; } }
      } else {
        m.transparent = true; m.opacity = Math.min(b.opacity, 0.12); m.depthWrite = false;
        if (!keep && m.emissive && b.emissive) { m.emissive.copy(b.emissive); m.emissiveIntensity = b.ei; }
      }
      m.needsUpdate = true;
    }));
  }
  /* world-space centre of a part; with settled=true, where it will be once the explode animation finishes */
  anchor(key, settled) {
    const p = this.model?.parts[key]; if (!p) return null;
    const c = new THREE.Box3().setFromObject(p.obj).getCenter(new THREE.Vector3());
    const e = this.explode[key];
    if (settled && e) c.add(p.off.clone().multiplyScalar(e.goal - e.cur).applyQuaternion(this.pivot.quaternion));
    return c;
  }
  explodeGoal() { const v = Object.values(this.explode); return v.length ? Math.max(...v.map((e) => e.goal)) : 0; }
  project(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-p.y * 0.5 + 0.5) * this.canvas.clientHeight, behind: p.z > 1 };
  }

  tick() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.visible || !this.model) return;
    this.t += dt;
    Object.entries(this.model.parts).forEach(([k, p]) => {
      const e = this.explode[k]; if (!e) return;
      e.cur = reduceMotion ? e.goal : damp(e.cur, e.goal, 5, dt);
      p.obj.position.copy(p.base).addScaledVector(p.off, e.cur);
    });
    this.model.particles.step(dt);
    if (this.spin && !reduceMotion) this.pivot.rotation.y += dt * 0.25 * this.spin;
    else this.pivot.rotation.y = damp(this.pivot.rotation.y, this.pivotGoal || 0, 3, dt);
    if (this.opts.float && !reduceMotion) this.pivot.position.y = Math.sin(this.t * 1.2) * 0.12;

    if (this.goal.tween) {
      const k = reduceMotion ? 1 : 1 - Math.exp(-4 * dt);
      this.camera.position.lerp(this.goal.pos, k);
      const tgt = this.controls ? this.controls.target : this._tgt;
      tgt.lerp(this.goal.target, k);
      if (!this.controls) this.camera.lookAt(tgt);
      if (this.camera.position.distanceTo(this.goal.pos) < 0.02) this.goal.tween = false;
    }
    const moved = this.controls ? this.controls.update() : false;
    /* full frame rate while something is moving; otherwise redraw at ~15 fps (enough for screen/LED changes) */
    const busy = moved || this.goal.tween || this.spin || this.opts.float || this.dragging ||
      this.model.particles.group.visible || Object.values(this.explode).some((e) => Math.abs(e.cur - e.goal) > 1e-3);
    this._skip = busy ? 0 : (this._skip || 0) + 1;
    if (this._skip % 4 === 0) this.renderer.render(this.scene, this.camera);
    this.onFrame && this.onFrame();
  }
}

/* ==========================================================
   Page wiring
   ========================================================== */
async function makeModel() {
  const url = window.AEROSENSE_MODEL;
  if (url) {
    try { return await tryLoadCAD(url); } catch (e) { console.warn("CAD model failed to load, using concept model", e); }
  }
  return buildConceptModel();
}

const viewers = [];
function loop() { viewers.forEach((v) => v.tick()); requestAnimationFrame(loop); }

/* build a viewer only when its section is close to the screen, so the page never stalls
   compiling three 3D scenes at once */
const prewarm = [];
function whenNear(el, build) {
  let started = false;
  const run = () => {
    if (started) return; started = true;
    return build().catch((e) => { console.error(e); fail(el.closest(".stage"), "The 3D view couldn't load. Check your connection and refresh."); });
  };
  if (!("IntersectionObserver" in window)) { run(); return; }
  const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { io.disconnect(); run(); } }, { rootMargin: "900px 0px" });
  io.observe(el);
  prewarm.push(run);
}
/* build the remaining 3D views one at a time while the browser is idle, so they're ready before
   anyone scrolls or jumps to them (a jump to #explore no longer has to build a scene on the spot) */
function prewarmIdle() {
  const idle = (fn) => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 300));
  const next = () => { const run = prewarm.shift(); if (!run) return; idle(async () => { await run(); setTimeout(next, 250); }); };
  if (document.readyState === "complete") setTimeout(next, 400);
  else addEventListener("load", () => setTimeout(next, 400), { once: true });
}
/* fade the finished model in instead of popping it over the "Loading" text */
function ready(canvas) {
  const st = canvas.closest(".stage"); st.classList.add("ready");
  const f = st.querySelector(".stage-fallback"); if (f) setTimeout(() => (f.hidden = true), 350);
}

function fail(stage, msg) {
  const f = stage.querySelector(".stage-fallback"); if (f) { f.hidden = false; f.textContent = msg; }
}

async function init() {
  const heroCanvas = document.getElementById("hero3d");
  const storyCanvas = document.getElementById("story3d");
  const exCanvas = document.getElementById("explore3d");
  const test = document.createElement("canvas");
  if (!(test.getContext("webgl2") || test.getContext("webgl"))) {
    document.querySelectorAll(".stage").forEach((s) => fail(s, "This 3D view needs WebGL. Try a recent version of Chrome, Edge, Safari or Firefox."));
    return;
  }

  /* ---- hero ---- */
  if (heroCanvas) {
    const v = new DeviceViewer(heroCanvas, { orbit: true, autoRotate: true, float: true, view: "hero" });
    v.setModel(await makeModel());
    v.model.setScreen({ title: "READY", line: "blow to begin" }); v.model.setLeds("g");
    viewers.push(v); ready(heroCanvas);
  }

  /* ---- scroll story ---- */
  if (storyCanvas) whenNear(storyCanvas, async () => {
    const v = new DeviceViewer(storyCanvas, { orbit: false, view: "front" });
    v.setModel(await makeModel());
    viewers.push(v); ready(storyCanvas);
    const steps = [...document.querySelectorAll(".story-step")];
    const bars = [...document.querySelectorAll(".story-progress i")];
    const chapters = [
      () => { v.view("front"); v.setExplode(0); v.setFocus(null); v.model.particles.set(false); v.pivotGoal = -0.35; v.model.setLeds("g"); v.model.setScreen({ title: "READY", line: "blow to begin" }); },
      () => { v.view("lifted"); v.setExplode({ cartridge: 0.55, strip: 0.55 }); v.setFocus(["cartridge", "strip"]); v.model.particles.set(false); v.pivotGoal = -0.2; v.model.setLeds(null); },
      () => { v.view("top"); v.setExplode(0); v.setFocus(["cartridge", "strip", "heater"]); v.model.particles.set(true); v.pivotGoal = -0.5; v.model.setLeds("y"); v.model.setScreen({ title: "CAPTURE", line: "keep blowing", vol: 1.2 }); },
      () => { v.view("wide"); v.setExplode(1); v.setFocus(["esp32", "afe", "pressure", "pcb", "battery"]); v.model.particles.set(false); v.pivotGoal = -0.6; v.model.setLeds("y"); v.model.setScreen({ title: "SWEEP", line: "reading strip", curve: { peak: 1, upto: 0.7 } }); },
      () => { v.view("front"); v.setExplode(0); v.setFocus(null); v.model.particles.set(false); v.pivotGoal = -0.35; v.model.setLeds("g"); v.model.setScreen({ title: "RESULT", line: "on-device ML", result: "REFERENCE", cls: "normal", curve: { peak: 0.96, upto: 1 } }); },
    ];
    /* the active chapter is whichever step sits under the middle of the screen */
    let cur = -1;
    const go = (i) => {
      if (i === cur) return;
      cur = i; chapters[i]();
      steps.forEach((s, j) => s.classList.toggle("active", j === i));
      bars.forEach((b, j) => b.classList.toggle("on", j <= i));
    };
    const pick = () => {
      /* on phones the 3D view is pinned over the top half, so read the step in the lower half */
      const mid = window.innerHeight * (window.innerWidth <= 900 ? 0.72 : 0.5);
      let i = steps.findIndex((s) => { const r = s.getBoundingClientRect(); return r.top <= mid && r.bottom > mid; });
      if (i < 0) i = steps[0].getBoundingClientRect().top > mid ? 0 : steps.length - 1;
      go(i);
    };
    let queued = false;
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; pick(); }); } };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    pick();
  });

  /* ---- explorer ---- */
  if (exCanvas) whenNear(exCanvas, async () => {
    const v = new DeviceViewer(exCanvas, { orbit: true, view: "hero", zoom: 1.28 });   // pulled back so the whole device fits the sticky frame
    v.setModel(await makeModel());
    viewers.push(v); ready(exCanvas);
    wireExplorer(v);
  });
  prewarmIdle();
  loop();
}

function wireExplorer(v) {
  const $ = (id) => document.getElementById(id);
  const stage = v.canvas.closest(".stage");
  const chips = $("part-chips"), info = $("part-info"), slider = $("explode");
  const parts = PARTS.filter((p) => v.model.parts[p.key]);
  let focus = null;
  const defaultInfo = info.innerHTML;

  /* hotspots (only shown once the parts are pulled apart, so the numbers don't pile up) */
  const layer = document.createElement("div"); layer.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:3"; stage.appendChild(layer);
  const spots = parts.map((p, i) => {
    const b = document.createElement("button");
    b.className = "hotspot"; b.type = "button"; b.textContent = i + 1; b.style.pointerEvents = "auto";
    b.setAttribute("aria-label", p.name);
    b.addEventListener("click", () => select(focus === p.key ? null : p.key));   // click the same number again to go back
    layer.appendChild(b); return { p, b };
  });
  /* the description pops up right next to the selected number */
  const pop = document.createElement("div"); pop.className = "hot-pop"; pop.setAttribute("role", "dialog"); pop.hidden = true;
  /* phones: the stage is too small for a pop-up beside the number, so it becomes a sheet
     pinned to the bottom of the screen and the model stays visible above it */
  const sheetMQ = window.matchMedia("(max-width: 900px)");
  const placePop = () => { (sheetMQ.matches ? document.body : layer).appendChild(pop); pop.classList.toggle("sheet", sheetMQ.matches); };
  placePop(); sheetMQ.addEventListener ? sheetMQ.addEventListener("change", placePop) : sheetMQ.addListener(placePop);
  let popW = 0, popH = 0;
  v.onFrame = () => {
    const W = v.canvas.clientWidth, H = v.canvas.clientHeight;
    spots.forEach(({ p, b }) => {
      const a = v.anchor(p.key); if (!a) return;
      const s = v.project(a);
      b.style.transform = `translate(${s.x}px, ${s.y}px)`;
      const off = s.behind || v.explodeGoal() < 0.3 || s.x < 8 || s.y < 8 || s.x > W - 8 || s.y > H - 8;
      b.classList.toggle("hidden", !!off);
      b.classList.toggle("on", focus === p.key);
      b.classList.toggle("dim", !!focus && focus !== p.key);
      if (focus === p.key && !pop.hidden) {
        /* sit to the right of the number, flip left near the edge, stay inside the frame */
        let x = s.x + 24, y = s.y - popH / 2;
        if (x + popW > W - 12) x = s.x - 24 - popW;
        x = Math.max(12, Math.min(W - popW - 12, x)); y = Math.max(12, Math.min(H - popH - 12, y));
        pop.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      }
    });
  };

  /* chips */
  const chipEls = parts.map((p, i) => {
    const c = document.createElement("button");
    c.type = "button"; c.className = "chip"; c.textContent = `${i + 1} · ${p.name}`; c.setAttribute("aria-pressed", "false");
    c.addEventListener("click", () => select(focus === p.key ? null : p.key));
    chips.appendChild(c); return c;
  });
  function select(key) {
    focus = key;
    chipEls.forEach((c, i) => c.setAttribute("aria-pressed", String(parts[i].key === key)));
    if (!key) { v.setFocus(null); info.innerHTML = defaultInfo; pop.hidden = true; v.view(v.explodeGoal() > 0.3 ? "wide" : "hero"); return; }
    const i = parts.findIndex((x) => x.key === key), p = parts[i];
    v.setFocus(key === "front" ? ["front"] : [key]);
    if (+slider.value < 40) { slider.value = 70; v.setExplode(0.7); }
    v.lookAtPart(key);
    info.innerHTML = `<div class="k">${p.k}</div><h3 style="margin-top:6px">${p.name}</h3><p>${p.info}</p>`;
    pop.innerHTML = `<button type="button" class="x" aria-label="Close">×</button><div class="k">${i + 1} · ${p.k}</div><h4>${p.name}</h4><p>${p.info}</p><span class="hint">${sheetMQ.matches ? "tap" : "click"} ${i + 1} again to go back</span>`;
    pop.querySelector(".x").addEventListener("click", () => select(null));
    pop.hidden = false; popW = pop.offsetWidth; popH = pop.offsetHeight;
  }
  /* the phone sheet closes itself once the explorer scrolls out of view */
  new IntersectionObserver((e) => { if (!e[0].isIntersecting && focus && sheetMQ.matches) select(null); }).observe(v.canvas.closest("section") || v.canvas);
  slider.addEventListener("input", () => v.setExplode(slider.value / 100));
  v.setExplode(slider.value / 100);                  // start in the slider's position (partly exploded)
  if (+slider.value > 30) v.view("wide");
  $("view-reset").addEventListener("click", () => { select(null); slider.value = 0; v.setExplode(0); v.view("hero"); });

  /* breath test */
  const scr = { state: $("t-state"), data: $("t-data"), res: $("t-result"), canvas: $("t-curve") };
  const samples = {
    reference: { peak: 0.96, vol: 1.7, result: "REFERENCE", cls: "normal", led: "g", text: "REFERENCE PROFILE" },
    surrogate: { peak: 0.42, vol: 1.8, result: "ABNORMAL", cls: "abnormal", led: "r", text: "ABNORMAL · confirm in lab" },
    weak: { peak: 0.8, vol: 0.7, result: "INCONCLUSIVE", cls: "inconclusive", led: "y", text: "INCONCLUSIVE · retest" },
  };
  let sample = "reference", running = false;
  document.querySelectorAll("#sample-seg button").forEach((b) => b.addEventListener("click", () => {
    sample = b.dataset.s;
    document.querySelectorAll("#sample-seg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }));
  const ctx = scr.canvas.getContext("2d");
  function drawCurve(peak, upto, cls) {
    const c = scr.canvas, dpr = Math.min(devicePixelRatio || 1, 2);
    c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = c.clientWidth, h = c.clientHeight, f = (x, p) => 0.12 + 0.1 * x + p * 0.62 * Math.exp(-Math.pow((x - 0.55) / 0.13, 2));
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#1e2340"; ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, (h * i) / 6); ctx.lineTo(w, (h * i) / 6); ctx.stroke(); }
    const line = (p, u, col, dash) => {
      ctx.setLineDash(dash ? [5, 5] : []); ctx.strokeStyle = col; ctx.lineWidth = dash ? 1.5 : 2.4; ctx.beginPath();
      for (let i = 0; i <= 120 * u; i++) { const x = i / 120, y = h - 10 - f(x, p) * (h - 22); i ? ctx.lineTo(x * w, y) : ctx.moveTo(x * w, y); }
      ctx.stroke(); ctx.setLineDash([]);
    };
    line(1, 1, "#4a5080", true);
    if (peak != null) line(peak, upto, cls === "abnormal" ? "#ff7a73" : cls === "inconclusive" ? "#f6c355" : "#5fe0a0");
    ctx.fillStyle = "#8a90c0"; ctx.font = "10px JetBrains Mono, monospace"; ctx.fillText("potential →", w - 74, h - 4); ctx.fillText("current", 4, 11);
  }
  drawCurve(null);
  const setRes = (t, cls) => { scr.res.textContent = t; scr.res.className = "res" + (cls ? " state-" + cls : ""); };

  $("run-test").addEventListener("click", async () => {
    if (running) return; running = true; $("run-test").disabled = true;
    const s = samples[sample];
    select(null); slider.value = 0; v.setExplode(0); v.view("side");
    const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? Math.min(ms, 150) : ms));
    setRes("—"); drawCurve(null);
    scr.state.textContent = "CARTRIDGE OK"; scr.data.textContent = "lot verified · 37 °C"; v.model.setLeds("g");
    v.model.setScreen({ title: "READY", line: "blow steadily" }); await wait(900);
    v.model.particles.set(true); v.model.setLeds("y");
    for (let i = 0; i <= 30; i++) {
      const vol = (s.vol * i) / 30;
      scr.state.textContent = "BLOW"; scr.data.textContent = `flow ${(0.3 + Math.random() * 0.04).toFixed(2)} L/s · ${vol.toFixed(2)} L`;
      if (i % 3 === 0) v.model.setScreen({ title: "BLOW", line: `${vol.toFixed(2)} L exhaled`, vol });
      await wait(100);
    }
    v.model.particles.set(false);
    if (s.vol < 1.5) {
      scr.state.textContent = "RESULT"; scr.data.textContent = "exhaled volume too low";
      setRes(s.text, s.cls); v.model.setLeds(s.led); v.model.setScreen({ title: "RETEST", line: "breath too short", result: s.result, cls: s.cls });
      v.view("screen"); running = false; $("run-test").disabled = false; return;
    }
    scr.state.textContent = "REHYDRATE"; scr.data.textContent = "buffer released · incubating"; v.model.setScreen({ title: "INCUBATE", line: "buffer released" }); await wait(1300);
    v.view("screen");
    for (let i = 0; i <= 40; i++) {
      const u = i / 40; drawCurve(s.peak, u, s.cls);
      scr.state.textContent = "SWEEP"; scr.data.textContent = `Δ peak vs reference ${Math.round((s.peak - 1) * 100 * u)}%`;
      if (i % 4 === 0) v.model.setScreen({ title: "SWEEP", line: "reading strip", curve: { peak: s.peak, upto: u }, cls: s.cls });
      await wait(55);
    }
    scr.state.textContent = "RESULT"; scr.data.textContent = `Δ peak vs reference ${Math.round((s.peak - 1) * 100)}% · on-device ML`;
    setRes(s.text, s.cls); v.model.setLeds(s.led);
    v.model.setScreen({ title: "RESULT", line: "on-device ML", result: s.result, cls: s.cls, curve: { peak: s.peak, upto: 1 } });
    running = false; $("run-test").disabled = false;
  });
}

init().catch((e) => {
  console.error(e);
  document.querySelectorAll(".stage").forEach((s) => fail(s, "The 3D view couldn't load. Check your connection and refresh."));
});
