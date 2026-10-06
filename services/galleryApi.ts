// Frontend client for the Gallery Wall (public + admin).
// Uploads go to /api/gallery/upload (server holds ImageKit private keys + failover 1→2→3).
// Reads go to /api/gallery/list (approved only). Likes/shares/reports → /api/gallery/interact.
// Admin → /api/gallery/admin (password → short-lived HMAC token, 12h, sessionStorage).

export interface WallItem {
  id: string;
  name: string;
  caption: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  posterUrl: string;
  width: number | null;
  height: number | null;
  likes: number;
  shares: number;
  reportsCount: number;
  createdAt: string;
}

const TOKEN_KEY = 'tmnaa_admin_token';
const LEGACY_KEY = 'firas_gallery_admin_token';

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_KEY);
  } catch {
    return null;
  }
}
export function setAdminToken(t: string | null) {
  try {
    if (t) {
      localStorage.setItem(TOKEN_KEY, t);
      localStorage.removeItem(LEGACY_KEY);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(LEGACY_KEY);
    }
  } catch { /* ignore */ }
}
export function clearAdminToken() {
  setAdminToken(null);
}

/** معرّف المراجع (لأقفال المراجعة) — ثابت لكل متصفح */
export function reviewerId(): string {
  try {
    let v = localStorage.getItem('tmnaa_reviewer');
    if (!v) {
      v = `rev_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('tmnaa_reviewer', v);
    }
    return v;
  } catch {
    return 'rev_anon';
  }
}

async function jget(url: string) {
  const r = await fetch(url);
  return r.json();
}
async function jpost(url: string, body: any, token?: string | null) {
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

export async function fetchWall(sort: 'balanced' | 'newest' | 'top' = 'balanced', videosOnly = false): Promise<WallItem[]> {
  const serverSort = sort === 'top' ? 'top' : 'newest';
  const j = await jget(`/api/gallery/list?sort=${serverSort}&videosOnly=${videosOnly ? 1 : 0}&limit=150`);
  if (!j?.ok) throw new Error('wall_failed');
  return (j.items || []) as WallItem[];
}

/** Read natural dimensions before upload (needed for the balanced masonry math). */
export function probeDimensions(file: File): Promise<{ w: number | null; h: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('image/')) {
      const img = new Image();
      img.onload = () => {
        resolve({ w: img.naturalWidth || null, h: img.naturalHeight || null });
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        resolve({ w: null, h: null });
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } else if (file.type.startsWith('video/')) {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.onloadedmetadata = () => {
        resolve({ w: (v as any).videoWidth || null, h: (v as any).videoHeight || null });
        URL.revokeObjectURL(url);
      };
      v.onerror = () => {
        resolve({ w: null, h: null });
        URL.revokeObjectURL(url);
      };
      v.src = url;
    } else resolve({ w: null, h: null });
  });
}

export async function uploadToWall(file: File, name: string, caption: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  const { w, h } = await probeDimensions(file);
  const fd = new FormData();
  fd.append('file', file);
  fd.append('name', name);
  fd.append('caption', caption);
  if (w) fd.append('width', String(w));
  if (h) fd.append('height', String(h));
  const r = await fetch('/api/gallery/upload', { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({}));
  return j;
}

export function voterId(): string {
  try {
    let v = localStorage.getItem('firas_gallery_voter');
    if (!v) {
      v = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem('firas_gallery_voter', v);
    }
    return v;
  } catch {
    return `anon_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export async function toggleLike(item: WallItem, liked: boolean) {
  return jpost('/api/gallery/interact', {
    id: item.id,
    action: liked ? 'unlike' : 'like',
    voter: voterId(),
  });
}

export async function shareItem(item: WallItem) {
  const url = `${location.origin}${location.pathname}#gallery-${item.id}`;
  const text = item.caption ? `${item.name}: ${item.caption}` : `شاهد إبداع ${item.name} في معرض فراس`;
  try {
    if (navigator.share) await navigator.share({ title: 'معرض فراس', text, url });
    else await navigator.clipboard.writeText(url);
  } catch { /* dismissed */ }
  jpost('/api/gallery/interact', { id: item.id, action: 'share' }).catch(() => {});
  return url;
}

export async function reportItem(id: string, reason: string, details: string) {
  return jpost('/api/gallery/interact', { id, action: 'report', reason, details });
}

// ---------------- Admin ----------------
export async function adminLogin(password: string) {
  const { status, data } = await jpost('/api/gallery/admin', { action: 'login', password });
  if (data?.ok && data?.token) setAdminToken(data.token);
  return { status, data };
}
export async function adminStats() {
  return jpost('/api/gallery/admin', { action: 'stats' }, getAdminToken());
}
export async function adminList(status: 'pending' | 'approved' | 'rejected', limit = 40, offset = 0) {
  return jpost('/api/gallery/admin', { action: 'list', status, limit, offset }, getAdminToken());
}
export async function adminApprove(id: string) {
  return jpost('/api/gallery/admin', { action: 'approve', id }, getAdminToken());
}
export async function adminReject(id: string) {
  return jpost('/api/gallery/admin', { action: 'reject', id }, getAdminToken());
}
export async function adminRemove(id: string) {
  return jpost('/api/gallery/admin', { action: 'remove', id }, getAdminToken());
}
export async function adminReports(filter = 'open') {
  return jpost('/api/gallery/admin', { action: 'reports', filter }, getAdminToken());
}
export async function adminResolveReport(id: string, decision: 'resolved' | 'dismissed') {
  return jpost('/api/gallery/admin', { action: 'resolveReport', id, decision }, getAdminToken());
}
export async function adminUnpublish(id: string, reason: string) {
  return jpost('/api/gallery/admin', { action: 'unpublish', id, reason }, getAdminToken());
}
export async function adminBulk(op: 'approve' | 'reject' | 'unpublish', ids: string[], reason = '') {
  return jpost('/api/gallery/admin', { action: 'bulk', op, ids: ids.slice(0, 100), reason }, getAdminToken());
}
export async function adminUndo(ids: string[]) {
  return jpost('/api/gallery/admin', { action: 'undo', ids: ids.slice(0, 100) }, getAdminToken());
}
export async function adminUpdateItem(id: string, name: string, caption: string) {
  return jpost('/api/gallery/admin', { action: 'updateItem', id, name, caption }, getAdminToken());
}
export async function adminSetNote(id: string, note: string) {
  return jpost('/api/gallery/admin', { action: 'setNote', id, note }, getAdminToken());
}
export async function adminBeginReview(id: string) {
  return jpost('/api/gallery/admin', { action: 'beginReview', id, reviewer: reviewerId() }, getAdminToken());
}
export async function adminEndReview(id: string) {
  return jpost('/api/gallery/admin', { action: 'endReview', id, reviewer: reviewerId() }, getAdminToken());
}
export async function adminClearReports(itemId: string) {
  return jpost('/api/gallery/admin', { action: 'clearReports', itemId }, getAdminToken());
}
export async function adminAudit(query = '', limit = 200) {
  return jpost('/api/gallery/admin', { action: 'audit', query, limit }, getAdminToken());
}
