import { jsPDF } from 'jspdf';

/**
 * Builds the PDF export of a simulation report.
 *
 * Deliberately NOT html2canvas: this project is on Tailwind v4, whose generated
 * CSS uses `oklch()` colours that html2canvas cannot parse - it would produce a
 * blank or broken page. Instead the document is laid out programmatically, which
 * also keeps the text selectable and guarantees nothing is clipped by whatever
 * happened to be scrolled into view.
 *
 * Charts and the architecture diagram are pulled in as SVG, rasterised through a
 * canvas, and embedded as images. Recharts and our own diagram both emit SVG
 * with explicit colours, so they survive that round-trip intact.
 */

/**
 * jsPDF's built-in Helvetica is a standard-14 font limited to WinAnsi. Anything
 * outside it (bullets, middle dots, smart quotes, arrows - all of which appear in
 * LLM-written narrative text) renders as a replacement box, so map the common
 * offenders to ASCII and drop whatever is left.
 */
const ascii = (value: string): string =>
  (value || '')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[•●·]/g, '-')
    .replace(/…/g, '...')
    .replace(/[→➡]/g, '->')
    .replace(/←/g, '<-')
    .replace(/ /g, ' ')
    // Anything still outside printable ASCII (plus newline) has no WinAnsi glyph.
    .replace(/[^\x20-\x7E\n]/g, '');

const A4_W = 210;
const A4_H = 297;
const MARGIN = 15;
const CONTENT_W = A4_W - MARGIN * 2;

const INK = {
  heading: [17, 17, 20] as [number, number, number],
  body: [63, 63, 70] as [number, number, number],
  muted: [113, 113, 122] as [number, number, number],
  rule: [228, 228, 231] as [number, number, number],
  accent: [37, 99, 235] as [number, number, number],
};

const PRIORITY_INK: Record<string, [number, number, number]> = {
  critical: [220, 38, 38],
  high: [234, 88, 12],
  medium: [161, 98, 7],
  low: [37, 99, 235],
};

/**
 * Rasterises an on-page <svg> to a PNG data URL.
 *
 * Width/height are forced onto the clone because a chart sized purely by CSS has
 * no intrinsic dimensions, and an <img> loading such an SVG would render at 0x0.
 */
const svgToPng = async (svg: SVGSVGElement, scale = 2): Promise<{ dataUrl: string; width: number; height: number } | null> => {
  try {
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const width = Math.round(viewBox?.width || rect.width || 800);
    const height = Math.round(viewBox?.height || rect.height || 400);
    if (width === 0 || height === 0) return null;

    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (!clone.getAttribute('viewBox')) {
      clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }

    const serialized = new XMLSerializer().serializeToString(clone);
    const blobUrl = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }));

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('SVG rasterisation failed'));
        img.src = blobUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // The report renders on a dark ground; the PDF page is white, so paint the
      // chart's own dark background back in rather than letting it go transparent.
      ctx.fillStyle = '#0b0b10';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      return { dataUrl: canvas.toDataURL('image/png'), width, height };
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  } catch {
    return null;
  }
};

interface Recommendation {
  id: string;
  priority: string;
  title: string;
  detail: string;
  origin: string;
  action: string;
  targetNodeIds: string[];
}

interface ReportLike {
  projectName: string;
  createdAt?: string;
  simulationId?: string | null;
  universeSeed: string;
  stableHash: string;
  /** The model's letter, or null when the model withheld one. */
  grade: string | null;
  gradeConfidence?: number | null;
  gradeRationale?: string[];
  /** The simulation's own score, printed under its own name. */
  simulatedResilienceScore: number;
  status: string;
  metrics: {
    totalRequests: number;
    failedRequests: number;
    successRate: number;
    peakLatency: number;
    errorRatePercent: number;
  };
  collapseTime: string;
  rootCause: { summary: string; primaryCause: string; contributingFactors: string[] };
  intelligence: {
    source: string;
    model: {
      available: boolean;
      riskClass: string;
      letter: string;
      confidence: number;
      classProbabilities: Record<string, number>;
      inferenceTimeMs: number | null;
    } | null;
    overallRisk: number;
    predictedFailureMode: string;
    narrative: string;
    nodeFindings: Array<{
      label: string;
      riskScore: number;
      role: string | null;
      isSinglePointOfFailure: boolean;
      blastRadius: number;
      reasons: string[];
    }>;
    edgeFindings: Array<{ sourceLabel: string; targetLabel: string; riskScore: number }>;

  };
  recommendations: Recommendation[];
  narrativeReview?: string;
  graph: { nodes: any[]; edges: any[] };
}

