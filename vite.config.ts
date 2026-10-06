import path from 'path';
import fs from 'node:fs';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// يقرأ .env الخاص بالمشروع مباشرة (يتجاوز متغيرات النظام القديمة التي تظلل loadEnv)
function readProjectDotEnv(): Record<string, string> {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
    const out: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) v = v.slice(1, -1);
      out[m[1]] = v;
    }
    return out;
  } catch {
    return {};
  }
}
const projectFileEnv = readProjectDotEnv();

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true,
    },
    plugins: [
      react(),
      {
        name: 'local-api-proxy',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            // ---- /api/gallery/* : نفس سلوك Vercel لكن محلياً (تنفيذ مباشر، بدون استيراد ملفات api) ----
            if (req.url && req.url.startsWith('/api/gallery/')) {
              const send = (status: number, obj: unknown) => {
                res.statusCode = status;
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end(JSON.stringify(obj));
              };
              try {
                // ملف .env الخاص بالمشروع هو المرجع محلياً (يتجاوز متغيرات النظام القديمة)
                for (const [k, v] of Object.entries(projectFileEnv)) {
                  if (typeof v === 'string' && v) process.env[k] = v;
                }
                const route = req.url.split('?')[0].split('/').pop() || '';
                if (req.method === 'OPTIONS') {
                  res.statusCode = 204;
                  res.setHeader('Access-Control-Allow-Origin', '*');
                  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
                  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
                  res.end();
                  return;
                }
                const SB_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
                const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
                const sbH: Record<string, string> = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };
                const ikAccs = [1, 2, 3].map((n) => ({
                  n,
                  privateKey: (process.env[`IMAGEKIT_${n}_PRIVATE_KEY`] || '').trim(),
                })).filter((a) => !!a.privateKey);
                const readBody = async (): Promise<Buffer> => {
                  const c: Buffer[] = [];
                  for await (const x of req) c.push(x as Buffer);
                  return Buffer.concat(c);
                };
                const b64u = (s: string) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                const b64uDec = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
                const ADMIN_SECRET = (process.env.GALLERY_ADMIN_SECRET || process.env.RUNNER_SIGNING_SECRET || 'firas-gallery-admin-v1').trim();
                const verifyToken = (tok: string): boolean => {
                  try {
                    const [p, sig] = tok.split('.');
                    if (!p || !sig) return false;
                    const exp = createHmac('sha256', ADMIN_SECRET).update(p).digest('hex');
                    const a = Buffer.from(exp);
                    const b = Buffer.from(sig);
                    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
                    return JSON.parse(b64uDec(p)).exp > Date.now();
                  } catch { return false; }
                };

                // ===== LIST (عام: المعتمد فقط) =====
                if (route === 'list' && req.method === 'GET') {
                  if (!SB_URL || !SB_KEY) { send(500, { ok: false, error: 'supabase_not_configured' }); return; }
                  const u = new URL(req.url, 'http://localhost');
                  const sort = u.searchParams.get('sort') === 'top' ? 'likes.desc,created_at.desc' : 'created_at.desc';
                  const limit = Math.min(200, Math.max(1, Number(u.searchParams.get('limit') || 120)));
                  let q = `${SB_URL}/rest/v1/gallery_items?status=eq.approved&select=id,name,caption,media_type,media_url,poster_url,width,height,likes,shares,reports_count,created_at&order=${encodeURIComponent(sort)}&limit=${limit}`;
                  if (u.searchParams.get('videosOnly') === '1') q += '&media_type=eq.video';
                  const r = await fetch(q, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
                  if (!r.ok) { send(500, { ok: false, error: 'db_read_failed' }); return; }
                  const rows: any[] = await r.json();
                  send(200, {
                    ok: true,
                    items: (rows || []).map((x) => ({
                      id: x.id, name: x.name, caption: x.caption || '',
                      mediaType: x.media_type, mediaUrl: x.media_url, posterUrl: x.poster_url || x.media_url,
                      width: x.width ?? null, height: x.height ?? null,
                      likes: Number(x.likes) || 0, shares: Number(x.shares) || 0, reportsCount: Number(x.reports_count) || 0,
                      createdAt: x.created_at,
                    })),
                  });
                  return;
                }

                // ===== UPLOAD (failover 1→2→3) =====
                if (route === 'upload' && req.method === 'POST') {
                  if (!SB_URL || !SB_KEY) { send(500, { ok: false, error: 'supabase_not_configured' }); return; }
                  if (!ikAccs.length) { send(500, { ok: false, error: 'imagekit_not_configured' }); return; }
                  const raw = await readBody();
                  const fh = new Headers();
                  const ct = req.headers['content-type'];
                  if (typeof ct === 'string') fh.set('content-type', ct);
                  const fr = new Request('http://localhost/x', { method: 'POST', headers: fh, body: raw as any, ...( { duplex: 'half' } as any) });
                  const form = await fr.formData();
                  const file = form.get('file');
                  const name = String(form.get('name') || '').trim().slice(0, 40);
                  const caption = String(form.get('caption') || '').trim().slice(0, 300);
                  const width = Math.max(0, Math.floor(Number(form.get('width') || 0)));
                  const height = Math.max(0, Math.floor(Number(form.get('height') || 0)));
                  if (!(file instanceof Blob) || (file as any).size === 0) { send(400, { ok: false, error: 'missing_file' }); return; }
                  if ((file as any).size > 30 * 1024 * 1024) { send(413, { ok: false, error: 'file_too_large' }); return; }
                  if (name.length < 2) { send(400, { ok: false, error: 'name_too_short' }); return; }
                  const mime = (file as File).type || '';
                  const isVideo = mime.startsWith('video/');
                  if (!isVideo && !mime.startsWith('image/')) { send(400, { ok: false, error: 'unsupported_type' }); return; }
                  const origName = (((file as File).name || 'upload') as string).replace(/[^\w.\-() ]+/g, '_').slice(0, 80);
                  const fileName = `${Date.now()}_${origName}`;
                  let uploaded: { url: string; fileId: string; account: number } | null = null;
                  let lastErr = '';
                  for (const acc of ikAccs) {
                    try {
                      const fd = new FormData();
                      fd.append('file', file, fileName);
                      fd.append('fileName', fileName);
                      fd.append('folder', '/firas-gallery');
                      fd.append('useUniqueFileName', 'true');
                      const rr = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
                        method: 'POST',
                        headers: { Authorization: `Basic ${Buffer.from(acc.privateKey + ':').toString('base64')}` },
                        body: fd,
                      });
                      if (!rr.ok) { lastErr = `ik${acc.n} HTTP ${rr.status}`; continue; }
                      const j: any = await rr.json();
                      if (!j?.url) { lastErr = `ik${acc.n} empty_response`; continue; }
                      uploaded = { url: String(j.url), fileId: String(j.fileId || ''), account: acc.n };
                      break;
                    } catch (e: any) { lastErr = `ik${acc.n} network`; }
                  }
                  if (!uploaded) { send(502, { ok: false, error: 'all_imagekit_failed', details: lastErr }); return; }
                  const up = uploaded as { url: string; fileId: string; account: number };
                  const ins = await fetch(`${SB_URL}/rest/v1/gallery_items`, {
                    method: 'POST',
                    headers: { ...sbH, Prefer: 'return=representation' },
                    body: JSON.stringify([{
                      name, caption,
                      media_type: isVideo ? 'video' : 'image',
                      media_url: up.url, poster_url: up.url,
                      width: width > 0 && width <= 8000 ? width : null,
                      height: height > 0 && height <= 8000 ? height : null,
                      file_id: up.fileId || null, ik_account: up.account, status: 'pending',
                    }]),
                  });
                  if (!ins.ok) { send(500, { ok: false, error: 'db_insert_failed' }); return; }
                  const rows = await ins.json().catch(() => []);
                  send(200, {
                    ok: true,
                    message: isVideo ? 'تم رفع الفيديو بنجاح وهو الآن بانتظار موافقة الإدارة' : 'تم رفع صورتك بنجاح وهي الآن بانتظار موافقة الإدارة',
                    itemId: Array.isArray(rows) && rows[0]?.id ? rows[0].id : null,
                    ikAccount: up.account,
                  });
                  return;
                }

                // ===== INTERACT =====
                if (route === 'interact' && req.method === 'POST') {
                  if (!SB_URL || !SB_KEY) { send(500, { ok: false, error: 'supabase_not_configured' }); return; }
                  const body = JSON.parse((await readBody()).toString('utf8') || '{}');
                  const id = String(body?.id || '');
                  const action = String(body?.action || '');
                  if (!/^[0-9a-f-]{36}$/i.test(id)) { send(400, { ok: false, error: 'bad_id' }); return; }
                  if (action === 'share') {
                    const r = await fetch(`${SB_URL}/rest/v1/rpc/gallery_inc_share`, { method: 'POST', headers: sbH, body: JSON.stringify({ p_item: id }) });
                    send(200, { ok: true, shares: r.ok ? await r.json().catch(() => null) : null });
                    return;
                  }
                  if (action === 'like' || action === 'unlike') {
                    const voter = String(body?.voter || '').slice(0, 128);
                    if (!voter || voter.length < 8) { send(400, { ok: false, error: 'bad_voter' }); return; }
                    if (action === 'like') {
                      await fetch(`${SB_URL}/rest/v1/gallery_likes`, {
                        method: 'POST', headers: { ...sbH, Prefer: 'resolution=ignore-duplicates' },
                        body: JSON.stringify([{ item_id: id, voter_hash: voter }]),
                      });
                      const r = await fetch(`${SB_URL}/rest/v1/rpc/gallery_inc_like`, { method: 'POST', headers: sbH, body: JSON.stringify({ p_item: id }) });
                      send(200, { ok: true, likes: r.ok ? await r.json().catch(() => null) : null });
                      return;
                    }
                    await fetch(`${SB_URL}/rest/v1/gallery_likes?item_id=eq.${id}&voter_hash=eq.${encodeURIComponent(voter)}`, { method: 'DELETE', headers: sbH });
                    const cur: any[] = await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}&select=likes`, { headers: sbH }).then((x) => x.json()).catch(() => []);
                    const n = Math.max(0, (Number(cur?.[0]?.likes) || 1) - 1);
                    await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}`, { method: 'PATCH', headers: sbH, body: JSON.stringify({ likes: n }) });
                    send(200, { ok: true, likes: n });
                    return;
                  }
                  if (action === 'report') {
                    const reason = String(body?.reason || '');
                    const details = String(body?.details || '').slice(0, 500);
                    if (!['spam', 'abuse', 'copyright', 'nsfw', 'other'].includes(reason)) { send(400, { ok: false, error: 'bad_reason' }); return; }
                    const ins = await fetch(`${SB_URL}/rest/v1/gallery_reports`, { method: 'POST', headers: sbH, body: JSON.stringify([{ item_id: id, reason, details }]) });
                    if (!ins.ok) { send(500, { ok: false, error: 'report_failed' }); return; }
                    const cur: any[] = await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}&select=reports_count`, { headers: sbH }).then((x) => x.json()).catch(() => []);
                    await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}`, { method: 'PATCH', headers: sbH, body: JSON.stringify({ reports_count: (Number(cur?.[0]?.reports_count) || 0) + 1 }) });
                    send(200, { ok: true, message: 'تم استلام بلاغك وسيتم مراجعته من الإدارة' });
                    return;
                  }
                  send(400, { ok: false, error: 'bad_action' });
                  return;
                }

                // ===== ADMIN =====
                if (route === 'admin' && req.method === 'POST') {
                  const ADMIN_PASSWORD = (process.env.GALLERY_ADMIN_PASSWORD || '').trim();
                  if (!ADMIN_PASSWORD) { send(500, { ok: false, error: 'admin_not_configured' }); return; }
                  const body = JSON.parse((await readBody()).toString('utf8') || '{}');
                  const action = String(body?.action || '');
                  if (action === 'login') {
                    await new Promise((r) => setTimeout(r, 350));
                    const pw = String(body?.password || '');
                    const a = Buffer.from(pw);
                    const b = Buffer.from(ADMIN_PASSWORD);
                    if (a.length !== b.length || !timingSafeEqual(a, b)) { send(401, { ok: false, error: 'wrong_password' }); return; }
                    const payload = b64u(JSON.stringify({ exp: Date.now() + 6 * 3600 * 1000, iat: Date.now() }));
                    const sig = createHmac('sha256', ADMIN_SECRET).update(payload).digest('hex');
                    send(200, { ok: true, token: `${payload}.${sig}`, expiresInHours: 6 });
                    return;
                  }
                  const tok = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
                  if (!tok || !verifyToken(tok)) { send(401, { ok: false, error: 'unauthorized' }); return; }
                  if (!SB_URL || !SB_KEY) { send(500, { ok: false, error: 'supabase_not_configured' }); return; }
                  const ITEM_SELV2 = 'id,name,caption,kind,media_type,status,media_url,poster_url,url,width,height,likes,shares,reports_count,file_id,ik_account,reject_reason,internal_note,reviewing_by,reviewing_at,reviewed_at,reviewer,created_at';
                  const ITEM_SELV1 = 'id,name,caption,media_type,status,media_url,poster_url,width,height,likes,shares,reports_count,file_id,ik_account,created_at';
                  let compatMode = false;
                  const smartSel = async (qs: string) => {
                    let r = await fetch(`${SB_URL}/rest/v1/gallery_items?${qs.replace('SELECT_HOLDER', ITEM_SELV2)}`, { headers: sbH });
                    if (!r.ok) {
                      r = await fetch(`${SB_URL}/rest/v1/gallery_items?${qs.replace('SELECT_HOLDER', ITEM_SELV1)}`, { headers: sbH });
                      if (r.ok) compatMode = true;
                    }
                    return r;
                  };
                  const smartPatch = async (id: string, patch: any, minimal: any) => {
                    let r = await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}`, { method: 'PATCH', headers: sbH, body: JSON.stringify(patch) });
                    if (!r.ok && r.status === 400) {
                      r = await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}`, { method: 'PATCH', headers: sbH, body: JSON.stringify(minimal) });
                      if (r.ok) compatMode = true;
                    }
                    return r;
                  };
                  const toAI = (x: any) => ({
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
                  });
                  const getI = async (id: string) => {
                    const r = await smartSel(`id=eq.${id}&select=SELECT_HOLDER`);
                    if (!r.ok) return null;
                    const rows = await r.json().catch(() => []);
                    return Array.isArray(rows) && rows[0] ? rows[0] : null;
                  };
                  const logA = async (a: string, item: any, reason = '', note = '', meta: any = {}) => {
                    try {
                      await fetch(`${SB_URL}/rest/v1/gallery_audit`, {
                        method: 'POST', headers: sbH,
                        body: JSON.stringify([{ action: a, item_id: item?.id || null, item_name: item?.name || '', reason: String(reason).slice(0, 160), note: String(note).slice(0, 500), admin: 'admin', meta }]),
                      });
                    } catch { /* ignore */ }
                  };
                  const nowIso = new Date().toISOString();
                  const moderateL = async (id: string, to: 'approved' | 'rejected', reason: string, kind: string) => {
                    const cur = await getI(id);
                    if (!cur) return { ok: false as const, error: 'not_found' };
                    const need = kind === 'unpublish' ? 'approved' : 'pending';
                    if (cur.status !== need) return { ok: false as const, error: kind === 'unpublish' ? 'not_approved' : 'not_pending' };
                    const patch: any = { status: to, reviewed_at: nowIso, reviewer: 'admin', reviewing_by: null, reviewing_at: null };
                    patch.reject_reason = to === 'rejected' ? String(reason).slice(0, 160) : '';
                    const minimal: any = { status: to, reject_reason: patch.reject_reason };
                    const r = await smartPatch(id, patch, minimal);
                    if (!r.ok) return { ok: false as const, error: 'update_failed' };
                    await logA(kind, cur, reason, '', { from: cur.status, to });
                    return { ok: true as const };
                  };
                  if (action === 'stats') {
                    const core = await Promise.all([
                      fetch(`${SB_URL}/rest/v1/gallery_items?status=eq.pending&select=id`, { headers: sbH }),
                      fetch(`${SB_URL}/rest/v1/gallery_items?status=eq.approved&select=id`, { headers: sbH }),
                      fetch(`${SB_URL}/rest/v1/gallery_items?status=eq.rejected&select=id`, { headers: sbH }),
                    ]);
                    if (core.some((r) => !r.ok)) { send(500, { ok: false, error: 'db_read_failed' }); return; }
                    const [pending, approved, rejected] = await Promise.all(core.map((r) => r.json().catch(() => [])));
                    const [openRep, agg, recentR]: any[] = await Promise.all([
                      fetch(`${SB_URL}/rest/v1/gallery_reports?status=eq.open&select=id,item_id`, { headers: sbH }).then((r) => r.json()).catch(() => []),
                      fetch(`${SB_URL}/rest/v1/gallery_items?select=likes,shares,reports_count,ik_account,media_type`, { headers: sbH }).then((r) => r.json()).catch(() => []),
                      smartSel(`select=SELECT_HOLDER&order=created_at.desc&limit=8`).then((r) => r.json()).catch(() => []),
                    ]);
                    const recent = recentR;
                    const flaggedIds = new Set((Array.isArray(openRep) ? openRep : []).map((x: any) => x.item_id));
                    const sum = (k: string) => (Array.isArray(agg) ? agg.reduce((a: number, x: any) => a + (Number(x[k]) || 0), 0) : 0);
                    send(200, {
                      ok: true,
                      stats: {
                        pending: pending.length, approved: approved.length, rejected: rejected.length,
                        total: Array.isArray(agg) ? agg.length : 0,
                        flagged: flaggedIds.size, openReports: openRep.length,
                        totalLikes: sum('likes'), totalShares: sum('shares'), totalReports: sum('reports_count'),
                        images: Array.isArray(agg) ? agg.filter((x: any) => x.media_type === 'image').length : 0,
                        videos: Array.isArray(agg) ? agg.filter((x: any) => x.media_type === 'video').length : 0,
                        byAccount: [1, 2, 3].map((n) => ({ account: n, count: Array.isArray(agg) ? agg.filter((x: any) => Number(x.ik_account) === n).length : 0 })),
                        recent: Array.isArray(recent) ? recent.map(toAI) : [],
                        compat: compatMode,
                      },
                    });
                    return;
                  }
                  if (action === 'list') {
                    const st = String(body?.status || 'pending');
                    if (!['pending', 'approved', 'rejected'].includes(st)) { send(400, { ok: false, error: 'bad_status' }); return; }
                    const limit = Math.min(200, Math.max(1, Number(body?.limit || 60)));
                    const offset = Math.max(0, Number(body?.offset || 0));
                    const r = await smartSel(`status=eq.${st}&select=SELECT_HOLDER&order=created_at.desc&limit=${limit}&offset=${offset}`);
                    if (!r.ok) { send(500, { ok: false, error: 'db_read_failed' }); return; }
                    const rows = await r.json().catch(() => []);
                    send(200, { ok: true, items: (Array.isArray(rows) ? rows : []).map(toAI), compat: compatMode });
                    return;
                  }
                  if (action === 'approve') {
                    const id = String(body?.id || '');
                    if (!/^[0-9a-f-]{36}$/i.test(id)) { send(400, { ok: false, error: 'bad_id' }); return; }
                    const res = await moderateL(id, 'approved', '', 'approve');
                    if (!res.ok) { send(409, { ok: false, error: res.error }); return; }
                    send(200, { ok: true, status: 'approved' });
                    return;
                  }
                  if (action === 'reject') {
                    const id = String(body?.id || '');
                    const reason = String(body?.reason || '').slice(0, 160);
                    if (!/^[0-9a-f-]{36}$/i.test(id)) { send(400, { ok: false, error: 'bad_id' }); return; }
                    if (!reason) { send(400, { ok: false, error: 'reason_required' }); return; }
                    const res = await moderateL(id, 'rejected', reason, 'reject');
                    if (!res.ok) { send(409, { ok: false, error: res.error }); return; }
                    send(200, { ok: true, status: 'rejected' });
                    return;
                  }
                  if (action === 'unpublish') {
                    const id = String(body?.id || '');
                    const reason = String(body?.reason || '').slice(0, 160);
                    if (!/^[0-9a-f-]{36}$/i.test(id)) { send(400, { ok: false, error: 'bad_id' }); return; }
                    if (!reason) { send(400, { ok: false, error: 'reason_required' }); return; }
                    const res = await moderateL(id, 'rejected', reason, 'unpublish');
                    if (!res.ok) { send(409, { ok: false, error: res.error }); return; }
                    send(200, { ok: true, status: 'rejected' });
                    return;
                  }
                  if (action === 'bulk') {
                    const op = String(body?.op || '');
                    const reason = String(body?.reason || '').slice(0, 160);
                    const ids = (Array.isArray(body?.ids) ? body.ids : []).map(String).filter((x: string) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 100);
                    if (!['approve', 'reject', 'unpublish'].includes(op)) { send(400, { ok: false, error: 'bad_op' }); return; }
                    if (!ids.length) { send(200, { ok: true, done: 0, failed: 0, skipped: 0, total: 0 }); return; }
                    if ((op === 'reject' || op === 'unpublish') && !reason) { send(400, { ok: false, error: 'reason_required' }); return; }
                    let done = 0, failed = 0, skipped = 0;
                    for (const id of ids) {
                      try {
                        const res = op === 'approve' ? await moderateL(id, 'approved', '', 'approve')
                          : op === 'reject' ? await moderateL(id, 'rejected', reason, 'reject')
                          : await moderateL(id, 'rejected', reason, 'unpublish');
                        if (res.ok) done++;
                        else if ((res as any).error === 'not_pending' || (res as any).error === 'not_approved') skipped++;
                        else failed++;
                      } catch { failed++; }
                    }
                    send(200, { ok: true, done, failed, skipped, total: ids.length });
                    return;
                  }
                  if (action === 'undo') {
                    const ids = (Array.isArray(body?.ids) ? body.ids : []).map(String).filter((x: string) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 100);
                    let undone = 0, expired = 0, nothing = 0;
                    for (const id of ids) {
                      try {
                        const h = await fetch(`${SB_URL}/rest/v1/gallery_audit?item_id=eq.${id}&action=in.(approve,reject,unpublish)&select=action,meta,created_at&order=created_at.desc&limit=1`, { headers: sbH });
                        const rows = await h.json().catch(() => []);
                        const last = Array.isArray(rows) && rows[0] ? rows[0] : null;
                        if (!last) { nothing++; continue; }
                        if (Date.now() - new Date(last.created_at).getTime() > 60000) { expired++; continue; }
                        const from = last.meta?.from || (last.action === 'approve' ? 'pending' : 'approved');
                        const cur = await getI(id);
                        if (!cur) { nothing++; continue; }
                        const r = await smartPatch(id, { status: from, reject_reason: '', reviewed_at: null, reviewer: '' }, { status: from, reject_reason: '' });
                        if (!r.ok) { nothing++; continue; }
                        await logA('undo', cur, '', '', { restored: from, of: last.action });
                        undone++;
                      } catch { nothing++; }
                    }
                    if (!undone) { send(200, { ok: true, undone, expired, nothing, error: expired ? 'undo_window_expired' : 'nothing_to_undo' }); return; }
                    send(200, { ok: true, undone, expired, nothing });
                    return;
                  }
                  if (action === 'updateItem') {
                    const id = String(body?.id || '');
                    const name = String(body?.name || '').trim().slice(0, 40);
                    const caption = String(body?.caption || '').trim().slice(0, 180);
                    if (!/^[0-9a-f-]{36}$/i.test(id)) { send(400, { ok: false, error: 'bad_id' }); return; }
                    if (name.length < 2) { send(400, { ok: false, error: 'name_too_short' }); return; }
                    const cur = await getI(id);
                    if (!cur) { send(404, { ok: false, error: 'not_found' }); return; }
                    const r = await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}`, { method: 'PATCH', headers: sbH, body: JSON.stringify({ name, caption }) });
                    if (!r.ok) { send(500, { ok: false, error: 'update_failed' }); return; }
                    await logA('update', cur, '', '', { prev: { name: cur.name, caption: cur.caption }, next: { name, caption } });
                    send(200, { ok: true });
                    return;
                  }
                  if (action === 'setNote') {
                    const id = String(body?.id || '');
                    const note = String(body?.note || '').slice(0, 2000);
                    if (!/^[0-9a-f-]{36}$/i.test(id)) { send(400, { ok: false, error: 'bad_id' }); return; }
                    const cur = await getI(id);
                    if (!cur) { send(404, { ok: false, error: 'not_found' }); return; }
                    const r = await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}`, { method: 'PATCH', headers: sbH, body: JSON.stringify({ internal_note: note }) });
                    if (!r.ok && r.status === 400) { send(409, { ok: false, error: 'migration_required' }); return; }
                    if (!r.ok) { send(500, { ok: false, error: 'update_failed' }); return; }
                    await logA('note', cur, '', note ? 'Updated private note' : 'Cleared private note');
                    send(200, { ok: true });
                    return;
                  }
                  if (action === 'beginReview') {
                    const id = String(body?.id || '');
                    const reviewer = String(body?.reviewer || '').slice(0, 64) || 'admin';
                    if (!/^[0-9a-f-]{36}$/i.test(id)) { send(400, { ok: false, error: 'bad_id' }); return; }
                    const cur = await getI(id);
                    if (!cur) { send(404, { ok: false, error: 'not_found' }); return; }
                    if (cur.reviewing_by && cur.reviewing_by !== reviewer && cur.reviewing_at && Date.now() - new Date(cur.reviewing_at).getTime() < 120000) {
                      send(200, { ok: false, error: 'locked', lockedBy: cur.reviewing_by });
                      return;
                    }
                    const br = await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}`, { method: 'PATCH', headers: sbH, body: JSON.stringify({ reviewing_by: reviewer, reviewing_at: nowIso }) });
                    if (!br.ok && br.status === 400) { send(200, { ok: true, compat: true }); return; }
                    send(200, { ok: true, compat: compatMode });
                    return;
                  }
                  if (action === 'endReview') {
                    const id = String(body?.id || '');
                    const reviewer = String(body?.reviewer || '').slice(0, 64) || 'admin';
                    if (!/^[0-9a-f-]{36}$/i.test(id)) { send(400, { ok: false, error: 'bad_id' }); return; }
                    const cur = await getI(id);
                    if (cur && (!cur.reviewing_by || cur.reviewing_by === reviewer)) {
                      await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}`, { method: 'PATCH', headers: sbH, body: JSON.stringify({ reviewing_by: null, reviewing_at: null }) });
                    }
                    send(200, { ok: true });
                    return;
                  }
                  if (action === 'clearReports') {
                    const itemId = String(body?.itemId || '');
                    if (!/^[0-9a-f-]{36}$/i.test(itemId)) { send(400, { ok: false, error: 'bad_id' }); return; }
                    const cur = await getI(itemId);
                    await fetch(`${SB_URL}/rest/v1/gallery_reports?item_id=eq.${itemId}`, { method: 'DELETE', headers: sbH });
                    if (cur) {
                      await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${itemId}`, { method: 'PATCH', headers: sbH, body: JSON.stringify({ reports_count: 0 }) });
                      await logA('clear_reports', cur, '', 'Dismissed public report flags');
                    }
                    send(200, { ok: true });
                    return;
                  }
                  if (action === 'audit') {
                    const query = String(body?.query || '').slice(0, 120).toLowerCase();
                    const limit = Math.min(500, Math.max(1, Number(body?.limit || 200)));
                    const r = await fetch(`${SB_URL}/rest/v1/gallery_audit?select=id,action,item_id,item_name,reason,note,admin,meta,created_at&order=created_at.desc&limit=${limit}`, { headers: sbH });
                    let rows = await r.json().catch(() => []);
                    if (!Array.isArray(rows)) rows = [];
                    if (query) {
                      rows = rows.filter((x: any) => `${x.admin || ''} ${x.action || ''} ${x.reason || ''} ${x.note || ''} ${x.item_name || ''} ${JSON.stringify(x.meta || {})}`.toLowerCase().includes(query));
                    }
                    send(200, { ok: true, actions: rows });
                    return;
                  }
                  if (action === 'remove') {
                    const id = String(body?.id || '');
                    if (!/^[0-9a-f-]{36}$/i.test(id)) { send(400, { ok: false, error: 'bad_id' }); return; }
                    const cur: any[] = await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}&select=file_id,ik_account`, { headers: sbH }).then((r) => r.json()).catch(() => []);
                    await fetch(`${SB_URL}/rest/v1/gallery_items?id=eq.${id}`, { method: 'DELETE', headers: sbH });
                    const fileId = cur?.[0]?.file_id;
                    if (fileId) {
                      const acc = ikAccs.find((a) => a.n === Number(cur?.[0]?.ik_account)) || ikAccs[0];
                      if (acc) {
                        try {
                          await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(String(fileId))}`, {
                            method: 'DELETE',
                            headers: { Authorization: `Basic ${Buffer.from(acc.privateKey + ':').toString('base64')}` },
                          });
                        } catch { /* ignore */ }
                      }
                    }
                    send(200, { ok: true });
                    return;
                  }
                  if (action === 'reports') {
                    const f = String(body?.filter || 'open');
                    const base = `order=created_at.desc&limit=500`;
                    const ff = (['open', 'resolved', 'dismissed'].includes(f)) ? `&status=eq.${f}` : '';
                    let r = await fetch(`${SB_URL}/rest/v1/gallery_reports?select=id,item_id,reason,details,status,device_id,created_at&${base}${ff}`, { headers: sbH });
                    if (!r.ok) {
                      r = await fetch(`${SB_URL}/rest/v1/gallery_reports?select=id,item_id,reason,details,status,created_at&${base}${ff}`, { headers: sbH });
                    }
                    if (!r.ok) { send(500, { ok: false, error: 'db_read_failed' }); return; }
                    send(200, { ok: true, reports: await r.json().catch(() => []) });
                    return;
                  }
                  if (action === 'resolveReport') {
                    const id = String(body?.id || '');
                    const decision = String(body?.decision || '');
                    if (!/^[0-9a-f-]{36}$/i.test(id) || !['resolved', 'dismissed'].includes(decision)) { send(400, { ok: false, error: 'bad_input' }); return; }
                    const r = await fetch(`${SB_URL}/rest/v1/gallery_reports?id=eq.${id}`, { method: 'PATCH', headers: sbH, body: JSON.stringify({ status: decision }) });
                    if (!r.ok) { send(500, { ok: false, error: 'update_failed' }); return; }
                    send(200, { ok: true });
                    return;
                  }
                  send(400, { ok: false, error: 'bad_action' });
                  return;
                }

                send(404, { ok: false, error: 'not_found' });
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                const cause = (err as any)?.cause;
                res.end(JSON.stringify({
                  ok: false,
                  error: 'local_gallery_failed',
                  details: String(err?.message || err).slice(0, 200),
                  cause: String((cause as any)?.code || (cause as any)?.message || cause || '').slice(0, 200),
                }));
              }
              return;
            }
            // ---- /api/runner-score : مرآة لـ api/runner-score.ts (نفس الفيزياء والإيصال) ----
            if (req.url && (req.url === '/api/runner-score' || req.url.startsWith('/api/runner-score?'))) {
              const RS_START = 34;
              const RS_MAX = 400;
              const RS_RAMP = 0.0035;
              const LS_BASE = 80;
              const LS_FLOOR = 42;
              const MAX_TIER = 41;
              const msLen = (lvl: number) => 1100 + Math.min(Math.max(1, Math.floor(lvl)) - 1, MAX_TIER) * 220;
              const maxHonest = (secs: number) => {
                const t = Math.max(0, secs);
                if (t <= 0) return 0;
                const r = RS_RAMP;
                const d1 = (RS_MAX - RS_START) / r;
                const t1 = Math.log(RS_MAX / RS_START) / r;
                if (t <= t1) return (RS_START / r) * (Math.exp(r * t) - 1);
                return d1 + (t - t1) * RS_MAX;
              };
              try {
                for (const [k, v] of Object.entries(projectFileEnv)) {
                  if (typeof v === 'string' && v) process.env[k] = v;
                }
                const SBU = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
                const SBK = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
                const sH = { apikey: SBK, Authorization: `Bearer ${SBK}`, 'Content-Type': 'application/json' };
                const secret = process.env.RUNNER_SIGNING_SECRET || 'firas-runner-citadel-v1';
                const sendJson = (st: number, o: unknown) => {
                  res.statusCode = st;
                  res.setHeader('Content-Type', 'application/json');
                  res.setHeader('Cache-Control', 'no-store');
                  res.setHeader('Access-Control-Allow-Origin', '*');
                  res.end(JSON.stringify(o));
                };
                if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

                if (req.method === 'GET') {
                  const u = new URL(req.url, 'http://localhost');
                  const device = u.searchParams.get('device') || '';
                  let best: number | null = null;
                  if (SBU && SBK && device) {
                    try {
                      const r = await fetch(`${SBU}/rest/v1/runner_scores?device_id=eq.${encodeURIComponent(device)}&select=score,distance&order=score.desc&limit=1`, { headers: sH });
                      if (r.ok) {
                        const rows = await r.json().catch(() => []);
                        if (Array.isArray(rows) && rows[0]) best = Number(rows[0].score) || 0;
                      }
                    } catch { /* optional */ }
                  }
                  sendJson(200, { ok: true, best: best === null ? null : { score: best, distance: 0 } });
                  return;
                }
                if (req.method !== 'POST') { sendJson(405, { ok: false, error: 'method_not_allowed' }); return; }

                const chunks: Buffer[] = [];
                for await (const c of req) chunks.push(c as Buffer);
                const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                const device = String(body?.device || '').slice(0, 64);
                if (!device) { sendJson(400, { ok: false, error: 'missing_device' }); return; }

                const num = (v: unknown, f = 0) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : f; };
                const tiers = Math.min(4000, Math.max(1, Math.floor(num(body?.tiers, 1))));
                const seconds = Math.min(86400, num(body?.seconds, 0));
                const claimedDistance = Math.min(1e9, Math.floor(num(body?.distance, 0)));
                const claimedGems = Math.min(1e7, Math.floor(num(body?.gems, 0)));
                const claimedLetters = Math.min(1e7, Math.floor(num(body?.letters, 0)));
                const claimedScore = Math.min(1e12, Math.floor(num(body?.score, 0)));

                const maxDistance = maxHonest(seconds) * 1.12;
                const maxTiers = Math.max(1, Math.floor((maxDistance + 1) / msLen(1)));
                const allowedTiers = Math.min(tiers, maxTiers);
                const allowedDistance = Math.min(claimedDistance, Math.floor(maxDistance));
                const maxGems = allowedDistance > 0 ? Math.floor((allowedDistance / 6) * 0.94) : 0;
                const allowedGems = Math.min(claimedGems, maxGems);
                const spacing = Math.max(LS_FLOOR, LS_BASE - allowedDistance * 0.008);
                const maxLetters = allowedDistance > 0 ? Math.floor(allowedDistance / spacing) + 8 : 0;
                const allowedLetters = Math.min(claimedLetters, maxLetters);
                const allowedScore = Math.min(claimedScore, allowedGems * 100 + allowedLetters * 1000);

                const flags: string[] = [];
                if (allowedScore !== claimedScore) flags.push('score');
                if (allowedDistance !== claimedDistance) flags.push('distance');
                if (allowedGems !== claimedGems) flags.push('gems');
                if (allowedLetters !== claimedLetters) flags.push('letters');
                if (allowedTiers !== tiers) flags.push('tiers');

                const accepted = {
                  score: allowedScore, distance: allowedDistance, gems: allowedGems,
                  letters: allowedLetters, tiers: allowedTiers, seconds: Math.round(seconds),
                };
                const payload = `FIRAS-RUNNER-V1|score=${accepted.score}|dist=${accepted.distance}|gems=${accepted.gems}|letters=${accepted.letters}|tiers=${accepted.tiers}|secs=${accepted.seconds}`;
                const receipt = createHmac('sha256', secret).update(payload).digest('hex').slice(0, 24).toUpperCase();

                let stored: number | null = null;
                if (SBU && SBK) {
                  try {
                    const r = await fetch(`${SBU}/rest/v1/runner_scores?on_conflict=device_id`, {
                      method: 'POST',
                      headers: { ...sH, Prefer: 'resolution=merge-duplicates,return=representation' },
                      body: JSON.stringify([{ device_id: device, ...accepted, receipt, verified: flags.length === 0, created_at: new Date().toISOString() }]),
                    });
                    if (r.ok) { const rows = await r.json().catch(() => []); stored = Array.isArray(rows) && rows[0] ? Number(rows[0].score) || null : null; }
                  } catch { /* optional */ }
                }

                sendJson(200, {
                  ok: true, accepted, clean: flags.length === 0, flags, receipt,
                  best: stored !== null ? stored : accepted.score,
                });
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: false, error: 'local_runner_score_failed', details: String(err?.message || err).slice(0, 160) }));
              }
              return;
            }
            // ---- /api/groq : نفس سلوك سيرفر Vercel لكن محلياً (npm run dev) ----
            if (req.url && (req.url === '/api/groq' || req.url.startsWith('/api/groq?'))) {
              if (req.method === 'OPTIONS') {
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                res.statusCode = 204;
                res.end();
                return;
              }
              if (req.method !== 'POST') {
                res.statusCode = 405;
                res.end(JSON.stringify({ error: 'Use POST' }));
                return;
              }
              try {
                const chunks: Buffer[] = [];
                for await (const c of req) chunks.push(c as Buffer);
                const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');
                const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
                if (!messages.length) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'messages array is required' }));
                  return;
                }

                // المفاتيح من .env المحلي (نفس أسماء Vercel)
                const keys: string[] = [];
                for (const n of ['1', '2', '3', '4', '5']) {
                  const k = env[`GROQ_API_KEY_${n}`];
                  if (k && k.trim()) keys.push(k.trim());
                }
                const combined = env.GROQ_API_KEYS || env.VITE_GROQ_API_KEYS;
                if (combined) {
                  for (const k of String(combined).split(',')) {
                    const t = k.trim();
                    if (t && !keys.includes(t)) keys.push(t);
                  }
                }
                if (!keys.length) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: 'No GROQ keys in local .env (GROQ_API_KEY_1..3)' }));
                  return;
                }

                const models = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'allam-2-7b'];
                const clean = messages
                  .filter((m: any) => m && typeof m.content === 'string' && ['system', 'user', 'assistant'].includes(m.role))
                  .slice(-20)
                  .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 6000) }));

                let lastErr = '';
                for (let k = 0; k < keys.length; k++) {
                  for (const model of models) {
                    try {
                      const controller = new AbortController();
                      const t = setTimeout(() => controller.abort(), 25000);
                      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys[k]}` },
                        body: JSON.stringify({ model, messages: clean, max_tokens: 1024, temperature: 0.7 }),
                        signal: controller.signal,
                      });
                      clearTimeout(t);
                      if (r.status === 401) { lastErr = `key${k + 1} unauthorized`; break; }
                      if (!r.ok) { lastErr = `key${k + 1}/${model} HTTP ${r.status}`; continue; }
                      const j: any = await r.json();
                      const reply = j?.choices?.[0]?.message?.content?.trim();
                      if (reply) {
                        res.setHeader('Content-Type', 'application/json');
                        res.setHeader('Access-Control-Allow-Origin', '*');
                        res.statusCode = 200;
                        res.end(JSON.stringify({ reply, model, keyIndex: k + 1 }));
                        return;
                      }
                      lastErr = `key${k + 1}/${model} empty reply`;
                    } catch (err: any) {
                      lastErr = `key${k + 1}/${model} fail`;
                    }
                  }
                }
                res.statusCode = 502;
                res.end(JSON.stringify({ error: 'All GROQ keys/models failed', details: lastErr }));
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
              }
              return;
            }
            if (req.url && req.url.startsWith('/api/social')) {
              // ---- /api/social : عدّادات التواصل الحية محلياً (مرآة api/social.ts) ----
              const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
              const platform = (url.searchParams.get('platform') || '').toLowerCase();
              const HANDLES: Record<string, string> = { tiktok: 'vfiras3', instagram: 'vfiras3', twitter: 'vfiras3', youtube: 'UCD7EpD4o6bw24c5o5vu4hGQ' };
              const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
              const parseCompact = (input: any): number | null => {
                if (typeof input === 'number' && Number.isFinite(input)) return Math.round(input);
                const s = String(input ?? '').replace(/,/g, '').trim();
                const m = s.match(/([\d.]+)\s*([KMB])?/i);
                if (!m) return null;
                let n = parseFloat(m[1]);
                if (!Number.isFinite(n)) return null;
                const u = (m[2] || '').toUpperCase();
                if (u === 'K') n *= 1e3; else if (u === 'M') n *= 1e6; else if (u === 'B') n *= 1e9;
                const out = Math.round(n);
                return out > 0 ? out : null;
              };
              const jget = async (u: string, timeoutMs = 12000) => {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);
                try {
                  const r = await fetch(u, { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: controller.signal });
                  if (!r.ok) throw new Error(`HTTP ${r.status}`);
                  return await r.json();
                } finally { clearTimeout(timer); }
              };
              const tget = async (u: string, timeoutMs = 12000) => {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);
                try {
                  const r = await fetch(u, { headers: { Accept: 'text/html', 'User-Agent': UA }, signal: controller.signal });
                  if (!r.ok) throw new Error(`HTTP ${r.status}`);
                  return await r.text();
                } finally { clearTimeout(timer); }
              };
              const tryFirst = async (fns: Array<() => Promise<{ count: number; source: string }>>) => {
                let last = 'failed';
                for (const fn of fns) {
                  try { return await fn(); } catch (e: any) { last = e?.message || 'failed'; }
                }
                throw new Error(last);
              };
              try {
                if (!HANDLES[platform]) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'Use ?platform=tiktok|instagram|youtube|twitter' }));
                  return;
                }
                let result: { count: number; source: string };
                if (platform === 'tiktok') {
                  result = await tryFirst([
                    async () => {
                      const d: any = await jget(`https://user.tikmatrix.com/api/user?username=${HANDLES.tiktok}`);
                      const n = parseCompact(d?.stats?.Followers);
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'tikmatrix' };
                    },
                    async () => {
                      const d: any = await jget(`https://countik.com/api/tiktok/@${HANDLES.tiktok}`);
                      const n = parseCompact(d?.followerCount ?? d?.followers ?? d?.follower_count);
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'countik' };
                    },
                  ]);
                } else if (platform === 'youtube') {
                  result = await tryFirst([
                    async () => {
                      const d: any = await jget(`https://mixerno.space/api/youtube-channel-counter/user/${HANDLES.youtube}`);
                      const entry = Array.isArray(d?.counts) ? d.counts.find((c: any) => c?.value === 'subscribers') : null;
                      const n = parseCompact(entry?.count);
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'mixerno' };
                    },
                    async () => {
                      const d: any = await jget(`https://pipedapi.kavin.rocks/channel/${HANDLES.youtube}`);
                      const n = parseCompact(d?.subscriberCount);
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'piped' };
                    },
                  ]);
                } else if (platform === 'twitter') {
                  result = await tryFirst([
                    async () => {
                      const d: any = await jget(`https://api.fxtwitter.com/${HANDLES.twitter}`);
                      const n = parseCompact(d?.user?.followers);
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'fxtwitter' };
                    },
                    async () => {
                      const d: any = await jget(`https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=${HANDLES.twitter}`);
                      const n = parseCompact(Array.isArray(d) ? d[0]?.followers_count : d?.followers_count);
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'syndication' };
                    },
                  ]);
                } else {
                  result = await tryFirst([
                    async () => {
                      const d: any = await jget(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${HANDLES.instagram}`);
                      const n = parseCompact(d?.data?.user?.edge_followed_by?.count);
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'web_profile_info' };
                    },
                    async () => {
                      const html = await tget(`https://www.instagram.com/${HANDLES.instagram}/`);
                      const og = html.match(/property="og:description"\s+content="([^"]+)"/)?.[1] || '';
                      const m = og.match(/([\d.,]+[KMB]?)\s+Followers/i);
                      const n = m ? parseCompact(m[1]) : null;
                      if (!n) throw new Error('empty');
                      return { count: n, source: 'og_description' };
                    },
                  ]);
                }
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.statusCode = 200;
                res.end(JSON.stringify({ platform, ...result, updatedAt: new Date().toISOString() }));
              } catch (err: any) {
                res.statusCode = 502;
                res.end(JSON.stringify({ platform, count: null, error: err.message || 'failed' }));
              }
              return;
            }
            if (req.url && req.url.startsWith('/api/kick')) {
              // Parse the URL
              const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
              const endpoint = url.searchParams.get('endpoint');
              
              if (!endpoint) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Missing endpoint' }));
                return;
              }
              
              try {
                const targetUrl = Array.isArray(endpoint) ? endpoint[0] : endpoint;
                
                // Use built-in Node.js fetch (Node 18+) with timeout so slow Kick API never hangs dev
                const kickController = new AbortController();
                const kickTimer = setTimeout(() => kickController.abort(), 12000);
                const response = await fetch(targetUrl, {
                  headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                  },
                  signal: kickController.signal,
                });
                
                const text = await response.text();
                clearTimeout(kickTimer);
                
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.statusCode = response.status;
                res.end(text);
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
              }
            } else {
              next();
            }
          });
        }
      }
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
