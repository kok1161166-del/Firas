import React, { useEffect, useState } from 'react';
import type { Language } from '../types';

interface SiteHeaderProps {
    lang: Language;
    onToggleLang: () => void;
    profileImage: string;
    headerTitle: string;
    isLive: boolean;
    viewers: number;
    statusText: string;
    onRefresh: () => void;
}

/* Every real section on the page — no search, just direct navigation */
const NAV_DEFS = [
    {
        href: '#top', id: 'top', ar: 'الرئيسية', en: 'Home',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h5v-6h4v6h5V9.5" /></svg>,
    },
    {
        href: '#socials', id: 'socials', ar: 'التواصل', en: 'Socials',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.8-3 2.9-4.5 5.5-4.5s4.7 1.5 5.5 4.5" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.6c2.3.2 3.9 1.6 4.5 4" /></svg>,
    },
    {
        href: '#live', id: 'live', ar: 'البث', en: 'Live',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="13" rx="3" /><path d="M10 9.5v5l4.5-2.5z" fill="currentColor" stroke="none" /><path d="M8 21h8" /></svg>,
    },
    {
        href: '#store', id: 'store', ar: 'المتجر', en: 'Store',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7.5 5.5 4h13L20 7.5" /><path d="M4 7.5h16v2.5c0 1.5-1.2 2.5-2.7 2.5-1.2 0-2-.7-2.3-1.7-.3 1-1.1 1.7-2.3 1.7s-2-1-2.3-2c-.3 1-1.1 1.7-2.3 1.7" /><path d="M5.5 12.5V20h13v-7.5" /><path d="M10 16h4" /></svg>,
    },
    {
        href: '#support', id: 'support', ar: 'الدعم', en: 'Support',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.3C4.5 6.6 6.7 5 8.8 5c1.4 0 2.6.7 3.2 1.8C12.6 5.7 13.8 5 15.2 5c2.1 0 4.3 1.6 4.3 4.7C19.5 15.4 12 20 12 20z" /></svg>,
    },
] as const;

/**
 * FIRAS top bar — "Aurora Dock" edition (fresh rebuild).
 * - No search: every page section is one tap away.
 * - Segmented-control nav with sliding gold active pill.
 * - Slim floating dock, gradient hairline, aurora glow, live-first brand.
 */
