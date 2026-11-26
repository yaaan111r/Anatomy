// Lab-scale extruder line making PVDF tube, 6 mm OD x 0.6 mm wall.
// node build.mjs [--light]  ->  pvdf-tube-extruder.html / -light.html
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import * as G from "../../kit/lathe.mjs";
import { tubePieces, tubeSvg } from "../../kit/tube.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

/* ======================================================================
   THE MODEL (all numbers on the page come from here)
   ====================================================================== */
const OD = 6; // tube outer diameter, mm
const WALL = 0.6; // wall, mm
const ID = OD - 2 * WALL; // 4.8
const DIE_BORE = 10; // die land bore, mm
const PIN_OD = 8; // pin (mandrel) tip, mm
const RHO = 1.78; // solid PVDF, g/cm3 (typical datasheet value)
const area = (d1, d0) => (Math.PI / 4) * (d1 * d1 - d0 * d0);
const A_TUBE = area(OD, ID); // mm2
const A_DIE = area(DIE_BORE, PIN_OD); // mm2
const DDR = A_DIE / A_TUBE; // draw-down ratio (area)
const DRB = DIE_BORE / OD / (PIN_OD / ID); // draw balance, 1 = diameter and wall shrink alike
const kgPerHour = (v) => (A_TUBE * v * RHO * 60) / 1000; // v in m/min -> kg/h  (mm2 * m/min = cm3/min * 1000... see below)
// A[mm2] * v[m/min] = A*v*1000 mm3/min = A*v cm3/min ; * rho g/cm3 = g/min ; * 60 / 1000 = kg/h
const exitSpeed = (v) => v / DDR; // m/min at the die, ignoring melt density change and swell
const SPEED = { min: 0.5, max: 3, start: 1.5 };
const ZONES = [210, 225, 235, 245]; // example barrel profile, deg C
const HEAD_T = 245;
const DIE_T = 250;

/* ======================================================================
   WORLD (1 unit = 1 mm of tooling and tube; machine length is shortened)
   ====================================================================== */
const WIDTH = 900;
const HEIGHT = 560;
const AX = 42; // axis height
const BED = { x: -390, y: -64, w: 1050, d: 144, r: 8 };
const BED_H = 12;
const FOOT_H = 5;
const TUBE_X0 = 196;
const TUBE_X1 = 640;
const LIFTS = { barrel: 58, die: 48, lid: 62, pull: 40 };

const P = k.fitProjection(
  [
    ...k.boxCorners(BED, -BED_H - FOOT_H, 0),
    [-210, 0, 130], [-100, 0, AX + 20 + LIFTS.barrel + 6], [360, 0, 64 + LIFTS.lid + 4], [540, 0, 86 + LIFTS.pull],
  ],
  WIDTH, HEIGHT, { pad: 28, azimuth: 52, elevation: 30 },
);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (pts, style) => k.dotsSvg(pts, style);
const depth = (c) => k.depthOf(c, P);
const V = G.viewOf(P);

/* ---------- item bag: items wear an assembly id, sort by rank then depth ---------- */
const main = [];
const groups = {}; // lift group id -> { a, items }
const put = (a, c, svg, { rank = 1, lift = null } = {}) => {
  const item = { a, rank, key: depth(c), svg: `<g data-a="${a}">${svg}</g>`, c };
  if (lift) (groups[lift] ??= { a, items: [] }).items.push(item);
  else main.push(item);
};
// the viewer is on the +x side, so a whole station further along x is painted after the one before it
const BANDS = [-190, 80, 250, 474];
const bandOf = (x) => BANDS.filter((b) => x >= b).length;
const order = (list) => [...list].sort((x, y) => x.rank - y.rank || x.key - y.key).map((i) => i.svg).join("");
const orderMain = (list) => [...list].sort((x, y) => bandOf(x.c[0]) - bandOf(y.c[0]) || x.rank - y.rank || x.key - y.key).map((i) => i.svg).join("");
const centre = (p, z, h) => [p.x + p.w / 2, p.y + p.d / 2, z + h / 2];
function slab(a, plan, z, h, o = {}) {
  const { tone = "mid", crease = "faint", lit = false, steps = 3, bevel = 0.3, extra = "", rank = 1, lift = null } = o;
  put(a, centre(plan, z, h), S(k.slabOf(plan, z, h, P, steps, bevel), { tone, crease, lit }) + extra, { rank, lift });
}
function post(a, cx, cy, r, z, h, o = {}) {
  const { tone = "mid", steps = 20, bevel = 0.3, extra = "", rank = 1, lift = null, crease = "faint" } = o;
  put(a, [cx, cy, z + h / 2], S(k.cylinder(cx, cy, r, z, h, P, steps, bevel), { tone, crease }) + extra, { rank, lift });
}
/* a turned part lying along x */
function turnX(a, x0, y, z, profile, o = {}) {
  const { tone = "mid", rank = 1, lift = null, seams = [], hole, smooth, extra = "", crease = "none" } = o;
  const F = G.frameAlong([x0, y, z], [1, 0, 0]);
  const len = profile[profile.length - 1][0];
  const rMax = Math.max(...profile.map((p) => p[1]));
  const paths = G.solidOf(profile, F, P, { ...(hole ? { hole } : {}), ...(smooth !== undefined ? { smooth } : {}) });
  const inner = L(seams.map(([s, r]) => G.arcOf(F, s, r, P, { slope: 0 })).join(""), { tone: "faint" });
  put(a, [x0 + len / 2, y, z], S(paths, { tone, crease, inner }) + extra, { rank, lift });
  return F;
}
const dotOn = (x, y, z, size = 0.45, tone = "mid") => D([at([x, y, z])], { size, tone });
const haloOf = (plan, z, blur = 6, s = 0.7) => `<path class="iso-halo" d="${k.haloOf(plan, z, 0.1, P)}" style="filter:blur(${blur}px);opacity:calc(var(--anatomy-halo-opacity) * ${s})"/>`;
const faceY = (y, pts, closed = true) => k.pathOf(pts.map(([x, z]) => at([x, y, z])), closed);

