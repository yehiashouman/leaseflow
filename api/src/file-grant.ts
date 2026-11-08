import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from './config.js';
import { fileConfig } from './file-policy.js';
const grantSchema = z
  .object({ id: z.string(), sub: z.string(), sid: z.string(), hash: z.string(), exp: z.number() })
  .strict();
type Grant = z.infer<typeof grantSchema>;
const signature = (payload: string) =>
  createHmac('sha256', env.JWT_REFRESH_SECRET)
    .update('leaseflow-private-file-v1:' + payload)
    .digest();
export function createFileGrant(input: Omit<Grant, 'exp'>, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({ ...input, exp: Math.floor(now / 1000) + fileConfig.FILE_GRANT_SECONDS }),
  ).toString('base64url');
  return payload + '.' + signature(payload).toString('base64url');
}
export function verifyFileGrant(token: string, expected: Omit<Grant, 'exp'>, now = Date.now()) {
  if (token.length > 3000) return false;
  const [payload, encoded, extra] = token.split('.');
  if (!payload || !encoded || extra) return false;
  try {
    const supplied = Buffer.from(encoded, 'base64url'),
      required = signature(payload);
    if (supplied.length !== required.length || !timingSafeEqual(supplied, required)) return false;
    const data = grantSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString()));
    return (
      data.exp > Math.floor(now / 1000) &&
      data.exp <= Math.floor(now / 1000) + fileConfig.FILE_GRANT_SECONDS &&
      Object.entries(expected).every(([key, value]) => data[key as keyof Grant] === value)
    );
  } catch {
    return false;
  }
}
