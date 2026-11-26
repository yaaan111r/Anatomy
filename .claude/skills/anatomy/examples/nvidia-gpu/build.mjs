// NVIDIA-class graphics card (AD102 / RTX 4090 class), exploded along z.
// node build.mjs [--light]  ->  nvidia-gpu.html / nvidia-gpu-light.html
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import * as G from "../../kit/lathe.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 640;
const HEIGHT = 580;

/* ---------- world ---------- */
const BASE = { x: -196, y: -72, w: 358, d: 144, r: 8 };
const BASE_H = 12;
const FOOT_H = 5;
const BODY = { x: -150, y: -56, w: 300, d: 112, r: 6 };

// Explode lifts (z, world units) and the bracket's slide along -x.
const LIFT = { back: 0, pcb: 24, cool: 92, shroud: 136, fans: 172 };
const ROOT_SHIFT = LIFT.fans / 2; // the assembled card is lifted to the middle of the frame and settles as it opens
const IO_SHIFT = -34;
const TOP_Z = 56;

const P = k.fitProjection(
  [
    ...k.boxCorners(BASE, -BASE_H - FOOT_H, 0),
    ...k.boxCorners(BODY, 0, TOP_Z + LIFT.fans),
    [-157 + IO_SHIFT, -52, 0],
    [-157 + IO_SHIFT, 52, 58],
  ],
  WIDTH,
  HEIGHT,
  { pad: 24, azimuth: 235, elevation: 38 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const depth = (c) => k.depthOf(c, P);

/* ---------- layer bags: items are ordered by rank, then by depth ---------- */
const IDS = ["back", "pcb", "io", "cool", "shroud", "fans"];
const bag = Object.fromEntries(IDS.map((id) => [id, []]));
const put = (id, c, svg, rank = 1) => bag[id].push({ rank, key: depth(c), svg });
const flush = (id) => bag[id].sort((a, b) => a.rank - b.rank || a.key - b.key).map((i) => i.svg).join("");
const centre = (plan, z, h) => [plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2];

function part(id, plan, z, h, { tone = "mid", crease = "faint", lit = false, steps = 3, bevel = 0.3, extra = "", rank = 1 } = {}) {
  put(id, centre(plan, z, h), S(k.slabOf(plan, z, h, P, steps, bevel), { tone, crease, lit }) + extra, rank);
}
function can(id, cx, cy, r, z, h, { tone = "mid", steps = 24, bevel = 0.3, extra = "", rank = 1, crease = "faint" } = {}) {
  put(id, [cx, cy, z + h / 2], S(k.cylinder(cx, cy, r, z, h, P, steps, bevel), { tone, crease }) + extra, rank);
}
const dotOn = (x, y, z, size = 0.4, tone = "mid") => D([at([x, y, z])], { size, tone });
// strength is a share of the theme's halo opacity, so light and dark both stay soft
const haloFor = (plan, z, blur = 5, strength = 0.7) => `<path class="iso-halo" d="${k.haloOf(plan, z, 0.1, P)}" style="filter:blur(${blur}px);opacity:calc(var(--anatomy-halo-opacity) * ${strength})"/>`;

/* a vertical coil spring round a vertical screw: back half, front half */
function vcoil(cx, cy, r, z0, z1, turns, perTurn = 16) {
  const count = Math.round(turns * perTurn);
  const back = [];
  const front = [];
  let run = [];
  let near = null;
  for (let i = 0; i <= count; i++) {
    const share = i / count;
    const angle = share * turns * Math.PI * 2;
    const facing = depth([Math.cos(angle), Math.sin(angle), 0]) > 0;
    const flat = at([cx + r * Math.cos(angle), cy + r * Math.sin(angle), z0 + (z1 - z0) * share]);
    if (near === null) near = facing;
    if (facing !== near) {
      run.push(flat);
      (near ? front : back).push(k.pathOf(run));
      run = [flat];
      near = facing;
      continue;
    }
    run.push(flat);
  }
  if (run.length > 1) (near ? front : back).push(k.pathOf(run));
  return { back: back.join(""), front: front.join("") };
}

/* flat text laid on a top face so it reads left to right on screen from this camera */
function flatText(x, y, z, text, size, tone = "lo") {
  const o = at([x, y, z]);
  const ux = at([x - 1, y, z]);
  const uy = at([x, y - 1, z]);
  const matrix = `matrix(${(ux[0] - o[0]).toFixed(3)} ${(ux[1] - o[1]).toFixed(3)} ${(uy[0] - o[0]).toFixed(3)} ${(uy[1] - o[1]).toFixed(3)} ${o[0].toFixed(2)} ${o[1].toFixed(2)})`;
  return k.faceTextSvg(matrix, text, { size, tone });
}
const faceX = (x, pts, closed = true) => k.pathOf(pts.map(([y, z]) => at([x, y, z])), closed);

/* ======================================================================
   BASE: the bench the card sits on
   ====================================================================== */
function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BASE, -BASE_H - FOOT_H, BASE_H, P)}"/>`];
  const feet = k.corners(BASE, 24).sort((a, b) => depth([a[0], a[1], 0]) - depth([b[0], b[1], 0]));
  for (const [x, y] of feet) {
    out.push(S(k.cylinder(x, y, 7, -BASE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -BASE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(BASE, -BASE_H, BASE_H, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(BASE, 5), 0, P), { tone: "faint" }));
  const screws = k.corners(BASE, 11);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // ruler strip along the near long edge
  const strip = { x: -176, y: BASE.y + 11, w: 318, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
  // label plate on the far side of the bench
  const plate = { x: 96, y: 46, w: 52, d: 16, r: 2 };
  out.push(S(k.slabOf(plate, 0, 0.8, P, 4), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(plate, 1.6), 0.8, P, 4), { tone: "faint" }));
  [[-1, 34], [2, 24], [5, 29]].forEach(([dy, len]) => {
    out.push(L(k.lineOnTop([plate.x + 6, plate.y + 6 + dy], [plate.x + 6 + len, plate.y + 6 + dy], 0.8, P), { tone: "lo", free: true }));
  });
  out.push(D([at([plate.x + 3, plate.y + 3, 0.8]), at([plate.x + plate.w - 3, plate.y + plate.d - 3, 0.8])], { size: 0.4 }));
  return out.join("");
}

/* ======================================================================
   01 BACKPLATE
   ====================================================================== */
const PCB_HOLES = [
  [-50, -41], [-50, 41], [38, -41], [38, 41],
  [-138, -40], [-138, 40], [108, -40], [108, 40],
];
function backplate() {
  const plan = { x: -148, y: -50, w: 266, d: 100, r: 5 };
  put("back", [0, 0, 0], haloFor(plan, 0, 6, 0.8), -1);
  const slots = Array.from({ length: 6 }, (_, i) => k.planOutline({ x: 92 + 4.4 * i, y: -22, w: 2.4, d: 44, r: 1.2 }, 2.4, P, 4)).join("");
  const rings = PCB_HOLES.map(([x, y]) => k.ring(x, y, 3.4, 2.4, P, 16)).join("");
  part("back", plan, 0, 2.4, {
    steps: 5, bevel: 0.8, rank: 0,
    extra: L(k.planOutline(k.insetPlan(plan, 4), 2.4, P, 5), { tone: "faint" }) + L(slots, { tone: "lo" }) + L(rings, { tone: "lo" }),
  });
  // thermal pads
  const pads = [
    { x: -22, y: -16, w: 32, d: 32, r: 1.5 },
    { x: 56, y: -34, w: 26, d: 68, r: 1.5 },
    { x: -54, y: -24, w: 14, d: 48, r: 1.2 },
    { x: 26, y: -24, w: 14, d: 48, r: 1.2 },
  ];
  pads.forEach((pad) => part("back", pad, 2.4, 1, { tone: "lo", crease: "none", steps: 3, bevel: 0, extra: L(k.planOutline(k.insetPlan(pad, 1.6), 3.4, P, 3), { tone: "faint" }) }));
  // standoffs under every PCB hole
  PCB_HOLES.forEach(([x, y]) => can("back", x, y, 3, 2.4, 1, { tone: "mid", steps: 16, bevel: 0, extra: dotOn(x, y, 3.4, 0.5) }));
}

/* ======================================================================
   02 PCB, GPU, memory, VRM
   ====================================================================== */
const PCB = { x: -146, y: -48, w: 262, d: 96, r: 3 };
const PZ = 3.4;
const PT = PZ + 1.6; // board top
const CH = 1.3; // chip height
const SUB = { x: -28, y: -22, w: 44, d: 44, r: 2 };
const DIE = { x: -18.4, y: -12.25, w: 24.8, d: 24.5, r: 0.6 };
const DIE_TOP = PT + CH + 0.8;

const CHIPS = [];
for (const x of [-24, -6, 12]) for (const sy of [-1, 1]) CHIPS.push({ x: x - 7, y: sy * 36 - 6, w: 14, d: 12, r: 0.9, dir: sy > 0 ? "+y" : "-y" });
for (const yc of [-20, 0, 20]) CHIPS.push({ x: -50, y: yc - 7, w: 12, d: 14, r: 0.9, dir: "-x" });
for (const yc of [-20, 0, 20]) CHIPS.push({ x: 26, y: yc - 7, w: 12, d: 14, r: 0.9, dir: "+x" });

function traces() {
  const lines = [];
  const into = 0.9; // run a little under the package at both ends, so every end lands on a part
  for (const c of CHIPS) {
    const cx = c.x + c.w / 2;
    const cy = c.y + c.d / 2;
    for (const o of [-3, 0, 3]) {
      if (c.dir === "+y") lines.push(k.lineOnTop([cx + o, c.y + into], [cx + o, SUB.y + SUB.d - into], PT, P));
      if (c.dir === "-y") lines.push(k.lineOnTop([cx + o, c.y + c.d - into], [cx + o, SUB.y + into], PT, P));
      if (c.dir === "-x") lines.push(k.lineOnTop([c.x + c.w - into, cy + o], [SUB.x + into, cy + o], PT, P));
      if (c.dir === "+x") lines.push(k.lineOnTop([c.x + into, cy + o], [SUB.x + SUB.w - into, cy + o], PT, P));
    }
  }
  return lines.join("");
}

function pcb() {
  put("pcb", [0, 0, PZ], haloFor(PCB, PZ, 6, 0.55), -1);
  // gold fingers on the near edge, with the PCIe key gap
  const fingers = { x: -128, y: PCB.y, w: 89, d: 4.5, r: 0.4 };
  const f1 = k.topTicks(-128, -117.6, 1.1, 99, fingers.y, PT + 0.4, [4.5, 4.5], P);
  const f2 = k.topTicks(-115.2, -39, 1.1, 99, fingers.y, PT + 0.4, [4.5, 4.5], P);
  const holes = PCB_HOLES.map(([x, y]) => k.ring(x, y, 3.4, PT, P, 16) + k.ring(x, y, 2.1, PT, P, 14)).join("");
  put(
    "pcb",
    centre(PCB, PZ, 1.6),
    S(k.slabOf(PCB, PZ, 1.6, P, 4, 0.5), { tone: "mid" }) +
      L(k.planOutline(k.insetPlan(PCB, 1.6), PT, P, 4), { tone: "faint" }) +
      L(traces(), { tone: "faint" }) +
      L(holes, { tone: "lo" }) +
      S(k.slabOf(fingers, PT, 0.4, P, 2), { tone: "hi", crease: "none" }) +
      L(f1.minor + f1.major + f2.minor + f2.major, { tone: "lo" }) +
      L(k.planOutline({ x: -117.6, y: fingers.y, w: 2.4, d: 4.5, r: 0 }, PT + 0.4, P, 2), { tone: "lo" }),
    0,
  );

  // GPU package: substrate, 24 decoupling caps, the lit die with its floor plan
  const subTop = PT + CH;
  const caps = [];
  for (let i = 0; i < 6; i++) {
    const o = -10 + i * 4;
    caps.push({ x: -6 + o - 1.2, y: 17.5 - 0.6, w: 2.4, d: 1.2 }, { x: -6 + o - 1.2, y: -17.5 - 0.6, w: 2.4, d: 1.2 });
    caps.push({ x: -6 + 17.5 - 1.2, y: o - 1.2, w: 2.4, d: 2.4 - 1.2 + 1.2 }, { x: -6 - 17.5 - 1.2, y: o - 1.2, w: 2.4, d: 2.4 });
  }
  const tiles = [];
  for (let c = 0; c < 6; c++) {
    for (let r = 0; r < 2; r++) {
      const tw = (DIE.w - 2.4 - 5 * 0.5) / 6;
      const th = (DIE.d - 2.4 - 0.6) / 2;
      tiles.push(k.planOutline({ x: DIE.x + 1.2 + c * (tw + 0.5), y: DIE.y + 1.2 + r * (th + 0.6), w: tw, d: th, r: 0 }, DIE_TOP, P, 2));
    }
  }
  const pkg =
    S(k.slabOf(SUB, PT, CH, P, 5, 0.5), { tone: "mid" }) +
    L(k.planOutline(k.insetPlan(SUB, 2.2), subTop, P, 4), { tone: "faint" }) +
    caps
      .sort((a, b) => depth([a.x, a.y, 0]) - depth([b.x, b.y, 0]))
      .map((c) => S(k.slabOf({ ...c, r: 0.3 }, subTop, 0.6, P, 2), { tone: "hi", crease: "none" }))
      .join("") +
    S(k.slabOf(DIE, subTop, 0.8, P, 3, 0.3), { tone: "hi", lit: true, crease: "lo" }) +
    L(tiles.join(""), { tone: "lo" }) +
    dotOn(SUB.x + 4, SUB.y + SUB.d - 4, subTop, 0.5, "hi");
  put("pcb", centre(SUB, PT, CH), pkg);

  // 12 GDDR6X packages (12 x 32 bit = 384 bit)
  for (const c of CHIPS) {
    part("pcb", c, PT, CH, {
      tone: "hi", steps: 3, bevel: 0.3,
      extra: L(k.planOutline(k.insetPlan(c, 1.6), PT + CH, P, 3), { tone: "faint" }) + dotOn(c.x + 2.2, c.y + c.d - 2.2, PT + CH, 0.4),
    });
  }

  // VRM: 10 power stages, 10 inductors in two columns, 13 polymer capacitors
  for (let i = 0; i < 10; i++) {
    const plan = { x: 46, y: -40 + i * 8.4, w: 6, d: 5.2, r: 0.5 };
    part("pcb", plan, PT, CH, { tone: "hi", steps: 2, bevel: 0.2, extra: dotOn(plan.x + 1.2, plan.y + 1.2, PT + CH, 0.35) });
  }
  const IND_H = 6.4;
  for (const col of [0, 1]) {
    for (let row = 0; row < 5; row++) {
      const plan = { x: 55 + col * 12.5, y: -35 + row * 15 - 5.5, w: 11, d: 11, r: 1.2 };
      part("pcb", plan, PT, IND_H, {
        tone: "hi", steps: 3, bevel: 0.4,
        extra: L(k.planOutline(k.insetPlan(plan, 1.8), PT + IND_H, P, 3), { tone: "faint" }),
      });
    }
  }
  const capTop = (cx, cy, r, z) =>
    L(k.ring(cx, cy, r - 1, z, P, 20) + k.lineOnTop([cx - (r - 1), cy], [cx + (r - 1), cy], z, P) + k.lineOnTop([cx, cy - (r - 1)], [cx, cy + (r - 1)], z, P), { tone: "lo" });
  for (let i = 0; i < 8; i++) can("pcb", 90, -38 + i * 10.5, 4, PT, IND_H, { tone: "mid", extra: capTop(90, -38 + i * 10.5, 4, PT + IND_H) });
  for (let i = 0; i < 5; i++) can("pcb", 101, -34 + i * 10.5, 4, PT, IND_H, { tone: "mid", extra: capTop(101, -34 + i * 10.5, 4, PT + IND_H) });

  // 16-pin power connector on the far edge: 12 power pins and 4 sense pins
  const conn = { x: 84, y: 40.5, w: 24, d: 7.5, r: 1 };
  const pins = [];
  for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) pins.push(at([conn.x + 3.4 + i * 3.4, conn.y + 2.2 + r * 3.1, PT + IND_H]));
  const sense = [0, 1, 2, 3].map((i) => at([conn.x + 7.4 + i * 2.6, conn.y + conn.d - 0.9, PT + IND_H]));
  part("pcb", conn, PT, IND_H, {
    tone: "hi", steps: 3, bevel: 0.4,
    extra:
      L(k.planOutline(k.insetPlan(conn, 1), PT + IND_H, P, 3), { tone: "lo" }) +
      D(pins, { size: 0.7, tone: "hi" }) + D(sense, { size: 0.35, tone: "mid" }),
  });

  // left side: controllers, fan headers, BIOS switch, 44 SMD passives
  [[-104, 3, 9], [-86, -9, 7]].forEach(([x, y, s]) => {
    const plan = { x: x - s / 2, y: y - s / 2, w: s, d: s, r: 0.8 };
    part("pcb", plan, PT, 1.2, { tone: "hi", steps: 3, bevel: 0.3, extra: L(k.planOutline(k.insetPlan(plan, 1.3), PT + 1.2, P, 3), { tone: "faint" }) + dotOn(plan.x + 1.6, plan.y + 1.6, PT + 1.2, 0.4) });
  });
  [-118, -100].forEach((x) => {
    const plan = { x, y: 41.5, w: 9, d: 4.5, r: 0.6 };
    part("pcb", plan, PT, 3.4, { tone: "mid", steps: 2, bevel: 0.3, extra: D(Array.from({ length: 4 }, (_, i) => at([plan.x + 1.8 + i * 1.8, plan.y + 2.2, PT + 3.4])), { size: 0.4, tone: "hi" }) });
  });
  const sw = { x: -66, y: 36, w: 7, d: 3.2, r: 0.5 };
  part("pcb", sw, PT, 2.4, { tone: "mid", steps: 2, bevel: 0.2, extra: dotOn(sw.x + 2, sw.y + 1.6, PT + 2.4, 0.5, "hi") });
  for (const y of [-30, -23, 22, 29]) {
    for (let i = 0; i < 11; i++) part("pcb", { x: -132 + 6 * i, y: y - 0.65, w: 2.4, d: 1.3, r: 0.3 }, PT, 0.7, { tone: "hi", steps: 2, bevel: 0, crease: "none" });
  }
}

