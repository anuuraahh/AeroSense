/* Hydrogel lab: a close-up, working 3D model of the electrode strip and its hydrogel pad (units ≈ mm).
   Breath mode: air turns at the Venturi slit, the heavier aerosol droplets can't, so they land in the gel.
   Touch mode:  the cover slides off, a fingertip holds on the gel, sweat from the pores soaks in.
   Either way the molecules diffuse down, sit on WE2's carbon, and the DPV peak falls. */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const GEL = { w: 8, h: 1.3, d: 5.2, y0: 0.05, cz: -0.2 };
GEL.top = GEL.y0 + GEL.h;
const WES = [{ x: -1.7, z: -0.2, r: 1.05 }, { x: 1.7, z: -0.2, r: 1.05 }];   // WE1 = background, WE2 = target
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ss = (a, b, t) => { t = clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);
const rn = () => Math.random() + Math.random() + Math.random() - 1.5;
const peakOf = (cov) => 25 * (1 - 0.76 * cov);          // 25 µA clean → ~6 µA fully blocked

/* Timelines are in "model seconds". The model runs at SLOW × real time, so every step
   stays on screen for 5–8 real seconds: long enough to read the caption and watch it happen. */
const SLOW = 0.6;
const MODES = {
  breath: {
    dur: 23, emit: [2.0, 9.0], sweep: [12.0, 17.0], read: 18.0,
    intro: ["Breath mode · ready", "The strip was scanned when it went in: 25 µA on clean carbon. Now someone blows."],
    steps: [
      ["Impact", 2.0, "Breath enters through a 1.2 mm slit. The air turns sideways just above the gel; the heavier droplets can't turn, so they hit it."],
      ["Merge", 5.0, "Each droplet lands in the gel and becomes part of it, releasing whatever it carried (the orange marker molecules)."],
      ["Diffuse", 8.0, "The gel's mesh is far wider than the molecules, so they drift down through it to the carbon electrodes."],
      ["Exchange", 12.0, "The reader sweeps the voltage. Probe ions (cyan) hand electrons to any free carbon: each spark is one of those handovers."],
      ["Block", 14.5, "The marker molecules sit on WE2's carbon. Probes can't reach those spots, so there are fewer sparks and less current."],
      ["Read", 18.0, "The DPV peak falls from 25 µA to about 6 µA. WE1 reads the background, and the result uses ΔI = WE2 − WE1."],
    ],
    cam: [[0, [10, 8, 12], [0, 1.8, -0.2]], [2.6, [6.8, 5.6, 8.8], [0, 2.5, -0.2]], [6.5, [5, 2.4, 7.4], [0.4, 1.0, -0.2]],
          [10.5, [4.6, 2.0, 6.4], [0.8, 0.6, -0.2]], [12.8, [3.4, 1.35, 4.4], [1.7, 0.25, -0.2]], [18, [8.5, 5.6, 10.5], [0, 1.2, -0.2]]],
  },
  touch: {
    dur: 24.5, cover: [2.0, 3.2], down: [3.2, 4.4], hold: [4.4, 10.4], up: [10.4, 11.6], emit: [4.6, 10.2], sweep: [13.0, 18.0], read: 19.0,
    intro: ["Touch mode · ready", "The breath didn't pass the 1.5 L gate, so the reader asks for a fingertip instead. Same cartridge, same gel."],
    steps: [
      ["Contact", 2.0, "The cover slides open and a finger presses on the gel. The capacitive ring checks it stays put for the whole hold."],
      ["Merge", 5.2, "Sweat from the pores on each fingerprint ridge soaks into the salty gel, carrying the marker with it."],
      ["Diffuse", 8.2, "The molecules drift down through the gel's mesh to the carbon, exactly as they do from breath."],
      ["Exchange", 13.0, "Finger lifts, and the same voltage sweep runs. Each spark is a probe ion handing an electron to free carbon."],
      ["Block", 15.5, "The marker sits on WE2's carbon and blocks the probes, so fewer sparks and less current."],
      ["Read", 19.0, "The peak falls the same way as a breath test, with the same thresholds. ΔI = WE2 − WE1."],
    ],
    cam: [[0, [10, 7.5, 11.5], [0, 1.6, -0.2]], [3.2, [9, 3.6, 8.2], [0, 2.0, -0.2]], [5.6, [7.4, 2.2, 7.6], [0, 1.1, -0.2]], [10.6, [6.8, 1.8, 7.0], [0, 1.0, -0.2]],
          [13.6, [3.4, 1.35, 4.4], [1.7, 0.25, -0.2]], [19, [8.5, 5.6, 10.5], [0, 1.2, -0.2]]],
  },
};

/* ---------- DOM ---------- */
function buildDom(root) {
  root.innerHTML = `
  <div class="stage gel-stage" data-cursor="drag">
    <canvas aria-label="Working 3D model of the hydrogel pad on the electrode strip"></canvas>
    <div class="stage-fallback">Loading 3D model…</div>
    <div class="gel-tags" aria-hidden="true"></div>
  </div>
  <div class="gel-bar">
    <div class="seg" data-g="mode" role="group" aria-label="Sampling mode">
      <button type="button" data-v="breath">Breath</button><button type="button" data-v="touch">Touch</button>
    </div>
    <div class="seg" data-g="sample" role="group" aria-label="Sample">
      <button type="button" data-v="marker">Marker</button><button type="button" data-v="clean">Clean</button>
    </div>
    <button class="gbtn" type="button" data-g="pause" aria-label="Pause">❚❚</button>
    <button class="gbtn" type="button" data-g="replay" aria-label="Replay from the start">↻</button>
  </div>
  <div class="gel-dpv">
    <canvas></canvas>
    <div class="row"><span>WE2 peak</span><b data-o="peak">—</b></div>
    <div class="row"><span>ΔI</span><b data-o="di">—</b></div>
    <div class="row"><span>result</span><b class="res" data-o="res">waiting</b></div>
    <div class="ghold" hidden><span>hold</span><i><b></b></i><em>0.0 s</em></div>
  </div>
  <div class="gel-cap" aria-live="polite">
    <div class="gel-prog"></div>
    <span class="k"></span><p></p>
  </div>`;
}

