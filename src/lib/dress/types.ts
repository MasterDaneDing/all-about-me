export type PartKind = "head" | "hair" | "eyes" | "nose" | "mouth" | "body";

export type Frame = { x: number; y: number; w: number; h: number };

export type Part = {
  id: string;
  kind: PartKind;
  src: string;
  w: number;
  h: number;
  tone?: "light" | "deep";
  scarf?: boolean;
  frame?: Frame;
};

export type Adjust = { x: number; y: number; s: number };

export type Glasses = "round-black" | "round-blue" | "square-black" | "square-blue";

export type Look = {
  head: string | null;
  hair: string | null;
  eyes: string | null;
  nose: string | null;
  mouth: string | null;
  body: string | null;
  glasses: Glasses | null;
  skin: string;
  name: string;
  adjust: Record<PartKind, Adjust>;
};

export function freshAdjust(): Record<PartKind, Adjust> {
  return {
    head: { x: 0, y: 0, s: 1 },
    hair: { x: 0, y: 0, s: 1 },
    eyes: { x: 0, y: 0, s: 1 },
    nose: { x: 0, y: 0, s: 1 },
    mouth: { x: 0, y: 0, s: 1 },
    body: { x: 0, y: 0, s: 1 },
  };
}

export function clampAdjust(a: Partial<Adjust> | null | undefined): Adjust {
  const s = typeof a?.s === "number" && Number.isFinite(a.s) ? a.s : 1;
  const x = typeof a?.x === "number" && Number.isFinite(a.x) ? a.x : 0;
  const y = typeof a?.y === "number" && Number.isFinite(a.y) ? a.y : 0;
  return {
    x: Math.min(220, Math.max(-220, x)),
    y: Math.min(260, Math.max(-260, y)),
    s: Math.min(2.4, Math.max(0.2, s)),
  };
}

export function partId(look: Look, kind: PartKind): string | null {
  switch (kind) {
    case "head":
      return look.head;
    case "hair":
      return look.hair;
    case "eyes":
      return look.eyes;
    case "nose":
      return look.nose;
    case "mouth":
      return look.mouth;
    case "body":
      return look.body;
  }
}

export function withPart(look: Look, kind: PartKind, id: string | null): Look {
  if (kind === "head") return { ...look, head: id };
  if (kind === "body") return { ...look, body: id };
  if (kind === "hair") return { ...look, hair: id };
  if (kind === "eyes") return { ...look, eyes: id };
  if (kind === "nose") return { ...look, nose: id };
  return { ...look, mouth: id };
}