/* ======================================================================
   BED
   ====================================================================== */
function bed() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BED, -BED_H - FOOT_H, BED_H, P)}"/>`];
  const feet = [];
  for (const x of [-360, 135, 630]) for (const y of [-40, 56]) feet.push([x, y]);
  feet.sort((a, b) => depth([a[0], a[1], 0]) - depth([b[0], b[1], 0]));
  for (const [x, y] of feet) {
    out.push(S(k.cylinder(x, y, 7, -BED_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -BED_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(BED, -BED_H, BED_H, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(BED, 5), 0, P), { tone: "faint" }));
  const screws = k.corners(BED, 11);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }), D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  const strip = { x: -360, y: BED.y + BED.d - 17, w: 990, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 5, 10, strip.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
  return out.join("");
}

/* ======================================================================
   DRIVE: motor and gearbox
   ====================================================================== */
function drive() {
  const a = "drive";
  const motor = { x: -370, y: -30, w: 62, d: 60, r: 4 };
  const mz = 10;
  const mh = 60;
  const top = mz + mh;
  const fins = k.topTicks(motor.x + 4, motor.x + motor.w - 4, 5, 999, motor.y, top, [motor.d, motor.d], P);
  const side = k.sideTicks(motor.x + 4, motor.x + motor.w - 4, 5, 999, motor.y + motor.d, top, [mh, mh], P);
  // feet, body, cowl
  for (const [x, y] of [[-364, -26], [-364, 20], [-326, -26], [-326, 20]]) slab(a, { x, y, w: 14, d: 8, r: 1 }, 4, 6, { steps: 2, bevel: 0.2, rank: 0 });
  slab(a, { x: motor.x, y: motor.y, w: motor.w, d: motor.d, r: motor.r }, mz, mh, { bevel: 0.8, steps: 4, extra: L(fins.minor, { tone: "lo" }) + L(side.minor, { tone: "lo" }), rank: 1 });
  slab(a, { x: -380, y: -26, w: 10, d: 52, r: 3 }, 14, 52, { steps: 3, bevel: 0.5, tone: "lo", extra: D(Array.from({ length: 5 }, (_, i) => at([-380, -20 + i * 10, 66])), { size: 0.4 }) });
  slab(a, { x: -352, y: -9, w: 20, d: 18, r: 1.5 }, top, 9, { steps: 3, bevel: 0.4, extra: D([at([-348, -5, top + 9]), at([-336, 5, top + 9])], { size: 0.45 }) });
  post(a, -342, 0, 3, top + 9, 4, { steps: 14, bevel: 0 });
  // coupling guard
  slab(a, { x: -308, y: -22, w: 10, d: 44, r: 3 }, 22, 40, { steps: 3, bevel: 0.4, tone: "lo", extra: L(k.sideSeam({ x: -308, y: -22, w: 10, d: 44, r: 3 }, 42, P, 3), { tone: "faint" }) });
  // gearbox
  const gb = { x: -298, y: -36, w: 68, d: 72, r: 5 };
  const gbT = 82;
  const gribs = k.topTicks(gb.x + 4, gb.x + gb.w - 4, 6, 999, gb.y, gbT, [gb.d, gb.d], P);
  slab(a, gb, 4, gbT - 4, {
    bevel: 0.9, steps: 5,
    extra: L(gribs.minor, { tone: "lo" }) + L(k.sideRing([-264, gb.y + gb.d, 50], 8, "y", P, 28) + k.sideRing([-264, gb.y + gb.d, 50], 5.6, "y", P, 24), { tone: "mid" }) + L(k.sideRing([-280, gb.y + gb.d, 24], 2.6, "y", P, 14), { tone: "lo" }) +
      D([at([-292, gb.y + gb.d, 10]), at([-236, gb.y + gb.d, 10]), at([-292, gb.y + gb.d, 76]), at([-236, gb.y + gb.d, 76])], { size: 0.5 }),
  });
  post(a, -270, 18, 3, gbT, 6, { steps: 14, bevel: 0.2 });
  slab(a, { x: -288, y: -10, w: 24, d: 14, r: 1.5 }, gbT, 0.8, { tone: "lo", crease: "none", steps: 3, bevel: 0, extra: L(k.lineOnTop([-284, -6], [-266, -6], gbT + 0.8, P) + k.lineOnTop([-284, -2], [-272, -2], gbT + 0.8, P), { tone: "lo", free: true }) });
}

/* ======================================================================
   FEED: throat, hopper, screw
   ====================================================================== */
