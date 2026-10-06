// POST /api/gallery/interact  { id, action: like|unlike|share|report, voter?, reason?, details? }
// Public, rate-limited by voter uniqueness + validation. Uses service_role (never exposed).

import { json, corsPreflight, getSupabase, sbHeaders } from './_lib';

export const config = { runtime: 'edge' };

const cleanStr = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const { url: SB_URL, serviceKey: SB_KEY } = getSupabase();
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: 'supabase_not_configured' }, 500);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400);
  }

  const id = cleanStr(body?.id, 64);
  const action = cleanStr(body?.action, 16);
  if (!isUuid(id)) return json({ ok: false, error: 'bad_id' }, 400);
  const H = sbHeaders(SB_KEY);

  try {
    if (action === 'share') {
      const r = await fetch(`${SB_URL}/rest/v1/rpc/gallery_inc_share`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify({ p_item: id }),
      });
      const v = r.ok ? await r.json().catch(() => null) : null;
      return json({ ok: true, shares: typeof v === 'number' ? v : null });
    }

    if (action === 'like' || action === 'unlike') {
      const voter = cleanStr(body?.voter, 64);
      if (!voter || voter.length < 8) return json({ ok: false, error: 'bad_voter' }, 400);
      if (action === 'like') {
        // record voter (ignore duplicates) then increment
        await fetch(`${SB_URL}/rest/v1/gallery_likes`, {
          method: 'POST',
          headers: { ...H, Prefer: 'resolution=ignore-duplicates' },
          body: JSON.stringify([{ item_id: id, voter_hash: voter.slice(0, 128) }]),
        });
        const r = await fetch(`${SB_URL}/rest/v1/rpc/gallery_inc_like`, {
          method: 'POST',
          headers: H,
          body: JSON.stringify({ p_item: id }),
        });
        const v = r.ok ? await r.json().catch(() => null) : null;
        return json({ ok: true, likes: typeof v === 'number' ? v : null });
      }
      // unlike: delete voter row + decrement safely
      await fetch(`${SB_URL}/rest/v1/gallery_likes?item_id=eq.${id}&voter_hash=eq.${encodeURIComponent(voter.slice(0, 128))}`, {
        method: 'DELETE',
        headers: H,
      });
      const cur = await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}&select=likes`, { headers: H }).then((x) => x.json()).catch(() => []);
      const n = Math.max(0, (Number(cur?.[0]?.likes) || 1) - 1);
      await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}`, {
        method: 'PATCH',
        headers: H,
        body: JSON.stringify({ likes: n }),
      });
      return json({ ok: true, likes: n });
    }

    if (action === 'report') {
      const reason = cleanStr(body?.reason, 24);
      const details = cleanStr(body?.details, 500);
      const allowed = ['spam', 'abuse', 'copyright', 'nsfw', 'other'];
      if (!allowed.includes(reason)) return json({ ok: false, error: 'bad_reason' }, 400);
      const ins = await fetch(`${SB_URL}/rest/v1/gallery_reports`, {
        method: 'POST',
        headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify([{ item_id: id, reason, details }]),
      });
      if (!ins.ok) return json({ ok: false, error: 'report_failed' }, 500);
      // bump counter (best effort)
      const cur = await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}&select=reports_count`, { headers: H }).then((x) => x.json()).catch(() => []);
      const n = (Number(cur?.[0]?.reports_count) || 0) + 1;
      await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}`, {
        method: 'PATCH',
        headers: H,
        body: JSON.stringify({ reports_count: n }),
      });
      return json({ ok: true, message: 'تم استلام بلاغك وسيتم مراجعته من الإدارة' });
    }

    return json({ ok: false, error: 'bad_action' }, 400);
  } catch {
    return json({ ok: false, error: 'failed' }, 500);
  }
}
