import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  renderCasePdf,
  reportHash,
  ReportRenderError,
  type ReportSnapshot,
} from '../src/case-report.js';

const snapshot = (): ReportSnapshot => ({
  format: 'leaseflow-case-v1',
  id: 'case-1',
  contractId: 'contract-1',
  type: 'MAINTENANCE',
  title: 'Tap repair',
  description: 'A factual report',
  status: 'RESOLVED',
  version: 2,
  createdAt: '2026-11-08T00:00:00.000Z',
  events: [
    {
      id: 'event-1',
      actorName: 'Original Tenant',
      actorRole: 'TENANT',
      kind: 'SUBMITTED',
      message: 'The tap leaks.',
      fromStatus: null,
      sequence: 1,
      createdAt: '2026-11-08T00:00:00.000Z',
    },
  ],
});
describe('case PDF renderer', () => {
  it('hashes canonical factual data without dependence on JSON property order', () => {
    const original = snapshot();
    expect(reportHash(original)).toMatch(/^[a-f0-9]{64}$/);
    expect(reportHash(Object.fromEntries(Object.entries(original).reverse()))).toBe(
      reportHash(original),
    );
    expect(reportHash({ ...original, description: 'Changed fact' })).not.toBe(reportHash(original));
  });
  it('produces a real PDF with factual metadata and deterministic source identity', async () => {
    const bytes = await renderCasePdf(snapshot(), 'report-1', new Date('2026-11-08T12:00:00Z'));
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe('LeaseFlow case history');
    expect(pdf.getSubject()).toContain('not legal findings');
  });
  it('wraps long tokens and preserves multipage histories', async () => {
    const data = snapshot();
    data.events = Array.from({ length: 30 }, (_, index) => ({
      ...data.events[0]!,
      id: 'event-' + index,
      sequence: index + 1,
      message: 'A'.repeat(500),
    }));
    const pdf = await PDFDocument.load(await renderCasePdf(data, 'long-report', new Date()));
    expect(pdf.getPageCount()).toBeGreaterThan(3);
    for (const page of pdf.getPages()) expect(page.getWidth()).toBeCloseTo(595.28);
  });
  it('fails explicitly for unsupported text rather than silently removing characters', async () => {
    await expect(
      renderCasePdf({ ...snapshot(), title: 'مرحبا' }, 'unicode-report', new Date()),
    ).rejects.toEqual(new ReportRenderError('UNSUPPORTED_TEXT'));
  });
});
