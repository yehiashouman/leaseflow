import { z } from 'zod';
import { isIP } from 'node:net';

export function durationSeconds(value: string) {
  const match = /^([1-9]\d*)([smhd])$/.exec(value);
  if (!match) return NaN;
  const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return Number(match[1]) * units[match[2]!]!;
}

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === 'mysql:' && Boolean(url.hostname) && url.pathname.length > 1;
  }, 'Use a MySQL URL with a database name.'),
  REDIS_URL: z
    .url()
    .refine((value) => ['redis:', 'rediss:'].includes(new URL(value).protocol), 'Use a Redis URL.'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z
    .string()
    .default('15m')
    .refine(
      (value) => durationSeconds(value) > 0 && durationSeconds(value) <= 3600,
      'Use a positive duration up to 1h.',
    ),
  REFRESH_TOKEN_TTL: z
    .string()
    .default('30d')
    .refine(
      (value) => durationSeconds(value) > 0 && durationSeconds(value) <= 90 * 86400,
      'Use a positive duration up to 90d.',
    ),
  CORS_ORIGINS: z.string().default('http://localhost:8080'),
  TRUST_PROXY: z.string().default('127.0.0.1/32,::1/128'),
  DEMO_MODE: z
    .string()
    .optional()
    .transform((value) => value?.trim().toLowerCase() === 'true')
    .pipe(z.boolean()),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_VERIFY_SERVICE_SID: z.string().optional(),
});

export function parseConfiguration(input: NodeJS.ProcessEnv) {
  const value = configSchema.parse(input);
  if (value.DEMO_MODE && value.NODE_ENV === 'production')
    throw new Error('DEMO_MODE=true is not allowed when NODE_ENV=production.');
  if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET)
    throw new Error('Access and refresh secrets must differ.');
  const origins = value.CORS_ORIGINS.split(',').map(normalizeOrigin).filter(Boolean);
  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('CORS_ORIGINS must contain exact HTTP origins.');
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.origin !== origin ||
      parsed.username ||
      parsed.password
    )
      throw new Error('CORS_ORIGINS must contain exact HTTP origins without paths or credentials.');
    if (value.NODE_ENV === 'production' && parsed.protocol !== 'https:')
      throw new Error('Production CORS origins must use HTTPS.');
  }
  proxyConfiguration(value.TRUST_PROXY);
  if (value.NODE_ENV === 'production') {
    if (!input.CORS_ORIGINS || !origins.length)
      throw new Error('Production requires explicit CORS_ORIGINS.');
    if (!input.TRUST_PROXY) throw new Error('Production requires explicit TRUST_PROXY or false.');
    if (
      [value.JWT_ACCESS_SECRET, value.JWT_REFRESH_SECRET].some((secret) =>
        /^(replace-|change-me)/i.test(secret),
      )
    )
      throw new Error('Production requires non-placeholder JWT secrets.');
  }
  return value;
}
export function proxyConfiguration(input: string): false | string[] {
  if (input.trim() === 'false') return false;
  const values = input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!values.length) throw new Error('TRUST_PROXY must be false or explicit IP/CIDR entries.');
  for (const value of values) {
    const [address, prefix, extra] = value.split('/');
    const version = isIP(address ?? '');
    if (
      !version ||
      extra ||
      (prefix !== undefined &&
        (!/^\d+$/.test(prefix) ||
          Number(prefix) < 1 ||
          Number(prefix) > (version === 4 ? 32 : 128)))
    )
      throw new Error(
        'TRUST_PROXY must contain explicit IP/CIDR entries; global trust is forbidden.',
      );
  }
  return values;
}
export const env = parseConfiguration(process.env);
export const trustedProxies = proxyConfiguration(env.TRUST_PROXY);

/**
 * Normalize a configured origin: trim whitespace and strip a single trailing
 * slash so `https://example.com/` and `https://example.com` are equivalent.
 */
function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map(normalizeOrigin)
  .filter((origin) => origin.length > 0);

const codespacesWildcardHosts = ['.app.github.dev', '.github.dev'];

/**
 * Securely validate that a hostname is a genuine Codespaces subdomain.
 * Uses an anchored suffix check against the parsed URL hostname (never a raw
 * substring match against the full origin string) so an attacker cannot craft
 * a malicious origin such as `https://evil.com/.app.github.dev` or
 * `https://app.github.dev.evil.com` to bypass the check.
 */
function isCodespacesOrigin(origin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.origin !== normalizeOrigin(origin)) return false;
  const hostname = parsed.hostname.toLowerCase();
  // Require a genuine subdomain (e.g. `<name>-8080.app.github.dev`); the bare
  // `app.github.dev` / `github.dev` root domains are never valid Codespaces
  // origins and must not match.
  return codespacesWildcardHosts.some(
    (suffix) => hostname.endsWith(suffix) && hostname !== suffix.slice(1),
  );
}

const devLoopbackOrigins = new Set(['http://localhost:8080', 'http://127.0.0.1:8080']);

/**
 * Decide whether an incoming Origin header is allowed.
 *
 * - No Origin header (curl, server-to-server, same-origin via the Nginx
 *   proxy in some browsers) is always allowed; CORS only restricts
 *   cross-origin browser requests, so a missing header is not a spoofing
 *   vector here.
 * - In production, only exact (normalized) matches from CORS_ORIGINS are
 *   allowed.
 * - In development/test, the exact CORS_ORIGINS list is honored, plus a
 *   fixed loopback allow-list and validated *.app.github.dev / *.github.dev
 *   Codespaces subdomains.
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (corsOrigins.includes(normalized)) return true;
  if (env.NODE_ENV === 'production') return false;
  if (devLoopbackOrigins.has(normalized)) return true;
  return isCodespacesOrigin(normalized);
}