/* ======================================================================
   03 I/O BRACKET (slides out along -x)
   ====================================================================== */
function bracket() {
  const plate = { x: -157, y: -52, w: 3, d: 104, r: 1.2 };
  const face = -157;
  const out = [];
  const outline = [];
  // 3 DisplayPort + 1 HDMI
  const pinDots = [];
  [-46, -32, -18].forEach((y0) => {
    outline.push(faceX(face, [[y0, 8], [y0 + 7, 8], [y0 + 7, 21.8], [y0 + 4.8, 24], [y0, 24]]));
    for (let i = 0; i < 10; i++) pinDots.push(at([face, y0 + 3.5, 10 + i * 1.3]));
  });
  outline.push(faceX(face, [[-4, 9.2], [0.6, 8], [0.6, 22], [-4, 20.8]]));
  for (let i = 0; i < 8; i++) pinDots.push(at([face, -1.7, 10.6 + i * 1.4]));
  const vents = Array.from({ length: 16 }, (_, i) => faceX(face, [[-46 + i * 6 - 1.2, 30], [-46 + i * 6 + 1.2, 30], [-46 + i * 6 + 1.2, 52], [-46 + i * 6 - 1.2, 52]])).join("");
  const screws = [[-44, 3.5], [44, 3.5], [44, 54], [-44, 54]].map(([y, z]) => at([face, y, z]));
  out.push(
    S(k.slabOf(plate, 0, 58, P, 3, 0.5), { tone: "mid" }) +
      L(outline.join(""), { tone: "mid" }) +
      D(pinDots, { size: 0.3, tone: "mid" }) +
      L(vents, { tone: "lo" }) +
      L(faceX(face, [[-50, 1], [50, 1], [50, 57], [-50, 57]]), { tone: "faint" }) +
      D(screws, { size: 0.5 }),
  );
  // tab that screws the bracket to the end of the PCB
  const tab = { x: -154, y: -44, w: 8, d: 88, r: 1 };
  put("io", centre(tab, PZ, 1.6), S(k.slabOf(tab, PZ, 1.6, P, 3, 0.3), { tone: "mid" }) + D([at([-151, -38, PT]), at([-151, 38, PT])], { size: 0.5 }), 0);
  put("io", [-155.5, 0, 29], out.join(""), 1);
  put("io", [0, 0, 0], haloFor({ x: -157, y: -52, w: 11, d: 104, r: 2 }, 0, 4, 0.5), -1);
}

