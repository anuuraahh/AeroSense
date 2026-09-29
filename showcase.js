/* Scroll showcase on the home page: after NOSTROMO blurs away, "AeroSense" and a large
   3D model of the finished reader (one solid piece) come into focus, turn as you scroll,
   then blur away into the rest of the page.
   site.js works out the scroll progress and publishes it as window.__heroProg (0 → 1). */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildConceptModel } from "./device3d.js?v=678706";

const canvas = document.getElementById("showcase3d");

function init() {
  if (!canvas) return;
  const test = document.createElement("canvas");
  if (!(test.getContext("webgl2") || test.getContext("webgl"))) return;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 1.0;
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);

  /* studio lighting: warm-white key, periwinkle rim so the white shell reads against the dark */
  const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(9, 16, 14); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -12, right: 12, top: 14, bottom: -12 }); key.shadow.radius = 6; key.shadow.bias = -0.0005;
  const rim = new THREE.DirectionalLight(0x8e9bff, 2.4); rim.position.set(-12, 8, -10);
  const fill = new THREE.DirectionalLight(0xb4bdff, 0.5); fill.position.set(-10, -2, 12);
  scene.add(key, rim, fill, new THREE.HemisphereLight(0xdfe3ff, 0x0a0b14, 0.5));

  const model = buildConceptModel({ solid: true });   // the finished product: one opaque piece
  model.particles.group.visible = false;
  model.setScreen({ title: "READY", line: "blow to begin" }); model.setLeds("g");
  const turn = new THREE.Group(); turn.add(model.root); scene.add(turn);
  model.root.position.y = -1.4;

  /* soft contact shadow + a faint periwinkle pool under the device */
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 48), new THREE.ShadowMaterial({ opacity: 0.35 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -8.3; floor.receiveShadow = true; scene.add(floor);
  const glowC = document.createElement("canvas"); glowC.width = glowC.height = 128;
  const gg = glowC.getContext("2d"), gr = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(142,155,255,.55)"); gr.addColorStop(1, "rgba(142,155,255,0)"); gg.fillStyle = gr; gg.fillRect(0, 0, 128, 128);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(glowC), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = -8.28; scene.add(pool);

  /* a soft light that slowly sweeps across the body so the clearcoat shows a moving glint */
  const sweep = new THREE.DirectionalLight(0xffffff, 1.6); scene.add(sweep);

  let fullDist = 44, portrait = false;
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    portrait = w / h < 0.9;
    fullDist = portrait ? 44 / Math.max(0.55, w / h) * 0.8 : 44;          // keep the whole device in frame
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas); resize();

  const pointer = { x: 0, y: 0 };
  addEventListener("pointermove", (e) => { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = e.clientY / innerHeight - 0.5; }, { passive: true });

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
  let yaw = -0.45, tilt = 0, time = 0, last = performance.now();

  const frame = (now) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    const p = window.__heroProg || 0;
    if (p < 0.12 || p > 0.995) return;                          // off stage: don't spend GPU time
    const s = clamp01((p - 0.22) / 0.62);                       // 0 → 1 across the time the model is on screen
    /* turn with the scroll, a little extra from the cursor; ease so it never snaps */
    const yawGoal = -0.45 + ease(s) * 1.35 + pointer.x * 0.35, tiltGoal = -0.05 + pointer.y * 0.12;
    yaw += (yawGoal - yaw) * Math.min(1, dt * 6); tilt += (tiltGoal - tilt) * Math.min(1, dt * 6);
    turn.rotation.set(tilt, yaw, 0);
    turn.position.y = Math.sin(time * 1.1) * 0.18;
    /* camera: arrives in a close-up on the screen, lights and mouthpiece, then pulls back to the whole device */
    const z = ease(clamp01(s / 0.55));
    const close = portrait ? 0.62 : 0.38;                         // phones: a gentler close-up so the top stays in frame
    const dist = fullDist * (close + (1 - close) * z);
    camera.position.set(lerp(2.2, 0, z), lerp(4.2, 3.5, z), dist);
    camera.lookAt(0, lerp(portrait ? 3.0 : 2.3, -0.6, z), 0);
    sweep.position.set(Math.sin(time * 0.55) * 16, 10, 12);
    renderer.render(scene, camera);
  };
  requestAnimationFrame(frame);
}

(window.__afterCurtain || ((f) => f()))(() => { try { init(); } catch (e) { console.warn("Showcase unavailable:", e); } });