export const SiteHeader: React.FC<SiteHeaderProps> = ({
    lang, onToggleLang, profileImage, headerTitle, isLive, viewers, statusText, onRefresh,
}) => {
    const [open, setOpen] = useState(false);
    const [compact, setCompact] = useState(false);
    const [hash, setHash] = useState('');

    useEffect(() => {
        const onScroll = () => setCompact(window.scrollY > 32);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => {
        const read = () => setHash(window.location.hash);
        read();
        window.addEventListener('hashchange', read);
        return () => window.removeEventListener('hashchange', read);
    }, []);

    /* Active section spy across all five sections */
    useEffect(() => {
        const els = NAV_DEFS
            .map((n) => document.getElementById(n.id))
            .filter(Boolean) as HTMLElement[];
        if (!els.length || typeof IntersectionObserver === 'undefined') return;
        const obs = new IntersectionObserver(
            (entries) => entries.forEach((e) => { if (e.isIntersecting) setHash(`#${e.target.id}`); }),
            { rootMargin: '-30% 0px -60% 0px', threshold: 0.05 }
        );
        els.forEach((el) => obs.observe(el));
        return () => obs.disconnect();
    }, [isLive]);

    /* Escape closes the mobile menu */
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open ]);

    const isAr = lang === 'ar';
    const activeHash = hash === '' ? '#top' : hash;
    const viewersLabel = viewers > 0 ? viewers.toLocaleString('en-US') : '';

    const goTo = (id: string) => {
        setOpen(false);
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else window.location.hash = `#${id}`;
        (document.activeElement as HTMLElement | null)?.blur?.();
    };

    return (
        <>
            <style>{`
            .dock{--gold:#C9A24B;--gold-lt:#F4D98A;--gold-dk:#8A6A3A}
            .dock-shell{position:sticky;top:10px;z-index:60;width:min(1280px,calc(100% - 14px));margin:10px auto 0;
                animation:dock-in .6s cubic-bezier(.16,1,.3,1) both}
            @keyframes dock-in{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}
            /* gradient hairline wrapper */
            .dock-frame{border-radius:22px;padding:1px;
                background:linear-gradient(120deg,rgba(201,162,75,.55),rgba(201,162,75,.08) 25%,rgba(255,255,255,.14) 50%,rgba(201,162,75,.08) 75%,rgba(201,162,75,.55));
                box-shadow:0 24px 60px rgba(0,0,0,.55),0 0 32px -12px rgba(201,162,75,.35)}
            .dock-bar{position:relative;border-radius:21px;overflow:hidden;
                background:linear-gradient(180deg,rgba(26,20,10,.9),rgba(9,6,3,.92));
                backdrop-filter:blur(22px) saturate(1.25);-webkit-backdrop-filter:blur(22px) saturate(1.25)}
            /* aurora wash + top light line */
            .dock-aurora{position:absolute;inset:0;pointer-events:none;
                background:radial-gradient(420px 120px at 12% -20%,rgba(244,217,138,.14),transparent 65%),
                           radial-gradient(420px 130px at 88% -25%,rgba(83,252,24,.06),transparent 65%)}
            .dock-bar::before{content:"";position:absolute;top:0;left:8%;right:8%;height:1px;border-radius:99px;
                background:linear-gradient(90deg,transparent,rgba(255,246,216,.85),transparent);pointer-events:none}
            .dock-row{display:flex;align-items:center;gap:10px;min-height:68px;padding:8px 10px;transition:min-height .25s ease}
            .dock-shell.is-compact .dock-row{min-height:58px}
            @media(min-width:768px){.dock-row{padding:8px 16px;gap:12px}}
            /* brand */
            .dock-brand{display:flex;align-items:center;gap:11px;text-decoration:none;min-width:0;flex:none}
            .dock-emblem{position:relative;width:46px;height:46px;flex:none;border-radius:15px;overflow:visible;
                border:1px solid rgba(244,217,138,.5);background:#0a0806;
                box-shadow:0 10px 26px -10px rgba(201,162,75,.7),inset 0 1px 0 rgba(255,255,255,.12);
                transition:transform .22s ease,box-shadow .22s ease}
            .dock-shell.is-compact .dock-emblem{width:40px;height:40px}
            .dock-brand:hover .dock-emblem{transform:translateY(-1px);box-shadow:0 14px 30px -10px rgba(201,162,75,.85),inset 0 1px 0 rgba(255,255,255,.12)}
            .dock-emblem img{width:100%;height:100%;object-fit:cover;border-radius:14px;display:block}
            .dock-dot{position:absolute;bottom:-4px;inset-inline-end:-4px;width:15px;height:15px;border-radius:99px;
                border:3px solid #100c07;background:#8a7a55;z-index:2}
            .dock-dot.on{background:#53FC18;box-shadow:0 0 0 3px rgba(83,252,24,.18),0 0 12px #53FC18;animation:dock-pulse 1.8s ease-in-out infinite}
            @keyframes dock-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
            .dock-word{display:flex;flex-direction:column;line-height:1.1;min-width:0}
            .dock-word b{font-size:20px;font-weight:900;letter-spacing:.12em;color:#FFF6DE;
                text-shadow:0 2px 12px rgba(201,162,75,.35)}
            .dock-shell.is-compact .dock-word b{font-size:17px}
            .dock-live{display:inline-flex;align-items:center;gap:6px;margin-top:4px;font-size:10px;font-weight:800;white-space:nowrap}
            .dock-live i{width:6px;height:6px;border-radius:99px;background:#8a7a55;flex:none}
            .dock-live.on{color:#53FC18}.dock-live.on i{background:#53FC18;box-shadow:0 0 8px #53FC18;animation:dock-pulse 1.6s ease-in-out infinite}
            .dock-live.off{color:rgba(217,192,138,.8)}
            /* segmented nav — the modern core */
            .dock-nav{flex:1;min-width:0;display:none;align-items:center;justify-content:center}
            @media(min-width:1024px){.dock-nav{display:flex}}
            .dock-seg{display:flex;align-items:center;gap:2px;padding:4px;border-radius:99px;max-width:100%;
                background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);
                box-shadow:inset 0 2px 10px rgba(0,0,0,.5)}
            .dock-link{display:inline-flex;align-items:center;gap:7px;padding:9px 15px;border-radius:99px;
                font-size:13px;font-weight:800;color:rgba(255,255,255,.6);text-decoration:none;white-space:nowrap;
                transition:color .2s ease,background .2s ease,transform .2s ease}
            .dock-link:hover{color:#FFF3D6;background:rgba(255,255,255,.05)}
            .dock-link:active{transform:scale(.96)}
            .dock-link.is-active{color:#0B0906;background:linear-gradient(180deg,#F8EDD2,#E6C477 45%,#C9A24B);
                box-shadow:0 6px 18px -6px rgba(201,162,75,.8),inset 0 1px 0 rgba(255,255,255,.6)}
            @media(min-width:1024px) and (max-width:1279px){.dock-link{padding:8px 11px;font-size:12px;gap:5px}}
            /* actions */
            .dock-actions{flex:none;display:flex;align-items:center;gap:8px;margin-inline-start:auto}
            .dock-iconbtn{width:44px;height:44px;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:14px;
                background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.75);
                cursor:pointer;transition:all .2s ease}
            .dock-iconbtn:hover{color:#F4D98A;border-color:rgba(244,217,138,.5);background:rgba(201,162,75,.1);transform:translateY(-1px)}
            .dock-iconbtn:active{transform:scale(.95)}
            .dock-lang{height:44px;padding:0 14px;border-radius:14px;display:none;align-items:center;gap:7px;
                background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#F0DDAE;
                font-size:12.5px;font-weight:800;cursor:pointer;transition:all .2s ease;white-space:nowrap;font-family:inherit}
            @media(min-width:1024px){.dock-lang{display:inline-flex}}
            .dock-lang:hover{border-color:rgba(244,217,138,.55);background:rgba(201,162,75,.12);transform:translateY(-1px)}
            .dock-cta{display:none;align-items:center;gap:8px;height:44px;padding:0 18px;border-radius:14px;text-decoration:none;
                background:linear-gradient(180deg,#F8EDD2 0%,#E6C477 45%,#C9A24B 80%);color:#0B0906;font-size:13px;font-weight:900;
                box-shadow:0 10px 26px -8px rgba(201,162,75,.7),inset 0 1px 0 rgba(255,255,255,.6);
                transition:filter .2s ease,transform .2s ease;white-space:nowrap}
            @media(min-width:768px){.dock-cta{display:inline-flex}}
            .dock-cta:hover{filter:brightness(1.06);transform:translateY(-1px)}
            .dock-cta:active{transform:scale(.97)}
            .dock-cta .play{width:22px;height:22px;border-radius:99px;background:#0B0906;color:#F4D98A;
                display:inline-flex;align-items:center;justify-content:center;flex:none}
            .dock-burger{display:inline-flex}
            @media(min-width:1024px){.dock-burger{display:none}}
            /* scrollable section strip (tablet + mobile): all sections, no menu needed */
            .dock-strip{display:flex;gap:6px;overflow-x:auto;padding:0 10px 10px;scrollbar-width:none;
                mask-image:linear-gradient(to right,transparent,#000 6%,#000 94%,transparent);
                -webkit-mask-image:linear-gradient(to right,transparent,#000 6%,#000 94%,transparent)}
            .dock-strip::-webkit-scrollbar{display:none}
            @media(min-width:1024px){.dock-strip{display:none}}
            .dock-chip{flex:none;display:inline-flex;align-items:center;gap:7px;padding:9px 15px;border-radius:99px;
                font-size:12.5px;font-weight:800;color:rgba(255,255,255,.62);text-decoration:none;white-space:nowrap;
                background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);transition:all .2s ease}
            .dock-chip.is-active{color:#0B0906;background:linear-gradient(180deg,#F8EDD2,#E6C477 50%,#C9A24B);border-color:transparent;
                box-shadow:0 6px 16px -6px rgba(201,162,75,.8)}
            /* mobile menu panel */
            .dock-menu{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .32s cubic-bezier(.16,1,.3,1),opacity .25s,margin .3s}
            .dock-menu.open{grid-template-rows:1fr;opacity:1;margin-top:8px}
            .dock-menu-in{overflow:hidden}
            .dock-panel{border-radius:18px;padding:1px;background:linear-gradient(140deg,rgba(201,162,75,.45),rgba(201,162,75,.06) 45%,rgba(201,162,75,.45))}
            .dock-panel-in{border-radius:17px;padding:12px;display:flex;flex-direction:column;gap:8px;
                background:linear-gradient(180deg,rgba(22,16,8,.98),rgba(7,5,3,.98))}
            .dock-mhead{display:flex;align-items:center;gap:12px;padding:4px 6px 10px;border-bottom:1px solid rgba(255,255,255,.07)}
            .dock-mhead img{width:44px;height:44px;border-radius:13px;object-fit:cover;border:1px solid rgba(201,162,75,.45)}
            .dock-mhead b{display:block;font-size:14px;letter-spacing:.12em;color:#fff}
            .dock-mhead small{display:block;font-size:11px;color:rgba(255,255,255,.45);margin-top:3px}
            .dock-mrow{display:flex;align-items:center;gap:12px;width:100%;min-height:50px;padding:12px 15px;font-size:14px;font-weight:800;
                color:rgba(255,255,255,.78);border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.03);
                text-align:start;text-decoration:none;cursor:pointer;font-family:inherit;transition:all .2s ease}
            .dock-mrow:hover,.dock-mrow.is-active{color:#F4D98A;border-color:rgba(244,217,138,.45);background:rgba(201,162,75,.09)}
            .dock-mrow.gold{color:#0B0906;background:linear-gradient(180deg,#F8EDD2,#E6C477 50%,#C9A24B);border-color:transparent;font-weight:900}
            a:focus-visible,button:focus-visible{outline:2px solid #E6C477;outline-offset:2px;border-radius:10px}
            @media(prefers-reduced-motion:reduce){.dock-shell,.dock-menu{animation:none;transition:none}.dock-dot.on,.dock-live.on i{animation:none}}
            `}</style>

            <header className={`dock dock-shell${compact ? ' is-compact' : ''}`}>
                <div className="dock-frame">
                    <div className="dock-bar">
                        <span className="dock-aurora" aria-hidden="true" />
                        <div className="dock-row">
                            {/* Brand + live */}
                            <a href="#top" className="dock-brand" aria-label="FIRAS — home">
                                <span className="dock-emblem">
                                    <img src={profileImage} alt="Firas emblem" loading="eager" />
                                    <span className={`dock-dot${isLive ? ' on' : ''}`} aria-hidden="true" />
                                </span>
                                <span className="dock-word" dir="ltr">
                                    <b>FIRAS</b>
                                    <span className={`dock-live${isLive ? ' on' : ' off'}`} role="status" aria-live="polite">
                                        <i aria-hidden="true" />
                                        <span>{isLive ? `${statusText}${viewersLabel ? ` • ${viewersLabel}` : ''}` : statusText}</span>
                                    </span>
                                </span>
                            </a>

                            {/* Full sections — segmented control */}
                            <nav className="dock-nav" aria-label="Primary" dir={isAr ? 'rtl' : 'ltr'}>
                                <div className="dock-seg" role="list">
                                    {NAV_DEFS.map((n) => (
                                        <a
                                            key={n.href}
                                            href={n.href}
                                            aria-current={activeHash === n.href ? 'page' : undefined}
                                            className={`dock-link${activeHash === n.href ? ' is-active' : ''}`}
                                        >
                                            {n.icon}
                                            <span>{isAr ? n.ar : n.en}</span>
                                        </a>
                                    ))}
                                </div>
                            </nav>

                            {/* Actions */}
                            <div className="dock-actions">
                                <button type="button" className="dock-lang" onClick={onToggleLang} aria-label={isAr ? 'Switch to English' : 'التبديل إلى العربية'}>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" /></svg>
                                    <span>{isAr ? 'EN' : 'عربي'}</span>
                                </button>

                                <button type="button" className="dock-iconbtn hidden xl:inline-flex" onClick={onRefresh} title={isAr ? 'تحديث الحالة' : 'Refresh status'} aria-label={isAr ? 'تحديث الحالة' : 'Refresh status'}>
                                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                </button>

                                <a href="https://kick.com/firas" target="_blank" rel="noopener noreferrer" className="dock-cta">
                                    <span className="play" aria-hidden="true">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                                    </span>
                                    {isAr ? 'شاهد البث' : 'Watch Live'}
                                </a>

                                <button type="button" className="dock-iconbtn dock-burger" onClick={() => setOpen((v) => !v)} aria-label={isAr ? 'القائمة' : 'Menu'} aria-expanded={open}>
                                    {open ? (
                                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                                    ) : (
                                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Scrollable sections strip — tablet & mobile */}
                        <nav className="dock-strip" aria-label={isAr ? 'الأقسام' : 'Sections'} dir={isAr ? 'rtl' : 'ltr'}>
                            {NAV_DEFS.map((n) => (
                                <a
                                    key={n.href}
                                    href={n.href}
                                    aria-current={activeHash === n.href ? 'page' : undefined}
                                    className={`dock-chip${activeHash === n.href ? ' is-active' : ''}`}
                                >
                                    {n.icon}
                                    <span>{isAr ? n.ar : n.en}</span>
                                </a>
                            ))}
                        </nav>
                    </div>
                </div>

                {/* Mobile menu panel — all sections + actions */}
                <div className={`dock-menu${open ? ' open' : ''}`}>
                    <div className="dock-menu-in">
                        <div className="dock-panel">
                            <nav className="dock-panel-in" aria-label="Mobile" dir={isAr ? 'rtl' : 'ltr'}>
                                <div className="dock-mhead" dir={isAr ? 'rtl' : 'ltr'}>
                                    <img src={profileImage} alt="" loading="lazy" />
                                    <span>
                                        <b dir="ltr">FIRAS</b>
                                        <small dir="auto">{headerTitle}</small>
                                    </span>
                                </div>
                                {NAV_DEFS.map((n) => (
                                    <a
                                        key={n.href}
                                        href={n.href}
                                        onClick={() => goTo(n.id)}
                                        aria-current={activeHash === n.href ? 'page' : undefined}
                                        className={`dock-mrow${activeHash === n.href ? ' is-active' : ''}`}
                                    >
                                        {n.icon}
                                        <span>{isAr ? n.ar : n.en}</span>
                                    </a>
                                ))}
                                <a href="https://kick.com/firas" target="_blank" rel="noopener noreferrer" className="dock-mrow gold" onClick={() => setOpen(false)}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                                    <span>{isAr ? 'شاهد البث المباشر' : 'Watch Live'}</span>
                                </a>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button type="button" onClick={() => { onToggleLang(); setOpen(false); }} className="dock-mrow" style={{ flex: 1 }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" /></svg>
                                        <span>{isAr ? 'EN — English' : 'عربي'}</span>
                                    </button>
                                    <button type="button" onClick={() => { onRefresh(); setOpen(false); }} className="dock-mrow" style={{ flex: 1 }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                        <span>{isAr ? 'تحديث' : 'Refresh'}</span>
                                    </button>
                                </div>
                            </nav>
                        </div>
                    </div>
                </div>
            </header>
        </>
    );
};