const SCREW_X0 = -190;
const SCREW_X1 = 70;
const FLIGHT_R = 8;
const PITCH = 16;
function feed() {
  const a = "feed";
  const blk = { x: -230, y: -26, w: 40, d: 52, r: 3 };
  slab(a, blk, 16, 52, {
    bevel: 0.8, steps: 4,
    extra: L(k.sideSeam(blk, 28, P, 3), { tone: "faint" }) + L(k.sideRing([-210, blk.y + blk.d, 44], 6, "y", P, 20), { tone: "lo" }) + D([at([-224, blk.y + blk.d, 22]), at([-196, blk.y + blk.d, 62])], { size: 0.5 }),
  });
  for (const y of [-19, 19]) post(a, -222, y, 2.4, 68, 6, { steps: 14, bevel: 0.2, extra: L(k.knurl(-222, y, 2.4, 68, 74, 12, P, 0.3), { tone: "lo" }) });
  // hopper: neck, cone, lip
  const F = G.frameAlong([-210, 0, 68], [0, 0, 1]);
  const prof = [[0, 9], [4, 9], [52, 32, 1], [58, 32]];
  const paths = G.solidOf([[0, 9], [4, 9], [30, 20], [52, 32], [58, 32]], F, P, { smooth: false });
  put(a, [-210, 0, 96], S(paths, { tone: "mid", crease: "faint", inner: L(G.arcOf(F, 4, 9, P, { slope: 0 }) + G.arcOf(F, 56, 32, P, { slope: 0 }), { tone: "faint" }) }) + `<path class="iso-shade" data-shade="0" d="${k.ring(-210, 0, 28.6, 126, P, 40)}"/>` + L(k.ring(-210, 0, 28.6, 126, P, 40), { tone: "lo" }) + D([at([-232, 0, 114]), at([-190, 0, 114])], { size: 0.0 }));
  void prof;
}
/* the screw: three turned zones; flights are drawn live from the same pitch */
function screw() {
  const a = "feed";
  const F0 = G.frameAlong([SCREW_X0, 0, AX], [1, 0, 0]);
  const zones = [
    { s0: 0, s1: 80, r0: 5.4, r1: 5.4 }, // feed: deep channel
    { s0: 80, s1: 170, r0: 5.4, r1: 6.9 }, // compression
    { s0: 170, s1: 254, r0: 6.9, r1: 6.9 }, // metering: shallow channel
  ];
  const parts = zones.map((z) => {
    const F = G.frameAlong([SCREW_X0 + z.s0, 0, AX], [1, 0, 0]);
    return S(G.solidOf([[0, z.r0], [z.s1 - z.s0, z.r1]], F, P, { smooth: false }), { tone: "hi", crease: "none" });
  });
  const tipF = G.frameAlong([SCREW_X0 + 254, 0, AX], [1, 0, 0]);
  parts.push(S(G.solidOf([[0, 6.9], [4, 6.9], [6, 4]], tipF, P, { smooth: false }), { tone: "hi", crease: "none" }));
  void F0;
  const f = flightsSvg(0, P, KIT);
  put(a, [(SCREW_X0 + SCREW_X1) / 2, 0, AX], `<g data-screw><g data-flight-back>${f.back}</g>${parts.join("")}<g data-flight-front>${f.front}</g></g>`, { rank: 0 });
}
function flightsSvg(phase, P, K) {
  const back = [];
  const front = [];
  let run = [];
  let near = null;
  const turns = (SCREW_X1 - SCREW_X0 - 8) / PITCH;
  const per = 14;
  const n = Math.round(turns * per);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = SCREW_X0 + t * (SCREW_X1 - SCREW_X0 - 8);
    const ang = t * turns * Math.PI * 2 + phase;
    const facing = K.depthOf([0, Math.cos(ang), Math.sin(ang)], P) > 0;
    const pt = K.iso([x, FLIGHT_R * Math.cos(ang), AX + FLIGHT_R * Math.sin(ang)], P);
    if (near === null) near = facing;
    if (facing !== near) {
      run.push(pt);
      (near ? front : back).push(K.pathOf(run));
      run = [pt];
      near = facing;
      continue;
    }
    run.push(pt);
  }
  if (run.length > 1) (near ? front : back).push(K.pathOf(run));
  return {
    back: `<path class="iso-line" data-tone="lo" style="stroke-width:1.6" d="${back.join("")}"/>`,
    front: `<path class="iso-line" data-tone="hi" style="stroke-width:1.6" d="${front.join("")}"/>`,
  };
}
const KIT = { iso: k.iso, depthOf: k.depthOf, pathOf: k.pathOf };

/* ======================================================================
   BARREL (lifts away): barrel, 4 heater bands, terminal boxes, flange
   ====================================================================== */
function barrel() {
  const a = "barrel";
  const o = { lift: "barrel" };
  const F = turnX(a, SCREW_X0, 0, AX, [[0, 20], [260, 20]], { tone: "mid", rank: 0, seams: [[130, 20]], ...o });
  void F;
  const bands = [[-172, -148], [-130, -106], [-88, -64], [-46, -22]];
  bands.forEach(([x0, x1], i) => {
    turnX(a, x0, 0, AX, [[0, 22.5], [x1 - x0, 22.5]], { tone: "hi", rank: 1, ...o });
    slab(a, { x: x0 + 7, y: -5, w: 10, d: 10, r: 1 }, AX + 22.5, 6, { steps: 2, bevel: 0.2, rank: 2, ...o, extra: D([at([x0 + 10, 0, AX + 28.5]), at([x0 + 14, 0, AX + 28.5])], { size: 0.4, tone: "hi" }) });
  });
  // flange at the +x end with bolt circle
  const FF = G.frameAlong([SCREW_X0 + 250, 0, AX], [1, 0, 0]);
  const bolts = G.dotsOf(FF, 10, 23.4, 8, P, { all: true });
  put(a, [SCREW_X0 + 255, 0, AX], S(G.solidOf([[0, 28], [10, 28]], FF, P, { smooth: false }), { tone: "mid", crease: "faint" }) + D(bolts, { size: 0.55 }), { rank: 3, lift: "barrel" });
}

/* ======================================================================
   HEAD: adapter, head body, pressure sensor, pin, die ring (lifts)
   ====================================================================== */
