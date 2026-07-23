#!/usr/bin/env node
// GarfiX EOS v12.1 — Technical Report Generator (DOCX)
// Bilingual: Arabic + English, Deep Cyan tech palette

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  PageBreak, Header, Footer, PageNumber, NumberFormat,
  AlignmentType, HeadingLevel, WidthType, BorderStyle, ShadingType,
  TableOfContents, SectionType,
} = require("docx");
const fs = require("fs");

// ── Palette: DM-1 Deep Cyan (Tech / AI) ──
const palette = {
  bg: "162235", primary: "FFFFFF", accent: "37DCF2",
  cover: { titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "90989F", footerColor: "687078" },
  table: { headerBg: "1B6B7A", headerText: "FFFFFF", accentLine: "1B6B7A", innerLine: "C8DDE2", surface: "EDF3F5" },
  body: "000000", secondary: "506070",
};
const c = (hex) => hex.replace("#", "");

// ── Common constants ──
const allNoBorders = {
  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
  insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
};
const noBorders = {
  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
};
const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

// ── Helper functions ──
function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charWidth = (pt) => pt * 20;
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt;
  let lines = null;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) {
    lines = splitTitleLines(title, charsPerLine(minPt));
    titlePt = minPt;
  }
  return { titlePt, titleLines: lines };
}

function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const safeBreakAfter = " \u3001\u3002\uFF0C\uFF1B\uFF1A\u2027\u2014\u2013\u2019ofandorintowithatbyforinonupout";
  const lines = [];
  let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = charsPerLine;
    for (let i = charsPerLine; i > Math.floor(charsPerLine * 0.6); i--) {
      if (safeBreakAfter.includes(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === charsPerLine && remaining[charsPerLine]) {
      for (let i = charsPerLine; i > Math.floor(charsPerLine * 0.6); i--) {
        if (safeBreakAfter.includes(remaining[i])) { breakAt = i + 1; break; }
      }
    }
    lines.push(remaining.substring(0, breakAt));
    remaining = remaining.substring(breakAt);
  }
  if (remaining) lines.push(remaining);
  // Merge orphan last line (1-2 chars) into previous
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) {
    lines[lines.length - 2] += lines[lines.length - 1];
    lines.pop();
  }
  return lines;
}

function calcCoverSpacing(params) {
  const {
    titleLineCount = 1, titlePt = 36, hasSubtitle = false,
    hasEnglishLabel = false, metaLineCount = 0, fixedHeight = 400, pageHeight = 16838,
  } = params;
  const titleBlock = titleLineCount * Math.ceil(titlePt * 23) + (titleLineCount > 1 ? (titleLineCount - 1) * 200 : 0);
  const subtitleBlock = hasSubtitle ? 600 : 0;
  const labelBlock = hasEnglishLabel ? 700 : 0;
  const metaBlock = metaLineCount * 320;
  const contentHeight = titleBlock + subtitleBlock + labelBlock + metaBlock + fixedHeight + 1000;
  const available = pageHeight - contentHeight;
  const topSpacing = Math.min(4500, Math.max(1800, Math.floor(available * 0.35)));
  const bottomSpacing = Math.min(3000, Math.max(400, available - topSpacing));
  return { topSpacing, midSpacing: 800, bottomSpacing };
}

// ── Cover R1 Builder ──
function buildCoverR1(config) {
  const P = config.palette;
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));
  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "),
        size: 18, color: P.accent, font: { ascii: "Calibri", eastAsia: "SimHei" }, characterSpacing: 40 })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true,
        color: P.titleColor, font: { eastAsia: "SimHei", ascii: "Arial" } })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL }, spacing: { after: 800 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: P.subtitleColor,
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 24, color: P.metaColor,
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: P.footerColor, font: { ascii: "Arial" } }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: config.footerRight || "", size: 16, color: P.footerColor, font: { ascii: "Arial" } }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: "FIXED",
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: P.bg }, borders: noBorders,
        children,
      })],
    })],
  })];
}

// ── Body helpers ──
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 120 },
    children: [new TextRun({ text, bold: true, size: 32, color: c(palette.table.headerBg),
      font: { eastAsia: "SimHei", ascii: "Times New Roman" } })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 100 },
    children: [new TextRun({ text, bold: true, size: 28, color: c(palette.table.headerBg),
      font: { eastAsia: "SimHei", ascii: "Times New Roman" } })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, size: 24, color: c(palette.secondary),
      font: { eastAsia: "SimHei", ascii: "Times New Roman" } })],
  });
}

function para(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 420 },
    spacing: { line: 312, after: 120 },
    children: [new TextRun({ text, size: 24, color: c(palette.body),
      font: { eastAsia: "Microsoft YaHei", ascii: "Times New Roman" } })],
  });
}

function paraEn(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 120 },
    children: [new TextRun({ text, size: 24, color: c(palette.body),
      font: { ascii: "Times New Roman" } })],
  });
}

function paraBi(arText, enText) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 420 },
    spacing: { line: 312, after: 120 },
    children: [
      new TextRun({ text: arText, size: 24, color: c(palette.body),
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } }),
      new TextRun({ text: " | ", size: 24, color: c(palette.secondary) }),
      new TextRun({ text: enText, size: 24, color: c(palette.body),
        font: { ascii: "Times New Roman" } }),
    ],
  });
}

// ── Table builder ──
function makeTable(headers, rows, colWidths) {
  const t = palette.table;
  const headerRow = new TableRow({
    tableHeader: true, cantSplit: true,
    children: headers.map((h, i) => new TableCell({
      width: { size: colWidths[i], type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, fill: t.headerBg },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 21, color: t.headerText,
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })] })],
    })),
  });
  const dataRows = rows.map((row, ri) => new TableRow({
    cantSplit: true,
    children: row.map((cell, ci) => new TableCell({
      width: { size: colWidths[ci], type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, fill: ri % 2 === 0 ? t.surface : "FFFFFF" },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: cell, size: 21, color: "000000",
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })] })],
    })),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: t.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: t.accentLine },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: t.innerLine },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [headerRow, ...dataRows],
  });
}

// ── Footer builders ──
function footerRoman() {
  return new Footer({ children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080" })],
  })] });
}
function footerArabic() {
  return new Footer({ children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080" })],
  })] });
}
function headerBody() {
  return new Header({ children: [new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [new TextRun({ text: "GarfiX EOS v12.1 \u2014 Technical Report", size: 18, color: "808080",
      font: { ascii: "Calibri" } })],
  })] });
}

// ── SECTION CONTENT ──

