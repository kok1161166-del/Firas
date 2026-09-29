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

/* The header mirrors the supplied banner: emblem, search, links, wordmark, account. */
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

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

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
            .dock-shell{position:sticky;top:10px;z-index:60;width:min(1240px,70vw);margin:10px auto 0;
                animation:dock-in .65s cubic-bezier(.16,1,.3,1) both}
            @keyframes dock-in{from{opacity:0;transform:translateY(-14px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
            .dock-frame{border-radius:18px;padding:1px;
                background:linear-gradient(105deg,rgba(201,162,75,.72),rgba(201,162,75,.12) 23%,rgba(255,255,255,.18) 52%,rgba(201,162,75,.12) 77%,rgba(201,162,75,.72));
                box-shadow:0 20px 55px rgba(0,0,0,.62),0 0 38px -14px rgba(201,162,75,.6)}
            .dock-bar{position:relative;border-radius:17px;overflow:hidden;
                background:linear-gradient(180deg,rgba(19,15,10,.96),rgba(6,5,4,.94));
                backdrop-filter:blur(24px) saturate(1.3);-webkit-backdrop-filter:blur(24px) saturate(1.3)}
            .dock-aurora{position:absolute;inset:0;pointer-events:none;
                background:radial-gradient(300px 90px at 3% -40%,rgba(244,217,138,.2),transparent 70%),
                           radial-gradient(340px 110px at 82% -50%,rgba(201,162,75,.1),transparent 72%)}
            .dock-bar::before{content:"";position:absolute;top:0;left:7%;right:7%;height:1px;border-radius:99px;
                background:linear-gradient(90deg,transparent,rgba(255,246,216,.9),transparent);pointer-events:none}
            .dock-row{position:relative;display:flex;align-items:center;gap:8px;min-height:58px;padding:6px 7px;direction:ltr}
            .dock-shell.is-compact .dock-row{min-height:52px}
            @media(min-width:768px){.dock-row{padding:6px 9px;gap:10px}}
            .dock-mark{position:relative;width:43px;height:43px;flex:none;display:block;border-radius:13px;overflow:visible;
                border:1px solid rgba(244,217,138,.62);background:#080706;
                box-shadow:0 8px 22px -9px rgba(201,162,75,.9),inset 0 1px 0 rgba(255,255,255,.16);
                transition:transform .22s ease,box-shadow .22s ease}
            .dock-shell.is-compact .dock-mark{width:39px;height:39px}
            .dock-mark:hover{transform:translateY(-1px);box-shadow:0 13px 28px -9px rgba(201,162,75,.95),inset 0 1px 0 rgba(255,255,255,.16)}
            .dock-mark img{width:100%;height:100%;object-fit:cover;border-radius:12px;display:block}
            .dock-dot{position:absolute;bottom:-4px;right:-4px;width:13px;height:13px;border-radius:99px;
                border:3px solid #100c07;background:#8a7a55;z-index:2}
            .dock-dot.on{background:#53FC18;box-shadow:0 0 0 3px rgba(83,252,24,.18),0 0 12px #53FC18;animation:dock-pulse 1.8s ease-in-out infinite}
            @keyframes dock-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
            .dock-search{height:36px;flex:0 1 190px;display:flex;align-items:center;gap:7px;min-width:72px;padding:0 8px;
                border:1px solid rgba(201,162,75,.32);border-radius:999px;background:rgba(2,2,2,.42);color:rgba(255,246,216,.48);
                box-shadow:inset 0 1px 7px rgba(0,0,0,.48);font-size:10px;font-weight:700;white-space:nowrap;transition:border-color .2s ease,box-shadow .2s ease}
            .dock-search:focus-within{border-color:rgba(244,217,138,.72);box-shadow:0 0 20px -8px rgba(244,217,138,.75),inset 0 1px 7px rgba(0,0,0,.48)}
            .dock-search-icon{display:inline-flex;align-items:center;justify-content:center;color:#D9C08A;flex:none}
            .dock-search-text{overflow:hidden;text-overflow:ellipsis;flex:1}
            .dock-globe{display:inline-flex;align-items:center;justify-content:center;width:25px;height:25px;border:0;border-left:1px solid rgba(201,162,75,.22);
                padding-left:6px;background:transparent;color:#D9C08A;cursor:pointer;flex:none;transition:color .2s ease,transform .2s ease}
            .dock-globe:hover{color:#FFF4D2;transform:rotate(12deg)}
            .dock-nav{flex:1;min-width:0;display:none;align-items:center;justify-content:center}
            @media(min-width:900px){.dock-nav{display:flex}}
            .dock-seg{display:flex;align-items:center;justify-content:center;gap:3px;max-width:100%}
            .dock-link{position:relative;display:inline-flex;align-items:center;gap:5px;padding:11px 12px 10px;
                font-size:11.5px;font-weight:800;color:rgba(255,255,255,.66);text-decoration:none;white-space:nowrap;
                transition:color .2s ease,transform .2s ease}
            .dock-link::after{content:"";position:absolute;left:50%;bottom:2px;width:0;height:2px;border-radius:99px;background:linear-gradient(90deg,#8A6A3A,#F4D98A,#8A6A3A);
                box-shadow:0 0 10px rgba(244,217,138,.85);transform:translateX(-50%);transition:width .25s ease}
            .dock-link:hover{color:#FFF3D6;transform:translateY(-1px)}
            .dock-link:active{transform:scale(.96)}
            .dock-link.is-active{color:#F4D98A;text-shadow:0 0 16px rgba(244,217,138,.35)}
            .dock-link.is-active::after{width:23px}
            .dock-link svg{opacity:.62;transition:opacity .2s ease}
            .dock-link.is-active svg,.dock-link:hover svg{opacity:1}
            @media(min-width:900px) and (max-width:1199px){.dock-link{padding-inline:7px;font-size:10px;gap:3px}.dock-link svg{display:none}}
            .dock-brand{display:flex;align-items:center;justify-content:center;flex:none;min-width:92px;text-decoration:none;text-align:center}
            .dock-word{display:flex;flex-direction:column;line-height:.95;min-width:0}
            .dock-word b{font-size:17px;font-weight:950;letter-spacing:.1em;color:#FFF6DE;text-shadow:0 2px 14px rgba(201,162,75,.42)}
            .dock-word small{margin-top:4px;font-size:5px;letter-spacing:.28em;font-weight:900;color:#D9C08A;white-space:nowrap}
            .dock-actions{flex:none;display:flex;align-items:center;gap:7px}
            .dock-profile{width:40px;height:40px;display:inline-flex;align-items:center;justify-content:center;gap:3px;border-radius:999px;
                background:rgba(255,255,255,.04);border:1px solid rgba(244,217,138,.58);color:#F2D58D;cursor:pointer;
                box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 6px 18px -10px rgba(201,162,75,.95);transition:all .2s ease}
            .dock-shell.is-compact .dock-profile{width:36px;height:36px}
            .dock-profile:hover,.dock-profile[aria-expanded="true"]{color:#FFF4D2;background:rgba(201,162,75,.14);border-color:#F4D98A;transform:translateY(-1px)}
            .dock-profile-chevron{opacity:.58}
            @media(max-width:899px){.dock-brand{margin-inline-start:auto}.dock-word b{font-size:15px}.dock-word small{font-size:4px}.dock-profile{width:38px;height:38px}}
            @media(max-width:520px){.dock-shell{width:calc(100% - 16px);margin-top:8px}.dock-row{gap:6px}.dock-mark{width:39px;height:39px}.dock-search{flex:1;max-width:none}.dock-search-text{font-size:9px}.dock-brand{min-width:62px}.dock-word b{font-size:13px;letter-spacing:.07em}.dock-word small{letter-spacing:.18em}}
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
            .dock-mhead em{display:block;font-size:10px;color:rgba(244,217,138,.68);font-style:normal;margin-top:4px}
            .dock-mrow{display:flex;align-items:center;gap:12px;width:100%;min-height:50px;padding:12px 15px;font-size:14px;font-weight:800;
                color:rgba(255,255,255,.78);border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.03);
                text-align:start;text-decoration:none;cursor:pointer;font-family:inherit;transition:all .2s ease}
            .dock-mrow:hover,.dock-mrow.is-active{color:#F4D98A;border-color:rgba(244,217,138,.45);background:rgba(201,162,75,.09)}
            .dock-mrow.gold{color:#0B0906;background:linear-gradient(180deg,#F8EDD2,#E6C477 50%,#C9A24B);border-color:transparent;font-weight:900}
            a:focus-visible,button:focus-visible{outline:2px solid #E6C477;outline-offset:2px;border-radius:10px}
            @media(prefers-reduced-motion:reduce){.dock-shell,.dock-menu{animation:none;transition:none}.dock-dot.on{animation:none}}
            `}</style>

            <header className={`dock dock-shell${compact ? ' is-compact' : ''}`}>
                <div className="dock-frame">
                    <div className="dock-bar">
                        <span className="dock-aurora" aria-hidden="true" />
                        <div className="dock-row">
                            <a href="#top" className="dock-mark" aria-label="FIRAS — home">
                                <img src={profileImage} alt="Firas emblem" loading="eager" />
                                <span className={`dock-dot${isLive ? ' on' : ''}`} aria-hidden="true" />
                            </a>

                            <div className="dock-search" dir={isAr ? 'rtl' : 'ltr'} role="search" aria-label={isAr ? 'بحث في الموقع' : 'Search the site'}>
                                <span className="dock-search-icon" aria-hidden="true">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
                                </span>
                                <span className="dock-search-text">{isAr ? 'ابحث في الموقع' : 'Search the site'}</span>
                                <button type="button" className="dock-globe" onClick={onToggleLang} aria-label={isAr ? 'Switch to English' : 'التبديل إلى العربية'}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-6.4-3.8-9S9.5 5.6 12 3z" /></svg>
                                </button>
                            </div>

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

                            <a href="#top" className="dock-brand" aria-label="FIRAS — home">
                                <span className="dock-word" dir="ltr">
                                    <b>FIRAS</b>
                                    <small>RISE WITH FIRE</small>
                                </span>
                            </a>

                            <div className="dock-actions">
                                <button type="button" className="dock-profile" onClick={() => setOpen((v) => !v)} aria-label={isAr ? 'فتح القائمة' : 'Open menu'} aria-expanded={open}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19c.7-3.1 2.9-4.8 6.5-4.8s5.8 1.7 6.5 4.8" /></svg>
                                    <svg className="dock-profile-chevron" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className={`dock-menu${open ? ' open' : ''}`}>
                    <div className="dock-menu-in">
                        <div className="dock-panel">
                            <nav className="dock-panel-in" aria-label="Mobile" dir={isAr ? 'rtl' : 'ltr'}>
                                <div className="dock-mhead" dir={isAr ? 'rtl' : 'ltr'}>
                                    <img src={profileImage} alt="" loading="lazy" />
                                    <span>
                                        <b dir="ltr">FIRAS</b>
                                        <small dir="auto">{headerTitle}</small>
                                        <em dir="auto">{isLive ? `${statusText}${viewersLabel ? ` • ${viewersLabel}` : ''}` : statusText}</em>
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