export const exportReportToPdf = async (report: ReportLike): Promise<void> => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  let y = MARGIN;
  let pageNumber = 1;

  const setInk = (rgb: [number, number, number]) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);

  const footer = () => {
    doc.setFontSize(7.5);
    setInk(INK.muted);
    doc.setFont('helvetica', 'normal');
    doc.text(ascii('InfraZero simulation report'), MARGIN, A4_H - 8);
    doc.text(`Page ${pageNumber}`, A4_W - MARGIN, A4_H - 8, { align: 'right' });
  };

  const newPage = () => {
    footer();
    doc.addPage();
    pageNumber += 1;
    y = MARGIN;
  };

  /** Adds a page when `needed` mm would overflow the text area. */
  const ensure = (needed: number) => {
    if (y + needed > A4_H - 18) newPage();
  };

  const heading = (text: string) => {
    ensure(16);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    setInk(INK.heading);
    doc.text(ascii(text), MARGIN, y);
    y += 2.5;
    doc.setDrawColor(INK.rule[0], INK.rule[1], INK.rule[2]);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, A4_W - MARGIN, y);
    y += 6;
  };

  const paragraph = (text: string, options: { size?: number; ink?: [number, number, number]; indent?: number } = {}) => {
    if (!text) return;
    const size = options.size ?? 9.5;
    const indent = options.indent ?? 0;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    setInk(options.ink ?? INK.body);
    const lines = doc.splitTextToSize(ascii(text), CONTENT_W - indent) as string[];
    for (const line of lines) {
      ensure(size * 0.42 + 1.4);
      doc.text(line, MARGIN + indent, y);
      y += size * 0.42 + 1.4;
    }
  };

  const keyValueRow = (pairs: Array<[string, string]>) => {
    const colW = CONTENT_W / pairs.length;
    ensure(12);
    pairs.forEach(([label, value], i) => {
      const x = MARGIN + i * colW;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      setInk(INK.muted);
      doc.text(ascii(label.toUpperCase()), x, y);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      setInk(INK.heading);
      const fitted = doc.splitTextToSize(ascii(value), colW - 3) as string[];
      doc.text(fitted[0] ?? '-', x, y + 5);
    });
    y += 12;
  };

  const embedSvg = async (selector: string, caption?: string, maxHeight = 95) => {
    const svg = document.querySelector(selector) as SVGSVGElement | null;
    if (!svg) return false;

    const raster = await svgToPng(svg);
    if (!raster) return false;

    const drawW = CONTENT_W;
    const drawH = Math.min(maxHeight, (raster.height / raster.width) * drawW);
    ensure(drawH + (caption ? 8 : 4));
    doc.addImage(raster.dataUrl, 'PNG', MARGIN, y, drawW, drawH, undefined, 'FAST');
    y += drawH + 3;
    if (caption) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      setInk(INK.muted);
      doc.text(ascii(caption), MARGIN, y);
      y += 5;
    }
    return true;
  };

  // ---------------------------------------------------------------- title ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setInk(INK.accent);
  doc.text('INFRAZERO  //  ARCHITECTURE SIMULATION REPORT', MARGIN, y);
  y += 9;

  doc.setFontSize(23);
  setInk(INK.heading);
  const titleLines = doc.splitTextToSize(ascii(report.projectName), CONTENT_W) as string[];
  for (const line of titleLines) {
    doc.text(line, MARGIN, y);
    y += 9.5;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setInk(INK.muted);
  const generated = report.createdAt ? new Date(report.createdAt) : new Date();
  doc.text(ascii(`Generated ${generated.toLocaleString()}`), MARGIN, y);
  y += 8;

  // ------------------------------------------------------------- verdict ----
  heading('1.  Verdict');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(40);
  // An em dash where the letter would be: the model withheld its verdict, and
  // the exported PDF says so rather than substituting the simulation's score.
  setInk(report.grade?.toUpperCase().startsWith('F') ? PRIORITY_INK.critical : INK.heading);
  doc.text(ascii(report.grade ?? '-'), MARGIN, y + 12);

  doc.setFontSize(10);
  setInk(INK.body);
  doc.text(
    report.grade
      ? `model, ${Math.round((report.gradeConfidence ?? 0) * 100)}% confidence`
      : 'grade withheld',
    MARGIN + 26,
    y + 6,
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setInk(INK.muted);
  doc.text(ascii(report.status), MARGIN + 26, y + 11.5);
  const sourceLabel =
    report.intelligence.source === 'model+rules'
      ? 'Trained model + rule engine'
      : 'Rule engine only (model unavailable)';
  doc.text(ascii(`Analysis: ${sourceLabel}`), MARGIN + 26, y + 16.5);
  y += 24;

  keyValueRow([
    ['Total requests', report.metrics.totalRequests.toLocaleString()],
    ['Failed', report.metrics.failedRequests.toLocaleString()],
    ['Success rate', `${(report.metrics.successRate * 100).toFixed(2)}%`],
    ['Peak latency', `${Math.round(report.metrics.peakLatency)} ms`],
  ]);
  keyValueRow([
    ['Collapse point', report.collapseTime || '-'],
    ['Overall risk', `${Math.round(report.intelligence.overallRisk * 100)}%`],
    ['Universe seed', report.universeSeed],
    ['Stable hash', report.stableHash.slice(0, 16)],
  ]);

  // --------------------------------------------------------- architecture ----
  heading('2.  Architecture and where to change it');
  paragraph(
    'Numbered badges mark the components each recommendation in section 5 applies to. ' +
    'Outline colour is the priority of the highest-ranked finding on that component; ' +
    'dashed links are call paths flagged as fragile.',
    { ink: INK.muted, size: 8.5 },
  );
  y += 1;
  const diagramEmbedded = await embedSvg('#iz-architecture-diagram', undefined, 110);
  if (!diagramEmbedded) {
    paragraph('(Diagram unavailable in this export.)', { ink: INK.muted, size: 8.5 });
  }

  // ------------------------------------------------------------ simulation ---
  heading('3.  Simulation behaviour');
  await embedSvg('#iz-latency-chart svg', 'Latency across the simulated run.', 78);
  paragraph(report.rootCause.summary);
  if (report.rootCause.primaryCause && report.rootCause.primaryCause !== 'None') {
    y += 1.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setInk(INK.heading);
    ensure(6);
    doc.text('Primary cause', MARGIN, y);
    y += 4.5;
    paragraph(report.rootCause.primaryCause);
  }
  for (const factor of report.rootCause.contributingFactors) {
    paragraph(`-  ${factor}`, { size: 8.8, indent: 2 });
  }

  // ---------------------------------------------------------- intelligence ---
  heading('4.  Model analysis');
  if (report.intelligence.model) {
    const model = report.intelligence.model;
    keyValueRow([
      ['Model grade', model.letter],
      ['Risk class', model.riskClass],
      ['Confidence', `${(model.confidence * 100).toFixed(1)}%`],
      ['Inference', model.inferenceTimeMs != null ? `${model.inferenceTimeMs} ms` : '-'],
    ]);
    const dist = Object.entries(model.classProbabilities)
      .map(([name, p]) => `${name} ${(p * 100).toFixed(1)}%`)
      .join('   |   ');
    paragraph(`Class distribution:  ${dist}`, { size: 8.8, ink: INK.muted });
    y += 2;
    await embedSvg('#iz-class-chart svg', 'Risk class distribution from the model.', 42);
  } else {
    paragraph(
      'The trained topology model was not reachable for this run, so the findings below come ' +
      'from the rule engine alone. Structural findings such as single points of failure are ' +
      'only produced by the model and are therefore absent.',
      { ink: INK.muted },
    );
  }

  y += 2;
  paragraph(`Predicted failure mode: ${report.intelligence.predictedFailureMode}`, { size: 9.5 });
  if (report.intelligence.narrative) {
    y += 1.5;
    paragraph(report.intelligence.narrative);
  }

  if (report.intelligence.nodeFindings.length > 0) {
    y += 3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    setInk(INK.heading);
    ensure(7);
    doc.text('Component findings', MARGIN, y);
    y += 5.5;

    await embedSvg('#iz-risk-chart svg', undefined, 60);

    for (const finding of report.intelligence.nodeFindings.slice(0, 12)) {
      ensure(9);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      setInk(INK.heading);
      doc.text(ascii(finding.label), MARGIN + 2, y);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      setInk(INK.muted);
      const bits = [
        `risk ${Math.round(finding.riskScore * 100)}%`,
        finding.role ? `role ${finding.role}` : null,
        finding.isSinglePointOfFailure ? 'SINGLE POINT OF FAILURE' : null,
        finding.blastRadius > 0 ? `blast radius ${Math.round(finding.blastRadius * 100)}%` : null,
      ].filter(Boolean).join('   |   ');
      doc.text(ascii(bits), A4_W - MARGIN, y, { align: 'right' });
      y += 4;

      if (finding.reasons.length > 0) {
        paragraph(finding.reasons.join(' '), { size: 8.2, ink: INK.body, indent: 2 });
      }
      y += 1;
    }
  }

  // The on-screen report shows these as "Riskiest call paths"; the export has to
  // carry them too, or the PDF is not the whole report.
  const riskyPaths = report.intelligence.edgeFindings.filter((edge) => edge.riskScore > 0);
  if (riskyPaths.length > 0) {
    y += 3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    setInk(INK.heading);
    ensure(7);
    doc.text('Riskiest call paths', MARGIN, y);
    y += 5.5;

    for (const edge of riskyPaths.slice(0, 8)) {
      ensure(6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.6);
      setInk(INK.body);
      doc.text(ascii(`${edge.sourceLabel} -> ${edge.targetLabel}`), MARGIN + 2, y);

      doc.setFont('helvetica', 'bold');
      setInk(edge.riskScore > 0.6 ? PRIORITY_INK.critical : edge.riskScore > 0.3 ? PRIORITY_INK.medium : INK.accent);
      doc.text(`${Math.round(edge.riskScore * 100)}%`, A4_W - MARGIN, y, { align: 'right' });
      y += 4.6;
    }
  }

  // ------------------------------------------------------- recommendations ---
  heading('5.  Recommendations');
  if (report.recommendations.length === 0) {
    paragraph('No changes recommended for this architecture.', { ink: INK.muted });
  }

  report.recommendations.forEach((rec, index) => {
    ensure(16);
    const ink = PRIORITY_INK[rec.priority] ?? INK.accent;

    // Numbered marker matching the badge drawn on the diagram in section 2.
    doc.setFillColor(ink[0], ink[1], ink[2]);
    doc.circle(MARGIN + 2.6, y - 1.2, 2.6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(String(index + 1), MARGIN + 2.6, y + 0.3, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setInk(INK.heading);
    const titleLines2 = doc.splitTextToSize(ascii(rec.title), CONTENT_W - 10) as string[];
    doc.text(titleLines2[0], MARGIN + 8, y);
    y += 4.6;
    for (const extra of titleLines2.slice(1)) {
      ensure(5);
      doc.text(extra, MARGIN + 8, y);
      y += 4.6;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    setInk(ink);
    doc.text(ascii(`${rec.priority.toUpperCase()}  |  ${rec.action}  |  from ${rec.origin}`), MARGIN + 8, y);
    y += 4.4;

    paragraph(rec.detail, { size: 8.8, indent: 8 });
    y += 3;
  });

  // ------------------------------------------------------------- rationale ---
  if (report.gradeRationale && report.gradeRationale.length > 0) {
    heading('6.  Grading rationale');
    for (const line of report.gradeRationale) {
      paragraph(`-  ${line}`, { size: 8.5, indent: 2 });
    }
  }

  if (report.narrativeReview) {
    heading('7.  Review summary');
    paragraph(report.narrativeReview);
  }

  footer();

  const safeName = report.projectName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  doc.save(`infrazero-report-${safeName || 'architecture'}.pdf`);
};