// Executive Summary
const execSummary = [
  h1("\u0627\u0644\u0645\u0644\u062e\u0635 \u0627\u0644\u062a\u0646\u0641\u064a\u0630\u064a | Executive Summary"),
  paraBi("\u064a\u0639\u062f \u0627\u0644\u0625\u0635\u062f\u0627\u0631 v12.1 \u0645\u0646 GarfiX EOS \u0642\u0641\u0632\u0629 \u0643\u0628\u064a\u0631\u0629 \u0645\u0646 \u0645\u0646\u063a\u0645 \u0641\u0648\u0627\u062a\u0631 \u0623\u0633\u0627\u0633\u064a \u0625\u0644\u064a \u0646\u0638\u0627\u0645 ERP \u0645\u062a\u0639\u062f\u062f \u0627\u0644\u0645\u0633\u062a\u0623\u062c\u0631\u064a\u0646 \u062f\u0631\u062c\u0629 \u0627\u0644\u0623\u0639\u0645\u0627\u0644\u060c \u0645\u0639 50 \u062a\u063a\u064a\u064a\u0631\u0627\u064b \u0645\u0627\u0647\u0645\u0627\u064b \u0645\u0646\u0630 \u0627\u0644\u0625\u0635\u062f\u0627\u0631 v1.5.",
    "The v12.1 release of GarfiX EOS represents a leap from a basic invoicing app to an enterprise-grade multi-tenant ERP, with 50 significant changes since v1.5."),
  paraBi("\u0627\u0644\u062a\u063a\u064a\u064a\u0631\u0627\u062a \u0627\u0644\u0643\u0627\u062f\u0631\u0629 \u062a\u062a\u0636\u0645\u0646: \u062a\u0639\u0627\u0632 \u0623\u0645\u0646\u064a \u0643\u0627\u0645\u0644 (7+ \u0625\u0635\u0644\u0627\u062d\u0627\u062a audit-level)0\u060c \u0648 AI Fabric v2 \u0628\u0646\u0633\u0628\u0649 16 \u0645\u0631\u0627\u062d\u0644 cascade\u060c \u0648 Invoice Brain \u0644\u0627\u0633\u062a\u062e\u0631\u0627\u0623 \u0627\u0644\u0646\u0645\u0627\u0626\u0637\u060c \u0648\u0627\u0633\u062a\u0628\u062f\u0627\u0644 Redis \u0628\u0640 Valkey + BullMQ\u060c \u0648\u062a\u0648\u0633\u064a\u0639 MENA \u0644\u0620+ \u062f\u0648\u0644\u0629\u060c \u0648\u0645\u062c\u0645\u0648\u0639\u0629 \u0627\u062e\u062a\u0628\u0627\u0631 1855+ \u0645\u0644\u0641.",
    "Core changes include: full security hardening (7+ audit-level fixes), AI Fabric v2 with 16-phase cascade, Invoice Brain pattern extraction, Redis replaced with Valkey+BullMQ, MENA expansion for 20+ countries, and 1855+ test suite."),
];

// Background
const background = [
  h1("\u0627\u0644\u062e\u0644\u0641\u064a\u0629 \u0648\u0627\u0644\u0623\u0647\u062f\u0627\u0641 | Background & Objectives"),
  paraBi("\u0628\u062f\u0627 GarfiX \u0641\u064a \u0627\u0644\u0625\u0635\u062f\u0627\u0631\u0627\u062a v1.3\u062d\u062a\u064a v1.5 \u0643\u0645\u0646\u0638\u0648\u0645\u0629 \u0641\u0648\u0627\u062a\u0631 \u0623\u0633\u0627\u0633\u064a\u0629 \u0644\u0644\u0633\u0648\u0642 \u0627\u0644\u0639\u0631\u0628\u064a\u060c \u0644\u0643\u0646 \u0627\u0644\u062a\u062d\u062f\u064a \u0627\u0644\u0623\u0643\u0628\u0631 \u0643\u0627\u0646 \u0627\u0644\u0646\u0645\u0627\u062d\u064a\u0629 \u0627\u0644\u0623\u0645\u0646\u064a\u0629 \u0648\u0627\u0644\u0642\u062f\u0631\u0629 \u0639\u0644\u0649 \u0627\u0644\u062a\u0648\u0633\u0639 \u0644\u062f\u0648\u0644 MENA \u0627\u0644\u0645\u062a\u0639\u062f\u062f\u0629.",
    "GarfiX started in v1.3-v1.5 as a basic invoicing system for the Arabic market, but the biggest challenge was security posture and scalability to multiple MENA countries."),
  paraBi("\u0623\u062b\u0628\u062a CTO Audit Report \u0648\u0627\u0644\u0623\u062f\u0627\u0629 Security Pipeline (CodeQL + TruffleHog + Gitleaks) 16 \u0645\u0634\u0643\u0644\u0629: 5 \u062d\u0631\u062c\u0629 (C)\u060c 6 \u062e\u0637\u064a\u0631\u0629 (H)\u060c 5 \u0645\u062a\u0648\u0633\u0637\u0629 (M). \u0643\u0627\u0646 \u0627\u0644\u0623\u0647\u062f\u0627\u0641 \u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629 \u0644\u0625\u0635\u062f\u0627\u0631 v12:",
    "The CTO Audit Report and Security Pipeline (CodeQL + TruffleHog + Gitleaks) identified 16 issues: 5 critical (C), 6 high-risk (H), 5 medium (M). Main objectives for v12:"),
  para("\u0625\u0635\u0644\u0627\u062d \u0643\u0627\u0641\u0629 \u0627\u0644\u0645\u0634\u0627\u0643\u0644 \u0627\u0644\u0623\u0645\u0646\u064a\u0629 \u0627\u0644\u062d\u0631\u062c\u0629 \u0648\u0627\u0644\u062e\u0637\u064a\u0631\u0629 (C1-C5, H1-H6) | Fix all critical and high-risk security issues (C1-C5, H1-H6)"),
  para("\u0628\u0646\u0627\u0621 AI Fabric \u0643\u0627\u0645\u0644 \u0628\u0640 16 \u0645\u0631\u0627\u062d\u0644 cascade \u0644\u062a\u0642\u0644\u064a\u0644 \u062a\u0643\u0627\u0644\u064a\u0641 AI | Build complete AI Fabric with 16-phase cascade to reduce AI costs"),
  para("\u0625\u0636\u0627\u0641\u0629 \u0645\u0633\u062a\u0648\u0649 \u0627\u0642\u062a\u0635\u0627\u062f\u064a \u0644\u0644\u0646\u0638\u0627\u0645 (Budget Engine + Profit Engine) | Add economic layer (Budget Engine + Profit Engine)"),
  para("\u062a\u0648\u0633\u064a\u0639 \u0627\u0644\u062f\u0639\u0645 \u0644\u0620+ \u062f\u0648\u0644 MENA \u0628\u0625\u0639\u062f\u0627\u062f\u0627\u062a \u062e\u0627\u0635\u0629 \u0644\u0643\u0644 \u062f\u0648\u0644\u0629 | Expand support to 20+ MENA countries with per-country configs"),
  para("\u0627\u0633\u062a\u0628\u062f\u0627\u0644 Redis \u0628\u0640 Valkey + BullMQ \u0644\u0645\u0639\u0627\u0644\u0629 \u0627\u0644\u0645\u0647\u0627\u0645 \u0627\u0644\u062e\u0644\u0641\u064a\u0629 | Replace Redis with Valkey + BullMQ for background job processing"),
  para("\u0628\u0646\u0627\u0621 \u0645\u062c\u0645\u0648\u0639\u0629 \u0627\u062e\u062a\u0628\u0627\u0631 CTO-level \u062a\u0636\u0645\u0646 \u062c\u0627\u0647\u0632\u064a\u0629 \u0627\u0644\u0625\u0646\u062a\u0627\u062e | Build CTO-level test suite ensuring production readiness"),
];

