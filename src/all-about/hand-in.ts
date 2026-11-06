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

export function teacherWordOk(password: string) {
  return password.trim().toLowerCase() === WORD;
}

export async function giveToMrDane(input: { pdfBase64: string; fileName: string }): Promise<HandInResult> {
  if (!input.pdfBase64 || input.pdfBase64.length < 100) {
    return { ok: false, code: "drive", message: "The page did not come through." };
  }
  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        password: WORD,
        filename: input.fileName,
        pdfBase64: input.pdfBase64,
        ping: false,
      }),
    });
    const text = await response.text();
    let parsed: ScriptReply | null = null;
    try {
      parsed = JSON.parse(text) as ScriptReply;
    } catch {
      parsed = null;
    }
    if (!response.ok || !parsed?.ok) {
      return {
        ok: false,
        code: "drive",
        message: parsed?.error || "It did not reach Mr. Dane's Drive. Try again in a moment.",
      };
    }
    const name = parsed.name || input.fileName;
    return { ok: true, message: `Saved in My Park Worksheets as ${name}.` };
  } catch {
    return {
      ok: false,
      code: "drive",
      message: "It did not reach Mr. Dane's Drive. Try again in a moment.",
    };
  }
}
