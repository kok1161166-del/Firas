import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Language } from '../types';
import {
  adminLogin, adminStats, adminList, adminApprove, adminReject, adminUnpublish,
  adminBulk, adminUndo, adminUpdateItem, adminSetNote, adminBeginReview, adminEndReview,
  adminClearReports, adminAudit, adminRemove,
  getAdminToken, setAdminToken, clearAdminToken, reviewerId,
} from '../services/galleryApi';
import {
  REJECT_REASONS,
  isReviewLocked, fmtDuration, timeAgo, hostOf, groupFlags, decorateItems,
  type AdminItem, type FlagGroup,
} from '../services/moderation';

// ============================================================
//  Moderation Console — تصميم فاخر + كل المزايا + بانرات حالة
//  LoginView + Header + Stats + 6 Tabs + Toolbar + Bulk + List +
//  ReviewModal + ConfirmDialog + UndoToast + Dashboard + AuditLog
// ============================================================

type Tab = 'queue' | 'approved' | 'flagged' | 'rejected' | 'audit' | 'dash';
type SortMode = 'newest' | 'oldest' | 'top';
type TypeFilter = 'all' | 'image' | 'video' | 'link';
type DateFilter = 'any' | '1h' | '24h' | '7d';

const ME = (() => {
  try {
    return reviewerId();
  } catch {
    return 'admin';
  }
})();

const ADMIN_CSS = `
@keyframes admIn { 0% { opacity: 0; transform: translateY(16px) scale(0.99); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
.adm-in { opacity: 0; animation: admIn 0.6s cubic-bezier(0.22,1,0.36,1) forwards; }
@keyframes adminShake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-9px); } 40% { transform: translateX(8px); } 60% { transform: translateX(-6px); } 80% { transform: translateX(5px); } }
.admin-shake { animation: adminShake 0.45s cubic-bezier(0.36,0.07,0.19,0.97); }
@keyframes haloSpin { to { transform: rotate(360deg); } }
.admin-halo { animation: haloSpin 16s linear infinite; }
@keyframes lockPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(201,162,75,0.35); } 50% { box-shadow: 0 0 0 12px rgba(201,162,75,0); } }
.lock-pulse { animation: lockPulse 2.6s ease-in-out infinite; }
@keyframes dotPulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.55; transform: scale(0.8); } }
.dot-pulse { animation: dotPulse 1.8s ease-in-out infinite; }
@keyframes sheenMove { 0% { transform: translateX(-130%) skewX(-18deg); } 100% { transform: translateX(230%) skewX(-18deg); } }
.btn-sheen { position: relative; overflow: hidden; }
.btn-sheen::after { content: ""; position: absolute; top: 0; bottom: 0; width: 45%; background: linear-gradient(100deg, transparent, rgba(255,255,255,0.35), transparent); transform: translateX(-130%) skewX(-18deg); animation: sheenMove 3.2s ease-in-out infinite; pointer-events: none; }
.adm-card { transition: transform 0.35s cubic-bezier(0.22,1,0.36,1), border-color 0.35s, box-shadow 0.35s; }
.adm-card:hover { transform: translateY(-3px); }
.adm-tab { transition: all 0.3s cubic-bezier(0.22,1,0.36,1); }
.adm-tab:active { transform: scale(0.96); }
.adm-select { appearance: none; -webkit-appearance: none; }
`;

function authedFetchFail(data: any): boolean {
  if (data?.error === 'unauthorized') {
    clearAdminToken();
    window.location.reload();
    return true;
  }
  return false;
}

// عدّاد تصاعدي للأرقام
function CountUp({ value }: { value: number | string }) {
  const [n, setN] = useState(0);
  const target = typeof value === 'number' ? value : 0;
  useEffect(() => {
    if (typeof value !== 'number') return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 800);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, value]);
  return <span dir="ltr">{typeof value === 'number' ? n.toLocaleString('en-US') : value}</span>;
}