// Security Hardening
const security = [
  h1("\u0627\u0644\u062a\u0639\u0627\u0632 \u0627\u0644\u0623\u0645\u0646\u064a | Security Hardening"),
  paraBi("\u064a\u062a\u0636\u0645\u0646 v12.1 \u0625\u0635\u0644\u0627\u062d\u0627\u062a \u0623\u0645\u0646\u064a\u0629 \u062f\u0631\u062c\u0629 audit \u0644\u0623\u0643\u062b\u0631 \u0645\u0646 7 \u0645\u0634\u0627\u0643\u0644 \u062d\u0631\u062c\u0629 \u0648\u062e\u0637\u064a\u0631\u0629\u060c \u0625\u0644\u0647 \u0645\u0646\u0647\u0627 \u0643\u0627\u0646\u062a \u0645\u0646\u0639\u0629 \u0643\u0644 \u0648\u062c\u0648\u062f \u0627\u0644\u062a\u0634\u0641\u064a\u0631 \u0648\u0627\u0644\u0645\u0639\u0627\u0645\u0644\u0629.",
    "v12.1 includes audit-level security fixes for over 7 critical and high-risk issues, some of which prevented encryption and authentication entirely."),

  h2("\u0645\u0634\u0627\u0643\u0644 \u0627\u0644\u0623\u0645\u0646 \u0627\u0644\u0645\u0635\u0644\u0627\u062d\u0629 | Security Issues Fixed"),
  makeTable(
    ["\u0627\u0644\u0645\u0634\u0643\u0644\u0629 | ID", "\u0627\u0644\u062f\u0631\u062c\u0629 | Severity", "\u0627\u0644\u0648\u0635\u0641 | Description"],
    [
      ["SEC-002", "Critical", "JWT fallback secrets \u0643\u0627\u0646\u062a \u0645\u0646\u0639\u0629 \u0627\u0644\u0625\u062a\u0635\u0627\u0644 \u0627\u0644\u0645\u0648\u0642\u0648\u0642"],
      ["SEC-003", "Critical", "PAYMENTS_ENC_KEY \u0643\u0627\u0646 \u064a\u0633\u062a\u062e\u062f\u0645 JWT_SECRET \u0643\u0627\u0641\u0627\u064b\u062d\u064b\u0631\u064a\u0641"],
      ["P0 (audit)", "Critical", "decryptSecret() \u0643\u0627\u0646 \u064a\u0639\u064a\u062f ciphertext \u0639\u0646\u062f \u0627\u0644\u0641\u0634\u0644 \u0628\u062f\u0644 \u0627\u0644\u0625\u0644\u063a\u0627\u0645"],
      ["P0 (MFA)", "Critical", "MFA TOTP: Base32/Base64 mismatch \u0643\u0627\u0646 MFA \u0645\u0639\u0637\u0644\u0627\u064b \u0643\u0627\u0645\u0644\u0627"],
      ["P0 (SSRF)", "High", "MyFatoorah SSRF: \u0639\u0646\u0627\u0648\u064a\u0646 IP \u062f\u0627\u062e\u0644\u064a\u0629 \u0645\u0633\u0645\u0648\u062d\u0629"],
      ["M3", "High", "Rate limit key prefix mismatch \u0639\u0646\u062f \u0625\u0644\u063a\u0627\u0644 clear"],
      ["IDOR", "High", "54/56 handlers \u062a\u062d\u062a\u0627\u062c tenant scope protection"],
      ["Gemini", "Medium", "AI provider: empty base URL \u0643\u0627\u0646 \u0643\u0644 Gemini calls \u062a\u0641\u0634\u0644"],
    ],
    [15, 12, 73],
  ),

  h2("\u0645\u0648\u0627\u0639\u064a\u0646 \u0627\u0644\u0627\u0633\u062a\u062e\u062f\u0627\u0645 | Usage Safeguards"),
  paraBi("\u062a\u0633\u062a\u0646\u062f \u0627\u0644\u0646\u0638\u0627\u0645 \u0627\u0644\u0623\u0645\u0646\u064a \u0639\u0644\u064a \u0639\u062f\u0629 \u0645\u0648\u0627\u0639\u064a\u0646 \u0645\u062a\u0639\u062f\u062f\u0629: JWT dual-token system (Access 30min + Refresh 30d) \u0645\u0639 token versioning \u0644\u0625\u0644\u063a\u0627\u0644 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0627\u062a \u0643\u0627\u0645\u0644\u0627\u060c Valkey-backed token blacklist \u0644\u0640 force logout\u060c AES-256-GCM encryption vault \u0645\u0639 scrypt key derivation\u060c \u0648 tamper-evident audit chain \u0628\u0637\u0644\u0627\u0642 SHA-256 hash chain.",
    "The security system relies on multiple safeguards: JWT dual-token system (Access 30min + Refresh 30d) with token versioning for full logout, Valkey-backed token blacklist for force logout, AES-256-GCM encryption vault with scrypt key derivation, and tamper-evident audit chain using SHA-256 hash chain."),
  paraBi("\u064a\u062a\u0636\u0645\u0646 \u0627\u0644 Rate Limiter 7 \u062d\u062f\u0648\u062f (LOGIN 5/15min, REGISTER 3/hr, OTP 5/5min, AI_CHAT 10/min, AI_BULK 3/min) \u0645\u0639 \u0631\u0633\u0627\u0644\u0627\u062a \u0623\u0639\u0637\u0627\u064b \u0639\u0631\u0628\u064a\u0629 \u0648IP spoofing-resistant extraction. \u0627\u0644 Password Policy \u064a\u0637\u0627\u0644\u0628 10 \u062d\u0631\u0648\u0641 \u0648\u0645\u062d\u0635\u0646 40/100 \u0645\u0639 penalties \u0644\u0640 repeated chars \u0648common starts. Session Management \u064a\u062d\u062f\u062f MAX_SESSIONS_PER_USER=5 \u0645\u0639 eviction.",
    "Rate Limiter has 7 limits (LOGIN 5/15min, REGISTER 3/hr, OTP 5/5min, AI_CHAT 10/min, AI_BULK 3/min) with Arabic messages and IP spoofing-resistant extraction. Password Policy requires 10 chars and score 40/100 with penalties for repeated chars and common starts. Session Management limits MAX_SESSIONS_PER_USER=5 with eviction."),
  paraBi("\u0627\u0644 Permissions Model \u064a\u062a\u0636\u0645\u0646 16 \u0645\u0641\u0627\u062a\u064a\u062d \u0645\u0646\u0638\u0645\u0629 \u0641\u064a 4 \u0645\u062c\u0645\u0648\u0639\u0627\u062a (Unlocked: \u0641\u0648\u0627\u062a\u0631/\u0639\u0645\u0627\u0644/\u0645\u062e\u0632\u0646\u060c Locked: admin/founder only) \u0645\u0639 4 role presets (viewer/employee/editor/admin).",
    "Permissions Model has 16 keys organized in 4 groups (Unlocked: invoices/customers/inventory, Locked: admin/founder only) with 4 role presets (viewer/employee/editor/admin)."),
];

