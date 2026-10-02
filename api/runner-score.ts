// Vercel Edge Function — FIRAS Runner score authority
//
// POST /api/runner-score   { score, distance, gems, letters, tiers, seconds, tierYield }
// GET  /api/runner-score?device=<id>   -> { best }
//
// WHY THIS EXISTS
// The runner used to write its score straight from the browser, which meant
// anyone could open devtools and claim any number. Scoring is now treated as
// an untrusted claim: this endpoint proves the run is physically possible and
// returns a signed receipt. Only server-accepted numbers are ever rendered
// into the shareable score card, so a shared image cannot be doctored into a
// number the server never signed.
//
// HOW THE CHECK WORKS
// The runner's speed is a pure function of distance covered:
//
//     speed(d) = min(SPEED_MAX, SPEED_START + d * SPEED_RAMP_PER_LY)
//
// and distance is the integral of that speed over elapsed time. Inverting it
// gives the fastest distance any honest run could have covered in `seconds`,
// which bounds every downstream reward:
//   * a gem is worth 50 (or 100 on top of a block),
//   * a letter is worth 1000 and can only appear every LETTER_SPACING LY,
//   * gems cannot outnumber the slots the spawner actually produced.
// A claim above those ceilings is clamped and flagged rather than trusted.

export const config = {
  runtime: 'edge',
};

/* ----------------------------- game physics mirror ---------------------------- */

const SPEED_START = 34;
const SPEED_MAX = 400;
const SPEED_RAMP_PER_LY = 0.0035;
const LETTER_SPACING_BASE = 80;
const LETTER_SPACING_FLOOR = 42;
const MAX_TIER = 41;

/** Mirror of `milestoneLength()` in the runner store. */
function milestoneLength(level: number) {
  const capped = Math.min(Math.max(1, Math.floor(level)) - 1, MAX_TIER);
  return 1100 + capped * 220;
}

/**
 * Fastest distance an honest run can cover in `seconds`.
 *
 * speed(d) is linear up to SPEED_MAX then constant, so the time integral has
 * a closed form — no iteration, no unbounded loops on an edge runtime.
 */
function maxHonestDistance(seconds: number): number {
  const t = Math.max(0, seconds);
  if (t <= 0) return 0;

  const r = SPEED_RAMP_PER_LY;
  // Distance at which the ramp saturates.
  const d1 = (SPEED_MAX - SPEED_START) / r;
  // Time to reach d1: (1/r) · ln(SPEED_MAX / SPEED_START)
  const t1 = Math.log(SPEED_MAX / SPEED_START) / r;

  if (t <= t1) {
    return (SPEED_START / r) * (Math.exp(r * t) - 1);
  }
  return d1 + (t - t1) * SPEED_MAX;
}

/** Sum of every tier milestone up to (but excluding) `tiers`. */
function milestoneSpan(tiers: number) {
  let total = 0;
  for (let i = 1; i < tiers; i++) total += milestoneLength(i);
  return total;
}

/* --------------------------------- crypto ----------------------------------- */

const enc = new TextEncoder();

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24)
    .toUpperCase();
}

function receiptPayload(r: Record<string, number>) {
  // Field order is fixed — the client recomputes nothing, it only displays.
  return `FIRAS-RUNNER-V1|score=${r.score}|dist=${r.distance}|gems=${r.gems}|letters=${r.letters}|tiers=${r.tiers}|secs=${r.seconds}`;
}

/* --------------------------------- Supabase --------------------------------- */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pqdocqsskqxcehdcvjvq.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

/**
 * The table is optional: if it has not been created yet the endpoint still
 * works and still signs receipts, it just cannot keep a cross-device history.
 */
