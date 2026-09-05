import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('30d'),
  CORS_ORIGINS: z.string().default('http://localhost:8080'),
  DEMO_MODE: z
    .string()
    .optional()
    .transform((value) => value?.trim().toLowerCase() === 'true')
    .pipe(z.boolean()),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_VERIFY_SERVICE_SID: z.string().optional(),
});

export const env = schema.parse(process.env);

if (env.DEMO_MODE && env.NODE_ENV === 'production') {
  throw new Error('Refusing to start: DEMO_MODE=true is not allowed when NODE_ENV=production.');
}

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
  const hostname = parsed.hostname.toLowerCase();
  // Require a genuine subdomain (e.g. `<name>-8080.app.github.dev`); the bare
  // `app.github.dev` / `github.dev` root domains are never valid Codespaces
  // origins and must not match.
  return codespacesWildcardHosts.some((suffix) => hostname.endsWith(suffix) && hostname !== suffix.slice(1));
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