/* ======================================================================
   04 COOLER: pads, cold plate, 6 heat pipes, two fin stacks
   ====================================================================== */
const COOL_Z = 11.5;
function cooler() {
  const plate = { x: -56, y: -46, w: 100, d: 92, r: 3 };
  put("cool", [0, 0, 0], haloFor(plate, 7.5, 5, 0.35), -1);
  // paste over the die, pads over the 12 memory packages and the VRM stages
  part("cool", { x: DIE.x - 0.8, y: DIE.y - 0.8, w: DIE.w + 1.6, d: DIE.d + 1.6, r: 1 }, DIE_TOP, 7.5 - DIE_TOP, { tone: "lo", crease: "none", steps: 3, bevel: 0, rank: 0 });
  for (const c of CHIPS) part("cool", { ...c, r: 0.9 }, PT + CH, 7.5 - (PT + CH), { tone: "lo", crease: "none", steps: 3, bevel: 0, rank: 0 });
  part("cool", { x: 45.5, y: -41, w: 7, d: 80, r: 0.8 }, PT + CH, COOL_Z - (PT + CH), { tone: "lo", crease: "none", steps: 2, bevel: 0, rank: 0 });

  // right fin stack (far), cold plate, heat pipes, near fin stack
  const fins = (plan, rank) => {
    const x0 = plan.x;
    const x1 = plan.x + plan.w;
    const top = COOL_Z + 30.5;
    const tops = k.topTicks(x0 + 1.5, x1 - 1.5, 2.6, 999, plan.y, top, [plan.d, plan.d], P);
    const sides = k.sideTicks(x0 + 1.5, x1 - 1.5, 2.6, 999, plan.y, top, [30.5, 30.5], P);
    part("cool", plan, COOL_Z, 30.5, { tone: "mid", steps: 3, bevel: 0.8, rank, extra: L(tops.minor, { tone: "lo" }) + L(sides.minor, { tone: "lo" }) });
  };
  fins({ x: 44, y: -50, w: 104, d: 100, r: 2 }, 1);

  part("cool", plate, 7.5, 4, {
    tone: "mid", steps: 6, bevel: 0.6, rank: 2,
    extra: L(k.planOutline(k.insetPlan(plate, 3), COOL_Z, P, 6), { tone: "faint" }),
  });

  // six heat pipes lying on the plate, ends flush on the fin stacks
  for (let i = 0; i < 6; i++) {
    const y = -32.5 + 13 * i;
    const F = G.frameAlong([-56, y, COOL_Z + 3], [1, 0, 0]);
    const seam = [24, 76].map((s) => G.arcOf(F, s, 3, P, { slope: 0 })).join("");
    put("cool", [-6, y, COOL_Z + 3], S(G.solidOf([[0, 3], [100, 3]], F, P), { tone: "hi", crease: "none", inner: L(seam, { tone: "faint" }) }), 3);
  }

  // four spring-loaded screws at the corners of the plate
  for (const [x, y] of [[-50, -41], [-50, 41], [38, -41], [38, 41]]) {
    const coil = vcoil(x, y, 3, COOL_Z, COOL_Z + 5, 5);
    const slot = k.lineOnTop([x - 3.6, y], [x + 3.6, y], COOL_Z + 7, P);
    put(
      "cool",
      [x, y, COOL_Z + 4],
      L(coil.back, { tone: "mid" }) +
        S(k.cylinder(x, y, 1.4, COOL_Z, 7, P, 12, 0), { tone: "hi", crease: "none" }) +
        L(coil.front, { tone: "hi" }) +
        S(k.cylinder(x, y, 3.6, COOL_Z + 5, 2, P, 20, 0.2), { tone: "hi" }) +
        L(slot, { tone: "lo" }),
      y > 0 ? 2.5 : 3.5,
    );
  }

  fins({ x: -148, y: -50, w: 92, d: 100, r: 2 }, 5);
}

