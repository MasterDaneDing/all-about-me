import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import {
  clampAdjust,
  freshAdjust,
  partId,
  withPart,
  type Adjust,
  type Look,
  type Part,
  type PartKind,
  type Glasses,
} from "@/lib/dress/types";
import { paintPerson, recolorBody, STAGE_H, STAGE_W, viewZoom, type PieceBox, type StageView } from "@/lib/dress/paint";
import { previewAssetUrl } from "@/lib/preview-path-prefix";

const STORAGE_KEY = "make-a-person-v2";

const TABS: { id: PartKind | "glasses"; label: string }[] = [
  { id: "head", label: "Head" },
  { id: "hair", label: "Hair" },
  { id: "eyes", label: "Eyes" },
  { id: "glasses", label: "Glasses" },
  { id: "nose", label: "Nose" },
  { id: "mouth", label: "Mouth" },
  { id: "body", label: "Body" },
];

const GLASSES: { id: Glasses | null; label: string }[] = [
  { id: null, label: "None" },
  { id: "round-black", label: "Round black" },
  { id: "round-blue", label: "Round blue" },
  { id: "square-black", label: "Square black" },
  { id: "square-blue", label: "Square blue" },
];

const SKINS = [
  { hex: "#F6D3C0", label: "Very light" },
  { hex: "#F0C0A0", label: "Light" },
  { hex: "#E0A67A", label: "Medium light" },
  { hex: "#C68642", label: "Medium" },
  { hex: "#8D5524", label: "Tan" },
  { hex: "#5C3A28", label: "Deep" },
  { hex: "#3B2418", label: "Very deep" },
];

type Slot = { id: string | null; part: Part | null };
type Tone = "light" | "deep";

type Gesture = {
  mode: "move" | "scale" | "pinch";
  pointerId: number;
  kind: PartKind;
  start: Adjust;
  sx: number;
  sy: number;
  startDist: number;
  cx: number;
  cy: number;
};

function defaultLook(): Look {
  return {
    head: null,
    hair: null,
    eyes: null,
    nose: null,
    mouth: null,
    body: null,
    glasses: null,
    skin: "#E0A67A",
    name: "",
    adjust: freshAdjust(),
  };
}

function loadLook(): Look {
  const base = defaultLook();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Look>;
    const adjust = freshAdjust();
    const stored = parsed.adjust;
    if (stored) {
      (Object.keys(adjust) as PartKind[]).forEach((kind) => {
        adjust[kind] = clampAdjust(stored[kind]);
      });
    }
    return {
      ...base,
      ...parsed,
      head: parsed.head === null || typeof parsed.head === "string" ? (parsed.head ?? null) : null,
      body: parsed.body === null || typeof parsed.body === "string" ? (parsed.body ?? null) : null,
      glasses: GLASSES.some((item) => item.id === parsed.glasses) ? (parsed.glasses ?? null) : null,
      name: typeof parsed.name === "string" ? parsed.name : "",
      skin: typeof parsed.skin === "string" ? parsed.skin : base.skin,
      adjust,
    };
  } catch {
    return base;
  }
}

function slotsFor(parts: Part[], kind: PartKind, tone: Tone): Slot[] {
  let list = parts.filter((p) => p.kind === kind);
  if (kind === "body") {
    list = list.filter((p) => (p.tone === "deep" ? "deep" : "light") === tone);
  }
  const slots: Slot[] = list.map((part) => ({ id: part.id, part }));
  slots.unshift({ id: null, part: null });
  return slots;
}

function cycleId(slots: Slot[], current: string | null, dir: -1 | 1): string | null {
  if (slots.length === 0) return current;
  let idx = slots.findIndex((s) => s.id === current);
  if (idx < 0) idx = dir === 1 ? -1 : 0;
  idx = (idx + dir + slots.length) % slots.length;
  return slots[idx]?.id ?? current;
}