// AI Fabric
const aiFabric = [
  h1("AI Fabric v2 \u0640 \u0646\u0633\u0649 16 \u0645\u0631\u0627\u062d\u0644 Cascade | 16-Phase Cascade"),
  paraBi("AI Fabric v2 \u064a\u0639\u0645\u0644 \u0643\u0634\u0627\u0634\u0627\u0629 cheapest-first: \u0643\u0644 \u0637\u0644\u0628 AI \u064a\u0639\u0628\u0631 \u0639\u0628\u0631 \u0645\u0631\u0627\u062d\u0644 \u0645\u062a\u062f\u0631\u062c\u0629\u060c \u0648\u0625\u0630\u0627 \u062d\u0644 \u0645\u0631\u062d\u0644\u0629 \u0627\u0644\u0645\u0633\u0623\u0644\u0629\u060c \u064a\u062a\u0648\u0642\u0641 pipeline \u0628\u062f\u0644 \u0627\u0644\u0627\u0633\u062a\u062f\u0627\u0639\u0627\u0640 AI.",
    "AI Fabric v2 operates as cheapest-first cascade: every AI request passes through progressive stages, and if a stage resolves the query, the pipeline stops instead of calling AI."),
  makeTable(
    ["# | Phase #", "\u0627\u0644\u0645\u0631\u062d\u0644\u0629 | Phase", "\u0627\u0644\u0648\u0635\u0641 | Description"],
    [
      ["1", "Cache Lookup", "Search CacheEntry by fabricHash. TTL-based expiry"],
      ["2", "Pattern Match", "Invoice Brain fingerprint + cross-company intelligence"],
      ["3", "Rule Evaluation", "Query promoted RuleCandidate matching input"],
      ["4", "Memory Retrieval", "Search AIMemoryEntry for same company+category"],
      ["5", "Budget Gate", "Block AI if hardStop enabled + spend >= budget"],
      ["6", "Provider Selection", "Cheapest provider with capability-based routing"],
      ["7", "Cost Estimation", "Estimate request cost before execution"],
      ["8", "AI Call", "The costly fallback \u0640 actual LLM call"],
      ["9", "Response Cache", "Store result in CacheEntry for future hits"],
      ["10", "Learning Save", "Save new pattern for reuse"],
      ["11", "Usage Logging", "Log to AIRequestLog with resolvedBy/cost/latency"],
      ["12", "Budget Update", "recordSpend() + threshold notification"],
      ["13", "Cost Tracking", "Per-invoice cost tracking"],
      ["14", "Provider Scoring", "Post-call provider performance evaluation"],
      ["15", "Cross-Company Intel", "Share anonymized patterns between tenants"],
      ["16", "AI Scoring", "Compute 0-100 score from hit rates"],
    ],
    [8, 20, 72],
  ),
  h2("\u0627\u0644 Budget Engine | Budget Engine"),
  paraBi("\u064a\u0645\u0643\u0646 Budget Engine \u0645\u0646 \u062a\u062d\u062f\u064a\u062f monthly budget \u0644\u0643\u0644 \u0634\u0631\u0643\u0629\u060c \u0645\u0639 hardStop \u0644\u0648\u0642\u0641 AI calls \u0639\u0646\u062f \u062a\u062c\u0627\u0648\u0632 \u0627\u0644\u062d\u062f\u060c \u0648forecast \u0644\u064a\u0648\u0631\u064a\u0646 spend \u0627\u0644\u0634\u0647\u0631\u064a: forecast = currentSpend \u00d7 (daysInMonth / daysElapsed). \u064a\u0631\u0627\u0633\u0644 Notification \u0639\u0646\u062f threshold crossing \u0645\u0639 Valkey-backed dedup.",
    "Budget Engine enables setting monthly budget per company, with hardStop to block AI calls when over budget, and monthly spend forecast: forecast = currentSpend \u00d7 (daysInMonth / daysElapsed). Sends Notification on threshold crossing with Valkey-backed dedup."),
  h2("\u0627\u0644 Profit Engine | Profit Engine"),
  paraBi("\u064a\u0639\u0645\u0644 Profit Engine \u0645\u0646 \u0627\u0644\u0645\u064a\u0627\u0647\u064a\u0627\u0644 \u0627\u0644\u0641\u0631\u064a\u062f\u0629: profit = revenue - aiCost - infra - worker. \u064a\u0633\u062a\u062e\u062f\u0645 \u0623\u0633\u0639\u0627\u0631 \u0627\u0644\u062e\u0637\u0648\u0637 (trial=$0, starter=$29/mo, business=$99/mo, enterprise=$299/mo) \u0648\u0640 AI cost \u0645\u0646 AIRequestLog.costUsd \u0627\u0644\u0641\u0631\u064a\u062f\u064a.",
    "Profit Engine works from real financial data: profit = revenue - aiCost - infra - worker. Uses plan prices (trial=$0, starter=$29/mo, business=$99/mo, enterprise=$299/mo) and real AI cost from AIRequestLog.costUsd."),
];