// ---------------- LoginView ----------------
function LoginView({ ar, onDone }: { ar: boolean; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [fails, setFails] = useState(0);
  const [caps, setCaps] = useState(false);
  const [shake, setShake] = useState(0);

  const go = async () => {
    if (busy || !pw) return;
    setBusy(true);
    setErr('');
    try {
      const { status, data } = await adminLogin(pw);
      if (data?.ok) {
        setFails(0);
        onDone();
      } else if (status === 429 || data?.error === 'rate_limited') {
        setFails(5);
        setErr(ar ? 'محاولات كثيرة — تم التجميد مؤقتاً (rate limited)' : 'Too many failed attempts — rate limited');
        setShake((k) => k + 1);
      } else if (data?.error === 'admin_not_configured') {
        setErr(ar ? 'خادم الإدارة غير مُعد (Could not reach the admin server)' : 'Could not reach the admin server');
        setShake((k) => k + 1);
      } else {
        setFails((f) => Math.min(5, f + 1));
        setErr(ar ? 'كلمة السر غير صحيحة (Incorrect password)' : 'Incorrect password');
        setShake((k) => k + 1);
      }
    } catch {
      setErr(ar ? 'تعذّر الوصول لخادم الإدارة' : 'Could not reach the admin server');
      setShake((k) => k + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
      <div className="w-full max-w-sm adm-in">
        <div className="relative w-24 h-24 mx-auto">
          <span className="admin-halo absolute inset-0 rounded-full pointer-events-none" aria-hidden="true"
            style={{
              background: 'conic-gradient(from 0deg, transparent 0 62%, rgba(217,192,138,0.9) 78%, rgba(201,162,75,0.15) 88%, transparent 100%)',
              WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 2px))',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 2px))',
            }} />
          <img src="/firas-mark.webp" alt="" className="absolute inset-0 m-auto w-16 h-16 object-contain"
            style={{ filter: 'drop-shadow(0 6px 24px rgba(201,162,75,0.55))' }} />
        </div>
        <p className="mt-4 text-center text-[10px] font-black tracking-[0.4em] text-[#D9C08A]/70" dir="ltr">RESTRICTED AREA</p>
        <h3 className="mt-1 text-center font-black text-white text-2xl">{ar ? 'منطقة مقفلة' : 'Restricted area'}</h3>
        <p className="text-center text-[12px] text-white/45 mt-1" dir="ltr">Authorized personnel only</p>

        <div key={shake} className={shake > 0 ? 'admin-shake mt-5' : 'mt-5'}>
          <div className="rounded-[22px] p-[1.5px]"
            style={{ background: err ? 'linear-gradient(120deg, rgba(255,92,61,0.7), rgba(255,92,61,0.15))' : 'linear-gradient(120deg, #F0DDAE 0%, #C9A24B 30%, rgba(201,162,75,0.15) 55%, #C9A24B 75%, #8A6A3A 100%)' }}>
            <div className="rounded-[20.5px] bg-[#0b0b0b] p-5">
              <label className="block text-[11px] font-black tracking-[0.2em] text-white/40 mb-2" dir="ltr">ADMIN PASSWORD</label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={pw}
                  autoComplete="current-password"
                  onChange={(e) => setPw(e.target.value.slice(0, 128))}
                  onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
                  onKeyUp={(e) => { try { setCaps(!!(e as any).getModifierState?.('CapsLock')); } catch { /* ignore */ } }}
                  placeholder="••••••••"
                  dir="ltr"
                  autoFocus
                  className="lock-pulse w-full h-[52px] px-4 rounded-xl bg-black/60 border border-white/10 text-white text-center tracking-[0.3em] outline-none focus:border-[#D9A441]/70 transition-colors"
                />
                <button type="button" onClick={() => setShow((v) => !v)}
                  className="absolute end-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-white/40 hover:text-white/70 px-2">
                  {show ? 'HIDE' : 'SHOW'}
                </button>
              </div>
              {caps && <p className="mt-2 text-center text-[11px] font-bold text-amber-300">{ar ? 'تنبيه: Caps Lock يعمل' : 'Caps Lock is on'}</p>}
              {err && <p className="mt-3 text-center text-[13px] font-bold text-red-300">{err}</p>}
              <button type="button" onClick={go} disabled={busy || !pw}
                className="btn-sheen mt-4 w-full min-h-[52px] rounded-xl font-black text-black disabled:opacity-40 flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
                style={{ background: 'linear-gradient(180deg, #FFF3D6 0%, #E8D5A8 30%, #C9A24B 70%, #8A6A3A 100%)' }}>
                {busy && <span className="w-4 h-4 rounded-full border-2 border-black/25 border-t-black animate-spin" />}
                {busy ? (ar ? 'جاري التحقق…' : 'Verifying…') : (ar ? 'فتح اللوحة' : 'Unlock')}
              </button>
              <p className="mt-3 text-center text-[11px] text-white/30">
                <span dir="ltr">{Math.max(0, 5 - fails)}</span> {ar ? 'محاولات متبقية' : 'tries left'}
              </p>
            </div>
          </div>
        </div>
        <p className="mt-6 text-center text-[10px] font-black tracking-[0.3em] text-white/25" dir="ltr">TMNAA — ADMIN CONSOLE</p>
      </div>
    </div>
  );
}

// ---------------- bits ----------------
function Chip({ c, t }: { c: any; t: string }) {
  return (
    <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[10px] font-black tracking-wide border" style={c}>
      {t}
    </span>
  );
}
const STATUS_CHIP: Record<string, { c: any; ar: string; en: string }> = {
  pending: { c: { color: '#F5D489', borderColor: 'rgba(217,164,65,0.5)', background: 'rgba(217,164,65,0.12)' }, ar: 'بانتظار', en: 'Pending' },
  approved: { c: { color: '#6EE7B7', borderColor: 'rgba(16,185,129,0.5)', background: 'rgba(16,185,129,0.12)' }, ar: 'مقبول', en: 'Approved' },
  rejected: { c: { color: '#FF8A7A', borderColor: 'rgba(255,92,61,0.5)', background: 'rgba(255,92,61,0.12)' }, ar: 'مرفوض', en: 'Rejected' },
};

function MediaThumb({ it }: { it: AdminItem }) {
  if (it.kind === 'link' || !it.posterUrl) {
    return (
      <div className="w-[68px] h-[68px] rounded-2xl bg-gradient-to-br from-[#1c1409] to-black border border-[#C9A24B]/25 flex flex-col items-center justify-center gap-1 shrink-0">
        <svg className="w-5 h-5 text-[#D9C08A]/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-8a2 2 0 00-2-2zm7-4h-4m4 0v4m0-4L11 13" />
        </svg>
        <span className="text-[8px] font-bold text-white/30 px-1 truncate max-w-full" dir="ltr">{hostOf(it.url || it.mediaUrl)}</span>
      </div>
    );
  }
  return (
    <div className="relative w-[68px] h-[68px] rounded-2xl overflow-hidden bg-black shrink-0 border border-white/15 ring-1 ring-black/60">
      <img src={it.posterUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
      {it.mediaType === 'video' && (
        <span className="absolute inset-0 m-auto w-7 h-7 rounded-full bg-black/60 backdrop-blur border border-white/40 flex items-center justify-center">
          <svg className="w-3 h-3 text-white fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        </span>
      )}
    </div>
  );
}

function SelectWrap({ value, onChange, options }: { value: string; onChange: (v: any) => void; options: { v: string; t: string }[] }) {
  return (
    <span className="relative inline-flex">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="adm-select h-10 ps-4 pe-9 rounded-full bg-black/60 border border-white/12 text-white/75 text-[12px] font-bold outline-none cursor-pointer focus:border-[#D9A441]/60 hover:border-white/25 transition-colors">
        {options.map((o) => <option key={o.v} value={o.v} className="bg-[#14100a]">{o.t}</option>)}
      </select>
      <svg className="w-3.5 h-3.5 text-white/40 absolute end-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </span>
  );
}

// ---------------- main ----------------
export const GalleryAdmin: React.FC<{ lang: Language; onClose: () => void }> = ({ lang, onClose }) => {
  const ar = lang === 'ar';
  const [authed, setAuthed] = useState(!!getAdminToken());
  const [loading, setLoading] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [compat, setCompat] = useState(false);
  const [tab, setTab] = useState<Tab>('queue');
  const [stats, setStats] = useState<any>(null);
  const [rows, setRows] = useState<Record<string, AdminItem[]>>({ pending: [], approved: [], rejected: [] });
  const [reports, setReports] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [typeF, setTypeF] = useState<TypeFilter>('all');
  const [dateF, setDateF] = useState<DateFilter>('any');
  const [sort, setSort] = useState<SortMode>('newest');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | {
    title: string; desc: string; requireReason: boolean; confirmLabel: string; danger?: boolean;
    onConfirm: (reason: string) => void;
  }>(null);
  const [toast, setToast] = useState<null | { ids: string[]; label: string }>(null);
  const [auditQuery, setAuditQuery] = useState('');
  const toastTimer = useRef<any>(null);

  const needLogin = useCallback(() => {
    clearAdminToken();
    setAuthed(false);
  }, []);

  const loadAll = useCallback(async () => {
    if (!getAdminToken()) return;
    setLoading(true);
    setFatal(null);
    try {
      const [st, p, a, r, rep, au] = await Promise.all([
        adminStats(),
        adminList('pending', 200),
        adminList('approved', 200),
        adminList('rejected', 200),
        (await import('../services/galleryApi')).adminReports('open'),
        adminAudit('', 200),
      ]);
      if (authedFetchFail(st.data) || authedFetchFail(p.data)) return;
      if (!st.data?.ok) {
        setFatal(String(st.data?.error || 'db_read_failed'));
        return;
      }
      for (const res of [p, a, r, rep, au]) {
        if (res.data && res.data.ok === false && res.data.error && res.data.error !== 'db_read_failed') {
          if (authedFetchFail(res.data)) return;
        }
      }
      if (!p.data?.ok || !a.data?.ok || !r.data?.ok) {
        setFatal(String((!p.data?.ok && p.data?.error) || (!a.data?.ok && a.data?.error) || (!r.data?.ok && r.data?.error) || 'db_read_failed'));
        return;
      }
      setStats(st.data.stats);
      setRows({ pending: p.data.items || [], approved: a.data.items || [], rejected: r.data.items || [] });
      if (rep.data?.ok) setReports(rep.data.reports || []);
      if (au.data?.ok) setActions(au.data.actions || []);
      if (st.data.stats?.compat || p.data.compat || a.data.compat || r.data.compat) setCompat(true);
    } catch {
      setFatal('network_failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) loadAll();
  }, [authed, loadAll]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape' && !reviewId && !confirm && !toast) onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose, reviewId, confirm, toast]);

  const showToast = (ids: string[], label: string) => {
    setToast({ ids, label });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 10000);
  };

  const reload = useCallback(async () => {
    await loadAll();
  }, [loadAll]);

  // ---- derived ----
  const flagGroups = useMemo(() => groupFlags(reports.filter((x) => x.status === 'open')), [reports]);
  const allItems = useMemo(() => [...rows.pending, ...rows.approved, ...rows.rejected], [rows]);
  const itemMap = useMemo(() => new Map(allItems.map((x) => [x.id, x])), [allItems]);
  const deco = useMemo(() => decorateItems(allItems, flagGroups), [allItems, flagGroups]);
  const flaggedEntries = useMemo(() => {
    const out: { item: AdminItem; group: FlagGroup }[] = [];
    for (const [id, g] of flagGroups) {
      const it = itemMap.get(id);
      if (it) out.push({ item: it, group: g });
    }
    return out.sort((a, b) => +new Date(b.group.createdAt) - +new Date(a.group.createdAt));
  }, [flagGroups, itemMap]);

  const matchFilters = useCallback((it: AdminItem) => {
    if (query) {
      const q = query.toLowerCase();
      if (!`${it.name} ${it.caption}`.toLowerCase().includes(q)) return false;
    }
    if (typeF === 'image' && it.mediaType !== 'image') return false;
    if (typeF === 'video' && it.mediaType !== 'video') return false;
    if (typeF === 'link' && it.kind !== 'link') return false;
    if (dateF !== 'any') {
      const age = Date.now() - new Date(it.createdAt).getTime();
      const lim = dateF === '1h' ? 3600e3 : dateF === '24h' ? 86400e3 : 7 * 86400e3;
      if (age > lim) return false;
    }
    return true;
  }, [query, typeF, dateF]);

  const sortItems = useCallback((arr: AdminItem[], mode: SortMode) => {
    const a = [...arr];
    if (mode === 'oldest') a.sort((x, y) => +new Date(x.createdAt) - +new Date(y.createdAt));
    else if (mode === 'top') a.sort((x, y) => y.likes - x.likes);
    else a.sort((x, y) => +new Date(y.createdAt) - +new Date(x.createdAt));
    return a;
  }, []);

  const visible: AdminItem[] = useMemo(() => {
    if (tab === 'queue') return sortItems(rows.pending.filter(matchFilters), sort);
    if (tab === 'approved') return sortItems(rows.approved.filter(matchFilters), sort);
    if (tab === 'rejected') return sortItems(rows.rejected.filter(matchFilters), sort);
    if (tab === 'flagged') return sortItems(flaggedEntries.map((e) => e.item).filter(matchFilters), sort);
    return [];
  }, [tab, rows, flaggedEntries, matchFilters, sort, sortItems]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setSelected(new Set());
  };

  const toggleSel = (id: string) => {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  // ---- mutations ----
  const doSingle = async (kind: 'approve' | 'reject' | 'unpublish', id: string, reason = '') => {
    const res = kind === 'approve' ? await adminApprove(id) : kind === 'reject' ? await adminReject(id, reason) : await adminUnpublish(id, reason);
    if (authedFetchFail(res.data)) return;
    if (!res.data?.ok) return;
    setSelected((p) => {
      const n = new Set(p);
      n.delete(id);
      return n;
    });
    await reload();
    showToast([id], kind === 'approve' ? (ar ? 'تم القبول' : 'Approved') : kind === 'reject' ? (ar ? 'تم الرفض' : 'Rejected') : (ar ? 'تم السحب' : 'Unpublished'));
  };

  const doBulk = async (op: 'approve' | 'reject' | 'unpublish', reason = '') => {
    const ids = [...selected];
    if (!ids.length) return;
    const res = await adminBulk(op, ids, reason);
    if (authedFetchFail(res.data)) return;
    const data = res.data;
    if (!data?.ok && data?.error === 'reason_required') return;
    setSelected(new Set());
    await reload();
    if (data && data.done > 0) {
      showToast(ids, op === 'approve'
        ? (ar ? `تم قبول ${data.done} عناصر` : `Approved ${data.done} edits`)
        : op === 'reject' ? (ar ? `تم رفض ${data.done}` : `Rejected ${data.done}`) : (ar ? `تم سحب ${data.done}` : `Unpublished ${data.done}`));
    } else if (data && data.skipped > 0 && !data.done && !data.failed) {
      showToast([], ar ? 'لا تغيير (Nothing changed)' : 'Nothing changed');
    } else if (data && (data.failed > 0 || data.skipped > 0)) {
      showToast([], ar ? `فشل ${data.failed} / تُخطي ${data.skipped}` : `Failed ${data.failed} / skipped ${data.skipped}`);
    } else {
      showToast([], ar ? 'لا تغيير (Nothing changed)' : 'Nothing changed');
    }
  };

  const doUndo = async (ids: string[]) => {
    if (!ids.length) {
      setToast(null);
      return;
    }
    const res = await adminUndo(ids);
    if (authedFetchFail(res.data)) return;
    setToast(null);
    await reload();
    if (res.data?.error === 'undo_window_expired') {
      showToast([], ar ? 'انتهت مهلة التراجع (Undo window closed)' : 'Undo window closed');
    }
  };

  const askConfirm = (c: NonNullable<typeof confirm>) => setConfirm(c);
  const reasonLabels = (v: string) => REJECT_REASONS.find((r) => r.v === v);

  // ---- dashboard data ----
  const dash = useMemo(() => {
    const total = rows.pending.length + rows.approved.length + rows.rejected.length;
    const decided = rows.approved.length + rows.rejected.length;
    const rate = decided ? Math.round((rows.approved.length / decided) * 100) : 0;
    const reviewed = [...rows.approved, ...rows.rejected].filter((x) => x.reviewedAt);
    const avg = reviewed.length
      ? reviewed.reduce((a, x) => a + (+new Date(x.reviewedAt!) - +new Date(x.createdAt)), 0) / reviewed.length
      : null;
    const days: { label: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      const count = allItems.filter((x) => new Date(x.createdAt).toDateString() === key).length;
      days.push({ label: d.toLocaleDateString(ar ? 'ar' : 'en', { weekday: 'short', day: 'numeric' }), count });
    }
    const byName = new Map<string, number>();
    for (const x of rows.approved) byName.set(x.name, (byName.get(x.name) || 0) + 1);
    const top = [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const liked = [...rows.approved].sort((a, b) => b.likes - a.likes).slice(0, 5);
    return { total, rate, avg, days, top, liked };
  }, [rows, allItems, ar]);

  const tabs: { v: Tab; ar: string; en: string; n: number }[] = [
    { v: 'queue', ar: 'الانتظار', en: 'Queue', n: rows.pending.length },
    { v: 'approved', ar: 'المقبول', en: 'Approved', n: rows.approved.length },
    { v: 'flagged', ar: 'المُبلغ', en: 'Flagged', n: flaggedEntries.length },
    { v: 'rejected', ar: 'المرفوض', en: 'Rejected', n: rows.rejected.length },
    { v: 'audit', ar: 'السجل', en: 'Audit Log', n: actions.length },
    { v: 'dash', ar: 'الداشبورد', en: 'Dashboard', n: 0 },
  ];

  const reviewIndex = reviewId ? visible.findIndex((x) => x.id === reviewId) : -1;
  const reviewItem = reviewIndex >= 0 ? visible[reviewIndex] : reviewId ? itemMap.get(reviewId) || null : null;

  const fatalText = (code: string) => {
    const map: Record<string, string> = {
      supabase_not_configured: ar ? 'قاعدة البيانات غير مربوطة على هذه الاستضافة — أضف SUPABASE_URL ومفتاح service_role في متغيرات البيئة ثم أعد النشر' : 'Database not configured on this host — add SUPABASE_URL + service role key, then redeploy',
      db_read_failed: ar ? 'تعذّر قراءة قاعدة البيانات — تحقق من الاتصال ومتغيرات البيئة' : 'Cannot read database — check connection and env vars',
      admin_not_configured: ar ? 'كلمة سر الإدارة غير مضبوطة على السيرفر' : 'Admin password not configured on server',
      network_failed: ar ? 'تعذّر الوصول للسيرفر — تحقق من الاتصال' : 'Cannot reach server — check connection',
    };
    return map[code] || (ar ? `خطأ (${code})` : `Error (${code})`);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" role="dialog" aria-modal="true" aria-label="Moderation console">
      <style>{ADMIN_CSS}</style>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(900px 400px at 50% -5%, rgba(201,162,75,0.10), transparent 65%), rgba(4,3,2,0.96)' }} onClick={onClose} />
      <div className="relative flex-1 min-h-0 flex flex-col w-full max-w-6xl mx-auto my-2 sm:my-5 rounded-[26px] border border-[#C9A24B]/30 overflow-hidden shadow-[0_40px_120px_rgba(0,0,0,0.7)]"
        style={{ background: 'linear-gradient(180deg, #171208 0%, #0B0805 40%, #080604 100%)' }}>
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-[#C9A24B]/80 to-transparent" aria-hidden="true" />

        {!authed ? (
          <LoginView ar={ar} onDone={() => setAuthed(true)} />
        ) : (
          <>
            {/* ===== Header ===== */}
            <div className="flex items-center gap-3 px-4 sm:px-6 py-3.5 border-b border-white/[0.08] bg-black/30 backdrop-blur">
              <span className="relative w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden"
                style={{ background: 'linear-gradient(160deg, rgba(201,162,75,0.25), rgba(201,162,75,0.05))', border: '1px solid rgba(217,192,138,0.45)', boxShadow: '0 0 24px rgba(201,162,75,0.25), inset 0 1px 0 rgba(255,255,255,0.15)' }}>
                <svg className="w-5 h-5 text-[#F0DDAE]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-black text-white leading-tight text-[16px]" dir="ltr">Moderation Console</h2>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 dot-pulse shrink-0" title="live" />
                </div>
                <p className="text-[11px] text-white/40 truncate">
                  {ar ? 'كل مشاركة تُراجع يدوياً' : 'Every submission is reviewed by hand'}
                  <span className="text-white/15"> • </span>
                  <span dir="ltr" className="text-[#D9C08A]/70 font-bold">Signed in as admin</span>
                </p>
              </div>
              <button type="button" onClick={reload} title={ar ? 'تحديث' : 'Refresh'}
                className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/12 text-white/70 hover:text-white hover:border-[#C9A24B]/50 hover:rotate-12 flex items-center justify-center transition-all active:scale-90">
                <svg className={`w-[18px] h-[18px] ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </button>
              <button type="button" onClick={() => { clearAdminToken(); window.location.reload(); }} title={ar ? 'قفل وخروج' : 'Lock / Log out'}
                className="h-10 px-4 rounded-full bg-red-500/[0.07] border border-red-400/30 text-red-300 text-[12px] font-bold flex items-center gap-1.5 hover:bg-red-500/[0.14] transition-all active:scale-95">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                {ar ? 'قفل' : 'Lock'}
              </button>
              <button type="button" onClick={onClose}
                className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/12 text-white/60 hover:text-white flex items-center justify-center transition-all active:scale-90">✕</button>
            </div>

            {/* ===== fatal / compat banners ===== */}
            {fatal && (
              <div className="mx-3 sm:mx-5 mt-3 rounded-2xl border border-red-400/40 bg-red-500/[0.08] px-4 py-3.5 flex items-start gap-3 adm-in">
                <span className="w-8 h-8 rounded-xl bg-red-500/15 border border-red-400/40 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-black text-red-200">{ar ? 'تعذّر عرض بيانات Supabase' : 'Cannot show Supabase data'}</p>
                  <p className="text-[12px] text-red-200/70 mt-0.5">{fatalText(fatal)}</p>
                </div>
                <button type="button" onClick={reload} className="ms-auto shrink-0 h-9 px-4 rounded-full text-[12px] font-black border border-red-400/40 text-red-200">
                  {ar ? 'إعادة المحاولة' : 'Retry'}
                </button>
              </div>
            )}
            {!fatal && compat && (
              <div className="mx-3 sm:mx-5 mt-3 rounded-2xl border border-[#C9A24B]/40 bg-[#C9A24B]/[0.07] px-4 py-3 flex items-start gap-3 adm-in">
                <span className="text-[#D9C08A] text-lg leading-none">◈</span>
                <p className="text-[12px] text-[#F0DDAE]/90">
                  {ar
                    ? 'وضع التوافق: البيانات ظاهرة، ولتفعيل الملاحظات والأقفال والسجل نفّذ ملف supabase-gallery-v2.sql في Supabase'
                    : 'Compat mode: data is visible — run supabase-gallery-v2.sql in Supabase to enable notes, locks & audit log'}
                </p>
              </div>
            )}

            {/* ===== 4 stat cards ===== */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 px-3 sm:px-5 pt-3">
              {[
                { l: ar ? 'انتظار' : 'Pending', v: rows.pending.length, c: '#F5D489', glow: 'rgba(217,164,65,0.35)', bg: 'linear-gradient(160deg, rgba(217,164,65,0.14), rgba(0,0,0,0.3))', icon: '◷' },
                { l: ar ? 'مقبول' : 'Approved', v: rows.approved.length, c: '#6EE7B7', glow: 'rgba(16,185,129,0.35)', bg: 'linear-gradient(160deg, rgba(16,185,129,0.14), rgba(0,0,0,0.3))', icon: '✓' },
                { l: ar ? 'مرفوض' : 'Rejected', v: rows.rejected.length, c: '#FF8A7A', glow: 'rgba(255,92,61,0.35)', bg: 'linear-gradient(160deg, rgba(255,92,61,0.13), rgba(0,0,0,0.3))', icon: '✕' },
                { l: ar ? 'مُبلغ عنه' : 'Flagged', v: flaggedEntries.length, c: '#FB923C', glow: 'rgba(251,146,60,0.35)', bg: 'linear-gradient(160deg, rgba(251,146,60,0.14), rgba(0,0,0,0.3))', icon: '⚑' },
              ].map((s, i) => (
                <button key={s.l} type="button" onClick={() => switchTab(i === 0 ? 'queue' : i === 1 ? 'approved' : i === 2 ? 'rejected' : 'flagged')}
                  className="adm-card adm-in relative rounded-2xl border border-white/10 px-4 py-4 text-center overflow-hidden hover:border-white/25"
                  style={{ background: s.bg, animationDelay: `${i * 70}ms` }}>
                  <span className="absolute top-0 inset-x-8 h-[2px] rounded-full" style={{ background: s.c, boxShadow: `0 0 12px ${s.glow}` }} aria-hidden="true" />
                  <span className="mx-auto w-9 h-9 rounded-xl flex items-center justify-center text-base font-black mb-1.5"
                    style={{ color: s.c, background: 'rgba(0,0,0,0.4)', border: `1px solid ${s.c}44`, boxShadow: `0 0 18px ${s.glow}` }}>{s.icon}</span>
                  <p className="text-[26px] leading-none font-black text-white"><CountUp value={s.v} /></p>
                  <p className="text-[10px] font-bold text-white/45 mt-1.5 tracking-wide">{s.l}</p>
                </button>
              ))}
            </div>

            {/* ===== 6 Tabs (segmented) ===== */}
            <div className="px-3 sm:px-5 pt-3">
              <div className="flex gap-1 p-1.5 rounded-2xl bg-black/50 border border-white/[0.08] overflow-x-auto scrollbar-hide">
                {tabs.map((t) => {
                  const active = tab === t.v;
                  return (
                    <button key={t.v} type="button" onClick={() => switchTab(t.v)}
                      className={`adm-tab flex-1 min-w-[92px] h-10 px-3 rounded-xl text-[12px] font-black whitespace-nowrap flex items-center justify-center gap-1.5 ${active ? 'text-black shadow-[0_6px_20px_rgba(201,162,75,0.35)]' : 'text-white/55 hover:text-white hover:bg-white/[0.05]'}`}
                      style={active ? { background: 'linear-gradient(180deg, #FFF3D6, #C9A24B)' } : undefined}>
                      {ar ? t.ar : t.en}
                      <span className={`inline-flex min-w-[20px] h-5 px-1 items-center justify-center rounded-full text-[10px] font-black ${active ? 'bg-black/80 text-[#F0DDAE]' : 'bg-white/10 text-white/50'}`} dir="ltr">{t.n}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ===== Toolbar ===== */}
            {(tab === 'queue' || tab === 'approved' || tab === 'rejected' || tab === 'flagged') && (
              <div className="px-3 sm:px-5 pt-2.5 flex gap-2 flex-wrap items-center">
                <span className="relative flex-1 min-w-[170px]">
                  <svg className="w-4 h-4 text-white/30 absolute start-4 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                  <input value={query} onChange={(e) => setQuery(e.target.value.slice(0, 80))}
                    placeholder={ar ? 'بحث بالاسم أو الوصف…' : 'Search name or caption…'}
                    className="h-10 w-full ps-10 pe-4 rounded-full bg-black/60 border border-white/10 text-white text-[13px] outline-none focus:border-[#D9A441]/60 placeholder:text-white/25 transition-colors" />
                </span>
                <SelectWrap value={typeF} onChange={setTypeF} options={[
                  { v: 'all', t: ar ? 'كل الأنواع' : 'All types' },
                  { v: 'image', t: ar ? 'صور' : 'Images' },
                  { v: 'video', t: ar ? 'فيديو' : 'Videos' },
                  { v: 'link', t: ar ? 'روابط' : 'Links' },
                ]} />
                <SelectWrap value={dateF} onChange={setDateF} options={[
                  { v: 'any', t: ar ? 'أي وقت' : 'Any time' },
                  { v: '1h', t: ar ? 'آخر ساعة' : 'Last hour' },
                  { v: '24h', t: ar ? 'آخر 24 ساعة' : 'Last 24h' },
                  { v: '7d', t: ar ? 'آخر 7 أيام' : 'Last 7 days' },
                ]} />
                <SelectWrap value={sort} onChange={setSort} options={[
                  { v: 'newest', t: ar ? 'الأحدث أولاً' : 'Newest first' },
                  { v: 'oldest', t: ar ? 'الأقدم أولاً' : 'Oldest first' },
                  ...(tab === 'approved' ? [{ v: 'top', t: ar ? 'الأكثر إعجاباً' : 'Most liked' }] : []),
                ]} />
              </div>
            )}

            {/* ===== Bulk Bar ===== */}
            {selected.size > 0 && (tab === 'queue' || tab === 'flagged' || tab === 'approved') && (
              <div className="mx-3 sm:mx-5 mt-2.5 rounded-2xl border border-[#C9A24B]/45 bg-gradient-to-l from-[#C9A24B]/[0.12] to-[#C9A24B]/[0.04] px-4 py-2.5 flex items-center gap-2 flex-wrap adm-in shadow-[0_10px_30px_rgba(0,0,0,0.4)]">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-black text-[#F0DDAE] bg-black/50 border border-[#C9A24B]/40 rounded-full h-8 px-3" dir="ltr">✓ {selected.size}</span>
                {(tab === 'queue' || tab === 'flagged') && (
                  <button type="button" onClick={() => askConfirm({
                    title: ar ? `قبول ${selected.size} عناصر؟` : `Approve ${selected.size} edits?`,
                    desc: ar ? 'ستظهر فوراً — قابلة للتراجع عبر Undo' : 'Go live immediately — reversible via Undo',
                    requireReason: false, confirmLabel: ar ? 'قبول' : 'Approve',
                    onConfirm: () => doBulk('approve'),
                  })}
                    className="btn-sheen h-9 px-4 rounded-full text-[12px] font-black text-black transition-transform active:scale-95" style={{ background: 'linear-gradient(180deg,#D6F5C8,#53FC18)' }}>
                    {ar ? 'قبول جماعي' : 'Approve'}
                  </button>
                )}
                {(tab === 'queue' || tab === 'flagged') && (
                  <button type="button" onClick={() => askConfirm({
                    title: ar ? `رفض ${selected.size} عناصر؟` : `Reject ${selected.size}?`,
                    desc: ar ? 'مخفي — قابل للتراجع 10 ثوانٍ عبر Undo' : 'Hidden — reversible for 10 seconds via Undo',
                    requireReason: true, confirmLabel: ar ? 'رفض' : 'Reject', danger: true,
                    onConfirm: (r) => doBulk('reject', r),
                  })}
                    className="h-9 px-4 rounded-full text-[12px] font-black border border-amber-400/45 text-amber-300 hover:bg-amber-400/10 transition-all active:scale-95">
                    {ar ? 'رفض' : 'Reject'}
                  </button>
                )}
                {tab === 'approved' && (
                  <button type="button" onClick={() => askConfirm({
                    title: ar ? `سحب ${selected.size} من الجدار؟` : `Take down ${selected.size}?`,
                    desc: ar ? 'يُخفى فوراً — قابل للتراجع 10 ثوانٍ عبر Undo' : 'Unpublished immediately — reversible for 10 seconds via Undo',
                    requireReason: true, confirmLabel: ar ? 'سحب' : 'Take Down', danger: true,
                    onConfirm: (r) => doBulk('unpublish', r),
                  })}
                    className="h-9 px-4 rounded-full text-[12px] font-black border border-red-400/45 text-red-300 hover:bg-red-500/10 transition-all active:scale-95">
                    {ar ? 'سحب / إلغاء نشر' : 'Take Down / Unpublish'}
                  </button>
                )}
                <button type="button" onClick={() => setSelected(new Set())}
                  className="h-9 px-4 rounded-full text-[12px] font-bold border border-white/15 text-white/60 hover:text-white transition-all">
                  {ar ? 'مسح التحديد' : 'Clear'}
                </button>
              </div>
            )}

            {/* ===== body ===== */}
            <div className="flex-1 min-h-0 overflow-auto p-3 sm:p-5 pt-3">
              {(tab === 'queue' || tab === 'approved' || tab === 'rejected' || tab === 'flagged') && (
                <div className="space-y-2.5">
                  {loading && visible.length === 0 && !fatal && (
                    <div className="space-y-2.5">{[0, 1, 2].map((i) => <div key={i} className="h-[104px] rounded-2xl bg-white/[0.03] border border-white/10 animate-pulse" />)}</div>
                  )}
                  {!loading && !fatal && visible.length === 0 && (
                    <div className="rounded-[22px] border border-dashed border-[#C9A24B]/30 bg-black/30 p-10 sm:p-14 text-center adm-in">
                      <img src="/firas-mark.webp" alt="" className="mx-auto w-14 h-14 object-contain opacity-50" loading="lazy" />
                      <svg className="mx-auto w-8 h-8 text-white/15 -mt-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                      <p className="mt-3 font-black text-white text-[15px]">
                        {tab === 'flagged' ? (ar ? 'لا بلاغات' : 'No flagged submissions') : tab === 'queue' ? (ar ? 'القائمة فارغة — بانتظار أول رفع' : 'The queue is clear') : (ar ? 'لا يوجد شيء بعد' : 'Nothing here yet')}
                      </p>
                      <p className="text-[12px] text-white/35 mt-1">{ar ? 'العناصر الجديدة من المعرض ستظهر هنا فور وصولها' : 'New wall submissions will appear here instantly'}</p>
                    </div>
                  )}
                  {visible.map((it, vi) => {
                    const d = deco.get(it.id);
                    const locked = isReviewLocked(it.reviewingBy, it.reviewingAt, ME);
                    const st = STATUS_CHIP[it.status];
                    return (
                      <div key={it.id}
                        className="adm-card adm-in rounded-2xl border border-white/10 bg-gradient-to-l from-white/[0.045] to-transparent p-3 flex gap-3 items-start hover:border-[#C9A24B]/35 hover:shadow-[0_14px_40px_rgba(0,0,0,0.5)]"
                        style={{ animationDelay: `${Math.min(vi, 8) * 45}ms` }}>
                        <button type="button" onClick={() => toggleSel(it.id)} aria-label="select"
                          className="mt-2 shrink-0 transition-transform active:scale-90">
                          {selected.has(it.id) ? (
                            <span className="block w-[22px] h-[22px] rounded-lg bg-gradient-to-b from-[#FFF3D6] to-[#C9A24B] p-[2px] shadow-[0_0_14px_rgba(201,162,75,0.5)]">
                              <svg className="w-full h-full text-black" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
                            </span>
                          ) : (
                            <span className="block w-[22px] h-[22px] rounded-lg border-[1.5px] border-white/20 hover:border-[#C9A24B]/60 transition-colors" />
                          )}
                        </button>
                        <MediaThumb it={it} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {it.status === 'pending' && <span className="w-1.5 h-1.5 rounded-full bg-[#F5D489] dot-pulse shrink-0" />}
                            <span className="text-[13.5px] font-black text-[#D9C08A]" dir="ltr">@{it.name}</span>
                            <Chip c={st.c} t={ar ? st.ar : st.en} />
                            {locked && (
                              <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[10px] font-black border border-white/20 text-white/50" dir="ltr">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>
                                Reviewing by {String(it.reviewingBy).slice(0, 12)}
                              </span>
                            )}
                          </div>
                          <p className="text-[12.5px] text-white/60 clamp-2 mt-1 leading-relaxed">{it.caption || (ar ? 'بدون وصف' : 'No caption')}</p>
                          <div className="flex gap-1.5 mt-2 flex-wrap">
                            {d?.isDup && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/15 text-white/60" dir="ltr">
                                Possible duplicate • {d.dupOfName}
                              </span>
                            )}
                            {d?.isFrequent && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#C9A24B]/10 border border-[#C9A24B]/40 text-[#D9C08A]" dir="ltr">
                                Frequent submitter ×{d.freqCount}
                              </span>
                            )}
                            {d?.flags && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-orange-500/10 border border-orange-400/45 text-orange-300" dir="ltr">
                                Flagged ×{d.flags.flagCount} • {d.flags.flagReasons.join(', ')}
                              </span>
                            )}
                            {it.status === 'rejected' && it.rejectReason && (
                              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-500/10 border border-red-400/45 text-red-300">
                                {reasonLabels(it.rejectReason)?.[ar ? 'ar' : 'en'] || it.rejectReason}
                              </span>
                            )}
                          </div>
                          <p className="text-[10.5px] text-white/30 mt-2 flex items-center gap-2.5 flex-wrap" dir="ltr">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/10">{it.mediaType}{it.kind === 'link' ? ' • link' : ''}</span>
                            <span className="text-[#FF8A7A]/80">♥ {it.likes}</span>
                            <span className="inline-flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              {timeAgo(it.createdAt, ar)}
                            </span>
                            <span className="truncate max-w-[220px] text-white/25">{hostOf(it.url || it.mediaUrl)}</span>
                          </p>
                        </div>
                        <div className="flex flex-col gap-1.5 shrink-0">
                          <button type="button" onClick={() => setReviewId(it.id)}
                            className="h-9 px-4 rounded-full text-[11.5px] font-black border border-[#C9A24B]/45 text-[#F0DDAE] bg-[#C9A24B]/[0.06] hover:bg-[#C9A24B]/[0.14] transition-all active:scale-95">
                            {ar ? 'مراجعة' : 'Review'}
                          </button>
                          {tab === 'flagged' && (
                            <button type="button" onClick={async () => { await adminClearReports(it.id); await reload(); }}
                              className="h-9 px-4 rounded-full text-[11px] font-bold border border-white/15 text-white/60 hover:text-white transition-all">
                              {ar ? 'مسح البلاغات' : 'Clear flags'}
                            </button>
                          )}
                          {tab === 'queue' && (
                            <>
                              <button type="button" disabled={locked} onClick={() => doSingle('approve', it.id)}
                                className="btn-sheen h-9 px-4 rounded-full text-[11.5px] font-black text-black disabled:opacity-40 transition-transform active:scale-95" style={{ background: 'linear-gradient(180deg,#D6F5C8,#53FC18)' }}>
                                {ar ? 'قبول' : 'Approve'}
                              </button>
                              <button type="button" disabled={locked} onClick={() => askConfirm({
                                title: ar ? 'رفض المشاركة؟' : 'Reject this edit?',
                                desc: ar ? 'مخفي — قابل للتراجع 10 ثوانٍ عبر Undo' : 'Hidden — reversible for 10 seconds via Undo',
                                requireReason: true, confirmLabel: ar ? 'رفض' : 'Reject', danger: true,
                                onConfirm: (r) => doSingle('reject', it.id, r),
                              })}
                                className="h-9 px-4 rounded-full text-[11px] font-bold border border-amber-400/45 text-amber-300 hover:bg-amber-400/10 disabled:opacity-40 transition-all">
                                {ar ? 'رفض' : 'Reject'}
                              </button>
                            </>
                          )}
                          {tab === 'approved' && (
                            <button type="button" onClick={() => askConfirm({
                              title: ar ? 'سحب من الجدار؟' : 'Take down?',
                              desc: ar ? 'يُخفى فوراً — قابل للتراجع 10 ثوانٍ عبر Undo' : 'Unpublished immediately — reversible for 10 seconds via Undo',
                              requireReason: true, confirmLabel: ar ? 'سحب' : 'Take Down', danger: true,
                              onConfirm: (r) => doSingle('unpublish', it.id, r),
                            })}
                              className="h-9 px-4 rounded-full text-[11px] font-bold border border-red-400/45 text-red-300 hover:bg-red-500/10 transition-all">
                              {ar ? 'سحب' : 'Take Down'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {tab === 'audit' && <AuditLog ar={ar} actions={actions} query={auditQuery} setQuery={setAuditQuery} />}
              {tab === 'dash' && <Dashboard ar={ar} dash={dash} actions={actions} flagged={flaggedEntries.length} />}
            </div>
          </>
        )}
      </div>

      {/* ReviewModal */}
      {reviewItem && (
        <ReviewModal
          ar={ar}
          item={reviewItem}
          list={visible.length ? visible : [reviewItem]}
          deco={deco.get(reviewItem.id) || null}
          onMove={(id) => setReviewId(id)}
          onClose={() => setReviewId(null)}
          onChanged={reload}
          onToast={showToast}
          askConfirm={askConfirm}
        />
      )}

      {/* ConfirmDialog */}
      {confirm && <ConfirmDialog ar={ar} c={confirm} onClose={() => setConfirm(null)} />}

      {/* Undo Toast */}
      {toast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[calc(100%-2rem)] max-w-md">
          <div className="rounded-2xl border border-[#C9A24B]/55 bg-[#0d0a06]/95 backdrop-blur px-4 py-3 flex items-center gap-3 shadow-[0_16px_50px_rgba(0,0,0,0.75)] adm-in">
            <span className="w-9 h-9 rounded-xl bg-[#C9A24B]/12 border border-[#C9A24B]/40 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-[#D9C08A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
            </span>
            <span className="flex-1 text-[13px] font-bold text-white truncate">{toast.label}</span>
            {toast.ids.length > 0 && (
              <button type="button" onClick={() => doUndo(toast.ids)}
                className="btn-sheen h-9 px-4 rounded-full text-[12px] font-black text-black shrink-0 transition-transform active:scale-95" style={{ background: 'linear-gradient(180deg, #FFF3D6, #C9A24B)' }}>
                {ar ? 'تراجع' : 'Undo'}
              </button>
            )}
            <button type="button" onClick={() => setToast(null)} className="text-white/40 hover:text-white shrink-0 transition-colors">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- ConfirmDialog ----------------
function ConfirmDialog({ ar, c, onClose }: {
  ar: boolean;
  c: { title: string; desc: string; requireReason: boolean; confirmLabel: string; danger?: boolean; onConfirm: (reason: string) => void };
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [custom, setCustom] = useState('');
  const finalReason = reason === 'other' ? custom.trim() : reason;
  const canGo = !c.requireReason || !!finalReason;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-[24px] border border-[#C9A24B]/35 p-6 adm-in shadow-[0_30px_80px_rgba(0,0,0,0.7)]"
        style={{ background: 'linear-gradient(160deg, #1d150c, #0e0a06)' }}>
        <div className="absolute top-0 inset-x-10 h-px bg-gradient-to-l from-transparent via-[#C9A24B]/80 to-transparent" aria-hidden="true" />
        <h3 className="font-black text-white text-lg">{c.title}</h3>
        <p className="text-[13px] text-white/55 mt-1 leading-relaxed">{c.desc}</p>
        {c.requireReason && (
          <>
            <p className="mt-4 mb-2 text-[10px] font-black tracking-[0.25em] text-white/40" dir="ltr">REASON REQUIRED</p>
            <div className="grid grid-cols-2 gap-2">
              {REJECT_REASONS.map((r) => (
                <button key={r.v} type="button" onClick={() => setReason(r.v)}
                  className={`min-h-[46px] px-3 rounded-xl border text-[12px] font-bold transition-all active:scale-[0.97] ${reason === r.v ? 'border-[#D9A441] text-[#F5D489] bg-[#D9A441]/10 shadow-[0_0_18px_rgba(217,164,65,0.2)]' : 'border-white/10 text-white/60 hover:border-white/25'}`}>
                  {ar ? r.ar : r.en}
                </button>
              ))}
            </div>
            {reason === 'other' && (
              <input value={custom} onChange={(e) => setCustom(e.target.value.slice(0, 160))}
                placeholder={ar ? 'اشرح السبب…' : 'Describe the reason…'}
                className="mt-2 w-full h-11 px-4 rounded-xl bg-black/50 border border-white/10 text-white text-sm outline-none focus:border-[#D9A441]/60" />
            )}
          </>
        )}
        <div className="flex gap-2 mt-5">
          <button type="button" onClick={() => { if (canGo) { onClose(); c.onConfirm(finalReason); } }} disabled={!canGo}
            className={`btn-sheen flex-1 h-12 rounded-xl font-black text-sm disabled:opacity-40 transition-transform active:scale-[0.98] ${c.danger ? 'text-white' : 'text-black'}`}
            style={c.danger
              ? { background: 'linear-gradient(180deg, #E0664F, #B03A2A)' }
              : { background: 'linear-gradient(180deg, #FFF3D6, #C9A24B)' }}>
            {c.confirmLabel}
          </button>
          <button type="button" onClick={onClose} className="h-12 px-5 rounded-xl border border-white/15 text-white/70 text-sm font-bold hover:text-white transition-colors">
            {ar ? 'إلغاء' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------- ReviewModal ----------------
function ReviewModal({ ar, item, list, deco, onMove, onClose, onChanged, onToast, askConfirm }: {
  ar: boolean;
  item: AdminItem;
  list: AdminItem[];
  deco: import('../services/moderation').Deco | null;
  onMove: (id: string) => void;
  onClose: () => void;
  onChanged: () => void;
  onToast: (ids: string[], label: string) => void;
  askConfirm: (c: any) => void;
}) {
  const idx = Math.max(0, list.findIndex((x) => x.id === item.id));
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(item.name);
  const [caption, setCaption] = useState(item.caption);
  const [note, setNote] = useState(item.internalNote);
  const [savedMsg, setSavedMsg] = useState('');
  const [noteMsg, setNoteMsg] = useState('');
  const [picking, setPicking] = useState(false);
  const [reason, setReason] = useState('');
  const [custom, setCustom] = useState('');
  const dirtyEdit = name.trim() !== item.name || caption.trim() !== (item.caption || '');
  const dirtyNote = note !== (item.internalNote || '');
  const locked = !!lockedBy;

  useEffect(() => {
    setName(item.name);
    setCaption(item.caption || '');
    setNote(item.internalNote || '');
    setSavedMsg('');
    setNoteMsg('');
    setPicking(false);
    setReason('');
    setCustom('');
    setLockedBy(null);
    let dead = false;
    adminBeginReview(item.id).then(({ data }) => {
      if (dead) return;
      if (data && data.ok === false && data.error === 'locked') setLockedBy(data.lockedBy || '?');
    }).catch(() => {});
    return () => {
      dead = true;
      adminEndReview(item.id).catch(() => {});
    };
  }, [item.id]);

  const go = (d: number) => {
    if (!list.length) return;
    const n = (idx + d + list.length) % list.length;
    onMove(list[n].id);
  };

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'a' || e.key === 'A') {
        if (item.status === 'pending' && !locked && !busy) doApprove();
      } else if (e.key === 'r' || e.key === 'R') {
        if ((item.status === 'pending' || item.status === 'approved') && !locked && !busy) setPicking(true);
      } else if (e.key === 'ArrowRight' || e.key === 'n' || e.key === 'N') go(1);
      else if (e.key === 'ArrowLeft' || e.key === 'p' || e.key === 'P') go(-1);
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, list, item, locked, busy]);

  const doApprove = async () => {
    if (locked || busy) return;
    setBusy(true);
    try {
      const res = await adminApprove(item.id);
      if (authedFetchFail(res.data)) return;
      if (res.data?.ok) {
        await onChanged();
        onToast([item.id], ar ? 'تم القبول' : 'Approved');
        go(1);
      }
    } finally {
      setBusy(false);
    }
  };

  const doRejectOrDown = async () => {
    const r = reason === 'other' ? custom.trim() : reason;
    if (!r || locked || busy) return;
    setBusy(true);
    try {
      const res = item.status === 'approved' ? await adminUnpublish(item.id, r) : await adminReject(item.id, r);
      if (authedFetchFail(res.data)) return;
      if (res.data?.ok) {
        await onChanged();
        onToast([item.id], item.status === 'approved' ? (ar ? 'تم السحب' : 'Unpublished') : (ar ? 'تم الرفض' : 'Rejected'));
        setPicking(false);
        go(1);
      } else if (res.data?.error === 'migration_required') {
        setNoteMsg(ar ? 'نفّذ supabase-gallery-v2.sql أولاً' : 'Run supabase-gallery-v2.sql first');
      }
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!dirtyEdit || busy) return;
    setBusy(true);
    try {
      const res = await adminUpdateItem(item.id, name.trim(), caption.trim());
      if (authedFetchFail(res.data)) return;
      if (res.data?.ok) {
        setSavedMsg(ar ? 'تم الحفظ — يظهر الآن مباشرة' : 'Saved — it now reflects live');
        await onChanged();
      }
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    if (!dirtyNote || busy) return;
    setBusy(true);
    try {
      const res = await adminSetNote(item.id, note);
      if (authedFetchFail(res.data)) return;
      if (res.data?.ok) {
        setNoteMsg(ar ? 'تم حفظ الملاحظة' : 'Note saved');
        await onChanged();
      } else if (res.data?.error === 'migration_required') {
        setNoteMsg(ar ? 'نفّذ supabase-gallery-v2.sql أولاً' : 'Run supabase-gallery-v2.sql first');
      }
    } finally {
      setBusy(false);
    }
  };

  const doDelete = () => {
    askConfirm({
      title: ar ? 'حذف نهائي؟' : 'Delete permanently?',
      desc: ar ? 'يُحذف من القاعدة والتخزين — لا يمكن التراجع' : 'Removed from DB and storage — cannot be undone',
      requireReason: false, confirmLabel: ar ? 'حذف' : 'Delete', danger: true,
      onConfirm: async () => {
        await adminRemove(item.id);
        await onChanged();
        onClose();
      },
    });
  };

  const st = STATUS_CHIP[item.status];

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/85 backdrop-blur" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[94%] overflow-auto rounded-[24px] border border-[#C9A24B]/35 adm-in shadow-[0_40px_100px_rgba(0,0,0,0.8)]"
        style={{ background: 'linear-gradient(160deg, #1d150c, #0e0a06)' }}>
        <div className="absolute top-0 inset-x-10 h-px bg-gradient-to-l from-transparent via-[#C9A24B]/80 to-transparent" aria-hidden="true" />
        {/* header */}
        <div className="sticky top-0 z-10 bg-[#0d0a06]/95 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center gap-2 flex-wrap">
          <span className="text-[15px] font-black text-[#D9C08A]" dir="ltr">@{item.name}</span>
          <Chip c={st.c} t={ar ? st.ar : st.en} />
          <span className="text-[11px] text-white/35" dir="ltr">• {timeAgo(item.createdAt, ar)}</span>
          {item.width ? <span className="text-[11px] text-white/35" dir="ltr">• {item.width}×{item.height}</span> : <span className="text-[11px] text-white/35">• no dims</span>}
          <span className="text-[11px] text-white/35" dir="ltr">• ♥ {item.likes}</span>
          {lockedBy && <span className="text-[11px] font-bold text-amber-300">• Reviewing by {lockedBy}</span>}
          <span className="ms-auto flex items-center gap-1.5" dir="ltr">
            <span className="text-[11px] font-black text-white/40">{idx + 1}/{list.length}</span>
            <button type="button" onClick={() => go(-1)} className="w-8 h-8 rounded-full border border-white/15 text-white/70 hover:border-[#C9A24B]/50 transition-colors">‹</button>
            <button type="button" onClick={() => go(1)} className="w-8 h-8 rounded-full border border-white/15 text-white/70 hover:border-[#C9A24B]/50 transition-colors">›</button>
            <button type="button" onClick={onClose} className="w-8 h-8 rounded-full border border-white/15 text-white/70 hover:text-white transition-colors">✕</button>
          </span>
        </div>

        <div className="grid md:grid-cols-[1.2fr_1fr]">
          {/* BigPreview */}
          <div className="p-4 bg-black/40 min-w-0">
            {item.mediaType === 'video' && item.mediaUrl ? (
              <video src={item.mediaUrl} controls autoPlay muted playsInline preload="metadata" poster={item.posterUrl || undefined}
                className="w-full max-h-[60vh] object-contain bg-black rounded-2xl border border-white/10" />
            ) : item.posterUrl ? (
              <img src={item.posterUrl} alt={item.caption || item.name} className="w-full max-h-[60vh] object-contain bg-black rounded-2xl border border-white/10" />
            ) : (
              <div className="w-full min-h-[240px] flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/60 border border-white/10">
                <svg className="w-8 h-8 text-[#D9C08A]/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-8a2 2 0 00-2-2zm7-4h-4m4 0v4m0-4L11 13" />
                </svg>
                <span className="text-[11px] text-white/40" dir="ltr">{hostOf(item.url || item.mediaUrl)}</span>
                {(item.url || item.mediaUrl) && (
                  <a href={(item.url || item.mediaUrl)!} target="_blank" rel="noopener noreferrer"
                    className="mt-1 h-9 px-4 rounded-full text-[12px] font-bold border border-[#C9A24B]/40 text-[#F0DDAE] hover:bg-[#C9A24B]/10 transition-colors">
                    Open host
                  </a>
                )}
              </div>
            )}
            <div className="flex gap-1.5 mt-3 flex-wrap">
              {deco?.isDup && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/15 text-white/60" dir="ltr">Possible duplicate • {deco.dupOfName}</span>}
              {deco?.isFrequent && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#C9A24B]/10 border border-[#C9A24B]/40 text-[#D9C08A]" dir="ltr">Frequent submitter ×{deco.freqCount}</span>}
              {deco?.flags && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-orange-500/10 border border-orange-400/45 text-orange-300" dir="ltr">Flagged ×{deco.flags.flagCount} • {deco.flags.flagReasons.join(', ')}</span>}
              {item.status === 'rejected' && item.rejectReason && (
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-500/10 border border-red-400/45 text-red-300">{item.rejectReason}</span>
              )}
            </div>
            <p className="mt-3 text-[10px] text-white/25" dir="ltr">A approve • R reject • ← → navigate • Esc close</p>
          </div>

          {/* side */}
          <div className="p-4 border-s border-white/[0.07] min-w-0 bg-white/[0.015]">
            <label className="block text-[10px] font-black tracking-[0.2em] text-white/40" dir="ltr">DISPLAY NAME (40)</label>
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))}
              className="mt-1.5 w-full h-11 px-3.5 rounded-xl bg-black/50 border border-white/10 text-white text-sm outline-none focus:border-[#D9A441]/60 transition-colors" dir="ltr" />
            <label className="block mt-3 text-[10px] font-black tracking-[0.2em] text-white/40" dir="ltr">CAPTION (180)</label>
            <textarea value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 180))} rows={3}
              className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white text-sm outline-none focus:border-[#D9A441]/60 transition-colors" />
            {dirtyEdit && (
              <button type="button" onClick={saveEdit} disabled={busy}
                className="btn-sheen mt-2 w-full h-10 rounded-xl text-[13px] font-black text-black disabled:opacity-40 transition-transform active:scale-[0.98]" style={{ background: 'linear-gradient(180deg, #FFF3D6, #C9A24B)' }}>
                {ar ? 'حفظ الاسم والوصف' : 'Save name & caption'}
              </button>
            )}
            {savedMsg && <p className="mt-2 text-[12px] font-bold text-emerald-300">✅ {savedMsg}</p>}

            <label className="block mt-4 text-[10px] font-black tracking-[0.2em] text-amber-200/50" dir="ltr">PRIVATE NOTE (ADMINS ONLY)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 2000))} rows={3}
              placeholder={ar ? 'ملاحظة خاصة لا يراها إلا المشرفون…' : 'Private note — only admins see this…'}
              className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-amber-400/25 text-white text-sm outline-none focus:border-amber-400/55 transition-colors" />
            {dirtyNote && (
              <button type="button" onClick={saveNote} disabled={busy}
                className="mt-2 w-full h-10 rounded-xl text-[13px] font-bold border border-amber-400/45 text-amber-300 hover:bg-amber-400/10 disabled:opacity-40 transition-all">
                {ar ? 'حفظ الملاحظة' : 'Save note'}
              </button>
            )}
            {noteMsg && <p className="mt-2 text-[12px] font-bold text-emerald-300">✅ {noteMsg}</p>}

            <div className="mt-4 pt-4 border-t border-white/[0.07]">
              {item.status === 'pending' && !picking && (
                <div className="flex gap-2">
                  <button type="button" onClick={doApprove} disabled={locked || busy}
                    className="btn-sheen flex-1 h-11 rounded-xl font-black text-sm text-black disabled:opacity-40 transition-transform active:scale-[0.98]" style={{ background: 'linear-gradient(180deg,#D6F5C8,#53FC18)' }}>
                    {ar ? 'قبول (A)' : 'Approve (A)'}
                  </button>
                  <button type="button" onClick={() => setPicking(true)} disabled={locked || busy}
                    className="flex-1 h-11 rounded-xl font-black text-sm border border-amber-400/45 text-amber-300 hover:bg-amber-400/10 disabled:opacity-40 transition-all">
                    {ar ? 'رفض (R)' : 'Reject (R)'}
                  </button>
                </div>
              )}
              {item.status === 'approved' && !picking && (
                <button type="button" onClick={() => setPicking(true)} disabled={locked || busy}
                  className="w-full h-11 rounded-xl font-black text-sm text-white disabled:opacity-40 transition-transform active:scale-[0.98]" style={{ background: 'linear-gradient(180deg, #E0664F, #B03A2A)' }}>
                  {ar ? 'سحب من الجدار' : 'Take Down'}
                </button>
              )}
              {item.status === 'rejected' && (
                <p className="text-[12px] text-white/45">
                  {ar ? 'تم الإجراء' : 'Actioned'} {timeAgo(item.reviewedAt, ar)} {item.reviewer ? `by ${item.reviewer}` : ''}
                </p>
              )}
              {locked && <p className="mt-2 text-[12px] font-bold text-amber-300">{ar ? 'مقفل بواسطة مراجع آخر' : 'Locked by another reviewer'}</p>}

              {picking && (
                <div className="mt-3 rounded-2xl border border-white/10 bg-black/40 p-3 adm-in">
                  <p className="text-[10px] font-black tracking-[0.25em] text-white/40" dir="ltr">REJECT REASON</p>
                  <div className="grid grid-cols-2 gap-1.5 mt-2">
                    {REJECT_REASONS.map((r) => (
                      <button key={r.v} type="button" onClick={() => setReason(r.v)}
                        className={`min-h-[42px] px-2 rounded-xl border text-[11px] font-bold transition-all active:scale-[0.97] ${reason === r.v ? 'border-[#D9A441] text-[#F5D489] bg-[#D9A441]/10 shadow-[0_0_18px_rgba(217,164,65,0.2)]' : 'border-white/10 text-white/60 hover:border-white/25'}`}>
                        {ar ? r.ar : r.en}
                      </button>
                    ))}
                  </div>
                  {reason === 'other' && (
                    <input value={custom} onChange={(e) => setCustom(e.target.value.slice(0, 160))}
                      placeholder={ar ? 'اشرح السبب…' : 'Describe the reason…'}
                      className="mt-2 w-full h-10 px-3.5 rounded-xl bg-black/50 border border-white/10 text-white text-sm outline-none focus:border-[#D9A441]/60" />
                  )}
                  <div className="flex gap-2 mt-3">
                    <button type="button" onClick={doRejectOrDown} disabled={!((reason === 'other' ? custom.trim() : reason)) || locked || busy}
                      className="flex-1 h-10 rounded-xl text-[13px] font-black text-white disabled:opacity-40 transition-transform active:scale-[0.98]" style={{ background: 'linear-gradient(180deg, #E0664F, #B03A2A)' }}>
                      {ar ? 'تأكيد الرفض / السحب' : 'Confirm Reject / Take Down'}
                    </button>
                    <button type="button" onClick={() => { setPicking(false); setReason(''); setCustom(''); }}
                      className="h-10 px-4 rounded-xl border border-white/15 text-white/60 hover:text-white text-[13px] font-bold transition-colors">
                      {ar ? 'إلغاء' : 'Cancel'}
                    </button>
                  </div>
                </div>
              )}

              <button type="button" onClick={doDelete}
                className="mt-3 w-full h-9 rounded-xl text-[11px] font-bold text-red-300/60 hover:text-red-300 hover:bg-red-500/[0.06] transition-all">
                {ar ? 'حذف نهائي' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- Dashboard ----------------
function Dashboard({ ar, dash, actions, flagged }: { ar: boolean; dash: any; actions: any[]; flagged: number }) {
  const max = Math.max(1, ...dash.days.map((d: any) => d.count));
  const badge: Record<string, string> = {
    approve: 'approved', reject: 'rejected', unpublish: 'took down', undo: 'undid',
    update: 'edited', note: 'noted', clear_reports: 'cleared flags', remove: 'deleted',
  };
  const badgeC: Record<string, any> = {
    approve: { color: '#6EE7B7', borderColor: 'rgba(16,185,129,0.5)', background: 'rgba(16,185,129,0.12)' },
    reject: { color: '#FF8A7A', borderColor: 'rgba(255,92,61,0.5)', background: 'rgba(255,92,61,0.12)' },
    unpublish: { color: '#FF8A7A', borderColor: 'rgba(255,92,61,0.5)', background: 'rgba(255,92,61,0.12)' },
    undo: { color: '#F5D489', borderColor: 'rgba(217,164,65,0.5)', background: 'rgba(217,164,65,0.12)' },
    update: { color: '#7DD3FC', borderColor: 'rgba(56,189,248,0.5)', background: 'rgba(56,189,248,0.12)' },
    note: { color: '#7DD3FC', borderColor: 'rgba(56,189,248,0.5)', background: 'rgba(56,189,248,0.12)' },
    clear_reports: { color: '#FB923C', borderColor: 'rgba(251,146,60,0.5)', background: 'rgba(251,146,60,0.12)' },
    remove: { color: '#FF8A7A', borderColor: 'rgba(255,92,61,0.5)', background: 'rgba(255,92,61,0.12)' },
  };
  return (
    <div className="adm-in">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { l: ar ? 'كل المشاركات' : 'Total submissions', v: dash.total },
          { l: ar ? 'نسبة القبول' : 'Approval rate', v: `${dash.rate}%` },
          { l: ar ? 'متوسط المراجعة' : 'Avg time to review', v: fmtDuration(dash.avg) },
          { l: ar ? 'مُبلغ عنه' : 'Flagged', v: flagged },
        ].map((c) => (
          <div key={c.l} className="adm-card rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent px-4 py-4 text-center hover:border-[#C9A24B]/30">
            <p className="text-xl sm:text-2xl font-black text-white" dir="ltr"><CountUp value={typeof c.v === 'number' ? c.v : c.v} /></p>
            <p className="text-[10px] font-bold text-white/40 mt-1">{c.l}</p>
          </div>
        ))}
      </div>

      <h3 className="mt-5 mb-2 text-[11px] font-black tracking-[0.25em] text-white/40" dir="ltr">SUBMISSIONS — LAST 7 DAYS</h3>
      <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
        <div className="flex items-end gap-2 h-[140px]" dir="ltr">
          {dash.days.map((d: any, i: number) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full min-w-0">
              <span className="text-[10px] font-black text-[#D9C08A]" dir="ltr">{d.count}</span>
              <div className="w-full max-w-[46px] rounded-t-lg border-x border-t border-[#C9A24B]/50 transition-all duration-500"
                style={{
                  height: `${Math.max(6, Math.round((d.count / max) * 100))}%`,
                  background: 'linear-gradient(to bottom, #C9A24B, rgba(201,162,75,0.25))',
                  boxShadow: d.count > 0 ? '0 0 16px rgba(201,162,75,0.3)' : 'none',
                }} />
              <span className="text-[9px] text-white/35 truncate w-full text-center">{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-2.5 mt-2.5">
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
          <p className="text-[11px] font-black tracking-[0.2em] text-white/40" dir="ltr">TOP CONTRIBUTORS</p>
          <div className="mt-2.5 space-y-2">
            {dash.top.length === 0 && <p className="text-[12px] text-white/30">—</p>}
            {dash.top.map(([n, c]: any, i: number) => (
              <div key={n} className="flex items-center gap-2.5 text-[13px] rounded-xl px-2 py-1 hover:bg-white/[0.03] transition-colors">
                <span className="w-6 h-6 rounded-lg bg-[#C9A24B]/15 border border-[#C9A24B]/35 text-[#D9C08A] text-[10px] font-black flex items-center justify-center shrink-0" dir="ltr">{i + 1}</span>
                <span className="font-bold text-white/75 truncate" dir="ltr">@{n}</span>
                <span className="ms-auto text-white/40 font-black" dir="ltr">{c}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
          <p className="text-[11px] font-black tracking-[0.2em] text-white/40" dir="ltr">MOST LIKED ON THE WALL</p>
          <div className="mt-2.5 space-y-2">
            {dash.liked.length === 0 && <p className="text-[12px] text-white/30">—</p>}
            {dash.liked.map((x: any, i: number) => (
              <div key={x.id} className="flex items-center gap-2.5 text-[13px] rounded-xl px-2 py-1 hover:bg-white/[0.03] transition-colors">
                <span className="w-6 h-6 rounded-lg bg-white/[0.06] border border-white/15 text-white/50 text-[10px] font-black flex items-center justify-center shrink-0" dir="ltr">{i + 1}</span>
                <span className="font-bold text-white/75 truncate" dir="ltr">@{x.name}</span>
                <span className="text-[10px] text-white/30 shrink-0" dir="ltr">{x.mediaType}</span>
                <span className="ms-auto text-[#FF8A7A] font-black shrink-0" dir="ltr">♥ {x.likes}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h3 className="mt-5 mb-2 text-[11px] font-black tracking-[0.25em] text-white/40" dir="ltr">RECENT ACTIONS</h3>
      <div className="space-y-1.5">
        {actions.slice(0, 20).map((a: any) => (
          <div key={a.id} className="rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 flex items-center gap-2.5 flex-wrap text-[12px] hover:border-white/20 transition-colors">
            <Chip c={badgeC[a.action] || {}} t={badge[a.action] || a.action} />
            <span className="font-bold text-white/75 truncate" dir="ltr">{a.item_name ? `@${a.item_name}` : `#${String(a.item_id || '').slice(0, 8)}`}</span>
            {(a.reason || a.note) && <span className="text-white/40 truncate">— {a.reason || a.note}</span>}
            <span className="ms-auto text-white/30 shrink-0" dir="ltr">by {(a.admin || 'admin').slice(0, 8)} · {timeAgo(a.created_at, ar)}</span>
          </div>
        ))}
        {actions.length === 0 && <p className="text-[12px] text-white/30 p-4 text-center border border-dashed border-white/15 rounded-2xl">—</p>}
      </div>
    </div>
  );
}

// ---------------- AuditLog ----------------
function AuditLog({ ar, actions, query, setQuery }: { ar: boolean; actions: any[]; query: string; setQuery: (q: string) => void }) {
  const badge: Record<string, string> = {
    approve: 'approved', reject: 'rejected', unpublish: 'took down', undo: 'undid',
    update: 'edited', note: 'noted', clear_reports: 'cleared flags', remove: 'deleted',
  };
  const badgeC: Record<string, any> = {
    approve: { color: '#6EE7B7', borderColor: 'rgba(16,185,129,0.5)', background: 'rgba(16,185,129,0.12)' },
    reject: { color: '#FF8A7A', borderColor: 'rgba(255,92,61,0.5)', background: 'rgba(255,92,61,0.12)' },
    unpublish: { color: '#FF8A7A', borderColor: 'rgba(255,92,61,0.5)', background: 'rgba(255,92,61,0.12)' },
    undo: { color: '#F5D489', borderColor: 'rgba(217,164,65,0.5)', background: 'rgba(217,164,65,0.12)' },
    update: { color: '#7DD3FC', borderColor: 'rgba(56,189,248,0.5)', background: 'rgba(56,189,248,0.12)' },
    note: { color: '#7DD3FC', borderColor: 'rgba(56,189,248,0.5)', background: 'rgba(56,189,248,0.12)' },
    clear_reports: { color: '#FB923C', borderColor: 'rgba(251,146,60,0.5)', background: 'rgba(251,146,60,0.12)' },
    remove: { color: '#FF8A7A', borderColor: 'rgba(255,92,61,0.5)', background: 'rgba(255,92,61,0.12)' },
  };
  const q = query.toLowerCase();
  const rows = q
    ? actions.filter((a: any) => `${a.admin || ''} ${a.action || ''} ${a.reason || ''} ${a.note || ''} ${a.item_name || ''} ${JSON.stringify(a.meta || {})}`.toLowerCase().includes(q))
    : actions;
  return (
    <div className="adm-in">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-l from-[#C9A24B]/[0.08] to-transparent p-4 mb-3 flex items-center gap-3">
        <span className="w-10 h-10 rounded-2xl bg-[#C9A24B]/12 border border-[#C9A24B]/35 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-[#D9C08A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
          </svg>
        </span>
        <div>
          <h3 className="font-black text-white text-[15px]" dir="ltr">Full audit log</h3>
          <p className="text-[12px] text-white/40">{ar ? 'كل إجراء إشرافي بالترتيب' : 'Every moderation action in order'}</p>
        </div>
      </div>
      <span className="relative block mb-3">
        <svg className="w-4 h-4 text-white/30 absolute start-4 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 6a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2zm0 6a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" />
        </svg>
        <input value={query} onChange={(e) => setQuery(e.target.value.slice(0, 120))}
          placeholder={ar ? 'فلتر: اسم / إجراء / سبب…' : 'Filter by name, action, reason…'}
          className="h-10 w-full ps-10 pe-4 rounded-full bg-black/50 border border-white/10 text-white text-[13px] outline-none focus:border-[#D9A441]/60 placeholder:text-white/25 transition-colors" />
      </span>
      <div className="space-y-1.5">
        {rows.map((a: any) => (
          <div key={a.id} className="rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 flex items-center gap-2.5 flex-wrap text-[12px] hover:border-white/20 transition-colors">
            <Chip c={badgeC[a.action] || {}} t={badge[a.action] || a.action} />
            <span className="font-bold text-white/75 truncate" dir="ltr">{a.item_name ? `@${a.item_name}` : `#${String(a.item_id || '').slice(0, 8)}`}</span>
            {(a.reason || a.note) && <span className="text-white/40 truncate">— {a.reason || a.note}</span>}
            <span className="ms-auto text-white/30 shrink-0" dir="ltr">{(a.admin || 'admin').slice(0, 8)} · {timeAgo(a.created_at, ar)}</span>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-[13px] text-white/40 p-8 text-center border border-dashed border-white/15 rounded-2xl">
            {actions.length === 0 ? (ar ? 'السجل فارغ' : 'Audit log is empty') : (ar ? 'لا نتائج مطابقة' : 'No matching actions')}
          </p>
        )}
      </div>
    </div>
  );
}