function head() {
  const a = "head";
  turnX(a, 80, 0, AX, [[0, 24], [30, 24]], { tone: "mid", seams: [[15, 24]] });
  const FA = G.frameAlong([108, 0, AX], [1, 0, 0]);
  put(a, [110, 0, AX], S(G.solidOf([[0, 32], [6, 32]], FA, P, { smooth: false }), { tone: "mid" }) + D(G.dotsOf(FA, 6, 26, 8, P, { all: true }), { size: 0.5 }));
  turnX(a, 114, 0, AX, [[0, 28], [56, 28]], { tone: "mid", seams: [[28, 28]] });
  // head heater bands
  [[120, 138], [144, 162]].forEach(([x0, x1]) => {
    turnX(a, x0, 0, AX, [[0, 30.5], [x1 - x0, 30.5]], { tone: "hi", rank: 2 });
    slab(a, { x: x0 + 4, y: -5, w: 10, d: 10, r: 1 }, AX + 30.5, 5, { steps: 2, bevel: 0.2, rank: 3, extra: D([at([x0 + 7, 0, AX + 35.5]), at([x0 + 11, 0, AX + 35.5])], { size: 0.4, tone: "hi" }) });
  });
  // head end flange
  const FE = G.frameAlong([164, 0, AX], [1, 0, 0]);
  put(a, [167, 0, AX], S(G.solidOf([[0, 33], [6, 33]], FE, P, { smooth: false }), { tone: "mid" }) + D(G.dotsOf(FE, 6, 28, 10, P, { all: true }), { size: 0.55 }), { rank: 4 });
  // melt pressure transducer on the adapter, air nipple on top of the head
  post(a, 95, 0, 5.2, AX + 24, 6, { steps: 6, bevel: 0.3 });
  post(a, 95, 0, 3.4, AX + 30, 14, { steps: 18, bevel: 0.3, extra: L(k.ring(95, 0, 3.4, AX + 44, P, 18), { tone: "lo" }) });
  post(a, 142, 0, 2.6, AX + 35, 8, { steps: 14, bevel: 0.2, rank: 4, extra: L(k.knurl(142, 0, 2.6, AX + 35, AX + 43, 12, P, 0.3), { tone: "lo" }) });
  // pin: the mandrel tip runs through the die ring
  turnX(a, 170, 0, AX, [[0, PIN_OD / 2], [TUBE_X0 - 170, PIN_OD / 2]], { tone: "hi", rank: 5 });
  // die ring, held by a die band (lifts away)
  const ring = G.frameAlong([170, 0, AX], [1, 0, 0]);
  const bore = DIE_BORE / 2;
  put(a, [183, 0, AX], S(G.solidOf([[0, 22], [26, 22]], ring, P, { hole: [26, bore], smooth: false }), { tone: "hi", crease: "faint" }) + D(G.dotsOf(G.frameAlong([196, 0, AX], [1, 0, 0]), 0, 17, 6, P, { all: true }), { size: 0.5 }) + L(G.circleOf(G.frameAlong([196, 0, AX], [1, 0, 0]), 0, bore + 0.1, P, 28), { tone: "lo" }), { rank: 6, lift: "die" });
  put(a, [183, 0, AX], S(G.solidOf([[6, 24.5], [20, 24.5]], ring, P, { smooth: false }), { tone: "hi", crease: "faint" }), { rank: 7, lift: "die" });
}

/* ======================================================================
   TUBE: melt cone from the die, then the finished 6 mm tube
   ====================================================================== */
const CONE_L = 22;
const tubeR = (t) => {
  const s = t * (TUBE_X1 - TUBE_X0);
  if (s >= CONE_L) return OD / 2;
  const u = s / CONE_L;
  return OD / 2 + (DIE_BORE / 2 - OD / 2) * (1 - u) * (1 - u);
};
function tube() {
  const pts = [];
  for (let x = TUBE_X0; x <= TUBE_X1; x += 4) pts.push([x, 0, AX]);
  const gaps = [[250 - TUBE_X0, 255 - TUBE_X0], [468 - TUBE_X0, 474 - TUBE_X0]];
  const pieces = tubePieces(pts, tubeR, P, { maxLength: 16, gaps, caps: [false, true] });
  for (const piece of pieces) {
    const x = piece.mid[0];
    const a = x < 250 ? "head" : x < 470 ? "vac" : "pull";
    // inside the tank the lid hides the tube: this chunk lifts with nothing, the lid covers it by order
    put(a, piece.mid, `<g class="fx-tube">${tubeSvg(piece, { tone: "hi" })}</g>`, { rank: 2 });
  }
}

/* ======================================================================
   VACUUM TANK: floor, walls, water, calibrator, lid with spray bars
   ====================================================================== */
