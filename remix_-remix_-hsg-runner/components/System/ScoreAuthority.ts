/**
 * Runner score authority — client side.
 *
 * The browser never decides what a run is worth. It submits a claim, the
 * server checks it against the runner's own physics and hands back a signed
 * receipt. Everything shown to the player (and baked into the share image)
 * comes from `accepted`, never from the raw claim — that is what stops a
 * console-edited score from turning into a shareable lie.
 */

export interface RunClaim {
  score: number;
  distance: number;
  gems: number;
  letters: number;
  tiers: number;
  seconds: number;
}

export interface AcceptedRun {
  score: number;
  distance: number;
  gems: number;
  letters: number;
  tiers: number;
  seconds: number;
}

export interface ScoreReceipt {
  ok: boolean;
  accepted: AcceptedRun;
  clean: boolean;
  flags: string[];
  receipt: string;
  best: number;
  /** False when the endpoint is unreachable — the UI shows the run unverified. */
  reached?: boolean;
}

/** Stable, non-identifying id for this browser. Used to keep a cross-session best. */
const DEVICE_KEY = 'firas-runner-device';

export const getDeviceId = (): string => {
  if (typeof window === 'undefined') return 'server';
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
      id = `d_${rand}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'd_ephemeral';
  }
};

export const submitRun = async (claim: RunClaim, timeoutMs = 6000): Promise<ScoreReceipt | null> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('/api/runner-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...claim, device: getDeviceId() }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.ok !== true || !data.accepted) return null;
    return { ...(data as ScoreReceipt), reached: true };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

export const fetchBest = async (): Promise<{ score: number; distance: number } | null> => {
  try {
    const res = await fetch(`/api/runner-score?device=${encodeURIComponent(getDeviceId())}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.ok !== true || !data.best) return null;
    return { score: Number(data.best.score) || 0, distance: Number(data.best.distance) || 0 };
  } catch {
    return null;
  }
};