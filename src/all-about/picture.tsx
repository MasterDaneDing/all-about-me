import { useEffect, useRef, useState } from "react";
import type { Look, Part } from "@/lib/dress/types";
import { previewAssetUrl } from "@/lib/preview-path-prefix";
import {
  CRAYONS,
  PICTURE_H,
  PICTURE_W,
  SCENES,
  type DrawLayer,
  type SceneId,
  type Stroke,
} from "./model";
import { personPixels, renderPerson } from "./person";

function cover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const ratio = image.width / image.height;
  const frame = width / height;
  let dw = width;
  let dh = height;
  let dx = 0;
  let dy = 0;
  if (ratio > frame) {
    dh = height;
    dw = height * ratio;
    dx = (width - dw) / 2;
  } else {
    dw = width;
    dh = width / ratio;
    dy = (height - dh) / 2;
  }
  ctx.drawImage(image, dx, dy, dw, dh);
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, height: number) {
  const points = stroke.points;
  if (points.length === 0) return;
  const width =
    (stroke.tool === "pen" ? 0.012 : stroke.tool === "marker" ? 0.036 : 0.055) * height;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = width;
  if (stroke.tool === "erase") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.fillStyle = "rgba(0,0,0,1)";
  } else {
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
  }
  const x = (point: { x: number; y: number }) => point.x * PICTURE_W;
  const y = (point: { x: number; y: number }) => point.y * PICTURE_H;
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(x(points[0]!), y(points[0]!), width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x(points[0]!), y(points[0]!));
  for (let i = 1; i < points.length - 1; i += 1) {
    const next = points[i + 1]!;
    const current = points[i]!;
    ctx.quadraticCurveTo(x(current), y(current), x(next) * 0.5 + x(current) * 0.5, y(next) * 0.5 + y(current) * 0.5);
  }
  const last = points[points.length - 1]!;
  ctx.lineTo(x(last), y(last));
  ctx.stroke();
  ctx.restore();
}

export function paintPicture(
  sceneCtx: CanvasRenderingContext2D,
  backCtx: CanvasRenderingContext2D,
  frontCtx: CanvasRenderingContext2D,
  background: HTMLImageElement | null,
  person: HTMLCanvasElement | null,
  strokes: Stroke[],
) {
  sceneCtx.clearRect(0, 0, PICTURE_W, PICTURE_H);
  if (background) cover(sceneCtx, background, PICTURE_W, PICTURE_H);
  else {
    sceneCtx.fillStyle = "#ffffff";
    sceneCtx.fillRect(0, 0, PICTURE_W, PICTURE_H);
  }

  backCtx.clearRect(0, 0, PICTURE_W, PICTURE_H);
  for (const stroke of strokes) {
    if (stroke.layer === "back") drawStroke(backCtx, stroke, PICTURE_H);
  }
  if (person) {
    const box = personPixels(person);
    const side = 36;
    const maxW = PICTURE_W - side * 2;
    const maxH = PICTURE_H * 0.9;
    const scale = Math.min(maxW / box.w, maxH / box.h);
    const dw = box.w * scale;
    const dh = box.h * scale;
    const dx = (PICTURE_W - dw) / 2;
    const dy = PICTURE_H - dh;
    backCtx.drawImage(person, box.x, box.y, box.w, box.h, dx, dy, dw, dh);
  }

  frontCtx.clearRect(0, 0, PICTURE_W, PICTURE_H);
  for (const stroke of strokes) {
    if (stroke.layer !== "back") drawStroke(frontCtx, stroke, PICTURE_H);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(src));
    image.src = src;
  });
}