const TANK = { x: 250, y: -34, w: 220, d: 68 };
function tank() {
  const a = "vac";
  const fl = { x: TANK.x, y: TANK.y, w: TANK.w, d: TANK.d, r: 2 };
  slab(a, fl, 6, 4, { steps: 3, bevel: 0.4, rank: 0, tone: "lo" });
  // water: a block whose surface sits just under the tube
  slab(a, { x: 253, y: -32, w: 214, d: 64, r: 1 }, 10, 28.5, { steps: 2, bevel: 0, tone: "mid", crease: "none", rank: 1, extra: [-24, -12, 12, 24].map((y) => L(k.lineOnTop([253, y], [467, y], 38.5, P), { tone: "lo" })).join("") });
  // calibrator on a bracket, near the entry wall
  slab(a, { x: 258, y: -14, w: 12, d: 28, r: 1 }, 10, 18, { steps: 2, bevel: 0.2, rank: 1 });
  const FC = G.frameAlong([258, 0, AX], [1, 0, 0]);
  put(a, [265, 0, AX], S(G.solidOf([[0, 14], [14, 14]], FC, P, { hole: [14, OD / 2 + 0.05], smooth: false }), { tone: "hi", crease: "faint", inner: L(G.arcOf(FC, 7, 14, P, { slope: 0 }), { tone: "faint" }) }) + L(G.circleOf(G.frameAlong([272, 0, AX], [1, 0, 0]), 0, OD / 2 + 0.1, P, 24), { tone: "lo" }) + D(G.dotsOf(G.frameAlong([272, 0, AX], [1, 0, 0]), 0, 10, 8, P, { all: true }), { size: 0.4 }), { rank: 3 });
  // end walls and side walls
  // far walls come before the inside of the tank, near walls after it
  const wall = (plan, rank, extra = "") => slab(a, plan, 10, 50, { steps: 2, bevel: 0.4, rank, extra });
  wall({ x: 250, y: -34, w: 3, d: 68, r: 0.5 }, 2);
  wall({ x: 467, y: -34, w: 3, d: 68, r: 0.5 }, 8);
  wall({ x: 253, y: -34, w: 214, d: 2, r: 0.5 }, 2);
  const near = { x: 253, y: 32, w: 214, d: 2, r: 0.5 };
  wall(near, 8, L(k.sideSeam(near, 30, P, 2), { tone: "faint" }) + dotOn(260, 34, 16) + dotOn(460, 34, 16) + dotOn(260, 34, 54) + dotOn(460, 34, 54));
  // seals around the tube at the wall faces
  for (const x0 of [253, 470]) {
    const FS = G.frameAlong([x0, 0, AX], [1, 0, 0]);
    put(a, [x0 + 1, 0, AX], S(G.ringBand(0, 2, OD / 2 + 0.4, 9, FS, P), { tone: "mid", crease: "faint" }), { rank: x0 > 400 ? 8.5 : 3 });
  }
  // water inlet on the near wall, level sight glass
  const FI = G.frameAlong([440, 34, 24], [0, 1, 0]);
  put(a, [440, 38, 24], S(G.solidOf([[0, 4], [8, 4]], FI, P, { smooth: false }), { tone: "mid" }) + L(G.circleOf(G.frameAlong([440, 42, 24], [0, 1, 0]), 0, 2.2, P, 14), { tone: "lo" }), { rank: 8.5 });
  put(a, [300, 35, 30], L(faceY(34.05, [[290, 18], [310, 18], [310, 46], [290, 46]]), { tone: "lo" }) + L(faceY(34.05, [[292, 20], [308, 20], [308, 44], [292, 44]]), { tone: "faint" }), { rank: 8.5 });
  // lid (lifts) with sight windows, a vacuum port and two spray bars hanging under it
  const lid = { x: 250, y: -34, w: 220, d: 68, r: 2 };
  const win = [0, 1, 2].map((i) => k.planOutline({ x: 272 + i * 62, y: -18, w: 44, d: 36, r: 3 }, 64, P, 4)).join("");
  slab(a, lid, 60, 4, { steps: 3, bevel: 0.8, rank: 5, lift: "lid", extra: L(win, { tone: "lo" }) + L(k.planOutline(k.insetPlan(lid, 3), 64, P, 3), { tone: "faint" }) });
  for (const y of [-16, 16]) {
    const F = G.frameAlong([256, y, 54], [1, 0, 0]);
    const seam = [60, 150].map((s) => G.arcOf(F, s, 2.2, P, { slope: 0 })).join("");
    put(a, [360, y, 54], S(G.solidOf([[0, 2.2], [206, 2.2]], F, P, { smooth: false }), { tone: "hi", crease: "none", inner: L(seam, { tone: "faint" }) }), { rank: 4 });
    for (const x of [270, 410]) slab(a, { x: x - 1.5, y: y > 0 ? y + 2.2 : -32, w: 3, d: y > 0 ? 32 - y - 2.2 : y + 32 - 2.2, r: 0.4 }, 53, 2, { steps: 2, bevel: 0, rank: 3, tone: "mid" });
    for (let i = 0; i < 9; i++) post(a, 276 + i * 22, y, 0.9, 51.8, 2.2, { steps: 8, bevel: 0, rank: 4, tone: "mid" });
  }
  post(a, 360, 0, 4.4, 64, 7, { steps: 20, bevel: 0.3, rank: 6, lift: "lid", extra: L(k.ring(360, 0, 2.6, 71, P, 16), { tone: "lo" }) });
  // vacuum pump on the near side, joined by a short straight pipe
  const pump = { x: 318, y: 50, w: 56, d: 28, r: 3 };
  slab(a, pump, 6, 36, {
    bevel: 0.8, steps: 4, rank: 8.5,
    extra: L(k.topTicks(pump.x + 4, pump.x + pump.w - 4, 5, 999, pump.y, 42, [pump.d, pump.d], P).minor, { tone: "lo" }) + L(k.sideTicks(pump.x + 4, pump.x + pump.w - 4, 5, 999, pump.y + pump.d, 42, [36, 36], P).minor, { tone: "lo" }),
  });
  const FP = G.frameAlong([345, 34, 30], [0, 1, 0]);
  put(a, [345, 42, 30], S(G.solidOf([[0, 3], [16, 3]], FP, P, { smooth: false }), { tone: "mid" }), { rank: 8.4 });
  post(a, 346, 64, 7, 42, 4, { steps: 28, bevel: 0.4, rank: 8.6, extra: L(k.ring(346, 64, 5.2, 46, P, 28), { tone: "lo" }) + L(k.lineOnTop([346, 64], [346 + 3.6, 64 - 3.6], 46, P), { tone: "hi" }) });
}

/* ======================================================================
   PULLER: lower belt, upper belt unit (lifts), guide posts, end stand
   ====================================================================== */
function puller() {
  const a = "pull";
  slab(a, { x: 500, y: -26, w: 80, d: 52, r: 3 }, 6, 30, { bevel: 0.8, steps: 4, rank: 0, extra: L(k.sideSeam({ x: 500, y: -26, w: 80, d: 52, r: 3 }, 16, P, 4), { tone: "faint" }) + dotOn(506, 26, 12) + dotOn(574, 26, 12) });
  const belt = (z, rank, lift, flow) => {
    const plan = { x: 506, y: -10, w: 68, d: 20, r: 1 };
    const lines = [-6, 0, 6].map((y) => L(k.lineOnTop([507, y], [573, y], z + 3, P), { tone: "mid", dashed: false, flow: true, className: "fx-belt" })).join("");
    slab(a, plan, z, 3, { steps: 2, bevel: 0.2, tone: "lo", rank, lift, extra: lines });
    for (const x of [507, 573]) {
      const F = G.frameAlong([x, -12, z - 1.5], [0, 1, 0]);
      put(a, [x, 0, z - 1.5], S(G.solidOf([[0, 4.5], [24, 4.5]], F, P, { smooth: false }), { tone: "mid", crease: "none" }) + L(G.circleOf(G.frameAlong([x, 12, z - 1.5], [0, 1, 0]), 0, 3.2, P, 16), { tone: "lo" }), { rank: rank - 0.5, lift });
    }
  };
  belt(36, 1, null);
  // guide posts
  for (const x of [520, 560]) for (const y of [-20, 20]) post(a, x, y, 2.6, 36, 40, { steps: 16, bevel: 0.2, rank: 2, extra: L(k.sideArc(x, y, 2.6, 60, P, 10), { tone: "faint" }) });
  // upper unit: belt that touches the tube top, carrier, screw rod and handwheel
  belt(45, 3, "pull");
  slab(a, { x: 504, y: -14, w: 72, d: 28, r: 2 }, 52, 8, { bevel: 0.6, steps: 3, rank: 4, lift: "pull", extra: L(k.planOutline({ x: 508, y: -10, w: 64, d: 20, r: 1 }, 60, P, 3), { tone: "faint" }) });
  post(a, 540, 0, 2.2, 60, 18, { steps: 14, bevel: 0, rank: 5, lift: "pull", crease: "none" });
  post(a, 540, 0, 8.5, 78, 5, { steps: 32, bevel: 0.5, rank: 6, lift: "pull", extra: L(k.knurl(540, 0, 8.5, 78, 83, 40, P, 0.4), { tone: "lo" }) + L(k.lineOnTop([540, 0], [548.5, 0], 83, P), { tone: "hi" }) });
  // end stand with a roller for the finished tube
  slab(a, { x: 596, y: -10, w: 16, d: 20, r: 1.5 }, 6, 14, { steps: 3, bevel: 0.4, rank: 1 });
  post(a, 604, 0, 3, 20, 7, { steps: 14, bevel: 0.2, rank: 1 });
  const FR = G.frameAlong([604, -10, 33], [0, 1, 0]);
  put(a, [604, 0, 33], S(G.solidOf([[0, 6], [20, 6]], FR, P, { smooth: false }), { tone: "mid", crease: "none" }) + L(G.circleOf(G.frameAlong([604, 10, 33], [0, 1, 0]), 0, 3.4, P, 18), { tone: "lo" }), { rank: 1 });
}