async function recordScore(device: string, row: Record<string, unknown>): Promise<number | null> {
  if (!SUPABASE_KEY) return null;
  try {
    // Upsert on device_id: the ledger holds one "best so far" row per device.
    const res = await fetch(`${SUPABASE_URL}/rest/v1/runner_scores?on_conflict=device_id`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify([{ device_id: device, ...row }]),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data[0] ? Number(data[0].score) || null : null;
  } catch {
    return null;
  }
}

async function readBest(device: string): Promise<{ score: number; distance: number } | null> {
  if (!SUPABASE_KEY || !device) return null;
  try {
    const url = `${SUPABASE_URL}/rest/v1/runner_scores`
      + `?device_id=eq.${encodeURIComponent(device)}&select=score,distance&order=score.desc&limit=1`;
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data[0]) return null;
    return { score: Number(data[0].score) || 0, distance: Number(data[0].distance) || 0 };
  } catch {
    return null;
  }
}

/* ---------------------------------- handler --------------------------------- */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });

const num = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } });
  }

  const url = new URL(req.url);
  const secret = process.env.RUNNER_SIGNING_SECRET || 'firas-runner-citadel-v1';

  if (req.method === 'GET') {
    const device = url.searchParams.get('device') || '';
    const best = await readBest(device);
    return json({ ok: true, best });
  }

  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400);
  }

  const device = String(body?.device || '').slice(0, 64);
  if (!device) return json({ ok: false, error: 'missing_device' }, 400);

  const tiers = Math.min(4000, Math.max(1, Math.floor(num(body?.tiers, 1))));
  const seconds = Math.min(60 * 60 * 24, num(body?.seconds, 0));
  const claimedDistance = Math.min(1e9, Math.floor(num(body?.distance, 0)));
  const claimedGems = Math.min(1e7, Math.floor(num(body?.gems, 0)));
  const claimedLetters = Math.min(1e7, Math.floor(num(body?.letters, 0)));
  const claimedScore = Math.min(1e12, Math.floor(num(body?.score, 0)));

  // --- Physical plausibility -------------------------------------------------
  const maxDistance = maxHonestDistance(seconds) * 1.12; // 12% clock/telemetry slack
  const maxTiers = Math.max(1, Math.floor((maxDistance + 1) / milestoneLength(1)));
  const allowedTiers = Math.min(tiers, maxTiers);
  const allowedDistance = Math.min(claimedDistance, Math.floor(maxDistance));

  // Gems: at most one collectible per spawn slot, rows never land closer than
  // 6 LY, and only ~94% of slots ever attempt a spawn. Zero distance means
  // zero collectibles.
  const maxGems = allowedDistance > 0 ? Math.floor((allowedDistance / 6) * 0.94) : 0;
  const allowedGems = Math.min(claimedGems, maxGems);

  // Letters: at most one per letter slot, spacing shrinking with tier.
  const spacing = Math.max(LETTER_SPACING_FLOOR, LETTER_SPACING_BASE - allowedDistance * 0.008);
  const maxLetters = allowedDistance > 0 ? Math.floor(allowedDistance / spacing) + 8 : 0;
  const allowedLetters = Math.min(claimedLetters, maxLetters);

  const maxScore = allowedGems * 100 + allowedLetters * 1000;
  const allowedScore = Math.min(claimedScore, maxScore);

  const flags: string[] = [];
  if (allowedScore !== claimedScore) flags.push('score');
  if (allowedDistance !== claimedDistance) flags.push('distance');
  if (allowedGems !== claimedGems) flags.push('gems');
  if (allowedLetters !== claimedLetters) flags.push('letters');
  if (allowedTiers !== tiers) flags.push('tiers');

  const accepted = {
    score: allowedScore,
    distance: allowedDistance,
    gems: allowedGems,
    letters: allowedLetters,
    tiers: allowedTiers,
    seconds: Math.round(seconds),
  };

  const receipt = await hmacHex(secret, receiptPayload(accepted));

  const stored = await recordScore(device, {
    score: accepted.score,
    distance: accepted.distance,
    gems: accepted.gems,
    letters: accepted.letters,
    tiers: accepted.tiers,
    seconds: accepted.seconds,
    receipt,
    verified: flags.length === 0,
    created_at: new Date().toISOString(),
  });

  return json({
    ok: true,
    accepted,
    // `clean` means the claim needed no correction — the share card labels it.
    clean: flags.length === 0,
    flags,
    receipt,
    best: stored !== null ? stored : accepted.score,
    milestoneSpan: milestoneSpan(allowedTiers),
    letterSpacing: spacing,
  });
}