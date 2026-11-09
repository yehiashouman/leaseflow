import { z } from 'zod';
import sharp from 'sharp';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { createHash } from 'node:crypto';

export const fileConfigSchema = z.object({
  FILES_ENABLED: z.enum(['true', 'false']).default('false'),
  S3_ENDPOINT: z.url().optional(),
  S3_PROVIDER: z.enum(['s3', 'minio']).default('s3'),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
    .default('leaseflow-private'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('true'),
  FILE_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(10 * 1024 * 1024)
    .default(5 * 1024 * 1024),
  FILE_GRANT_SECONDS: z.coerce.number().int().min(15).max(300).default(60),
  CLAMAV_HOST: z.string().min(1).default('clamav'),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
});
export const fileConfig = fileConfigSchema.parse(process.env);
if (
  fileConfig.FILES_ENABLED === 'true' &&
  (!fileConfig.S3_ENDPOINT || !fileConfig.S3_ACCESS_KEY || !fileConfig.S3_SECRET_KEY)
)
  throw new Error('Private files require an S3 endpoint and credentials.');
if (process.env.NODE_ENV === 'production' && fileConfig.FILES_ENABLED === 'true') {
  if (new URL(fileConfig.S3_ENDPOINT!).protocol !== 'https:')
    throw new Error('Production storage requires HTTPS.');
  // Production policy remains an explicit owner gate, not an environment-variable approval.
  throw new Error(
    'Production private files require approved DEC-17/DEC-18 policy and deployment acceptance.',
  );
}
export const documentPurposes = [
  'IDENTITY',
  'LICENSE',
  'LANDLORD_DOCUMENT',
  'PROPERTY_DOCUMENT',
  'CONSENT',
  'UNIT_PHOTO',
  'COMMON_PHOTO',
  'SPACE_PHOTO',
  'CASE_EVIDENCE',
  'PAYMENT_EVIDENCE',
  'EXPENSE_EVIDENCE',
] as const;
export const fileMetadataSchema = z
  .object({
    purpose: z.enum(documentPurposes),
    targetId: z.string().min(1).max(191),
    seriesId: z.string().min(1).max(191).optional(),
    clientId: z.uuid(),
    title: z.string().trim().min(1).max(150),
    expiresAt: z.iso.date().nullable().default(null),
  })
  .strict();
export type FileMetadata = z.infer<typeof fileMetadataSchema>;
export const fileDigest = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');
export class UnsafeFile extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export function safeFilename(name: string) {
  return (
    name
      .replaceAll('\\', '/')
      .split('/')
      .at(-1)!
      .replace(/[^A-Za-z0-9._ -]/g, '_')
      .slice(0, 150) || 'document'
  );
}
export function detectFile(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  throw new UnsafeFile('UNSUPPORTED_CONTENT');
}
export function verifyFile(bytes: Buffer, declared: string, purpose: string, name: string) {
  if (!bytes.length || bytes.length > fileConfig.FILE_MAX_BYTES) throw new UnsafeFile('FILE_SIZE');
  if (/\.(exe|com|bat|cmd|sh|ps1|html?|svg|js|php|py|jar|msi)(\.|$)/i.test(name))
    throw new UnsafeFile('EXECUTABLE_NAME');
  const actual = detectFile(bytes);
  if (actual !== declared) throw new UnsafeFile('MIME_MISMATCH');
  if (purpose.endsWith('PHOTO') && !actual.startsWith('image/'))
    throw new UnsafeFile('PHOTO_REQUIRES_IMAGE');
  const extension = name.split('.').at(-1)?.toLowerCase();
  if (
    !(
      actual === 'image/png' ? ['png'] : actual === 'image/jpeg' ? ['jpg', 'jpeg'] : ['pdf']
    ).includes(extension ?? '')
  )
    throw new UnsafeFile('EXTENSION_MISMATCH');
  return actual;
}
const forbiddenPdfKeys = new Set([
  'JS',
  'JavaScript',
  'OpenAction',
  'AA',
  'Launch',
  'EmbeddedFiles',
  'EF',
  'RichMedia',
  'XFA',
  'AcroForm',
  'Collection',
  'Sound',
  'Movie',
  'Rendition',
]);
export async function sanitizeFile(bytes: Buffer, mimeType: string): Promise<Buffer> {
  if (mimeType.startsWith('image/')) {
    try {
      const image = sharp(bytes, {
        limitInputPixels: 40000000,
        animated: false,
        failOn: 'warning',
      });
      const metadata = await image.metadata();
      if ((metadata.pages ?? 1) > 1) throw new UnsafeFile('ANIMATED_IMAGE');
      const output = image
        .rotate()
        .resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true });
      return mimeType === 'image/png'
        ? await output.png().toBuffer()
        : await output.jpeg({ quality: 90 }).toBuffer();
    } catch (cause) {
      if (cause instanceof UnsafeFile) throw cause;
      throw new UnsafeFile('INVALID_IMAGE');
    }
  }
  let source: PDFDocument;
  try {
    source = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch {
    throw new UnsafeFile('INVALID_PDF');
  }
  if (source.isEncrypted || source.getPageCount() < 1 || source.getPageCount() > 50)
    throw new UnsafeFile('PDF_LIMIT');
  for (const [, object] of source.context.enumerateIndirectObjects()) {
    if (object instanceof PDFDict) {
      for (const key of object.keys()) {
        if (forbiddenPdfKeys.has(key.decodeText())) throw new UnsafeFile('ACTIVE_PDF_CONTENT');
      }
      const subtype = object.get(PDFName.of('S'));
      if (
        subtype instanceof PDFName &&
        ['JavaScript', 'Launch', 'GoToR', 'SubmitForm', 'ImportData', 'URI'].includes(
          subtype.decodeText(),
        )
      )
        throw new UnsafeFile('ACTIVE_PDF_CONTENT');
    }
  }
  for (const page of source.getPages()) page.node.delete(PDFName.of('Annots'));
  const output = await PDFDocument.create();
  for (const page of await output.copyPages(source, source.getPageIndices())) output.addPage(page);
  return Buffer.from(await output.save());
}
export function fileState(row: { status: string; expiresAt: Date | null }, now = new Date()) {
  return row.expiresAt && row.expiresAt <= now ? 'EXPIRED' : row.status;
}
