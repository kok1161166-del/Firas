// POST /api/gallery/upload  (multipart/form-data)
// Fields: file, name, caption, width, height
// Flow: validate → try ImageKit 1 → 2 → 3 (failover) → insert Supabase row (pending) → {ok}

import { json, corsPreflight, getIKAccounts, getSupabase, sbHeaders, clientIp, sha256Hex } from './_lib';

export const config = { runtime: 'edge' };

const MAX_BYTES = 30 * 1024 * 1024; // 30MB

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflight();
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const { url: SB_URL, serviceKey: SB_KEY } = getSupabase();
  if (!SB_URL || !SB_KEY) return json({ ok: false, error: 'supabase_not_configured' }, 500);
  const accounts = getIKAccounts();
  if (!accounts.length) return json({ ok: false, error: 'imagekit_not_configured' }, 500);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, error: 'bad_form' }, 400);
  }

  const file = form.get('file');
  const name = String(form.get('name') || '').trim().slice(0, 40);
  const caption = String(form.get('caption') || '').trim().slice(0, 300);
  const width = Math.max(0, Math.floor(Number(form.get('width') || 0)));
  const height = Math.max(0, Math.floor(Number(form.get('height') || 0)));

  if (!(file instanceof Blob) || (file as any).size === 0) return json({ ok: false, error: 'missing_file' }, 400);
  if ((file as any).size > MAX_BYTES) return json({ ok: false, error: 'file_too_large' }, 413);
  if (name.length < 2) return json({ ok: false, error: 'name_too_short' }, 400);

  const mime = (file as File).type || 'application/octet-stream';
  const isVideo = mime.startsWith('video/');
  const isImage = mime.startsWith('image/');
  if (!isVideo && !isImage) return json({ ok: false, error: 'unsupported_type' }, 400);

  const mediaType = isVideo ? 'video' : 'image';
  const w = width > 0 && width <= 8000 ? width : null;
  const h = height > 0 && height <= 8000 ? height : null;

  const origName = ((file as File).name || `upload.${isVideo ? 'mp4' : 'jpg'}`).replace(/[^\w.\-() ]+/g, '_').slice(0, 80);
  const fileName = `${Date.now()}_${origName}`;

  // ---- Failover across the 3 ImageKit accounts ----
  let uploaded: { url: string; fileId: string; account: number } | null = null;
  let lastErr = '';
  for (const acc of accounts) {
    try {
      const fd = new FormData();
      fd.append('file', file, fileName);
      fd.append('fileName', fileName);
      fd.append('folder', '/firas-gallery');
      fd.append('useUniqueFileName', 'true');
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 60000);
      const res = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
        method: 'POST',
        headers: { Authorization: `Basic ${btoa(acc.privateKey + ':')}` },
        body: fd,
        signal: controller.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        lastErr = `ik${acc.index} HTTP ${res.status}`;
        continue;
      }
      const j: any = await res.json();
      if (!j?.url) {
        lastErr = `ik${acc.index} empty_response`;
        continue;
      }
      uploaded = { url: String(j.url), fileId: String(j.fileId || ''), account: acc.index };
      break;
    } catch (e: any) {
      lastErr = `ik${acc.index} ${e?.name === 'AbortError' ? 'timeout' : 'network'}`;
    }
  }
  if (!uploaded) return json({ ok: false, error: 'all_imagekit_failed', details: lastErr }, 502);

  // ---- Insert row as pending (moderation queue) ----
  const ipHash = await sha256Hex(clientIp(req) + '|' + name).catch(() => null);
  try {
    const ins = await fetch(`${SB_URL}/rest/v1/gallery_items`, {
      method: 'POST',
      headers: { ...sbHeaders(SB_KEY), Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          name,
          caption,
          media_type: mediaType,
          media_url: uploaded.url,
          poster_url: uploaded.url,
          width: w,
          height: h,
          file_id: uploaded.fileId || null,
          ik_account: uploaded.account,
          status: 'pending',
          ip_hash: ipHash,
        },
      ]),
    });
    if (!ins.ok) {
      return json({ ok: false, error: 'db_insert_failed' }, 500);
    }
    const rows = await ins.json().catch(() => []);
    const id = Array.isArray(rows) && rows[0]?.id ? rows[0].id : null;
    return json({
      ok: true,
      message: mediaType === 'video' ? 'تم رفع الفيديو بنجاح وهو الآن بانتظار موافقة الإدارة' : 'تم رفع صورتك بنجاح وهي الآن بانتظار موافقة الإدارة',
      itemId: id,
      ikAccount: uploaded.account,
    });
  } catch {
    return json({ ok: false, error: 'db_insert_failed' }, 500);
  }
}