/* ---------- assemble ---------- */
drive();
feed();
screw();
barrel();
head();
tube();
tank();
puller();
const bedSvg = bed();

// lift groups become one item each at their home depth
const ANCHOR = { barrel: [-60, 0, AX], die: [183, 0, AX], lid: [360, 0, 62], pull: [540, 0, 60] };
for (const [id, g] of Object.entries(groups)) {
  const c = ANCHOR[id];
  const svg = `<g data-lift="${id}">${order(g.items)}</g>`;
  main.push({ a: g.a, rank: id === "barrel" ? 1 : 9, key: depth(c), svg, c });
}
const svgBody = `<g data-root><g class="fx-bed">${bedSvg}</g><g data-main>${orderMain(main)}</g><g data-top></g></g>`;
const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "An isometric cutaway of a lab-scale extruder line that makes PVDF tube, 6 mm outside diameter with a 0.6 mm wall. Motor and gearbox drive a screw with feed, compression and metering zones inside a heated barrel that lifts away. A head with a 10 mm die and an 8 mm pin leaves a melt cone that the puller draws down into the tube, which is sized in a vacuum tank with a calibrator and spray bars.",
  body: svgBody,
});

/* ---------- copy: every number comes from the model above ---------- */
const f1 = (n) => n.toFixed(1);
const f2 = (n) => n.toFixed(2);
const ASSEMBLIES = [
  { id: "drive", he: "הנעה", en: "Drive", short: "מנוע + תיבת הילוכים", detail: "מנוע חשמלי ותיבת הילוכים מורידים את מהירות הסיבוב ומעבירים מומנט גבוה לבורג. מגן הצימוד מפריד בין המנוע לתיבה." },
  { id: "feed", he: "הזנה ובורג", en: "Hopper & screw", short: "3 אזורי בורג", detail: "גרגירי PVDF יורדים מהמשפך אל גרון הזנה מקורר במים, כדי שלא יימסו שם ויסתמו אותו. הבורג מחולק לשלושה אזורים: הזנה (תעלה עמוקה), דחיסה (התעלה הולכת ומתרדדת) ומדידה (תעלה רדודה שמייצבת את הלחץ והטמפרטורה). בציור הבורג מקוצר." },
  { id: "barrel", he: "קנה וחימום", en: "Barrel", short: `ארבעה אזורי חימום ${ZONES[0]}→${ZONES[3]} °C`, detail: `ארבע חגורות חימום מעלות את הטמפרטורה לאורך הקנה. הפרופיל באיור (${ZONES.join(" / ")} °C) הוא דוגמה בלבד: לפי הנחיות הייצור של Arkema לצינורות PVDF, אזורי הקנה נעים בערך בין 200 ל-250 °C והערכים המדויקים נקבעים לפי דרגת החומר.` },
  { id: "head", he: "ראש ודיסה", en: "Head & die", short: `דיסה ${DIE_BORE} / דורן ${PIN_OD} מ״מ`, detail: `הנימס עובר בראש הישר דרך טבעת בין דיסה בקוטר ${DIE_BORE} מ״מ לדורן בקוטר ${PIN_OD} מ״מ: שטח של ${f1(A_DIE)} מ״מ². האוויר דרך הדורן שומר על חלל הצינורית פתוח. הדיסה בציור מוגדרת ${DIE_T} °C והראש ${HEAD_T} °C (דוגמה).` },
  { id: "vac", he: "כיול ואקום", en: "Vacuum sizing", short: "שרוול Ø6.0 מ״מ + ריסוס מים", detail: `בין הדיסה לאמבט יש מרווח אוויר. הצינורית הרכה נכנסת לשרוול כיול בקוטר ${f1(OD)} מ״מ, הוואקום באמבט מצמיד אותה לדפנות השרוול, ומרססי מים מקשיחים אותה. כאן נקבע הקוטר החיצוני ולא בדיסה.` },
  { id: "pull", he: "מושך", en: "Puller", short: `יחס משיכה ≈ ${f2(DDR)}`, detail: `המושך (שני סרטי גומי) מושך את הצינורית בקצב קבוע, והמשיכה היא שמכווצת את הנימס היוצא מהדיסה (${DIE_BORE}/${PIN_OD} מ״מ) לצינורית ${f1(OD)}/${f1(ID)} מ״מ. יחס המשיכה בשטח: ${f1(A_DIE)} / ${f1(A_TUBE)} ≈ ${f2(DDR)}; איזון המשיכה (קוטר מול דופן) ${f2(DRB)}.` },
];
const MODEL = { A_TUBE, A_DIE, DDR, RHO, speed: SPEED, tubeX: [TUBE_X0, TUBE_X1] };

