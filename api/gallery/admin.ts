// POST /api/gallery/admin — لوحة الإدارة الكاملة
// login{password} | stats | list | approve | reject | unpublish | bulk | undo |
// updateItem | setNote | beginReview | endReview | reports | resolveReport |
// clearReports | audit | remove
// Auth: Bearer HMAC token (6h). Login rate-limited 5/10min per IP.

import {
  json, corsPreflight, getSupabase, sbHeaders, getIKAccounts,
  issueAdminToken, verifyAdminToken, getBearer, safeCompare, clientIp,
} from './_lib';

export const config = { runtime: 'edge' };

const REVIEW_LOCK_MS = 120_000;
const UNDO_WINDOW_MS = 60_000;
const MAX_BULK = 100;

const attempts = new Map<string, { n: number; until: number }>();
function rateHit(ip: string): boolean {
  const now = Date.now();
  const cur = attempts.get(ip);
  if (cur && cur.until > now) {
    if (cur.n >= 5) return true;
    cur.n += 1;
    return false;
  }
  attempts.set(ip, { n: 1, until: now + 10 * 60 * 1000 });
  return false;
}

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || '');
const clamp = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

const ITEM_SELECT_V2 = 'id,name,caption,kind,media_type,status,media_url,poster_url,url,width,height,likes,shares,reports_count,file_id,ik_account,reject_reason,internal_note,reviewing_by,reviewing_at,reviewed_at,reviewer,created_at';
// Fallback قبل تنفيذ supabase-gallery-v2.sql — يعمل بأعمدة v1 فقط
const ITEM_SELECT_V1 = 'id,name,caption,media_type,status,media_url,poster_url,width,height,likes,shares,reports_count,file_id,ik_account,created_at';

