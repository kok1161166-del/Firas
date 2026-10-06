// أدوات كشف الغش + ثوابت لوحة الإدارة (مشتركة للواجهة)

// أسباب الرفض الستة + حر
export const REJECT_REASONS = [
  { v: 'inappropriate', ar: 'محتوى غير لائق', en: 'Inappropriate' },
  { v: 'offensive', ar: 'مسيء', en: 'Offensive' },
  { v: 'spam', ar: 'سبام أو مكرر', en: 'Spam or Duplicate' },
  { v: 'low_quality', ar: 'جودة منخفضة', en: 'Low Quality' },
  { v: 'unrelated', ar: 'غير مرتبط', en: 'Unrelated to Milestone' },
  { v: 'copyright', ar: 'حقوق نشر', en: 'Copyright Concern' },
  { v: 'other', ar: 'أخرى', en: 'Other' },
] as const;

export const REPORT_REASONS = [
  { v: 'inappropriate', ar: 'محتوى غير لائق', en: 'Inappropriate' },
  { v: 'spam', ar: 'سبام', en: 'Spam' },
  { v: 'offensive', ar: 'مسيء', en: 'Offensive' },
  { v: 'copyright', ar: 'حقوق نشر', en: 'Copyright Concern' },
  { v: 'other', ar: 'أخرى', en: 'Other' },
] as const;

export const REVIEW_LOCK_MS = 120_000;
export const UNDO_WINDOW_MS = 60_000;
export const FREQ_SUBMITTER_MIN = 3;

export interface AdminItem {
  id: string;
  name: string;
  caption: string;
  kind: 'upload' | 'link';
  mediaType: 'image' | 'video';
  status: 'pending' | 'approved' | 'rejected';
  mediaUrl: string | null;
  posterUrl: string | null;
  url: string | null;
  width: number | null;
  height: number | null;
  likes: number;
  shares: number;
  reportsCount: number;
  rejectReason: string;
  internalNote: string;
  reviewingBy: string | null;
  reviewingAt: string | null;
  reviewedAt: string | null;
  reviewer: string;
  createdAt: string;
}

export interface FlagGroup {
  itemId: string;
  flagCount: number;
  flagReasons: string[];
  reports: any[];
  createdAt: string;
}

export interface Deco {
  isDup: boolean;
  dupOfName: string | null;
  freqCount: number;
  isFrequent: boolean;
  flags: FlagGroup | null;
}

/** قفل مراجع آخر؟ */
export function isReviewLocked(reviewingBy: string | null, reviewingAt: string | null, me: string): boolean {
  if (!reviewingBy || reviewingBy === me) return false;
  if (!reviewingAt) return true;
  return Date.now() - new Date(reviewingAt).getTime() < REVIEW_LOCK_MS;
}

/** مدة بشرية: s / m s / h m */
export function fmtDuration(ms: number | null): string {
  if (ms === null || ms === undefined || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function timeAgo(iso: string | null, ar: boolean): string {
  if (!iso) return '';
  try {
    const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return ar ? `منذ ${s} ث` : `${s}s ago`;
    if (s < 3600) return ar ? `منذ ${Math.floor(s / 60)} د` : `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return ar ? `منذ ${Math.floor(s / 3600)} س` : `${Math.floor(s / 3600)}h ago`;
    return ar ? `منذ ${Math.floor(s / 86400)} يوم` : `${Math.floor(s / 86400)}d ago`;
  } catch {
    return '';
  }
}

export function hostOf(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '').slice(0, 28);
  } catch {
    return url.slice(0, 28);
  }
}

/** تزيين العناصر: مكرر محتمل + ناشر متكرر + بلاغات */
export function decorateItems(items: AdminItem[], flagGroups: Map<string, FlagGroup>): Map<string, Deco> {
  const out = new Map<string, Deco>();
  // exact dup: نفس file/media — الأقدم هو الأصل
  const byFile = new Map<string, AdminItem[]>();
  for (const it of items) {
    const key = (it as any).fileId || it.mediaUrl || it.id;
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key)!.push(it);
  }
  const dupOf = new Map<string, string>();
  for (const group of byFile.values()) {
    if (group.length > 1) {
      const sorted = [...group].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
      for (let i = 1; i < sorted.length; i++) dupOf.set(sorted[i].id, sorted[0].name);
    }
  }
  // frequent submitter: نفس الاسم >= 3
  const byName = new Map<string, number>();
  for (const it of items) {
    const k = it.name.trim().toLowerCase();
    byName.set(k, (byName.get(k) || 0) + 1);
  }
  for (const it of items) {
    const freq = byName.get(it.name.trim().toLowerCase()) || 0;
    const d = dupOf.get(it.id);
    out.set(it.id, {
      isDup: !!d,
      dupOfName: d || null,
      freqCount: freq,
      isFrequent: freq >= FREQ_SUBMITTER_MIN,
      flags: flagGroups.get(it.id) || null,
    });
  }
  return out;
}

/** تجميع البلاغات المفتوحة حسب العنصر */
export function groupFlags(reports: any[]): Map<string, FlagGroup> {
  const m = new Map<string, { count: number; reasons: Set<string>; list: any[]; first: string }>();
  for (const r of reports || []) {
    if (!r?.item_id) continue;
    if (!m.has(r.item_id)) m.set(r.item_id, { count: 0, reasons: new Set(), list: [], first: r.created_at });
    const g = m.get(r.item_id)!;
    g.count += 1;
    if (r.reason) g.reasons.add(String(r.reason));
    g.list.push(r);
    if (r.created_at < g.first) g.first = r.created_at;
  }
  const out = new Map<string, FlagGroup>();
  for (const [itemId, g] of m) {
    out.set(itemId, { itemId, flagCount: g.count, flagReasons: [...g.reasons], reports: g.list, createdAt: g.first });
  }
  return out;
}