/* ======================================================================
   05 SHROUD: a frame round three openings
   ====================================================================== */
const FANS = [[-102, 0], [-6, 0], [96, 0]];
const SZ = 42;
const SH = 4;
function shroud() {
  put("shroud", [0, 0, 0], haloFor(BODY, SZ, 6, 0.3), -1);
  const bars = [
    { x: -150, y: -56, w: 300, d: 12, r: 3, name: "near" },
    { x: -150, y: 44, w: 300, d: 12, r: 3, name: "far" },
    { x: -150, y: -44, w: 5, d: 88, r: 0.6, name: "cap-l" },
    { x: 139, y: -44, w: 11, d: 88, r: 0.6, name: "cap-r" },
    { x: -59, y: -44, w: 10, d: 88, r: 0.6, name: "web-1" },
    { x: 37, y: -44, w: 16, d: 88, r: 0.6, name: "web-2" },
  ];
  for (const bar of bars) {
    let extra = L(k.planOutline(k.insetPlan(bar, 1.5), SZ + SH, P, 3), { tone: "faint" });
    if (bar.name === "far") {
      const slots = Array.from({ length: 22 }, (_, i) => k.planOutline({ x: -128 + i * 12, y: bar.y + 4.9, w: 6, d: 2.2, r: 1.1 }, SZ + SH, P, 3)).join("");
      extra += L(slots, { tone: "lo" });
    }
    if (bar.name.startsWith("web")) {
      extra += D([at([bar.x + bar.w / 2, -36, SZ + SH]), at([bar.x + bar.w / 2, 36, SZ + SH])], { size: 0.5 });
    }
    if (bar.name === "near") extra += flatText(64, bar.y + 3.4, SZ + SH, "RTX 4090 · AD102", 3.4, "mid");
    part("shroud", bar, SZ, SH, { tone: "mid", steps: 4, bevel: 0.8, extra });
  }
}