const live = `
const P = ${JSON.stringify(P)};
const AX = ${AX};
const LIFTS = ${JSON.stringify(LIFTS)};
const ASSEMBLIES = ${JSON.stringify(ASSEMBLIES)};
const M = ${JSON.stringify(MODEL)};
const SCREW_X0 = ${SCREW_X0}, SCREW_X1 = ${SCREW_X1}, FLIGHT_R = ${FLIGHT_R}, PITCH = ${PITCH};
const flightsSvg = ${flightsSvg.toString()};
const K = { iso, depthOf, pathOf };
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const readout = document.querySelector("[data-readout]");
const detail = document.querySelector("[data-detail]");
const slider = document.querySelector(".fx-speed");
const buttons = [...document.querySelectorAll(".fx-nav button")];
const still = matchMedia("(prefers-reduced-motion: reduce)");
const top = svg.querySelector("[data-top]");
const mainG = svg.querySelector("[data-main]");
const flightBack = svg.querySelector("[data-flight-back]");
const flightFront = svg.querySelector("[data-flight-front]");
const lifts = {};
for (const id of Object.keys(LIFTS)) { const node = svg.querySelector('[data-lift="' + id + '"]'); lifts[id] = { node, ref: node.nextSibling, up: false }; }
const ORDER = ["barrel", "die", "lid", "pull"];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (t) => t * t * (3 - 2 * t);
let e = 0, target = 0, speed = ${SPEED.start}, phase = 0, selected = null, pinned = false, touring = !still.matches;
let frame = 0, last = 0, clock = 0, visible = false, idleTimer = 0, leaveTimer = 0, lastPhase = 9, tourStep = -1;
const kg = (v) => (M.A_TUBE * v * M.RHO * 60 / 1000);
const fmt = (n, d = 1) => n.toFixed(d);
function baseText() {
  return "מהירות משיכה " + fmt(speed) + " מ׳/דק׳ · " + fmt(kg(speed)) + " ק״ג/שעה · יציאת נימס ≈ " + fmt(speed / M.DDR, 2) + " מ׳/דק׳";
}
function say() {
  const a = ASSEMBLIES.find((x) => x.id === selected);
  const text = a ? String(ASSEMBLIES.indexOf(a) + 1).padStart(2, "0") + " · " + a.he + " — " + a.short : baseText();
  if (readout.textContent !== text) readout.textContent = text;
  detail.textContent = a ? a.detail : "רחף על האיור כדי לפתוח את המכונה, גרור את המחוון לשינוי מהירות המשיכה, ולחץ על חלק כדי להבין מה הוא עושה.";
}
function select(id) {
  selected = id;
  if (id) svg.setAttribute("data-sel", id); else svg.removeAttribute("data-sel");
  buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === id)));
  say();
}
function drawLifts() {
  ORDER.forEach((id, i) => {
    const s = ease(clamp01((1.5 * e - 0.5 * i / (ORDER.length - 1))));
    const L = lifts[id];
    L.node.setAttribute("transform", translateAlong(P, [0, 0, LIFTS[id] * s]));
    if (!L.up && s > 0.5) { top.appendChild(L.node); L.up = true; }
    else if (L.up && s < 0.4) { mainG.insertBefore(L.node, L.ref); L.up = false; }
  });
}
function drawFlights() {
  const f = flightsSvg(phase, P, K);
  flightBack.innerHTML = f.back;
  flightFront.innerHTML = f.front;
}
function setSpeed(v) {
  speed = Math.min(M.speed.max, Math.max(M.speed.min, v));
  slider.value = String(speed);
  svg.style.setProperty("--belt", (1.6 / speed).toFixed(3) + "s");
  say();
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring) {
    clock += dt;
    const ph = clock % 14;
    target = ph > 1.5 && ph < 12 ? 1 : 0;
    setSpeed(1.5 + 1.2 * Math.sin(clock * 0.45));
    const step = ph > 2.5 && ph < 12 ? Math.floor((ph - 2.5) / 1.5) : -1;
    if (step !== tourStep) { tourStep = step; select(step >= 0 ? ASSEMBLIES[step % ASSEMBLIES.length].id : null); }
  }
  e = calm ? target : e + (target - e) * (1 - Math.exp(-dt / 0.5));
  if (Math.abs(target - e) < 0.0005) e = target;
  if (!calm) phase += dt * 1.6 * speed;
  drawLifts();
  if (!calm && Math.abs(phase - lastPhase) > 0.01) { drawFlights(); lastPhase = phase; }
  frame = visible && (!calm || e !== target) ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const hold = () => { touring = false; clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (!pinned) { touring = !still.matches; clock = 0; tourStep = -1; select(null); run(); } }, 6000); };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointerenter", () => { clearTimeout(leaveTimer); hold(); target = 1; run(); });
stage.addEventListener("pointermove", (event) => {
  if (pinned) return;
  const hit = event.target.closest && event.target.closest("[data-a]");
  const id = hit ? hit.dataset.a : null;
  if (id !== selected) select(id);
  hold();
});
stage.addEventListener("pointerleave", () => { if (pinned) return; leaveTimer = setTimeout(() => { target = 0; select(null); run(); }, 500); });
stage.addEventListener("click", (event) => {
  const hit = event.target.closest && event.target.closest("[data-a]");
  const id = hit ? hit.dataset.a : null;
  hold();
  if (id && !(pinned && id === selected)) { pinned = true; target = 1; select(id); } else { pinned = false; select(null); }
  run();
});
buttons.forEach((b) => b.addEventListener("click", () => { hold(); pinned = b.dataset.id !== selected || !pinned; target = pinned ? 1 : 0; select(pinned ? b.dataset.id : null); run(); }));
slider.addEventListener("input", () => { hold(); setSpeed(parseFloat(slider.value)); run(); });
stage.addEventListener("keydown", (event) => {
  const ids = ASSEMBLIES.map((a) => a.id);
  const here = ids.indexOf(selected);
  if (event.key === " " || event.key === "Enter") { event.preventDefault(); hold(); pinned = !pinned; target = pinned ? 1 : 0; if (!pinned) select(null); }
  else if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); hold(); pinned = true; target = 1; select(ids[(here + 1) % ids.length]); }
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); hold(); pinned = true; target = 1; select(ids[(here - 1 + ids.length) % ids.length]); }
  else if (event.key === "Escape") { pinned = false; target = 0; select(null); }
  run();
});
if (still.matches) touring = false;
drawLifts();
drawFlights();
setSpeed(speed);
select(null);
`;

