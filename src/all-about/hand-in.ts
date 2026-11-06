import { createServerFn } from "@tanstack/react-start";

type HandInInput = {
  pdfBase64: string;
  fileName: string;
  again: boolean;
  password: string;
};

export type HandInResult = {
  ok: boolean;
  code?: "password" | "drive";
  message: string;
};

/** The My Park web app already runs as Mr. Dane. Children never sign in. */
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwPAjlLXwYmBD27v3W96oZEAH6vkzFd6ncHqCgEgTuEYWqPG76N31Urnd5_KmwwRLqn/exec";
const WORD = "patpat";

type ScriptReply = { ok?: boolean; error?: string; name?: string };

async function postToScript(body: Record<string, unknown>): Promise<ScriptReply> {
  const response = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(25_000),
  });
  let next = response;
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new Error("Google Drive did not answer.");
    next = await fetch(location, { signal: AbortSignal.timeout(25_000) });
  }
  const text = await next.text();
  try {
    return JSON.parse(text) as ScriptReply;
  } catch {
    throw new Error("Google Drive sent an unexpected reply.");
  }
}

export const giveToMrDane = createServerFn({ method: "POST" })
  .validator((input: HandInInput) => {
    if (!input || typeof input.pdfBase64 !== "string" || input.pdfBase64.length < 100) {
      throw new Error("The page did not come through.");
    }
    if (input.pdfBase64.length > 7_000_000) throw new Error("That page is too big to send.");
    const fileName = typeof input.fileName === "string" ? input.fileName.slice(0, 80) : "All about me.pdf";
    return {
      pdfBase64: input.pdfBase64,
      fileName: fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`,
      again: input.again === true,
      password: typeof input.password === "string" ? input.password : "",
    };
  })
  .handler(async ({ data }): Promise<HandInResult> => {
    if (data.again && data.password.trim().toLowerCase() !== WORD) {
      return { ok: false, code: "password", message: "That is not the word." };
    }
    try {
      const parsed = await postToScript({
        password: WORD,
        filename: data.fileName,
        pdfBase64: data.pdfBase64,
        ping: false,
      });
      if (!parsed.ok) {
        return {
          ok: false,
          code: "drive",
          message: "It did not reach Mr. Dane's Drive. Try again in a moment.",
        };
      }
      return { ok: true, message: "Given to Mr. Dane." };
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      return {
        ok: false,
        code: "drive",
        message: timedOut
          ? "Google Drive took too long. Press the button again."
          : "It did not reach Mr. Dane's Drive. Try again in a moment.",
      };
    }
  });
