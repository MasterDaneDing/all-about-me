// Restored painter. Types are loose here because this file was rebuilt from the last bundle.
// @ts-nocheck
import type { Adjust, Part, PartKind } from "./types";
import { clampAdjust } from "./types";

export const STAGE_W = 680;
export const STAGE_H = 1040;

const INK = "#241910";
const CARD = "#fffaf3";
const LINE = "#e3d5c0";

export type PaintInput = {
  body: HTMLImageElement | null;
  head: HTMLImageElement | null;
  hair: HTMLImageElement | null;
  eyes: HTMLImageElement | null;
  nose: HTMLImageElement | null;
  mouth: HTMLImageElement | null;
  hairPart: Part | null;
  glasses?: string | null;
  skin: string;
  name: string;
  adjust: Record<PartKind, Adjust>;
};

export type StageView = { zoom: number; focusY: number };

export type PieceBox = {
  kind: PartKind;
  x: number;
  y: number;
  w: number;
  h: number;
  hx: number;
  hy: number;
};

type Scene = { boxes: PieceBox[]; headMidY: number; bodyMidY: number };

const bodyBoxCache = new WeakMap<HTMLImageElement, { t: number; b: number }>();

function bodySpan(img: HTMLImageElement) {
  const cached = bodyBoxCache.get(img);
  if (cached) return cached;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const scratch = document.createElement("canvas");
  scratch.width = w;
  scratch.height = h;
  const g = scratch.getContext("2d", { willReadFrequently: true });
  if (!g) return { t: 0, b: h };
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, w, h).data;
  let t = h;
  let b = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 3) {
      if (data[(y * w + x) * 4 + 3]! > 24) {
        if (y < t) t = y;
        if (y > b) b = y;
        break;
      }
    }
  }
  const span = b > t ? { t, b: b + 1 } : { t: 0, b: h };
  bodyBoxCache.set(img, span);
  return span;
}

function drawBodyPuppet(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  phase: number,
) {
  if (phase === 0) {
    ctx.drawImage(img, dx, dy, dw, dh);
    return;
  }
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const span = bodySpan(img);
  const hipSrc = span.t + (span.b - span.t) * 0.62;
  const footSrc = Math.min(srcH, span.b + 1);
  const scaleX = dw / srcW;
  const scaleY = dh / srcH;
  const hipY = dy + hipSrc * scaleY;
  const overlap = Math.max(8, srcW * 0.06);
  const step = Math.sin(phase * 1.35);
  const sides = [
    { x0: 0, x1: srcW / 2 + overlap, sign: -1 },
    { x0: srcW / 2 - overlap, x1: srcW, sign: 1 },
  ];
  for (const side of sides) {
    const sw = side.x1 - side.x0;
    const destW = sw * scaleX;
    const destX = dx + side.x0 * scaleX;
    const legH = (footSrc - hipSrc) * scaleY;
    ctx.save();
    ctx.translate(destX + destW / 2, hipY);
    ctx.rotate(step * 0.045 * side.sign);
    ctx.drawImage(img, side.x0, hipSrc, sw, footSrc - hipSrc, -destW / 2, 0, destW, legH);
    ctx.restore();
  }
  const cover = (footSrc - hipSrc) * 0.08;
  const torsoSrc = Math.min(srcH, hipSrc + cover);
  ctx.drawImage(img, 0, 0, srcW, torsoSrc, dx, dy, dw, torsoSrc * scaleY);
}

function drawGlasses(ctx, kind, hx, hy, hw, hh) {
	const blue = kind.endsWith("blue");
	const round = kind.startsWith("round");
	ctx.save();
	ctx.strokeStyle = blue ? "#2f62d6" : "#1a120e";
	ctx.fillStyle = blue ? "rgba(120, 170, 255, 0.28)" : "rgba(255, 255, 255, 0.18)";
	ctx.lineWidth = Math.max(5, hw * 0.045);
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	const y = hy + hh * 0.4;
	const lensW = hw * (round ? 0.24 : 0.26);
	const lensH = round ? lensW * 0.92 : lensW * 0.72;
	const gap = hw * 0.05;
	const cx = hx + hw / 2;
	const lens = (x) => {
		ctx.beginPath();
		if (round) ctx.ellipse(x + lensW / 2, y, lensW / 2, lensH / 2, 0, 0, Math.PI * 2);
		else roundRect(ctx, x, y - lensH / 2, lensW, lensH, Math.min(8, lensH / 4));
		ctx.fill();
		ctx.stroke();
	};
	lens(cx - gap / 2 - lensW);
	lens(cx + gap / 2);
	ctx.beginPath();
	ctx.moveTo(cx - gap / 2, y);
	ctx.lineTo(cx + gap / 2, y);
	ctx.stroke();
	ctx.restore();
}