// Invoice Brain
const invoiceBrain = [
  h1("\u0646\u0645\u0627\u0624\u062c \u0627\u0644\u0641\u0648\u0627\u062a\u0631 | Invoice Brain"),
  paraBi("\u064a\u0639\u0645\u0644 Invoice Brain \u0628\u0645\u0646\u0633\u0649 pattern-first / AI-fallback: \u0627\u0644\u0641\u0627\u062a\u0631\u0629 \u0627\u0644\u0623\u0648\u0644\u0649 \u0645\u0646 \u0645\u0648\u0631\u062f \u062c\u062f\u064a\u062f \u062a\u0633\u062a\u062f\u0641\u064a LLM \u0645\u0631\u0629 \u0648\u062a\u062d\u0641\u0638 \u0627\u0644\u0646\u0645\u0627\u0626\u0638 \u0643 template\u060c \u0648\u0627\u0644\u0641\u0627\u062a\u0631\u0629 \u0627\u0644\u0645\u062a\u0645\u0627\u062b\u0644\u0629 \u0628\u0627\u0644\u0634\u0643\u0644 \u062a\u0633\u062a\u062e\u0631\u062c regex \u0641\u0642\u0637 \u0640 AI cost = $0.",
    "Invoice Brain works on pattern-first / AI-fallback hybrid: first invoice from a new supplier triggers LLM once and saves the pattern as a template, subsequent identical-shape invoices extract via regex only \u2014 AI cost = $0."),
  paraBi("\u062a\u0636\u0645\u0646 3 \u0625\u0635\u0644\u0627\u062d\u0627\u062a \u0645\u0633\u0627\u0648\u064a\u0629 (Normalization Fixes): N-03 (AI fallback: normalize each line BEFORE parsing)\u060c N-04 (Pattern parser: normalize BEFORE regex matching)\u060c N-05 (Schema: arabicIndicSafeNumber preprocesses numeric fields). \u0627\u0644\u0647\u062f\u0641 \u064a\u0636\u0645\u0646 \u0623\u0646 \u0627\u0644\u0623\u0631\u0642\u0627\u0645 \u0627\u0644\u0639\u0631\u0628\u064a\u0629-\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u0629 (\u0665\u0660) \u062a\u062a\u062d\u0648\u0644 \u0628\u0627\u0644\u0634\u0643\u0644 \u0627\u0644\u0633\u0644\u064a\u0645 \u0644\u0640 ASCII (50).",
    "3 normalization fixes included: N-03 (AI fallback: normalize each line BEFORE parsing), N-04 (Pattern parser: normalize BEFORE regex matching), N-05 (Schema: arabicIndicSafeNumber preprocesses numeric fields). Goal ensures Arabic-Indic digits (\u0665\u0660) convert cleanly to ASCII (50)."),
];

// Testing
const testing = [
  h1("\u0628\u064a\u0626\u0629 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631 | Testing Infrastructure"),
  paraBi("\u064a\u062a\u0636\u0645\u0646 v12.1 \u0645\u062c\u0645\u0648\u0639\u0629 \u0627\u062e\u062a\u0628\u0627\u0631 1855+ \u0645\u0644\u0641 \u062a\u062a\u0636\u0645\u0646 Founder Validation Suite \u0628\u0640 11 \u0623\u0642\u0633\u0627\u0645 + 170+ deep tests + 14 AI Fabric tests + 7 E2E tests.",
    "v12.1 includes 1855+ test files comprising Founder Validation Suite with 11 sections + 170+ deep tests + 14 AI Fabric tests + 7 E2E tests."),
  makeTable(
    ["\u0627\u0644\u0642\u0633\u0645 | Section", "\u0627\u0644\u062a\u063a\u0637\u064a\u0629 | Coverage"],
    [
      ["1. Seeder Validation", "\u0645\u0648\u0644\u062f \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a (10 \u062d\u062a\u064a 25,000 \u0634\u0631\u0643\u0629)"],
      ["2. Edge Cases", "20 \u0627\u062e\u062a\u0628\u0627\u0631 \u062d\u0627\u0641\u0629: null, max, Arabic"],
      ["3. Cost Validation", "\u062a\u0643\u0627\u0644\u064a\u0641: \u0644\u0643\u0644 \u0641\u0627\u062a\u0631\u0629/provider/tenant/\u0645\u0646\u0648\u0639"],
      ["4. Metrics", "error rate, cache hit, p50/p95/p99 latency"],
      ["5. Telemetry", "\u062a\u0633\u062c\u064a\u0644/\u062a\u0635\u0641\u064a\u0629 \u062d\u062f\u0648\u0627\u062b \u0628\u0640 tenant/model/provider"],
      ["6. Scale Tests", "\u062a\u062d\u0645\u064a\u0644 \u0645\u062a\u062f\u0631\u062c: 100 \u062d\u062a\u064a 10,000"],
      ["7. Report Validation", "\u0627\u0643\u0645\u0627\u0644 \u0648\u062f\u0642\u0629 \u0627\u0644\u062a\u0642\u0631\u064a\u0631"],
      ["8. Validation Logic", "\u0633\u0644\u0627\u0645\u0629 \u0627\u0644\u0645\u0639\u0631\u064a\u0641\u0627\u062a/\u0627\u0644\u0639\u0644\u0627\u0642\u0627\u062a/\u0627\u0644\u062d\u062f\u0648\u062f"],
      ["9. Learning Validation", "\u0645\u062d\u0631\u0643 \u0627\u0644\u062a\u0639\u0644\u0645 (pattern + memory)"],
      ["10. Failure Injection", "\u062d\u0642\u0646 \u0623\u0639\u0637\u0627\u0644: Valkey, Postgres, BullMQ, Network"],
      ["11. Deep Tests", "170+ \u0627\u062e\u062a\u0628\u0627\u0631: Arabic/cross-tenant/concurrent"],
    ],
    [40, 60],
  ),
];

// Valkey/BullMQ
const valkey = [
  h1("\u0627\u0644\u0628\u064a\u0626\u0629 \u0627\u0644\u062a\u062d\u062a\u064a\u0629 \u0640 Valkey + BullMQ | Infrastructure"),
  paraBi("\u0627\u0633\u062a\u0628\u062f\u0644 Redis \u0628\u0640 Valkey 8.1 \u0645\u0639 \u0625\u062f\u0627\u0631\u0629 \u0627\u0633\u062a\u062e\u062f\u0627\u0645 dual-backend: Valkey (\u0625\u0646\u062a\u0627\u062c) / in-memory Map (\u062a\u0637\u0648\u064a\u0631/sandbox). \u0627\u0644 URL normalization \u064a\u062d\u0648\u0644 valkey:// \u0644\u0640 redis:// \u0628\u0634\u0643\u0644 \u0633\u0644\u064a\u0645.",
    "Redis replaced with Valkey 8.1 with dual-backend management: Valkey (production) / in-memory Map (dev/sandbox). URL normalization converts valkey:// to redis:// transparently."),
  makeTable(
    ["\u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u0645\u0647\u0627\u0645 | Queue", "TTL", "Concurrency", "\u0627\u0644\u0647\u062f\u0641 | Purpose"],
    [
      ["ai-jobs", "60s", "2", "\u0645\u0639\u0627\u0644\u062c\u0629 AI"],
      ["email-jobs", "30s", "5", "\u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0628\u0631\u064a\u062f"],
      ["whatsapp-jobs", "30s", "5", "\u0631\u0633\u0627\u0644 WhatsApp"],
      ["backup-jobs", "600s", "5", "\u0627\u0644\u0646\u0633\u062e \u0627\u0644\u0627\u062d\u062a\u064a\u0627\u0637\u064a"],
      ["scheduler-jobs", "5s", "5", "\u0627\u0644\u0645\u0624\u062a\u0643\u0631\u0627\u062a"],
    ],
    [25, 10, 15, 50],
  ),
  paraBi("\u064a\u062a\u0636\u0645\u0646 BullMQ exponential backoff (3 retries: 1s\u0640\u06405s\u0640\u064015s)\u060c rate limiting\u060c priority\u060c delayed jobs\u060c \u0648distributed locking. \u0627\u0644\u0640 in-process fallback \u064a\u0633\u062a\u0646\u062f \u0644\u0640 Prisma JobQueue \u0645\u0639 stale lock recovery \u0648dead-letter recording.",
    "BullMQ includes exponential backoff (3 retries: 1s\u06405s\u064015s), rate limiting, priority, delayed jobs, and distributed locking. In-process fallback uses Prisma JobQueue with stale lock recovery and dead-letter recording."),
];

