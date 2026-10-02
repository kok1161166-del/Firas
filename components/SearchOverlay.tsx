import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Language } from '../types';
import { NAV_DEFS } from './SiteHeader';

interface SearchOverlayProps {
    lang: Language;
    clips: any[];
    videos: any[];
    onClose: () => void;
    onRefresh: () => void;
}

type Item = {
    key: string;
    kind: 'clip' | 'vod';
    title: string;
    thumb: string;
    url: string;
    views: number;
    durMs: number;
    date: string;
    hay: string;
};

const FALLBACK_THUMB = '/bg-pc.jpg';

// Arabic-friendly normalization: unify alef/hamza, strip diacritics, taa->haa
const norm = (s: unknown): string =>
    (typeof s === 'string' ? s : String(s ?? ''))
        .toLowerCase()
        .replace(/[ً-ٰٟـ]/g, '')
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .trim();

const compact = (v: number) => {
    const n = Number(v) || 0;
    return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`;
};

const fmtDur = (ms: number) => {
    const total = Math.floor((Number(ms) || 0) > 1000000 ? (Number(ms) || 0) / 1000 : (Number(ms) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const thumbOf = (v: any): string =>
    v?.thumbnail?.url || v?.thumbnail?.src ||
    (typeof v?.thumbnail === 'string' ? v.thumbnail : '') ||
    v?.thumbnail_url || FALLBACK_THUMB;

const CLIP_KEYS = ['clip', 'clips', 'كليب', 'مقطع', 'مقاطع', 'لقطه', 'لقطات', 'لقطة', 'شورت'];
const VOD_KEYS = ['vod', 'vods', 'فود', 'بث', 'بثوث', 'تسجيل', 'تسجيلات', 'ارشيف', 'مباشر', 'كامل', 'كامله', 'حلقه', 'حلقة'];

// Section fallback targets (mirrors SiteHeader smart targets)
const FALLBACK_TARGETS: Record<string, string[]> = {
    live: ['archive', 'clips'],
    archive: ['clips'],
};

export const SearchOverlay: React.FC<SearchOverlayProps> = ({ lang, clips, videos, onClose, onRefresh }) => {
    const isAr = lang === 'ar';
    const [query, setQuery] = useState('');
    const [tab, setTab] = useState<'all' | 'clip' | 'vod'>('all');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    }, [onClose]);

    const items = useMemo<Item[]>(() => {
        const list: Item[] = [];
        (Array.isArray(clips) ? clips : []).forEach((c: any, i: number) => {
            const title = c?.title || 'Clip';
            list.push({
                key: `clip-${c?.id ?? i}`,
                kind: 'clip',
                title,
                thumb: thumbOf(c),
                url: `https://kick.com/firas?clip=${c?.id ?? ''}`,
                views: Number(c?.view_count ?? 0),
                durMs: 0,
                date: c?.created_at || '',
                hay: norm([title, c?.creator?.username].join(' ')),
            });
        });
        (Array.isArray(videos) ? videos : []).forEach((v: any, i: number) => {
            if (!v) return;
            const title = v?.session_title || v?.title || 'Past Stream';
            const uuid = v?.uuid || v?.video?.uuid || v?.id;
            const cats = (v?.categories || []).map((c: any) => c?.name || c?.category?.name || '').join(' ');
            const tags = [...new Set((v?.categories || []).flatMap((c: any) => c?.tags || []))].join(' ');
            list.push({
                key: `vod-${v?.id ?? i}`,
                kind: 'vod',
                title,
                thumb: thumbOf(v),
                url: `https://kick.com/firas/videos/${uuid}`,
                views: Number(v?.views ?? v?.video?.views ?? 0),
                durMs: Number(v?.duration ?? 0),
                date: v?.created_at || '',
                hay: norm([title, cats, tags].join(' ')),
            });
        });
        return list;
    }, [clips, videos]);

    const nq = norm(query);
    const onlyClips = !!nq && CLIP_KEYS.some((k) => k.includes(nq) || nq.includes(k));
    const onlyVods = !!nq && !onlyClips && VOD_KEYS.some((k) => k.includes(nq) || nq.includes(k));

    const base = useMemo(() => items.filter((it) => {
        if (onlyClips && it.kind !== 'clip') return false;
        if (onlyVods && it.kind !== 'vod') return false;
        if (!nq) return true;
        if (onlyClips || onlyVods) return true;
        return it.hay.includes(nq);
    }), [items, nq, onlyClips, onlyVods]);

    const clipsCount = base.filter((i) => i.kind === 'clip').length;
    const vodsCount = base.filter((i) => i.kind === 'vod').length;
    const results = (tab === 'all' ? base : base.filter((i) => i.kind === tab)).slice(0, 10);
    const recent = nq ? [] : [...items.filter((i) => i.kind === 'clip').slice(0, 3), ...items.filter((i) => i.kind === 'vod').slice(0, 2)];

    const goSection = (id: string) => {
        const candidates = [id, ...(FALLBACK_TARGETS[id] ?? [])];
        for (const c of candidates) {
            const el = document.getElementById(c);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                try { window.history.replaceState(null, '', `#${el.id}`); } catch { /* noop */ }
                onClose();
                return;
            }
        }
        window.location.hash = `#${id}`;
        onClose();
    };

    const openItem = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
        onClose();
    };

    const T = {
        title: isAr ? 'البحث في المحتوى' : 'Search content',
        sub: isAr ? 'مقاطع • بثوث كاملة • لقطات' : 'Clips • full streams • highlights',
        ph: isAr ? 'دوّر على مقطع أو بث… جرّب: قراند' : 'Search clips & streams… try: GTA',
        all: isAr ? 'الكل' : 'All',
        clips: isAr ? 'مقاطع' : 'Clips',
        vods: isAr ? 'بثوث' : 'Streams',
        sections: isAr ? 'أقسام الموقع' : 'Sections',
        recent: isAr ? 'وصل حديثاً' : 'Fresh in',
        noRes: isAr ? 'ما لقينا شي بهالكلمة' : 'Nothing found for this word',
        tryOther: isAr ? 'جرّب كلمة ثانية — مثال: تحدي، قراند، ضحك' : 'Try another word — e.g. challenge, GTA, funny',
        noData: isAr ? 'لا توجد بيانات بعد — حدّث وجرب' : 'No data yet — refresh and retry',
        refresh: isAr ? 'تحديث' : 'Refresh',
        views: isAr ? 'مشاهدة' : 'views',
        res: isAr ? 'نتيجة' : 'results',
        close: isAr ? 'إغلاق' : 'Close',
    };

    const fmtDate = (d: string) => {
        if (!d) return '';
        try {
            return new Date(d).toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { day: 'numeric', month: 'short' });
        } catch { return ''; }
    };

    return (
        <div className={`fixed inset-0 z-[70] ${isAr ? 'font-arabic' : 'font-sans'}`} dir={isAr ? 'rtl' : 'ltr'} role="dialog" aria-modal="true" aria-label={T.title}>
            <style>{`
            @keyframes search-fade{from{opacity:0}to{opacity:1}}
            @keyframes sheet-in{0%{opacity:0;transform:translateY(-30px) scale(.985)}60%{opacity:1;transform:translateY(4px) scale(1.002)}100%{opacity:1;transform:none}}
            @keyframes search-pull{0%{opacity:0;transform:translateX(46px) scaleX(.72)}55%{opacity:1;transform:translateX(-5px) scaleX(1.015)}100%{opacity:1;transform:none}}
            @keyframes result-in{from{opacity:0;transform:translateY(14px) scale(.99)}to{opacity:1;transform:none}}
            @keyframes sweep{0%{transform:translateX(120%)}100%{transform:translateX(-120%)}}
            @keyframes glow-pulse{0%,100%{box-shadow:0 24px 70px -22px rgba(201,162,75,.35)}50%{box-shadow:0 24px 80px -18px rgba(201,162,75,.55)}}
            .search-fade{animation:search-fade .25s ease both}
            .search-sheet{animation:sheet-in .5s cubic-bezier(.16,1,.3,1) both;transform-origin:top center}
            .search-pull{animation:search-pull .6s cubic-bezier(.16,1,.3,1) .1s both;transform-origin:right center}
            [dir="ltr"] .search-pull{transform-origin:left center}
            .result-item{animation:result-in .45s cubic-bezier(.16,1,.3,1) both}
            .sweep-bar{animation:sweep 1.1s cubic-bezier(.4,0,.2,1) .35s both}
            .sheet-glow{animation:glow-pulse 3.5s ease-in-out 1s infinite}
            @media (prefers-reduced-motion: reduce){
              .search-fade,.search-sheet,.search-pull,.result-item,.sweep-bar,.sheet-glow{animation:none !important}
            }
            `}</style>

            <div className="search-fade absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

            <div className="relative h-full overflow-y-auto scrollbar-hide">
                <div className="max-w-[880px] mx-auto px-3 sm:px-4 pt-[104px] md:pt-[150px] pb-10">
                    <div className="search-sheet sheet-glow relative rounded-[26px] border border-[#C9A24B]/40 bg-[#0D0906]/[.98] overflow-hidden">
                        <div className="h-[2px] bg-gradient-to-l from-transparent via-[#F0DDAE] to-transparent" />
                        <div className="p-4 sm:p-6">

                            {/* header */}
                            <div className="flex items-center gap-3">
                                <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border border-[#C9A24B]/50 bg-gradient-to-b from-[#F0DDAE] via-[#C9A24B] to-[#8A6A3A] text-black shadow-[0_10px_26px_-8px_rgba(201,162,75,.7)]">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" /></svg>
                                </span>
                                <div className="min-w-0 flex-1">
                                    <h2 className="text-lg sm:text-xl font-black text-white leading-none">{T.title}</h2>
                                    <p className="text-[11px] text-[#D9C08A]/70 font-bold mt-1.5">{T.sub}</p>
                                </div>
                                <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1.5 rounded-lg bg-white/[0.05] border border-white/10 text-white/50" dir="ltr">
                                    <kbd className="font-black">ESC</kbd> {T.close}
                                </span>
                                <button type="button" onClick={onClose} aria-label={T.close}
                                    className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/10 text-white/60 hover:text-black hover:bg-[#D9C08A] hover:border-[#D9C08A] active:scale-95 transition-all flex items-center justify-center shrink-0">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                                </button>
                            </div>

                            {/* search bar — pulls in from the side */}
                            <div className="search-pull relative mt-4 rounded-2xl border border-[#C9A24B]/45 bg-black/60 overflow-hidden focus-within:border-[#F0DDAE] focus-within:shadow-[0_0_30px_rgba(201,162,75,.35)] transition-all">
                                <div className="flex items-center gap-2.5 ps-4 pe-2 py-2">
                                    <svg className="w-5 h-5 text-[#D9C08A] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" /></svg>
                                    <input
                                        ref={inputRef}
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder={T.ph}
                                        className="flex-1 min-w-0 bg-transparent text-white text-[15px] font-bold placeholder:text-white/30 placeholder:font-medium outline-none py-2.5"
                                    />
                                    {query && (
                                        <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label={T.close}
                                            className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/10 text-white/60 hover:text-black hover:bg-[#D9C08A] active:scale-95 transition-all flex items-center justify-center shrink-0">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                                        </button>
                                    )}
                                    <span className="hidden sm:inline-flex shrink-0 text-[11px] font-black px-4 py-2.5 rounded-xl text-black" style={{ background: 'linear-gradient(180deg,#F0DDAE,#C9A24B)' }} dir="ltr">
                                        {base.length} {T.res}
                                    </span>
                                </div>
                                <div className="h-[2px] bg-white/[0.06] overflow-hidden">
                                    <span className="sweep-bar block h-full w-1/3 rounded-full bg-gradient-to-l from-transparent via-[#F0DDAE] to-transparent" />
                                </div>
                            </div>

                            {/* tabs */}
                            <div className="flex items-center gap-2 mt-4">
                                {([
                                    { id: 'all', label: T.all, count: base.length },
                                    { id: 'clip', label: T.clips, count: clipsCount },
                                    { id: 'vod', label: T.vods, count: vodsCount },
                                ] as const).map((tb) => {
                                    const on = tab === tb.id;
                                    return (
                                        <button key={tb.id} type="button" onClick={() => setTab(tb.id)}
                                            className={`inline-flex items-center gap-1.5 text-[12px] font-black px-4 py-2 rounded-xl border transition-all active:scale-95 ${on ? 'bg-gradient-to-b from-[#F0DDAE] via-[#C9A24B] to-[#8A6A3A] text-black border-[#F0DDAE] shadow-[0_8px_22px_-8px_rgba(201,162,75,.7)]' : 'bg-white/[0.04] border-white/10 text-white/55 hover:text-white hover:border-[#C9A24B]/50'}`}>
                                            {tb.label}
                                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${on ? 'bg-black/25' : 'bg-white/[0.07]'}`} dir="ltr">{tb.count}</span>
                                        </button>
                                    );
                                })}
                                <button type="button" onClick={onRefresh} title={T.refresh}
                                    className="ms-auto inline-flex items-center gap-1.5 text-[11px] font-black px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white/55 hover:text-[#F0DDAE] hover:border-[#C9A24B]/50 active:scale-95 transition-all">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 4v5h.6m15.3 2A8 8 0 0 0 4.6 9m0 0H9m11 11v-5h-.6a8 8 0 0 1-15.3-2m15.3 2H15" /></svg>
                                    {T.refresh}
                                </button>
                            </div>

                            {/* content */}
                            {!nq && items.length === 0 && (
                                <p className="mt-6 text-center text-[13px] text-white/40 font-bold">{T.noData}</p>
                            )}

                            {!nq && (
                                <div className="mt-5">
                                    <p className="text-[10px] font-black tracking-[0.25em] text-white/35 uppercase mb-2.5">{T.sections}</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {NAV_DEFS.map((s, i) => (
                                            <button key={s.href} type="button" onClick={() => goSection(s.id)}
                                                style={{ animationDelay: `${Math.min(i * 45, 300)}ms` }}
                                                className="result-item inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white/70 text-[12px] font-black hover:text-black hover:bg-gradient-to-b hover:from-[#F0DDAE] hover:to-[#C9A24B] hover:border-[#F0DDAE] active:scale-95 transition-all text-start">
                                                <span className="opacity-70 shrink-0">{s.icon}</span>
                                                <span className="truncate">{isAr ? s.ar : s.en}</span>
                                            </button>
                                        ))}
                                    </div>

                                    {recent.length > 0 && (
                                        <>
                                            <p className="text-[10px] font-black tracking-[0.25em] text-white/35 uppercase mt-6 mb-2.5">{T.recent}</p>
                                            <div className="space-y-2">
                                                {recent.map((it, i) => (
                                                    <ResultRow key={it.key} item={it} index={i} lang={lang} viewsLabel={T.views} fmtDate={fmtDate} onOpen={openItem} />
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {nq && results.length === 0 && (
                                <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
                                    <p className="text-white/70 font-black text-[15px]">“{query}” — {T.noRes}</p>
                                    <p className="text-white/35 text-[12px] font-bold mt-2">{T.tryOther}</p>
                                </div>
                            )}

                            {nq && results.length > 0 && (
                                <div className="mt-4 space-y-2">
                                    {results.map((it, i) => (
                                        <ResultRow key={it.key} item={it} index={i} lang={lang} viewsLabel={T.views} fmtDate={fmtDate} onOpen={openItem} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ResultRow: React.FC<{
    item: Item;
    index: number;
    lang: Language;
    viewsLabel: string;
    fmtDate: (d: string) => string;
    onOpen: (url: string) => void;
}> = ({ item, index, lang, viewsLabel, fmtDate, onOpen }) => {
    const isClip = item.kind === 'clip';
    return (
        <button type="button" onClick={() => onOpen(item.url)}
            style={{ animationDelay: `${Math.min(index * 55, 440)}ms` }}
            className="result-item group w-full flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] hover:border-[#C9A24B]/60 hover:bg-[#C9A24B]/[0.06] hover:-translate-y-0.5 active:scale-[0.99] transition-all text-start">
            <span className="relative w-32 sm:w-40 aspect-video rounded-xl overflow-hidden shrink-0 bg-black border border-white/10 group-hover:border-[#C9A24B]/40 transition-colors">
                <img src={item.thumb} alt={item.title} loading="lazy" className="w-full h-full object-cover opacity-85 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                    onError={(e) => { const t = e.target as HTMLImageElement; if (!t.src.includes('bg-pc')) t.src = FALLBACK_THUMB; }} />
                <span className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <span className={`absolute top-1.5 start-1.5 text-[8px] font-black px-2 py-[3px] rounded-md ${isClip ? 'bg-[#C9A24B] text-black' : 'bg-black/75 text-[#F0DDAE] border border-[#C9A24B]/50'}`} dir="ltr">
                    {isClip ? 'CLIP' : 'VOD'}
                </span>
                {!isClip && item.durMs > 0 && (
                    <span className="absolute bottom-1.5 end-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-md bg-black/80 text-white" dir="ltr">{fmtDur(item.durMs)}</span>
                )}
                <span className="absolute inset-0 m-auto w-8 h-8 rounded-full bg-black/55 backdrop-blur border border-[#C9A24B]/60 flex items-center justify-center opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300">
                    <svg className="w-3.5 h-3.5 text-white fill-current translate-x-[1px] rtl:-translate-x-[1px]" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                </span>
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[13px] sm:text-sm font-black text-white leading-snug clamp-2 group-hover:text-[#F0DDAE] transition-colors">{item.title}</span>
                <span className="flex items-center gap-2 mt-1.5 text-[10px] sm:text-[11px] text-white/45 font-bold">
                    <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] border border-white/10 px-1.5 py-0.5" dir="ltr">{compact(item.views)} {viewsLabel}</span>
                    {fmtDate(item.date) && <span className="rounded-md bg-white/[0.06] border border-white/10 px-1.5 py-0.5 truncate">{fmtDate(item.date)}</span>}
                </span>
            </span>
            <span className="shrink-0 w-9 h-9 rounded-xl bg-white/[0.05] border border-white/10 hidden sm:flex items-center justify-center text-white/40 group-hover:text-black group-hover:bg-[#D9C08A] group-hover:border-[#D9C08A] transition-all">
                <svg className={`w-4 h-4 ${lang === 'ar' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </span>
        </button>
    );
};