const headCache = new Map<string, HTMLCanvasElement | HTMLImageElement>();
function hexToRgb(hex) {
	const h = hex.replace("#", "");
	const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
	const v = Number.parseInt(n, 16);
	return {
		r: v >> 16 & 255,
		g: v >> 8 & 255,
		b: v & 255
	};
}
function luminance(hex) {
	const { r, g, b } = hexToRgb(hex);
	return (.2126 * r + .7152 * g + .0722 * b) / 255;
}
function recolor(img, hex, mode) {
	const key = `${mode}:${hex}:${img.src}`;
	const hit = headCache.get(key);
	if (hit) return hit;
	const c = document.createElement("canvas");
	c.width = img.naturalWidth || img.width;
	c.height = img.naturalHeight || img.height;
	const ctx = c.getContext("2d");
	if (!ctx) return img;
	ctx.drawImage(img, 0, 0);
	const image = ctx.getImageData(0, 0, c.width, c.height);
	const d = image.data;
	const { r, g, b } = hexToRgb(hex);
	for (let i = 0; i < d.length; i += 4) {
		if (d[i + 3] === 0) continue;
		const lum = (d[i] + d[i + 1] + d[i + 2]) / 765;
		const ink = mode === "fill" ? lum : 1 - lum;
		d[i] = r * ink;
		d[i + 1] = g * ink;
		d[i + 2] = b * ink;
	}
	ctx.putImageData(image, 0, 0);
	headCache.set(key, c);
	return c;
}
function hueSat(r, g, b) {
	const mx = r > g ? r > b ? r : b : g > b ? g : b;
	const mn = r < g ? r < b ? r : b : g < b ? g : b;
	const d = mx - mn;
	const sat = mx ? d / mx : 0;
	let hue = 0;
	if (d) {
		if (mx === r) hue = (60 * ((g - b) / d) + 360) % 360;
		else if (mx === g) hue = 60 * ((b - r) / d) + 120;
		else hue = 60 * ((r - g) / d) + 240;
	}
	return { hue, sat, mx };
}
function skinGate(r, g, b, a, href, sref, dh, dsLo, dsHi) {
	if (a < 150 || Math.max(r, g, b) < 55) return false;
	const { hue, sat } = hueSat(r, g, b);
	let dist = Math.abs(hue - href);
	if (dist > 180) dist = 360 - dist;
	if (dist > dh) return false;
	if (sat < Math.max(0.09, sref - dsLo) || sat > sref + dsHi) return false;
	if (r + 4 < g || g + 6 < b || r - b < 20) return false;
	return true;
}
export function recolorBody(img, hex) {
	const key = `body2:${hex}:${img.src}`;
	const hit = headCache.get(key);
	if (hit) return hit;
	const w = img.naturalWidth || img.width;
	const h = img.naturalHeight || img.height;
	const c = document.createElement("canvas");
	c.width = w;
	c.height = h;
	const ctx = c.getContext("2d", { willReadFrequently: true });
	if (!ctx) return img;
	ctx.drawImage(img, 0, 0);
	const image = ctx.getImageData(0, 0, w, h);
	const d = image.data;
	let minx = w, miny = h, maxx = 0, maxy = 0;
	for (let y = 0; y < h; y += 1) {
		for (let x = 0; x < w; x += 1) {
			if (d[(y * w + x) * 4 + 3] < 160) continue;
			if (x < minx) minx = x;
			if (y < miny) miny = y;
			if (x > maxx) maxx = x;
			if (y > maxy) maxy = y;
		}
	}
	if (maxx <= minx || maxy <= miny) return img;
	const bw = maxx - minx + 1;
	const bh = maxy - miny + 1;
	const hues = [];
	const sats = [];
	const yA = miny + (bh * 0.38 | 0);
	const yB = miny + (bh * 0.58 | 0);
	for (let y = yA; y < yB; y += 2) {
		for (let side = 0; side < 2; side += 1) {
			const from = side ? maxx : minx;
			const to = side ? minx - 1 : maxx + 1;
			const step = side ? -1 : 1;
			for (let x = from; x !== to; x += step) {
				const i = (y * w + x) * 4;
				const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
				if (a < 150 || Math.max(r, g, b) < 90) continue;
				const { hue, sat } = hueSat(r, g, b);
				if (hue >= 14 && hue <= 36 && sat >= 0.12 && sat <= 0.75 && r > g && g > b && r - b > 22) {
					hues.push(hue);
					sats.push(sat);
				}
				break;
			}
		}
	}
	if (hues.length < 6) return img;
	hues.sort((a, b) => a - b);
	sats.sort((a, b) => a - b);
	const href = hues[hues.length >> 1];
	const sref = sats[sats.length >> 1];
	const keep = new Uint8Array(w * h);
	const stack = [];
	const consider = (x, y) => {
		const p = y * w + x;
		if (keep[p]) return;
		const i = p * 4;
		if (!skinGate(d[i], d[i + 1], d[i + 2], d[i + 3], href, sref, 9.5, 0.16, 0.13)) return;
		keep[p] = 1;
		stack.push(p);
	};
	const arm0 = miny + (bh * 0.3 | 0);
	const arm1 = miny + (bh * 0.62 | 0);
	const armL = minx + (bw * 0.28 | 0);
	const armR = maxx - (bw * 0.28 | 0);
	for (let y = arm0; y < arm1; y += 1) {
		for (let x = minx; x < armL; x += 1) consider(x, y);
		for (let x = armR; x <= maxx; x += 1) consider(x, y);
	}
	const leg0 = miny + (bh * 0.64 | 0);
	const leg1 = miny + (bh * 0.86 | 0);
	for (let y = leg0; y < leg1; y += 1) {
		for (let x = minx + (bw * 0.24 | 0); x < minx + (bw * 0.46 | 0); x += 1) consider(x, y);
		for (let x = minx + (bw * 0.54 | 0); x < minx + (bw * 0.76 | 0); x += 1) consider(x, y);
	}
	const neck1 = miny + Math.max(4, bh * 0.12 | 0);
	for (let y = miny; y < neck1; y += 1) {
		for (let x = minx + (bw * 0.32 | 0); x < minx + (bw * 0.68 | 0); x += 1) consider(x, y);
	}
	while (stack.length) {
		const p = stack.pop();
		const x = p % w;
		const y = (p / w) | 0;
		for (let dy = -1; dy <= 1; dy += 1) {
			const yy = y + dy;
			if (yy < 0 || yy >= h) continue;
			for (let dx = -1; dx <= 1; dx += 1) {
				if (!dx && !dy) continue;
				const xx = x + dx;
				if (xx < 0 || xx >= w) continue;
				const q = yy * w + xx;
				if (keep[q]) continue;
				const i = q * 4;
				if (!skinGate(d[i], d[i + 1], d[i + 2], d[i + 3], href, sref, 9.5, 0.16, 0.13)) continue;
				keep[q] = 1;
				stack.push(q);
			}
		}
	}
	for (let pass = 0; pass < 2; pass += 1) {
		const grown = [];
		for (let y = 1; y < h - 1; y += 1) {
			for (let x = 1; x < w - 1; x += 1) {
				const p = y * w + x;
				if (keep[p]) continue;
				const i = p * 4;
				if (d[i + 3] < 140 || Math.max(d[i], d[i + 1], d[i + 2]) < 45) continue;
				let near = 0;
				for (let dy = -1; dy <= 1; dy += 1) {
					for (let dx = -1; dx <= 1; dx += 1) {
						if ((dx || dy) && keep[p + dy * w + dx]) near += 1;
					}
				}
				if (near >= 5 && skinGate(d[i], d[i + 1], d[i + 2], d[i + 3], href, sref, 14, 0.22, 0.18)) grown.push(p);
			}
		}
		for (let n = 0; n < grown.length; n += 1) keep[grown[n]] = 1;
	}
	const hist = new Uint32Array(256);
	let count = 0;
	for (let p = 0; p < keep.length; p += 1) {
		if (!keep[p]) continue;
		const i = p * 4;
		const lum = (d[i] + d[i + 1] + d[i + 2]) / 3 | 0;
		hist[lum] += 1;
		count += 1;
	}
	if (!count) return img;
	let seen = 0;
	let ref = 180;
	const mid = count >> 1;
	for (let lum = 0; lum < 256; lum += 1) {
		seen += hist[lum];
		if (seen > mid) { ref = lum || 1; break; }
	}
	const { r, g, b } = hexToRgb(hex);
	for (let p = 0; p < keep.length; p += 1) {
		if (!keep[p]) continue;
		const i = p * 4;
		const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
		let shade = lum / ref;
		if (shade < 0.55) shade = 0.55;
		if (shade > 1.18) shade = 1.18;
		d[i] = Math.min(255, Math.round(r * shade));
		d[i + 1] = Math.min(255, Math.round(g * shade));
		d[i + 2] = Math.min(255, Math.round(b * shade));
	}
	ctx.putImageData(image, 0, 0);
	headCache.set(key, c);
	return c;
}
function roundRect(ctx, x, y, w, h, r) {
	const radius = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.arcTo(x + w, y, x + w, y + h, radius);
	ctx.arcTo(x + w, y + h, x, y + h, radius);
	ctx.arcTo(x, y + h, x, y, radius);
	ctx.arcTo(x, y, x + w, y, radius);
	ctx.closePath();
}
export function viewZoom(kind: PartKind) {
	return kind === "body" ? 1 : 1.12;
}
var PARK = {
	sky: "#b7def3",
	hill: "#9ed0ea",
	grass: "#7ec45a",
	grassDark: "#69ae48",
	path: "#f0d7a8",
	sun: "#ffd56a",
	leaf: "#3e9a4c",
	leafDeep: "#2f7d3d",
	trunk: "#8b5a34",
	cloud: "#fffaf3",
	flower: "#d8442c",
	petal: "#f2c14e"
};
function ink(ctx, width) {
	ctx.strokeStyle = INK;
	ctx.lineWidth = width;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
}
function drawPark(ctx, phase) {
	const W = 680;
	const H = STAGE_H;
	const drift = Math.sin(phase * .35) * 10;
	ctx.fillStyle = PARK.sky;
	ctx.fillRect(0, 0, W, H);
	ctx.fillStyle = PARK.sun;
	ctx.beginPath();
	ctx.arc(548, 168, 54, 0, Math.PI * 2);
	ctx.fill();
	ink(ctx, 8);
	ctx.stroke();
	ctx.save();
	ctx.translate(548, 168);
	ctx.rotate(phase * .08);
	ctx.strokeStyle = PARK.sun;
	ctx.lineWidth = 8;
	for (let i = 0; i < 8; i += 1) {
		ctx.rotate(Math.PI / 4);
		ctx.beginPath();
		ctx.moveTo(68, 0);
		ctx.lineTo(96, 0);
		ctx.stroke();
	}
	ctx.restore();
	const cloud = (x, y, s) => {
		ctx.fillStyle = PARK.cloud;
		ctx.beginPath();
		ctx.arc(x, y, 28 * s, 0, Math.PI * 2);
		ctx.arc(x + 32 * s, y + 6 * s, 22 * s, 0, Math.PI * 2);
		ctx.arc(x - 30 * s, y + 8 * s, 20 * s, 0, Math.PI * 2);
		ctx.fill();
		ink(ctx, 7);
		ctx.stroke();
	};
	cloud(150 + drift, 150, 1);
	cloud(330 - drift * .6, 96, .8);
	ctx.fillStyle = PARK.hill;
	ctx.beginPath();
	ctx.moveTo(0, 470);
	ctx.quadraticCurveTo(180, 390, 360, 450);
	ctx.quadraticCurveTo(520, 500, W, 420);
	ctx.lineTo(W, 560);
	ctx.lineTo(0, 560);
	ctx.fill();
	ctx.fillStyle = PARK.grass;
	ctx.beginPath();
	ctx.moveTo(0, 530);
	ctx.quadraticCurveTo(W * .5, 490, W, 540);
	ctx.lineTo(W, H);
	ctx.lineTo(0, H);
	ctx.fill();
	ink(ctx, 8);
	ctx.beginPath();
	ctx.moveTo(0, 534);
	ctx.quadraticCurveTo(W * .5, 494, W, 544);
	ctx.stroke();
	ctx.fillStyle = PARK.grassDark;
	ctx.beginPath();
	ctx.ellipse(120, 700, 90, 22, 0, 0, Math.PI * 2);
	ctx.ellipse(560, 760, 80, 18, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = PARK.path;
	ctx.beginPath();
	ctx.moveTo(W / 2 - 36, 620);
	ctx.lineTo(376, 620);
	ctx.lineTo(490, H);
	ctx.lineTo(W / 2 - 150, H);
	ctx.closePath();
	ctx.fill();
	ink(ctx, 8);
	ctx.stroke();
	const tree = (x, y, lean) => {
		ctx.strokeStyle = PARK.trunk;
		ctx.lineWidth = 16;
		ctx.lineCap = "round";
		ctx.beginPath();
		ctx.moveTo(x, y + 150);
		ctx.quadraticCurveTo(x + lean, y + 70, x + lean * .4, y);
		ctx.stroke();
		const puffs = [
			[
				0,
				0,
				58
			],
			[
				-48,
				16,
				42
			],
			[
				46,
				18,
				40
			],
			[
				-16,
				-36,
				36
			],
			[
				22,
				-28,
				32
			]
		];
		ctx.fillStyle = PARK.leaf;
		for (const [dx, dy, r] of puffs) {
			ctx.beginPath();
			ctx.arc(x + dx + lean * .2, y + dy, r, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.fillStyle = PARK.leafDeep;
		ctx.beginPath();
		ctx.arc(x - 20, y + 10, 22, 0, Math.PI * 2);
		ctx.fill();
		ink(ctx, 7);
		for (const [dx, dy, r] of puffs) {
			ctx.beginPath();
			ctx.arc(x + dx + lean * .2, y + dy, r, 0, Math.PI * 2);
			ctx.stroke();
		}
	};
	tree(86, 430, 10);
	tree(600, 400, -14);
	const flower = (x, y, color) => {
		ctx.strokeStyle = PARK.grassDark;
		ctx.lineWidth = 4;
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.lineTo(x, y + 28);
		ctx.stroke();
		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.arc(x, y, 11, 0, Math.PI * 2);
		ctx.fill();
		ink(ctx, 4);
		ctx.stroke();
		ctx.fillStyle = PARK.sun;
		ctx.beginPath();
		ctx.arc(x, y, 4, 0, Math.PI * 2);
		ctx.fill();
	};
	flower(70, 820, PARK.flower);
	flower(128, 860, PARK.petal);
	flower(560, 840, PARK.flower);
	flower(620, 800, PARK.petal);
	flower(500, 900, PARK.flower);
}
function headScaleFor(nw, nh, bodyW) {
	const fitted = bodyW * .9 / nw;
	if (nh / nw >= .82) return fitted;
	const grown = bodyW * .9 * .82 / nh;
	return Math.min(grown, fitted * 1.55);
}
function project(x, y, sway, bob, pivotX, pivotY, view) {
	const dx = x - pivotX;
	const dy = y - pivotY;
	const rot = sway * .058;
	const c = Math.cos(rot);
	const s = Math.sin(rot);
	const wx = pivotX + sway * 18 + dx * c - dy * s;
	const wy = pivotY + bob + dx * s + dy * c;
	const anchorY = STAGE_H * .4;
	const t = Math.min(1, Math.max(0, (view.zoom - 1) / 1.05));
	const originY = view.focusY + (anchorY - view.focusY) * t;
	return {
		x: 340 + (wx - 340) * view.zoom,
		y: originY + (wy - view.focusY) * view.zoom
	};
}
function boxOf(kind, x, y, w, h, sway, bob, pivotX, pivotY, view) {
	const corners = [
		project(x, y, sway, bob, pivotX, pivotY, view),
		project(x + w, y, sway, bob, pivotX, pivotY, view),
		project(x, y + h, sway, bob, pivotX, pivotY, view),
		project(x + w, y + h, sway, bob, pivotX, pivotY, view)
	];
	const xs = corners.map((p) => p.x);
	const ys = corners.map((p) => p.y);
	const left = Math.min(...xs);
	const top = Math.min(...ys);
	const right = Math.max(...xs);
	const bottom = Math.max(...ys);
	return {
		kind,
		x: left,
		y: top,
		w: right - left,
		h: bottom - top,
		hx: right - 4,
		hy: bottom - 4
	};
}
export function paintPerson(
  ctx: CanvasRenderingContext2D,
  input: PaintInput,
  phase = 0,
  view: StageView = { zoom: 1, focusY: STAGE_H * 0.42 },
  guide: PartKind | null = null,
  plain = false,
): Scene {
	const { body, head, skin, name, adjust } = input;
	const W = 680;
	const H = STAGE_H;
	ctx.clearRect(0, 0, W, H);
	ctx.save();
	const anchorY = H * .4;
	const blend = Math.min(1, Math.max(0, (view.zoom - 1) / 1.05));
	const originY = view.focusY + (anchorY - view.focusY) * blend;
	ctx.translate(W / 2, originY);
	ctx.scale(view.zoom, view.zoom);
	ctx.translate(-340, -view.focusY);
	if (!plain) drawPark(ctx, phase);
	const bodyH = 460;
	const bodyW = body ? body.naturalWidth * (bodyH / body.naturalHeight) : 320;
	const bodyTop = 424;
	const bodyX = (W - bodyW) / 2;
	const sway = Math.sin(phase);
	if (!plain && body) {
		ctx.save();
		ctx.fillStyle = "rgba(36, 25, 16, 0.12)";
		ctx.beginPath();
		ctx.ellipse(W / 2 + sway * 18, 876, Math.max(24, bodyW * .34 * (1 - Math.abs(sway) * .1)), 13, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}
	const bodyA = clampAdjust(adjust.body);
	const drawBW = bodyW * bodyA.s;
	const drawBH = bodyH * bodyA.s;
	const drawBX = bodyX + (bodyW - drawBW) / 2 + bodyA.x;
	const drawBY = bodyTop + (bodyH - drawBH) / 2 + bodyA.y;
	const fitted = head ? headScaleFor(head.naturalWidth, head.naturalHeight, bodyW) : 0;
	const headW = head ? head.naturalWidth * fitted : 0;
	const headH = head ? head.naturalHeight * fitted : 0;
	const headTop = 470 - headH;
	const headX = (W - headW) / 2;
	const headA = clampAdjust(adjust.head);
	const drawHW = headW * headA.s;
	const drawHH = headH * headA.s;
	const drawHX = headX + (headW - drawHW) / 2 + headA.x;
	const drawHY = headTop + (headH - drawHH) / 2 + headA.y;
	const pivotX = W / 2;
	const pivotY = 860;
	const bob = Math.sin(phase * 2) * 9;
	ctx.save();
	ctx.translate(pivotX + sway * 18, pivotY + bob);
	ctx.rotate(sway * .058);
	ctx.translate(-340, -860);
	if (body) drawBodyPuppet(ctx, recolorBody(body, skin), drawBX, drawBY, drawBW, drawBH, phase);
	const faceCx = drawHX + drawHW / 2;
	const faceCy = drawHY + drawHH * .55;
	const turn = phase === 0 ? 0 : Math.sin(phase * .85) * .22 - .08;
	const squash = 1 - Math.abs(turn) * .55;
	const shift = turn * drawHW * .14;
	const slide = turn * drawHW * .2;
	const featureSquash = squash * (1 - Math.abs(turn) * .12);
	const withTurn = (amount, slideX, draw) => {
		ctx.save();
		ctx.translate(faceCx + slideX, faceCy);
		ctx.scale(amount, 1);
		ctx.translate(-faceCx, -faceCy);
		draw();
		ctx.restore();
	};
	const turned = (x, y, w, h, amount, slideX) => ({
		x: faceCx + slideX + (x - faceCx) * amount,
		y,
		w: w * amount,
		h
	});
	if (head) withTurn(squash, shift, () => {
		ctx.drawImage(recolor(head, skin, "fill"), drawHX, drawHY, drawHW, drawHH);
	});
	const featureRects = [];
	const drawFeature = (img, kind, yFrac, wFrac, asInk, hFrac) => {
		if (!img) return;
		const source = asInk ? recolor(img, luminance(skin) < .42 ? "#f7f1e6" : "#1a120e", "ink") : img;
		const a = clampAdjust(adjust[kind]);
		const aspect = (img.naturalHeight || img.height) / (img.naturalWidth || img.width || 1);
		let w = drawHW * wFrac * a.s;
		let h = w * aspect;
		if (hFrac && h > drawHH * hFrac * a.s) {
			h = drawHH * hFrac * a.s;
			w = h / aspect;
		}
		const x = drawHX + drawHW / 2 - w / 2 + a.x;
		const y = drawHY + drawHH * yFrac - h / 2 + a.y;
		ctx.drawImage(source, x, y, w, h);
		featureRects.push({
			kind,
			x,
			y,
			w,
			h
		});
	};
	if (head) withTurn(featureSquash, shift + slide, () => {
		drawFeature(input.eyes, "eyes", .4, .46, true);
		drawFeature(input.nose, "nose", .56, .2, false);
		drawFeature(input.mouth, "mouth", .72, .34, false, .24);
		if (input.glasses) drawGlasses(ctx, input.glasses, drawHX, drawHY, drawHW, drawHH);
	});
	const hairHeld = { rect: null };
	const hairImg = input.hair;
	if (head && hairImg) withTurn(squash, shift, () => {
		const a = clampAdjust(adjust.hair);
		if (input.hairPart?.scarf && input.hairPart.frame) {
			const frame = input.hairPart.frame;
			const scale = drawHW * .72 / frame.w * a.s;
			const dw = hairImg.naturalWidth * scale;
			const dh = hairImg.naturalHeight * scale;
			const fcx = (frame.x + frame.w / 2) * scale;
			const fcy = (frame.y + frame.h / 2) * scale;
			const holeX = drawHX + drawHW / 2;
			const holeY = drawHY + drawHH * .47;
			const x = holeX - fcx + a.x;
			const y = holeY - fcy + a.y;
			ctx.drawImage(hairImg, x, y, dw, dh);
			hairHeld.rect = {
				x,
				y,
				w: dw,
				h: dh
			};
		} else {
			const iw = hairImg.naturalWidth || hairImg.width || 1;
			const ih = hairImg.naturalHeight || hairImg.height;
			const dw = drawHW * 1.06 * a.s;
			const dh = dw * (ih / iw);
			const x = drawHX + drawHW / 2 - dw / 2 + a.x;
			const y = drawHY - drawHH * .06 + a.y;
			ctx.drawImage(hairImg, x, y, dw, dh);
			hairHeld.rect = {
				x,
				y,
				w: dw,
				h: dh
			};
		}
	});
	ctx.restore();
	ctx.restore();
	const boxes = [];
	if (body) boxes.push(boxOf("body", drawBX, drawBY, drawBW, drawBH, sway, bob, pivotX, pivotY, view));
	if (head) {
		const shown = turned(drawHX, drawHY, drawHW, drawHH, squash, shift);
		boxes.push(boxOf("head", shown.x, shown.y, shown.w, shown.h, sway, bob, pivotX, pivotY, view));
	}
	if (hairHeld.rect) {
		const shown = turned(hairHeld.rect.x, hairHeld.rect.y, hairHeld.rect.w, hairHeld.rect.h, squash, shift);
		boxes.push(boxOf("hair", shown.x, shown.y, shown.w, shown.h, sway, bob, pivotX, pivotY, view));
	}
	for (const rect of featureRects) {
		const shown = turned(rect.x, rect.y, rect.w, rect.h, featureSquash, shift + slide);
		boxes.push(boxOf(rect.kind, shown.x, shown.y, shown.w, shown.h, sway, bob, pivotX, pivotY, view));
	}
	if (guide) {
		const box = boxes.find((item) => item.kind === guide);
		if (box) {
			ctx.save();
			ctx.strokeStyle = "#d8442c";
			ctx.lineWidth = 5;
			ctx.lineJoin = "round";
			roundRect(ctx, box.x - 8, box.y - 8, box.w + 16, box.h + 16, 20);
			ctx.stroke();
			ctx.restore();
		}
	}
	const label = name.trim().slice(0, 22);
	if (!plain && label) {
		let size = 48;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		const maxW = 584;
		for (; size > 26; size -= 2) {
			ctx.font = `400 ${size}px "KG Perfect Penmanship", Nunito, sans-serif`;
			if (ctx.measureText(label).width <= maxW) break;
		}
		const textW = ctx.measureText(label).width;
		const pw = Math.min(632, textW + 56);
		const ph = 72;
		const px = (W - pw) / 2;
		const py = 922;
		ctx.fillStyle = CARD;
		ctx.strokeStyle = LINE;
		ctx.lineWidth = 3;
		roundRect(ctx, px, py, pw, ph, 36);
		ctx.fill();
		ctx.stroke();
		ctx.fillStyle = INK;
		ctx.fillText(label, W / 2, 960);
	}
	return {
		boxes,
		headMidY: drawHY + drawHH * .46,
		bodyMidY: drawBY + drawBH * .5
	};
}