/* fingerprint whorl, drawn once: colour map and bump map for the fingertip */
function fingerTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 1024;
  const g = c.getContext("2d");
  g.fillStyle = "#d9a894"; g.fillRect(0, 0, 1024, 1024);
  g.strokeStyle = "#b07d6f"; g.lineCap = "round";
  for (let i = 0; i < 104; i++) {
    const rx = 8 + i * 5.2, ry = 6 + i * 4.4, seg = 180;
    g.lineWidth = 2.4; g.beginPath();
    let drawing = false;
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const wob = 1 + 0.035 * Math.sin(a * 5 + i * 0.7) + 0.02 * Math.sin(a * 11 + i);
      const x = 512 + Math.cos(a) * rx * wob, y = 500 + Math.sin(a) * ry * wob;
      const gap = Math.sin(a * 3 + i * 1.9) > 0.93;      // little breaks, like real ridges
      if (gap) { drawing = false; continue; }
      if (!drawing) { g.moveTo(x, y); drawing = true; } else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.fillStyle = "rgba(255,240,235,.55)";                    // sweat pores along the ridges
  for (let i = 0; i < 900; i++) { const a = Math.random() * 6.283, r = Math.random() * 480; g.beginPath(); g.arc(512 + Math.cos(a) * r, 500 + Math.sin(a) * r * 0.85, 1.8, 0, 6.283); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function roundRect(w, d, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

class GelLab {
  constructor(root) {
    this.root = root;
    this.mode = root.dataset.mode === "touch" ? "touch" : "breath";
    this.sample = "marker";
    this.stage = root.querySelector(".gel-stage");
    this.canvas = this.stage.querySelector("canvas");
    this.cap = root.querySelector(".gel-cap");
    this.prog = root.querySelector(".gel-prog");
    this.holdEl = root.querySelector(".ghold");
    this.paused = false;
    this.chart = root.querySelector(".gel-dpv canvas");
    this.out = Object.fromEntries([...root.querySelectorAll("[data-o]")].map((e) => [e.dataset.o, e]));
    this.visible = false; this.running = false; this.autoCam = true;
    this.three();
    this.ui();
    this.reset();
    this.stage.classList.add("ready");
  }

  /* ---------- scene ---------- */
  three() {
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: "high-performance" }));
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;
    const scene = (this.scene = new THREE.Scene());
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.8;
    const key = new THREE.DirectionalLight(0xffffff, 1.8); key.position.set(6, 12, 9);
    const rim = new THREE.DirectionalLight(0x8e9bff, 2.0); rim.position.set(-9, 6, -8);
    scene.add(key, rim, new THREE.HemisphereLight(0xdfe3ff, 0x0a0b14, 0.55));

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.05, 200);
    this.camera.position.set(10, 8, 12);
    const c = (this.controls = new OrbitControls(this.camera, this.canvas));
    c.enableDamping = true; c.dampingFactor = 0.08; c.enableZoom = false; c.enablePan = false;
    c.minPolarAngle = 0.12; c.maxPolarAngle = 1.52; c.target.set(0, 1.5, -0.2);
    this.canvas.style.touchAction = "pan-y";
    c.addEventListener("start", () => { this.autoCam = false; });

    /* strip, printed electrodes, insulation, contact pads */
    const pet = new THREE.MeshStandardMaterial({ color: 0xdfe2ee, roughness: 0.55 });
    const silver = new THREE.MeshStandardMaterial({ color: 0xc7cad6, roughness: 0.32, metalness: 0.9 });
    const carbon = () => new THREE.MeshStandardMaterial({ color: 0x17181f, roughness: 0.95, emissive: 0x4fb3e8, emissiveIntensity: 0 });
    const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); scene.add(o); return o; };
    box(11, 0.3, 8.4, pet, 0, -0.15, 0.35);
    this.weMat = [carbon(), carbon()];
    WES.forEach((w, i) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(w.r, w.r, 0.05, 64), this.weMat[i]); o.position.set(w.x, 0.025, w.z); scene.add(o); });
    const ce = (this.ceMat = carbon());
    box(7.4, 0.05, 0.28, ce, 0, 0.025, -2.06); box(0.28, 0.05, 4.0, ce, -3.56, 0.025, -0.2); box(0.28, 0.05, 4.0, ce, 3.56, 0.025, -0.2);
    box(3.2, 0.05, 0.28, ce, -2.1, 0.025, 1.66); box(3.2, 0.05, 0.28, ce, 2.1, 0.025, 1.66);
    box(1.4, 0.05, 0.42, silver, 0, 0.025, 1.2);                                        // RE (Ag/AgCl)
    [-2.4, -0.8, 0.8, 2.4].forEach((x) => { box(0.22, 0.03, 1.6, silver, x, 0.015, 3.4); box(0.9, 0.04, 0.6, silver, x, 0.02, 4.1); });
    box(10.4, 0.06, 0.8, new THREE.MeshStandardMaterial({ color: 0x26306a, roughness: 0.6 }), 0, 0.04, 3.1);

    /* capacitive touch ring around the pad */
    const ringShape = roundRect(9.4, 6.6, 0.7); ringShape.holes.push(roundRect(8.6, 5.8, 0.5));
    const ringGeo = new THREE.ExtrudeGeometry(ringShape, { depth: 0.05, bevelEnabled: false }); ringGeo.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshStandardMaterial({ color: 0x8e9bff, emissive: 0x8e9bff, emissiveIntensity: 0.1, metalness: 0.6, roughness: 0.3 });
    const ring = new THREE.Mesh(ringGeo, this.ringMat); ring.position.set(0, 0.0, GEL.cz); scene.add(ring);

    /* the gel: back faces + front faces for a sense of volume, and a faint agarose mesh inside */
    const gelGeo = new RoundedBoxGeometry(GEL.w, GEL.h, GEL.d, 5, 0.32);
    const gy = GEL.y0 + GEL.h / 2;
    const back = new THREE.Mesh(gelGeo, new THREE.MeshPhysicalMaterial({ color: 0x4f97d6, transparent: true, opacity: 0.16, roughness: 0.2, side: THREE.BackSide, depthWrite: false }));
    const front = new THREE.Mesh(gelGeo, new THREE.MeshPhysicalMaterial({ color: 0x6aaeea, transparent: true, opacity: 0.2, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x0f2c4a, emissiveIntensity: 0.5, depthWrite: false }));
    back.position.set(0, gy, GEL.cz); front.position.copy(back.position);
    back.renderOrder = 1; front.renderOrder = 5; scene.add(back, front);
    const fib = [];
    for (let i = 0; i < 320; i++) {
      const p = new THREE.Vector3(rand(-3.7, 3.7), rand(GEL.y0 + 0.1, GEL.top - 0.1), GEL.cz + rand(-2.4, 2.4));
      const d = new THREE.Vector3(rn(), rn(), rn()).normalize().multiplyScalar(rand(0.25, 0.7));
      fib.push(p.x, p.y, p.z, p.x + d.x, p.y + d.y, p.z + d.z);
    }
    const fg = new THREE.BufferGeometry(); fg.setAttribute("position", new THREE.Float32BufferAttribute(fib, 3));
    const fibers = new THREE.LineSegments(fg, new THREE.LineBasicMaterial({ color: 0xa8d0ff, transparent: true, opacity: 0.2, depthWrite: false }));
    fibers.renderOrder = 2; scene.add(fibers);

    /* probe ions (ferri/ferrocyanide) */
    this.NP = 170;
    this.probes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: 0x6fdcff }), this.NP);
    this.pp = new Float32Array(this.NP * 3); this.pv = new Float32Array(this.NP * 3);
    scene.add(this.probes);

    /* drug-marker molecules */
    this.NM = 130;
    this.mols = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.105, 0),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0x6b2f00, emissiveIntensity: 0.8, roughness: 0.5, metalness: 0, envMapIntensity: 0.35, flatShading: true }), this.NM);
    this.mols.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.probes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mols);
    this.m = Array.from({ length: this.NM }, () => ({ on: false, stuck: false, p: new THREE.Vector3(), v: new THREE.Vector3(), we: 1, rot: new THREE.Euler() }));

    /* binding sites on each working electrode (sunflower pattern) */
    this.sites = WES.map((w) => Array.from({ length: 64 }, (_, i) => {
      const a = i * 2.39996, rr = Math.sqrt((i + 0.5) / 64) * (w.r - 0.12);
      return { x: w.x + Math.cos(a) * rr, z: w.z + Math.sin(a) * rr, taken: false };
    }));

    /* sparks: an electron handed over at a free carbon site */
    this.sparks = Array.from({ length: 40 }, () => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.renderOrder = 9; s.visible = false; scene.add(s); return { o: s, t: 9 };
    });

    /* splash rings where a droplet lands */
    this.rings = Array.from({ length: 10 }, () => {
      const s = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      s.rotation.x = -Math.PI / 2; s.renderOrder = 7; s.visible = false; scene.add(s); return { o: s, t: 9 };
    });

    /* aerosol droplets */
    const dropMat = new THREE.MeshPhysicalMaterial({ color: 0xdff3ff, transparent: true, opacity: 0.62, roughness: 0.04, clearcoat: 1, emissive: 0x1a3550, emissiveIntensity: 0.6, depthWrite: false });
    this.drops = Array.from({ length: 14 }, () => {
      const o = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), dropMat); o.renderOrder = 6; o.visible = false; scene.add(o);
      return { o, on: false, v: new THREE.Vector3(), r: 0.2, merge: -1, released: false };
    });

    /* sweat droplets (touch mode) */
    const sweatMat = new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.85, depthWrite: false });
    this.sweat = Array.from({ length: 36 }, () => { const o = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), sweatMat); o.renderOrder = 6; o.visible = false; scene.add(o); return { o, on: false, t: 0 }; });

    /* airflow tracers + the Venturi slit (breath mode) */
    this.NA = 280;
    this.ap = new Float32Array(this.NA * 3); this.av = new Float32Array(this.NA * 3);
    const ag = new THREE.BufferGeometry(); ag.setAttribute("position", new THREE.BufferAttribute(this.ap, 3));
    this.airMat = new THREE.PointsMaterial({ color: 0x4fb3e8, size: 0.075, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.air = new THREE.Points(ag, this.airMat); this.air.renderOrder = 8; this.air.frustumCulled = false; scene.add(this.air);
    this.nozzle = new THREE.Group();
    const nMat = (this.nozzleMat = new THREE.MeshPhysicalMaterial({ color: 0x2a2f4a, transparent: true, opacity: 0.45, roughness: 0.35, metalness: 0.1, depthWrite: false }));
    const nGeo = new RoundedBoxGeometry(8.6, 1.6, 2.2, 3, 0.12);
    const eMat = (this.nozzleEdge = new THREE.LineBasicMaterial({ color: 0x8e9bff, transparent: true, opacity: 0.4 }));
    [-1, 1].forEach((s) => {
      const b = new THREE.Mesh(nGeo, nMat); b.position.set(0, GEL.top + 2.8, GEL.cz + s * 1.7); b.renderOrder = 7;
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(8.6, 1.6, 2.2)), eMat); e.position.copy(b.position);
      this.nozzle.add(b, e);
    });
    scene.add(this.nozzle);

    /* sliding cover (touch mode) */
    this.cover = new THREE.Mesh(new RoundedBoxGeometry(8.8, 0.22, 5.9, 3, 0.08), new THREE.MeshStandardMaterial({ color: 0x1b1f33, roughness: 0.4, metalness: 0.5 }));
    this.cover.position.set(0, GEL.top + 0.13, GEL.cz); scene.add(this.cover);

    /* fingertip: a flattened, tilted capsule with a whorl on its pad */
    const R = 2.4, L = 9;
    const fgeo = new THREE.CapsuleGeometry(R, L, 20, 64);
    fgeo.rotateX(Math.PI / 2); fgeo.translate(0, 0, L / 2); fgeo.scale(1.25, 0.85, 1); fgeo.rotateX(-0.3);
    const pos = fgeo.attributes.position, uv = fgeo.attributes.uv, FLAT = -1.72;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i); if (y < FLAT) pos.setY(i, FLAT);
      uv.setXY(i, pos.getX(i) / 7.4 + 0.5, pos.getZ(i) / 7.4 + 0.5);
    }
    fgeo.computeVertexNormals();
    const tex = fingerTexture();
    this.finger = new THREE.Mesh(fgeo, new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.6, roughness: 0.62 }));
    this.fingerRest = GEL.top - FLAT + 0.02;
    this.finger.position.set(0, this.fingerRest + 7, GEL.cz + 0.2);
    scene.add(this.finger);

    /* labels pinned to the model */
    const tagBox = this.stage.querySelector(".gel-tags");
    const tag = (text, p, modes, minor) => { const el = document.createElement("span"); el.className = "tag3d" + (minor ? " minor" : ""); el.textContent = text; tagBox.appendChild(el); return { el, p: new THREE.Vector3(...p), modes }; };
    this.tags = [
      tag("WE1 · background", [WES[0].x, 0.06, WES[0].z + 0.4], ["breath", "touch"]),
      tag("WE2 · target", [WES[1].x, 0.06, WES[1].z + 0.4], ["breath", "touch"]),
      tag("RE", [0, 0.06, 1.2], ["breath", "touch"], true),
      tag("CE", [-3.56, 0.06, 1.0], ["breath", "touch"], true),
      tag("hydrogel · ~1% agarose", [-3.2, GEL.top, 1.8], ["breath", "touch"]),
      tag("Venturi slit · 1.2 mm", [3.4, GEL.top + 3.6, GEL.cz], ["breath"]),
      tag("2 mm gap", [4.3, GEL.top + 1.0, GEL.cz], ["breath"], true),
      tag("capacitive ring", [4.6, 0.05, 2.2], ["touch"]),
    ];
    this._v = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._mx = new THREE.Matrix4();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.stage);
  }

  resize() {
    const w = this.stage.clientWidth, h = this.stage.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.distK = clamp(1.25 / (w / h), 1, 2);
    /* the caption sits over the bottom of the stage on wide screens: lift the model a little */
    const lift = w > 760 ? Math.round(h * 0.07) : 0;
    this.camera.setViewOffset(w, h, 0, lift, w, h);
    this.camera.updateProjectionMatrix();
    const cw = this.chart.clientWidth || 240, chh = this.chart.clientHeight || 88, dpr = Math.min(devicePixelRatio || 1, 2);
    this.chart.width = cw * dpr; this.chart.height = chh * dpr; this.cdpr = dpr;
    this.drawChart();
  }

  /* ---------- controls ---------- */
  ui() {
    const segs = this.root.querySelectorAll(".seg[data-g]");
    const sync = () => segs.forEach((s) => s.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === (s.dataset.g === "mode" ? this.mode : this.sample)))));
    segs.forEach((s) => s.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (s.dataset.g === "mode") this.mode = b.dataset.v; else this.sample = b.dataset.v;
      sync(); this.autoCam = true; this.setPause(false); this.reset();
    }));
    const pb = this.root.querySelector("[data-g=pause]");
    const setPause = (p) => { this.paused = p; pb.textContent = p ? "▶" : "❚❚"; pb.setAttribute("aria-label", p ? "Play" : "Pause"); this.root.classList.toggle("paused", p); };
    this.setPause = setPause;
    pb.addEventListener("click", () => setPause(!this.paused));
    this.root.querySelector("[data-g=replay]").addEventListener("click", () => { this.autoCam = true; setPause(false); this.reset(); });
    sync();
  }

  reset() {
    const M = (this.M = MODES[this.mode]);
    this.t = 0; this.peakShown = null;
    this.root.dataset.mode = this.mode;
    this.prog.innerHTML = M.steps.map(() => "<i><b></b></i>").join("");
    this.progBars = [...this.prog.querySelectorAll("b")]; this.stepIdx = -2;
    this.holdEl.hidden = this.mode !== "touch";
    for (let i = 0; i < this.NP; i++) {
      this.pp[i * 3] = rand(-3.7, 3.7); this.pp[i * 3 + 1] = rand(GEL.y0 + 0.08, GEL.top - 0.08); this.pp[i * 3 + 2] = GEL.cz + rand(-2.45, 2.45);
      this.pv[i * 3] = this.pv[i * 3 + 1] = this.pv[i * 3 + 2] = 0;
    }
    this.m.forEach((m) => { m.on = false; m.stuck = false; });
    this.sites.forEach((s) => s.forEach((x) => (x.taken = false)));
    this.drops.forEach((d) => { d.on = false; d.o.visible = false; });
    this.sweat.forEach((d) => { d.on = false; d.rel = false; d.o.visible = false; });
    this.sparks.forEach((s) => { s.t = 9; s.o.visible = false; });
    this.rings.forEach((s) => { s.t = 9; s.o.visible = false; });
    for (let i = 0; i < this.NA; i++) this.spawnAir(i, true);
    /* droplet schedule (breath) */
    this.sched = [];
    if (this.mode === "breath") { for (let i = 0; i < 24; i++) this.sched.push(rand(M.emit[0], M.emit[1])); this.sched.sort((a, b) => a - b); }
    this.sweatAcc = 0;
    this.out.peak.textContent = "baseline 25.0 µA"; this.out.di.textContent = "—"; this.out.res.textContent = "waiting"; this.out.res.className = "res";
    this.cov = [0, 0];
    this.drawChart();
  }

  spawnAir(i, scatter) {
    const a = this.ap, v = this.av, k = i * 3;
    a[k] = rand(-3.6, 3.6); a[k + 1] = scatter ? rand(GEL.top + 0.3, GEL.top + 4.6) : GEL.top + rand(3.4, 4.8); a[k + 2] = GEL.cz + rand(-0.5, 0.5);
    v[k] = 0; v[k + 1] = -rand(3.4, 4.4); v[k + 2] = 0;
  }

  release(x, y, z, n) {
    for (let k = 0; k < n; k++) {
      const m = this.m.find((q) => !q.on); if (!m) return;
      m.on = true; m.stuck = false; m.we = Math.random() < 0.86 ? 1 : 0;
      m.p.set(x + rand(-0.15, 0.15), y, z + rand(-0.15, 0.15)); m.v.set(rn() * 0.3, -0.2, rn() * 0.3);
      m.rot.set(rand(0, 6), rand(0, 6), rand(0, 6));
    }
  }
  spark(x, z) { const s = this.sparks.find((q) => q.t > 0.4); if (!s) return; s.t = 0; s.o.position.set(x, 0.08, z); s.o.visible = true; }
  splash(x, z) { const s = this.rings.find((q) => q.t > 0.7); if (!s) return; s.t = 0; s.o.position.set(x, GEL.top + 0.015, z); s.o.visible = true; }

  /* ---------- simulation ---------- */
  step(dt) {
    const M = this.M, t = (this.t += dt), breath = this.mode === "breath", marker = this.sample === "marker";
    const top = GEL.top;

    /* breath: airflow + droplets */
    const airOn = breath ? ss(M.emit[0] - 0.8, M.emit[0], t) * (1 - ss(M.emit[1] + 0.2, M.emit[1] + 1.2, t)) : 0;
    this.airMat.opacity = 0.55 * airOn;
    const nz = breath ? 1 : 0;
    this.nozzleMat.opacity += (0.45 * nz - this.nozzleMat.opacity) * Math.min(1, dt * 5);
    this.nozzleEdge.opacity = this.nozzleMat.opacity * 0.9;
    this.nozzle.visible = this.nozzleMat.opacity > 0.02;
    if (airOn > 0.01) {
      const a = this.ap, v = this.av;
      for (let i = 0; i < this.NA; i++) {
        const k = i * 3;
        if (a[k + 1] < top + 1.5) {                                      // near the gel the air turns sideways
          const side = a[k + 2] >= GEL.cz ? 1 : -1;
          v[k + 2] += side * 22 * dt; v[k + 1] *= 1 - Math.min(1, 7 * dt); v[k + 2] = clamp(v[k + 2], -4.5, 4.5);
          if (a[k + 1] < top + 0.3) a[k + 1] = top + 0.3;
        }
        a[k] += v[k] * dt; a[k + 1] += v[k + 1] * dt; a[k + 2] += v[k + 2] * dt;
        if (Math.abs(a[k + 2] - GEL.cz) > 4.4) this.spawnAir(i, false);
      }
      this.air.geometry.attributes.position.needsUpdate = true;
    }
    while (this.sched.length && this.sched[0] <= t) {
      this.sched.shift();
      const d = this.drops.find((q) => !q.on); if (!d) continue;
      d.on = true; d.merge = -1; d.released = false; d.r = rand(0.16, 0.32);
      d.o.position.set(rand(-3, 3), top + 4.4, GEL.cz + rand(-0.3, 0.3)); d.v.set(rand(-0.25, 0.25), -rand(3.6, 4.6), rand(-0.12, 0.12));
      d.o.scale.setScalar(d.r); d.o.visible = true;
    }
    this.drops.forEach((d) => {
      if (!d.on) return;
      if (d.merge < 0) {
        d.v.y -= 2 * dt; d.o.position.addScaledVector(d.v, dt);
        if (d.o.position.y - d.r <= top) { d.merge = 0; d.o.position.y = top + d.r * 0.6; this.splash(d.o.position.x, d.o.position.z); }
      } else {
        d.merge += dt; const k = clamp(d.merge / 0.6, 0, 1);
        d.o.scale.set(d.r * (1 + 0.5 * k), d.r * (1 - 0.8 * k), d.r * (1 + 0.5 * k)); d.o.position.y = top + d.r * 0.6 * (1 - k) - 0.05 * k;
        if (!d.released && k > 0.4) { d.released = true; if (marker) this.release(d.o.position.x, top - 0.12, d.o.position.z, 3 + (Math.random() < 0.5 ? 1 : 0)); }
        if (k >= 1) { d.on = false; d.o.visible = false; }
      }
    });

    /* touch: cover, finger, ring, sweat */
    let contact = 0;
    if (!breath) {
      this.cover.visible = true;
      this.cover.position.x = ss(M.cover[0], M.cover[1], t) * 9.6;
      const down = ss(M.down[0], M.down[1], t) * (1 - ss(M.up[0], M.up[1], t));
      this.finger.visible = true;
      this.finger.position.y = this.fingerRest + (1 - down) * 7;
      contact = t > M.down[1] - 0.05 && t < M.up[0] + 0.05 ? 1 : 0;
      const hp = clamp((t - M.hold[0]) / (M.hold[1] - M.hold[0]), 0, 1);
      this.holdEl.querySelector("b").style.transform = `scaleX(${hp})`;
      const hs = (M.hold[1] - M.hold[0]) / SLOW;         // real seconds
      this.holdEl.querySelector("em").textContent = hp >= 1 ? `✓ ${Math.round(hs)} s` : (hp * hs).toFixed(1) + " s";
      this.holdEl.classList.toggle("on", contact === 1);
      if (t > M.emit[0] && t < M.emit[1]) {
        this.sweatAcc += dt * 20;
        while (this.sweatAcc > 1) {
          this.sweatAcc--;
          const s = this.sweat.find((q) => !q.on); if (!s) break;
          const a = Math.random() * 6.283, rr = Math.sqrt(Math.random());
          s.on = true; s.t = 0; s.o.position.set(Math.cos(a) * rr * 1.5, top + 0.02, GEL.cz + 0.2 + Math.sin(a) * rr * 1.2); s.o.visible = true; s.o.scale.setScalar(1);
        }
      }
    } else { this.cover.visible = false; this.finger.visible = false; }
    this.sweat.forEach((s) => {
      if (!s.on) return; s.t += dt;
      s.o.position.y -= 0.45 * dt; s.o.scale.setScalar(1 - clamp((s.t - 0.35) / 0.3, 0, 1));
      if (s.t > 0.35 && !s.rel) { s.rel = true; if (marker && Math.random() < 0.72) this.release(s.o.position.x, s.o.position.y, s.o.position.z, 1); }
      if (s.t > 0.65) { s.on = false; s.rel = false; s.o.visible = false; }
    });
    const pulse = 0.5 + 0.5 * Math.sin(t * 7);
    this.ringMat.emissiveIntensity += ((breath ? 0.08 : 0.12 + contact * (0.8 + 0.4 * pulse)) - this.ringMat.emissiveIntensity) * Math.min(1, dt * 8);

    /* sweep */
    const sw = M.sweep, sweeping = t >= sw[0] && t <= sw[1];
    const glow = sweeping ? 0.35 + 0.25 * Math.sin(t * 9) : 0;
    this.weMat.forEach((m) => (m.emissiveIntensity += (glow * 0.6 - m.emissiveIntensity) * Math.min(1, dt * 6)));
    this.ceMat.emissiveIntensity = this.weMat[0].emissiveIntensity * 0.5;

    /* probes: Brownian motion, pulled to the carbon during the sweep */
    const pp = this.pp, pv = this.pv;
    for (let i = 0; i < this.NP; i++) {
      const k = i * 3;
      pv[k] += rn() * dt * 7; pv[k + 1] += rn() * dt * 7 - (sweeping ? 2.2 * dt : 0); pv[k + 2] += rn() * dt * 7;
      const damp = 1 - Math.min(1, 2.2 * dt); pv[k] *= damp; pv[k + 1] *= damp; pv[k + 2] *= damp;
      pp[k] += pv[k] * dt; pp[k + 1] += pv[k + 1] * dt; pp[k + 2] += pv[k + 2] * dt;
      if (pp[k] < -3.75 || pp[k] > 3.75) { pp[k] = clamp(pp[k], -3.75, 3.75); pv[k] *= -1; }
      if (pp[k + 2] < GEL.cz - 2.5 || pp[k + 2] > GEL.cz + 2.5) { pp[k + 2] = clamp(pp[k + 2], GEL.cz - 2.5, GEL.cz + 2.5); pv[k + 2] *= -1; }
      if (pp[k + 1] > top - 0.07) { pp[k + 1] = top - 0.07; pv[k + 1] = -Math.abs(pv[k + 1]); }
      if (pp[k + 1] < 0.09) {
        pp[k + 1] = 0.09; pv[k + 1] = Math.abs(pv[k + 1]) + 0.4;
        if (sweeping) {
          for (let w = 0; w < 2; w++) {
            const W = WES[w], dx = pp[k] - W.x, dz = pp[k + 2] - W.z;
            if (dx * dx + dz * dz < W.r * W.r) {
              let best = null, bd = 9;
              for (const s of this.sites[w]) { const d2 = (s.x - pp[k]) ** 2 + (s.z - pp[k + 2]) ** 2; if (d2 < bd) { bd = d2; best = s; } }
              if (best && !best.taken && Math.random() < 0.8) { this.spark(pp[k], pp[k + 2]); pv[k + 1] = 1.6; }
            }
          }
        }
      }
      this._v.set(pp[k], pp[k + 1], pp[k + 2]); this._mx.makeTranslation(this._v.x, this._v.y, this._v.z);
      this.probes.setMatrixAt(i, this._mx);
    }
    this.probes.instanceMatrix.needsUpdate = true;

    /* molecules: drift down, steer to their electrode, stick on a free site */
    for (let i = 0; i < this.NM; i++) {
      const m = this.m[i];
      if (!m.on) { this._mx.makeScale(0, 0, 0); this.mols.setMatrixAt(i, this._mx); continue; }
      if (!m.stuck) {
        const W = WES[m.we];
        m.v.x += (rn() * 3 + (W.x - m.p.x) * 0.9) * dt; m.v.z += (rn() * 3 + (W.z - m.p.z) * 0.9) * dt;
        m.v.y += (rn() * 2 - 1.1) * dt;
        m.v.multiplyScalar(1 - Math.min(1, 1.6 * dt)); m.p.addScaledVector(m.v, dt);
        m.p.x = clamp(m.p.x, -3.7, 3.7); m.p.z = clamp(m.p.z, GEL.cz - 2.45, GEL.cz + 2.45); m.p.y = Math.min(m.p.y, top - 0.1);
        m.rot.x += dt * 1.5; m.rot.y += dt;
        if (m.p.y < 0.16) {
          m.p.y = 0.16; m.v.y = Math.abs(m.v.y) * 0.4;
          const dx = m.p.x - W.x, dz = m.p.z - W.z;
          if (dx * dx + dz * dz < W.r * W.r) {
            const taken = this.sites[m.we].filter((s) => s.taken).length;
            if (m.we === 1 || taken < 7) {                        // WE1 only picks up a little background
              let best = null, bd = 99;
              for (const s of this.sites[m.we]) if (!s.taken) { const d2 = (s.x - m.p.x) ** 2 + (s.z - m.p.z) ** 2; if (d2 < bd) { bd = d2; best = s; } }
              if (best) { best.taken = true; m.stuck = true; m.p.set(best.x, 0.13, best.z); }
            } else m.we = 1;
          }
        }
      }
      this._q.setFromEuler(m.rot); this._s.setScalar(1); this._mx.compose(m.p, this._q, this._s);
      this.mols.setMatrixAt(i, this._mx);
    }
    this.mols.instanceMatrix.needsUpdate = true;
    this.cov = this.sites.map((s) => s.filter((x) => x.taken).length / s.length);

    this.sparks.forEach((s) => { if (s.t > 0.4) { s.o.visible = false; return; } s.t += dt; const k = s.t / 0.4; s.o.scale.setScalar(0.6 + 2 * k); s.o.material.opacity = 1 - k; });
    this.rings.forEach((s) => { if (s.t > 0.7) { s.o.visible = false; return; } s.t += dt; const k = s.t / 0.7; s.o.scale.setScalar(0.15 + 0.9 * k); s.o.material.opacity = 0.7 * (1 - k); });

    /* readouts */
    if (sweeping || t > sw[1]) this.drawChart();
    if (t >= M.read && this.peakShown == null) {
      const p2 = peakOf(this.cov[1]), p1 = peakOf(this.cov[0]);
      this.peakShown = p2;
      this.out.peak.textContent = `${p2.toFixed(1)} µA`;
      this.out.di.textContent = `${(p2 - p1).toFixed(1)} µA`;
      const res = p2 >= 20 ? ["REFERENCE", "normal"] : p2 <= 10 ? ["ABNORMAL · marker", "abnormal"] : ["INCONCLUSIVE", "inconclusive"];
      this.out.res.textContent = res[0]; this.out.res.className = "res " + res[1];
    }

    /* steps + caption */
    let idx = -1; M.steps.forEach((s, i) => { if (t >= s[1]) idx = i; });
    if (idx !== this.stepIdx) {
      this.stepIdx = idx;
      const s = M.steps[idx], txt = idx < 0 ? M.intro : [`${String(idx + 1).padStart(2, "0")} / ${String(M.steps.length).padStart(2, "0")} · ${s[0]}`, s[2]];
      this.cap.querySelector(".k").textContent = txt[0];
      this.cap.querySelector("p").textContent = txt[1];
      this.cap.classList.remove("in"); void this.cap.offsetWidth; this.cap.classList.add("in");
    }
    /* progress: one bar per step, filling while that step is on screen */
    this.progBars.forEach((b, i) => {
      const a = M.steps[i][1], z = i + 1 < M.steps.length ? M.steps[i + 1][1] : M.dur;
      b.style.transform = `scaleX(${clamp((t - a) / (z - a), 0, 1)})`;
    });

    if (t > M.dur) { this.reset(); }
  }

  /* DPV: dashed baseline (clean strip), faint WE1, bright WE2 drawn as the sweep runs */
  drawChart() {
    const c = this.chart, g = c.getContext("2d"), W = c.width, H = c.height, d = this.cdpr || 1;
    if (!W) return;
    g.clearRect(0, 0, W, H);
    const px = (v) => ((v + 0.2) / 0.8) * (W - 16 * d) + 8 * d, py = (i) => H - 14 * d - (i / 28) * (H - 26 * d);
    const f = (v, k) => 1.5 + 2 * (v + 0.2) + 25 * k * Math.exp(-(((v - 0.2) / 0.11) ** 2));
    g.strokeStyle = "rgba(142,155,255,.12)"; g.lineWidth = d;
    [-0.2, 0, 0.2, 0.4, 0.6].forEach((v) => { g.beginPath(); g.moveTo(px(v), 6 * d); g.lineTo(px(v), H - 14 * d); g.stroke(); });
    g.fillStyle = "#6f7497"; g.font = `${10 * d}px ui-monospace, monospace`;
    g.fillText("−0.2 V", px(-0.2), H - 2 * d); g.fillText("+0.2", px(0.2) - 12 * d, H - 2 * d); g.fillText("+0.6 V", px(0.6) - 36 * d, H - 2 * d);
    const line = (k, to, style, dash, w) => { g.setLineDash(dash); g.strokeStyle = style; g.lineWidth = w * d; g.beginPath(); for (let v = -0.2; v <= to + 1e-6; v += 0.005) { const x = px(v), y = py(f(v, k)); v === -0.2 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); g.setLineDash([]); };
    line(1, 0.6, "rgba(180,189,255,.45)", [4 * d, 4 * d], 1.2);
    const M = this.M; if (!M) return;
    const sw = M.sweep, t = this.t || 0;
    if (t < sw[0]) return;
    const to = -0.2 + 0.8 * clamp((t - sw[0]) / (sw[1] - sw[0]), 0, 1);
    const k1 = 1 - 0.76 * this.cov[0], k2 = 1 - 0.76 * this.cov[1];
    line(k1, to, "rgba(163,168,200,.55)", [], 1.2);
    line(k2, to, "#4fb3e8", [], 2);
    const x = px(to), y = py(f(to, k2));
    g.fillStyle = "#4fb3e8"; g.beginPath(); g.arc(x, y, 3 * d, 0, 6.283); g.fill();
  }

  /* ---------- camera + frame ---------- */
  camAt(t) {
    const K = this.M.cam; let i = 0; while (i < K.length - 1 && t >= K[i + 1][0]) i++;
    const a = K[i], b = K[Math.min(i + 1, K.length - 1)];
    const k = a === b ? 1 : ss(a[0], b[0], t);
    const lerp = (p, q) => p.map((v, j) => v + (q[j] - v) * k);
    return [lerp(a[1], b[1]), lerp(a[2], b[2])];
  }

  frame(dt) {
    if (!this.paused) this.step(dt * SLOW);
    const c = this.controls;
    if (this.autoCam) {
      const [p, tg] = this.camAt(this.t);
      const k = this.distK || 1;                          // narrow stage: step back so the pad still fits across
      for (let j = 0; j < 3; j++) p[j] = tg[j] + (p[j] - tg[j]) * k;
      this.camera.position.lerp(this._v.set(...p), Math.min(1, dt * 1.6));
      c.target.lerp(new THREE.Vector3(...tg), Math.min(1, dt * 1.6));
    }
    c.update();
    this.renderer.render(this.scene, this.camera);
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    this.tags.forEach((tg) => {
      const show = tg.modes.includes(this.mode);
      const v = this._v.copy(tg.p).project(this.camera);
      const ok = show && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      tg.el.style.opacity = ok ? "" : "0";
      if (ok) tg.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -135%)`;
    });
  }

  start() {
    if (this.running) return; this.running = true;
    let last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  stop() { this.running = false; }
}

/* build each lab only when it's close to the screen; run it only while it's on screen */
function mount(root) {
  const test = document.createElement("canvas");
  if (!(test.getContext("webgl2") || test.getContext("webgl"))) { root.innerHTML = '<p class="note">This 3D model needs WebGL.</p>'; return; }
  buildDom(root);                                         // the layout is there right away; the 3D arrives later
  let lab = null, onScreen = false, seen = false;
  const build = () => {
    if (lab) return;
    try { lab = new GelLab(root); } catch (e) { console.error(e); return; }
    const vis = new IntersectionObserver((en) => {
      const was = onScreen; onScreen = en[0].isIntersecting;
      if (onScreen && !document.hidden) { if (!seen || (!was && lab.t > lab.M.dur * 0.8)) lab.reset(); seen = true; lab.start(); } else lab.stop();
    }, { threshold: 0.35 });
    vis.observe(lab.stage);
    document.addEventListener("visibilitychange", () => { if (document.hidden) lab.stop(); else if (onScreen) lab.start(); });
  };
  const near = new IntersectionObserver((en) => {
    if (en.some((e) => e.isIntersecting)) { near.disconnect(); (window.__afterCurtain || ((f) => f()))(build); }
  }, { rootMargin: "600px 0px" });
  near.observe(root);
}
document.querySelectorAll(".gellab").forEach(mount);