/* ======================================================================
   06 FANS: plate and hub are static, the blades are rebuilt every frame
   ====================================================================== */
const FZ = 46;
const FP = 2.4;
const HUB_R = 14;
const HUB_Z = FZ + FP;
const HUB_H = 7.6;
const BLADE_Z = HUB_Z + 2;
const BLADE_H = 2.2;
const BLADES = 9;
function bladeRing(a0) {
  const R0 = 14.4;
  const R1 = 40.3;
  const N = 8;
  const lead = [];
  const trail = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = R0 + (R1 - R0) * t;
    const a = a0 + Math.pow(t, 1.5);
    const w = 0.1 + 0.4 * Math.sin(Math.PI * (0.12 + 0.8 * t));
    lead.push([r * Math.cos(a), r * Math.sin(a)]);
    trail.push([r * Math.cos(a + w), r * Math.sin(a + w)]);
  }
  return [...lead, ...trail.reverse()];
}
function bladesSvg(cx, cy, spin, P, k) {
  const near = [];
  const far = [];
  const [vx, vy] = k.towardViewer(P);
  const c = cx * vx + cy * vy;
  const list = [];
  for (let b = 0; b < BLADES; b++) {
    const ring = bladeRing(spin + (b / BLADES) * Math.PI * 2).map(([x, y]) => [cx + x, cy + y]);
    const mx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const my = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    list.push({ ring, key: mx * vx + my * vy });
  }
  list.sort((a, b) => a.key - b.key);
  for (const { ring, key } of list) {
    const svg = k.solidSvg(k.extrude(ring, BLADE_Z, BLADE_H, P, { convex: false }), { tone: "mid", crease: "lo" });
    (key > c ? near : far).push(svg);
  }
  return { far: far.join(""), near: near.join("") };
}
function fans() {
  const order = FANS.map((f, i) => ({ f, i })).sort((a, b) => depth([a.f[0], a.f[1], 0]) - depth([b.f[0], b.f[1], 0]));
  for (const { f: [cx, cy], i } of order) {
    const frame = { x: cx - 45, y: cy - 45, w: 90, d: 90, r: 8 };
    const corners = k.corners(frame, 5.5);
    const knurl = k.knurl(cx, cy, HUB_R, HUB_Z, HUB_Z + HUB_H, 48, P, 0.6);
    const blades = bladesSvg(cx, cy, 0, P, k);
    const svg =
      `<g data-fan="${i}">` +
      haloFor(frame, FZ, 5, 0.4) +
      S(k.slabOf(frame, FZ, FP, P, 6, 0.6), { tone: "mid" }) +
      L(k.ring(cx, cy, 43.4, HUB_Z, P, 64), { tone: "faint" }) +
      `<path class="iso-shade" data-shade="0" d="${k.ring(cx, cy, 41.4, HUB_Z, P, 64)}"/>` +
      L(k.ring(cx, cy, 41.4, HUB_Z, P, 64), { tone: "lo" }) +
      L(corners.map(([x, y]) => k.ring(x, y, 2.2, HUB_Z, P, 14)).join(""), { tone: "lo" }) +
      D(corners.map(([x, y]) => at([x, y, HUB_Z])), { size: 0.5 }) +
      `<g data-far>${blades.far}</g>` +
      S(k.cylinder(cx, cy, HUB_R, HUB_Z, HUB_H, P, 48, 0.6), { tone: "mid", crease: "lo" }) +
      L(knurl, { tone: "lo" }) +
      L(k.ring(cx, cy, 10.6, HUB_Z + HUB_H, P, 40) + k.ring(cx, cy, 3.4, HUB_Z + HUB_H, P, 20), { tone: "lo" }) +
      D([at([cx, cy, HUB_Z + HUB_H])], { size: 0.6, tone: "hi" }) +
      `<g data-near>${blades.near}</g>` +
      `</g>`;
    put("fans", [cx, cy, FZ], svg, 1);
  }
}

