import { useEffect, useState } from "react";
import { previewAssetUrl } from "@/lib/preview-path-prefix";
import type { Part } from "@/lib/dress/types";
import { DressUp } from "@/components/dress-up";
import {
  DRESS_STEP,
  PICTURE_STEP,
  POSTER_STEP,
  SENTENCES,
  initialSheet,
  readSheet,
  wordOrLine,
  writeSheet,
  type Answers,
  type Sheet,
} from "./model";
import { PictureFrame, PictureStudio } from "./picture";
import { giveToMrDane, teacherWordOk } from "./hand-in";
import { buildPosterPdf } from "./pdf";

const HANDED_KEY = "all-about-me-handed";

export function Book() {
  const [sheet, setSheet] = useState<Sheet>(initialSheet);
  const [parts, setParts] = useState<Part[] | null>(null);
  const [hint, setHint] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [handed, setHanded] = useState(false);
  const [teacherOpen, setTeacherOpen] = useState(false);
  const [teacherWord, setTeacherWord] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const saved = readSheet();
    if (saved.step !== 0 || saved.strokes.length > 0 || saved.answers.name) setSheet(saved);
    try {
      setHanded(localStorage.getItem(HANDED_KEY) === "1");
    } catch {
      /* The hand-in still works for this sitting. */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeSheet(sheet);
  }, [sheet, hydrated]);

  useEffect(() => {
    let alive = true;
    fetch(previewAssetUrl("/dressup/catalog.json"))
      .then((response) => response.json() as Promise<Part[]>)
      .then((data) => {
        if (alive) setParts(data.map((part) => ({ ...part, src: previewAssetUrl(part.src) })));
      })
      .catch(() => {
        if (alive) setHint("The picture pieces did not load.");
      });
    return () => {
      alive = false;
    };
  }, []);

  function patch(next: Partial<Sheet>) {
    setHint("");
    setSheet((prev) => ({ ...prev, ...next }));
  }

  function patchAnswers(next: Partial<Answers>) {
    setSheet((prev) => ({ ...prev, answers: { ...prev.answers, ...next } }));
  }

  function unlockAgain() {
    if (!teacherWordOk(teacherWord)) {
      setHint("That is not the word.");
      return;
    }
    try {
      localStorage.removeItem(HANDED_KEY);
    } catch {
      /* This iPad can still give the page again during this sitting. */
    }
    setHanded(false);
    setTeacherWord("");
    setTeacherOpen(false);
    setHint("Unlocked. Press Give to Mr. Dane again.");
  }

  async function giveToDane() {
    if (handed) {
      setTeacherOpen(true);
      setHint("Ask Mr. Dane to unlock another save.");
      return;
    }
    setSending(true);
    setHint("");
    try {
      const file = await buildPosterPdf(sheet.answers.name);
      const result = await giveToMrDane({ pdfBase64: file.base64, fileName: file.fileName });
      if (!result.ok) {
        setHint(result.message);
        return;
      }
      try {
        localStorage.setItem(HANDED_KEY, "1");
      } catch {
        /* The page was still given. */
      }
      setHanded(true);
      setTeacherOpen(false);
      setTeacherWord("");
      setHint(result.message);
    } catch (error) {
      setHint(error instanceof Error ? error.message : "It did not send.");
    } finally {
      setSending(false);
    }
  }

  const sentence = sheet.step >= 0 && sheet.step < DRESS_STEP ? SENTENCES[sheet.step] : null;
  const total = POSTER_STEP + 1;

  if (sheet.step === DRESS_STEP) {
    return (
      <DressUp
        seedName={sheet.answers.name}
        onBack={() => patch({ step: DRESS_STEP - 1 })}
        onDone={(look) => {
          patch({
            look: { ...look, name: sheet.answers.name.trim() || look.name },
            step: PICTURE_STEP,
          });
        }}
      />
    );
  }

  const progressLabel =
    sheet.step < DRESS_STEP
      ? `Sentence ${sheet.step + 1} of ${DRESS_STEP}`
      : sheet.step === PICTURE_STEP
        ? "Your picture"
        : "Your page";

  const nextLabel =
    sheet.step === DRESS_STEP - 1 ? "Make you" : sheet.step === PICTURE_STEP ? "See my page" : "Next";

  return (
    <main className="sheet">
      <header className="no-print mb-4 flex items-center justify-between gap-3">
        <p className="font-sans text-sm font-extrabold tracking-widest text-coral uppercase">All about me · Primary 3</p>
        <p className="font-sans text-sm font-extrabold text-muted">{progressLabel}</p>
      </header>
      <div className="no-print mb-4 flex gap-1" aria-hidden>
        {Array.from({ length: total }, (_, index) => (
          <span key={index} className="progress-pip" data-on={index <= sheet.step ? "true" : "false"} />
        ))}
      </div>

      {hint ? <p className="mb-3 text-center font-sans font-extrabold text-coral">{hint}</p> : null}

      {sentence ? (
        <section className="mx-auto grid max-w-3xl gap-6 py-6">
          <h2 className="text-center font-sans text-sm font-extrabold tracking-widest text-coral uppercase">
            {sentence.title}
          </h2>
          <p className="sentence">
            {sentence.chunks.map((chunk, index) =>
              chunk.kind === "text" ? (
                <span key={index}>{chunk.text}</span>
              ) : (
                <input
                  key={chunk.key}
                  className="write-line"
                  aria-label={chunk.label}
                  value={sheet.answers[chunk.key]}
                  placeholder="write here"
                  maxLength={40}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  onChange={(event) => patchAnswers({ [chunk.key]: event.target.value })}
                />
              ),
            )}
          </p>
          <p className="text-center font-sans font-bold text-muted">
            Write on the line. Leave it blank if you would rather use a pencil later.
          </p>
        </section>
      ) : null}

      {sheet.step === PICTURE_STEP && parts ? (
        <PictureStudio
          look={sheet.look}
          parts={parts}
          scene={sheet.scene}
          strokes={sheet.strokes}
          onScene={(scene) => patch({ scene })}
          onStrokes={(strokes) => patch({ strokes })}
        />
      ) : null}

      {sheet.step === PICTURE_STEP && !parts ? (
        <p className="text-center font-sans font-extrabold text-muted">Lining up your picture…</p>
      ) : null}

      {sheet.step === POSTER_STEP && parts ? (
        <article className="poster-sheet">
          <div className="poster-picture">
            <PictureFrame look={sheet.look} parts={parts} scene={sheet.scene} strokes={sheet.strokes} />
          </div>
          <div>
            <h1 className="title-cloud">
              All about
              <br />
              me!
            </h1>
          </div>
          <div>
            {SENTENCES.map((page) => (
              <p key={page.title} className="poster-line">
                {page.chunks.map((chunk, index) => {
                  if (chunk.kind === "text") return <span key={index}>{chunk.text}</span>;
                  const word = wordOrLine(sheet.answers[chunk.key]);
                  return (
                    <span key={chunk.key} className={word.filled ? "poster-word" : "poster-blank"}>
                      {word.text}
                    </span>
                  );
                })}
              </p>
            ))}
          </div>
        </article>
      ) : null}

      {sheet.step === POSTER_STEP && !parts ? (
        <p className="text-center font-sans font-extrabold text-muted">Lining up your page…</p>
      ) : null}

      <div className="no-print mt-4 flex flex-wrap justify-center gap-2">
        {sheet.step > 0 ? (
          <button type="button" className="toy-go toy-ghost w-auto px-5" onClick={() => patch({ step: sheet.step - 1 })}>
            Back
          </button>
        ) : null}
        {sheet.step < POSTER_STEP ? (
          <button type="button" className="toy-go w-auto px-5" onClick={() => patch({ step: sheet.step + 1 })}>
            {nextLabel}
          </button>
        ) : (
          <>
            {teacherOpen ? (
              <form
                className="flex w-full flex-wrap items-center justify-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  unlockAgain();
                }}
              >
                <input
                  className="hand-word"
                  type="password"
                  value={teacherWord}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Teacher password"
                  aria-label="Teacher password"
                  onChange={(event) => setTeacherWord(event.target.value)}
                />
                <button type="submit" className="toy-go w-auto px-5">
                  Unlock another save
                </button>
              </form>
            ) : null}
            <button type="button" className="toy-go w-auto px-5" disabled={sending} onClick={() => void giveToDane()}>
              {sending ? "Sending…" : handed ? "Give to Mr. Dane again" : "Give to Mr. Dane"}
            </button>
            <button
              type="button"
              className="toy-go toy-ghost w-auto px-5"
              onClick={() => {
                setTeacherOpen((open) => !open);
                setHint("");
              }}
            >
              Teacher
            </button>
            <button
              type="button"
              className="toy-go toy-ghost w-auto px-5"
              onClick={() => {
                try {
                  localStorage.removeItem(HANDED_KEY);
                } catch {
                  /* The next child can still hand in once. */
                }
                setHanded(false);
                setTeacherOpen(false);
                setTeacherWord("");
                setSheet(initialSheet());
                setHint("");
              }}
            >
              Start again
            </button>
          </>
        )}
      </div>
    </main>
  );
}
