// GET /api/gallery/list?sort=newest|top&videosOnly=0|1&limit=100
// Public: returns ONLY approved items. (Pending/rejected are admin-only.)

import { json, corsPreflight, getSupabase } from './_lib';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const { url: SB_URL, serviceKey: SB_KEY } = getSupabase();
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: 'supabase_not_configured' }, 500);

  const u = new URL(req.url);
  const sort = u.searchParams.get('sort') === 'top' ? 'top' : 'newest';
  const videosOnly = u.searchParams.get('videosOnly') === '1';
  const limit = Math.min(200, Math.max(1, Number(u.searchParams.get('limit') || 120)));

  const order = sort === 'top' ? 'likes.desc,created_at.desc' : 'created_at.desc';
  let q = `${SB_URL}/rest/v1/gallery_items?status=eq.approved&select=id,name,caption,media_type,media_url,poster_url,width,height,likes,shares,reports_count,created_at&order=${encodeURIComponent(order)}&limit=${limit}`;
  if (videosOnly) q += `&media_type=eq.video`;

  try {
    const r = await fetch(q, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
    if (!r.ok) return json({ ok: false, error: 'db_read_failed' }, 500);
    const rows: any[] = await r.json();
    return json({
      ok: true,
      items: (rows || []).map((x) => ({
        id: x.id,
        name: x.name,
        caption: x.caption || '',
        mediaType: x.media_type,
        mediaUrl: x.media_url,
        posterUrl: x.poster_url || x.media_url,
        width: x.width ?? null,
        height: x.height ?? null,
        likes: Number(x.likes) || 0,
        shares: Number(x.shares) || 0,
        reportsCount: Number(x.reports_count) || 0,
        createdAt: x.created_at,
      })),
    });
  } catch {
    return json({ ok: false, error: 'db_read_failed' }, 500);
  }
}