function LittlePerson({ look, parts, caption }: { look: Look; parts: Part[]; caption: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const byId = new Map(parts.map((part) => [part.id, part]));
  const hairPart = look.hair ? (byId.get(look.hair) ?? null) : null;
  const body = useSprite(look.body ? (byId.get(look.body)?.src ?? null) : null);
  const head = useSprite(look.head ? (byId.get(look.head)?.src ?? null) : null);
  const hair = useSprite(hairPart?.src ?? null);
  const eyes = useSprite(look.eyes ? (byId.get(look.eyes)?.src ?? null) : null);
  const nose = useSprite(look.nose ? (byId.get(look.nose)?.src ?? null) : null);
  const mouth = useSprite(look.mouth ? (byId.get(look.mouth)?.src ?? null) : null);
  const pack = useRef({ body, head, hair, eyes, nose, mouth, hairPart, look });
  pack.current = { body, head, hair, eyes, nose, mouth, hairPart, look };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const off = document.createElement("canvas");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const OUT = 280;
    off.width = (STAGE_W + OUT * 2) * dpr;
    off.height = (STAGE_H + OUT * 2) * dpr;
    const source = off.getContext("2d");
    if (!source) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let crop: { x: number; y: number; w: number; h: number; key: string } | null = null;
    let frame = 0;
    let alive = true;
    const paint = (phase: number) => {
      const cur = pack.current;
      source.setTransform(1, 0, 0, 1, 0, 0);
      source.clearRect(0, 0, off.width, off.height);
      source.setTransform(dpr, 0, 0, dpr, OUT * dpr, OUT * dpr);
      source.clearRect(0, 0, STAGE_W, STAGE_H);
      paintPerson(
        source,
        {
          body: cur.body,
          head: cur.head,
          hair: cur.hair,
          eyes: cur.eyes,
          nose: cur.nose,
          mouth: cur.mouth,
          hairPart: cur.hairPart,
          glasses: cur.look.glasses,
          skin: cur.look.skin,
          name: "",
          adjust: cur.look.adjust,
        },
        phase,
        { zoom: 1, focusY: STAGE_H * 0.5 },
        null,
        true,
      );
    };
    const draw = (now: number) => {
      if (!alive) return;
      const cur = pack.current;
      if (cur.body || cur.head) {
        const key = [
          cur.body?.src ?? "",
          cur.head?.src ?? "",
          cur.hair?.src ?? "",
          cur.eyes?.src ?? "",
          cur.nose?.src ?? "",
          cur.mouth?.src ?? "",
          cur.look.skin,
          cur.look.glasses ?? "",
          JSON.stringify(cur.look.adjust),
        ].join("|");
        const ready =
          (!cur.look.body || cur.body) &&
          (!cur.look.head || cur.head) &&
          (!cur.look.hair || cur.hair);
        if (ready && crop?.key !== key) {
          let minX = off.width;
          let minY = off.height;
          let maxX = 0;
          let maxY = 0;
          for (const phase of [0, 0.8, 1.7, 2.5, 3.4, 4.3, 5.2]) {
            paint(phase);
            const pixels = source.getImageData(0, 0, off.width, off.height).data;
            const width = off.width;
            for (let y = 0; y < off.height; y += 2) {
              for (let x = 0; x < width; x += 2) {
                if (pixels[(y * width + x) * 4 + 3]! > 12) {
                  if (x < minX) minX = x;
                  if (y < minY) minY = y;
                  if (x > maxX) maxX = x;
                  if (y > maxY) maxY = y;
                }
              }
            }
          }
          if (maxX > minX && maxY > minY) {
            const pad = 28 * dpr;
            const x = Math.max(0, minX - pad);
            const y = Math.max(0, minY - pad);
            const right = Math.min(off.width, maxX + pad);
            const bottom = Math.min(off.height, maxY + pad);
            crop = { key, x: x / dpr, y: y / dpr, w: (right - x) / dpr, h: (bottom - y) / dpr };
            canvas.width = Math.ceil(crop.w * dpr);
            canvas.height = Math.ceil(crop.h * dpr);
          }
        }
        paint(reduce ? 0 : now / 1000);
        const frameCrop = crop;
        if (frameCrop) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(
            off,
            frameCrop.x * dpr,
            frameCrop.y * dpr,
            frameCrop.w * dpr,
            frameCrop.h * dpr,
            0,
            0,
            canvas.width,
            canvas.height,
          );
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, []);

  const name = look.name.trim();
  return <canvas ref={ref} className="little-canvas" aria-label={name || caption} />;
}

function useSprite(src: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) {
      setImg(null);
      return;
    }
    let alive = true;
    const el = new Image();
    el.onload = () => {
      if (alive) setImg(el);
    };
    el.src = src;
    return () => {
      alive = false;
    };
  }, [src]);
  return img;
}