backplate();
pcb();
bracket();
cooler();
shroud();
fans();

/* ---------- assemble the figure ---------- */
const layer = (id) => `<g class="gpu-layer" data-id="${id}">${flush(id)}</g>`;
const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "An exploded isometric view of a graphics card in the class of an NVIDIA GeForce RTX 4090. From the bench up: backplate, circuit board with the lit AD102 die, twelve GDDR6X memory packages, power stages, inductors, capacitors and a 16-pin power connector; an I/O bracket that slides out sideways; a cooler with a cold plate, six heat pipes and two fin stacks; a shroud; and three axial fans whose blades turn.",
  body: [`<g data-root><g class="gpu-base">${base()}</g>${IDS.map(layer).join("")}</g>`],
});

/* ---------- copy ---------- */
const ASSEMBLIES = [
  { id: "back", he: "לוח אחורי", en: "Backplate", short: "אלומיניום + פדים תרמיים", detail: "הלוח האחורי (Backplate) מקשיח את ה-PCB מול משקל המצנן, ומוליך חום מהצד האחורי של הלוח אל המתכת דרך פדים תרמיים." },
  { id: "pcb", he: "מעגל מודפס", en: "PCB", short: "AD102 · 12 × GDDR6X · VRM", detail: "ה-PCB נושא את שבב ה-GPU (AD102: כ-608 מ״מ² ו-76.3 מיליארד טרנזיסטורים, החלק המואר), 12 שבבי GDDR6X (12 × 32 ביט = 384 ביט), שלבי ספק כוח עם סלילים וקבלים, מחבר חשמל בן 16 פינים ומגעי PCIe בקצה הלוח." },
  { id: "io", he: "פאנל חיבורים", en: "I/O bracket", short: "3 × DisplayPort · HDMI", detail: "פאנל החיבורים מחובר לקצה ה-PCB ונדחף אל גב המארז: שלושה מחברי DisplayPort ומחבר HDMI אחד, וסורגי אוורור לפליטת האוויר החם." },
  { id: "cool", he: "מצנן", en: "Cooler", short: "לוח בסיס · 6 צינורות חום", detail: "לוח בסיס מתכתי נלחץ על ה-GPU דרך משחה תרמית ועל הזיכרונות דרך פדים. ששת צינורות החום מובילים את החום אל שתי ערימות הצלעות, וארבעה ברגי קפיץ מווסתים את הלחץ על השבב." },
  { id: "shroud", he: "מעטפת", en: "Shroud", short: "מסגרת + פתחי אוויר", detail: "המעטפת (Shroud) מסגרת את שלושת פתחי המאווררים, מכוונת את זרימת האוויר דרך הצלעות ונושאת את שם הדגם." },
  { id: "fans", he: "מאווררים", en: "Fans", short: "3 מאווררי ציר", detail: "שלושה מאווררי ציר (axial) דוחפים אוויר דרך הצלעות. הלהבים באיור מסתובבים באמת: כל תמונה נבנית מחדש לפי הזווית הנוכחית." },
];