// MENA
const mena = [
  h1("\u062a\u0648\u0633\u064a\u0639 MENA \u0648\u0627\u0644\u0645\u064a\u0627\u0647 \u0627\u0644\u0639\u0631\u0628\u064a\u0629 | MENA & Arabic"),
  paraBi("\u064a\u062f\u0639\u0645 v12.1 \u0620+ \u062f\u0648\u0644 MENA \u0641\u064a 4 \u0645\u0633\u062a\u0648\u064a\u0627\u062a \u0645\u062a\u062f\u0631\u062c\u0629\u060c \u0645\u0639 \u0625\u0639\u062f\u0627\u062f\u0627\u062a \u062e\u0627\u0635\u0629 \u0644\u0643\u0644 \u062f\u0648\u0644\u0629: ISO code\u060c Arabic/English names\u060c currency\u060c VAT rate\u060c e-invoice authority\u060c weekend days.",
    "v12.1 supports 20+ MENA countries in 4 progressive tiers, with per-country configs: ISO code, Arabic/English names, currency, VAT rate, e-invoice authority, weekend days."),
  makeTable(
    ["\u0627\u0644\u0645\u0633\u062a\u0648\u064a | Tier", "\u0627\u0644\u062f\u0648\u0644 | Countries", "\u0623\u0645\u062b\u0644\u0629 | Examples"],
    [
      ["L0 (Gulf Core)", "6 \u062f\u0648\u0644", "KW, SA, AE, BH, OM, QA"],
      ["L1 (Levant+N. Africa)", "6 \u062f\u0648\u0644", "JO, MA, DZ, TN, IQ, LB"],
      ["L2 (Extended MENA)", "7 \u062f\u0648\u0644", "EG, PS, SY, YE, SD, LY + more"],
      ["L3 (Horn+Sahel)", "5 \u062f\u0648\u0644", "SO, DJ, KM, MR, ER"],
    ],
    [20, 15, 65],
  ),
  paraBi("\u064a\u062a\u0636\u0645\u0646 6 \u0633\u0644\u0637\u0627\u062a e-invoice (none, ZATCA, UAE_FTA, Bahrain_NBR, Oman_Tax, ETA_Egypt) \u0648\u0640 RTL \u0643\u0627\u0645\u0644 \u0648\u0640 landing page \u0628\u0640 12 feature cards \u0639\u0631\u0628\u064a\u0629 \u0648\u0640 Professional Footer \u0648\u0640 PWA manifest.",
    "Includes 6 e-invoice authorities (none, ZATCA, UAE_FTA, Bahrain_NBR, Oman_Tax, ETA_Egypt) + full RTL + landing page with 12 Arabic feature cards + Professional Footer + PWA manifest."),
];

// CI/CD
const cicd = [
  h1("\u0623\u0646\u0627\u0628\u064a\u062e CI/CD | CI/CD Pipeline"),
  paraBi("\u064a\u062a\u0636\u0645\u0643 5 GitHub Actions workflows: CI (lint+typecheck+build+tests)\u060c CD\u060c Security\u060c PR Checks\u060c Performance. \u064a\u0633\u062a\u0647\u062f\u0641 Bun 1.3.14 \u0648\u0640 PostgreSQL 16-alpine service containers.",
    "Comprises 5 GitHub Actions workflows: CI (lint+typecheck+build+tests), CD, Security, PR Checks, Performance. Targets Bun 1.3.14 and PostgreSQL 16-alpine service containers."),
  makeTable(
    ["\u0627\u0644\u0648\u0631\u064a\u0643\u0644\u0648\u0641 | Workflow", "\u0627\u0644\u0645\u0647\u0627\u0645 | Jobs"],
    [
      ["CI (ci.yml)", "lint \u0640 typecheck \u0640 build \u0640 unit tests \u0640 integration tests \u0640 summary"],
      ["CD (cd.yml)", "\u0627\u0644\u062a\u0639\u064a\u064a\u0646 Docker + standalone"],
      ["Security (security.yml)", "CodeQL + TruffleHog + Gitleaks"],
      ["PR Checks", "\u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 PR"],
      ["Performance", "Apache Bench load testing"],
    ],
    [30, 70],
  ),
  paraBi("\u064a\u062a\u0636\u0645\u0643 \u0627\u0644\u0640 CI Pipeline architecture compliance check (\u0644\u0627 module-level side effects \u0641\u064a workers) \u0648standalone build verification (.next/standalone exists, server.js \u0645\u0648\u062c\u0648\u062f). \u0627\u0644\u0640 Deployment \u0623\u0645\u0627\u0645\u064a\u0647: Vercel\u060c Docker + docker-compose\u060c Caddy.",
    "CI Pipeline includes architecture compliance check (no module-level side effects in workers) and standalone build verification (.next/standalone exists, server.js present). Deployment options: Vercel, Docker + docker-compose, Caddy."),
];

// Database
const database = [
  h1("\u0647\u064a\u0643\u0644 \u0627\u0644\u0642\u0627\u0639\u062f\u0629 \u0640 72+ \u0646\u0645\u0627\u062f\u062c | Database Schema"),
  paraBi("\u064a\u062a\u0636\u0645\u0643 Prisma schema \u0628\u0640 1,878 \u0633\u0637\u0631 \u0648 72+ \u0646\u0645\u0627\u062f\u062c\u060c PostgreSQL \u0641\u0642\u0637 (SQLite \u062a\u0645 \u0625\u0632\u0627\u0644\u064a\u0647 \u0641\u064a EA-002). 3 migrations \u0645\u0634\u0627\u0631\u0643\u0629:",
    "Prisma schema with 1,878 lines and 72+ models, PostgreSQL only (SQLite removed in EA-002). 3 migrations included:"),
  makeTable(
    ["\u0627\u0644 Migration | Migration", "\u0627\u0644\u062a\u0627\u0631\u064a\u062e | Date", "\u0627\u0644\u062a\u063a\u064a\u064a\u0631\u0627\u062a | Key Changes"],
    [
      ["init_ai_fabric", "2026-07-20", "AIRequestLog, CacheEntry, BudgetConfig, ProfitSnapshot"],
      ["add_economics_layer", "2026-07-20", "RuleCandidate, GlobalPattern, AIScoreSnapshot, CompiledRule"],
      ["add_security_hardening", "2026-07-20", "MFASecret, SessionRegistry, TamperEvidenceChain, WebhookEndpoint"],
    ],
    [20, 15, 65],
  ),
];

