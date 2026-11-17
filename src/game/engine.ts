import * as THREE from "three";
import { createAudio, type AudioBus } from "@/game/audio";
import { isSpecial, SCENARIO_ORDER, SCENARIOS, SPECIALS, TOOLS, type ScenarioId, type SpecialId, type ToolId } from "@/game/content";
import { emptyHud, type Hud, type Phase } from "@/game/hud";
import { UPGRADE_CATALOG, loadSave, writeSave, type SaveData, type UpgradeId } from "@/game/save";

export type { Hud } from "@/game/hud";

export type GameApi = {
  dispose: () => void;
  clockIn: () => void;
  resume: () => void;
  pause: () => void;
  openShop: () => void;
  closeShop: () => void;
  buy: (id: UpgradeId) => void;
  buySpecial: (id: SpecialId) => void;
  nextShift: () => void;
  abandon: () => void;
  toggleTicket: () => void;
  setAnalog: (x: number, z: number) => void;
  addLook: (dx: number, dy: number) => void;
  setPrimary: (down: boolean) => void;
  setInteract: (down: boolean) => void;
  selectTool: (id: ToolId) => void;
  cycleTool: (dir: number) => void;
};

type Role = "gpu" | "head" | "switch";
type HitKind = "chassis" | "plug" | "port" | "screen" | "breaker" | "station" | "floor" | "door" | "prop" | "latch" | "part" | "spare";
type PartSlot = "fan" | "accel" | "drive" | "nic";
type PartState = "in" | "loose" | "out";

type Slot = {
  slot: PartSlot;
  state: PartState;
  mesh: THREE.Mesh;
  restY: number;
};

type Device = {
  id: string;
  name: string;
  role: Role;
  needsNet: boolean;
  y: number;
  health: number;
  fire: number;
  heat: number;
  wet: number;
  fan: boolean;
  anchorP: THREE.Vector3;
  anchorN: THREE.Vector3;
  front: THREE.Vector3;
  chassisMat: THREE.MeshStandardMaterial;
  ledMat: THREE.MeshStandardMaterial;
  hitFlash: number;
  body: THREE.Mesh;
  face: THREE.Mesh;
  sign: number;
  sled: THREE.Group | null;
  slide: number;
  slideTarget: number;
  slots: Slot[];
  frontZ: number;
};

type Port = {
  id: string;
  kind: "power" | "net";
  pos: THREE.Vector3;
  label: string;
  pdu: "A" | "B" | null;
  led: THREE.MeshStandardMaterial;
};

type Cable = {
  id: string;
  name: string;
  kind: "power" | "net" | "ib";
  device: string;
  home: string | null;
  port: string | null;
  damage: number;
  wet: number;
  short: number;
  anchor: THREE.Vector3;
  anchorB: THREE.Vector3;
  park: THREE.Vector3;
  end: THREE.Vector3;
  segs: THREE.Mesh[];
  samples: THREE.Vector3[];
  path: THREE.Vector3[];
  plug: THREE.Mesh;
  peer: string | null;
  anchorZ: number;
  anchorBZ: number;
};

type HitInfo = {
  kind: HitKind;
  id: string;
  distance: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
};

type Debris = {
  mesh: THREE.Mesh;
  v: THREE.Vector3;
  w: THREE.Vector3;
  life: number;
  active: boolean;
};

type Prop = {
  id: string;
  mesh: THREE.Mesh;
  dynamic: boolean;
  v: THREE.Vector3;
  w: THREE.Vector3;
  home: THREE.Vector3;
  homeRot: THREE.Euler;
  restY: number;
};

type Crew = {
  group: THREE.Group;
  head: THREE.Group;
  torso: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  foreL: THREE.Group;
  foreR: THREE.Group;
  homeX: number;
  homeZ: number;
  x: number;
  z: number;
  yaw: number;
  tx: number;
  tz: number;
  wait: number;
  heat: number;
  seed: number;
  tilt: number;
  faceMat: THREE.MeshBasicMaterial;
  calmMap: THREE.Texture;
  shockMap: THREE.Texture;
  shocked: boolean;
};

type Puddle = {
  active: boolean;
  lit: boolean;
  x: number;
  z: number;
  amount: number;
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
};

type Field = {
  pos: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  n: number;
  geo: THREE.BufferGeometry;
  cursor: number;
  gravity: number;
};

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getPitch?: () => number;
      getSpeed: () => number;
      getPos: () => { x: number; y: number; z: number };
      getKeys?: () => string[];
      setKeys: (codes: string[]) => void;
      setSteer?: (v: number) => void;
    };
    __rack?: {
      phase: () => string;
      problems: () => string[];
      clockIn: () => void;
      select: (id: string) => void;
      look: (yaw: number, pitch: number) => void;
      use: () => void;
      hit: () => void;
      holdUse: (down: boolean) => void;
      holdHit: (down: boolean) => void;
      holding: () => string | null;
      slides: () => { id: string; slide: number; z: number }[];
      log: () => string[];
      sim: () => number;
      health: () => { id: string; h: number; f: number }[];
      crew: () => { x: number; z: number; heat: number; home: boolean }[];
      ignite: () => void;
      forceSabotage: () => void;
      debugGrab: () => { id: string; dist: { t: number; d: number } | null; phase: string };
      spots: () => { id: string; name: string; x: number; y: number; z: number }[];
      ports: () => { id: string; label: string; kind: string; x: number; y: number; z: number }[];
    };
  }
}

const STEP = 1 / 60;
const EYE = 1.62;
const RADIUS = 0.28;
const SLIDE = 0.72;
const PART_LABEL: Record<PartSlot, string> = {
  fan: "fan module",
  accel: "accelerator",
  drive: "boot drive",
  nic: "NIC",
};
const UP = new THREE.Vector3(0, 1, 0);
const ASSIST: [number, number][] = [
  [0.045, 0],
  [-0.045, 0],
  [0, 0.045],
  [0, -0.045],
  [0.08, 0.05],
  [-0.08, 0.05],
  [0.08, -0.05],
  [-0.08, -0.05],
];

const MELEE: Partial<Record<ToolId, { dmg: number; cd: number; dur: number; range: number; heavy: number }>> = {
  sledge: { dmg: 0.11, cd: 0.78, dur: 0.42, range: 2.3, heavy: 1 },
  bat: { dmg: 0.05, cd: 0.36, dur: 0.28, range: 2.2, heavy: 0.35 },
  wrench: { dmg: 0.07, cd: 0.48, dur: 0.32, range: 2.1, heavy: 0.55 },
  balloon: { dmg: 0.33, cd: 0.62, dur: 0.36, range: 2.5, heavy: 0.85 },
  jack: { dmg: 0.33, cd: 0.84, dur: 0.46, range: 2.25, heavy: 1.3 },
  nailer: { dmg: 0.33, cd: 0.48, dur: 0.26, range: 2.6, heavy: 0.7 },
};

export type SettledRun = {
  kind: "fixed" | "chaos";
  seconds: number | null;
  token: string;
};

