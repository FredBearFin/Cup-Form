import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { allAttributes, SCORING_SCHEMAS } from "../scoring/schemas";
import type { ExportableRoast } from "./csv";

const PAGE = { width: 595, height: 842, margin: 48 };

/// The built-in PDF fonts only encode Latin-1; anything else would throw
/// while drawing. Replace unsupported characters rather than fail an export
/// because a coffee name contains, say, an emoji.
export function toLatin1(text: string): string {
  return Array.from(text.replace(/[\r\n\t]+/g, " "), (ch) => {
    const code = ch.codePointAt(0)!;
    return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) ? ch : "?";
  }).join("");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of toLatin1(text).split(" ")) {
    let candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    // A single word wider than the line: hard-split it.
    candidate = word;
    while (font.widthOfTextAtSize(candidate, size) > maxWidth && candidate.length > 1) {
      let cut = candidate.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(candidate.slice(0, cut), size) > maxWidth) cut--;
      lines.push(candidate.slice(0, cut));
      candidate = candidate.slice(cut);
    }
    line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

const labels = new Map(
  Object.values(SCORING_SCHEMAS).flatMap((s) => allAttributes(s).map((a) => [a.key, a.label] as const)),
);

/// Roast metadata, then each cupping session with its scores, flowing across pages.
export async function roastsToPdf(roasts: ExportableRoast[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const contentWidth = PAGE.width - PAGE.margin * 2;

  let page = doc.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;

  function write(text: string, opts: { size?: number; font?: PDFFont; indent?: number; gap?: number; color?: [number, number, number] } = {}) {
    const { size = 10, font = regular, indent = 0, gap = 4, color = [0.1, 0.1, 0.1] } = opts;
    for (const line of wrap(text, font, size, contentWidth - indent)) {
      if (y - size < PAGE.margin) {
        page = doc.addPage([PAGE.width, PAGE.height]);
        y = PAGE.height - PAGE.margin;
      }
      y -= size;
      page.drawText(line, { x: PAGE.margin + indent, y, size, font, color: rgb(...color) });
      y -= gap;
    }
  }

  write("Cup-Form export", { size: 16, font: bold, gap: 4 });
  write(`${roasts.length} roast${roasts.length === 1 ? "" : "s"} · generated ${new Date().toISOString().slice(0, 10)}`, {
    color: [0.4, 0.4, 0.4],
    gap: 14,
  });

  for (const r of roasts) {
    write(r.coffeeName, { size: 13, font: bold, gap: 3 });
    const meta = [
      `Roasted ${r.roastDate.toISOString().slice(0, 10)}`,
      r.origin && `Origin: ${r.origin}`,
      r.variety && `Variety: ${r.variety}`,
      r.process && `Process: ${r.process}`,
      r.roastLevel && `Level: ${r.roastLevel}`,
      r.batchSizeG && `Batch: ${r.batchSizeG} g`,
      r.roastTimeS && `Roast time: ${r.roastTimeS} s`,
    ].filter(Boolean) as string[];
    write(meta.join("  ·  "), { color: [0.35, 0.35, 0.35] });
    if (r.notes) write(`Notes: ${r.notes}`);

    if (r.cuppingSessions.length === 0) write("No cupping sessions.", { indent: 12, color: [0.5, 0.5, 0.5] });
    for (const s of r.cuppingSessions) {
      write(`Cupped ${s.cuppedAt.toISOString().replace("T", " ").slice(0, 16)} UTC (${s.scoringSchemaVersion})`, {
        indent: 12,
        font: bold,
        gap: 2,
      });
      write(s.scores.map((sc) => `${labels.get(sc.attributeKey) ?? sc.attributeKey}: ${sc.value}`).join("   "), {
        indent: 24,
      });
      if (s.overallNote) write(`Note: ${s.overallNote}`, { indent: 24 });
    }
    y -= 12;
  }

  return doc.save();
}
