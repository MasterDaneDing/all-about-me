import { freshAdjust, type Look } from "@/lib/dress/types";

export type Answers = {
  name: string;
  subject: string;
  am: string;
  but: string;
  activity: string;
  want: string;
  is: string;
  think: string;
};

export type Point = { x: number; y: number };

export type DrawLayer = "back" | "front";

export type Stroke = {
  tool: "pen" | "marker" | "erase";
  color: string;
  points: Point[];
  layer: DrawLayer;
};

export const SCENES = [
  { id: "white", label: "White" },
  { id: "volcano", label: "Volcano", src: "/scenes/volcano.jpg" },
  { id: "snow", label: "Snow", src: "/scenes/snow.jpg" },
  { id: "bedroom", label: "Bedroom", src: "/scenes/bedroom.jpg" },
  { id: "school", label: "School", src: "/scenes/school.jpg" },
  { id: "market", label: "Market", src: "/scenes/market.jpg" },
  { id: "trail", label: "Trail", src: "/scenes/trail.jpg" },
  { id: "sea", label: "Sea", src: "/scenes/sea.jpg" },
] as const;

export type SceneId = (typeof SCENES)[number]["id"];

export type BlankKey = keyof Answers;

export type Chunk = { kind: "text"; text: string } | { kind: "blank"; key: BlankKey; label: string };

export const SENTENCES: { title: string; chunks: Chunk[] }[] = [
  {
    title: "My name",
    chunks: [
      { kind: "text", text: "My name is " },
      { kind: "blank", key: "name", label: "Your name" },
      { kind: "text", text: "." },
    ],
  },
  {
    title: "My subject",
    chunks: [
      { kind: "text", text: "My favourite subject is " },
      { kind: "blank", key: "subject", label: "Your favourite subject" },
      { kind: "text", text: "." },
    ],
  },
  {
    title: "I am",
    chunks: [
      { kind: "text", text: "I am " },
      { kind: "blank", key: "am", label: "How you are" },
      { kind: "text", text: " but " },
      { kind: "blank", key: "but", label: "What you still do" },
      { kind: "text", text: "." },
    ],
  },
  {
    title: "My activity",
    chunks: [
      { kind: "text", text: "My favourite activity is " },
      { kind: "blank", key: "activity", label: "Your favourite activity" },
      { kind: "text", text: "." },
    ],
  },
  {
    title: "I want to try",
    chunks: [
      { kind: "text", text: "I want to try " },
      { kind: "blank", key: "want", label: "What you want to try" },
      { kind: "text", text: "." },
    ],
  },
  {
    title: "I think",
    chunks: [
      { kind: "text", text: "It is " },
      { kind: "blank", key: "is", label: "What it is like" },
      { kind: "text", text: " but I think it is " },
      { kind: "blank", key: "think", label: "What you think" },
      { kind: "text", text: "!" },
    ],
  },
];

export const LINE = "_____________";

export const CRAYONS = [
  { id: "red", hex: "#d8442c" },
  { id: "orange", hex: "#ef7d2a" },
  { id: "yellow", hex: "#f2c14e" },
  { id: "green", hex: "#3e9a4c" },
  { id: "blue", hex: "#2f62d6" },
  { id: "purple", hex: "#7a4db5" },
  { id: "brown", hex: "#8b5a34" },
  { id: "ink", hex: "#241910" },
] as const;

export const PICTURE_W = 800;
export const PICTURE_H = 1200;

export function emptyLook(): Look {
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

export function emptyAnswers(): Answers {
  return {
    name: "",
    subject: "",
    am: "",
    but: "",
    activity: "",
    want: "",
    is: "",
    think: "",
  };
}

export type Sheet = {
  step: number;
  look: Look;
  scene: SceneId;
  strokes: Stroke[];
  answers: Answers;
};

/** Writing first, then the person, then the background, then the finished page. */
export const DRESS_STEP = SENTENCES.length;
export const PICTURE_STEP = SENTENCES.length + 1;
export const POSTER_STEP = SENTENCES.length + 2;

export function initialSheet(): Sheet {
  return {
    step: 0,
    look: emptyLook(),
    scene: "white",
    strokes: [],
    answers: emptyAnswers(),
  };
}

const STORAGE_KEY = "all-about-me-v2";

export function readSheet(): Sheet {
  const base = initialSheet();
  if (typeof window === "undefined") return base;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Sheet>;
    const step = Number(parsed.step);
    const scene = SCENES.some((item) => item.id === parsed.scene) ? (parsed.scene as SceneId) : "white";
    return {
      step: Number.isFinite(step) ? Math.min(POSTER_STEP, Math.max(0, step)) : 0,
      look: parsed.look?.adjust ? { ...emptyLook(), ...parsed.look } : base.look,
      scene,
      strokes: Array.isArray(parsed.strokes)
        ? parsed.strokes.map((stroke) => ({
            ...stroke,
            layer: stroke.layer === "back" ? "back" : "front",
          }))
        : [],
      answers: { ...emptyAnswers(), ...parsed.answers },
    };
  } catch {
    return base;
  }
}

export function writeSheet(sheet: Sheet) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sheet));
  } catch {
    /* A very long drawing can exceed the browser store. The page still works. */
  }
}

export function wordOrLine(value: string): { filled: boolean; text: string } {
  const text = value.trim();
  return text ? { filled: true, text } : { filled: false, text: LINE };
}