function BodyThumb({ src, skin }: { src: string; skin: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const img = useSprite(src);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !img) return;
    const tinted = recolorBody(img, skin);
    const size = 160;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    const scale = Math.min(size / tinted.width, size / tinted.height);
    const dw = tinted.width * scale;
    const dh = tinted.height * scale;
    ctx.drawImage(tinted, (size - dw) / 2, (size - dh) / 2, dw, dh);
  }, [img, skin]);
  return <canvas ref={ref} aria-hidden />;
}

function toColorInput(hex: string) {
  const h = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(h)) return h;
  return "#E0A67A";
}

export function DressUp({
  onDone,
  onBack,
  seedName = "",
}: {
  onDone: (look: Look) => void;
  onBack?: () => void;
  seedName?: string;
}) {
  const [parts, setParts] = useState<Part[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [look, setLook] = useState<Look>(defaultLook);
  const [tab, setTab] = useState<PartKind | "glasses">("head");
  const [bodyTone, setBodyTone] = useState<Tone>("light");
  const [ready, setReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reelRef = useRef<HTMLDivElement>(null);
  const lookRef = useRef(look);
  const tabRef = useRef<PartKind>("head");
  const toneRef = useRef(bodyTone);
  const partsRef = useRef(parts);
  const imagesRef = useRef({
    body: null as HTMLImageElement | null,
    head: null as HTMLImageElement | null,
    hair: null as HTMLImageElement | null,
    eyes: null as HTMLImageElement | null,
    nose: null as HTMLImageElement | null,
    mouth: null as HTMLImageElement | null,
    hairPart: null as Part | null,
  });
  const liveAdjustRef = useRef<Record<PartKind, Adjust> | null>(null);
  const holdingRef = useRef(false);
  const exportingRef = useRef(false);
  const motionRef = useRef(true);
  const gestureRef = useRef<Gesture | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const boxesRef = useRef<PieceBox[]>([]);
  const viewRef = useRef<StageView>({ zoom: 1, focusY: STAGE_H * 0.42 });
  const dotRef = useRef<HTMLButtonElement>(null);
  const paintRef = useRef<(phase: number) => void>(() => {});

  lookRef.current = look;
  if (tab !== "glasses") tabRef.current = tab;
  toneRef.current = bodyTone;
  partsRef.current = parts;

  useEffect(() => {
    const saved = loadLook();
    const written = seedName.trim();
    setLook(written ? { ...saved, name: written } : saved);
    setReady(true);
    // The written name is fixed before this screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(look));
    }, 180);
    return () => window.clearTimeout(t);
  }, [look, ready]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      motionRef.current = !mq.matches;
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(previewAssetUrl("/dressup/catalog.json"))
      .then((r) => {
        if (!r.ok) throw new Error("Could not load the pictures.");
        return r.json() as Promise<Part[]>;
      })
      .then((data) => {
        if (alive) {
          setParts(data.map((part) => ({ ...part, src: previewAssetUrl(part.src) })));
        }
      })
      .catch(() => {
        if (alive) setError("The picture pieces did not load. Try again in a moment.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const byId = new Map<string, Part>();
  parts?.forEach((p) => byId.set(p.id, p));

  useEffect(() => {
    const tone = look.body ? byId.get(look.body)?.tone : undefined;
    if (tone) setBodyTone(tone);
  }, [look.body, parts]);

  const body = useSprite(look.body ? (byId.get(look.body)?.src ?? null) : null);
  const head = useSprite(look.head ? (byId.get(look.head)?.src ?? null) : null);
  const hairPart = look.hair ? (byId.get(look.hair) ?? null) : null;
  const hair = useSprite(hairPart?.src ?? null);
  const eyes = useSprite(look.eyes ? (byId.get(look.eyes)?.src ?? null) : null);
  const nose = useSprite(look.nose ? (byId.get(look.nose)?.src ?? null) : null);
  const mouth = useSprite(look.mouth ? (byId.get(look.mouth)?.src ?? null) : null);

  imagesRef.current = { body, head, hair, eyes, nose, mouth, hairPart };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = STAGE_W * dpr;
    canvas.height = STAGE_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const paint = (phase: number) => {
      const imgs = imagesRef.current;
      const current = lookRef.current;
      const kind = tabRef.current;
      const upper = kind !== "body";
      const aimZoom = viewZoom(kind);
      const aimY = upper ? STAGE_H * 0.4 : STAGE_H * 0.5;
      const ease = motionRef.current ? 0.2 : 1;
      const view = viewRef.current;
      view.zoom += (aimZoom - view.zoom) * ease;
      view.focusY += (aimY - view.focusY) * ease;
      const scene = paintPerson(
        ctx,
        {
          body: imgs.body,
          head: imgs.head,
          hair: imgs.hair,
          eyes: imgs.eyes,
          nose: imgs.nose,
          mouth: imgs.mouth,
          hairPart: imgs.hairPart,
          glasses: current.glasses,
          skin: current.skin,
          name: current.name,
          adjust: liveAdjustRef.current ?? current.adjust,
        },
        phase,
        view,
        exportingRef.current || partId(current, kind) === null ? null : kind,
      );
      boxesRef.current = scene.boxes;
      const dot = dotRef.current;
      const guided = scene.boxes.find((item: PieceBox) => item.kind === kind);
      if (dot) {
        if (!guided || exportingRef.current || partId(current, kind) === null) {
          dot.hidden = true;
        } else {
          dot.hidden = false;
          dot.style.left = `${(guided.hx / STAGE_W) * 100}%`;
          dot.style.top = `${(guided.hy / STAGE_H) * 100}%`;
        }
      }
    };
    paintRef.current = paint;

    let raf = 0;
    let phase = 0;
    let last = performance.now();
    let running = true;
    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (holdingRef.current || !motionRef.current || document.hidden) phase = 0;
      else phase += dt * 2.15;
      paint(phase);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  const slots = parts && tab !== "glasses" ? slotsFor(parts, tab, bodyTone) : [];
  const selectedId = tab === "glasses" ? look.glasses : partId(look, tab);
  const selectedIndex = tab === "glasses"
    ? GLASSES.findIndex((item) => item.id === look.glasses)
    : slots.findIndex((s) => s.id === selectedId);
  const choiceCount = tab === "glasses" ? GLASSES.length : slots.length;
  const place = selectedIndex >= 0 ? selectedIndex + 1 : 1;
  const tabLabel = TABS.find((t) => t.id === tab)?.label ?? "Piece";
  const pieceOn = selectedId !== null;
  const sizeLabel = tab === "glasses" ? "" : `${Math.round(clampAdjust(look.adjust[tab]).s * 100)}%`;

  useEffect(() => {
    const root = reelRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>("[data-on='true']");
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [tab, bodyTone, selectedId, parts]);

  function step(dir: -1 | 1) {
    if (tab === "glasses") {
      const index = GLASSES.findIndex((item) => item.id === look.glasses);
      const next = GLASSES[(index + dir + GLASSES.length) % GLASSES.length]!;
      setLook((prev) => ({ ...prev, glasses: next.id }));
      return;
    }
    const catalog = partsRef.current;
    if (!catalog) return;
    const kind = tabRef.current;
    const nextSlots = slotsFor(catalog, kind, toneRef.current);
    setLook((prev) => withPart(prev, kind, cycleId(nextSlots, partId(prev, kind), dir)));
  }

  function centrePiece() {
    const kind = tabRef.current;
    setLook((prev) => ({
      ...prev,
      adjust: { ...prev.adjust, [kind]: { x: 0, y: 0, s: 1 } },
    }));
  }

  function scaledSize(start: number, dist: number, startDist: number) {
    const safe = Math.max(72, startDist);
    return start * (1 + ((dist - startDist) / safe) * 0.9);
  }

  function stagePoint(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * STAGE_W,
      y: ((clientY - rect.top) / rect.height) * STAGE_H,
    };
  }

  function hitHandle(p: { x: number; y: number }) {
    const box = boxesRef.current.find((item) => item.kind === tabRef.current);
    if (!box || partId(lookRef.current, tabRef.current) === null) return false;
    return Math.hypot(p.x - box.hx, p.y - box.hy) <= 30;
  }

  function applyGesture(clientX: number, clientY: number) {
    const gesture = gestureRef.current;
    if (!gesture) return;
    const current = lookRef.current.adjust;
    if (gesture.mode === "pinch") {
      const pts = [...pointersRef.current.values()];
      if (pts.length < 2) return;
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) || 1;
      liveAdjustRef.current = {
        ...current,
        [gesture.kind]: clampAdjust({ ...gesture.start, s: scaledSize(gesture.start.s, dist, gesture.startDist) }),
      };
      return;
    }
    if (gesture.mode === "scale") {
      const p = stagePoint(clientX, clientY);
      const dist = Math.hypot(p.x - gesture.cx, p.y - gesture.cy) || 1;
      liveAdjustRef.current = {
        ...current,
        [gesture.kind]: clampAdjust({ ...gesture.start, s: scaledSize(gesture.start.s, dist, gesture.startDist) }),
      };
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const zoom = Math.max(0.8, viewRef.current.zoom);
    let dx = ((clientX - gesture.sx) / rect.width) * STAGE_W / zoom;
    let dy = ((clientY - gesture.sy) / rect.height) * STAGE_H / zoom;
    dx *= 0.72;
    dy *= 0.72;
    liveAdjustRef.current = {
      ...current,
      [gesture.kind]: clampAdjust({
        x: gesture.start.x + dx,
        y: gesture.start.y + dy,
        s: gesture.start.s,
      }),
    };
  }

  function snapshotLook(): Look {
    const pending = liveAdjustRef.current;
    const adjust = freshAdjust();
    (Object.keys(adjust) as PartKind[]).forEach((kind) => {
      adjust[kind] = clampAdjust(pending?.[kind] ?? look.adjust[kind]);
    });
    return { ...look, adjust };
  }

  function restartPerson() {
    liveAdjustRef.current = null;
    setLook((prev) => ({ ...defaultLook(), name: prev.name, skin: prev.skin }));
    setTab("head");
  }

  function thisIsMe() {
    if (!lookRef.current.head) return;
    onDone(snapshotLook());
  }

  function surprise() {
    if (!parts) return;
    const choose = (kind: PartKind) => {
      const pool = parts.filter((p) => p.kind === kind);
      return pool[Math.floor(Math.random() * pool.length)]!;
    };
    const bodyPart = choose("body");
    const skin = SKINS[Math.floor(Math.random() * SKINS.length)]!.hex;
    liveAdjustRef.current = null;
    setLook((prev) => ({
      ...prev,
      head: choose("head").id,
      hair: Math.random() < 0.82 ? choose("hair").id : null,
      eyes: choose("eyes").id,
      nose: choose("nose").id,
      mouth: choose("mouth").id,
      body: bodyPart.id,
      glasses: Math.random() < 0.5 ? GLASSES[1 + Math.floor(Math.random() * (GLASSES.length - 1))]!.id : null,
      skin,
      adjust: freshAdjust(),
    }));
  }

  function onDotDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const kind = tabRef.current;
    if (partId(lookRef.current, kind) === null) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    const point = stagePoint(e.clientX, e.clientY);
    const box = boxesRef.current.find((item) => item.kind === kind);
    const cx = box ? box.x + box.w / 2 : point.x;
    const cy = box ? box.y + box.h / 2 : point.y;
    const start = liveAdjustRef.current?.[kind] ?? clampAdjust(lookRef.current.adjust[kind]);
    gestureRef.current = {
      mode: "scale",
      pointerId: e.pointerId,
      kind,
      start,
      sx: e.clientX,
      sy: e.clientY,
      startDist: Math.max(120, Math.hypot(point.x - cx, point.y - cy)),
      cx,
      cy,
    };
    holdingRef.current = true;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    const point = stagePoint(e.clientX, e.clientY);

    if (pointersRef.current.size >= 2 && partId(lookRef.current, tabRef.current) !== null) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) || 1;
      const kind = gestureRef.current?.kind ?? tabRef.current;
      const start = liveAdjustRef.current?.[kind] ?? clampAdjust(lookRef.current.adjust[kind]);
      gestureRef.current = {
        mode: "pinch",
        pointerId: e.pointerId,
        kind,
        start,
        sx: 0,
        sy: 0,
        startDist: dist,
        cx: 0,
        cy: 0,
      };
      holdingRef.current = true;
      return;
    }

    if (hitHandle(point)) {
      const box = boxesRef.current.find((item) => item.kind === tabRef.current);
      if (!box) return;
      const start = clampAdjust(lookRef.current.adjust[tabRef.current]);
      gestureRef.current = {
        mode: "scale",
        pointerId: e.pointerId,
        kind: tabRef.current,
        start,
        sx: e.clientX,
        sy: e.clientY,
        startDist: Math.hypot(point.x - (box.x + box.w / 2), point.y - (box.y + box.h / 2)) || 1,
        cx: box.x + box.w / 2,
        cy: box.y + box.h / 2,
      };
      holdingRef.current = true;
      return;
    }

    const kind = tabRef.current;
    if (partId(lookRef.current, kind) === null) return;
    const start = clampAdjust(lookRef.current.adjust[kind]);
    gestureRef.current = {
      mode: "move",
      pointerId: e.pointerId,
      kind,
      start,
      sx: e.clientX,
      sy: e.clientY,
      startDist: 1,
      cx: 0,
      cy: 0,
    };
    holdingRef.current = true;
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const gesture = gestureRef.current;
    if (!gesture) return;
    if (gesture.mode !== "pinch" && gesture.pointerId !== e.pointerId) return;
    applyGesture(e.clientX, e.clientY);
  }

  function onPointerUp(e: React.PointerEvent<HTMLElement>) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size > 0) {
      if (gestureRef.current?.mode === "pinch") gestureRef.current = null;
      return;
    }
    gestureRef.current = null;
    holdingRef.current = false;
    const pending = liveAdjustRef.current;
    liveAdjustRef.current = null;
    if (pending) setLook((prev) => ({ ...prev, adjust: pending }));
  }

  return (
    <main className="layout">
      <section className="stage-col">
        <header className="slot-head mb-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="bulb-row">
              <span className="bulb bulb-coral" />
              <span className="bulb" />
              <span className="bulb bulb-coral" />
              <p className="font-sans text-xs font-extrabold tracking-widest text-coral uppercase">Dress-up</p>
            </div>
            {onBack ? (
              <button type="button" className="tune-btn font-sans text-sm" onClick={onBack}>
                Back
              </button>
            ) : (
              <span />
            )}
          </div>
          <h1 className="font-display text-4xl text-ink">Make you!</h1>
          <p className="lede mt-2 max-w-md text-base text-muted">
            Start with a head. Drag a piece, or pull the dot, to place it. Then pick a background.
          </p>
        </header>

        <div className="slot-stage stage-wrap">
          <div className="cabinet">
            <span className="rivet rivet-tl" />
            <span className="rivet rivet-tr" />
            <span className="rivet rivet-bl" />
            <span className="rivet rivet-br" />
            <div className="cabinet-screen">
              <canvas
                ref={canvasRef}
                width={STAGE_W}
                height={STAGE_H}
                className="stage-canvas"
                aria-label="Your person in the park. Tap a piece to grab it, drag to move it, and pinch or pull the dot to scale it."
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
              <button
                ref={dotRef}
                type="button"
                className="grab-dot"
                hidden
                aria-label="Pull to change the size of this piece"
                onPointerDown={onDotDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            </div>
          </div>
          <button
            type="button"
            className="toy-arrow toy-arrow-left"
            aria-label={`Previous ${tabLabel.toLowerCase()}`}
            disabled={!parts}
            onClick={() => step(-1)}
          >
            <ChevronLeft className="size-7" aria-hidden />
          </button>
          <button
            type="button"
            className="toy-arrow toy-arrow-right"
            aria-label={`Next ${tabLabel.toLowerCase()}`}
            disabled={!parts}
            onClick={() => step(1)}
          >
            <ChevronRight className="size-7" aria-hidden />
          </button>
        </div>

        <div className="slot-actions">
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={restartPerson} className="toy-go toy-ghost">
            Restart
          </button>
          <button type="button" onClick={surprise} disabled={!parts} className="toy-go toy-ghost">
            <Shuffle className="size-5" aria-hidden />
            Surprise me
          </button>
          <button
            type="button"
            onClick={thisIsMe}
            disabled={!parts || !look.head}
            className="toy-go col-span-2"
          >
            This is me
          </button>
          {!look.head ? (
            <p className="col-span-2 text-center font-sans text-sm font-extrabold text-muted">Choose a head first.</p>
          ) : null}
        </div>
        </div>
      </section>

      <section className="console min-w-0">
        {error ? <p className="console-card mb-3 text-ink">{error}</p> : null}

        <div className="slot-pick">
          <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Piece to change">
            {TABS.map((item) => {
              const on = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  data-on={on ? "true" : "false"}
                  onClick={() => setTab(item.id)}
                  className="toy-tab font-sans text-base"
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {!parts ? (
            <p className="font-sans text-base font-bold text-muted">Lining up the pictures…</p>
          ) : (
            <>
              {tab === "body" ? (
                <div className="mb-3 flex gap-2" role="group" aria-label="Body tone">
                  <button
                    type="button"
                    data-on={bodyTone === "light" ? "true" : "false"}
                    onClick={() => setBodyTone("light")}
                    className="toy-tab font-sans text-base"
                  >
                    Lighter
                  </button>
                  <button
                    type="button"
                    data-on={bodyTone === "deep" ? "true" : "false"}
                    onClick={() => setBodyTone("deep")}
                    className="toy-tab font-sans text-base"
                  >
                    Deeper
                  </button>
                </div>
              ) : null}

              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="font-sans text-base font-extrabold text-ink">
                  {selectedId === null ? `No ${tabLabel.toLowerCase()}` : tabLabel}
                </h2>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="font-sans text-sm font-extrabold text-coral disabled:opacity-40"
                    disabled={!pieceOn}
                    onClick={centrePiece}
                  >
                    Reset place
                  </button>
                  <p className="font-sans text-sm font-extrabold text-muted" aria-live="polite">
                    {selectedIndex >= 0 ? `${place} of ${choiceCount}` : `${choiceCount} in this set`}
                    {pieceOn ? ` · ${sizeLabel}` : ""}
                  </p>
                </div>
              </div>

              <div
                ref={reelRef}
                className="reel"
                role="group"
                aria-label={`${tabLabel} choices`}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    step(-1);
                  } else if (e.key === "ArrowRight") {
                    e.preventDefault();
                    step(1);
                  }
                }}
              >
                {tab === "glasses"
                  ? GLASSES.map((item) => {
                      const on = item.id === look.glasses;
                      const round = item.id?.startsWith("round");
                      const blue = item.id?.endsWith("blue");
                      return (
                        <button
                          key={item.id ?? "none"}
                          type="button"
                          data-on={on ? "true" : "false"}
                          aria-label={item.label}
                          aria-pressed={on}
                          onClick={() => setLook((prev) => ({ ...prev, glasses: item.id }))}
                          className="reel-item font-sans text-sm"
                        >
                          {item.id ? (
                            <span className={round ? "specs specs-round" : "specs"} aria-hidden>
                              <i style={{ borderColor: blue ? "#2f62d6" : "#1a120e" }} />
                              <i style={{ borderColor: blue ? "#2f62d6" : "#1a120e" }} />
                            </span>
                          ) : (
                            "None"
                          )}
                        </button>
                      );
                    })
                  : slots.map((slot, index) => {
                  const on = slot.id === selectedId;
                  return (
                    <button
                      key={slot.id ?? "none"}
                      type="button"
                      data-on={on ? "true" : "false"}
                      aria-label={slot.part ? `${tabLabel} ${index + 1}` : `No ${tabLabel.toLowerCase()}`}
                      aria-pressed={on}
                      onClick={() => setLook((prev) => withPart(prev, tab, slot.id))}
                      className="reel-item font-sans text-sm"
                    >
                      {slot.part ? (
                        tab === "body" ? (
                          <BodyThumb src={slot.part.src} skin={look.skin} />
                        ) : (
                          <img src={slot.part.src} alt="" className="max-h-full max-w-full object-contain" draggable={false} />
                        )
                      ) : (
                        "None"
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="slot-tools mt-3">
          <div className="console-card">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="font-sans text-base font-extrabold text-ink">Skin colour</h2>
              <label className="inline-flex items-center gap-2 font-sans text-sm font-extrabold text-muted">
                Any colour
                <input
                  type="color"
                  value={toColorInput(look.skin)}
                  onChange={(e) => setLook((prev) => ({ ...prev, skin: e.target.value }))}
                  aria-label="Choose any skin colour"
                  className="colour-input"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {SKINS.map((swatch) => {
                const on = look.skin.toLowerCase() === swatch.hex.toLowerCase();
                return (
                  <button
                    key={swatch.hex}
                    type="button"
                    aria-label={swatch.label}
                    aria-pressed={on}
                    data-on={on ? "true" : "false"}
                    onClick={() => setLook((prev) => ({ ...prev, skin: swatch.hex }))}
                    className="swatch"
                    style={{ backgroundColor: swatch.hex }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
