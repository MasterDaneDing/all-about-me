import { paintPerson, STAGE_H, STAGE_W } from "@/lib/dress/paint";
import type { Look, Part } from "@/lib/dress/types";

export type PixelBox = { x: number; y: number; w: number; h: number };

const pixels = new WeakMap<HTMLCanvasElement, PixelBox>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(src));
    image.src = src;
  });
}

function rememberPixels(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;
  let top = h;
  let bottom = -1;
  let left = w;
  let right = -1;
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      if (data[(row + x) * 4 + 3]! > 20) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (bottom < 0) return;
  pixels.set(canvas, { x: left, y: top, w: right - left + 1, h: bottom - top + 1 });
}

export function personPixels(canvas: HTMLCanvasElement): PixelBox {
  return pixels.get(canvas) ?? { x: 0, y: 0, w: canvas.width, h: canvas.height };
}

export async function renderPerson(look: Look, parts: Part[]): Promise<HTMLCanvasElement> {
  const byId = new Map(parts.map((part) => [part.id, part]));
  const srcOf = (id: string | null) => (id ? (byId.get(id)?.src ?? null) : null);
  const loaded = await Promise.all(
    [look.body, look.head, look.hair, look.eyes, look.nose, look.mouth].map((id) => {
      const src = srcOf(id);
      return src ? loadImage(src).catch(() => null) : Promise.resolve(null);
    }),
  );
  const [body, head, hair, eyes, nose, mouth] = loaded;
  const canvas = document.createElement("canvas");
  canvas.width = STAGE_W;
  canvas.height = STAGE_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  paintPerson(
    ctx,
    {
      body,
      head,
      hair,
      eyes,
      nose,
      mouth,
      hairPart: look.hair ? (byId.get(look.hair) ?? null) : null,
      glasses: look.glasses,
      skin: look.skin,
      name: "",
      adjust: look.adjust,
    },
    0,
    { zoom: 1, focusY: STAGE_H * 0.42 },
    null,
    true,
  );
  rememberPixels(canvas);
  return canvas;
}