// Recommendations
const recommendations = [
  h1("\u062a\u0648\u0635\u064a\u0627\u062a \u0640 \u0627\u0644\u0637\u0631\u064a\u0642 \u0644\u0628\u0632\u0646\u0633 \u0627\u0644\u0645\u0644\u064a\u0648\u0646 \u062f\u0648\u0644\u0627\u0631 | Road to Million-Dollar Business"),
  paraBi("\u0628\u0646\u0627\u0621 \u0639\u0644\u064a \u0627\u0644\u0625\u0646\u062a\u0627\u062c \u0627\u0644\u0642\u064a\u0645 \u0644\u0640 v12.1\u060c \u0623\u0648\u0636\u062d \u0647\u0646\u0627 \u0627\u0644\u0645\u0645\u064a\u0632\u0627\u062a \u0648\u0627\u0644\u062a\u0643\u0627\u0645\u0644\u0627\u062a \u0627\u0644\u064a \u0644\u0648 \u0627\u0633\u062a\u0643\u0645\u0644\u0646\u0627\u0647\u0627 \u0645\u0645\u0643\u0646 \u064a\u0648\u0635\u0644 \u0627\u0644\u0646\u0638\u0627\u0645 \u0644\u0645\u0633\u062a\u0648\u064a \u0627\u0644\u0645\u0644\u064a\u0648\u0646 \u062f\u0648\u0644\u0627\u0631.",
    "Based on the solid v12.1 foundation, here are the features and integrations that could take the system to the million-dollar business level."),

  h2("1. SaaS \u0627\u0644\u062a\u062d\u062f\u064a\u062f \u0627\u0644\u0643\u0645\u064a | SaaS Monetization Engine"),
  paraBi("\u0627\u0644\u0646\u0638\u0627\u0645 \u0644\u062f\u064a\u0647 \u0628\u064a\u0627\u0646 \u0623\u0648\u0635\u0645 \u0623\u0633\u0639\u0627\u0631 \u0627\u0644\u062e\u0637\u0648\u0637 (trial=$0, starter=$29, business=$99, enterprise=$299) \u0648\u0644\u0643\u0646 \u0627\u0644\u0640 revenue \u0645\u0627\u0632\u0627\u0644 \u0627\u0633\u062a\u0648\u0627\u0631\u064a\u0627. \u0627\u0644\u0640\u0640\u062f\u0631\u0627\u0628 \u0627\u0644\u062d\u0627\u0642\u0648\u064a: \u0646\u0638\u0627\u0645 billing \u0641\u0631\u064a\u062f\u064a \u0645\u0639 Stripe/Paddle \u0644\u0640 subscription management\u060c metered billing \u0644\u0640 AI usage\u060c \u0648\u0640 annual contracts \u0645\u0639 volume discounts. \u0628\u0640 5,000 \u0634\u0631\u0643\u0627\u062a \u0640 business plan ($99/mo) = $5M ARR.",
    "The system has price tiers (trial=$0, starter=$29, business=$99, enterprise=$299) but revenue is still theoretical. Critical next step: real billing system with Stripe/Paddle for subscription management, metered billing for AI usage, and annual contracts with volume discounts. At 5,000 companies on business plan ($99/mo) = $5M ARR."),

  h2("2. \u0627\u0644\u0627\u062a\u0645\u0627\u062a \u0627\u0644\u062d\u0643\u0648\u0645\u064a\u0629 | Government Compliance Automation"),
  paraBi("\u0646\u0636\u0627\u0645 ZATCA (SA)\u060c UAE_FTA\u060c Bahrain_NBR \u064a\u0639\u0645\u0644 \u0648\u0644\u0643\u0646 \u0627\u0644\u0640\u0640\u062f\u0631\u0627\u0628 \u0627\u0644\u0642\u0627\u062f\u0631: \u0625\u0636\u0627\u0641\u0629 e-invoice submission pipeline \u0641\u0631\u064a\u062f\u064a \u0644\u0640 ZATCA Phase 2 API \u0648\u0640 UAE FTA API\u060c \u0648\u0625\u0636\u0627\u0641\u0629 VAT return auto-generation \u0648\u0640 tax compliance dashboard. \u0647\u0646\u0627 \u0642\u064a\u0645\u0629 \u0627\u0642\u062a\u0635\u0627\u062f\u064a\u0629 \u0643\u0627\u0628\u0631\u0629: \u0627\u0644\u0634\u0631\u0643\u0627\u062a \u0641\u064a MENA \u0645\u0644\u0632\u0645\u0629 \u0628\u0640 e-invoicing \u0648\u0648\u0644\u0627 \u062a\u0648\u062f \u0646\u0638\u0627\u0645 \u0645\u0643\u0645\u0644.",
    "ZATCA (SA), UAE_FTA, Bahrain_NBR framework exists but critical next step: add real e-invoice submission pipeline to ZATCA Phase 2 API and UAE FTA API, add VAT return auto-generation and tax compliance dashboard. Massive economic value: MENA companies are mandated to adopt e-invoicing and will pay for a complete system."),

  h2("3. AI Marketplace | AI Value Marketplace"),
  paraBi("\u0645\u0639 AI Fabric 16-phase cascade \u0648 Invoice Brain\u060c \u0627\u0644\u0640\u0640\u062f\u0631\u0627\u0628 \u0627\u0644\u0642\u0627\u062f\u0631: \u0625\u0636\u0627\u0641\u0629 AI Agent marketplace \u0644\u0640\u0640\u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u0627\u0644\u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u0643\u0627\u0628\u0631\u0629 (chat\u060c document QA\u060c forecasting)\u060c \u0648\u0640 white-label AI \u0644\u0640\u0640\u0634\u0631\u0643\u0627\u062a \u0627\u0644\u0627\u0633\u062a\u0634\u0627\u0631\u0629 \u0627\u0644\u062a\u064a \u064a\u0631\u064a\u062f\u0648\u0646 \u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0628\u064a\u0639 \u0628\u0640 AI-as-a-Service. \u0647\u0646\u0627 \u0633\u0628\u0649 \u0645\u0646\u0627\u0641\u0639\u0629 \u0625\u0636\u0627\u0641\u064a\u0629 \u0644\u0640\u0640\u0643\u0644 AI call.",
    "With AI Fabric 16-phase cascade and Invoice Brain, critical next step: add AI Agent marketplace for enterprise use cases (chat, document QA, forecasting), and white-label AI for consulting firms wanting to resell AI-as-a-Service. This creates an additional revenue stream per AI call."),

  h2("4. \u0627\u0644\u062a\u0643\u0627\u0645\u0644\u0627\u062a \u0627\u0644\u062d\u0627\u0642\u0648\u064a\u0629 | Critical Integrations"),
  paraBi("\u0627\u0644\u0640\u0640\u062f\u0631\u0627\u0628 \u0627\u0644\u062d\u0627\u0642\u0648\u064a: \u0625\u0636\u0627\u0641\u0629 Stripe/Paddle \u0644\u0640 billing\u060c Xero/QuickBooks \u0644\u0640 accounting sync\u060c Slack/Teams \u0644\u0640 notifications\u060c Zapier \u0644\u0640 workflow automation\u060c Shopify/WooCommerce \u0644\u0640 e-commerce sync. \u0627\u0644\u0640\u0640\u062f\u0631\u0627\u0628 \u0627\u0644\u0642\u0627\u062f\u0631 \u0627\u0644\u0627\u0633\u062a\u0631\u0627\u062f\u064a\u064a: HubSpot \u0644\u0640 CRM sync \u0648\u0640 Oracle NetSuite \u0644\u0640 enterprise ERP sync. \u0647\u0646\u0627 \u062a\u0643\u0627\u0645\u0644\u0627\u062a \u062a\u0646\u0641\u0639 \u0643\u0644 \u0634\u0631\u0643\u0629 \u0645\u0646\u0645\u0646\u062a\u0629 \u0644\u0640\u0640\u0640\u0640\u0640\u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a.",
    "Critical next step: add Stripe/Paddle for billing, Xero/QuickBooks for accounting sync, Slack/Teams for notifications, Zapier for workflow automation, Shopify/WooCommerce for e-commerce sync. Strategic next step: HubSpot for CRM sync and Oracle NetSuite for enterprise ERP sync. These integrations benefit every enterprise client wanting to use their data."),

  h2("5. Mobile PWA \u0648\u0640 POS | Mobile & POS"),
  paraBi("\u0627\u0644\u0640\u0640\u062f\u0631\u062a \u0644\u062f\u064a\u0647 PWA manifest \u0648\u0644\u0643\u0646 \u0627\u0644\u0640\u0640\u062f\u0631\u0627\u0628 \u0627\u0644\u0642\u0627\u062f\u0631: \u0625\u0636\u0627\u0641\u0629 \u062a\u062c\u0631\u062a\u0629 mobile \u0641\u0631\u064a\u062f\u064a\u0629 \u0644\u0640\u0640\u0640\u0635\u0627\u062d\u0628 \u0627\u0644\u0645\u062a\u0627\u062c\u0631 \u0627\u0644\u0635\u063a\u064a\u0631\u0629 (scan invoice\u060c approve payment\u060c track expenses)\u060c \u0648\u0640 POS integration \u0644\u0640\u0640\u0640\u0627\u0644\u0645\u062a\u0627\u062c\u0631 \u0627\u0644\u062a\u064a \u062a\u0628\u064a\u0639 \u0641\u064a \u0627\u0644\u0640\u0640\u0640\u0640\u0645\u062a\u062c\u0631 \u0648\u062a\u0648\u062f \u0641\u0627\u062a\u0631\u0629 \u0625\u0644\u064a\u062a\u0631\u0648\u0646\u064a\u0629 \u0628\u0627\u0644\u0634\u0643\u0644 \u0627\u0644\u0633\u0644\u064a\u0645.",
    "PWA manifest exists but critical next step: add real mobile experience for small merchants (scan invoice, approve payment, track expenses), and POS integration for merchants selling in-store who want electronic invoicing cleanly."),
];