export function PictureFrame({
  look,
  parts,
  scene,
  strokes,
  drawing,
  layer = "front",
  tool = "marker",
  color = "#d8442c",
  onStroke,
}: {
  look: Look;
  parts: Part[];
  scene: SceneId;
  strokes: Stroke[];
  drawing?: boolean;
  layer?: DrawLayer;
  tool?: Stroke["tool"];
  color?: string;
  onStroke?: (stroke: Stroke) => void;
}) {
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const personRef = useRef<HTMLCanvasElement | null>(null);
  const bgRef = useRef<HTMLImageElement | null>(null);
  const strokesRef = useRef(strokes);
  const liveRef = useRef<Stroke | null>(null);
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const layerRef = useRef(layer);
  strokesRef.current = strokes;
  toolRef.current = tool;
  colorRef.current = color;
  layerRef.current = layer;

  function redraw() {
    const sceneCtx = sceneRef.current?.getContext("2d");
    const backCtx = backRef.current?.getContext("2d");
    const frontCtx = frontRef.current?.getContext("2d");
    if (!sceneCtx || !backCtx || !frontCtx) return;
    const marks = liveRef.current ? [...strokesRef.current, liveRef.current] : strokesRef.current;
    paintPicture(sceneCtx, backCtx, frontCtx, bgRef.current, personRef.current, marks);
  }

  useEffect(() => {
    let alive = true;
    renderPerson(look, parts).then((canvas) => {
      if (!alive) return;
      personRef.current = canvas;
      redraw();
    });
    return () => {
      alive = false;
    };
    // The look object is replaced as a whole when the pupil leaves the dress-up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look, parts]);

  useEffect(() => {
    let alive = true;
    const chosen = SCENES.find((item) => item.id === scene);
    if (!chosen || !("src" in chosen) || !chosen.src) {
      bgRef.current = null;
      redraw();
      return;
    }
    loadImage(previewAssetUrl(chosen.src))
      .then((image) => {
        if (!alive) return;
        bgRef.current = image;
        redraw();
      })
      .catch(() => {
        if (!alive) return;
        bgRef.current = null;
        redraw();
      });
    return () => {
      alive = false;
    };
  }, [scene]);

  useEffect(() => {
    redraw();
  }, [strokes]);

  function pointOf(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  function onDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing || !onStroke) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    liveRef.current = {
      tool: toolRef.current,
      color: colorRef.current,
      layer: layerRef.current,
      points: [pointOf(event)],
    };
    redraw();
  }

  function onMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const live = liveRef.current;
    if (!live) return;
    const next = pointOf(event);
    const last = live.points[live.points.length - 1]!;
    if (Math.hypot(next.x - last.x, next.y - last.y) < 0.004) return;
    live.points.push(next);
    redraw();
  }

  function onUp() {
    const live = liveRef.current;
    liveRef.current = null;
    if (live && live.points.length > 0) onStroke?.(live);
    else redraw();
  }

  return (
    <div className="picture-frame" data-draw={drawing ? "true" : "false"}>
      <canvas ref={sceneRef} width={PICTURE_W} height={PICTURE_H} aria-hidden />
      <canvas ref={backRef} width={PICTURE_W} height={PICTURE_H} aria-hidden />
      <canvas
        ref={frontRef}
        width={PICTURE_W}
        height={PICTURE_H}
        aria-label="Draw behind your person, or in front"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
    </div>
  );
}

export function PictureStudio({
  look,
  parts,
  scene,
  strokes,
  onScene,
  onStrokes,
}: {
  look: Look;
  parts: Part[];
  scene: SceneId;
  strokes: Stroke[];
  onScene: (scene: SceneId) => void;
  onStrokes: (strokes: Stroke[]) => void;
}) {
  const [tool, setTool] = useState<Stroke["tool"]>("marker");
  const [color, setColor] = useState<string>(CRAYONS[0]!.hex);
  const [layer, setLayer] = useState<DrawLayer>("front");
  const layerMarks = strokes.filter((stroke) => stroke.layer === layer);

  return (
    <div className="grid gap-3">
      <h2 className="text-center font-display text-3xl text-ink">Draw on your picture</h2>
      <p className="text-center font-sans font-bold text-muted">
        Behind goes under you. In front goes on top. Your feet stay on the ground.
      </p>
      <PictureFrame
        look={look}
        parts={parts}
        scene={scene}
        strokes={strokes}
        drawing
        layer={layer}
        tool={tool}
        color={color}
        onStroke={(stroke) => onStrokes([...strokes, stroke])}
      />
      <div className="flex gap-2 overflow-x-auto pb-1" role="listbox" aria-label="Background">
        {SCENES.map((item) => (
          <button
            key={item.id}
            type="button"
            className="scene-chip"
            data-on={scene === item.id ? "true" : "false"}
            aria-selected={scene === item.id}
            onClick={() => onScene(item.id)}
          >
            {"src" in item && item.src ? (
              <img src={previewAssetUrl(item.src)} alt="" />
            ) : (
              <span className="scene-swatch" />
            )}
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Drawing layer">
        <button type="button" className="toy-tab font-sans text-base" data-on={layer === "back" ? "true" : "false"} aria-pressed={layer === "back"} onClick={() => setLayer("back")}>
          Behind
        </button>
        <button type="button" className="toy-tab font-sans text-base" data-on={layer === "front" ? "true" : "false"} aria-pressed={layer === "front"} onClick={() => setLayer("front")}>
          In front
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" className="toy-tab font-sans text-base" data-on={tool === "pen" ? "true" : "false"} onClick={() => setTool("pen")}>
          Pen
        </button>
        <button type="button" className="toy-tab font-sans text-base" data-on={tool === "marker" ? "true" : "false"} onClick={() => setTool("marker")}>
          Marker
        </button>
        <button type="button" className="toy-tab font-sans text-base" data-on={tool === "erase" ? "true" : "false"} onClick={() => setTool("erase")}>
          Eraser
        </button>
        <button type="button" className="toy-go toy-ghost w-auto px-4" disabled={strokes.length === 0} onClick={() => onStrokes(strokes.slice(0, -1))}>
          Undo
        </button>
        <button type="button" className="toy-go toy-ghost w-auto px-4" disabled={layerMarks.length === 0} onClick={() => onStrokes(strokes.filter((stroke) => stroke.layer !== layer))}>
          {layer === "back" ? "Clear behind" : "Clear front"}
        </button>
      </div>
      <div className="flex flex-wrap justify-center gap-2" role="listbox" aria-label="Colour">
        {CRAYONS.map((crayon) => (
          <button
            key={crayon.id}
            type="button"
            className="crayon"
            style={{ background: crayon.hex }}
            data-on={color === crayon.hex ? "true" : "false"}
            aria-label={crayon.id}
            aria-pressed={color === crayon.hex}
            onClick={() => setColor(crayon.hex)}
          />
        ))}
      </div>
    </div>
  );
}