export function createGame(
  canvas: HTMLCanvasElement,
  onHud: (hud: Hud) => void,
  hooks?: { onRun?: (run: SettledRun) => void },
): GameApi {
  const save = loadSave();
  const audio = createAudio();
  const cleanups: (() => void)[] = [];
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  const textures: THREE.Texture[] = [];

  const touchAt = () => window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 900;
  let touchUi = touchAt();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shadows = !touchUi;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !touchUi,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch (err) {
    const hud = emptyHud();
    hud.error = err instanceof Error ? err.message : "Graphics unavailable";
    onHud(hud);
    return noopApi();
  }

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.55;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touchUi ? 1.35 : 1.75));
  renderer.setClearColor(0x0c0e11, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0e11);
  scene.fog = new THREE.Fog(0x0c0e11, 11, 22);

  const camera = new THREE.PerspectiveCamera(76, 1, 0.08, 40);
  const yawObject = new THREE.Object3D();
  yawObject.add(camera);
  scene.add(yawObject);

  const viewScene = new THREE.Scene();
  const viewCam = new THREE.PerspectiveCamera(70, 1, 0.02, 8);
  viewScene.add(viewCam);
  viewScene.add(new THREE.AmbientLight(0xffffff, 1.15));
  const viewKey = new THREE.DirectionalLight(0xfff4e4, 2.2);
  viewKey.position.set(0.6, 1.4, 1);
  viewScene.add(viewKey);
  const vmRoot = new THREE.Group();
  viewCam.add(vmRoot);

  const hitMeshes: THREE.Mesh[] = [];
  const devices: Device[] = [];
  const cables: Cable[] = [];
  const ports: Port[] = [];
  const deviceById = new Map<string, Device>();
  const cableById = new Map<string, Cable>();
  const powerOf = new Map<string, Cable>();
  const netOf = new Map<string, Cable>();
  const portMap = new Map<string, Port>();
  const props: Prop[] = [];
  const crew: Crew[] = [];
  let crewYelled = false;
  let saboteur = -1;
  let sabStage: "wait" | "go" | "spray" | "done" = "done";
  let sabTimer = 0;
  let hoseStream: THREE.Mesh | null = null;
  const puddles: Puddle[] = [];
  const debris: Debris[] = [];

  const keys = new Set<string>();
  let analogX = 0;
  let analogZ = 0;
  let lookDx = 0;
  let lookDy = 0;
  let primaryHeld = false;
  let interactHeld = false;
  let prevInteract = false;
  let prevPrimary = false;
  let interactQueued = false;
  let primaryQueued = false;

  let phase: Phase = "boot";
  let pausedFrom: "play" | "chaos" = "play";
  let shopBack: "pause" | "debrief" = "pause";
  let tool: ToolId = "hands";
  let holding: string | null = null;
  let heldPart: PartSlot | null = null;
  const stock: Record<PartSlot, number> = { fan: 2, accel: 1, drive: 1, nic: 1 };
  const carryMesh = new Map<PartSlot, THREE.Mesh>();
  const spareMesh = new Map<PartSlot, THREE.Mesh>();
  let dragLooking = false;
  let dragButton = -1;
  let dragMoved = false;
  let dragX = 0;
  let dragY = 0;
  let pressAt = 0;
  let skipLockClick = false;
  let ticketOpen = !touchUi;
  let wasLocked = false;
  let suppressLookUntil = 0;

  let px = 0.15;
  let pz = 2.42;
  let yaw = 0;
  let pitch = -0.16;
  const vel = new THREE.Vector3();
  let bobT = 0;
  let bob = 0;
  let trauma = 0;
  let kick = 0;
  let flash = 0;
  let elapsed = 0;
  let acc = 0;
  let simT = 0;
  let stepTimer = 0;
  let swing01 = 0;
  let swinging = false;
  let swingDidHit = false;
  let swingCd = 0;
  let useT = 0;
  let torqueT = 0;
  let sawDebris = 0;
  let ext = 1;
  let gas = 1;
  let water = 1;
  let gasWarned = false;
  let extWarned = false;
  let jobLive = false;
  let settled = false;
  let incidents = false;
  let seenFire = false;
  let smashScore = 0;
  let payout = 0;
  let payoutNote = "";
  let outcome: "fixed" | "chaos" | null = null;
  let chaosLeft = 30;
  let chaosReason = "";
  let scenario: ScenarioId = "unplug";
  let ticketId = "INC-1000";
  let scenarioCursor = save.shifts;
  const tripped = { A: false, B: false };
  const logs: string[] = [];
  let lastLog = "";
  let hudAcc = 0;
  let screenKey = "";
  let dead = false;

  const trippedMat: Record<"A" | "B", THREE.MeshStandardMaterial> = {
    A: std(0x1a1a1a, 0.45, 0.3, 0x39d353, 0.8),
    B: std(0x1a1a1a, 0.45, 0.3, 0x39d353, 0.8),
  };

  const soft = makeTex(64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.35, "rgba(255,255,255,0.55)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });

  const sparks = makeField(touchUi ? 160 : 320, 0xffd27a, 0.045, true, 0.95, 9.5);
  const embers = makeField(touchUi ? 120 : 240, 0xff6a1a, 0.2, true, 0.8, -1.6);
  const smoke = makeField(touchUi ? 80 : 140, 0x6a655e, 0.55, false, 0.22, -0.45);
  const sprayField = makeField(touchUi ? 100 : 180, 0xd5e4ef, 0.07, true, 0.55, 0.4);

  const fireLight = new THREE.PointLight(0xff6a2a, 0, 7, 2);
  fireLight.position.set(0, 1.1, 0.9);
  scene.add(fireLight);
  const sparkLight = new THREE.PointLight(0xffe1a8, 0, 3.2, 2);
  sparkLight.position.set(0, 1, 1);
  scene.add(sparkLight);
  const rackLight = new THREE.PointLight(0x7dffa8, 2.2, 4.2, 2);
  rackLight.position.set(0, 1.15, 1.05);
  scene.add(rackLight);
  let beaconMat: THREE.MeshStandardMaterial = std(0x2a0c0a, 0.4, 0.2, 0xff2a2a, 0.2);

  let screenCanvas: HTMLCanvasElement | null = null;
  let screenTex: THREE.CanvasTexture | null = null;
  let screenMat: THREE.MeshBasicMaterial | null = null;

  const cyl = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false);
  geos.add(cyl);
  const matPower = std(0x4a4338, 0.62, 0.2);
  const matBand = std(0xe2b84a, 0.45, 0.25);
  const matNet = std(0x3d7dff, 0.4, 0.2);
  const matIb = std(0xe07a28, 0.42, 0.25);
  const matPlug = std(0xc5c8ce, 0.35, 0.75);
  const matPuddle = std(0x3a2a14, 0.9, 0.02);
  matPuddle.transparent = true;
  matPuddle.opacity = 0.85;

  const models = buildViewmodels();
  buildWorld();
  initPuddles();
  initDebris();
  resetShift(pickScenario(true));
  resize();

  const ndc = new THREE.Vector2(0, 0);
  const raycaster = new THREE.Raycaster();
  raycaster.far = 7;
  const hitStore: HitInfo = {
    kind: "floor",
    id: "floor",
    distance: 0,
    point: new THREE.Vector3(),
    normal: new THREE.Vector3(),
  };
  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const holdPoint = new THREE.Vector3();
  const flatForward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const wish = new THREE.Vector3();
  const _delta = new THREE.Vector3();
  const _ab = new THREE.Vector3();
  const _ap = new THREE.Vector3();
  const _closest = new THREE.Vector3();
  const _n = new THREE.Vector3();
  const lens = [0, 0, 0, 0, 0, 0];
  const segEnd = new THREE.Vector3();

  function std(
    color: number,
    rough: number,
    metal: number,
    emissive = 0x000000,
    emissiveIntensity = 0,
  ) {
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: rough,
      metalness: metal,
      emissive,
      emissiveIntensity,
    });
    mats.add(mat);
    return mat;
  }

  function makeTex(
    w: number,
    h: number,
    draw: (g: CanvasRenderingContext2D, w: number, h: number) => void,
    repeat = false,
  ) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    if (!g) throw new Error("2d");
    draw(g, w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    if (repeat) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
    }
    textures.push(tex);
    return tex;
  }

  function makeField(
    n: number,
    color: number,
    size: number,
    additive: boolean,
    opacity: number,
    gravity: number,
  ): Field {
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const life = new Float32Array(n);
    for (let i = 0; i < n; i++) pos[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geos.add(geo);
    const mat = new THREE.PointsMaterial({
      color,
      size,
      map: soft,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      sizeAttenuation: true,
    });
    mats.add(mat);
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    return { pos, vel, life, n, geo, cursor: 0, gravity };
  }

  function emit(f: Field, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number) {
    let i = f.cursor;
    for (let k = 0; k < 24; k++) {
      if (f.life[i] <= 0) break;
      i = (i + 1) % f.n;
    }
    f.cursor = (i + 1) % f.n;
    const o = i * 3;
    f.pos[o] = x;
    f.pos[o + 1] = y;
    f.pos[o + 2] = z;
    f.vel[o] = vx;
    f.vel[o + 1] = vy;
    f.vel[o + 2] = vz;
    f.life[i] = life;
  }

  function stepField(f: Field, dt: number) {
    for (let i = 0; i < f.n; i++) {
      if (f.life[i] <= 0) continue;
      f.life[i] -= dt;
      const o = i * 3;
      f.vel[o + 1] -= f.gravity * dt;
      f.pos[o] += f.vel[o] * dt;
      f.pos[o + 1] += f.vel[o + 1] * dt;
      f.pos[o + 2] += f.vel[o + 2] * dt;
      if (f.life[i] <= 0 || f.pos[o + 1] < 0) {
        f.life[i] = 0;
        f.pos[o + 1] = -999;
      }
    }
    const attr = f.geo.getAttribute("position") as THREE.BufferAttribute;
    attr.needsUpdate = true;
  }

  function tag(mesh: THREE.Mesh, kind: HitKind, id: string) {
    mesh.userData.kind = kind;
    mesh.userData.id = id;
    hitMeshes.push(mesh);
  }

  function box(
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    hit?: { kind: HitKind; id: string },
    shadow = true,
  ) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    geos.add(mesh.geometry);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow && shadows;
    mesh.receiveShadow = shadow && shadows;
    if (hit) tag(mesh, hit.kind, hit.id);
    parent.add(mesh);
    return mesh;
  }

  function log(message: string) {
    if (message === lastLog) return;
    lastLog = message;
    logs.unshift(message);
    if (logs.length > 4) logs.pop();
  }

  function buildWorld() {
    const floorTex = makeTex(
      512,
      512,
      (g, w, h) => {
        g.fillStyle = "#222830";
        g.fillRect(0, 0, w, h);
        g.strokeStyle = "#2a313a";
        g.lineWidth = 3;
        for (let i = 0; i <= w; i += 64) {
          g.beginPath();
          g.moveTo(i, 0);
          g.lineTo(i, h);
          g.stroke();
          g.beginPath();
          g.moveTo(0, i);
          g.lineTo(w, i);
          g.stroke();
        }
        g.fillStyle = "#12151a";
        for (let y = 8; y < h; y += 64) {
          for (let x = 8; x < w; x += 64) {
            g.fillRect(x + 18, y + 18, 10, 10);
          }
        }
      },
      true,
    );
    floorTex.repeat.set(4, 4);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, metalness: 0.08 });
    mats.add(floorMat);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.2, 8.6), floorMat);
    geos.add(floor.geometry);
    floor.position.set(0, -0.1, -0.5);
    floor.receiveShadow = shadows;
    tag(floor, "floor", "floor");
    scene.add(floor);

    const wallMat = std(0x242b34, 0.9, 0.05);
    box(scene, 8.8, 3.2, 0.18, 0, 1.5, -4.55, wallMat, undefined, false);
    box(scene, 8.8, 3.2, 0.18, 0, 1.5, 3.55, wallMat, undefined, false);
    box(scene, 0.18, 3.2, 8.4, -4.2, 1.5, -0.5, wallMat, undefined, false);
    box(scene, 0.18, 3.2, 8.4, 4.2, 1.5, -0.5, wallMat, undefined, false);
    const ceilMat = std(0x101318, 0.95, 0.02);
    box(scene, 8.6, 0.12, 8.4, 0, 3.05, -0.5, ceilMat, undefined, false);

    const stripe = makeTex(
      128,
      32,
      (g, w, h) => {
        g.fillStyle = "#121418";
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#e39b2b";
        for (let x = -32; x < w + 40; x += 32) {
          g.beginPath();
          g.moveTo(x, h);
          g.lineTo(x + 16, 0);
          g.lineTo(x + 32, 0);
          g.lineTo(x + 16, h);
          g.fill();
        }
      },
      true,
    );
    stripe.repeat.set(8, 1);
    const stripeMat = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.7, metalness: 0.1 });
    mats.add(stripeMat);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 1.35), stripeMat);
    geos.add(plinth.geometry);
    plinth.position.set(0, 0.04, 0.02);
    plinth.receiveShadow = shadows;
    scene.add(plinth);

    for (let i = 0; i < 3; i++) {
      const fixtureMat = std(0xdfe7ef, 0.3, 0.05, 0xf4f7fb, 0.85);
      box(scene, 1.4, 0.06, 0.28, -1.6 + i * 1.6, 2.92, 0.4, fixtureMat, undefined, false);
    }

    const hemi = new THREE.HemisphereLight(0xe7eef6, 0x3a3228, 1.15);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xfff6ea, 3.15);
    dir.position.set(3.2, 6.4, 3.4);
    dir.target.position.set(0, 1, 0);
    scene.add(dir.target);
    if (shadows) {
      dir.castShadow = true;
      dir.shadow.mapSize.set(1024, 1024);
      const cam = dir.shadow.camera;
      cam.near = 0.5;
      cam.far = 18;
      cam.left = -6;
      cam.right = 6;
      cam.top = 6;
      cam.bottom = -6;
      dir.shadow.bias = -0.00035;
    }
    scene.add(dir);
    const fill = new THREE.PointLight(0xfff4e6, 36, 16, 2);
    fill.position.set(-1.2, 2.5, 2.2);
    scene.add(fill);

    beaconMat = std(0x2a0c0a, 0.45, 0.15, 0xff2d2d, 0.15);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 10), beaconMat);
    geos.add(beacon.geometry);
    beacon.position.set(0.9, 2.85, 0.2);
    scene.add(beacon);

    buildRack();
    ghostRack(-2.75, -1.35, 0);
    ghostRack(2.75, -1.35, 0);
    ghostRack(0, -3.35, 0);

    const doorMat = std(0x1c2420, 0.6, 0.35);
    const door = box(scene, 1.1, 2.2, 0.08, 1.5, 1.1, 3.42, doorMat, { kind: "door", id: "door" }, false);
    door.castShadow = false;
    const exitMat = std(0x3a120f, 0.4, 0.1, 0xff4a3a, 0.7);
    box(scene, 0.46, 0.16, 0.04, 1.5, 2.35, 3.4, exitMat, undefined, false);

    const cabMat = std(0x243038, 0.55, 0.4);
    box(scene, 0.55, 1.3, 0.4, -3.72, 1.05, 1.55, cabMat, { kind: "station", id: "cab" });
    const cabLabel = label("CO2 / GAS", 0.42, 0.1, "#e7e2d4", "#243038");
    cabLabel.position.set(-3.5, 1.35, 1.55);
    scene.add(cabLabel);

    const tableMat = std(0x2a3036, 0.5, 0.6);
    box(scene, 0.7, 0.06, 0.45, -1.55, 0.78, 1.7, tableMat);
    box(scene, 0.06, 0.74, 0.06, -1.82, 0.4, 1.52, tableMat);
    box(scene, 0.06, 0.74, 0.06, -1.28, 0.4, 1.88, tableMat);
    addProp("bottle", makeBottle(), new THREE.Vector3(-1.48, 0.95, 1.68));
    addProp("fan", makeSpareFan(), new THREE.Vector3(-1.7, 0.86, 1.78));
    addProp("can", makeWallCan(), new THREE.Vector3(3.55, 1.25, 0.4));

    const mark = label("ML-07", 0.7, 0.22, "#e39b2b", "#00000000");
    mark.position.set(0, 0.03, 1.15);
    mark.rotation.x = -Math.PI / 2;
    scene.add(mark);
    buildCrew();
  }

  function label(text: string, w: number, h: number, color: string, bg: string) {
    const tex = makeTex(256, 96, (g, cw, ch) => {
      g.clearRect(0, 0, cw, ch);
      if (!bg.endsWith("00")) {
        g.fillStyle = bg;
        g.fillRect(0, 0, cw, ch);
      }
      g.fillStyle = color;
      g.font = "700 64px monospace";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(text, cw / 2, ch / 2);
    });
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    mats.add(mat);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    geos.add(mesh.geometry);
    return mesh;
  }

  function buildRack() {
    const steel = std(0x8b97a6, 0.38, 0.72);
    const dark = std(0x3a4552, 0.5, 0.35);
    const rail = std(0xaeb8c4, 0.32, 0.75);
    box(scene, 0.05, 1.92, 0.05, -0.36, 1.02, 0.46, steel);
    box(scene, 0.05, 1.92, 0.05, 0.36, 1.02, 0.46, steel);
    box(scene, 0.05, 1.92, 0.05, -0.36, 1.02, -0.38, steel);
    box(scene, 0.05, 1.92, 0.05, 0.36, 1.02, -0.38, steel);
    box(scene, 0.78, 0.05, 0.9, 0, 1.98, 0.04, steel);
    box(scene, 0.78, 0.05, 0.9, 0, 0.1, 0.04, steel);
    box(scene, 0.04, 1.8, 0.04, -0.32, 1.02, 0.48, rail, undefined, false);
    box(scene, 0.04, 1.8, 0.04, 0.32, 1.02, 0.48, rail, undefined, false);

    const name = label("ML-07  ATLAS", 0.62, 0.1, "#e7e2d4", "#12161b");
    name.position.set(0, 2.08, 0.5);
    scene.add(name);

    const spec: {
      id: string;
      name: string;
      role: Role;
      y: number;
      h: number;
      needsNet: boolean;
      pdu: "A" | "B";
      pwr: string;
      net: string;
    }[] = [
      { id: "gpu0", name: "GPU-01", role: "gpu", y: 0.3, h: 0.2, needsNet: true, pdu: "B", pwr: "pwr:gpu0", net: "net:gpu0" },
      { id: "gpu1", name: "GPU-02", role: "gpu", y: 0.54, h: 0.2, needsNet: true, pdu: "B", pwr: "pwr:gpu1", net: "net:gpu1" },
      { id: "gpu2", name: "GPU-03", role: "gpu", y: 0.78, h: 0.2, needsNet: true, pdu: "B", pwr: "pwr:gpu2", net: "net:gpu2" },
      { id: "gpu3", name: "GPU-04", role: "gpu", y: 1.02, h: 0.2, needsNet: true, pdu: "B", pwr: "pwr:gpu3", net: "net:gpu3" },
      { id: "head2", name: "HEAD-02", role: "head", y: 1.28, h: 0.16, needsNet: true, pdu: "A", pwr: "pwr:head2", net: "net:head2" },
      { id: "head1", name: "HEAD-01", role: "head", y: 1.48, h: 0.16, needsNet: true, pdu: "A", pwr: "pwr:head1", net: "net:head1" },
      { id: "mgmt", name: "MGMT-SW", role: "switch", y: 1.66, h: 0.12, needsNet: false, pdu: "A", pwr: "pwr:mgmt", net: "" },
      { id: "tor", name: "TOR-SW", role: "switch", y: 1.84, h: 0.14, needsNet: false, pdu: "A", pwr: "pwr:tor", net: "" },
    ];

    const pduMat = std(0x1a1f26, 0.5, 0.55);
    box(scene, 0.14, 1.7, 0.42, 0.62, 1.0, 0.12, pduMat);
    box(scene, 0.14, 1.7, 0.42, -0.62, 1.0, 0.12, pduMat);
    const pduALabel = label("PDU-A", 0.16, 0.05, "#e7e2d4", "#1a1f26");
    pduALabel.position.set(-0.62, 1.9, 0.36);
    scene.add(pduALabel);
    const pduBLabel = label("PDU-B", 0.16, 0.05, "#e7e2d4", "#1a1f26");
    pduBLabel.position.set(0.62, 1.9, 0.36);
    scene.add(pduBLabel);

    box(scene, 0.1, 0.08, 0.06, -0.62, 0.42, 0.36, trippedMat.A, { kind: "breaker", id: "A" });
    box(scene, 0.1, 0.08, 0.06, 0.62, 0.42, 0.36, trippedMat.B, { kind: "breaker", id: "B" });

    for (const s of spec) {
      const service = s.role === "gpu" || s.role === "head";
      const sled = service ? new THREE.Group() : null;
      if (sled) {
        sled.position.set(0, s.y, 0);
        scene.add(sled);
      }
      const parent: THREE.Object3D = sled ?? scene;
      const y = sled ? 0 : s.y;
      const face = deviceFace(s.role, s.name);
      const faceMat = new THREE.MeshStandardMaterial({ map: face, roughness: 0.6, metalness: 0.25 });
      mats.add(faceMat);
      const body = box(parent, 0.62, s.h * 0.92, 0.78, 0, y, 0.04, dark, { kind: "chassis", id: s.id });
      body.castShadow = shadows;
      const front = new THREE.Mesh(new THREE.PlaneGeometry(0.58, s.h * 0.82), faceMat);
      geos.add(front.geometry);
      front.position.set(0, y, 0.445);
      tag(front, "chassis", s.id);
      front.castShadow = false;
      parent.add(front);

      const ledMat = std(0x101214, 0.4, 0.2, 0x3ecf8e, 1.3);
      const chassisMat = std(0x1a1f26, 0.48, 0.62);
      body.material = chassisMat;

      if (s.role === "gpu") {
        const ledGeo = new THREE.BoxGeometry(0.02, 0.02, 0.012);
        geos.add(ledGeo);
        const leds = new THREE.InstancedMesh(ledGeo, ledMat, 8);
        const dummy = new THREE.Object3D();
        for (let i = 0; i < 8; i++) {
          dummy.position.set(-0.2 + i * 0.055, y + s.h * 0.18, 0.456);
          dummy.updateMatrix();
          leds.setMatrixAt(i, dummy.matrix);
        }
        leds.instanceMatrix.needsUpdate = true;
        parent.add(leds);
      } else {
        box(parent, 0.035, 0.035, 0.015, 0.24, y, 0.456, ledMat, undefined, false);
      }

      const slots: Slot[] = [];
      if (sled) {
        const latchMat = std(0xc9a15a, 0.4, 0.55, 0xe39b2b, 0.7);
        box(sled, 0.055, s.h * 0.55, 0.07, 0.31, 0, 0.5, latchMat, { kind: "latch", id: s.id }, false);
        const top = (s.h * 0.92) / 2 + 0.02;
        const addSlot = (slot: PartSlot, x: number, z: number, w: number, h: number, d: number, color: number) => {
          const pad = std(0x14181c, 0.8, 0.2);
          box(sled, w, 0.01, d, x, top - 0.02, z, pad, { kind: "part", id: `${s.id}:${slot}` }, false);
          const mesh = box(sled, w * 0.92, h, d * 0.92, x, top, z, std(color, 0.45, 0.3), undefined, false);
          slots.push({ slot, state: "in", mesh, restY: top });
        };
        if (s.role === "gpu") {
          addSlot("fan", -0.16, 0.12, 0.2, 0.045, 0.16, 0x3a444e);
          addSlot("accel", 0.08, 0.08, 0.26, 0.036, 0.32, 0x1f6b45);
        } else {
          addSlot("fan", -0.16, 0.08, 0.12, 0.04, 0.1, 0x3a444e);
          addSlot("drive", 0.0, 0.08, 0.11, 0.03, 0.14, 0xc5ccd4);
          addSlot("nic", 0.16, 0.08, 0.1, 0.035, 0.12, 0x2f6fe0);
        }
      }

      const side = s.pdu === "B" ? 1 : -1;
      const anchorP = new THREE.Vector3(side * 0.3, s.y, 0.48);
      const anchorN = new THREE.Vector3(-0.02, s.y - s.h * 0.12, 0.5);
      const dev: Device = {
        id: s.id,
        name: s.name,
        role: s.role,
        needsNet: s.needsNet,
        y: s.y,
        health: 1,
        fire: 0,
        heat: 36,
        wet: 0,
        fan: true,
        anchorP,
        anchorN,
        front: new THREE.Vector3(0, s.y, 0.5),
        chassisMat,
        ledMat,
        hitFlash: 0,
        body,
        face: front,
        sign: s.id.charCodeAt(s.id.length - 1) % 2 === 0 ? 1 : -1,
        sled,
        slide: 0,
        slideTarget: 0,
        slots,
        frontZ: 0.5,
      };
      devices.push(dev);
      deviceById.set(s.id, dev);

      const portPos = new THREE.Vector3(side * 0.62, s.y, 0.4);
      const portLabel =
        s.pwr === "pwr:tor"
          ? "PDU-A SW1"
          : s.pwr === "pwr:mgmt"
            ? "PDU-A SW2"
            : s.pwr === "pwr:head1"
              ? "PDU-A HD1"
              : s.pwr === "pwr:head2"
                ? "PDU-A HD2"
                : s.pwr === "pwr:gpu0"
                  ? "PDU-B G1"
                  : s.pwr === "pwr:gpu1"
                    ? "PDU-B G2"
                    : s.pwr === "pwr:gpu2"
                      ? "PDU-B G3"
                      : "PDU-B G4";
      addPort(s.pwr, "power", portPos, portLabel, s.pdu);
      const whipName = `${s.name} power whip`;
      addCable({
        id: `c-${s.pwr}`,
        name: whipName,
        kind: "power",
        device: s.id,
        home: s.pwr,
        anchor: anchorP,
      });

      const tagMesh = label(portLabel.replace("PDU-", ""), 0.16, 0.045, "#e7e2d4", "#111418");
      tagMesh.position.set(portPos.x, portPos.y + 0.07, portPos.z + 0.02);
      scene.add(tagMesh);
    }

    const netPorts: { id: string; label: string; x: number }[] = [
      { id: "net:dead1", label: "P14", x: -0.3 },
      { id: "net:head1", label: "P5", x: -0.2 },
      { id: "net:head2", label: "P6", x: -0.1 },
      { id: "net:gpu0", label: "P1", x: 0.0 },
      { id: "net:gpu1", label: "P2", x: 0.1 },
      { id: "net:gpu2", label: "P3", x: 0.2 },
      { id: "net:gpu3", label: "P4", x: 0.3 },
      { id: "net:dead2", label: "P15", x: -0.4 },
    ];
    for (const n of netPorts) {
      addPort(n.id, "net", new THREE.Vector3(n.x, 1.84, 0.52), `TOR ${n.label}`, null);
    }
    for (const s of spec) {
      if (!s.needsNet) continue;
      const home = s.net;
      const dev = deviceById.get(s.id)!;
      addCable({
        id: `c-${home}`,
        name: `${s.name} DAC`,
        kind: "net",
        device: s.id,
        home,
        anchor: dev.anchorN,
      });
    }

    const ibPairs: [string, string, string, string][] = [
      ["ib01", "IB GPU-01—02", "gpu0", "gpu1"],
      ["ib12", "IB GPU-02—03", "gpu1", "gpu2"],
      ["ib23", "IB GPU-03—04", "gpu2", "gpu3"],
    ];
    for (const [id, name, a, b] of ibPairs) {
      const da = deviceById.get(a)!;
      const db = deviceById.get(b)!;
      const anchor = new THREE.Vector3(-0.22, da.y + 0.08, 0.5);
      const anchorB = new THREE.Vector3(-0.22, db.y - 0.08, 0.5);
      addCable({
        id,
        name,
        kind: "ib",
        device: a,
        peer: b,
        home: null,
        anchor,
        anchorB,
      });
    }

    screenCanvas = document.createElement("canvas");
    screenCanvas.width = 512;
    screenCanvas.height = 256;
    screenTex = new THREE.CanvasTexture(screenCanvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    textures.push(screenTex);
    screenMat = new THREE.MeshBasicMaterial({ map: screenTex });
    mats.add(screenMat);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.1), screenMat);
    geos.add(screen.geometry);
    screen.position.set(-0.08, 1.48, 0.46);
    tag(screen, "screen", "head1");
    const headSled = deviceById.get("head1")?.sled;
    if (headSled) headSled.attach(screen);
    else scene.add(screen);

    const crib = label("PARTS", 0.34, 0.08, "#e7e2d4", "#1a1f26");
    crib.position.set(-1.55, 1.05, 1.72);
    scene.add(crib);
    const cribSpec: { slot: PartSlot; x: number; z: number; color: number; w: number; h: number; d: number }[] = [
      { slot: "fan", x: -1.38, z: 1.58, color: 0x3a444e, w: 0.12, h: 0.04, d: 0.1 },
      { slot: "accel", x: -1.58, z: 1.74, color: 0x1f6b45, w: 0.16, h: 0.03, d: 0.1 },
      { slot: "drive", x: -1.74, z: 1.58, color: 0xc5ccd4, w: 0.1, h: 0.025, d: 0.07 },
      { slot: "nic", x: -1.48, z: 1.88, color: 0x2f6fe0, w: 0.1, h: 0.03, d: 0.07 },
    ];
    for (const item of cribSpec) {
      const mesh = box(scene, item.w, item.h, item.d, item.x, 0.86, item.z, std(item.color, 0.45, 0.3), {
        kind: "spare",
        id: item.slot,
      }, false);
      spareMesh.set(item.slot, mesh);
      const carried = new THREE.Mesh(new THREE.BoxGeometry(item.w, item.h, item.d), std(item.color, 0.4, 0.35));
      geos.add(carried.geometry);
      carried.visible = false;
      scene.add(carried);
      carryMesh.set(item.slot, carried);
    }
  }

  function deviceFace(role: Role, name: string) {
    return makeTex(512, role === "gpu" ? 180 : 140, (g, w, h) => {
      g.fillStyle = "#2c3848";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "#9aa8b8";
      g.lineWidth = 4;
      g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = "#e7e2d4";
      g.font = "600 28px monospace";
      g.fillText(name, 20, 40);
      g.fillStyle = "#8d96a3";
      g.font = "500 18px monospace";
      if (role === "gpu") {
        g.fillText("8× ACCEL  SXM", 20, 68);
        for (let i = 0; i < 8; i++) {
          const x = 24 + i * 58;
          g.fillStyle = "#121820";
          g.fillRect(x, 88, 48, 70);
          g.fillStyle = "#3d4c5e";
          for (let v = 0; v < 4; v++) g.fillRect(x + 8, 96 + v * 12, 32, 4);
        }
      } else if (role === "head") {
        g.fillText(name === "HEAD-01" ? "SCHEDULER" : "LOGIN / NFS", 20, 68);
        g.fillStyle = "#07090c";
        g.fillRect(300, 28, 180, 90);
      } else {
        g.fillText(name === "TOR-SW" ? "400GbE FABRIC" : "IPMI 1GbE", 20, 68);
        g.fillStyle = "#07090c";
        for (let i = 0; i < 12; i++) g.fillRect(24 + (i % 12) * 38, 90, 28, 18);
      }
    });
  }

  function addPort(id: string, kind: "power" | "net", pos: THREE.Vector3, text: string, pdu: "A" | "B" | null) {
    const led = std(0x101214, 0.35, 0.4, kind === "power" ? 0x39d353 : 0x3aa0ff, 0.3);
    const mesh = box(
      scene,
      kind === "power" ? 0.07 : 0.05,
      kind === "power" ? 0.05 : 0.05,
      0.05,
      pos.x,
      pos.y,
      pos.z,
      led,
      { kind: "port", id },
      false,
    );
    mesh.castShadow = false;
    const port: Port = { id, kind, pos: pos.clone(), label: text, pdu, led };
    ports.push(port);
    portMap.set(id, port);
  }

  function addCable(opts: {
    id: string;
    name: string;
    kind: Cable["kind"];
    device: string;
    home: string | null;
    anchor: THREE.Vector3;
    anchorB?: THREE.Vector3;
    peer?: string;
  }) {
    const segs: THREE.Mesh[] = [];
    const samples: THREE.Vector3[] = [];
    const count = 8;
    for (let i = 0; i < count; i++) {
      const mat = opts.kind === "net" ? matNet : opts.kind === "ib" ? matIb : i % 2 === 0 ? matBand : matPower;
      const mesh = new THREE.Mesh(cyl, mat);
      mesh.castShadow = false;
      scene.add(mesh);
      segs.push(mesh);
      samples.push(new THREE.Vector3());
    }
    samples.push(new THREE.Vector3());
    const plugMat = matPlug.clone();
    mats.add(plugMat);
    const plug = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.09), plugMat);
    geos.add(plug.geometry);
    plug.castShadow = false;
    tag(plug, "plug", opts.id);
    scene.add(plug);
    const anchor = opts.anchor.clone();
    const anchorB = (opts.anchorB ?? opts.anchor).clone();
    const park = anchor.clone();
    park.y -= 0.3;
    park.z += 0.42;
    const cable: Cable = {
      id: opts.id,
      name: opts.name,
      kind: opts.kind,
      device: opts.device,
      home: opts.home,
      port: opts.home,
      damage: 0,
      wet: 0,
      short: 0,
      anchor,
      anchorB,
      park,
      end: new THREE.Vector3(),
      segs,
      samples,
      path: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
      plug,
      peer: opts.peer ?? null,
      anchorZ: anchor.z,
      anchorBZ: anchorB.z,
    };
    cables.push(cable);
    cableById.set(opts.id, cable);
    if (opts.kind === "power") powerOf.set(opts.device, cable);
    if (opts.kind === "net") netOf.set(opts.device, cable);
  }

  function ghostRack(x: number, z: number, rot: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    const mat = std(0x1a1f25, 0.55, 0.5);
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.9, 0.85), mat);
    geos.add(shell.geometry);
    shell.position.y = 1.02;
    shell.castShadow = shadows;
    shell.receiveShadow = shadows;
    g.add(shell);
    const led = std(0x101010, 0.4, 0.2, 0x39d353, 0.7);
    for (let i = 0; i < 5; i++) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.02), led);
      geos.add(strip.geometry);
      strip.position.set(0, 0.35 + i * 0.28, 0.44);
      g.add(strip);
    }
    scene.add(g);
  }

  function makeBottle() {
    const mat = std(0x8aa0b5, 0.25, 0.85);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.22, 10), mat);
    geos.add(mesh.geometry);
    return mesh;
  }

  function makeSpareFan() {
    const mat = std(0x2e353c, 0.5, 0.6);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.16), mat);
    geos.add(mesh.geometry);
    return mesh;
  }

  function makeWallCan() {
    const mat = std(0xb4332a, 0.45, 0.35);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.38, 10), mat);
    geos.add(mesh.geometry);
    return mesh;
  }

  function addProp(id: string, mesh: THREE.Mesh, home: THREE.Vector3) {
    mesh.position.copy(home);
    mesh.castShadow = shadows;
    tag(mesh, "prop", id);
    scene.add(mesh);
    props.push({
      id,
      mesh,
      dynamic: false,
      v: new THREE.Vector3(),
      w: new THREE.Vector3(),
      home: home.clone(),
      homeRot: mesh.rotation.clone(),
      restY: 0.08,
    });
  }

  function initPuddles() {
    const geo = new THREE.CircleGeometry(0.34, 18);
    geos.add(geo);
    for (let i = 0; i < 6; i++) {
      const mat = matPuddle.clone();
      mats.add(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.025;
      mesh.visible = false;
      mesh.receiveShadow = false;
      scene.add(mesh);
      puddles.push({ active: false, lit: false, x: 0, z: 0, amount: 0, mesh, mat });
    }
  }

  function initDebris() {
    const geo = new THREE.BoxGeometry(1, 0.35, 0.7);
    geos.add(geo);
    for (let i = 0; i < 64; i++) {
      const mat = std(i % 2 === 0 ? 0xc5ccd4 : 0x3c4650, 0.38, 0.72);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.castShadow = false;
      scene.add(mesh);
      debris.push({ mesh, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0, active: false });
    }
  }

  function buildViewmodels() {
    const out = new Map<ToolId, THREE.Group>();
    const glove = std(0x2a2e33, 0.7, 0.1);
    const wood = std(0x6b4a2e, 0.7, 0.05);
    const metal = std(0xb7bcc4, 0.32, 0.85);
    const darkM = std(0x1c2026, 0.45, 0.7);
    const red = std(0xc4372e, 0.42, 0.4);
    const yellow = std(0xd7a441, 0.5, 0.35);
    const flame = std(0x2a1208, 0.4, 0.1, 0xff8a2a, 1.6);

    const add = (id: ToolId, node: THREE.Object3D) => {
      const g = new THREE.Group();
      g.add(node);
      g.visible = id === "hands";
      vmRoot.add(g);
      out.set(id, g);
    };

    const hands = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.16), glove);
    geos.add(palm.geometry);
    palm.position.set(0.05, -0.02, -0.05);
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.08), darkM);
    geos.add(cuff.geometry);
    cuff.position.set(0.02, -0.02, 0.08);
    hands.add(palm, cuff);
    add("hands", hands);

    const sledge = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.56, 8), wood);
    geos.add(handle.geometry);
    handle.rotation.set(0.35, 0, -0.42);
    handle.position.set(0.02, -0.02, -0.06);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.11), metal);
    geos.add(head.geometry);
    head.position.set(0, 0.3, 0);
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.045, 0.13), darkM);
    geos.add(cheek.geometry);
    cheek.position.set(0, 0.3, 0);
    handle.add(head, cheek);
    sledge.add(handle);
    add("sledge", sledge);

    const batPts = [
      new THREE.Vector2(0.01, 0),
      new THREE.Vector2(0.03, 0.012),
      new THREE.Vector2(0.034, 0.03),
      new THREE.Vector2(0.016, 0.046),
      new THREE.Vector2(0.014, 0.1),
      new THREE.Vector2(0.013, 0.28),
      new THREE.Vector2(0.016, 0.38),
      new THREE.Vector2(0.026, 0.5),
      new THREE.Vector2(0.04, 0.64),
      new THREE.Vector2(0.046, 0.74),
      new THREE.Vector2(0.044, 0.8),
      new THREE.Vector2(0.02, 0.822),
      new THREE.Vector2(0.004, 0.83),
    ];
    const batGeo = new THREE.LatheGeometry(batPts, 16);
    geos.add(batGeo);
    const bat = new THREE.Group();
    bat.rotation.z = -0.62;
    bat.position.set(0.05, -0.12, -0.04);
    const batWood = new THREE.Mesh(batGeo, wood);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 12), darkM);
    geos.add(grip.geometry);
    grip.position.y = 0.16;
    bat.add(batWood, grip);
    add("bat", bat);

    const wrench = new THREE.Group();
    const wHandle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.36, 0.025), metal);
    geos.add(wHandle.geometry);
    wHandle.position.set(0.02, -0.02, 0);
    const jawL = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.1, 0.03), metal);
    geos.add(jawL.geometry);
    jawL.position.set(-0.03, 0.18, 0);
    const jawR = jawL.clone();
    jawR.position.x = 0.07;
    wrench.add(wHandle, jawL, jawR);
    add("wrench", wrench);

    const torch = new THREE.Group();
    torch.rotation.set(0.2, -0.15, -0.75);
    torch.position.set(0.04, -0.08, -0.06);
    const torchTank = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.05, 0.22, 12), yellow);
    geos.add(torchTank.geometry);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.018, 12), darkM);
    geos.add(band.geometry);
    band.position.y = -0.04;
    const valve = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.04, 0.04), darkM);
    geos.add(valve.geometry);
    valve.position.y = 0.125;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 8), metal);
    geos.add(knob.geometry);
    knob.rotation.z = Math.PI / 2;
    knob.position.set(0.03, 0.125, 0);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.16, 8), metal);
    geos.add(nozzle.geometry);
    nozzle.rotation.x = -Math.PI / 2.4;
    nozzle.position.set(0, 0.16, -0.07);
    const flameCone = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 10), flame);
    geos.add(flameCone.geometry);
    flameCone.rotation.x = -Math.PI / 2.15;
    flameCone.position.set(0, 0.2, -0.2);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.08, 8), std(0xfff1c2, 0.4, 0.1, 0xffe08a, 2.2));
    geos.add(core.geometry);
    core.rotation.x = -Math.PI / 2.15;
    core.position.set(0, 0.19, -0.16);
    torch.add(torchTank, band, valve, knob, nozzle, flameCone, core);
    add("torch", torch);

    const washer = new THREE.Group();
    washer.rotation.set(0.15, 0.25, -0.15);
    washer.position.set(0.02, -0.1, -0.02);
    const gunHandle = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.13, 0.048), darkM);
    geos.add(gunHandle.geometry);
    gunHandle.position.set(0, -0.08, 0.03);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, 0.13), darkM);
    geos.add(housing.geometry);
    housing.position.set(0, 0, -0.02);
    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.04, 0.012), metal);
    geos.add(trigger.geometry);
    trigger.position.set(0, -0.02, 0.03);
    const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.01, 0.055), metal);
    geos.add(triggerGuard.geometry);
    triggerGuard.position.set(0, -0.045, 0.02);
    const lance = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.5, 8), metal);
    geos.add(lance.geometry);
    lance.rotation.x = Math.PI / 2;
    lance.position.set(0, 0.012, -0.32);
    const coupler = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.016, 0.04, 8), darkM);
    geos.add(coupler.geometry);
    coupler.rotation.x = Math.PI / 2;
    coupler.position.set(0, 0.012, -0.54);
    const fanTip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.02), metal);
    geos.add(fanTip.geometry);
    fanTip.position.set(0, 0.012, -0.58);
    const hoseA = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8), darkM);
    geos.add(hoseA.geometry);
    hoseA.rotation.x = 0.7;
    hoseA.position.set(0, -0.03, 0.08);
    const hoseB = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8), darkM);
    geos.add(hoseB.geometry);
    hoseB.rotation.x = 1.5;
    hoseB.position.set(0, -0.08, 0.12);
    washer.add(gunHandle, housing, trigger, triggerGuard, lance, coupler, fanTip, hoseA, hoseB);
    add("washer", washer);

    const welder = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.18), darkM);
    geos.add(body.geometry);
    const tipW = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.16, 8), metal);
    geos.add(tipW.geometry);
    tipW.rotation.x = Math.PI / 2;
    tipW.position.set(0, 0.02, -0.16);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), flame);
    geos.add(glow.geometry);
    glow.position.set(0, 0.02, -0.24);
    welder.add(body, tipW, glow);
    add("welder", welder);

    const gasCan = new THREE.Group();
    gasCan.rotation.z = -0.2;
    gasCan.position.set(0.02, -0.08, -0.02);
    const jerry = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.09), red);
    geos.add(jerry.geometry);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.168, 0.028, 0.096), darkM);
    geos.add(ridge.geometry);
    ridge.position.y = 0.02;
    const handleL = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.055, 0.02), darkM);
    geos.add(handleL.geometry);
    handleL.position.set(-0.05, 0.125, 0);
    const handleR = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.055, 0.02), darkM);
    geos.add(handleR.geometry);
    handleR.position.set(0.05, 0.125, 0);
    const handleTop = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.018, 0.02), darkM);
    geos.add(handleTop.geometry);
    handleTop.position.set(0, 0.15, 0);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.035, 8), darkM);
    geos.add(neck.geometry);
    neck.position.set(0.05, 0.11, 0.02);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.14, 8), metal);
    geos.add(spout.geometry);
    spout.rotation.z = -Math.PI / 3;
    spout.position.set(0.05 + Math.sin(Math.PI / 3) * 0.07, 0.11 + Math.cos(Math.PI / 3) * 0.07, 0.02);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.018, 0.03, 8), darkM);
    geos.add(cap.geometry);
    cap.rotation.z = -Math.PI / 3;
    cap.position.set(0.05 + Math.sin(Math.PI / 3) * 0.15, 0.11 + Math.cos(Math.PI / 3) * 0.15, 0.02);
    gasCan.add(jerry, ridge, handleL, handleR, handleTop, neck, spout, cap);
    add("gas", gasCan);

    const saw = new THREE.Group();
    saw.rotation.y = -0.35;
    saw.position.set(0.0, -0.08, -0.04);
    const sawBody = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.07), yellow);
    geos.add(sawBody.geometry);
    sawBody.position.set(-0.01, 0.02, 0);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.032), darkM);
    geos.add(rear.geometry);
    rear.position.set(-0.02, -0.01, 0.05);
    const frontKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 8), darkM);
    geos.add(frontKnob.geometry);
    frontKnob.rotation.x = Math.PI / 2;
    frontKnob.position.set(0.06, 0.05, 0.04);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.08), metal);
    geos.add(shoe.geometry);
    shoe.position.set(0.04, -0.05, 0);
    const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.086, 0.086, 0.006, 20), metal);
    geos.add(blade.geometry);
    blade.rotation.x = Math.PI / 2;
    blade.position.set(0.05, -0.01, 0);
    const arbor = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 8), darkM);
    geos.add(arbor.geometry);
    arbor.rotation.x = Math.PI / 2;
    arbor.position.set(0.05, -0.01, 0);
    const bladeGuard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.02), yellow);
    geos.add(bladeGuard.geometry);
    bladeGuard.position.set(0.03, 0.045, 0);
    saw.add(sawBody, rear, frontKnob, shoe, blade, arbor, bladeGuard);
    add("saw", saw);

    const extG = new THREE.Group();
    extG.rotation.z = -0.28;
    extG.position.set(0.02, -0.12, -0.02);
    const extTank = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.062, 0.32, 12), red);
    geos.add(extTank.geometry);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.04, 12), metal);
    geos.add(stripe.geometry);
    stripe.position.y = 0.02;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.046, 0.04, 10), darkM);
    geos.add(collar.geometry);
    collar.position.y = 0.175;
    const valveBody = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.045, 0.04), darkM);
    geos.add(valveBody.geometry);
    valveBody.position.y = 0.21;
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.012, 0.018), metal);
    geos.add(lever.geometry);
    lever.position.set(0.01, 0.242, 0);
    const carry = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 6, 10, Math.PI), metal);
    geos.add(carry.geometry);
    carry.rotation.z = Math.PI;
    carry.position.set(-0.01, 0.25, 0);
    const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.2, 8), darkM);
    geos.add(hose.geometry);
    hose.rotation.z = Math.PI / 2.6;
    hose.position.set(0.07, 0.16, 0.01);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.09, 10), darkM);
    geos.add(horn.geometry);
    horn.rotation.z = Math.PI / 2.4;
    horn.position.set(0.16, 0.1, 0.01);
    extG.add(extTank, stripe, collar, valveBody, lever, carry, hose, horn);
    add("extinguisher", extG);

    const balloonG = new THREE.Group();
    const balloonMat = std(0x3c7fd0, 0.28, 0.12);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 12), balloonMat);
    geos.add(ball.geometry);
    ball.position.set(0.02, 0.1, -0.1);
    const balloonNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.05, 8), balloonMat);
    geos.add(balloonNeck.geometry);
    balloonNeck.position.set(0.02, 0.02, -0.06);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), darkM);
    geos.add(knot.geometry);
    knot.position.set(0.02, -0.005, -0.04);
    balloonG.add(ball, balloonNeck, knot);
    balloonG.rotation.set(0.35, 0.15, -0.55);
    add("balloon", balloonG);

    const jackG = new THREE.Group();
    const jackBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.24), yellow);
    geos.add(jackBody.geometry);
    jackBody.position.set(0.04, 0.02, -0.14);
    const jackGrip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.05), darkM);
    geos.add(jackGrip.geometry);
    jackGrip.position.set(0.03, -0.07, 0.02);
    const jackBar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), darkM);
    geos.add(jackBar.geometry);
    jackBar.rotation.z = Math.PI / 2;
    jackBar.position.set(0.08, 0.07, -0.06);
    const bit = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.18, 6), metal);
    geos.add(bit.geometry);
    bit.rotation.x = Math.PI / 2;
    bit.position.set(0.04, 0.0, -0.32);
    jackG.add(jackBody, jackGrip, jackBar, bit);
    add("jack", jackG);

    const nailMat = std(0xd06028, 0.45, 0.35);
    const nailG = new THREE.Group();
    const nailBody = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.22), nailMat);
    geos.add(nailBody.geometry);
    nailBody.position.set(0.03, 0.03, -0.12);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.055), darkM);
    geos.add(mag.geometry);
    mag.position.set(0.03, -0.05, -0.08);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 0.12), metal);
    geos.add(nose.geometry);
    nose.position.set(0.03, 0.02, -0.27);
    const nailGrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.045), darkM);
    geos.add(nailGrip.geometry);
    nailGrip.position.set(0.02, -0.04, 0.02);
    nailG.add(nailBody, mag, nose, nailGrip);
    add("nailer", nailG);

    vmRoot.position.set(0.28, -0.34, -0.55);
    return out;
  }

  function pickScenario(initial: boolean): ScenarioId {
    const q = new URLSearchParams(location.search).get("ticket");
    if (q && (SCENARIO_ORDER as string[]).includes(q)) return q as ScenarioId;
    if (initial && save.shifts === 0) return "unplug";
    const id = SCENARIO_ORDER[scenarioCursor % SCENARIO_ORDER.length];
    scenarioCursor += 1;
    if (id === "unplug" && save.shifts > 0) {
      const next = SCENARIO_ORDER[scenarioCursor % SCENARIO_ORDER.length];
      scenarioCursor += 1;
      return next;
    }
    return id;
  }

  function resetShift(next: ScenarioId) {
    scenario = next;
    ticketId = `INC-${1400 + Math.floor(Math.random() * 8000)}`;
    for (const d of devices) {
      d.health = 1;
      d.fire = 0;
      d.heat = 36;
      d.wet = 0;
      d.fan = true;
      d.hitFlash = 0;
      d.slide = 0;
      d.slideTarget = 0;
      for (const slot of d.slots) slot.state = "in";
    }
    heldPart = null;
    stock.fan = 2;
    stock.accel = 1;
    stock.drive = 1;
    stock.nic = 1;
    for (const c of cables) {
      c.port = c.kind === "ib" ? null : c.home;
      c.damage = 0;
      c.wet = 0;
      c.short = 0;
    }
    tripped.A = false;
    tripped.B = false;
    jobLive = false;
    settled = false;
    incidents = false;
    seenFire = false;
    smashScore = 0;
    payout = 0;
    payoutNote = "";
    outcome = null;
    chaosLeft = 30;
    chaosReason = "";
    elapsed = 0;
    holding = null;
    tool = "hands";
    ext = extMax();
    gas = 1;
    water = 1;
    gasWarned = false;
    extWarned = false;
    useT = 0;
    torqueT = 0;
    flash = 0;
    px = 0.05;
    pz = 1.95;
    yaw = 0;
    pitch = -0.16;
    vel.set(0, 0, 0);
    for (const p of puddles) {
      p.active = false;
      p.lit = false;
      p.amount = 0;
      p.mesh.visible = false;
    }
    for (const d of debris) {
      d.active = false;
      d.life = 0;
      d.mesh.visible = false;
    }
    for (const p of props) {
      p.dynamic = false;
      p.v.set(0, 0, 0);
      p.mesh.position.copy(p.home);
      p.mesh.rotation.copy(p.homeRot);
    }
    logs.splice(0, logs.length);
    lastLog = "";
    resetCrew();
    applyScenario(next);
    rollSabotage();
    screenKey = "";
  }

  function rollSabotage() {
    saboteur = -1;
    sabStage = "done";
    sabTimer = 0;
    if (hoseStream) hoseStream.visible = false;
    if (crew.length === 0 || Math.random() >= 0.06) return;
    saboteur = Math.floor(Math.random() * crew.length);
    sabStage = "wait";
    sabTimer = 1.8 + Math.random() * 2.4;
  }

  function hoseRack(dt: number) {
    for (const dev of devices) soakDevice(dev, 0.55 * dt);
    const tech = crew[saboteur];
    if (!tech) return;
    const fromY = 1.2;
    const toX = 0;
    const toY = 1.05;
    const toZ = 0.42;
    if (hoseStream) {
      _ab.set(toX - tech.x, toY - fromY, toZ - tech.z);
      const len = Math.max(0.2, _ab.length());
      hoseStream.visible = true;
      hoseStream.scale.set(1, len, 1);
      hoseStream.position.set(tech.x + _ab.x * 0.5, fromY + _ab.y * 0.5, tech.z + _ab.z * 0.5);
      hoseStream.quaternion.setFromUnitVectors(UP, _n.copy(_ab).multiplyScalar(1 / len));
    }
    for (let n = 0; n < 8; n++) {
      const t = 0.1 + Math.random() * 0.9;
      emit(
        sprayField,
        tech.x + (toX - tech.x) * t,
        fromY + (toY - fromY) * t,
        tech.z + (toZ - tech.z) * t,
        (toX - tech.x) * 2.2 + (Math.random() - 0.5),
        0.4,
        (toZ - tech.z) * 2.2,
        0.35,
      );
    }
  }

  function applyScenario(id: ScenarioId) {
    if (id === "unplug") {
      const c = netOf.get("gpu3");
      if (c) c.port = null;
      log("TOR P4 is dark. Seat GPU-04, then post HEAD-01.");
    } else if (id === "loose") {
      const c = powerOf.get("gpu0");
      if (c) c.damage = 0.32;
      log("GPU-01 lug is loose and ticking.");
    } else if (id === "fan") {
      const d = deviceById.get("gpu2");
      if (d) {
        d.fan = false;
        d.heat = 70;
        const fan = d.slots.find((slot) => slot.slot === "fan");
        if (fan) fan.state = "loose";
      }
      log("GPU-03 fan is off its latch.");
    } else if (id === "swap") {
      const a = powerOf.get("gpu1");
      const b = powerOf.get("gpu2");
      if (a && b) {
        const tmp = a.port;
        a.port = b.port;
        b.port = tmp;
      }
      log("GPU-02 and GPU-03 whips are crossed.");
    } else if (id === "nick") {
      const c = powerOf.get("gpu1");
      if (c) c.damage = 0.64;
      log("GPU-02 jacket is cut. Pull it, then weld.");
    } else if (id === "wet") {
      const d = deviceById.get("gpu3");
      if (d) d.wet = 0.82;
      log("GPU-04 is wet. Kill power and let it dry.");
    } else if (id === "double") {
      const net = netOf.get("head1");
      const pwr = powerOf.get("gpu1");
      if (net) net.port = "net:dead1";
      if (pwr) pwr.port = null;
      log("HEAD-01 is on a dead optic. GPU-02 has no whip.");
    }
  }

  function extMax() {
    return save.upgrades.co2 ? 1.75 : 1;
  }

  function maul() {
    return save.upgrades.maul ? 1.42 : 1;
  }

  function receivesPower(dev: Device) {
    const cable = powerOf.get(dev.id);
    if (!cable || !cable.port || cable.damage > 0.88 || dev.health < 0.28) return false;
    const port = portMap.get(cable.port);
    if (!port || port.kind !== "power" || !port.pdu) return false;
    if (tripped[port.pdu]) return false;
    return true;
  }

  function torUp() {
    const tor = deviceById.get("tor");
    return !!tor && receivesPower(tor);
  }

  function linkUp(dev: Device) {
    if (dev.slots.some((slot) => (slot.slot === "accel" || slot.slot === "nic") && slot.state !== "in")) return false;
    if (!dev.needsNet) return receivesPower(dev);
    const cable = netOf.get(dev.id);
    if (!cable || !cable.port || cable.damage > 0.55) return false;
    const port = portMap.get(cable.port);
    if (!port || port.kind !== "net" || cable.port !== cable.home) return false;
    return receivesPower(dev) && torUp();
  }

  function collectProblems() {
    const out: string[] = [];
    if (tripped.A) out.push("PDU-A breaker is open");
    if (tripped.B) out.push("PDU-B breaker is open");
    for (const d of devices) {
      if (d.health < 0.28) {
        out.push(`${d.name} is destroyed`);
        continue;
      }
      const pc = powerOf.get(d.id);
      const port = pc?.port ? portMap.get(pc.port) : undefined;
      const on = receivesPower(d);
      if (!pc || !pc.port) out.push(`${d.name} power whip is unplugged`);
      else if (!port || port.kind !== "power") out.push(`${d.name} power whip is in the wrong jack`);
      else if (port.pdu && tripped[port.pdu]) out.push(`${d.name} feed is dead — breaker`);
      else if (pc.home && pc.port !== pc.home) out.push(`${d.name} whip is on ${port.label}`);
      if (pc && pc.damage > 0.45) out.push(`${d.name} power jacket is cut`);
      else if (pc && pc.damage > 0.18) out.push(`${d.name} power lug is loose`);
      if (d.needsNet) {
        const nc = netOf.get(d.id);
        const np = nc?.port ? portMap.get(nc.port) : undefined;
        if (!nc || !nc.port) out.push(`${d.name} has no carrier`);
        else if (!np || np.kind !== "net") out.push(`${d.name} data cable is in a power outlet`);
        else if (nc.damage > 0.5) out.push(`${d.name} fiber is cut`);
        else if (nc.port !== nc.home) out.push(`${d.name} is on ${np.label}, not its label`);
        else if (!on) out.push(`${d.name} link is down — no power`);
        else if (!torUp()) out.push(`${d.name} link is down — TOR is dark`);
      }
      if (d.sled && (d.slideTarget > 0.5 || d.slide > 0.35)) out.push(`${d.name} sled is out`);
      const fan = d.slots.find((slot) => slot.slot === "fan");
      if (fan?.state === "out") out.push(`${d.name} fan is missing`);
      else if (fan?.state === "loose" || (!d.fan && d.role === "gpu")) out.push(`${d.name} fan is unseated`);
      if (d.slots.some((slot) => slot.slot === "accel" && slot.state === "out")) out.push(`${d.name} accelerator is out`);
      if (d.slots.some((slot) => slot.slot === "drive" && slot.state === "out")) out.push(`${d.name} boot drive is out`);
      if (d.slots.some((slot) => slot.slot === "nic" && slot.state === "out")) out.push(`${d.name} NIC is out`);
      if (d.fire > 0.05) out.push(`${d.name} is on fire`);
      else if (d.heat > 86) out.push(`${d.name} is too hot`);
      if (d.wet > 0.3) out.push(`${d.name} is wet`);
      const sc = Math.max(pc?.short ?? 0, netOf.get(d.id)?.short ?? 0);
      if (sc > 0.3) out.push(`Arc fault on ${d.name}`);
    }
    for (const c of cables) {
      if (c.kind === "ib" && c.damage > 0.45) out.push(`${c.name} is cut`);
    }
    return out;
  }

  function syncCamera() {
    const sp = Math.hypot(vel.x, vel.z);
    if (sp > 0.35 && (phase === "play" || phase === "chaos")) bobT += sp * 0.04;
    bob = Math.sin(bobT) * 0.02 * Math.min(1, sp / 2);
    const mag = trauma * trauma * (reduceMotion ? 0.2 : 1);
    const sx = (Math.random() - 0.5) * mag * 0.1;
    const sy = (Math.random() - 0.5) * mag * 0.07;
    yawObject.position.set(px, EYE, pz);
    yawObject.rotation.y = yaw;
    camera.rotation.x = pitch + kick;
    camera.position.set(sx, bob + sy, 0);
    yawObject.updateMatrixWorld(true);
  }

  function blocked(x: number, z: number) {
    if (x < -3.7 + RADIUS || x > 3.7 - RADIUS || z < -4.25 + RADIUS || z > 3.2 - RADIUS) return true;
    const solids = [
      { minX: -0.85, maxX: 0.85, minZ: -0.7, maxZ: 0.78 },
      { minX: -3.2, maxX: -2.3, minZ: -1.85, maxZ: -0.85 },
      { minX: 2.3, maxX: 3.2, minZ: -1.85, maxZ: -0.85 },
      { minX: -0.5, maxX: 0.5, minZ: -3.85, maxZ: -2.85 },
      { minX: -3.95, maxX: -3.4, minZ: 1.25, maxZ: 1.9 },
      { minX: -1.95, maxX: -1.15, minZ: 1.45, maxZ: 1.98 },
    ];
    for (const s of solids) {
      if (x > s.minX - RADIUS && x < s.maxX + RADIUS && z > s.minZ - RADIUS && z < s.maxZ + RADIUS) return true;
    }
    for (const d of devices) {
      if (!d.sled || d.slide < 0.3) continue;
      const front = 0.5 + d.slide * SLIDE;
      if (x > -0.46 - RADIUS && x < 0.46 + RADIUS && z > 0.2 && z < front + RADIUS) return true;
    }
    return false;
  }

  function integratePlayer(dt: number) {
    let ix = analogX;
    let iz = analogZ;
    if (keys.has("KeyW") || keys.has("ArrowUp")) iz += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) iz -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) ix += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) ix -= 1;
    const len = Math.hypot(ix, iz);
    if (len > 1) {
      ix /= len;
      iz /= len;
    }
    // yaw 0 looks down world -Z. forward = (-sin yaw, 0, -cos yaw). A strafes -right.
    flatForward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const speed = len > 0 ? (sprint ? 4.35 : 2.55) : 0;
    wish.copy(flatForward).multiplyScalar(iz * speed).addScaledVector(right, ix * speed);
    const accel = len > 0 ? 16 : 22;
    vel.x = approach(vel.x, wish.x, accel, dt);
    vel.z = approach(vel.z, wish.z, accel, dt);
    const nx = px + vel.x * dt;
    if (!blocked(nx, pz)) px = nx;
    else vel.x = 0;
    const nz = pz + vel.z * dt;
    if (!blocked(px, nz)) pz = nz;
    else vel.z = 0;
    if (Math.hypot(vel.x, vel.z) > 0.8) {
      stepTimer -= dt;
      if (stepTimer <= 0) {
        stepTimer = sprint ? 0.32 : 0.46;
        audio.foot();
      }
    }
  }

  function approach(cur: number, target: number, accel: number, dt: number) {
    const d = target - cur;
    const m = accel * dt;
    if (Math.abs(d) <= m) return target;
    return cur + Math.sign(d) * m;
  }

  function readHit(hit: THREE.Intersection): HitInfo | null {
    const data = hit.object.userData as { kind?: HitKind; id?: string };
    if (!data.kind || !data.id) return null;
    hitStore.kind = data.kind;
    hitStore.id = data.id;
    hitStore.distance = hit.distance;
    hitStore.point.copy(hit.point);
    if (hit.face) {
      _n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      hitStore.normal.copy(_n);
    } else hitStore.normal.set(0, 1, 0);
    return hitStore;
  }

  function firstAlong(ox: number, oy: number, pred?: (kind: HitKind, id: string) => boolean) {
    ndc.set(ox, oy);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(hitMeshes, false);
    for (const hit of hits) {
      const data = hit.object.userData as { kind?: HitKind; id?: string };
      if (!data.kind || !data.id) continue;
      if (pred && !pred(data.kind, data.id)) continue;
      return readHit(hit);
    }
    return null;
  }

  function cast(pred?: (kind: HitKind, id: string) => boolean) {
    const center = firstAlong(0, 0, pred);
    if (center) return center;
    let best: HitInfo | null = null;
    const allow = pred ?? ((kind: HitKind) => kind === "plug" || kind === "port" || kind === "breaker" || kind === "station");
    for (const [ox, oy] of ASSIST) {
      const hit = firstAlong(ox, oy, allow);
      if (!hit || hit.distance > 2.7) continue;
      if (!best || hit.distance < best.distance) {
        best = {
          kind: hit.kind,
          id: hit.id,
          distance: hit.distance,
          point: hit.point.clone(),
          normal: hit.normal.clone(),
        };
      }
    }
    if (!best) return null;
    hitStore.kind = best.kind;
    hitStore.id = best.id;
    hitStore.distance = best.distance;
    hitStore.point.copy(best.point);
    hitStore.normal.copy(best.normal);
    return hitStore;
  }

  function poseCables() {
    for (const cable of cables) {
      const host = deviceById.get(cable.device);
      cable.anchor.z = cable.anchorZ + (host?.slide ?? 0) * SLIDE;
      if (cable.peer) {
        const peer = deviceById.get(cable.peer);
        cable.anchorB.z = cable.anchorBZ + (peer?.slide ?? 0) * SLIDE;
      }
    }
    for (const dev of devices) dev.front.z = dev.frontZ + dev.slide * SLIDE;
    holdPoint.copy(yawObject.position);
    holdPoint.y -= 0.48;
    flatForward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    holdPoint.addScaledVector(flatForward, 0.62);
    for (const cable of cables) {
      if (cable.kind === "ib") {
        cable.path[0].copy(cable.anchor);
        cable.path[1].set(-0.22, (cable.anchor.y + cable.anchorB.y) * 0.5, 0.72);
        cable.path[2].copy(cable.anchorB);
        fillSamples(cable.path, 3, cable.samples);
        cable.end.copy(cable.anchorB);
      } else if (holding === cable.id) {
        cable.end.copy(holdPoint);
        route(cable);
      } else if (cable.port) {
        const port = portMap.get(cable.port);
        cable.end.copy(port ? port.pos : cable.park);
        route(cable);
      } else {
        cable.end.copy(cable.park);
        route(cable);
      }
      placeSegments(cable);
      if (cable.kind === "ib") {
        cable.plug.position.set(
          (cable.anchor.x + cable.anchorB.x) * 0.5,
          (cable.anchor.y + cable.anchorB.y) * 0.5,
          (cable.anchor.z + cable.anchorB.z) * 0.5 + 0.08,
        );
      } else {
        cable.plug.position.copy(cable.end);
        cable.plug.position.z += 0.035;
      }
      const plugMat = cable.plug.material as THREE.MeshStandardMaterial;
      const loose = cable.kind !== "ib" && !cable.port && holding !== cable.id;
      cable.plug.scale.setScalar(loose ? 1.55 : 1);
      if (cable.short > 0.35) {
        plugMat.emissive.setHex(0xff4d3a);
        plugMat.emissiveIntensity = 1.3;
      } else if (loose || cable.damage > 0.2) {
        plugMat.emissive.setHex(0xe39b2b);
        plugMat.emissiveIntensity = loose ? 0.95 : 0.45;
      } else {
        plugMat.emissive.setHex(0x000000);
        plugMat.emissiveIntensity = 0;
      }
      cable.plug.visible = true;
    }
    for (const [slot, mesh] of carryMesh) {
      const show = heldPart === slot;
      mesh.visible = show;
      if (show) mesh.position.copy(holdPoint);
    }
  }

  function route(cable: Cable) {
    if (cable.kind === "net") {
      const lane = (cable.anchor.y - 0.9) * 0.05;
      cable.path[0].copy(cable.anchor);
      cable.path[1].set(0.18 + lane, cable.anchor.y, 0.55);
      cable.path[2].set(0.22 + lane, cable.end.y, 0.56);
      cable.path[3].copy(cable.end);
      fillSamples(cable.path, 4, cable.samples);
      return;
    }
    cable.path[0].copy(cable.anchor);
    cable.path[1].copy(cable.anchor).add(cable.end).multiplyScalar(0.5);
    cable.path[1].y -= 0.08;
    cable.path[2].copy(cable.end);
    fillSamples(cable.path, 3, cable.samples);
  }

  function fillSamples(points: THREE.Vector3[], n: number, out: THREE.Vector3[]) {
    const count = out.length;
    let total = 0;
    for (let i = 0; i < n - 1; i++) {
      lens[i] = points[i].distanceTo(points[i + 1]);
      total += lens[i];
    }
    if (total < 1e-5) {
      for (const o of out) o.copy(points[0]);
      return;
    }
    for (let s = 0; s < count; s++) {
      let dist = (s / (count - 1)) * total;
      let i = 0;
      while (i < n - 2 && dist > lens[i]) {
        dist -= lens[i];
        i++;
      }
      const t = lens[i] <= 1e-6 ? 0 : dist / lens[i];
      out[s].copy(points[i]).lerp(points[i + 1], Math.min(1, Math.max(0, t)));
    }
  }

  function placeSegments(cable: Cable) {
    for (let i = 0; i < cable.segs.length; i++) {
      const p0 = cable.samples[i];
      const p1 = cable.samples[i + 1];
      const seg = cable.segs[i];
      _delta.subVectors(p1, p0);
      const len = _delta.length();
      const cut = cable.kind === "ib" && cable.damage > 0.8 && (i === 3 || i === 4);
      if (len < 0.001 || cut) {
        seg.visible = false;
        continue;
      }
      seg.visible = true;
      seg.position.copy(p0).add(p1).multiplyScalar(0.5);
      const rad = cable.kind === "ib" ? 0.02 : cable.kind === "net" ? 0.011 : 0.015;
      seg.scale.set(rad, len, rad);
      _delta.multiplyScalar(1 / len);
      if (_delta.y < -0.995) seg.quaternion.set(1, 0, 0, 0);
      else seg.quaternion.setFromUnitVectors(UP, _delta);
    }
  }

  function aim() {
    camera.getWorldPosition(camPos);
    camera.getWorldDirection(camDir);
  }

  function distToSeg(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
    _ab.subVectors(b, a);
    const l2 = _ab.lengthSq();
    if (l2 < 1e-6) return p.distanceTo(a);
    const t = Math.max(0, Math.min(1, _ap.subVectors(p, a).dot(_ab) / l2));
    _closest.copy(a).addScaledVector(_ab, t);
    return p.distanceTo(_closest);
  }

  function burst(point: THREE.Vector3, normal: THREE.Vector3, n: number) {
    let spawned = 0;
    for (const d of debris) {
      if (d.active) continue;
      d.active = true;
      d.life = 2.6 + Math.random() * 1.4;
      d.mesh.visible = true;
      d.mesh.position.copy(point);
      const s = 0.055 + Math.random() * 0.11;
      d.mesh.scale.set(s, s * (0.35 + Math.random() * 0.4), s * (0.6 + Math.random() * 0.5));
      d.v.set((Math.random() - 0.5) * 3.2, 2.2 + Math.random() * 3.1, (Math.random() - 0.5) * 3.2);
      d.v.addScaledVector(normal, 2.1 + Math.random() * 1.4);
      d.w.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      spawned += 1;
      if (spawned >= n) break;
    }
  }

  function hurt(dev: Device, amount: number, hit: HitInfo, spill: boolean) {
    const before = dev.health;
    dev.health = Math.max(0, dev.health - amount);
    dev.hitFlash = 0.08;
    smashScore += amount;
    if (amount > 0.02) incidents = true;
    if (spill) burst(hit.point, hit.normal, amount > 0.08 ? 8 : 4);
    if (before >= 0.55 && dev.health < 0.55) burst(dev.front, hit.normal, 10);
    if (before >= 0.28 && dev.health < 0.28) {
      burst(dev.front, hit.normal, 14);
      dev.face.position.z += 0.12;
      trauma = Math.min(1, trauma + 0.45);
      log(`${dev.name} chassis failed`);
    }
    poseDamage(dev);
    if (receivesPower(dev)) {
      emit(sparks, hit.point.x, hit.point.y, hit.point.z, (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.25);
      audio.spark();
    }
  }

  function poseDamage(dev: Device) {
    const dmg = 1 - dev.health;
    const y = dev.sled ? 0 : dev.y;
    dev.body.position.y = y;
    dev.body.position.z = 0.04 - dmg * 0.07;
    dev.body.rotation.x = dmg * 0.08 * dev.sign;
    dev.body.rotation.z = dmg * 0.16 * dev.sign;
    dev.face.position.set(dmg * 0.05 * dev.sign, y - dmg * 0.06, 0.445 + dmg * 0.2);
    dev.face.rotation.set(dmg * 0.4 * dev.sign, dmg * 0.15, dmg * 0.62 * dev.sign);
    if (dev.sled) dev.sled.position.z = dev.slide * SLIDE;
  }

  function igniteNear(x: number, z: number, r: number) {
    const r2 = r * r;
    for (const p of puddles) {
      if (!p.active) continue;
      const dx = p.x - x;
      const dz = p.z - z;
      if (dx * dx + dz * dz <= r2) p.lit = true;
    }
  }

  function doTrip(cable: Cable, dev: Device, port: Port) {
    cable.short = 0.12;
    if (port.pdu) tripped[port.pdu] = true;
    else {
      tripped.A = true;
      tripped.B = true;
    }
    dev.fire = Math.max(dev.fire, 0.42);
    seenFire = true;
    incidents = true;
    flash = 1;
    trauma = Math.min(1, trauma + 0.55);
    log(`Arc fault — breaker open on ${cable.name}`);
    audio.spark();
    audio.alarm();
    for (let i = 0; i < 16; i++) {
      emit(
        sparks,
        cable.end.x,
        cable.end.y,
        cable.end.z,
        (Math.random() - 0.5) * 4,
        Math.random() * 3,
        (Math.random() - 0.5) * 4,
        0.18 + Math.random() * 0.25,
      );
    }
    igniteNear(cable.end.x, cable.end.z, 0.85);
  }

  function accumulateShort(cable: Cable, dt: number) {
    if (cable.kind === "ib" || !cable.port) {
      cable.short = Math.max(0, cable.short - 0.3 * dt);
      return;
    }
    const port = portMap.get(cable.port);
    const dev = deviceById.get(cable.device);
    if (!port || !dev) return;
    const live = port.kind === "power" && !!port.pdu && !tripped[port.pdu];
    const powered = receivesPower(dev);
    let rate = 0;
    if (live && cable.kind !== "power") rate += 0.9;
    if (live && cable.kind === "power" && cable.home && cable.port !== cable.home) rate += 0.2;
    if (powered && cable.kind === "power" && cable.damage > 0.18 && cable.damage < 0.9) {
      rate += 0.08 + cable.damage * 0.32;
    }
    if (powered && (dev.wet > 0.3 || cable.wet > 0.3)) rate += 0.36;
    if (save.upgrades.gloves) rate *= 0.58;
    if (rate > 0) cable.short = Math.min(1.35, cable.short + rate * dt);
    else cable.short = Math.max(0, cable.short - 0.28 * dt);
    if (cable.short >= 1) doTrip(cable, dev, port);
    if (cable.short > 0.45 && Math.random() < cable.short * dt * 10) {
      emit(
        sparks,
        cable.end.x,
        cable.end.y,
        cable.end.z,
        (Math.random() - 0.5) * 2,
        1 + Math.random() * 2,
        1 + Math.random(),
        0.16,
      );
      sparkLight.position.copy(cable.end);
      sparkLight.intensity = 8;
      audio.spark();
      if (cable.short > 0.62) igniteNear(cable.end.x, cable.end.z, 0.7);
    }
  }

  function integrateSim(dt: number) {
    for (const dev of devices) syncFan(dev);
    for (const dev of devices) {
      const on = receivesPower(dev);
      let target = 28;
      if (on && dev.fan) target = 47;
      if (on && !dev.fan) target = 116;
      if (dev.fire > 0) target += 55 * dev.fire;
      const k = on && !dev.fan ? 0.16 : 0.22;
      dev.heat += (target - dev.heat) * Math.min(1, dt * k);
      if (on && !dev.fan && dev.heat > 102) {
        if (dev.fire < 0.05) log(`${dev.name} cooked itself into a fire`);
        dev.fire = Math.max(dev.fire, 0.2);
        seenFire = true;
      }
      const dry = on ? 0.012 : 0.07;
      dev.wet = Math.max(0, dev.wet - dry * dt);
      const pc = powerOf.get(dev.id);
      if (pc) pc.wet = Math.max(0, pc.wet - dry * 0.6 * dt);
      if (dev.fire > 0) {
        const grow = dev.heat > 60 ? 0.055 : -0.05;
        dev.fire = Math.min(1, Math.max(0, dev.fire + grow * dt));
        dev.health = Math.max(0, dev.health - dev.fire * dt * 0.02);
        if (dev.fire > 0.08) seenFire = true;
        if (dev.fire < 0.02) dev.fire = 0;
      }
    }
    for (let i = 0; i < devices.length - 1; i++) {
      const gap = devices[i + 1].y - devices[i].y;
      if (gap > 0.32) continue;
      if (devices[i].fire > 0.5) devices[i + 1].fire = Math.min(1, devices[i + 1].fire + dt * 0.045);
      if (devices[i + 1].fire > 0.5) devices[i].fire = Math.min(1, devices[i].fire + dt * 0.03);
    }
    for (const cable of cables) {
      if (cable.kind !== "ib" && cable.damage > 0.93 && cable.port) {
        cable.port = null;
        log(`${cable.name} severed`);
      }
      accumulateShort(cable, dt);
    }
    for (const p of puddles) {
      if (!p.active || !p.lit) continue;
      p.amount -= dt * 0.1;
      seenFire = true;
      for (const d of devices) {
        const dx = d.front.x - p.x;
        const dz = d.front.z - p.z;
        if (dx * dx + dz * dz < 1.35) d.fire = Math.min(1, d.fire + dt * 0.5);
      }
      for (const o of puddles) {
        if (!o.active || o === p) continue;
        const dx = o.x - p.x;
        const dz = o.z - p.z;
        if (dx * dx + dz * dz < 0.64) o.lit = true;
      }
      if (p.amount <= 0.02) {
        p.active = false;
        p.lit = false;
        p.amount = 0;
      }
    }
    const problems = collectProblems();
    if (problems.length) jobLive = false;
    if (phase === "play" && jobLive && problems.length === 0) {
      bank("fixed", problems);
      return;
    }
    if (phase === "play") {
      if (devices.some((d) => d.health < 0.28)) startChaos("A node is scrap. Meltdown in thirty seconds.");
      else if (devices.filter((d) => d.fire > 0.55).length >= 3) startChaos("Three nodes are burning. Meltdown in thirty seconds.");
    }
    if (phase === "chaos") {
      chaosLeft -= dt;
      if (Math.random() < dt * 1.6) {
        const d = devices[Math.floor(Math.random() * devices.length)];
        d.fire = Math.min(1, d.fire + 0.18);
        emit(sparks, d.front.x, d.front.y, d.front.z, (Math.random() - 0.5) * 3, 2, 1, 0.2);
      }
      if (chaosLeft <= 0) bank("chaos", problems);
    }
  }

  function nearestId(kind: "plug" | "port", radius: number, maxDist: number) {
    aim();
    let best = "";
    let bestD = radius;
    if (kind === "plug") {
      for (const cable of cables) {
        if (cable.kind === "ib" || holding === cable.id) continue;
        const t = _ap.copy(cable.plug.position).sub(camPos).dot(camDir);
        if (t < 0.25 || t > maxDist) continue;
        _closest.copy(camPos).addScaledVector(camDir, t);
        const d = _closest.distanceTo(cable.plug.position);
        if (d < bestD) {
          bestD = d;
          best = cable.id;
        }
      }
    } else {
      for (const port of ports) {
        const t = _ap.copy(port.pos).sub(camPos).dot(camDir);
        if (t < 0.25 || t > maxDist) continue;
        _closest.copy(camPos).addScaledVector(camDir, t);
        const d = _closest.distanceTo(port.pos);
        if (d < bestD) {
          bestD = d;
          best = port.id;
        }
      }
    }
    return best;
  }

  function slotOf(id: string) {
    const split = id.indexOf(":");
    if (split < 0) return null;
    const dev = deviceById.get(id.slice(0, split));
    const name = id.slice(split + 1) as PartSlot;
    const slot = dev?.slots.find((entry) => entry.slot === name);
    if (!dev || !slot) return null;
    return { dev, slot };
  }

  function syncFan(dev: Device) {
    const fan = dev.slots.find((slot) => slot.slot === "fan");
    if (fan) dev.fan = fan.state === "in";
  }

  function onHandsPress() {
    const hit = cast();
    const aimed = hit && hit.distance < 2.4 ? hit : null;
    const busy =
      aimed &&
      (aimed.kind === "chassis" ||
        aimed.kind === "screen" ||
        aimed.kind === "breaker" ||
        aimed.kind === "station" ||
        aimed.kind === "latch" ||
        aimed.kind === "part" ||
        aimed.kind === "spare");
    if (heldPart) {
      if (aimed?.kind === "part") {
        const found = slotOf(aimed.id);
        if (!found) return;
        if (found.dev.slide < 0.45) {
          log("Slide the sled out before you install that");
          return;
        }
        if (found.slot.state === "out" && found.slot.slot === heldPart) {
          found.slot.state = "in";
          heldPart = null;
          syncFan(found.dev);
          log(`Installed the ${PART_LABEL[found.slot.slot]} in ${found.dev.name}`);
          audio.ui();
          return;
        }
        log("That socket takes a different part");
        return;
      }
      if (aimed?.kind === "spare") {
        stock[heldPart] += 1;
        log(`Returned the ${PART_LABEL[heldPart]} to the crib`);
        heldPart = null;
        audio.ui();
        return;
      }
      stock[heldPart] += 1;
      log(`Dropped the ${PART_LABEL[heldPart]} back in the crib`);
      heldPart = null;
      return;
    }
    if (holding) {
      if (aimed?.kind === "latch" || aimed?.kind === "part" || aimed?.kind === "spare") {
        log("Drop the whip first");
        return;
      }
      const portId = aimed?.kind === "port" ? aimed.id : busy ? "" : nearestId("port", 0.22, 2.4);
      if (portId) insert(portId);
      else {
        holding = null;
        log("Whip set down");
      }
      return;
    }
    if (aimed?.kind === "latch") {
      const dev = deviceById.get(aimed.id);
      if (!dev?.sled) return;
      if (dev.health < 0.28) {
        log("Chassis is scrap. It will not slide.");
        return;
      }
      dev.slideTarget = dev.slideTarget > 0.5 ? 0 : 1;
      log(dev.slideTarget > 0.5 ? `Pulling ${dev.name} out on the rails` : `Sliding ${dev.name} back in`);
      audio.ui();
      return;
    }
    if (aimed?.kind === "part") {
      const found = slotOf(aimed.id);
      if (!found) return;
      if (found.dev.slide < 0.45) {
        log("Slide the sled out — amber latch on the right");
        return;
      }
      if (found.slot.state === "loose") {
        found.slot.state = "in";
        syncFan(found.dev);
        log(`Seated the ${PART_LABEL[found.slot.slot]} in ${found.dev.name}`);
        audio.ui();
        return;
      }
      if (found.slot.state === "in") {
        found.slot.state = "out";
        heldPart = found.slot.slot;
        syncFan(found.dev);
        log(`Pulled the ${PART_LABEL[found.slot.slot]} from ${found.dev.name}`);
        audio.ui();
        return;
      }
      log("Socket is empty");
      return;
    }
    if (aimed?.kind === "spare") {
      const slot = aimed.id as PartSlot;
      if (!PART_LABEL[slot]) return;
      if (stock[slot] <= 0) {
        log("Crib is out of those");
        return;
      }
      stock[slot] -= 1;
      heldPart = slot;
      log(`Took a spare ${PART_LABEL[slot]}`);
      audio.ui();
      return;
    }
    const plugId = aimed?.kind === "plug" ? aimed.id : busy ? "" : nearestId("plug", 0.24, 2.5);
    if (plugId) {
      const cable = cableById.get(plugId);
      if (!cable || cable.kind === "ib") {
        if (cable) log("IB jumper is crimped. Cut it or weld it.");
        return;
      }
      cable.port = null;
      holding = cable.id;
      log(`Holding ${cable.name}`);
      audio.ui();
      return;
    }
    if (aimed?.kind === "door") log("Door stays latched until the ticket closes.");
  }

  function insert(portId: string) {
    const cable = holding ? cableById.get(holding) : undefined;
    const port = portMap.get(portId);
    if (!cable || !port) return;
    for (const other of cables) {
      if (other !== cable && other.port === portId) {
        other.port = null;
        log(`${other.name} popped off ${port.label}`);
      }
    }
    cable.port = portId;
    holding = null;
    log(`Seated ${cable.name} on ${port.label}`);
    audio.ui();
  }

  function tryPost() {
    const problems = collectProblems();
    if (problems.length) {
      log(`Won't post — ${problems[0]}`);
      return;
    }
    jobLive = true;
    log("Workload posted on HEAD-01");
    audio.ui();
  }

  function handsHold(dt: number) {
    if (holding) {
      useT = 0;
      return;
    }
    const hit = cast();
    if (!hit || hit.distance > 2.4) {
      useT = 0;
      return;
    }
    if (hit.kind === "breaker") {
      useT += dt;
      if (useT > 0.34) {
        const id = hit.id === "A" ? "A" : "B";
        tripped[id] = false;
        log(`PDU-${id} breaker reset`);
        audio.ui();
        useT = 0;
      }
      return;
    }
    if (hit.kind === "station") {
      useT += dt;
      if (useT > 0.4) {
        ext = extMax();
        gas = 1;
        gasWarned = false;
        extWarned = false;
        log("Cabinet topped up CO2 and gas");
        audio.ui();
        useT = 0;
      }
      return;
    }
    if (hit.kind === "chassis" || hit.kind === "screen") {
      const id = hit.kind === "screen" ? "head1" : hit.id;
      const dev = deviceById.get(id);
      if (!dev) return;
      useT += dt;
      if (useT > 0.72) {
        const openFan = dev.slots.find((slot) => slot.slot === "fan" && slot.state !== "in");
        if (openFan) log("Slide the sled out and seat the fan on top");
        else if (dev.id === "head1") tryPost();
        else log(`${dev.name} is already seated`);
        useT = 0;
      }
      return;
    }
    useT = 0;
  }

  function wrenchHold(dt: number) {
    const hit = cast();
    if (!hit || hit.distance > 2.3) {
      torqueT = 0;
      return;
    }
    let cable: Cable | undefined;
    if (hit.kind === "plug") cable = cableById.get(hit.id);
    if (hit.kind === "chassis") cable = powerOf.get(hit.id);
    if (!cable || cable.kind === "ib") {
      torqueT = 0;
      return;
    }
    if (cable.damage <= 0.02) {
      log("Lug is already tight");
      torqueT = 0;
      return;
    }
    if (cable.damage >= 0.45) {
      log("Jacket is cut — use the welder");
      torqueT = 0;
      return;
    }
    torqueT += dt;
    if (torqueT > 0.5) {
      cable.damage = 0;
      torqueT = 0;
      log(`Torqued ${cable.name}`);
      audio.ui();
    }
  }

  function meleeHit() {
    const spec = MELEE[tool];
    const hit = cast();
    if (!spec || !hit || hit.distance > spec.range) {
      audio.hit(0.12);
      return;
    }
    const dmg = spec.dmg * maul();
    if (hit.kind === "chassis" || hit.kind === "screen") {
      const dev = deviceById.get(hit.kind === "screen" ? "head1" : hit.id);
      if (dev) {
        hurt(dev, dmg, hit, true);
        if (tool === "balloon") soakDevice(dev, 0.9);
      }
    } else if (hit.kind === "plug") {
      const cable = cableById.get(hit.id);
      if (cable) {
        cable.damage = Math.min(1, cable.damage + dmg * 2.4);
        burst(hit.point, hit.normal, 4);
        incidents = true;
        smashScore += dmg;
        if (cable.kind !== "ib" && cable.damage > 0.85) cable.port = null;
      }
    } else if (hit.kind === "prop") {
      const prop = props.find((p) => p.id === hit.id);
      if (prop) {
        prop.dynamic = true;
        prop.v.copy(hit.normal).multiplyScalar(2.2);
        prop.v.y += 2.4;
        prop.w.set(4, 3, 2);
      }
    } else if (hit.kind === "port" || hit.kind === "breaker") {
      burst(hit.point, hit.normal, 3);
    } else {
      audio.hit(0.15);
      return;
    }
    audio.hit(spec.heavy);
    trauma = Math.min(1, trauma + 0.22 + spec.heavy * 0.28);
    kick = -0.018 - spec.heavy * 0.02;
    if (tool === "balloon") {
      for (let i = 0; i < 8; i++) {
        emit(
          sprayField,
          hit.point.x,
          hit.point.y,
          hit.point.z,
          (Math.random() - 0.5) * 2.4,
          1.2 + Math.random(),
          (Math.random() - 0.5) * 2.4,
          0.35,
        );
      }
    }
  }

  function soakDevice(dev: Device, amount: number) {
    dev.wet = Math.min(1, dev.wet + amount);
    const power = powerOf.get(dev.id);
    if (power) power.wet = Math.min(1, power.wet + amount * 0.8);
    const net = netOf.get(dev.id);
    if (net) net.wet = Math.min(1, net.wet + amount * 0.45);
    incidents = true;
  }

  function sprayDevices(range: number, fn: (dev: Device) => void) {
    aim();
    segEnd.copy(camPos).addScaledVector(camDir, range);
    for (const dev of devices) {
      if (distToSeg(dev.front, camPos, segEnd) < 0.62) fn(dev);
    }
    return segEnd;
  }

  function integrateTools(dt: number) {
    swingCd = Math.max(0, swingCd - dt);
    const spec = MELEE[tool];
    if (primaryQueued) {
      if (spec && swingCd <= 0 && !swinging) {
        if (isSpecial(tool) && save.specials[tool] <= 0) {
          selectTool("hands");
        } else {
          if (isSpecial(tool)) {
            save.specials[tool] -= 1;
            writeSave(save);
          }
          swinging = true;
          swing01 = 0;
          swingDidHit = false;
          swingCd = spec.cd;
        }
      }
      primaryQueued = false;
    }
    if (swinging && spec) {
      swing01 += dt / spec.dur;
      if (!swingDidHit && swing01 >= 0.34) {
        swingDidHit = true;
        meleeHit();
      }
      if (swing01 >= 1) {
        swinging = false;
        swing01 = 0;
        if (isSpecial(tool) && save.specials[tool] <= 0) selectTool("hands");
      }
    }

    let spraying = false;
    if (primaryHeld && !spec) {
      if (tool === "saw") {
        const hit = cast();
        if (hit && hit.distance < 1.95 && (hit.kind === "chassis" || hit.kind === "screen" || hit.kind === "plug")) {
          spraying = true;
          sawDebris -= dt;
          const spill = sawDebris <= 0;
          if (spill) sawDebris = 0.14;
          if (hit.kind === "plug") {
            const cable = cableById.get(hit.id);
            if (cable) cable.damage = Math.min(1, cable.damage + dt * 0.95);
            if (spill) burst(hit.point, hit.normal, 2);
          } else {
            const dev = deviceById.get(hit.kind === "screen" ? "head1" : hit.id);
            if (dev) hurt(dev, 0.22 * dt, hit, spill);
          }
          emit(sparks, hit.point.x, hit.point.y, hit.point.z, (Math.random() - 0.5) * 2, 1, 2, 0.12);
          trauma = Math.min(1, trauma + dt * 0.5);
        }
      } else if (tool === "torch") {
        const hit = cast();
        spraying = true;
        if (hit && hit.distance < 2.6) {
          igniteNear(hit.point.x, hit.point.z, 0.55);
          if (hit.kind === "plug") {
            const cable = cableById.get(hit.id);
            if (cable) cable.damage = Math.min(1, cable.damage + dt * 0.75);
            const dev = cable ? deviceById.get(cable.device) : undefined;
            if (dev) dev.fire = Math.min(1, dev.fire + dt * 0.25);
          } else if (hit.kind === "chassis" || hit.kind === "screen") {
            const dev = deviceById.get(hit.kind === "screen" ? "head1" : hit.id);
            if (dev) {
              dev.heat += 48 * dt;
              dev.fire = Math.min(1, dev.fire + dt * 0.42);
              seenFire = true;
            }
          } else if (hit.kind === "floor") {
            igniteNear(hit.point.x, hit.point.z, 0.7);
          }
          emit(embers, hit.point.x, hit.point.y, hit.point.z, (Math.random() - 0.5) * 0.3, 0.4, 0.2, 0.25);
        }
      } else if (tool === "welder") {
        const hit = cast();
        if (hit && hit.distance < 2.05) {
          spraying = true;
          if (hit.kind === "plug") {
            const cable = cableById.get(hit.id);
            if (cable && cable.damage > 0) {
              const rate = save.upgrades.kit ? 0.55 : 0.28;
              cable.damage = Math.max(0, cable.damage - rate * dt);
              if (cable.damage === 0) log(`${cable.name} jacket closed`);
            } else if (cable) {
              const dev = deviceById.get(cable.device);
              if (dev) {
                dev.heat += 20 * dt;
                if (dev.heat > 96) dev.fire = Math.min(1, dev.fire + dt * 0.2);
              }
            }
          } else if (hit.kind === "chassis" || hit.kind === "screen") {
            const dev = deviceById.get(hit.kind === "screen" ? "head1" : hit.id);
            if (dev) {
              dev.heat += 26 * dt;
              if (dev.heat > 92) {
                dev.fire = Math.min(1, dev.fire + dt * 0.22);
                seenFire = true;
              }
            }
          }
          igniteNear(hit.point.x, hit.point.z, 0.45);
          emit(sparks, hit.point.x, hit.point.y, hit.point.z, (Math.random() - 0.5), 0.6, 0.4, 0.1);
        }
      } else if (tool === "gas") {
        if (gas <= 0) {
          if (!gasWarned) {
            log("Gas can is empty — refill at the cabinet");
            gasWarned = true;
          }
        } else {
          const hit = cast();
          if (hit && hit.distance < 2.8) {
            spraying = true;
            gas = Math.max(0, gas - dt * 0.22);
            let puddle = puddles.find((p) => p.active && (p.x - hit.point.x) ** 2 + (p.z - hit.point.z) ** 2 < 0.28);
            if (!puddle) puddle = puddles.find((p) => !p.active);
            if (puddle) {
              if (!puddle.active) {
                puddle.x = hit.point.x;
                puddle.z = hit.point.z;
                puddle.amount = 0;
                puddle.lit = false;
                puddle.active = true;
              }
              puddle.amount = Math.min(1.5, puddle.amount + dt * 0.85);
            }
            emit(sprayField, hit.point.x, hit.point.y + 0.2, hit.point.z, (Math.random() - 0.5), -0.4, (Math.random() - 0.5), 0.2);
          }
        }
      } else if (tool === "washer" || tool === "extinguisher") {
        const isCo2 = tool === "extinguisher";
        const charge = isCo2 ? ext : water;
        if (charge <= 0) {
          if (isCo2 && !extWarned) {
            log("CO2 is empty — cabinet on the left wall");
            extWarned = true;
          }
        } else {
          spraying = true;
          const range = isCo2 ? 4.6 : 4.1;
          const end = sprayDevices(range, (dev) => {
            dev.fire = Math.max(0, dev.fire - (isCo2 ? 0.95 : 1.05) * dt);
            if (!isCo2) {
              dev.wet = Math.min(1, dev.wet + 0.72 * dt);
              const pc = powerOf.get(dev.id);
              if (pc) pc.wet = Math.min(1, pc.wet + 0.55 * dt);
            }
          });
          if (isCo2) ext = Math.max(0, ext - dt * (save.upgrades.co2 ? 0.07 : 0.13));
          else water = Math.max(0, water - dt * 0.16);
          for (const p of puddles) {
            if (!p.active) continue;
            const dx = p.x - end.x;
            const dz = p.z - end.z;
            if (dx * dx + dz * dz < 1.4) {
              p.amount -= dt * 0.7;
              if (isCo2 || p.amount < 0.25) p.lit = false;
              if (p.amount <= 0) p.active = false;
            }
          }
          aim();
          for (let i = 0; i < 4; i++) {
            const t = 0.3 + Math.random() * 0.7;
            emit(
              sprayField,
              camPos.x + camDir.x * range * t,
              camPos.y + camDir.y * range * t,
              camPos.z + camDir.z * range * t,
              camDir.x * 4 + (Math.random() - 0.5),
              camDir.y * 4,
              camDir.z * 4,
              0.18,
            );
          }
        }
      }
    }
    audio.spray(spraying ? 0.09 : 0, tool === "torch" || tool === "saw");

    if (interactQueued && tool === "hands") {
      onHandsPress();
      interactQueued = false;
    } else if (interactQueued) interactQueued = false;

    if (interactHeld && tool === "hands") handsHold(dt);
    else useT = 0;
    if (interactHeld && tool === "wrench") wrenchHold(dt);
    else torqueT = 0;

    if (!isCo2Tool()) extWarned = ext > 0.05 ? false : extWarned;
  }

  function isCo2Tool() {
    return tool === "extinguisher";
  }

  function startChaos(reason: string) {
    if (phase !== "play" || settled) return;
    phase = "chaos";
    pausedFrom = "chaos";
    chaosLeft = 30;
    chaosReason = reason;
    log(reason);
    audio.meltdown();
    for (const d of devices) {
      if (Math.random() < 0.55) d.fire = Math.max(d.fire, 0.28);
    }
    flash = 0.8;
    publish(true);
  }

  function bank(kind: "fixed" | "chaos", problems: string[]) {
    if (settled) return;
    settled = true;
    outcome = kind;
    if (kind === "fixed") {
      const timeBonus = Math.max(0, Math.round((130 - elapsed) * 4));
      const clean = !incidents && !seenFire && smashScore < 0.05 ? 250 : 0;
      payout = 500 + timeBonus + clean;
      payoutNote = `Base 500 · time ${timeBonus} · clean ${clean}`;
      save.fixed += 1;
      audio.win();
    } else {
      const cuts = cables.filter((c) => c.damage > 0.8).length;
      const blaze = devices.reduce((sum, d) => sum + d.fire, 0);
      payout = Math.round(Math.min(460, 70 + smashScore * 160 + cuts * 24 + blaze * 36));
      payoutNote = chaosReason || "The hall is a write-off.";
      save.chaos += 1;
    }
    save.credits += payout;
    save.shifts += 1;
    writeSave(save);
    phase = "debrief";
    primaryHeld = false;
    interactHeld = false;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    void problems;
    hooks?.onRun?.({
      kind,
      seconds: kind === "fixed" ? Math.round(elapsed * 10) / 10 : null,
      token: crypto.randomUUID(),
    });
    publish(true);
  }

  function updateVisuals(dt: number) {
    trauma = Math.max(0, trauma - dt * 1.8);
    kick *= Math.exp(-dt * 10);
    flash = Math.max(0, flash - dt * 1.6);
    sparkLight.intensity = Math.max(0, sparkLight.intensity - dt * 30);
    water = Math.min(1, water + dt * 0.045);

    let powered = 0;
    let fireSum = 0;
    let arc = 0;
    for (const d of devices) {
      syncFan(d);
      if (d.sled) d.slide = THREE.MathUtils.damp(d.slide, d.slideTarget, 10, dt);
      for (const slot of d.slots) {
        slot.mesh.visible = slot.state !== "out";
        slot.mesh.position.y = slot.restY + (slot.state === "loose" ? 0.05 : 0);
        slot.mesh.rotation.z = slot.state === "loose" ? 0.4 : 0;
        const mat = slot.mesh.material as THREE.MeshStandardMaterial;
        mat.emissive.setHex(slot.state === "loose" ? 0xe39b2b : 0x000000);
        mat.emissiveIntensity = slot.state === "loose" ? 0.85 : 0;
      }
      if (receivesPower(d)) powered += 1;
      fireSum += d.fire;
      const pc = powerOf.get(d.id);
      arc = Math.max(arc, pc?.short ?? 0, netOf.get(d.id)?.short ?? 0);
      const hot = d.fire > 0.05 || d.heat > 86 || !d.fan;
      const bad = d.health < 0.28 || d.fire > 0.2 || (pc?.short ?? 0) > 0.45;
      const up = linkUp(d);
      const col = bad ? 0xff4d3a : !receivesPower(d) ? 0x241810 : hot || !up ? 0xffb020 : 0x3ecf8e;
      d.ledMat.emissive.setHex(col);
      d.ledMat.emissiveIntensity = receivesPower(d) || d.fire > 0 ? 1.35 : 0.08;
      if (d.hitFlash > 0) {
        d.hitFlash -= dt;
        d.chassisMat.emissive.setHex(0xffffff);
        d.chassisMat.emissiveIntensity = 0.45;
      } else if (d.fire > 0.04) {
        d.chassisMat.emissive.setHex(0xff4a1a);
        d.chassisMat.emissiveIntensity = 0.2 + d.fire * 0.9;
      } else {
        d.chassisMat.emissive.setHex(0x000000);
        d.chassisMat.emissiveIntensity = 0;
      }
      poseDamage(d);
      if (d.fire > 0.04) {
        const n = 1 + Math.floor(d.fire * 3);
        for (let i = 0; i < n; i++) {
          emit(
            embers,
            d.front.x + (Math.random() - 0.5) * 0.18,
            d.front.y + (Math.random() - 0.5) * 0.12,
            d.front.z,
            (Math.random() - 0.5) * 0.25,
            0.7 + Math.random() * 0.8,
            (Math.random() - 0.5) * 0.2,
            0.35 + Math.random() * 0.35,
          );
        }
        if (Math.random() < dt * 8) {
          emit(smoke, d.front.x, d.front.y + 0.1, d.front.z, (Math.random() - 0.5) * 0.15, 0.45, 0.1, 1.3);
        }
      }
    }

    for (const port of ports) {
      const occ = cables.find((c) => c.port === port.id);
      let col = 0x1a1d22;
      let inten = 0.05;
      if (port.kind === "power") {
        if (port.pdu && tripped[port.pdu]) {
          col = 0xff4d3a;
          inten = 1.1;
        } else if (occ && occ.home === port.id && occ.damage < 0.2) {
          col = 0x39d353;
          inten = 0.9;
        } else if (occ) {
          col = 0xffb020;
          inten = 1;
        }
      } else if (occ) {
        const dev = deviceById.get(occ.device);
        col = dev && linkUp(dev) ? 0x3ecf8e : 0xffb020;
        inten = 0.95;
      }
      port.led.emissive.setHex(col);
      port.led.emissiveIntensity = inten;
    }

    for (const [slot, mesh] of spareMesh) mesh.visible = stock[slot] > 0;

    trippedMat.A.emissive.setHex(tripped.A ? 0xff4d3a : 0x39d353);
    trippedMat.B.emissive.setHex(tripped.B ? 0xff4d3a : 0x39d353);
    const alarm = phase === "chaos" || fireSum > 0.08 || tripped.A || tripped.B || arc > 0.35;
    const pulse = alarm ? 0.35 + Math.sin(simT * 9) * 0.65 : 0.08;
    beaconMat.emissiveIntensity = pulse;
    fireLight.intensity = fireSum * 6 + (phase === "chaos" ? 4 : 0);
    fireLight.position.y = 1 + Math.sin(simT * 6) * 0.05;
    rackLight.intensity = 10 + powered * 0.5;
    rackLight.color.setHex(alarm ? 0xff6a2a : 0xfff3df);
    audio.hum(0.015 + powered * 0.008);
    if (alarm && (phase === "play" || phase === "chaos")) audio.alarm();

    for (const p of puddles) {
      p.mesh.visible = p.active && p.amount > 0.02;
      if (!p.mesh.visible) continue;
      const s = 0.45 + p.amount * 0.7;
      p.mesh.scale.set(s, s, s);
      p.mesh.position.set(p.x, 0.03, p.z);
      p.mat.color.setHex(p.lit ? 0xff6a1a : 0x2a2116);
      p.mat.emissive.setHex(p.lit ? 0xff4a12 : 0x000000);
      p.mat.emissiveIntensity = p.lit ? 0.8 : 0;
      if (p.lit && Math.random() < dt * 12) {
        emit(embers, p.x, 0.05, p.z, (Math.random() - 0.5) * 0.3, 0.8, (Math.random() - 0.5) * 0.3, 0.4);
      }
    }

    for (const d of debris) {
      if (!d.active) continue;
      d.life -= dt;
      d.v.y -= 14 * dt;
      d.mesh.position.addScaledVector(d.v, dt);
      d.mesh.rotation.x += d.w.x * dt;
      d.mesh.rotation.y += d.w.y * dt;
      if (d.mesh.position.y < 0.04) {
        d.mesh.position.y = 0.04;
        d.v.y *= -0.32;
        d.v.x *= 0.72;
        d.v.z *= 0.72;
      }
      if (d.life <= 0) {
        d.active = false;
        d.mesh.visible = false;
      }
    }

    for (const p of props) {
      if (!p.dynamic) continue;
      p.v.y -= 14 * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      p.mesh.rotation.x += p.w.x * dt;
      p.mesh.rotation.z += p.w.z * dt;
      if (p.mesh.position.y < p.restY) {
        p.mesh.position.y = p.restY;
        p.v.y *= -0.3;
        p.v.x *= 0.65;
        p.v.z *= 0.65;
      }
      const x = p.mesh.position.x;
      const z = p.mesh.position.z;
      if (x < -3.8 || x > 3.8) p.v.x *= -0.5;
      if (z < -4.2 || z > 3.2) p.v.z *= -0.5;
    }

    stepField(sparks, dt);
    stepField(embers, dt);
    stepField(smoke, dt);
    stepField(sprayField, dt);
    drawScreen();

    for (const [id, group] of models) {
      group.visible = id === tool;
      group.rotation.x = 0;
    }
    vmRoot.rotation.y = THREE.MathUtils.damp(vmRoot.rotation.y, 0, 6, dt);
    const swing = swinging ? Math.sin(Math.min(1, swing01) * Math.PI) : primaryHeld && !MELEE[tool] ? 0.08 : 0;
    vmRoot.rotation.x = swing * (tool === "sledge" ? -0.35 : -0.95);
    const held = models.get(tool);
    if (held && tool === "sledge") held.rotation.x = swing * -1.35;
    vmRoot.position.y = -0.34 + bob * 0.5;
    updateCrew(dt);
  }

  function faceYaw(dx: number, dz: number) {
    return Math.atan2(dx, dz);
  }

  function dampAngle(cur: number, target: number, k: number, dt: number) {
    let d = target - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return cur + d * (1 - Math.exp(-k * dt));
  }

  function techBlocked(x: number, z: number) {
    if (x < -3.4 || x > 3.4 || z < -3.9 || z > 2.85) return true;
    const solids = [
      { minX: -0.48, maxX: 0.48, minZ: -0.5, maxZ: 0.62 },
      { minX: -3.05, maxX: -2.35, minZ: -1.75, maxZ: -0.9 },
      { minX: 2.35, maxX: 3.05, minZ: -1.75, maxZ: -0.9 },
      { minX: -0.42, maxX: 0.42, minZ: -3.7, maxZ: -2.9 },
      { minX: -3.9, maxX: -3.45, minZ: 1.25, maxZ: 1.9 },
      { minX: -1.95, maxX: -1.15, minZ: 1.42, maxZ: 2.02 },
    ];
    for (const s of solids) {
      if (x > s.minX - 0.18 && x < s.maxX + 0.18 && z > s.minZ - 0.18 && z < s.maxZ + 0.18) return true;
    }
    return false;
  }

  function paintFace(_tone: string, mode: "calm" | "shock", variant: number) {
    return makeTex(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      if (mode === "shock") {
        g.strokeStyle = "#24180f";
        g.lineWidth = 10;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(36, 58);
        g.quadraticCurveTo(78, 18, 118, 62);
        g.stroke();
        g.beginPath();
        g.moveTo(138, 60);
        g.quadraticCurveTo(180, 16, 224, 64);
        g.stroke();
        g.fillStyle = "#f7f4ee";
        g.beginPath();
        g.ellipse(78, 112, 40, 46, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.ellipse(180, 112, 40, 46, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#16120e";
        const lx = variant === 1 ? 68 : 80;
        const rx = variant === 2 ? 194 : 176;
        g.beginPath();
        g.arc(lx, 118, 10, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(rx, 120, 10, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#3a1414";
        g.beginPath();
        g.ellipse(128, 196, 28, 36, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#f3eee4";
        g.fillRect(104, 164, 48, 14);
        g.fillStyle = "#d15a5a";
        g.beginPath();
        g.ellipse(128, 214, 16, 12, 0, 0, Math.PI * 2);
        g.fill();
        return;
      }
      g.fillStyle = "#f4c2b0";
      g.beginPath();
      g.ellipse(58, 150, 22, 12, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(198, 154, 18, 10, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#f7f4ee";
      g.beginPath();
      g.ellipse(74, 108, variant === 1 ? 28 : 36, variant === 1 ? 22 : 40, variant === 2 ? -0.2 : 0.08, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(176, variant === 0 ? 124 : 112, variant === 0 ? 18 : 26, variant === 1 ? 14 : 22, variant === 2 ? 0.35 : -0.15, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#1a140f";
      g.beginPath();
      g.arc(variant === 1 ? 62 : 84, variant === 2 ? 100 : 112, variant === 1 ? 8 : 12, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(variant === 0 ? 186 : 168, variant === 0 ? 122 : 112, variant === 2 ? 6 : 9, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#2a2118";
      g.lineWidth = 9;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(28, variant === 0 ? 52 : 78);
      g.quadraticCurveTo(70, variant === 0 ? 36 : 88, 112, 84);
      g.stroke();
      g.beginPath();
      g.moveTo(148, 86);
      g.quadraticCurveTo(190, variant === 2 ? 40 : 70, 230, variant === 2 ? 58 : 78);
      g.stroke();
      g.fillStyle = "#6a3030";
      g.beginPath();
      g.ellipse(128, 188, variant === 2 ? 16 : 22, 12, 0.08, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#4a2824";
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(96, 176);
      g.quadraticCurveTo(118, 198, 156, 172);
      g.stroke();
      g.fillStyle = "#f6f1e6";
      g.fillRect(118, 176, 10, 12);
    });
  }

  function buildCrew() {
    const bootMat = std(0x1a1c1f, 0.7, 0.15);
    const skinMat = std(0xc4a07a, 0.7, 0.02);
    const geoHead = new THREE.SphereGeometry(0.16, 16, 12);
    const geoEar = new THREE.SphereGeometry(0.055, 8, 6);
    const geoNose = new THREE.SphereGeometry(0.038, 8, 6);
    const geoTorso = new THREE.BoxGeometry(0.36, 0.46, 0.2);
    const geoHip = new THREE.BoxGeometry(0.32, 0.16, 0.18);
    const geoLeg = new THREE.CylinderGeometry(0.07, 0.055, 0.5, 6);
    const geoBoot = new THREE.BoxGeometry(0.11, 0.08, 0.18);
    const geoUpper = new THREE.CylinderGeometry(0.048, 0.04, 0.28, 6);
    const geoFore = new THREE.CylinderGeometry(0.04, 0.034, 0.26, 6);
    const geoHand = new THREE.SphereGeometry(0.046, 7, 5);
    const geoHat = new THREE.CylinderGeometry(0.125, 0.14, 0.1, 8);
    const geoBrim = new THREE.CylinderGeometry(0.18, 0.18, 0.025, 8);
    const geoBadge = new THREE.BoxGeometry(0.08, 0.1, 0.012);
    const geoStripe = new THREE.BoxGeometry(0.37, 0.045, 0.012);
    for (const geo of [geoHead, geoEar, geoNose, geoTorso, geoHip, geoLeg, geoBoot, geoUpper, geoFore, geoHand, geoHat, geoBrim, geoBadge, geoStripe]) {
      geos.add(geo);
    }
    const specs = [
      { x: -0.82, z: 1.16, suit: 0x2a3238, stripe: 0xe39b2b, hat: 0xe0a030, skin: "#c9a67c", variant: 0, tilt: 0.42, scale: 1 },
      { x: 0.88, z: 1.2, suit: 0x24323a, stripe: 0x7eb0d4, hat: 0xd8ddd4, skin: "#a67c58", variant: 1, tilt: -0.38, scale: 1.04 },
      { x: -1.42, z: 2.48, suit: 0x343228, stripe: 0x8aa56e, hat: 0xd06028, skin: "#d2b498", variant: 2, tilt: 0.36, scale: 0.96 },
    ];
    for (const spec of specs) {
      const suit = std(spec.suit, 0.72, 0.08);
      const stripe = std(spec.stripe, 0.5, 0.15);
      const hatMat = std(spec.hat, 0.55, 0.2);
      const group = new THREE.Group();
      group.scale.setScalar(spec.scale);
      const torso = new THREE.Group();
      group.add(torso);
      const hip = new THREE.Mesh(geoHip, suit);
      hip.position.y = 0.62;
      hip.castShadow = shadows;
      torso.add(hip);
      const chest = new THREE.Mesh(geoTorso, suit);
      chest.position.y = 0.96;
      chest.castShadow = shadows;
      torso.add(chest);
      const band = new THREE.Mesh(geoStripe, stripe);
      band.position.set(0, 1.08, 0.104);
      torso.add(band);
      const badge = new THREE.Mesh(geoBadge, stripe);
      badge.position.set(0.1, 0.9, 0.106);
      torso.add(badge);
      const legL = new THREE.Mesh(geoLeg, suit);
      legL.position.set(-0.09, 0.34, 0);
      legL.castShadow = shadows;
      group.add(legL);
      const legR = new THREE.Mesh(geoLeg, suit);
      legR.position.set(0.09, 0.34, 0);
      legR.castShadow = shadows;
      group.add(legR);
      const bootL = new THREE.Mesh(geoBoot, bootMat);
      bootL.position.set(-0.09, 0.05, 0.03);
      group.add(bootL);
      const bootR = new THREE.Mesh(geoBoot, bootMat);
      bootR.position.set(0.09, 0.05, 0.03);
      group.add(bootR);

      const armL = new THREE.Group();
      armL.position.set(-0.24, 1.14, 0);
      torso.add(armL);
      const upperL = new THREE.Mesh(geoUpper, suit);
      upperL.position.y = -0.14;
      upperL.castShadow = shadows;
      armL.add(upperL);
      const foreL = new THREE.Group();
      foreL.position.y = -0.28;
      armL.add(foreL);
      const foreMeshL = new THREE.Mesh(geoFore, suit);
      foreMeshL.position.y = -0.13;
      foreL.add(foreMeshL);
      const handL = new THREE.Mesh(geoHand, skinMat);
      handL.position.y = -0.28;
      foreL.add(handL);

      const armR = new THREE.Group();
      armR.position.set(0.24, 1.14, 0);
      torso.add(armR);
      const upperR = new THREE.Mesh(geoUpper, suit);
      upperR.position.y = -0.14;
      upperR.castShadow = shadows;
      armR.add(upperR);
      const foreR = new THREE.Group();
      foreR.position.y = -0.28;
      armR.add(foreR);
      const foreMeshR = new THREE.Mesh(geoFore, suit);
      foreMeshR.position.y = -0.13;
      foreR.add(foreMeshR);
      const handR = new THREE.Mesh(geoHand, skinMat);
      handR.position.y = -0.28;
      foreR.add(handR);

      const head = new THREE.Group();
      head.position.set(0, 1.3, 0);
      head.scale.setScalar(1.22);
      torso.add(head);
      const skin = std(Number.parseInt(spec.skin.slice(1), 16), 0.62, 0.02);
      const skull = new THREE.Mesh(geoHead, skin);
      skull.castShadow = shadows;
      head.add(skull);
      const earL = new THREE.Mesh(geoEar, skin);
      earL.position.set(-0.15, -0.01, 0);
      earL.scale.set(1, 1.15, 0.55);
      head.add(earL);
      const earR = new THREE.Mesh(geoEar, skin);
      earR.position.set(0.15, -0.02, 0);
      earR.scale.set(1, 1.25, 0.55);
      head.add(earR);
      const nose = new THREE.Mesh(geoNose, skin);
      nose.position.set(spec.variant === 1 ? -0.02 : 0.015, -0.02, 0.15);
      nose.scale.set(1, 0.85, 1.15);
      head.add(nose);
      const calmMap = paintFace(spec.skin, "calm", spec.variant);
      const shockMap = paintFace(spec.skin, "shock", spec.variant);
      const faceMat = new THREE.MeshBasicMaterial({ map: calmMap, transparent: true, depthWrite: false });
      mats.add(faceMat);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.32), faceMat);
      geos.add(face.geometry);
      face.position.set(0, 0.01, 0.162);
      face.renderOrder = 3;
      head.add(face);
      const hat = new THREE.Mesh(geoHat, hatMat);
      hat.position.y = 0.2;
      hat.rotation.z = spec.tilt * 0.85;
      hat.rotation.x = 0.08;
      head.add(hat);
      const brim = new THREE.Mesh(geoBrim, hatMat);
      brim.position.y = 0.15;
      brim.rotation.z = spec.tilt * 0.45;
      head.add(brim);

      const yaw = faceYaw(-spec.x, 0.4 - spec.z);
      group.position.set(spec.x, 0, spec.z);
      group.rotation.y = yaw;
      scene.add(group);
      if (!hoseStream) {
        const hoseMat = std(0x9fd4ef, 0.15, 0.02);
        hoseMat.transparent = true;
        hoseMat.opacity = 0.72;
        hoseMat.depthWrite = false;
        hoseStream = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.045, 1, 8), hoseMat);
        geos.add(hoseStream.geometry);
        hoseStream.visible = false;
        hoseStream.frustumCulled = false;
        scene.add(hoseStream);
      }
      crew.push({
        group,
        head,
        torso,
        armL,
        armR,
        foreL,
        foreR,
        homeX: spec.x,
        homeZ: spec.z,
        x: spec.x,
        z: spec.z,
        yaw,
        tx: spec.x,
        tz: spec.z,
        wait: 0,
        heat: 0,
        seed: crew.length * 1.7,
        tilt: spec.tilt,
        faceMat,
        calmMap,
        shockMap,
        shocked: false,
      });
    }
  }

  function resetCrew() {
    crewYelled = false;
    for (const c of crew) {
      c.x = c.homeX;
      c.z = c.homeZ;
      c.tx = c.homeX;
      c.tz = c.homeZ;
      c.wait = 0;
      c.heat = 0;
      c.yaw = faceYaw(-c.x, 0.4 - c.z);
      c.group.position.set(c.x, 0, c.z);
      c.group.rotation.set(0, c.yaw, 0);
      c.head.rotation.set(-0.08, 0, c.tilt);
      c.torso.rotation.set(0, 0, 0);
      c.shocked = false;
      c.faceMat.map = c.calmMap;
    }
  }

  function pickCrewTarget(c: Crew) {
    for (let i = 0; i < 10; i++) {
      const x = -3.1 + Math.random() * 6.2;
      const z = -3.5 + Math.random() * 6.1;
      if (techBlocked(x, z)) continue;
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < 1.4) continue;
      c.tx = x;
      c.tz = z;
      return;
    }
    c.tx = c.homeX + (Math.random() - 0.5);
    c.tz = Math.min(2.4, c.homeZ + (Math.random() - 0.5));
  }

  function crewMove(c: Crew, dx: number, dz: number, speed: number, dt: number) {
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return false;
    const vx = (dx / dist) * speed;
    const vz = (dz / dist) * speed;
    const tryAt = (x: number, z: number) => !techBlocked(x, z);
    if (tryAt(c.x + vx * dt, c.z + vz * dt)) {
      c.x += vx * dt;
      c.z += vz * dt;
      return true;
    }
    if (tryAt(c.x + vz * dt, c.z - vx * dt)) {
      c.x += vz * dt;
      c.z -= vx * dt;
      return true;
    }
    if (tryAt(c.x - vz * dt, c.z + vx * dt)) {
      c.x -= vz * dt;
      c.z += vx * dt;
      return true;
    }
    return false;
  }

  function updateCrew(dt: number) {
    const live = phase === "play" || phase === "chaos";
    const want = devices.some((d) => d.fire > 0.05) || phase === "chaos";
    if (want && live && !crewYelled) {
      crewYelled = true;
      log("Night crew lost it. They are running.");
    }
    for (let i = 0; i < crew.length; i++) {
      const c = crew[i];
      c.heat = THREE.MathUtils.damp(c.heat, want ? 1 : 0, 5, dt);
      const hosing = i === saboteur && sabStage !== "done" && c.heat <= 0.45;
      if (live && hosing) {
        if (sabStage === "wait") {
          sabTimer -= dt;
          if (sabTimer <= 0) sabStage = "go";
        } else if (sabStage === "go") {
          const dx = 0.15 - c.x;
          const dz = 1.02 - c.z;
          crewMove(c, dx, dz, 1.75, dt);
          if (dx * dx + dz * dz < 0.06) {
            sabStage = "spray";
            sabTimer = 2.4;
            log("A night tech hosed the rack.");
          }
        } else if (sabStage === "spray") {
          sabTimer -= dt;
          hoseRack(dt);
          if (sabTimer <= 0) {
            sabStage = "done";
            if (hoseStream) hoseStream.visible = false;
            log("The hose ran dry. The row is soaked.");
          }
        }
      } else if (live) {
        if (c.heat > 0.45) {
          c.wait -= dt;
          if (c.wait <= 0 || (c.tx - c.x) ** 2 + (c.tz - c.z) ** 2 < 0.16) {
            pickCrewTarget(c);
            c.wait = 0.25 + Math.random() * 0.55;
          }
          crewMove(c, c.tx - c.x, c.tz - c.z, 3.35, dt);
        } else if ((c.homeX - c.x) ** 2 + (c.homeZ - c.z) ** 2 > 0.01) {
          crewMove(c, c.homeX - c.x, c.homeZ - c.z, 1.35, dt);
        }
        const pdx = c.x - px;
        const pdz = c.z - pz;
        const pd = Math.hypot(pdx, pdz);
        if (pd < 0.58 && pd > 0.001) {
          const nx = c.x + (pdx / pd) * (0.58 - pd);
          const nz = c.z + (pdz / pd) * (0.58 - pd);
          if (!techBlocked(nx, nz)) {
            c.x = nx;
            c.z = nz;
          }
        }
        for (let j = 0; j < crew.length; j++) {
          if (j === i) continue;
          const o = crew[j];
          const ox = c.x - o.x;
          const oz = c.z - o.z;
          const od = Math.hypot(ox, oz);
          if (od < 0.48 && od > 0.001) {
            const nx = c.x + (ox / od) * (0.48 - od) * 0.5;
            const nz = c.z + (oz / od) * (0.48 - od) * 0.5;
            if (!techBlocked(nx, nz)) {
              c.x = nx;
              c.z = nz;
            }
          }
        }
      }
      const prevX = c.group.position.x;
      const prevZ = c.group.position.z;
      c.group.position.set(c.x, Math.abs(Math.sin(simT * (2 + c.heat * 11) + c.seed)) * c.heat * 0.06, c.z);
      const moved = Math.hypot(c.x - prevX, c.z - prevZ);
      const facing =
        c.heat > 0.4 && moved > 0.0008 ? faceYaw(c.x - prevX, c.z - prevZ) : faceYaw(-c.x, 0.4 - c.z);
      c.yaw = dampAngle(c.yaw, facing, c.heat > 0.4 ? 7 : 4, dt);
      c.group.rotation.y = c.yaw;
      let look = faceYaw(-c.x, 0.4 - c.z) - c.yaw;
      while (look > Math.PI) look -= Math.PI * 2;
      while (look < -Math.PI) look += Math.PI * 2;
      look = Math.max(-1.15, Math.min(1.15, look));
      const flail = reduceMotion ? c.heat * 0.35 : c.heat;
      const shocked = c.shocked ? c.heat > 0.32 : c.heat > 0.48;
      if (shocked !== c.shocked) {
        c.shocked = shocked;
        c.faceMat.map = shocked ? c.shockMap : c.calmMap;
        c.faceMat.needsUpdate = true;
      }
      const t = simT + c.seed;
      const upL = i % 2 === 0;
      const idleLx = upL ? 0.22 : 0.08;
      const idleLz = upL ? 0.22 : 0.06;
      const idleRx = upL ? 0.06 : 0.28;
      const idleRz = upL ? -0.08 : -0.26;
      const idleForeL = 0.18;
      const idleForeR = 0.22;
      c.head.rotation.y = dampAngle(c.head.rotation.y, look, 6, dt);
      c.head.rotation.z = c.tilt + Math.sin(t * 0.8) * 0.06 + flail * Math.sin(t * 7) * 0.16;
      c.head.rotation.x = -0.16 + Math.sin(t * 0.6) * 0.05 + flail * Math.sin(t * 11) * 0.22;
      c.torso.rotation.z = (upL ? 0.06 : -0.06) + Math.sin(t * (0.7 + flail * 8)) * (0.03 + flail * 0.22);
      c.torso.rotation.x = 0.06 + flail * (0.12 + Math.sin(t * 9) * 0.08);
      c.armL.rotation.x = idleLx + (Math.sin(t * 15) * 1.75 - idleLx) * flail;
      c.armR.rotation.x = idleRx + (Math.sin(t * 15 + Math.PI) * 1.75 - idleRx) * flail;
      c.armL.rotation.z = idleLz + (Math.sin(t * 12.2) * 1.2 - idleLz) * flail;
      c.armR.rotation.z = idleRz + (-Math.sin(t * 12.2 + 0.8) * 1.2 - idleRz) * flail;
      c.foreL.rotation.x = idleForeL + (0.7 + Math.sin(t * 18) * 0.9 - idleForeL) * flail;
      c.foreR.rotation.x = idleForeR + (0.7 + Math.sin(t * 18 + 1.2) * 0.9 - idleForeR) * flail;
      if (i === saboteur && sabStage === "spray" && c.heat <= 0.45) {
        c.armL.rotation.x = -1.45;
        c.armR.rotation.x = -1.2;
        c.armL.rotation.z = 0.35;
        c.armR.rotation.z = -0.2;
        c.foreL.rotation.x = 0.55;
        c.foreR.rotation.x = 0.4;
        c.head.rotation.x = 0.2;
      }
    }
    if (hoseStream) {
      const spraying = sabStage === "spray" && saboteur >= 0 && (crew[saboteur]?.heat ?? 1) <= 0.45;
      if (!spraying) hoseStream.visible = false;
    }
  }

  function drawScreen() {
    if (!screenCanvas || !screenTex) return;
    const problems = phase === "boot" ? collectProblems() : collectProblems();
    const line = jobLive ? "JOB atlas-train RUNNING" : problems[0] ? problems[0].slice(0, 34) : "HOLD E TO POST";
    const key = `${jobLive}|${line}|${phase}|${Math.round(chaosLeft)}`;
    if (key === screenKey) return;
    screenKey = key;
    const g = screenCanvas.getContext("2d");
    if (!g) return;
    g.fillStyle = "#07110c";
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = jobLive ? "#7dffa2" : phase === "chaos" ? "#ff6a5a" : "#e7c27a";
    g.font = "600 36px monospace";
    g.fillText("HEAD-01  SCHED", 24, 64);
    g.font = "500 28px monospace";
    g.fillStyle = "#d5eee0";
    g.fillText(phase === "chaos" ? "MELTDOWN" : line, 24, 130);
    g.font = "500 22px monospace";
    g.fillStyle = "#8d96a3";
    g.fillText(ticketId, 24, 190);
    screenTex.needsUpdate = true;
  }

  function actionPrompt(hit: HitInfo | null) {
    if (tool === "hands") {
      if (holding) {
        if (hit?.kind === "port") return `E  Seat into ${portMap.get(hit.id)?.label ?? "port"}`;
        return "E  Drop whip";
      }
      if (heldPart) {
        if (hit?.kind === "part") return `E  Install ${PART_LABEL[heldPart]}`;
        return `E  Put the ${PART_LABEL[heldPart]} back`;
      }
      if (hit?.kind === "latch") {
        const dev = deviceById.get(hit.id);
        return dev && dev.slideTarget > 0.5 ? "E  Slide sled in" : "E  Slide sled out";
      }
      if (hit?.kind === "part") {
        const found = slotOf(hit.id);
        if (!found) return "E  Service part";
        if (found.dev.slide < 0.45) return "E  Slide the sled out first";
        if (found.slot.state === "loose") return "E  Seat the loose part";
        if (found.slot.state === "in") return "E  Pull part";
        return "Empty socket — bring a spare";
      }
      if (hit?.kind === "spare") return stock[hit.id as PartSlot] > 0 ? "E  Take spare" : "Crib is empty";
      if (hit?.kind === "plug") return "E  Pull cable";
      if (hit?.kind === "breaker") return "Hold E  Reset breaker";
      if (hit?.kind === "station") return "Hold E  Refill CO2 and gas";
      if (hit?.kind === "screen" || (hit?.kind === "chassis" && hit.id === "head1")) return "Hold E  Post workload";
      if (hit?.kind === "chassis") return "Hold E  Post on HEAD-01, or use the amber latch";
      return "Grab a whip with E";
    }
    if (tool === "wrench") return "Click to swing · Hold E to torque a loose lug";
    return meta(tool).hint;
  }

  function meta(id: ToolId) {
    return TOOLS.find((t) => t.id === id) ?? SPECIALS.find((t) => t.id === id) ?? TOOLS[0];
  }

  function belt(): ToolId[] {
    return [...TOOLS.map((t) => t.id), ...SPECIALS.filter((s) => save.specials[s.id] > 0).map((s) => s.id)];
  }

  function describe(hit: HitInfo | null) {
    const prompt = phase === "play" || phase === "chaos" ? actionPrompt(hit) : "";
    if (!hit || (phase !== "play" && phase !== "chaos" && phase !== "boot")) {
      return {
        title: heldPart ? `Holding ${PART_LABEL[heldPart]}` : holding ? `Holding ${cableById.get(holding)?.name ?? ""}` : "",
        lines: [] as string[],
        prompt,
        cross: "idle" as const,
      };
    }
    if (hit.kind === "port") {
      const port = portMap.get(hit.id);
      const occ = cables.find((c) => c.port === hit.id);
      return {
        title: port?.label ?? "Port",
        lines: [occ ? `Occupied · ${occ.name}` : "Empty", port?.kind === "power" ? "Power outlet" : "Fabric port"],
        prompt,
        cross: "hot" as const,
      };
    }
    if (hit.kind === "breaker") {
      const id = hit.id === "A" ? "A" : "B";
      return {
        title: `PDU-${id} breaker`,
        lines: [tripped[id] ? "OPEN — feeds are dead" : "Closed"],
        prompt,
        cross: tripped[id] ? ("bad" as const) : ("hot" as const),
      };
    }
    if (hit.kind === "station") {
      return { title: "Service cabinet", lines: ["CO2 and gas"], prompt, cross: "hot" as const };
    }
    if (hit.kind === "latch") {
      const dev = deviceById.get(hit.id);
      const open = !!dev && dev.slideTarget > 0.5;
      return {
        title: dev ? `${dev.name} latch` : "Latch",
        lines: [open ? "Sled is out on the rails" : "Seated in the rack"],
        prompt,
        cross: "hot" as const,
      };
    }
    if (hit.kind === "spare") {
      const slot = hit.id as PartSlot;
      return {
        title: `Spare ${PART_LABEL[slot] ?? "part"}`,
        lines: [`${stock[slot] ?? 0} in the crib`],
        prompt,
        cross: "hot" as const,
      };
    }
    if (hit.kind === "part") {
      const found = slotOf(hit.id);
      if (!found) return { title: "Part", lines: [], prompt, cross: "idle" as const };
      const state = found.slot.state === "in" ? "Seated" : found.slot.state === "loose" ? "Loose" : "Missing";
      return {
        title: `${found.dev.name} ${PART_LABEL[found.slot.slot]}`,
        lines: [state, found.dev.slide > 0.45 ? "Sled is open" : "Slide the sled to reach it"],
        prompt,
        cross: found.slot.state === "in" ? ("hot" as const) : ("bad" as const),
      };
    }
    if (hit.kind === "door") {
      return { title: "Hall door", lines: ["Latched"], prompt, cross: "idle" as const };
    }
    if (hit.kind === "prop") {
      return { title: "Loose gear", lines: ["It will fly if you hit it"], prompt, cross: "hot" as const };
    }
    if (hit.kind === "floor") {
      return { title: holding ? `Holding ${cableById.get(holding)?.name ?? ""}` : "", lines: [], prompt, cross: "idle" as const };
    }
    const id =
      hit.kind === "plug" ? (cableById.get(hit.id)?.device ?? hit.id) : hit.kind === "screen" ? "head1" : hit.id;
    const dev = deviceById.get(id);
    if (!dev) return { title: "", lines: [], prompt, cross: "idle" as const };
    const pc = powerOf.get(dev.id);
    const lines = [qualPower(dev), qualLink(dev), qualThermal(dev)].filter(Boolean);
    if (save.upgrades.visor) {
      lines.push(
        `${Math.round(dev.heat)}°C · arc ${Math.round((pc?.short ?? 0) * 100)}% · wet ${Math.round(dev.wet * 100)}% · jacket ${Math.round((pc?.damage ?? 0) * 100)}%`,
      );
    }
    const bad = dev.fire > 0.05 || (pc?.short ?? 0) > 0.3 || dev.health < 0.28 || !dev.fan;
    return {
      title: dev.name,
      lines,
      prompt,
      cross: bad ? ("bad" as const) : ("hot" as const),
    };
  }

  function qualPower(dev: Device) {
    const c = powerOf.get(dev.id);
    if (dev.health < 0.28) return "Power: destroyed";
    if (!c || !c.port) return "Power: unplugged";
    const port = portMap.get(c.port);
    if (!port || port.kind !== "power") return "Power: wrong jack";
    if (port.pdu && tripped[port.pdu]) return "Power: breaker open";
    if (c.home && c.port !== c.home) return `Power: wrong outlet · ${port.label}`;
    if (c.damage > 0.45) return "Power: jacket cut";
    if (c.damage > 0.18) return "Power: lug loose";
    if (!receivesPower(dev)) return "Power: dead";
    return "Power: live";
  }

  function qualLink(dev: Device) {
    if (!dev.needsNet) return receivesPower(dev) ? "Fabric: up" : "Fabric: down";
    const c = netOf.get(dev.id);
    if (!c || !c.port) return "Link: no carrier";
    const port = portMap.get(c.port);
    if (!port || port.kind !== "net") return "Link: cable in a power outlet";
    if (c.damage > 0.5) return "Link: fiber cut";
    if (c.port !== c.home) return `Link: wrong port · ${port.label}`;
    if (!receivesPower(dev)) return "Link: node is dark";
    if (!torUp()) return "Link: TOR is dark";
    return "Link: up";
  }

  function qualThermal(dev: Device) {
    if (dev.fire > 0.05) return "Thermal: on fire";
    if (!dev.fan && dev.role === "gpu") return "Thermal: fan unseated";
    if (dev.wet > 0.3) return "Thermal: wet";
    if (dev.heat > 86) return "Thermal: hot";
    return "Thermal: nominal";
  }

  function buildHud(): Hud {
    const described = describe(phase === "pause" || phase === "debrief" || phase === "shop" ? null : cast());
    const problems = collectProblems();
    const m = meta(tool);
    return {
      phase,
      touch: touchUi,
      ticketOpen,
      ticketTitle: SCENARIOS[scenario].title,
      ticketId,
      ticketBody: SCENARIOS[scenario].body,
      objectives: problems.length ? problems.slice(0, 6) : ["All checks clear — post the job on HEAD-01"],
      log: logs.slice(),
      tool,
      toolName: isSpecial(tool) ? `${m.name} ×${save.specials[tool]}` : m.name,
      toolHint: m.hint,
      tools: [
        ...TOOLS.map((t) => ({ id: t.id, key: t.key, name: t.name })),
        ...SPECIALS.filter((s) => save.specials[s.id] > 0).map((s) => ({
          id: s.id,
          key: s.key,
          name: `${s.name} ×${save.specials[s.id]}`,
        })),
      ],
      lookTitle: described.title,
      lookLines: described.lines,
      lookPrompt: described.prompt,
      cross: described.cross,
      credits: save.credits,
      payout,
      payoutNote,
      outcome,
      chaosLeft,
      chaosReason,
      elapsed,
      extinguisher: ext,
      extMax: extMax(),
      gas,
      water,
      upgrades: { ...save.upgrades },
      prices: UPGRADE_CATALOG.map((item) => ({ ...item })),
      consumables: SPECIALS.map((item) => ({
        id: item.id,
        name: item.name,
        cost: item.cost,
        blurb: item.blurb,
        count: save.specials[item.id],
      })),
      flash,
      alarm: phase === "chaos" || problems.some((p) => /fire|arc|breaker/i.test(p)),
      holding: heldPart ? PART_LABEL[heldPart] : holding ? (cableById.get(holding)?.name ?? "") : "",
      statsLine: `${save.fixed} closed · ${save.chaos} meltdowns`,
      error: "",
    };
  }

  function publish(force = false) {
    if (dead) return;
    if (!force && hudAcc < 0.1) return;
    hudAcc = 0;
    onHud(buildHud());
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    viewCam.aspect = camera.aspect;
    viewCam.updateProjectionMatrix();
    touchUi = touchAt();
  }

  function requestLock() {
    if (touchUi) return;
    suppressLookUntil = performance.now() + 280;
    try {
      const anyCanvas = canvas as HTMLCanvasElement & {
        requestPointerLock: (opts?: { unadjustedMovement?: boolean }) => void | Promise<void>;
      };
      const ret = anyCanvas.requestPointerLock({ unadjustedMovement: true });
      if (ret && typeof (ret as Promise<void>).catch === "function") {
        void (ret as Promise<void>).catch(() => {
          try {
            canvas.requestPointerLock();
          } catch {
            /* ignore */
          }
        });
      }
    } catch {
      try {
        canvas.requestPointerLock();
      } catch {
        /* ignore */
      }
    }
  }

  function clockIn() {
    audio.unlock();
    if (phase === "boot") phase = "play";
    requestLock();
    publish(true);
  }

  function pauseGame() {
    if (phase !== "play" && phase !== "chaos") return;
    pausedFrom = phase;
    phase = "pause";
    primaryHeld = false;
    interactHeld = false;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    publish(true);
  }

  function resume() {
    if (phase !== "pause") return;
    phase = pausedFrom;
    requestLock();
    publish(true);
  }

  function openShop() {
    if (phase !== "pause" && phase !== "debrief") return;
    shopBack = phase;
    phase = "shop";
    publish(true);
  }

  function closeShop() {
    if (phase !== "shop") return;
    phase = shopBack;
    publish(true);
  }

  function buy(id: UpgradeId) {
    const item = UPGRADE_CATALOG.find((entry) => entry.id === id);
    if (!item || save.upgrades[id] || save.credits < item.cost) return;
    save.credits -= item.cost;
    save.upgrades[id] = true;
    writeSave(save);
    if (id === "co2") ext = extMax();
    audio.ui();
    publish(true);
  }

  function buySpecial(id: SpecialId) {
    const item = SPECIALS.find((entry) => entry.id === id);
    if (!item || save.credits < item.cost) return;
    save.credits -= item.cost;
    save.specials[id] += 1;
    writeSave(save);
    audio.ui();
    publish(true);
  }

  function nextShift() {
    if (phase !== "debrief") return;
    resetShift(pickScenario(false));
    phase = "play";
    requestLock();
    publish(true);
  }

  function abandon() {
    if (phase === "chaos" || pausedFrom === "chaos") return;
    if (phase !== "pause" && phase !== "play") return;
    phase = "play";
    startChaos("You walked off the ticket. The row still cooks.");
    requestLock();
  }

  function selectTool(id: ToolId) {
    const regular = TOOLS.some((t) => t.id === id);
    const special = isSpecial(id) && save.specials[id] > 0;
    if (!regular && !special) return;
    if (id !== "hands") {
      if (holding) {
        holding = null;
        log("Whip set down");
      }
      if (heldPart) {
        stock[heldPart] += 1;
        heldPart = null;
      }
    }
    tool = id;
    publish(true);
  }

  function cycleTool(dir: number) {
    const list = belt();
    const i = Math.max(0, list.indexOf(tool));
    selectTool(list[(i + dir + list.length) % list.length] ?? "hands");
  }

  function typingInField(e: KeyboardEvent) {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return false;
    return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (typingInField(e)) return;
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === "Escape") {
      e.preventDefault();
      pauseGame();
      return;
    }
    if (e.code === "KeyE" || e.code === "Space") interactHeld = true;
    const found = TOOLS.find((t) => t.code === e.code) ?? SPECIALS.find((t) => t.code === e.code && save.specials[t.id] > 0);
    if (found && phase !== "boot" && phase !== "debrief" && phase !== "shop") selectTool(found.id);
    if (e.code === "Tab") {
      e.preventDefault();
      ticketOpen = !ticketOpen;
      publish(true);
    }
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyE", "Tab"].includes(e.code)) {
      e.preventDefault();
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (typingInField(e)) return;
    keys.delete(e.code);
    if (e.code === "KeyE" || e.code === "Space") interactHeld = false;
  }

  function onMouseDown(e: MouseEvent) {
    if (e.button === 0 && document.pointerLockElement === canvas) primaryHeld = true;
  }

  function onMouseUp(e: MouseEvent) {
    if (e.button === 0) primaryHeld = false;
  }

  function onMouseMove(e: MouseEvent) {
    if (document.pointerLockElement !== canvas) return;
    lookDx += e.movementX;
    lookDy += e.movementY;
  }

  function onLockChange() {
    const locked = document.pointerLockElement === canvas;
    if (locked) suppressLookUntil = performance.now() + 280;
    wasLocked = locked;
  }

  function onPointerDown(e: PointerEvent) {
    if (phase !== "play" && phase !== "chaos") return;
    if (e.pointerType === "mouse" && document.pointerLockElement === canvas) {
      if (e.button === 0) primaryHeld = true;
      return;
    }
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 2) return;
    dragLooking = true;
    dragMoved = e.pointerType !== "mouse" || e.button === 2;
    dragButton = e.pointerType === "mouse" ? e.button : -1;
    dragX = e.clientX;
    dragY = e.clientY;
    pressAt = performance.now();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragLooking) return;
    if (e.pointerType === "mouse" && document.pointerLockElement === canvas) return;
    const dx = e.clientX - dragX;
    const dy = e.clientY - dragY;
    if (Math.hypot(dx, dy) > 3) dragMoved = true;
    if (dragMoved && (phase === "play" || phase === "chaos")) {
      lookDx += dx;
      lookDy += dy;
      primaryHeld = false;
    }
    dragX = e.clientX;
    dragY = e.clientY;
  }

  function onPointerUp(e: PointerEvent) {
    if (e.pointerType === "mouse" && document.pointerLockElement === canvas) {
      if (e.button === 0) primaryHeld = false;
      return;
    }
    if (dragLooking && dragMoved) skipLockClick = true;
    if (dragLooking && e.pointerType === "mouse" && dragButton === 0 && !dragMoved) primaryQueued = true;
    dragLooking = false;
    dragButton = -1;
    primaryHeld = false;
  }

  function onPointerCancel() {
    dragLooking = false;
    dragButton = -1;
    primaryHeld = false;
  }

  function onClick() {
    if (touchUi || skipLockClick) {
      skipLockClick = false;
      return;
    }
    if ((phase === "play" || phase === "chaos") && document.pointerLockElement !== canvas) requestLock();
  }

  function onBlur() {
    keys.clear();
    interactHeld = false;
    primaryHeld = false;
    analogX = 0;
    analogZ = 0;
  }

  function onVis() {
    if (document.hidden) onBlur();
    else audio.unlock();
  }

  function bind<K extends keyof WindowEventMap>(type: K, fn: (ev: WindowEventMap[K]) => void, target: Window | Document | HTMLElement = window) {
    target.addEventListener(type, fn as EventListener);
    cleanups.push(() => target.removeEventListener(type, fn as EventListener));
  }

  bind("keydown", onKeyDown);
  bind("keyup", onKeyUp);
  bind("mouseup", onMouseUp);
  bind("mousemove", onMouseMove);
  bind("blur", onBlur);
  bind("resize", resize);
  document.addEventListener("pointerlockchange", onLockChange);
  document.addEventListener("visibilitychange", onVis);
  cleanups.push(() => document.removeEventListener("pointerlockchange", onLockChange));
  cleanups.push(() => document.removeEventListener("visibilitychange", onVis));
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  cleanups.push(() => {
    canvas.removeEventListener("mousedown", onMouseDown);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    canvas.removeEventListener("click", onClick);
  });

  const onWheel = (e: WheelEvent) => {
    if (phase !== "play" && phase !== "chaos") return;
    cycleTool(e.deltaY > 0 ? 1 : -1);
  };
  window.addEventListener("wheel", onWheel, { passive: true });
  cleanups.push(() => window.removeEventListener("wheel", onWheel));

  let last = performance.now();
  function frame(now: number) {
    if (dead) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    simT += dt;
    hudAcc += dt;
    if (dragLooking && dragButton === 0 && !dragMoved && performance.now() - pressAt > 160) primaryHeld = true;
    if (performance.now() < suppressLookUntil && !dragMoved) {
      lookDx = 0;
      lookDy = 0;
    } else if (phase === "play" || phase === "chaos") {
      yaw -= lookDx * 0.0022;
      pitch = Math.max(-1.4, Math.min(1.4, pitch - lookDy * 0.0022));
    }
    lookDx = 0;
    lookDy = 0;
    if (interactHeld && !prevInteract) interactQueued = true;
    prevInteract = interactHeld;
    if (primaryHeld && !prevPrimary) primaryQueued = true;
    prevPrimary = primaryHeld;

    if (phase === "play" || phase === "chaos") {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 4) {
        acc -= STEP;
        elapsed += STEP;
        integratePlayer(STEP);
        syncCamera();
        poseCables();
        integrateTools(STEP);
        integrateSim(STEP);
        n += 1;
        if (phase !== "play" && phase !== "chaos") break;
      }
    } else {
      vel.set(0, 0, 0);
      acc = 0;
      audio.spray(0, false);
      syncCamera();
      poseCables();
    }
    updateVisuals(dt);
    renderer.autoClear = true;
    renderer.render(scene, camera);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(viewScene, viewCam);
    renderer.autoClear = true;
    publish(false);
  }
  renderer.setAnimationLoop(frame);

  window.__controlsTest = {
    getYaw: () => yaw,
    getPitch: () => pitch,
    getSpeed: () => Math.hypot(vel.x, vel.z),
    getPos: () => ({ x: px, y: EYE, z: pz }),
    getKeys: () => [...keys],
    setKeys: (codes: string[]) => {
      keys.clear();
      for (const code of codes) keys.add(code);
    },
    setSteer: () => {},
  };
  window.__rack = {
    phase: () => phase,
    problems: () => collectProblems(),
    clockIn,
    select: (id: string) => selectTool(id as ToolId),
    look: (y: number, p: number) => {
      yaw = y;
      pitch = p;
    },
    use: () => {
      interactQueued = true;
    },
    hit: () => {
      primaryQueued = true;
    },
    holdUse: (down: boolean) => {
      interactHeld = down;
    },
    holdHit: (down: boolean) => {
      primaryHeld = down;
    },
    holding: () => heldPart ?? holding,
    slides: () =>
      devices
        .filter((d) => d.sled)
        .map((d) => ({ id: d.id, slide: Math.round(d.slide * 100) / 100, z: Math.round((d.sled?.position.z ?? 0) * 100) / 100 })),
    log: () => logs.slice(),
    sim: () => simT,
    health: () => devices.map((d) => ({ id: d.id, h: Math.round(d.health * 100), f: Math.round(d.fire * 100) })),
    crew: () =>
      crew.map((c) => ({
        x: Math.round(c.x * 100) / 100,
        z: Math.round(c.z * 100) / 100,
        heat: Math.round(c.heat * 100) / 100,
        home: Math.hypot(c.x - c.homeX, c.z - c.homeZ) < 0.2,
      })),
    ignite: () => {
      const d = devices[2];
      if (!d) return;
      d.fire = Math.max(d.fire, 0.5);
      seenFire = true;
    },
    forceSabotage: () => {
      saboteur = crew.length ? 0 : -1;
      sabStage = "wait";
      sabTimer = 0.35;
    },
    debugGrab: () => {
      syncCamera();
      const id = nearestId("plug", 0.5, 3);
      const spot = cables.find((c) => c.kind !== "ib" && !c.port);
      aim();
      let dist: { t: number; d: number } | null = null;
      if (spot) {
        const t = spot.plug.position.clone().sub(camPos).dot(camDir);
        const closest = camPos.clone().addScaledVector(camDir, Math.max(0, t));
        dist = { t, d: closest.distanceTo(spot.plug.position) };
      }
      return { id, dist, phase };
    },
    spots: () =>
      cables
        .filter((c) => c.kind !== "ib" && !c.port)
        .map((c) => ({ id: c.id, name: c.name, x: c.plug.position.x, y: c.plug.position.y, z: c.plug.position.z })),
    ports: () => ports.map((p) => ({ id: p.id, label: p.label, kind: p.kind, x: p.pos.x, y: p.pos.y, z: p.pos.z })),
  };

  syncCamera();
  poseCables();
  publish(true);

  function dispose() {
    dead = true;
    renderer.setAnimationLoop(null);
    for (const fn of cleanups) fn();
    audio.dispose();
    for (const geo of geos) geo.dispose();
    for (const mat of mats) {
      const map = (mat as THREE.MeshStandardMaterial).map;
      if (map) map.dispose();
      mat.dispose();
    }
    for (const tex of textures) tex.dispose();
    renderer.dispose();
    delete window.__controlsTest;
    delete window.__rack;
  }

  return {
    dispose,
    clockIn,
    resume,
    pause: pauseGame,
    openShop,
    closeShop,
    buy,
    buySpecial,
    nextShift,
    abandon,
    toggleTicket: () => {
      ticketOpen = !ticketOpen;
      publish(true);
    },
    setAnalog: (x, z) => {
      analogX = x;
      analogZ = z;
    },
    addLook: (dx, dy) => {
      lookDx += dx;
      lookDy += dy;
    },
    setPrimary: (down) => {
      primaryHeld = down;
    },
    setInteract: (down) => {
      interactHeld = down;
    },
    selectTool,
    cycleTool,
  };
}

function noopApi(): GameApi {
  const noop = () => {};
  return {
    dispose: noop,
    clockIn: noop,
    resume: noop,
    pause: noop,
    openShop,
    closeShop: noop,
    buy: noop,
    buySpecial: noop,
    nextShift: noop,
    abandon: noop,
    toggleTicket: noop,
    setAnalog: noop,
    addLook: noop,
    setPrimary: noop,
    setInteract: noop,
    selectTool: noop,
    cycleTool: noop,
  };
  function openShop() {}
}
