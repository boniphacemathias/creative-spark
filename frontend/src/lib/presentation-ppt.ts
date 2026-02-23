import PptxGenJS from "pptxgenjs";

export interface PresentationTable {
  headers: string[];
  rows: string[][];
}

export interface PresentationSlide {
  heading: string;
  kicker?: string;
  paragraphs?: string[];
  bullets?: string[];
  table?: PresentationTable;
}

export interface PresentationDeckInput {
  filename: string;
  title: string;
  subtitle?: string;
  campaignName?: string;
  complianceTag?: string;
  slides: PresentationSlide[];
}

const COLORS = {
  primary: "0F4C81",
  secondary: "1F8A70",
  accent: "F59E0B",
  text: "122030",
  muted: "425466",
  white: "FFFFFF",
  light: "F2F8FE",
};

function normalizeFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function compactLines(values: string[] | undefined, fallback: string): string[] {
  const lines = (values || []).map((value) => value.trim()).filter(Boolean);
  return lines.length > 0 ? lines : [fallback];
}

function wrapText(value: string, maxChars = 96): string[] {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [""];
  }

  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (trial.length <= maxChars) {
      current = trial;
      continue;
    }
    if (current) {
      lines.push(current);
    }
    current = word;
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function paginate<T>(items: T[], chunkSize: number): T[][] {
  if (items.length === 0) {
    return [[]];
  }
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    pages.push(items.slice(index, index + chunkSize));
  }
  return pages;
}

export async function downloadPresentationPpt(input: PresentationDeckInput): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
  pptx.author = "Creative Spark";
  pptx.company = "CLEARKAMO";
  pptx.subject = input.complianceTag ? `${input.title} | ${input.complianceTag}` : input.title;
  pptx.title = input.title;

  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: COLORS.light };
  titleSlide.addShape(pptx.ShapeType.roundRect, {
    x: 0.6,
    y: 0.45,
    w: 4.2,
    h: 0.14,
    rectRadius: 0.06,
    fill: { color: COLORS.primary },
    line: { color: COLORS.primary, pt: 0 },
  });
  titleSlide.addText("Campaign Presentation", {
    x: 0.62,
    y: 0.7,
    w: 4.2,
    h: 0.24,
    fontFace: "Calibri",
    fontSize: 11,
    color: COLORS.muted,
    bold: true,
  });
  titleSlide.addText(input.title, {
    x: 0.62,
    y: 1.0,
    w: 11.6,
    h: 1.4,
    fontFace: "Calibri",
    fontSize: 42,
    color: COLORS.primary,
    bold: true,
    valign: "top",
  });
  if (input.subtitle) {
    titleSlide.addText(input.subtitle, {
      x: 0.62,
      y: 2.25,
      w: 10.8,
      h: 0.9,
      fontFace: "Calibri",
      fontSize: 20,
      color: COLORS.secondary,
      valign: "top",
    });
  }
  titleSlide.addText(input.campaignName || "Creative Spark", {
    x: 0.62,
    y: 6.9,
    w: 6,
    h: 0.22,
    fontFace: "Calibri",
    fontSize: 12,
    color: COLORS.muted,
  });

  input.slides.forEach((slideSpec, index) => {
    const paragraphLines = compactLines(slideSpec.paragraphs, "")
      .filter(Boolean)
      .flatMap((line) => wrapText(line, 104));
    const bulletLines = compactLines(slideSpec.bullets, "")
      .filter(Boolean)
      .flatMap((line) => {
        const wrapped = wrapText(line, 96);
        return wrapped.map((segment, segmentIndex) => (segmentIndex === 0 ? `• ${segment}` : `   ${segment}`));
      });
    const bodyLines = [...paragraphLines, ...bulletLines];
    const textPages = paginate(bodyLines, 12);

    const tablePages = slideSpec.table
      ? paginate(
          slideSpec.table.rows.map((row) => {
            return slideSpec.table.headers.map((_, columnIndex) => row[columnIndex] ?? "");
          }),
          10,
        )
      : [];

    const pageCount = Math.max(textPages.length, tablePages.length, 1);
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const slide = pptx.addSlide();
    slide.background = { color: COLORS.white };

    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.333,
      h: 0.35,
      fill: { color: COLORS.primary },
      line: { color: COLORS.primary, pt: 0 },
    });
    slide.addText(`Slide ${index + 2}${pageCount > 1 ? `.${pageIndex + 1}` : ""}`, {
      x: 11.9,
      y: 0.08,
      w: 1.2,
      h: 0.2,
      fontFace: "Calibri",
      fontSize: 10,
      color: COLORS.white,
      align: "right",
    });

    slide.addText(
      `${slideSpec.heading}${pageCount > 1 ? ` (cont. ${pageIndex + 1}/${pageCount})` : ""}`,
      {
      x: 0.62,
      y: 0.65,
      w: 12,
      h: 0.7,
      fontFace: "Calibri",
      fontSize: 30,
      color: COLORS.primary,
      bold: true,
      },
    );

    if (slideSpec.kicker) {
      slide.addText(slideSpec.kicker, {
        x: 0.62,
        y: 1.28,
        w: 12,
        h: 0.45,
        fontFace: "Calibri",
        fontSize: 16,
        color: COLORS.secondary,
        bold: true,
      });
    }

      let cursorY = slideSpec.kicker ? 1.78 : 1.45;
      const currentLines = textPages[pageIndex] || [];
      currentLines.forEach((line) => {
        slide.addText(line, {
          x: line.startsWith("• ") ? 0.82 : 0.72,
          y: cursorY,
          w: 11.9,
          h: 0.34,
          fontFace: "Calibri",
          fontSize: line.startsWith("• ") ? 15.5 : 16,
          color: COLORS.text,
        });
        cursorY += 0.32;
      });
      if (currentLines.length > 0) {
        cursorY += 0.08;
      }

      if (slideSpec.table && slideSpec.table.headers.length > 0) {
      const rows = [
        slideSpec.table.headers.map((value) => ({ text: value })),
        ...(tablePages[pageIndex] || []).map((row) => {
          return slideSpec.table.headers.map((_, columnIndex) => ({ text: row[columnIndex] ?? "" }));
        }),
      ];
      const tableY = Math.min(cursorY, 5.0);
      slide.addTable(rows, {
        x: 0.65,
        y: tableY,
        w: 12.0,
        h: 2.0,
        border: { type: "solid", color: "D6E2ED", pt: 1 },
        fontFace: "Calibri",
        fontSize: 12,
        color: COLORS.text,
        valign: "middle",
        fill: { color: COLORS.white },
      });
      slide.addShape(pptx.ShapeType.line, {
        x: 0.65,
        y: tableY + 0.38,
        w: 12.0,
        h: 0,
        line: { color: COLORS.primary, pt: 1.4 },
      });
      }
    }
  });

  const safeName = normalizeFilename(input.filename || input.title || "campaign-presentation") || "campaign-presentation";
  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `${safeName}.pptx`;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