// ── Assemble Document ──
const coverConfig = {
  title: "GarfiX EOS v12.1 \u2014 Technical Release Report",
  subtitle: "\u062a\u0642\u0631\u064a\u0631 \u062a\u0642\u0646\u064a \u0644\u0625\u0635\u062f\u0627\u0631 v12.1: \u062a\u0639\u0627\u0632 \u0623\u0645\u0646\u064a + AI Fabric + 1855+ Tests",
  englishLabel: "ENTERPRISE ERP RELEASE REPORT",
  metaLines: [
    "Version: 12.1.0 | \u0627\u0644\u0625\u0635\u062f\u0627\u0631: 12.1.0",
    "Author: ahmedezzatelsayad | \u0627\u0644\u0645\u0624\u0644\u0641: ahmedezzatelsayad",
    "Date: July 2026 | \u0627\u0644\u062a\u0627\u0631\u064a\u062e: \u064a\u0648\u0644\u064a\u0648 2026",
    "License: MIT | \u0627\u0644\u062a\u0631\u062e\u064a\u0635: MIT",
  ],
  footerLeft: "github.com/ahmedezzatelsayad/Garfix",
  footerRight: "v12.1.0 \u2014 2026",
  palette: palette.cover,
};

const coverChildren = buildCoverR1(coverConfig);

const tocChildren = [
  new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 480, after: 360 },
    children: [new TextRun({ text: "\u0627\u0644\u0641\u0647\u0631\u0633 | Table of Contents", bold: true, size: 32,
      font: { eastAsia: "SimHei", ascii: "Times New Roman" } })],
  }),
  new TableOfContents("Table of Contents", {
    hyperlink: true,
    headingStyleRange: "1-3",
  }),
  new Paragraph({
    spacing: { before: 200 },
    children: [new TextRun({
      text: "Note: This Table of Contents is generated via field codes. To ensure page number accuracy, please right-click the TOC and select \"Update Field.\"",
      italics: true, size: 18, color: "888888",
    })],
  }),
  new Paragraph({ children: [new PageBreak()] }),
];

const bodyChildren = [
  ...execSummary,
  ...background,
  ...security,
  ...aiFabric,
  ...invoiceBrain,
  ...testing,
  ...valkey,
  ...mena,
  ...cicd,
  ...database,
  ...recommendations,
];

const doc = new Document({
  styles: {
    default: {
      document: {
        run: {
          font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
          size: 24, color: c(palette.body),
        },
        paragraph: {
          spacing: { line: 312 },
        },
      },
      heading1: {
        run: {
          font: { ascii: "Times New Roman", eastAsia: "SimHei" },
          size: 32, bold: true, color: c(palette.table.headerBg),
        },
      },
      heading2: {
        run: {
          font: { ascii: "Times New Roman", eastAsia: "SimHei" },
          size: 28, bold: true, color: c(palette.table.headerBg),
        },
      },
      heading3: {
        run: {
          font: { ascii: "Times New Roman", eastAsia: "SimHei" },
          size: 24, bold: true, color: c(palette.secondary),
        },
      },
    },
  },
  sections: [
    // Section 1: Cover (no page numbers)
    {
      properties: {
        page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } },
      },
      children: coverChildren,
    },
    // Section 2: Front matter (TOC) — Roman numerals
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: pgSize, margin: pgMargin,
          pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN },
        },
      },
      footers: { default: footerRoman() },
      children: tocChildren,
    },
    // Section 3: Body — Arabic numerals starting from 1
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: pgSize, margin: pgMargin,
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        },
      },
      headers: { default: headerBody() },
      footers: { default: footerArabic() },
      children: bodyChildren,
    },
  ],
});

// ── Generate ──
const OUTPUT_PATH = "/home/z/my-project/download/GarfiX_v12.1_Technical_Report.docx";

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(OUTPUT_PATH, buffer);
  console.log("Report generated: " + OUTPUT_PATH);
}).catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
