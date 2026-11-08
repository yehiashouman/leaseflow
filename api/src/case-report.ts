import { createHash } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { z } from 'zod';
import type { CaseRecord } from './case-data.js';

const snapshotSchema = z.object({
  format: z.literal('leaseflow-case-v1'),
  id: z.string(),
  contractId: z.string(),
  type: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.string(),
  version: z.number().int(),
  createdAt: z.string(),
  events: z.array(
    z.object({
      id: z.string(),
      actorName: z.string().nullable(),
      actorRole: z.string().nullable(),
      kind: z.string(),
      message: z.string().nullable(),
      fromStatus: z.string().nullable(),
      sequence: z.number().nullable(),
      createdAt: z.string(),
    }),
  ),
});
export type ReportSnapshot = z.infer<typeof snapshotSchema>;
export class ReportRenderError extends Error {
  constructor(public readonly code: 'UNSUPPORTED_TEXT' | 'REPORT_TOO_LARGE') {
    super(code);
  }
}
export function reportSnapshot(row: CaseRecord): ReportSnapshot {
  const snapshot: ReportSnapshot = {
    format: 'leaseflow-case-v1',
    id: row.id,
    contractId: row.contractId,
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    events: row.events.map((event) => ({
      id: event.id,
      actorName: event.actorName,
      actorRole: event.actorRole,
      kind: event.kind,
      message: event.message,
      fromStatus: event.fromStatus,
      sequence: event.sequence,
      createdAt: event.createdAt.toISOString(),
    })),
  };
  if (snapshot.events.length > 2000 || Buffer.byteLength(JSON.stringify(snapshot)) > 512000)
    throw new ReportRenderError('REPORT_TOO_LARGE');
  return snapshot;
}
export function reportHash(snapshot: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(snapshotSchema.parse(snapshot)))
    .digest('hex');
}
export async function renderCasePdf(input: unknown, reportId: string, generatedAt: Date) {
  const snapshot = snapshotSchema.parse(input);
  const doc = await PDFDocument.create();
  doc.setTitle('LeaseFlow case history');
  doc.setSubject('Factual platform records; not legal findings or certification');
  doc.setCreationDate(generatedAt);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595.28, 841.89]);
  let y = 790;
  function wrap(text: string, heading = false) {
    const face = heading ? bold : font;
    const size = heading ? 13 : 10;
    const safe = text.replace(/\r\n?/g, '\n').replaceAll('\t', '    ');
    try {
      face.encodeText(safe.replaceAll('\n', ' '));
    } catch {
      throw new ReportRenderError('UNSUPPORTED_TEXT');
    }
    const lines: string[] = [];
    for (const paragraph of safe.split('\n')) {
      let buffer = '';
      for (const token of paragraph.match(/\S+|\s+/g) ?? []) {
        if (face.widthOfTextAtSize(buffer + token, size) <= 491) {
          buffer += token;
          continue;
        }
        if (buffer.trimEnd()) lines.push(buffer.trimEnd());
        buffer = '';
        for (const char of Array.from(token.trimStart())) {
          if (face.widthOfTextAtSize(buffer + char, size) > 491) {
            lines.push(buffer);
            buffer = '';
          }
          buffer += char;
        }
      }
      lines.push(buffer.trimEnd());
    }
    return lines;
  }
  function line(text: string, heading = false) {
    for (const textLine of wrap(text, heading))
      draw(textLine, heading ? bold : font, heading ? 13 : 10);
  }
  function draw(text: string, face: typeof font, size: number) {
    if (y < 65) {
      page = doc.addPage([595.28, 841.89]);
      y = 790;
    }
    page.drawText(text, { x: 52, y, size, font: face, color: rgb(0.1, 0.13, 0.12) });
    y -= 15;
  }
  line('LeaseFlow | Case history', true);
  line('Factual platform records. Not legal findings or certification.');
  line('Scope: case text and recorded events only. Financial records and files are excluded.');
  line('Report ID: ' + reportId);
  line('Generated at: ' + generatedAt.toISOString());
  line('Snapshot SHA-256: ' + reportHash(snapshot));
  line('Case ID: ' + snapshot.id);
  line('Contract ID: ' + snapshot.contractId);
  line('Case version: ' + snapshot.version + ' | State: ' + snapshot.status);
  line('Created at: ' + snapshot.createdAt);
  line('Type: ' + snapshot.type);
  line('');
  line(snapshot.title, true);
  line(snapshot.description);
  line('');
  line('Recorded history', true);
  for (const event of snapshot.events) {
    const block: [string, boolean][] = [
      ['', false],
      [`${event.sequence ?? '-'} | ${event.createdAt} | ${event.kind}`, true],
      [`${event.actorName ?? 'Legacy author unavailable'} | ${event.actorRole ?? 'System'}`, false],
      ...(event.fromStatus
        ? [['From state: ' + event.fromStatus, false] as [string, boolean]]
        : []),
      ...(event.message ? [[event.message, false] as [string, boolean]] : []),
      ['Event ID: ' + event.id, false],
    ];
    const height = block.reduce(
      (total, [text, heading]) => total + wrap(text, heading).length * 15,
      0,
    );
    if ((height <= 720 && y - height < 65) || y < 125) {
      page = doc.addPage([595.28, 841.89]);
      y = 790;
    }
    for (const [text, heading] of block) line(text, heading);
  }
  const pages = doc.getPages();
  pages.forEach((item, index) =>
    item.drawText(`LeaseFlow | ${index + 1} / ${pages.length} | All timestamps UTC`, {
      x: 52,
      y: 30,
      size: 8,
      font,
      color: rgb(0.35, 0.35, 0.35),
    }),
  );
  return Buffer.from(await doc.save());
}