function toAdminItem(x: any) {
  return {
    id: x.id, name: x.name, caption: x.caption || '',
    kind: x.kind === 'link' ? 'link' : 'upload',
    mediaType: x.media_type, status: x.status,
    mediaUrl: x.media_url || null, posterUrl: x.poster_url || x.media_url || null, url: x.url || null,
    width: x.width ?? null, height: x.height ?? null,
    likes: Number(x.likes) || 0, shares: Number(x.shares) || 0, reportsCount: Number(x.reports_count) || 0,
    fileId: x.file_id || null, ikAccount: Number(x.ik_account) || 1,
    rejectReason: x.reject_reason || '', internalNote: x.internal_note || '',
    reviewingBy: x.reviewing_by || null, reviewingAt: x.reviewing_at || null,
    reviewedAt: x.reviewed_at || null, reviewer: x.reviewer || '',
    createdAt: x.created_at,
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400);
  }
  const action = String(body?.action || '');

  const ADMIN_PASSWORD = (process.env.GALLERY_ADMIN_PASSWORD || '').trim();
  const ADMIN_SECRET = (process.env.GALLERY_ADMIN_SECRET || process.env.RUNNER_SIGNING_SECRET || 'firas-gallery-admin-v1').trim();
  if (!ADMIN_PASSWORD) return json({ ok: false, error: 'admin_not_configured' }, 500);

  if (action === 'login') {
    const ip = clientIp(req);
    if (rateHit(ip)) return json({ ok: false, error: 'rate_limited' }, 429);
    await new Promise((r) => setTimeout(r, 350));
    if (!safeCompare(String(body?.password || ''), ADMIN_PASSWORD)) {
      return json({ ok: false, error: 'wrong_password' }, 401);
    }
    attempts.delete(ip);
    const token = await issueAdminToken(ADMIN_SECRET, 6);
    return json({ ok: true, token, expiresInHours: 6 });
  }

  const token = getBearer(req);
  if (!token || !(await verifyAdminToken(ADMIN_SECRET, token))) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const { url: SB_URL, serviceKey: SB_KEY } = getSupabase();
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: 'supabase_not_configured' }, 500);
  const H = sbHeaders(SB_KEY);
  const now = new Date().toISOString();

  // قراءة مرنة: v2 أولاً ثم fallback لـ v1 (compat=وضع التوافق)
  let compatMode = false;
  const smartSelect = async (qs: string) => {
    let r = await fetch(`${SB_URL}/rest/v1/gallery_items?${qs.replace('SELECT_HOLDER', ITEM_SELECT_V2)}`, { headers: H });
    if (!r.ok) {
      r = await fetch(`${SB_URL}/rest/v1/gallery_items?${qs.replace('SELECT_HOLDER', ITEM_SELECT_V1)}`, { headers: H });
      if (r.ok) compatMode = true;
    }
    return r;
  };
  const getItem = async (id: string) => {
    const r = await smartSelect(`id=eq.${id}&select=SELECT_HOLDER`);
    if (!r.ok) return null;
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  };
  // patch مرن: يجرب الحقول الكاملة ثم الأساسية فقط (قبل v2)
  const smartPatch = async (id: string, patch: any, minimal: any) => {
    let r = await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}`, {
      method: 'PATCH', headers: H, body: JSON.stringify(patch),
    });
    if (!r.ok && r.status === 400) {
      r = await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}`, {
        method: 'PATCH', headers: H, body: JSON.stringify(minimal),
      });
      if (r.ok) compatMode = true;
    }
    return r;
  };
  const audit = async (a: string, item: any, reason = '', note = '', meta: any = {}) => {
    try {
      await fetch(`${SB_URL}/rest/v1/gallery_audit`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify([{
          action: a,
          item_id: item?.id || null,
          item_name: item?.name || '',
          reason: clamp(reason, 160),
          note: clamp(note, 500),
          admin: 'admin',
          meta,
        }]),
      });
    } catch { /* ignore */ }
  };

  // Moderate helper with strict from-state guard
  const moderate = async (id: string, to: 'approved' | 'rejected', reason: string, kind: 'approve' | 'reject' | 'unpublish') => {
    const cur = await getItem(id);
    if (!cur) return { ok: false as const, error: 'not_found' };
    const needFrom = kind === 'unpublish' ? 'approved' : 'pending';
    if (cur.status !== needFrom) return { ok: false as const, error: kind === 'unpublish' ? 'not_approved' : 'not_pending', status: cur.status };
    const patch: any = {
      status: to,
      reviewed_at: now,
      reviewer: 'admin',
      reviewing_by: null,
      reviewing_at: null,
    };
    if (to === 'rejected') patch.reject_reason = clamp(reason, 160);
    else patch.reject_reason = '';
    const minimal: any = { status: to };
    if (to === 'rejected') minimal.reject_reason = clamp(reason, 160);
    else minimal.reject_reason = '';
    const r = await smartPatch(id, patch, minimal);
    if (!r.ok) return { ok: false as const, error: 'update_failed' };
    await audit(kind, cur, reason, '', { from: cur.status, to });
    return { ok: true as const, item: { ...cur, ...patch } };
  };

  try {
    if (action === 'stats') {
      const core = await Promise.all([
        fetch(`${SB_URL}/rest/v1/gallery_items?status=eq.pending&select=id`, { headers: H }),
        fetch(`${SB_URL}/rest/v1/gallery_items?status=eq.approved&select=id`, { headers: H }),
        fetch(`${SB_URL}/rest/v1/gallery_items?status=eq.rejected&select=id`, { headers: H }),
      ]);
      if (core.some((r) => !r.ok)) return json({ ok: false, error: 'db_read_failed' }, 500);
      const [pending, approved, rejected] = await Promise.all(core.map((r) => r.json().catch(() => [])));
      const [reports, agg, recentR] = await Promise.all([
        fetch(`${SB_URL}/rest/v1/gallery_reports?status=eq.open&select=id,item_id`, { headers: H }).then((r) => r.json()).catch(() => []),
        fetch(`${SB_URL}/rest/v1/gallery_items?select=likes,shares,reports_count,ik_account,media_type`, { headers: H }).then((r) => r.json()).catch(() => []),
        smartSelect(`select=SELECT_HOLDER&order=created_at.desc&limit=8`),
      ]);
      const recent = await recentR.json().catch(() => []);
      const flaggedIds = new Set((Array.isArray(reports) ? reports : []).map((x: any) => x.item_id));
      const sum = (k: string) => (Array.isArray(agg) ? agg.reduce((a: number, x: any) => a + (Number(x[k]) || 0), 0) : 0);
      return json({
        ok: true,
        stats: {
          pending: pending.length, approved: approved.length, rejected: rejected.length,
          total: (Array.isArray(agg) ? agg.length : 0),
          flagged: flaggedIds.size, openReports: reports.length,
          totalLikes: sum('likes'), totalShares: sum('shares'), totalReports: sum('reports_count'),
          images: Array.isArray(agg) ? agg.filter((x: any) => x.media_type === 'image').length : 0,
          videos: Array.isArray(agg) ? agg.filter((x: any) => x.media_type === 'video').length : 0,
          byAccount: [1, 2, 3].map((n) => ({
            account: n,
            count: Array.isArray(agg) ? agg.filter((x: any) => Number(x.ik_account) === n).length : 0,
          })),
          recent: Array.isArray(recent) ? recent.map(toAdminItem) : [],
          compat: compatMode,
        },
      });
    }

    if (action === 'list') {
      const status = String(body?.status || 'pending');
      if (!['pending', 'approved', 'rejected'].includes(status)) return json({ ok: false, error: 'bad_status' }, 400);
      const limit = Math.min(200, Math.max(1, Number(body?.limit || 60)));
      const offset = Math.max(0, Number(body?.offset || 0));
      const r = await smartSelect(
        `status=eq.${status}&select=SELECT_HOLDER&order=created_at.desc&limit=${limit}&offset=${offset}`,
      );
      if (!r.ok) return json({ ok: false, error: 'db_read_failed' }, 500);
      const rows = await r.json().catch(() => []);
      return json({ ok: true, items: (Array.isArray(rows) ? rows : []).map(toAdminItem), compat: compatMode });
    }

    if (action === 'approve') {
      const id = String(body?.id || '');
      if (!isUuid(id)) return json({ ok: false, error: 'bad_id' }, 400);
      const res = await moderate(id, 'approved', '', 'approve');
      if (!res.ok) return json({ ok: false, error: res.error }, 409);
      return json({ ok: true, status: 'approved' });
    }

    if (action === 'reject') {
      const id = String(body?.id || '');
      const reason = clamp(body?.reason, 160);
      if (!isUuid(id)) return json({ ok: false, error: 'bad_id' }, 400);
      if (!reason) return json({ ok: false, error: 'reason_required' }, 400);
      const res = await moderate(id, 'rejected', reason, 'reject');
      if (!res.ok) return json({ ok: false, error: res.error }, 409);
      return json({ ok: true, status: 'rejected' });
    }

    if (action === 'unpublish') {
      const id = String(body?.id || '');
      const reason = clamp(body?.reason, 160);
      if (!isUuid(id)) return json({ ok: false, error: 'bad_id' }, 400);
      if (!reason) return json({ ok: false, error: 'reason_required' }, 400);
      const res = await moderate(id, 'rejected', reason, 'unpublish');
      if (!res.ok) return json({ ok: false, error: res.error }, 409);
      return json({ ok: true, status: 'rejected' });
    }

    if (action === 'bulk') {
      const op = String(body?.op || '');
      const reason = clamp(body?.reason, 160);
      const ids = (Array.isArray(body?.ids) ? body.ids : []).map(String).filter(isUuid).slice(0, MAX_BULK);
      if (!['approve', 'reject', 'unpublish'].includes(op)) return json({ ok: false, error: 'bad_op' }, 400);
      if (!ids.length) return json({ ok: true, done: 0, failed: 0, skipped: 0, total: 0 });
      if ((op === 'reject' || op === 'unpublish') && !reason) return json({ ok: false, error: 'reason_required' }, 400);
      let done = 0, failed = 0, skipped = 0;
      for (const id of ids) {
        try {
          const res = op === 'approve'
            ? await moderate(id, 'approved', '', 'approve')
            : op === 'reject'
              ? await moderate(id, 'rejected', reason, 'reject')
              : await moderate(id, 'rejected', reason, 'unpublish');
          if (res.ok) done++;
          else if (res.error === 'not_pending' || res.error === 'not_approved') skipped++;
          else failed++;
        } catch {
          failed++;
        }
      }
      return json({ ok: true, done, failed, skipped, total: ids.length });
    }

    if (action === 'undo') {
      const ids = (Array.isArray(body?.ids) ? body.ids : []).map(String).filter(isUuid).slice(0, MAX_BULK);
      let undone = 0, expired = 0, nothing = 0;
      for (const id of ids) {
        try {
          const h = await fetch(
            `${SB_URL}/rest/v1/gallery_audit?item_id=eq.${id}&action=in.(approve,reject,unpublish)&select=action,meta,created_at&order=created_at.desc&limit=1`,
            { headers: H },
          );
          const rows = await h.json().catch(() => []);
          const last = Array.isArray(rows) && rows[0] ? rows[0] : null;
          if (!last) { nothing++; continue; }
          if (Date.now() - new Date(last.created_at).getTime() > UNDO_WINDOW_MS) { expired++; continue; }
          const from = last.meta?.from || (last.action === 'approve' ? 'pending' : 'approved');
          const cur = await getItem(id);
          if (!cur) { nothing++; continue; }
          const r = await smartPatch(id,
            { status: from, reject_reason: '', reviewed_at: null, reviewer: '' },
            { status: from, reject_reason: '' });
          if (!r.ok) { nothing++; continue; }
          await audit('undo', cur, '', '', { restored: from, of: last.action });
          undone++;
        } catch {
          nothing++;
        }
      }
      if (!undone) return json({ ok: true, undone, expired, nothing, error: expired ? 'undo_window_expired' : 'nothing_to_undo' });
      return json({ ok: true, undone, expired, nothing });
    }

    if (action === 'updateItem') {
      const id = String(body?.id || '');
      const name = clamp(body?.name, 40);
      const caption = clamp(body?.caption, 180);
      if (!isUuid(id)) return json({ ok: false, error: 'bad_id' }, 400);
      if (name.length < 2) return json({ ok: false, error: 'name_too_short' }, 400);
      const cur = await getItem(id);
      if (!cur) return json({ ok: false, error: 'not_found' }, 404);
      const r = await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}`, {
        method: 'PATCH', headers: H, body: JSON.stringify({ name, caption }),
      });
      if (!r.ok) return json({ ok: false, error: 'update_failed' }, 500);
      await audit('update', cur, '', '', { prev: { name: cur.name, caption: cur.caption }, next: { name, caption } });
      return json({ ok: true });
    }

    if (action === 'setNote') {
      const id = String(body?.id || '');
      const note = clamp(body?.note, 2000);
      if (!isUuid(id)) return json({ ok: false, error: 'bad_id' }, 400);
      const cur = await getItem(id);
      if (!cur) return json({ ok: false, error: 'not_found' }, 404);
      const r = await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}`, {
        method: 'PATCH', headers: H, body: JSON.stringify({ internal_note: note }),
      });
      if (!r.ok && r.status === 400) return json({ ok: false, error: 'migration_required' }, 409);
      if (!r.ok) return json({ ok: false, error: 'update_failed' }, 500);
      await audit('note', cur, '', note ? 'Updated private note' : 'Cleared private note');
      return json({ ok: true });
    }

    if (action === 'beginReview') {
      const id = String(body?.id || '');
      const reviewer = clamp(body?.reviewer, 64) || 'admin';
      if (!isUuid(id)) return json({ ok: false, error: 'bad_id' }, 400);
      const cur = await getItem(id);
      if (!cur) return json({ ok: false, error: 'not_found' }, 404);
      if (cur.reviewing_by && cur.reviewing_by !== reviewer && cur.reviewing_at &&
        Date.now() - new Date(cur.reviewing_at).getTime() < REVIEW_LOCK_MS) {
        return json({ ok: false, error: 'locked', lockedBy: cur.reviewing_by });
      }
      const br = await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}`, {
        method: 'PATCH', headers: H,
        body: JSON.stringify({ reviewing_by: reviewer, reviewing_at: now }),
      });
      if (!br.ok && br.status === 400) return json({ ok: true, compat: true });
      return json({ ok: true, compat: compatMode });
    }

    if (action === 'endReview') {
      const id = String(body?.id || '');
      const reviewer = clamp(body?.reviewer, 64) || 'admin';
      if (!isUuid(id)) return json({ ok: false, error: 'bad_id' }, 400);
      const cur = await getItem(id);
      if (cur && (!cur.reviewing_by || cur.reviewing_by === reviewer)) {
        await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}`, {
          method: 'PATCH', headers: H,
          body: JSON.stringify({ reviewing_by: null, reviewing_at: null }),
        }).catch(() => null);
      }
      return json({ ok: true });
    }

    if (action === 'reports') {
      const filter = String(body?.filter || 'open');
      const base = `order=created_at.desc&limit=500`;
      const f = (['open', 'resolved', 'dismissed'].includes(filter)) ? `&status=eq.${filter}` : '';
      let r = await fetch(`${SB_URL}/rest/v1/gallery_reports?select=id,item_id,reason,details,status,device_id,created_at&${base}${f}`, { headers: H });
      if (!r.ok) {
        r = await fetch(`${SB_URL}/rest/v1/gallery_reports?select=id,item_id,reason,details,status,created_at&${base}${f}`, { headers: H });
      }
      if (!r.ok) return json({ ok: false, error: 'db_read_failed' }, 500);
      const rows = await r.json().catch(() => []);
      return json({ ok: true, reports: rows });
    }

    if (action === 'clearReports') {
      const itemId = String(body?.itemId || '');
      if (!isUuid(itemId)) return json({ ok: false, error: 'bad_id' }, 400);
      const cur = await getItem(itemId);
      await fetch(`${SB_URL}/rest/v1/gallery_reports?item_id=eq.${itemId}`, { method: 'DELETE', headers: H });
      if (cur) {
        await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${itemId}`, {
          method: 'PATCH', headers: H, body: JSON.stringify({ reports_count: 0 }),
        });
        await audit('clear_reports', cur, '', 'Dismissed public report flags');
      }
      return json({ ok: true });
    }

    if (action === 'resolveReport') {
      const id = String(body?.id || '');
      const decision = String(body?.decision || 'resolved');
      if (!isUuid(id) || !['resolved', 'dismissed'].includes(decision)) return json({ ok: false, error: 'bad_input' }, 400);
      const r = await fetch(`${SB_URL}/rest/v1/gallery_reports?id=eq.${id}`, {
        method: 'PATCH', headers: H, body: JSON.stringify({ status: decision }),
      });
      if (!r.ok) return json({ ok: false, error: 'update_failed' }, 500);
      return json({ ok: true });
    }

    if (action === 'audit') {
      const query = clamp(body?.query, 120).toLowerCase();
      const limit = Math.min(500, Math.max(1, Number(body?.limit || 200)));
      const r = await fetch(
        `${SB_URL}/rest/v1/gallery_audit?select=id,action,item_id,item_name,reason,note,admin,meta,created_at&order=created_at.desc&limit=${limit}`,
        { headers: H },
      );
      let rows = await r.json().catch(() => []);
      if (!Array.isArray(rows)) rows = [];
      if (query) {
        rows = rows.filter((x: any) => {
          const hay = `${x.admin || ''} ${x.action || ''} ${x.reason || ''} ${x.note || ''} ${x.item_name || ''} ${JSON.stringify(x.meta || {})}`.toLowerCase();
          return hay.includes(query);
        });
      }
      return json({ ok: true, actions: rows });
    }

    if (action === 'remove') {
      const id = String(body?.id || '');
      if (!isUuid(id)) return json({ ok: false, error: 'bad_id' }, 400);
      const cur = await getItem(id);
      const fileId = cur?.file_id;
      const accN = Number(cur?.ik_account) || 1;
      await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}`, { method: 'DELETE', headers: H });
      if (cur) await audit('remove', cur, '', 'Deleted permanently');
      if (fileId) {
        const accs = getIKAccounts();
        const acc = accs.find((a) => a.index === accN) || accs[0];
        if (acc) {
          try {
            await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(String(fileId))}`, {
              method: 'DELETE',
              headers: { Authorization: `Basic ${btoa(acc.privateKey + ':')}` },
            });
          } catch { /* ignore */ }
        }
      }
      return json({ ok: true });
    }

    return json({ ok: false, error: 'bad_action' }, 400);
  } catch {
    return json({ ok: false, error: 'failed' }, 500);
  }
}
