const PAGE_W = 1240;
const PAGE_H = 1754;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      const comma = value.indexOf(",");
      resolve(comma >= 0 ? value.slice(comma + 1) : value);
    };
    reader.onerror = () => reject(new Error("The page could not be packed."));
    reader.readAsDataURL(blob);
  });
}

function fileNameFor(name: string) {
  const clean = name.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
  return clean ? `All about me - ${clean}.pdf` : "All about me.pdf";
}

function compositePicture(canvases: HTMLCanvasElement[]) {
  const picture = document.createElement("canvas");
  const width = canvases[0]?.width || 800;
  const height = canvases[0]?.height || 1200;
  picture.width = width;
  picture.height = height;
  const ctx = picture.getContext("2d");
  if (!ctx) return picture;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  for (const canvas of canvases) ctx.drawImage(canvas, 0, 0, width, height);
  return picture;
}

type Run = { text: string; color: string };

function runsOf(line: HTMLElement): Run[] {
  const runs: Run[] = [];
  line.childNodes.forEach((node) => {
    const text = node.textContent ?? "";
    if (!text) return;
    const element = node instanceof HTMLElement ? node : null;
    const color = element?.classList.contains("poster-word") ? "#d8442c" : "#241910";
    runs.push({ text, color });
  });
  if (runs.length === 0 && line.textContent) runs.push({ text: line.textContent, color: "#241910" });
  return runs;
}

function drawWrapped(ctx: CanvasRenderingContext2D, runs: Run[], x: number, y: number, maxWidth: number, lineHeight: number) {
  let cursor = x;
  let lineY = y;
  const words: Run[] = [];
  for (const run of runs) {
    const parts = run.text.split(/(\s+)/);
    for (const part of parts) {
      if (part) words.push({ text: part, color: run.color });
    }
  }
  for (const word of words) {
    const width = ctx.measureText(word.text).width;
    if (cursor > x && cursor + width > x + maxWidth) {
      lineY += lineHeight;
      cursor = x;
      if (/^\s+$/.test(word.text)) continue;
    }
    ctx.fillStyle = word.color;
    ctx.fillText(word.text, cursor, lineY);
    cursor += width;
  }
  return lineY + lineHeight;
}

export async function buildPosterPdf(pupilName: string): Promise<{ base64: string; fileName: string }> {
  const sheet = document.querySelector(".poster-sheet");
  if (!(sheet instanceof HTMLElement)) throw new Error("The page is not ready yet.");
  const canvases = [...sheet.querySelectorAll(".picture-frame canvas")].filter(
    (node): node is HTMLCanvasElement => node instanceof HTMLCanvasElement,
  );
  if (canvases.length === 0) throw new Error("The picture is not ready yet.");

  await document.fonts.load('400 72px "KG Perfect Penmanship"');
  const page = document.createElement("canvas");
  page.width = PAGE_W;
  page.height = PAGE_H;
  const ctx = page.getContext("2d");
  if (!ctx) throw new Error("The page could not be drawn.");

  ctx.fillStyle = "#fffaf3";
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  const picture = compositePicture(canvases);
  const pictureW = 700;
  const pictureH = Math.round(pictureW * (picture.height / picture.width));
  const pictureX = PAGE_W - 48 - pictureW;
  const pictureY = Math.max(48, Math.round((PAGE_H - pictureH) / 2));
  ctx.drawImage(picture, pictureX, pictureY, pictureW, pictureH);

  ctx.textBaseline = "top";
  ctx.font = '400 78px "KG Perfect Penmanship", Nunito, sans-serif';
  ctx.fillStyle = "#d8442c";
  ctx.fillText("All about", 56, 72);
  ctx.fillText("me!", 56, 156);

  ctx.font = '400 40px "KG Perfect Penmanship", Nunito, sans-serif';
  let y = 280;
  const lines = [...sheet.querySelectorAll(".poster-line")].filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );
  for (const line of lines) {
    y = drawWrapped(ctx, runsOf(line), 56, y, pictureX - 88, 58);
    y += 8;
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    page.toBlob((result) => (result ? resolve(result) : reject(new Error("The page could not be packed."))), "image/jpeg", 0.84);
  });
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const image = await blobToBase64(blob);
  pdf.addImage(`data:image/jpeg;base64,${image}`, "JPEG", 0, 0, 210, 297);
  const packed = pdf.output("blob");
  return { base64: await blobToBase64(packed), fileName: fileNameFor(pupilName) };
}
