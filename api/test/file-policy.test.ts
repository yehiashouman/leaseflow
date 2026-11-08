import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import {
  fileConfigSchema,
  fileDigest,
  fileMetadataSchema,
  fileState,
  safeFilename,
  sanitizeFile,
  verifyFile,
} from '../src/file-policy.js';
import { createFileGrant, verifyFileGrant } from '../src/file-grant.js';
const png = () =>
  sharp({ create: { width: 4, height: 3, channels: 3, background: '#ff0000' } })
    .png()
    .toBuffer();
const expected = { id: 'file-1', sub: 'owner-1', sid: 'session-1', hash: 'abc' };
describe('private file content and signed grants', () => {
  it('accepts actual PNG content with a consistent MIME type and extension', async () => {
    expect(verifyFile(await png(), 'image/png', 'UNIT_PHOTO', 'room.png')).toBe('image/png');
  });
  it.each(['text/html', 'image/jpeg', 'application/pdf'])(
    'rejects a false %s MIME declaration',
    async (mime) => {
      expect(() =>
        verifyFile(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), mime, 'IDENTITY', 'id.png'),
      ).toThrow('MIME_MISMATCH');
    },
  );
  it.each(['id.exe', 'id.php.png', 'id.svg', 'id.js.png'])(
    'rejects executable filename %s',
    async (name) => {
      expect(() => verifyFile(awaitablePng(), 'image/png', 'IDENTITY', name)).toThrow(
        'EXECUTABLE_NAME',
      );
    },
  );
  it('rejects HTML and SVG disguised as raster files', () => {
    for (const bytes of ['<html>bad</html>', '<svg onload="x()"/>', 'MZexecutable'])
      expect(() => verifyFile(Buffer.from(bytes), 'image/png', 'IDENTITY', 'id.png')).toThrow(
        'UNSUPPORTED_CONTENT',
      );
  });
  it('rejects an empty or excessive upload', () => {
    expect(() => verifyFile(Buffer.alloc(0), 'image/png', 'IDENTITY', 'id.png')).toThrow(
      'FILE_SIZE',
    );
    expect(() =>
      verifyFile(Buffer.alloc(10 * 1024 * 1024 + 1), 'image/png', 'IDENTITY', 'id.png'),
    ).toThrow('FILE_SIZE');
  });
  it('rejects PDF content as a photo and inconsistent extensions', () => {
    expect(() =>
      verifyFile(Buffer.from('%PDF-1.7'), 'application/pdf', 'UNIT_PHOTO', 'photo.pdf'),
    ).toThrow('PHOTO_REQUIRES_IMAGE');
    expect(() => verifyFile(awaitablePng(), 'image/png', 'IDENTITY', 'photo.jpg')).toThrow(
      'EXTENSION_MISMATCH',
    );
  });
  it('removes image metadata and keeps decoded pixels', async () => {
    const original = await sharp(await png())
      .withMetadata({ exif: { IFD0: { Artist: 'Private person' } } })
      .png()
      .toBuffer();
    const output = await sanitizeFile(original, 'image/png');
    const metadata = await sharp(output).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.width).toBe(4);
    expect(metadata.height).toBe(3);
    expect(fileDigest(output)).not.toBe(fileDigest(original));
  });
  it('bounds oversized raster dimensions without an upscale', async () => {
    const original = await sharp({
      create: { width: 5000, height: 2, channels: 3, background: '#fff' },
    })
      .jpeg()
      .toBuffer();
    const metadata = await sharp(await sanitizeFile(original, 'image/jpeg')).metadata();
    expect(metadata.width).toBe(4096);
  });
  it('removes PDF metadata and annotations from a fresh page document', async () => {
    const source = await PDFDocument.create();
    source.addPage().drawText('Factual evidence');
    source.setAuthor('Private author');
    const output = await sanitizeFile(Buffer.from(await source.save()), 'application/pdf');
    const parsed = await PDFDocument.load(output);
    expect(parsed.getPageCount()).toBe(1);
    expect(parsed.getAuthor()).toBeUndefined();
  });
  it('rejects active PDF actions through parsed PDF names', async () => {
    const source = await PDFDocument.create();
    source.addPage();
    source.catalog.set(
      PDFName.of('OpenAction'),
      source.context.obj({ S: 'JavaScript', JS: PDFString.of('app.alert(1)') }),
    );
    await expect(sanitizeFile(Buffer.from(await source.save()), 'application/pdf')).rejects.toThrow(
      'ACTIVE_PDF_CONTENT',
    );
  });
  it('rejects malformed and excessive-page PDFs', async () => {
    await expect(sanitizeFile(Buffer.from('%PDF-not-valid'), 'application/pdf')).rejects.toThrow(
      'INVALID_PDF',
    );
    const source = await PDFDocument.create();
    for (let i = 0; i < 51; i++) source.addPage();
    await expect(sanitizeFile(Buffer.from(await source.save()), 'application/pdf')).rejects.toThrow(
      'PDF_LIMIT',
    );
  });
  it('removes traversal and response-header characters from file names', () => {
    expect(safeFilename('../../secret.png')).toBe('secret.png');
    expect(safeFilename('C:\\private\\id.png')).toBe('id.png');
    expect(safeFilename('a\r\nb.png')).toBe('a__b.png');
  });
  it('accepts a valid bound grant and rejects changed file, owner, session, and digest', () => {
    const now = Date.now(),
      token = createFileGrant(expected, now);
    expect(verifyFileGrant(token, expected, now)).toBe(true);
    for (const key of ['id', 'sub', 'sid', 'hash'])
      expect(verifyFileGrant(token, { ...expected, [key]: 'other' }, now)).toBe(false);
  });
  it('rejects grants exactly at expiry, tampered signatures, malformed input, and oversized input', () => {
    const now = Date.now(),
      token = createFileGrant(expected, now);
    expect(verifyFileGrant(token, expected, now + 300000)).toBe(false);
    for (const bad of [token + '.extra', token.slice(0, -4) + 'evil', 'x.x', 'x'.repeat(4000), ''])
      expect(verifyFileGrant(bad, expected, now)).toBe(false);
  });
  it('evaluates exact expiry independently from scan state with a controlled clock', () => {
    const now = new Date('2026-11-10T00:00:00Z');
    expect(fileState({ status: 'CLEAN', expiresAt: now }, now)).toBe('EXPIRED');
    expect(fileState({ status: 'CLEAN', expiresAt: new Date(now.getTime() + 1) }, now)).toBe(
      'CLEAN',
    );
    expect(fileState({ status: 'QUARANTINED', expiresAt: null }, now)).toBe('QUARANTINED');
  });
  it('validates private storage limits, strict metadata, and safe grant durations', () => {
    for (const config of [
      { FILE_MAX_BYTES: '999999999' },
      { FILE_GRANT_SECONDS: '1000' },
      { S3_BUCKET: 'UPPERCASE' },
      { CLAMAV_PORT: '0' },
    ])
      expect(fileConfigSchema.safeParse(config).success).toBe(false);
    expect(
      fileMetadataSchema.safeParse({
        purpose: 'IDENTITY',
        targetId: 'self',
        clientId: crypto.randomUUID(),
        title: 'ID',
        ownerUserId: 'foreign',
      }).success,
    ).toBe(false);
  });
});
function awaitablePng() {
  return Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
}