const live = `
const P = ${JSON.stringify(P)};
const IDS = ${JSON.stringify(IDS)};
const LIFT = ${JSON.stringify(LIFT)};
const IO_SHIFT = ${IO_SHIFT};
const FANS = ${JSON.stringify(FANS)};
const ASSEMBLIES = ${JSON.stringify(ASSEMBLIES)};
const BLADES = ${BLADES}, BLADE_Z = ${BLADE_Z}, BLADE_H = ${BLADE_H};
const bladeRing = ${bladeRing.toString()};
const bladesSvg = ${bladesSvg.toString()};
const kit = { towardViewer, solidSvg, extrude };
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const readout = document.querySelector("[data-readout]");
const detail = document.querySelector("[data-detail]");
const buttons = [...document.querySelectorAll(".gpu-nav button")];
const still = matchMedia("(prefers-reduced-motion: reduce)");
const root = svg.querySelector("[data-root]");
const ROOT_SHIFT = ${ROOT_SHIFT};
const group = Object.fromEntries(IDS.map((id) => [id, svg.querySelector('.gpu-layer[data-id="' + id + '"]')]));
const fanNodes = FANS.map((_, i) => ({ far: svg.querySelector('[data-fan="' + i + '"] [data-far]'), near: svg.querySelector('[data-fan="' + i + '"] [data-near]') }));
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (t) => t * t * (3 - 2 * t);
const N = IDS.length, STAGGER = 0.55;
const lifted = ["pcb", "cool", "shroud", "fans"];
let e = 0, target = 0, spin = 0, selected = null, pinned = false, touring = !still.matches;
let frame = 0, last = 0, clock = 0, visible = false, idleTimer = 0, leaveTimer = 0, tourStep = -1, lastSpin = -1;
const shareOf = (id) => {
  const i = IDS.indexOf(id);
  const o = STAGGER * (N - 1 - i) / (N - 1);
  return ease(clamp01(((1 + STAGGER) * e - o) / 1));
};
const label = (a) => String(ASSEMBLIES.indexOf(a) + 1).padStart(2, "0") + " · " + a.he + " (" + a.en + ") — " + a.short;
function say() {
  const a = ASSEMBLIES.find((x) => x.id === selected);
  const text = a ? label(a) : (e > 0.5 ? "מפורק · 6 מכלולים" : "מורכב · 6 מכלולים");
  if (readout.textContent !== text) readout.textContent = text;
  detail.textContent = a ? a.detail : "העבר את העכבר על האיור כדי לפרק את הכרטיס, ולחץ על חלק או על כפתור כדי לראות מה הוא עושה.";
}
function select(id) {
  selected = id;
  for (const key of IDS) {
    group[key].toggleAttribute("data-on", key === id);
    group[key].toggleAttribute("data-dim", id !== null && key !== id);
  }
  buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === id)));
  say();
}
function drawLayers() {
  for (const id of lifted) group[id].setAttribute("transform", translateAlong(P, [0, 0, LIFT[id] * shareOf(id)]));
  group.io.setAttribute("transform", translateAlong(P, [IO_SHIFT * shareOf("pcb"), 0, 0]));
  root.setAttribute("transform", translateAlong(P, [0, 0, ROOT_SHIFT * (1 - shareOf("fans"))]));
}
function drawFans() {
  FANS.forEach(([cx, cy], i) => {
    const dir = i === 1 ? -1 : 1;
    const b = bladesSvg(cx, cy, spin * dir, P, kit);
    fanNodes[i].far.innerHTML = b.far;
    fanNodes[i].near.innerHTML = b.near;
  });
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring) {
    clock += dt;
    const phase = clock % 9.6;
    target = phase > 1.8 && phase < 8.2 ? 1 : 0;
    const step = phase > 2.6 && phase < 8.2 ? Math.floor((phase - 2.6) / 0.95) : -1;
    if (step !== tourStep) { tourStep = step; select(step >= 0 ? IDS[step % IDS.length] : null); }
  }
  e = calm ? target : e + (target - e) * (1 - Math.exp(-dt / 0.42));
  if (Math.abs(target - e) < 0.0005) e = target;
  if (!calm) spin += dt * 2.4;
  drawLayers();
  if (!calm && Math.abs(spin - lastSpin) > 0.004) { drawFans(); lastSpin = spin; }
  if (!selected || touring) say();
  frame = visible && (!calm || e !== target) ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const hold = () => { touring = false; clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (!pinned) { touring = !still.matches; clock = 0; tourStep = -1; select(null); run(); } }, 6000); };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointerenter", () => { clearTimeout(leaveTimer); hold(); target = 1; run(); });
stage.addEventListener("pointermove", (event) => {
  const hit = event.target.closest && event.target.closest(".gpu-layer");
  const id = hit ? hit.dataset.id : null;
  if (pinned) return;
  if (id !== selected) select(id);
  hold();
});
stage.addEventListener("pointerleave", () => { if (pinned) return; leaveTimer = setTimeout(() => { target = 0; select(null); run(); }, 500); });
stage.addEventListener("click", (event) => {
  const hit = event.target.closest && event.target.closest(".gpu-layer");
  const id = hit ? hit.dataset.id : null;
  hold();
  if (id && !(pinned && id === selected)) { pinned = true; target = 1; select(id); } else { pinned = false; select(null); }
  run();
});
buttons.forEach((b) => b.addEventListener("click", () => { hold(); pinned = b.dataset.id !== selected || !pinned; target = pinned ? 1 : 0; select(pinned ? b.dataset.id : null); run(); }));
stage.addEventListener("keydown", (event) => {
  const here = IDS.indexOf(selected);
  if (event.key === " " || event.key === "Enter") { event.preventDefault(); hold(); pinned = !pinned && true; target = pinned || target === 0 ? 1 : 0; if (!pinned) select(null); }
  else if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); hold(); pinned = true; target = 1; select(IDS[(here + 1) % IDS.length]); }
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); hold(); pinned = true; target = 1; select(IDS[(here - 1 + IDS.length) % IDS.length]); }
  else if (event.key === "Escape") { pinned = false; target = 0; select(null); }
  run();
});
if (still.matches) { touring = false; }
drawLayers();
drawFans();
select(null);
`;

