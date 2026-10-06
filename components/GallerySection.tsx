import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Language } from '../types';
import { fetchWall, uploadToWall, toggleLike, shareItem, reportItem, type WallItem } from '../services/galleryApi';

// ============================================================
//  FIRAS Gallery Wall — نفس فيزياء 300K-Edits-Wall-Guide حرفياً
//  MIN 0.5625 / MAX 1.85 / cost +0.35 / penalty 0.55 / 1-2-3-4 cols
//  + تصميم ذهبي فاخر يستخدم البانر واللوجو + رفع + لايك/بلاغ/مشاركة
// ============================================================

const MIN_RATIO = 0.5625; // 9:16
const MAX_RATIO = 1.85;
const ORIENTATION_PENALTY = 0.55;

function mediaRatio(sub: WallItem): number {
  if (sub.width && sub.height) {
    const r = sub.width / sub.height;
    return Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));
  }
  return 16 / 9;
}
function mediaCost(sub: WallItem): number {
  return 1 / mediaRatio(sub) + 0.35;
}
function orientationOf(sub: WallItem): 'portrait' | 'landscape' | 'square' {
  if (!sub.width || !sub.height) return 'square';
  const r = sub.width / sub.height;
  if (r > 1.05) return 'landscape';
  if (r < 0.95) return 'portrait';
  return 'square';
}
function hashIds(items: WallItem[]): number {
  let h = 7;
  for (const item of items) {
    for (let i = 0; i < item.id.length; i++) h = (Math.imul(h, 31) + item.id.charCodeAt(i)) | 0;
  }
  return h;
}
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function packColumns(items: WallItem[], n: number): WallItem[][] {
  const cols: WallItem[][] = Array.from({ length: n }, () => []);
  const heights = new Array(n).fill(0);
  const lastOrient = new Array(n).fill(null as 'portrait' | 'landscape' | 'square' | null);
  for (const item of items) {
    const o = orientationOf(item);
    let best = 0;
    let bestScore = Infinity;
    for (let c = 0; c < n; c++) {
      const score = heights[c] + (lastOrient[c] === o ? ORIENTATION_PENALTY : 0);
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    cols[best].push(item);
    heights[best] += mediaCost(item);
    lastOrient[best] = o;
  }
  return cols;
}
function useColumnCount(): number {
  const [count, setCount] = useState(() => {
    if (typeof window === 'undefined') return 3;
    const w = window.innerWidth;
    if (w >= 1440) return 4;
    if (w >= 1024) return 3;
    if (w >= 640) return 2;
    return 1;
  });
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      setCount(w >= 1440 ? 4 : w >= 1024 ? 3 : w >= 640 ? 2 : 1);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);
  return count;
}
function hoverCapable(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}
function timeAgo(iso: string, ar: boolean): string {
  try {
    const d = new Date(iso).getTime();
    const s = Math.max(0, Math.floor((Date.now() - d) / 1000));
    if (s < 60) return ar ? `منذ ${s} ث` : `${s}s ago`;
    if (s < 3600) return ar ? `منذ ${Math.floor(s / 60)} د` : `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return ar ? `منذ ${Math.floor(s / 3600)} س` : `${Math.floor(s / 3600)}h ago`;
    return ar ? `منذ ${Math.floor(s / 86400)} يوم` : `${Math.floor(s / 86400)}d ago`;
  } catch {
    return '';
  }
}

// ---------- Thumb ----------
function Thumb({ sub, className, priority = false }: { sub: WallItem; className?: string; priority?: boolean }) {
  if (sub.posterUrl) {
    return (
      <img
        src={sub.posterUrl}
        alt={sub.caption || sub.name}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'low'}
        decoding="async"
        className={`w-full h-full object-cover ${className || ''}`}
      />
    );
  }
  return (
    <div className={`w-full h-full flex flex-col items-center justify-center gap-2 ${className || ''}`}
      style={{ background: 'linear-gradient(135deg, rgba(45,27,20,0.9), rgba(14,10,8,0.95))' }}>
      <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'rgba(217,164,65,0.6)' }}>
        FIRAS
      </span>
    </div>
  );
}

// ---------- CardMedia (hover video, aspect-ratio ديناميكي) ----------
function CardMedia({ sub, priority }: { sub: WallItem; priority?: boolean }) {
  const [showVideo, setShowVideo] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [broken, setBroken] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideo = sub.mediaType === 'video' && !!sub.mediaUrl && !broken;

  const start = useCallback(() => {
    if (!hoverCapable() || !isVideo) return;
    setShowVideo(true);
    requestAnimationFrame(() => {
      videoRef.current?.play().catch(() => {});
    });
  }, [isVideo]);
  const stop = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  return (
    <div
      className="relative w-full overflow-hidden bg-black/50"
      style={{ aspectRatio: `${mediaRatio(sub)}` }}
      onMouseEnter={start}
      onMouseLeave={stop}
      onTouchStart={() => setShowVideo(false)}
    >
      {isVideo && showVideo ? (
        <video
          ref={videoRef}
          src={sub.mediaUrl ?? undefined}
          muted loop playsInline preload="metadata"
          poster={sub.posterUrl ?? undefined}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onError={() => setBroken(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <Thumb sub={sub} priority={priority} className="transition-transform duration-700 group-hover:scale-110" />
      )}
      {buffering && (
        <span className="absolute inset-0 m-auto w-8 h-8 rounded-full border-2 border-[#D9A441]/30 border-t-[#F5D489] animate-spin" />
      )}
      <div className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.1), transparent)' }} />
      {isVideo && !showVideo && (
        <span className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-black/40 backdrop-blur border border-[#D9A441]/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <svg className="w-5 h-5 text-white fill-current translate-x-[1px]" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        </span>
      )}
      {isVideo && (
        <span className="absolute top-3 left-3 h-7 inline-flex items-center gap-1 px-2.5 rounded-full bg-black/50 backdrop-blur border border-[#D9A441]/30 text-[9px] font-black tracking-[0.18em] text-[#F5D489]">
          VIDEO
        </span>
      )}
    </div>
  );
}

// ---------- WallCard ----------
function WallCard({
  sub, index, priority, liked, likesOverride, reported, onOpen, onToggleLike, onReport, onShare, ar,
}: {
  sub: WallItem; index: number; priority?: boolean; liked: boolean; likesOverride: number | null;
  reported: boolean; onOpen: () => void; onToggleLike: () => void; onReport: () => void; onShare: () => void; ar: boolean;
}) {
  const likes = likesOverride ?? sub.likes;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
      className="group relative text-left w-full rounded-[22px] overflow-hidden transition-all duration-500 hover:-translate-y-1.5 border border-[rgba(217,164,65,0.14)] hover:border-[#D9A441]/50 cursor-pointer wall-enter"
      style={{
        background: 'linear-gradient(160deg, rgba(26,18,13,0.95), rgba(16,11,8,0.92))',
        boxShadow: '0 6px 22px rgba(0,0,0,0.4)',
        animationDelay: `${Math.min(index, 6) * 0.05}s`,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 14px 45px rgba(255,122,24,0.18), 0 0 60px rgba(217,164,65,0.08)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 22px rgba(0,0,0,0.4)'; }}
    >
      <CardMedia sub={sub} priority={priority} />
      {/* like */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleLike(); }}
        aria-label="like"
        className="absolute top-3 right-3 h-7 px-2.5 rounded-full bg-black/50 backdrop-blur border flex items-center gap-1.5 text-[11px] font-black transition-all active:scale-90"
        style={{ borderColor: liked ? 'rgba(255,92,61,0.7)' : 'rgba(255,255,255,0.15)', color: liked ? '#FF5C3D' : '#fff' }}
      >
        <svg className="w-3.5 h-3.5" fill={liked ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 20s-7.5-4.6-7.5-10.3C4.5 6.6 6.7 5 8.8 5c1.4 0 2.6.7 3.2 1.8C12.6 5.7 13.8 5 15.2 5c2.1 0 4.3 1.6 4.3 4.7C19.5 15.4 12 20 12 20z" />
        </svg>
        <span dir="ltr">{likes}</span>
      </button>
      {/* report */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onReport(); }}
        aria-label="report"
        title={reported ? (ar ? 'تم الإبلاغ' : 'Reported') : (ar ? 'إبلاغ' : 'Report')}
        className="absolute top-3 left-3 w-7 h-7 rounded-full bg-black/50 backdrop-blur border border-white/15 text-white/70 hover:text-white flex items-center justify-center transition-all active:scale-90"
        style={reported ? { borderColor: 'rgba(255,92,61,0.6)', color: '#FF5C3D' } : undefined}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
        </svg>
      </button>
      {/* share */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onShare(); }}
        aria-label="share"
        className="absolute bottom-3 right-3 w-7 h-7 rounded-full bg-black/50 backdrop-blur border border-white/15 text-white/70 hover:text-white flex items-center justify-center transition-all active:scale-90 opacity-0 group-hover:opacity-100"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.7 13.3a3 3 0 110-2.6m0 2.6l6.6 3.3m-6.6-6l6.6-3.3m0 0a3 3 0 105.4-2.7 3 3 0 00-5.4 2.7zm0 9.3a3 3 0 105.4 2.7 3 3 0 00-5.4-2.7z" />
        </svg>
      </button>
      {/* body */}
      <div className="p-4">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#D9A441] truncate" dir="ltr">@{sub.name}</p>
        {sub.caption && (
          <p className="text-[13.5px] leading-relaxed clamp-2 min-h-[2.6em] mt-1" style={{ color: 'rgba(247,243,238,0.7)' }}>
            {sub.caption}
          </p>
        )}
        <p className="text-[10.5px] uppercase tracking-[0.15em] mt-1.5" style={{ color: 'rgba(247,243,238,0.25)' }}>
          {timeAgo(sub.createdAt, ar)}
        </p>
      </div>
    </div>
  );
}

// ---------- Lightbox ----------
function Lightbox({ sub, onClose, liked, onToggleLike, onShare, ar }: {
  sub: WallItem; onClose: () => void; liked: boolean; onToggleLike: () => void; onShare: () => void; ar: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => { window.removeEventListener('keydown', fn); };
  }, [onClose]);
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6 pt-24 sm:pt-28 pb-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-full flex flex-col rounded-[22px] border border-[#D9A441]/30 overflow-hidden my-auto"
        style={{ background: 'linear-gradient(160deg, rgba(26,18,13,0.98), rgba(16,11,8,0.97))' }}>
        {/* الوسائط — كاملة داخل الشاشة دائماً وبدون خلفية سوداء */}
        <div className="relative flex items-center justify-center shrink min-h-0" style={{ maxHeight: '62dvh' }}>
          {sub.mediaType === 'video' ? (
            <>
              <video ref={videoRef} src={sub.mediaUrl} autoPlay muted loop playsInline preload="auto"
                poster={sub.posterUrl || undefined}
                onClick={togglePlay}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                className="max-w-full w-auto h-auto object-contain cursor-pointer" style={{ maxHeight: '62dvh' }} />
              {/* زرّان فقط: تشغيل/إيقاف + صوت */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-2 py-2 rounded-full bg-black/65 backdrop-blur border border-[#D9A441]/45 shadow-[0_8px_28px_rgba(0,0,0,0.6)]">
                <button type="button" onClick={togglePlay} aria-label={playing ? 'pause' : 'play'}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-black transition-transform active:scale-90 hover:brightness-110"
                  style={{ background: 'linear-gradient(180deg, #FFF3D6, #C9A24B)' }}>
                  {playing ? (
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
                  ) : (
                    <svg className="w-4 h-4 fill-current translate-x-[1px]" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  )}
                </button>
                <button type="button" onClick={toggleMute} aria-label={muted ? 'unmute' : 'mute'}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-[#F0DDAE] border border-white/20 bg-white/[0.06] hover:border-[#D9A441]/60 transition-all active:scale-90">
                  {muted ? (
                    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5 6 9H2v6h4l5 4V5zm11.7 3.3a1 1 0 010 1.4l-2.1 2.1 2.1 2.1a1 1 0 01-1.4 1.4l-2.1-2.1-2.1 2.1a1 1 0 01-1.4-1.4l2.1-2.1-2.1-2.1a1 1 0 011.4-1.4l2.1 2.1 2.1-2.1a1 1 0 011.4 0z" />
                    </svg>
                  ) : (
                    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5 6 9H2v6h4l5 4V5zm15.5 7a4.5 4.5 0 00-2.5-4M19 5.5a9 9 0 010 13" />
                    </svg>
                  )}
                </button>
              </div>
            </>
          ) : (
            <img src={sub.mediaUrl} alt={sub.caption || sub.name}
              className="max-w-full w-auto h-auto object-contain" style={{ maxHeight: '62dvh' }} />
          )}
        </div>
        <div className="p-4 sm:p-5 flex items-center gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#D9A441]" dir="ltr">@{sub.name}</p>
            {sub.caption && <p className="text-sm text-white/75 mt-1">{sub.caption}</p>}
          </div>
          <button type="button" onClick={onToggleLike}
            className="h-10 px-4 rounded-full border flex items-center gap-2 text-sm font-black active:scale-95 transition-all"
            style={{ borderColor: liked ? 'rgba(255,92,61,0.7)' : 'rgba(217,164,65,0.4)', color: liked ? '#FF5C3D' : '#F5D489', background: 'rgba(0,0,0,0.4)' }}>
            <svg className="w-4 h-4" fill={liked ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 20s-7.5-4.6-7.5-10.3C4.5 6.6 6.7 5 8.8 5c1.4 0 2.6.7 3.2 1.8C12.6 5.7 13.8 5 15.2 5c2.1 0 4.3 1.6 4.3 4.7C19.5 15.4 12 20 12 20z" />
            </svg>
            <span dir="ltr">{sub.likes}</span>
          </button>
          <button type="button" onClick={onShare}
            className="h-10 px-4 rounded-full border border-[#D9A441]/40 text-[#F5D489] text-sm font-black bg-black/40 active:scale-95 transition-all">
            {ar ? 'مشاركة' : 'Share'}
          </button>
          <button type="button" onClick={onClose}
            className="h-10 w-10 rounded-full border border-white/15 text-white/70 bg-black/40 active:scale-95">✕</button>
        </div>
      </div>
    </div>
  );
}

// ---------- ReportModal ----------
function ReportModal({ onClose, onSend, ar }: { onClose: () => void; onSend: (reason: string, details: string) => void; ar: boolean }) {
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const reasons = [
    { v: 'spam', ar: 'سبام / تكرار', en: 'Spam' },
    { v: 'abuse', ar: 'إساءة', en: 'Abuse' },
    { v: 'copyright', ar: 'حقوق', en: 'Copyright' },
    { v: 'nsfw', ar: 'محتوى غير لائق', en: 'NSFW' },
    { v: 'other', ar: 'أخرى', en: 'Other' },
  ];
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-[22px] border border-[#D9A441]/30 p-5"
        style={{ background: 'linear-gradient(160deg, rgba(26,18,13,0.98), rgba(16,11,8,0.97))' }}>
        <h3 className="font-black text-white text-lg">{ar ? 'الإبلاغ عن هذا المنشور' : 'Report this post'}</h3>
        <div className="grid gap-2 mt-4">
          {reasons.map((r) => (
            <button key={r.v} type="button" onClick={() => setReason(r.v)}
              className={`h-11 px-4 rounded-xl border text-sm font-bold text-start transition-all ${reason === r.v ? 'border-[#D9A441] text-[#F5D489] bg-[#D9A441]/10' : 'border-white/10 text-white/60'}`}>
              {ar ? r.ar : r.en}
            </button>
          ))}
        </div>
        <textarea value={details} onChange={(e) => setDetails(e.target.value.slice(0, 500))}
          rows={3} placeholder={ar ? 'تفاصيل إضافية (اختياري)' : 'Details (optional)'}
          className="mt-3 w-full rounded-xl bg-black/50 border border-white/10 text-white text-sm p-3 outline-none focus:border-[#D9A441]/60" />
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={() => onSend(reason, details)}
            className="flex-1 h-11 rounded-xl font-black text-sm text-black"
            style={{ background: 'linear-gradient(180deg, #F0DDAE, #C9A24B)' }}>
            {ar ? 'إرسال البلاغ' : 'Send report'}
          </button>
          <button type="button" onClick={onClose} className="h-11 px-5 rounded-xl border border-white/15 text-white/70 text-sm font-bold">
            {ar ? 'إلغاء' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Upload ----------
function UploadBox({ ar, onDone }: { ar: boolean; onDone: () => void }) {
  const [name, setName] = useState('');
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [done, setDone] = useState<null | { kind: 'image' | 'video' }>(null);

  const pick = (f: File | null) => {
    setFile(f);
    setMsg(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const resetAll = () => {
    setName('');
    setCaption('');
    pick(null);
    setDone(null);
  };

  const submit = async () => {
    if (busy || !file) return;
    if (name.trim().length < 2) {
      setMsg({ ok: false, t: ar ? 'اكتب اسمك (حرفان على الأقل)' : 'Enter your name (2+ chars)' });
      return;
    }
    const kind: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
    setBusy(true);
    setMsg(null);
    try {
      const j = await uploadToWall(file, name.trim(), caption.trim());
      if (j?.ok) {
        setDone({ kind });
        setName('');
        setCaption('');
        pick(null);
        onDone();
      } else {
        const code = String((j as any)?.error || 'unknown');
        try {
          console.error('[gallery-upload]', code, (j as any)?.details || j);
        } catch { /* ignore */ }
        const map: Record<string, string> = {
          missing_file: ar ? 'لم يتم اختيار ملف — اختر صورة أو فيديو أولاً' : 'No file selected',
          file_too_large: ar ? 'الملف كبير جداً (الحد 30MB)' : 'File too large (30MB max)',
          unsupported_type: ar ? 'نوع غير مدعوم — فقط صور وفيديو' : 'Images & videos only',
          name_too_short: ar ? 'اكتب اسمك (حرفان على الأقل)' : 'Name too short',
          supabase_not_configured: ar ? 'قاعدة البيانات غير مُعدّة على هذه الاستضافة — أضف متغيرات البيئة' : 'Database not configured on this host',
          imagekit_not_configured: ar ? 'التخزين غير مُعد على هذه الاستضافة — أضف مفاتيح ImageKit' : 'Storage not configured on this host',
          all_imagekit_failed: ar ? 'تعذّر الاتصال بالتخزين — حاول بعد قليل' : 'Storage unreachable — try later',
          db_insert_failed: ar ? 'تعذّر الحفظ في قاعدة البيانات — نفّذ ملف supabase-gallery.sql أولاً' : 'DB save failed — run supabase-gallery.sql first',
        };
        setMsg({ ok: false, t: map[code] || (ar ? `تعذّر الرفع (${code}) — حاول مجدداً` : `Upload failed (${code})`) });
      }
    } catch {
      setMsg({ ok: false, t: ar ? 'تعذّر الرفع — تحقق من الاتصال' : 'Upload failed — check connection' });
    } finally {
      setBusy(false);
    }
  };

  // ===== واجهة النجاح: تم الرفع للإدارة =====
  if (done) {
    return (
      <div className="relative rounded-[26px] border border-emerald-400/30 overflow-hidden up-pop"
        style={{ background: 'linear-gradient(165deg, rgba(20,40,28,0.95), rgba(10,14,8,0.95))' }}>
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-emerald-300/80 to-transparent" />
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-emerald-400/15 blur-[90px] pointer-events-none" aria-hidden="true" />
        <div className="relative p-6 sm:p-8 text-center">
          <span className="relative mx-auto w-20 h-20 rounded-full flex items-center justify-center" aria-hidden="true">
            <span className="absolute inset-0 rounded-full border-2 border-emerald-300/60 up-ring" />
            <span className="absolute inset-0 rounded-full bg-emerald-400/15 blur-md" />
            <svg className="relative w-9 h-9 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <h3 className="mt-4 text-xl sm:text-2xl font-black text-white">
            {ar ? 'تم الرفع للإدارة ✅' : 'Sent to moderation ✅'}
          </h3>
          <p className="mt-2 text-[13.5px] text-white/65 font-medium leading-relaxed max-w-md mx-auto">
            {ar
              ? (done.kind === 'video'
                ? 'الآن الإدارة تتحقق من الفيديو حقك — وبعد الموافقة يظهر في الجدار للجميع'
                : 'الآن الإدارة تتحقق من الصورة حقتك — وبعد الموافقة تظهر في الجدار للجميع')
              : 'The team is now reviewing your upload — it will shine on the wall after approval'}
          </p>
          <div className="mt-5 flex items-center justify-center gap-2.5 flex-wrap">
            <button type="button" onClick={resetAll}
              className="min-h-[48px] px-6 rounded-2xl font-black text-black text-sm transition-transform active:scale-[0.98] hover:brightness-110"
              style={{ background: 'linear-gradient(180deg, #FFF3D6 0%, #E8D5A8 30%, #C9A24B 70%, #8A6A3A 100%)' }}>
              {ar ? 'رفع آخر' : 'Upload another'}
            </button>
            <a href="#wall"
              className="min-h-[48px] px-6 rounded-2xl font-black text-[#F0DDAE] text-sm inline-flex items-center border border-[#C9A24B]/40 bg-black/40 hover:bg-[#C9A24B]/10 transition-colors">
              {ar ? 'تصفح الجدار' : 'Browse wall'}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-[26px] border border-[#C9A24B]/25 overflow-hidden"
      style={{ background: 'linear-gradient(165deg, #17100A 0%, #0E0A06 50%, #0B0805 100%)' }}>
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-[#C9A24B]/80 to-transparent" />
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <img src="/firas-mark.webp" alt="" className="w-11 h-11 object-contain" loading="lazy" />
          <div>
            <h3 className="font-black text-white text-lg leading-tight">{ar ? 'ارفع إبداعك' : 'Share your edit'}</h3>
            <p className="text-[12px] text-white/50 font-medium">{ar ? 'صورة أو فيديو — تظهر بعد موافقة الإدارة' : 'Photo or video — appears after approval'}</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-2.5 mt-4">
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))}
            placeholder={ar ? 'اسمك *' : 'Your name *'}
            className="h-12 px-4 rounded-xl bg-black/50 border border-white/10 text-white text-sm outline-none focus:border-[#D9A441]/60 placeholder:text-white/30" />
          <input value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 300))}
            placeholder={ar ? 'وصف قصير (اختياري)' : 'Short caption (optional)'}
            className="h-12 px-4 rounded-xl bg-black/50 border border-white/10 text-white text-sm outline-none focus:border-[#D9A441]/60 placeholder:text-white/30" />
        </div>
        <label className="mt-2.5 flex items-center justify-center gap-3 min-h-[120px] rounded-2xl border-2 border-dashed border-[#C9A24B]/30 bg-black/30 cursor-pointer hover:border-[#C9A24B]/60 transition-colors overflow-hidden relative">
          <input type="file" accept="image/*,video/*" className="hidden"
            onChange={(e) => pick(e.target.files?.[0] || null)} />
          {preview && file ? (
            file.type.startsWith('video/') ? (
              <video src={preview} className="absolute inset-0 w-full h-full object-cover opacity-60" muted playsInline preload="metadata" />
            ) : (
              <img src={preview} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
            )
          ) : null}
          <span className="relative text-sm font-black text-[#F0DDAE] bg-black/60 border border-[#C9A24B]/40 rounded-full px-5 py-2.5 backdrop-blur">
            {file ? (ar ? 'تغيير الملف' : 'Change file') : (ar ? 'اختر صورة / فيديو' : 'Pick photo / video')}
          </span>
        </label>
        {file && <p className="text-[11px] text-white/40 mt-2 truncate" dir="ltr">{file.name} • {(file.size / 1048576).toFixed(1)}MB</p>}
        <button type="button" onClick={submit} disabled={busy || !file}
          className="mt-3 w-full min-h-[52px] rounded-2xl font-black text-black text-[15px] disabled:opacity-40 transition-all active:scale-[0.99]"
          style={{ background: 'linear-gradient(180deg, #FFF3D6 0%, #E8D5A8 30%, #C9A24B 70%, #8A6A3A 100%)' }}>
          {busy ? (ar ? 'جاري الرفع…' : 'Uploading…') : (ar ? 'رفع الآن' : 'Upload now')}
        </button>
        {msg && (
          <p className={`mt-3 text-[13px] font-bold rounded-xl px-4 py-3 border ${msg.ok ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10' : 'text-red-300 border-red-400/30 bg-red-400/10'}`}>
            {msg.ok ? `✅ ${msg.t}` : msg.t}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------- Main section ----------
export const GallerySection: React.FC<{ lang: Language }> = ({ lang }) => {
  const ar = lang === 'ar';
  const [items, setItems] = useState<WallItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<'balanced' | 'newest' | 'top'>('balanced');
  const [videosOnly, setVideosOnly] = useState(false);
  const [selected, setSelected] = useState<WallItem | null>(null);
  const [reportFor, setReportFor] = useState<WallItem | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('firas_gallery_liked') || '[]'));
    } catch {
      return new Set();
    }
  });
  const [likesOv, setLikesOv] = useState<Record<string, number>>({});
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const columns = useColumnCount();

  const load = useCallback(async () => {
    try {
      const w = await fetchWall('newest', false);
      setItems(w);
    } catch { /* keep old */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 45000);
    return () => clearInterval(t);
  }, [load]);

  // deep-link: #gallery-<id>
  useEffect(() => {
    const h = window.location.hash;
    if (h.startsWith('#gallery-') && items.length) {
      const id = h.replace('#gallery-', '');
      const f = items.find((x) => x.id === id);
      if (f) setSelected(f);
    }
  }, [items]);

  const ordered = useMemo(() => {
    const src = videosOnly ? items.filter((s) => s.mediaType === 'video') : items;
    if (sort === 'newest') return [...src].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (sort === 'top') return [...src].sort((a, b) => b.likes - a.likes);
    const rnd = mulberry32(hashIds(src));
    const arr = [...src];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [items, sort, videosOnly]);

  const packed = useMemo(() => packColumns(ordered, columns), [ordered, columns]);

  const onToggleLike = async (sub: WallItem) => {
    const liked = likedIds.has(sub.id);
    const next = new Set(likedIds);
    if (liked) next.delete(sub.id);
    else next.add(sub.id);
    setLikedIds(next);
    try {
      localStorage.setItem('firas_gallery_liked', JSON.stringify([...next]));
    } catch { /* ignore */ }
    setLikesOv((p) => ({ ...p, [sub.id]: Math.max(0, sub.likes + (liked ? -1 : 1)) }));
    try {
      const { data }: any = await toggleLike(sub, liked);
      if (typeof data?.likes === 'number') setLikesOv((p) => ({ ...p, [sub.id]: data.likes }));
    } catch { /* optimistic */ }
  };

  const sortBtn = (v: typeof sort, label: string) => (
    <button key={v} type="button" onClick={() => setSort(v)}
      className={`h-10 px-4 rounded-full text-[12px] font-black tracking-wide transition-all active:scale-95 ${sort === v ? 'text-black shadow-[0_8px_24px_rgba(201,162,75,0.35)]' : 'text-white/55 hover:text-[#F0DDAE] hover:bg-white/[0.05]'}`}
      style={sort === v ? { background: 'linear-gradient(180deg, #FFF3D6, #C9A24B)' } : { background: 'transparent' }}>
      {label}
    </button>
  );

  return (
    <section id="gallery-page" className="pt-2 md:pt-3 scroll-mt-28">
      <style>{`
        .wall-enter{opacity:0;transform:translateY(30px);animation:wallIn 0.55s cubic-bezier(0.22,1,0.36,1) forwards}
        @keyframes wallIn{to{opacity:1;transform:translateY(0)}}
        .gallery-hero-fallback{background-image:url('/bg-content.png');background-size:cover;background-position:center 30%}
        @keyframes upPop{0%{opacity:0;transform:scale(0.92) translateY(14px)}100%{opacity:1;transform:scale(1) translateY(0)}}
        .up-pop{animation:upPop 0.55s cubic-bezier(0.22,1,0.36,1) both}
        @keyframes upRing{0%{transform:scale(0.7);opacity:0}35%{opacity:1}100%{transform:scale(1.35);opacity:0}}
        .up-ring{animation:upRing 1.8s ease-out infinite}
        @keyframes logoHalo{to{transform:rotate(360deg)}}
        .logo-halo{animation:logoHalo 18s linear infinite}
      `}</style>

      {/* ===== HERO — البانر الجديد + اللوجو الدائري المؤطر (المحتوى داخل الدائرة) ===== */}
      <div className="relative overflow-hidden rounded-[28px] border border-[#C9A24B]/25">
        <div className="absolute inset-0 gallery-hero-fallback" aria-hidden="true" />
        <img src="/34956789403.png" alt="" aria-hidden="true" loading="eager" fetchPriority="high"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: 'center 42%', filter: 'brightness(1.07) saturate(1.06)' }} />
        <div className="absolute inset-0" aria-hidden="true"
          style={{ background: 'radial-gradient(ellipse 52% 66% at 50% 44%, transparent 38%, rgba(11,9,6,0.22) 70%, rgba(11,9,6,0.58) 100%)' }} />
        <div className="absolute inset-x-0 bottom-0 h-40 pointer-events-none" aria-hidden="true"
          style={{ background: 'linear-gradient(to top, rgba(11,9,6,0.75), transparent)' }} />
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-[#C9A24B] to-transparent" aria-hidden="true" />
        <div className="relative min-h-[430px] sm:min-h-[480px] flex flex-col items-center justify-center text-center p-6 sm:p-10 pb-16 sm:pb-20">
          <span className="relative block w-20 h-20 sm:w-24 sm:h-24" aria-hidden="true">
            <span className="logo-halo absolute -inset-2 rounded-full pointer-events-none"
              style={{
                background: 'conic-gradient(from 0deg, transparent 0 55%, rgba(217,192,138,0.95) 72%, rgba(138,106,58,0.9) 82%, rgba(217,192,138,0.15) 90%, transparent 100%)',
                WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), black calc(100% - 3px))',
                mask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), black calc(100% - 3px))',
              }} />
            <span className="absolute inset-0 rounded-full border-2 border-[#8A6A3A]/80 shadow-[0_0_30px_rgba(201,162,75,0.45),inset_0_0_18px_rgba(0,0,0,0.7)]" />
            <span className="absolute inset-[5px] rounded-full overflow-hidden bg-black/60 backdrop-blur-[1px] border border-[#D9C08A]/30">
              <img src="/firas-mark.webp" alt="Firas logo"
                className="absolute inset-0 w-full h-full object-cover scale-110"
                style={{ filter: 'drop-shadow(0 4px 18px rgba(201,162,75,0.65))' }} />
            </span>
          </span>
          <p className="mt-4 text-[10px] font-black tracking-[0.35em] text-[#D9C08A]/90 uppercase" dir="ltr"
            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}>FIRAS • EDITS WALL</p>
          <h2 className="mt-1 text-2xl sm:text-4xl font-black text-white leading-tight"
            style={{ textShadow: '0 3px 24px rgba(0,0,0,0.9)' }}>
            {ar ? 'معرض الصور والفيديو' : 'Photo & Video Wall'}
          </h2>
          <p className="mt-1.5 text-xs sm:text-[13px] text-white/70 font-medium max-w-md mx-auto"
            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}>
            {ar
              ? 'جدار إبداعات المتابعين — ارفع صورتك أو الفيديو، وبعد موافقة الإدارة يظهر هنا للجميع'
              : 'Community edits wall — upload your photo or video, it appears here after approval'}
          </p>
          <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black px-3.5 py-1.5 rounded-full bg-black/55 backdrop-blur border border-[#C9A24B]/40 text-[#F0DDAE]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C9A24B] animate-pulse" />
              <span dir="ltr">{items.length}</span> {ar ? 'منشور معتمد' : 'approved'}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black px-3.5 py-1.5 rounded-full bg-black/55 backdrop-blur border border-white/10 text-white/60">
              {ar ? 'تحديث تلقائي كل 45 ثانية' : 'Auto-refresh 45s'}
            </span>
          </div>
        </div>
      </div>

      {/* ===== Upload + How it works ===== */}
      <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-3 md:gap-4 mt-3 md:mt-4">
        <UploadBox ar={ar} onDone={load} />
        <div className="relative rounded-[26px] border border-white/10 bg-white/[0.03] p-5 sm:p-6 overflow-hidden">
          <div className="absolute -top-16 start-1/4 w-64 h-64 rounded-full bg-[#C9A24B]/[0.08] blur-[80px] pointer-events-none" />
          <h3 className="font-black text-white">{ar ? 'كيف يعمل المعرض؟' : 'How it works'}</h3>
          <ol className="mt-3 space-y-2.5 text-[13px] text-white/60 font-medium">
            {[
              ar ? '1. ارفع صورتك أو الفيديو مع اسمك' : '1. Upload your photo or video with your name',
              ar ? '2. تظهر لك رسالة: تم رفع صورتك بنجاح' : '2. You get: upload successful',
              ar ? '3. تصل للإدارة (قسم الانتظار) للمراجعة' : '3. It lands in admin review (pending)',
              ar ? '4. بعد القبول تظهر في الجدار للجميع مع لايك ومشاركة' : '4. Once approved it shines on the wall',
            ].map((s) => (
              <li key={s} className="flex gap-2.5 items-start">
                <span className="mt-0.5 w-5 h-5 rounded-lg bg-[#C9A24B]/15 border border-[#C9A24B]/30 text-[#D9C08A] text-[10px] font-black flex items-center justify-center shrink-0">✓</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex items-center gap-2">
            <img src="/firas-f.png" alt="" className="w-9 h-9 object-contain opacity-80" loading="lazy" />
            <p className="text-[11px] text-white/35 font-bold">POWERED BY HSG • FIRAS WALL</p>
          </div>
        </div>
      </div>

      {/* ===== Wall toolbar ===== */}
      <div className="mt-5 flex items-center gap-2 flex-wrap">
        {sortBtn('balanced', ar ? 'متوازن' : 'Balanced')}
        {sortBtn('newest', ar ? 'الأحدث' : 'Newest')}
        {sortBtn('top', ar ? 'الأكثر إعجاباً' : 'Most liked')}
        <button type="button" onClick={() => setVideosOnly((v) => !v)}
          className={`h-10 px-4 rounded-full text-[12px] font-black transition-all active:scale-95 ${videosOnly ? 'text-black shadow-[0_8px_24px_rgba(201,162,75,0.35)]' : 'text-white/55 hover:text-[#F0DDAE] hover:bg-white/[0.05]'}`}
          style={videosOnly ? { background: 'linear-gradient(180deg, #FFF3D6, #C9A24B)' } : { background: 'transparent' }}>
          {ar ? 'فيديو فقط' : 'Videos only'}
        </button>
        <button type="button" onClick={load} className="ms-auto h-10 px-4 rounded-full text-[12px] font-black text-white/55 hover:text-[#F0DDAE] hover:bg-white/[0.05] transition-all flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
          {ar ? 'تحديث' : 'Refresh'}
        </button>
      </div>

      {/* ===== Wall (max-w-6xl + flex starters) ===== */}
      <div id="wall" className="max-w-6xl mx-auto mt-3 scroll-mt-24">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-[22px] border border-white/10 bg-white/[0.03] animate-pulse" style={{ height: 220 + (i % 3) * 60 }} />
            ))}
          </div>
        ) : ordered.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-[#C9A24B]/30 p-10 text-center">
            <img src="/firas-mark.webp" alt="" className="mx-auto w-14 h-14 object-contain opacity-60" loading="lazy" />
            <p className="mt-3 font-black text-white">{ar ? 'كن أول من يضيء الجدار' : 'Be the first on the wall'}</p>
            <p className="text-[13px] text-white/45 mt-1">{ar ? 'ارفع صورتك من الأعلى وستظهر هنا بعد القبول' : 'Upload above — it appears here after approval'}</p>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            {packed.map((col, ci) => (
              <div key={ci} className="flex-1 min-w-0 flex flex-col gap-3">
                {col.map((sub, i) => (
                  <WallCard
                    key={sub.id}
                    sub={{ ...sub, likes: likesOv[sub.id] ?? sub.likes }}
                    index={i * columns + ci}
                    priority={i * columns + ci < columns * 2 + 2}
                    liked={likedIds.has(sub.id)}
                    likesOverride={likesOv[sub.id] ?? null}
                    reported={reportedIds.has(sub.id)}
                    onOpen={() => setSelected(sub)}
                    onToggleLike={() => onToggleLike(sub)}
                    onReport={() => setReportFor(sub)}
                    onShare={() => shareItem(sub)}
                    ar={ar}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <Lightbox
          sub={{ ...selected, likes: likesOv[selected.id] ?? selected.likes }}
          onClose={() => setSelected(null)}
          liked={likedIds.has(selected.id)}
          onToggleLike={() => onToggleLike(selected)}
          onShare={() => shareItem(selected)}
          ar={ar}
        />
      )}
      {reportFor && (
        <ReportModal
          ar={ar}
          onClose={() => setReportFor(null)}
          onSend={async (reason, details) => {
            const target = reportFor;
            setReportFor(null);
            try {
              await reportItem(target.id, reason, details);
              setReportedIds((p) => new Set(p).add(target.id));
            } catch { /* ignore */ }
          }}
        />
      )}
    </section>
  );
};
