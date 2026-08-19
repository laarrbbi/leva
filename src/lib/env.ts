import { z } from 'zod';

/**
 * Environment contract.
 *
 * Parsed once, eagerly, at module load. A misconfigured deployment fails at
 * boot with a readable message instead of silently degrading a security
 * control at request time (e.g. an empty SESSION_SECRET signing every cookie
 * with "").
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  APP_ORIGIN: z
    .string()
    .url()
    .refine((v) => !v.endsWith('/'), 'APP_ORIGIN must not have a trailing slash')
    .default('http://localhost:3000'),

  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters of high-entropy random data'),

  IP_HASH_SECRET: z
    .string()
    .min(32, 'IP_HASH_SECRET must be at least 32 characters of high-entropy random data'),

  DATABASE_PATH: z.string().min(1).default('./data/leva.db'),

  TRUST_PROXY_HEADERS: z
    .enum(['0', '1'])
    .default('0')
    .transform((v) => v === '1'),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  // During `next build` the page collector imports server modules without a
  // real environment. Fall back to throwaway development values so the build
  // does not need production secrets, but never in a running production server.
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

  const raw = {
    NODE_ENV: process.env.NODE_ENV,
    APP_ORIGIN: process.env.APP_ORIGIN,
    SESSION_SECRET: process.env.SESSION_SECRET,
    IP_HASH_SECRET: process.env.IP_HASH_SECRET,
    DATABASE_PATH: process.env.DATABASE_PATH,
    TRUST_PROXY_HEADERS: process.env.TRUST_PROXY_HEADERS,
  };

  const parsed = EnvSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  if (isBuildPhase || process.env.NODE_ENV !== 'production') {
    return EnvSchema.parse({
      ...raw,
      SESSION_SECRET: raw.SESSION_SECRET || 'dev-only-session-secret-not-for-production-use!!',
      IP_HASH_SECRET: raw.IP_HASH_SECRET || 'dev-only-ip-hash-secret-not-for-production-use!!',
    });
  }

  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}\n\nSee .env.example.`);
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