const nav = `<nav class="gpu-nav" aria-label="מכלולי הכרטיס">${ASSEMBLIES.map((a, i) => `<button type="button" data-id="${a.id}" aria-pressed="false"><b>${String(i + 1).padStart(2, "0")}</b>${a.he}<small>${a.en}</small></button>`).join("")}</nav><p class="gpu-detail" data-detail></p>`;

const css = `<style>
html{direction:rtl}
.iso-plate{direction:ltr}
.iso-plate-corner{letter-spacing:0!important;text-transform:none!important;direction:rtl;unicode-bidi:plaintext}
.iso-plate-corner[data-corner="title"]{text-transform:uppercase!important;letter-spacing:.1em!important;direction:ltr}
.iso-stage{outline:none;cursor:pointer}
.iso-stage:focus-visible{outline:1px solid var(--anatomy-mid);outline-offset:4px}
.gpu-layer{transition:opacity .35s var(--anatomy-ease)}
.gpu-layer[data-dim]{opacity:.22}
.gpu-layer[data-on] .iso-edge{stroke:var(--anatomy-lit)}
.gpu-layer[data-on] .iso-top{fill:var(--anatomy-lit-top)}
.gpu-nav{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.gpu-nav button{font:inherit;font-size:13px;color:var(--anatomy-text);background:var(--anatomy-card);border:0;border-radius:0;padding:7px 11px;box-shadow:0 0 0 1px var(--anatomy-lo);cursor:pointer;display:inline-flex;gap:7px;align-items:baseline;transition:box-shadow .2s var(--anatomy-ease),color .2s var(--anatomy-ease)}
.gpu-nav button b{font:600 11px var(--anatomy-mono);color:var(--anatomy-muted)}
.gpu-nav button small{font:10.5px var(--anatomy-mono);color:var(--anatomy-muted);direction:ltr}
.gpu-nav button:hover,.gpu-nav button[aria-pressed="true"]{box-shadow:0 0 0 1px var(--anatomy-hi);color:var(--anatomy-strong)}
.gpu-nav button:focus-visible{outline:1px solid var(--anatomy-hi);outline-offset:2px}
.gpu-detail{margin:12px 0 0;min-height:3.2em;color:var(--anatomy-text);font-size:14px;line-height:1.65}
.iso-legend{direction:rtl}
</style>`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "GeForce RTX 4090-class",
  hint: "ריחוף: פירוק · לחיצה: בחירת חלק",
  readout: "מורכב · 6 מכלולים",
  keys: [
    { mark: "lit", label: "שבב ה-GPU (AD102, כ-608 מ״מ²): החלק המואר" },
    { mark: "raised", label: "6 מכלולים שנפרדים לאורך הציר" },
  ],
  caption:
    "הדמיה איזומטרית של כרטיס מסך ברמת RTX 4090. הנתונים על השבב והזיכרון נכונים לדגם (AD102, 384 ביט, 12 שבבי GDDR6X); פריסת הרכיבים בלוח, שלבי ה-VRM, שלושת המאווררים וצורת המצנן הם עיצוב מייצג ולא העתק של דגם מסוים (ב-Founders Edition יש שני מאווררים ומצנן flow-through).",
  body: `<div class="iso-stage" tabindex="0" role="group" aria-label="כרטיס מסך מפורק. רחף כדי לפרק, חצים לבחירת מכלול, רווח להצמדה, Escape לביטול">${svg}</div>`,
});

const out = theme === "light" ? "nvidia-gpu-light.html" : "nvidia-gpu.html";
const html = k
  .pageHtml({ title: "NVIDIA GPU anatomy", theme, body: css + body + nav, script: kitScript() + live, width: 760 })
  .replace('<html lang="en">', '<html lang="he" dir="rtl">');
writeFileSync(join(HERE, out), html);
console.log("wrote", out, `(${Math.round(html.length / 1024)} KB)`);
