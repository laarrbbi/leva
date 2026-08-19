import 'server-only';

import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * `promisify` cannot see through node:crypto's overloads and drops the options
 * argument, so the options-taking form is wrapped by hand.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

/**
 * scrypt parameters.
 *
 * scrypt is memory-hard, which is what defeats GPU/ASIC cracking rigs, and it
 * ships in the Node standard library — no native build step, no supply-chain
 * surface, one less dependency to keep patched.
 *
 * N = 2^16 with r = 8 costs ~64 MiB and ~100 ms per hash on commodity hardware.
 * That is a deliberate trade: login is rare, so the latency is invisible to the
 * operator but multiplies an offline attacker's cost by ~10^5 over a fast hash.
 * Node's default maxmem (32 MiB) is too small for these parameters, so it is
 * raised explicitly.
 */
const PARAMS = { N: 65536, r: 8, p: 1, keylen: 32, maxmem: 192 * 1024 * 1024 } as const;

const PREFIX = 'scrypt';

/** Encodes as `scrypt$N$r$p$<salt>$<hash>` so parameters can be raised later without a flag day. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize('NFKC'), salt, PARAMS.keylen, PARAMS);
  return [
    PREFIX,
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p)) return false;

  const salt = Buffer.from(saltRaw, 'base64');
  const expected = Buffer.from(hashRaw, 'base64');

  let derived: Buffer;
  try {
    derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: PARAMS.maxmem,
    });
  } catch {
    return false;
  }

  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/** True when a stored hash used weaker parameters and should be upgraded on next login. */
export function needsRehash(encoded: string): boolean {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== PREFIX) return true;
  return Number(parts[1]) < PARAMS.N || Number(parts[2]) < PARAMS.r;
}