const cssRules = ASSEMBLIES.map((a) => `.iso-svg[data-sel="${a.id}"] [data-a="${a.id}"]{opacity:1}.iso-svg[data-sel="${a.id}"] [data-a="${a.id}"] .iso-edge{stroke:var(--anatomy-lit)}`).join("");
const css = `<style>
html{direction:rtl}
.iso-plate{direction:ltr}
.iso-plate-corner{letter-spacing:0!important;text-transform:none!important;direction:rtl;unicode-bidi:plaintext}
.iso-plate-corner[data-corner="title"]{text-transform:uppercase!important;letter-spacing:.1em!important;direction:ltr}
.iso-stage{outline:none;cursor:pointer}
.iso-stage:focus-visible{outline:1px solid var(--anatomy-mid);outline-offset:4px}
[data-a]{transition:opacity .35s var(--anatomy-ease)}
.iso-svg[data-sel] [data-a]{opacity:.2}
${cssRules}
.fx-tube .tb-body{fill:var(--anatomy-face)}
.fx-belt{stroke-dasharray:5 7!important;animation:fx-belt var(--belt,1s) linear infinite!important}
@keyframes fx-belt{to{stroke-dashoffset:-12}}
@media (prefers-reduced-motion:reduce){.fx-belt{animation:none!important}}
.fx-nav{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.fx-nav button{font:inherit;font-size:13px;color:var(--anatomy-text);background:var(--anatomy-card);border:0;border-radius:0;padding:7px 11px;box-shadow:0 0 0 1px var(--anatomy-lo);cursor:pointer;display:inline-flex;gap:7px;align-items:baseline;transition:box-shadow .2s var(--anatomy-ease),color .2s var(--anatomy-ease)}
.fx-nav button b{font:600 11px var(--anatomy-mono);color:var(--anatomy-muted)}
.fx-nav button small{font:10.5px var(--anatomy-mono);color:var(--anatomy-muted);direction:ltr}
.fx-nav button:hover,.fx-nav button[aria-pressed="true"]{box-shadow:0 0 0 1px var(--anatomy-hi);color:var(--anatomy-strong)}
.fx-nav button:focus-visible{outline:1px solid var(--anatomy-hi);outline-offset:2px}
.fx-speed-row{display:flex;align-items:center;gap:12px;margin-top:14px;color:var(--anatomy-text);font-size:13px}
.fx-speed{flex:1;max-width:340px;accent-color:var(--anatomy-hi)}
.fx-detail{margin:12px 0 0;min-height:4.8em;color:var(--anatomy-text);font-size:14px;line-height:1.65}
.iso-legend{direction:rtl}
</style>`;

const nav = `<div class="fx-speed-row"><label for="fx-speed">מהירות משיכה (מ׳/דק׳)</label><input id="fx-speed" class="fx-speed" type="range" min="${SPEED.min}" max="${SPEED.max}" step="0.1" value="${SPEED.start}"></div><nav class="fx-nav" aria-label="מכלולי הקו">${ASSEMBLIES.map((a, i) => `<button type="button" data-id="${a.id}" aria-pressed="false"><b>${String(i + 1).padStart(2, "0")}</b>${a.he}<small>${a.en}</small></button>`).join("")}</nav><p class="fx-detail gpu-detail" data-detail></p>`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "PVDF tube extruder · Ø6 × 0.6",
  hint: "ריחוף: פתיחה · מחוון: מהירות",
  readout: "",
  keys: [
    { mark: "lit", label: `הצינורית: חיצוני ${f1(OD)} מ״מ, דופן ${f1(WALL)} מ״מ, פנימי ${f1(ID)} מ״מ` },
    { mark: "raised", label: "ארבעה חלקים נפתחים: קנה, דיסה, מכסה האמבט והסרט העליון" },
  ],
  caption:
    `הדמיה איזומטרית של קו אקסטרוזיה מעבדתי לצינורית PVDF בקוטר חיצוני ${f1(OD)} מ״מ ודופן ${f1(WALL)} מ״מ. מידות הדיסה, הדורן והצינורית נכונות לפי הנתונים; אורך המכונה, הבורג והאמבט מקוצרים. כל המספרים החיים נגזרים מהמידות: שטח חתך הצינורית ${f2(A_TUBE)} מ״מ², שטח הטבעת בדיסה ${f2(A_DIE)} מ״מ², צפיפות PVDF מוצק ${RHO} ג׳/סמ״ק; ספיקה בק״ג/שעה היא שטח × מהירות × צפיפות, ומהירות יציאת הנימס היא קירוב (בלי נפיחות ושינוי צפיפות). טמפרטורות הן דוגמה בתוך הטווח שמפרסמת Arkema.`,
  body: `<div class="iso-stage" tabindex="0" role="group" aria-label="קו אקסטרוזיה לצינורית PVDF. רחף כדי לפתוח, חצים לבחירת מכלול, רווח להצמדה, Escape לביטול">${svg}</div>`,
});

const out = theme === "light" ? "pvdf-tube-extruder-light.html" : "pvdf-tube-extruder.html";
const html = k
  .pageHtml({ title: "PVDF tube extruder anatomy", theme, body: css + body + nav, script: kitScript() + live, width: 1100 })
  .replace('<html lang="en">', '<html lang="he" dir="rtl">');
writeFileSync(join(HERE, out), html);
console.log("wrote", out, `(${Math.round(html.length / 1024)} KB)`, `· A_tube ${f2(A_TUBE)} mm2 · A_die ${f2(A_DIE)} mm2 · DDR ${f2(DDR)} · DRB ${f2(DRB)} · ${f2(kgPerHour(1))} kg/h per m/min`);
