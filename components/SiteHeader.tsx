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

const NAV_DEFS = [
    {
        href: '#top', id: 'top', ar: 'الرئيسية', en: 'الرئيسية',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h5v-6h4v6h5V9.5" /></svg>,
    },
    {
        href: '#socials', id: 'socials', ar: 'التواصل', en: 'التواصل',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.8-3 2.9-4.5 5.5-4.5s4.7 1.5 5.5 4.5" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.6c2.3.2 3.9 1.6 4.5 4" /></svg>,
    },
    {
        href: '#live', id: 'live', ar: 'البث المباشر', en: 'البث المباشر',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="13" rx="3" /><path d="M10 9.5v5l4.5-2.5z" fill="currentColor" stroke="none" /><path d="M8 21h8" /></svg>,
    },
    {
        href: '#store', id: 'store', ar: 'المتجر', en: 'المتجر',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7.5 5.5 4h13L20 7.5" /><path d="M4 7.5h16v2.5c0 1.5-1.2 2.5-2.7 2.5-1.2 0-2-.7-2.3-1.7-.3 1-1.1 1.7-2.3 1.7s-2-1-2.3-2c-.3 1-1.1 1.7-2.3 1.7" /><path d="M5.5 12.5V20h13v-7.5" /></svg>,
    },
    {
        href: '#support', id: 'support', ar: 'الدعم', en: 'الدعم',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.3C4.5 6.6 6.7 5 8.8 5c1.4 0 2.6.7 3.2 1.8C12.6 5.7 13.8 5 15.2 5c2.1 0 4.3 1.6 4.3 4.7C19.5 15.4 12 20 12 20z" /></svg>,
    },
] as const;

const ArrowIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
);

export const SiteHeader: React.FC<SiteHeaderProps> = ({
    lang, onToggleLang, profileImage, headerTitle, isLive, viewers, statusText, onRefresh,
}) => {
    const [open, setOpen] = useState(false);
    const [compact, setCompact] = useState(false);
    const [hash, setHash] = useState('');
    const isAr = lang === 'ar';
    const activeHash = hash === '' ? '#top' : hash;
    const viewersLabel = viewers > 0 ? viewers.toLocaleString('en-US') : '—';

    useEffect(() => {
        const onScroll = () => setCompact(window.scrollY > 30);
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
        const els = NAV_DEFS.map((n) => document.getElementById(n.id)).filter(Boolean) as HTMLElement[];
        if (!els.length || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(
            (entries) => entries.forEach((entry) => { if (entry.isIntersecting) setHash(`#${entry.target.id}`); }),
            { rootMargin: '-30% 0px -60% 0px', threshold: 0.05 },
        );
        els.forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, [isLive]);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    const goTo = (id: string) => {
        setOpen(false);
        const section = document.getElementById(id);
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else window.location.hash = `#${id}`;
        (document.activeElement as HTMLElement | null)?.blur?.();
    };

    return (
        <>
            <style>{`
            .forge-header{--forge-gold:#D9B45E;--forge-bright:#F7E4A8;--forge-ink:#090805;position:sticky;top:0;z-index:60;width:100%;
                padding:12px 22px 0;animation:forge-enter .8s cubic-bezier(.16,1,.3,1) both}
            @keyframes forge-enter{from{opacity:0;transform:translateY(-22px)}to{opacity:1;transform:translateY(0)}}
            .forge-ambient{position:absolute;inset:0 0 auto;height:126px;pointer-events:none;background:
                linear-gradient(180deg,rgba(7,6,4,.92),rgba(7,6,4,.7) 52%,transparent),
                radial-gradient(500px 130px at 50% 0%,rgba(217,180,94,.14),transparent 75%);
                mask-image:linear-gradient(to bottom,#000 0%,#000 65%,transparent 100%);-webkit-mask-image:linear-gradient(to bottom,#000 0%,#000 65%,transparent 100%)}
            .forge-wrap{position:relative;width:min(1420px,100%);margin:0 auto}
            .forge-topline{height:20px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;
                color:rgba(247,228,168,.45);font-size:8px;font-weight:800;letter-spacing:.32em;text-transform:uppercase}
            .forge-topline-right{display:flex;align-items:center;gap:8px}
            .forge-top-dot{width:5px;height:5px;border-radius:50%;background:var(--forge-gold);box-shadow:0 0 12px var(--forge-gold)}
            .forge-main{position:relative;display:grid;grid-template-columns:minmax(220px,1fr) auto minmax(420px,1.35fr);align-items:center;gap:24px;min-height:76px;
                padding:10px 12px;border:1px solid rgba(217,180,94,.52);border-radius:24px 24px 16px 16px;
                background-image:linear-gradient(90deg,rgba(6,5,3,.96),rgba(20,14,7,.7) 45%,rgba(6,5,3,.96)),url('/bg-fortress.jpg');
                background-size:cover;background-position:center 14%;background-repeat:no-repeat;
                box-shadow:0 20px 48px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,247,214,.12);backdrop-filter:blur(20px) saturate(1.2);-webkit-backdrop-filter:blur(20px)}
            .forge-main::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
                background:linear-gradient(180deg,rgba(255,237,179,.1),transparent 36%,rgba(0,0,0,.26));mix-blend-mode:screen}
            .forge-main::after{content:"";position:absolute;top:-1px;left:14%;right:14%;height:2px;border-radius:99px;background:linear-gradient(90deg,transparent,#F7E4A8,transparent);box-shadow:0 0 18px rgba(247,228,168,.6)}
            .forge-status{position:relative;z-index:1;display:flex;align-items:center;gap:11px;min-width:0}
            .forge-status-orb{position:relative;width:40px;height:40px;display:grid;place-items:center;border-radius:13px;flex:none;
                border:1px solid rgba(217,180,94,.48);background:rgba(0,0,0,.35);color:var(--forge-gold);box-shadow:inset 0 0 18px rgba(217,180,94,.08)}
            .forge-status-orb::after{content:"";position:absolute;inset:5px;border:1px solid rgba(217,180,94,.18);border-radius:9px;transform:rotate(45deg)}
            .forge-status-copy{min-width:0}
            .forge-status-label{display:block;color:rgba(247,228,168,.42);font-size:8px;font-weight:900;letter-spacing:.18em;white-space:nowrap}
            .forge-status-line{display:flex;align-items:center;gap:7px;margin-top:5px;color:#FFF5D8;font-size:12px;font-weight:900;white-space:nowrap}
            .forge-live-dot{width:7px;height:7px;border-radius:50%;background:#8B7D5B;flex:none}
            .forge-live-dot.on{background:#53FC18;box-shadow:0 0 0 4px rgba(83,252,24,.11),0 0 14px #53FC18;animation:forge-pulse 1.7s ease-in-out infinite}
            @keyframes forge-pulse{50%{transform:scale(1.22);opacity:.72}}
            .forge-viewers{margin-inline-start:auto;padding-inline-start:12px;border-inline-start:1px solid rgba(217,180,94,.2);color:var(--forge-gold);font-size:11px;font-weight:950;direction:ltr}
            .forge-brand{position:relative;z-index:2;display:flex;align-items:center;justify-content:center;gap:13px;min-width:170px;text-decoration:none;direction:ltr}
            .forge-brand::before{content:"";width:5px;height:5px;border-radius:1px;background:var(--forge-bright);box-shadow:0 0 12px var(--forge-bright);transform:rotate(45deg);flex:none}
            .forge-crest{position:relative;width:61px;height:61px;display:grid;place-items:center;flex:none;border-radius:50%;
                border:1px solid rgba(247,228,168,.72);background:radial-gradient(circle at 38% 30%,rgba(247,228,168,.17),rgba(7,6,4,.92) 62%);
                box-shadow:0 0 0 4px rgba(217,180,94,.08),0 0 0 7px rgba(217,180,94,.035),0 10px 30px -9px rgba(217,180,94,.9),inset 0 1px 0 rgba(255,255,255,.22)}
            .forge-crest::before,.forge-crest::after{content:"";position:absolute;border:1px solid rgba(217,180,94,.28);border-radius:50%;transform:rotate(42deg)}
            .forge-crest::before{inset:-6px;border-left-color:transparent;border-bottom-color:transparent}
            .forge-crest::after{inset:6px;border-right-color:transparent;border-top-color:transparent}
            .forge-crest img{width:37px;height:37px;object-fit:cover;border-radius:50%;filter:sepia(.25) saturate(.85) brightness(1.15);position:relative;z-index:1}
            .forge-crest-mark{position:absolute;right:-2px;bottom:2px;width:12px;height:12px;border-radius:50%;border:2px solid #0B0906;background:#8B7D5B;z-index:3}
            .forge-crest-mark.on{background:#53FC18;box-shadow:0 0 10px #53FC18}
            .forge-brand-copy{display:flex;flex-direction:column;line-height:.9;text-align:center}
            .forge-brand-copy strong{font-size:23px;font-weight:950;letter-spacing:.14em;color:#FFF8E5;text-shadow:0 2px 18px rgba(217,180,94,.35)}
            .forge-brand-copy small{margin-top:7px;color:var(--forge-gold);font-size:6px;font-weight:950;letter-spacing:.34em;white-space:nowrap}
            .forge-right{position:relative;z-index:1;display:flex;align-items:center;justify-content:flex-end;gap:13px;min-width:0}
            .forge-nav{display:flex;align-items:center;justify-content:flex-end;min-width:0}
            .forge-nav-list{display:flex;align-items:center;gap:2px;direction:rtl}
            .forge-link{position:relative;display:inline-flex;align-items:center;gap:6px;padding:12px 10px;color:rgba(255,246,218,.64);
                font-size:12px;font-weight:900;text-decoration:none;white-space:nowrap;transition:color .2s ease,transform .2s ease}
            .forge-link::before{content:"";position:absolute;right:50%;bottom:4px;width:0;height:2px;border-radius:99px;background:var(--forge-bright);
                box-shadow:0 0 11px rgba(247,228,168,.9);transition:width .25s ease}
            .forge-link:hover,.forge-link.active{color:var(--forge-bright);transform:translateY(-1px)}
            .forge-link.active::before{width:24px}
            .forge-link svg{opacity:.6;transition:opacity .2s ease}
            .forge-link:hover svg,.forge-link.active svg{opacity:1}
            .forge-actions{display:flex;align-items:center;gap:7px;flex:none}
            .forge-action{width:39px;height:39px;display:inline-flex;align-items:center;justify-content:center;border-radius:12px;
                color:rgba(255,246,218,.78);background:rgba(255,255,255,.035);border:1px solid rgba(247,228,168,.22);cursor:pointer;
                transition:all .2s ease}
            .forge-action:hover,.forge-action[aria-expanded="true"]{color:#FFF8E5;border-color:rgba(247,228,168,.72);background:rgba(217,180,94,.14);transform:translateY(-1px)}
            .forge-live-cta{height:39px;display:inline-flex;align-items:center;gap:8px;padding:0 14px;border-radius:12px;color:#100D08;
                background:linear-gradient(135deg,#FFF0BF 0%,#E3BD64 50%,#A77A2A 100%);box-shadow:0 9px 24px -10px rgba(217,180,94,.95),inset 0 1px 0 rgba(255,255,255,.75);
                font-size:11px;font-weight:950;text-decoration:none;white-space:nowrap;transition:transform .2s ease,filter .2s ease}
            .forge-live-cta:hover{filter:brightness(1.08);transform:translateY(-1px)}
            .forge-bottom{display:flex;align-items:center;gap:12px;height:22px;padding:0 15px;color:rgba(247,228,168,.42);font-size:8px;font-weight:800;letter-spacing:.2em}
            .forge-bottom-line{height:1px;flex:1;background:linear-gradient(90deg,rgba(217,180,94,.5),transparent)}
            .forge-bottom-line.reverse{background:linear-gradient(270deg,rgba(217,180,94,.5),transparent)}
            .forge-menu{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .35s cubic-bezier(.16,1,.3,1),opacity .25s,margin .3s}
            .forge-menu.open{grid-template-rows:1fr;opacity:1;margin-top:9px}
            .forge-menu-inner{overflow:hidden}
            .forge-panel{padding:1px;border-radius:20px;background:linear-gradient(125deg,rgba(247,228,168,.7),rgba(217,180,94,.08) 42%,rgba(247,228,168,.55))}
            .forge-panel-nav{display:flex;flex-direction:column;gap:7px;padding:13px;border-radius:19px;background:linear-gradient(180deg,rgba(19,14,8,.98),rgba(6,5,4,.99))}
            .forge-panel-head{display:flex;align-items:center;gap:12px;padding:3px 5px 13px;border-bottom:1px solid rgba(247,228,168,.13);margin-bottom:2px}
            .forge-panel-head img{width:46px;height:46px;object-fit:cover;border-radius:50%;border:1px solid rgba(247,228,168,.55)}
            .forge-panel-head b{display:block;color:#FFF8E5;font-size:15px;letter-spacing:.14em}
            .forge-panel-head small{display:block;margin-top:5px;color:rgba(247,228,168,.5);font-size:10px}
            .forge-panel-head em{display:block;margin-top:4px;color:var(--forge-gold);font-size:10px;font-style:normal}
            .forge-panel-link{display:flex;align-items:center;gap:12px;min-height:48px;padding:0 14px;border:1px solid rgba(247,228,168,.12);border-radius:13px;
                color:rgba(255,246,218,.76);font-size:14px;font-weight:900;text-decoration:none;transition:all .2s ease}
            .forge-panel-link:hover,.forge-panel-link.active{color:#FFF1B6;border-color:rgba(247,228,168,.52);background:rgba(217,180,94,.1)}
            .forge-panel-link.gold{color:#100D08;background:linear-gradient(135deg,#FFF0BF,#E3BD64 55%,#A77A2A);border-color:transparent}
            .forge-panel-tools{display:flex;gap:7px}
            .forge-panel-tools button{flex:1}
            .forge-separator{display:none}
            .forge-header a:focus-visible,.forge-header button:focus-visible{outline:2px solid #F7E4A8;outline-offset:3px}
            @media(max-width:1180px){.forge-main{grid-template-columns:minmax(175px,1fr) auto minmax(350px,1.2fr);gap:14px}.forge-link{padding-inline:7px;font-size:11px}.forge-live-cta{padding-inline:10px}.forge-brand{min-width:150px}.forge-brand-copy strong{font-size:20px}}
            @media(max-width:940px){.forge-header{padding:9px 12px 0}.forge-topline{display:none}.forge-main{grid-template-columns:1fr auto 1fr;min-height:68px;padding:8px 9px;border-radius:19px}.forge-status{justify-self:start}.forge-status-copy,.forge-viewers,.forge-nav,.forge-live-cta{display:none}.forge-status-orb{width:38px;height:38px}.forge-brand{grid-column:2;grid-row:1;min-width:0}.forge-brand-copy{display:none}.forge-right{grid-column:3;grid-row:1;justify-self:end}.forge-actions{gap:6px}.forge-bottom{height:17px;font-size:7px}}
            @media(max-width:520px){.forge-header{padding-inline:8px}.forge-main{min-height:61px;padding:7px;border-radius:17px}.forge-crest{width:51px;height:51px}.forge-crest img{width:31px;height:31px}.forge-status-orb{width:34px;height:34px}.forge-action{width:35px;height:35px;border-radius:10px}.forge-bottom{padding-inline:7px;letter-spacing:.12em}.forge-bottom span:not(.forge-bottom-line){white-space:nowrap;font-size:6px}}
            @media(prefers-reduced-motion:reduce){.forge-header,.forge-live-dot.on{animation:none}.forge-link,.forge-action,.forge-live-cta{transition:none}}
            `}</style>

            <header className={`forge-header${compact ? ' forge-compact' : ''}`}>
                <span className="forge-ambient" aria-hidden="true" />
                <div className="forge-wrap">
                    <div className="forge-topline" dir="ltr">
                        <span>FIRAS / OFFICIAL STREAM HUB</span>
                        <span className="forge-topline-right"><span className="forge-top-dot" /> RISE WITH FIRE</span>
                    </div>

                    <div className="forge-main">
                        <div className="forge-status" dir={isAr ? 'rtl' : 'ltr'}>
                            <span className="forge-status-orb" aria-hidden="true">
                                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /><circle cx="12" cy="12" r="3.2" /></svg>
                            </span>
                            <span className="forge-status-copy">
                                <span className="forge-status-label">FIRAS LIVE SYSTEM</span>
                                <span className="forge-status-line">
                                    <i className={`forge-live-dot${isLive ? ' on' : ''}`} aria-hidden="true" />
                                    <span>{isLive ? statusText : statusText}</span>
                                    <b className="forge-viewers">{isLive ? viewersLabel : 'OFF'}</b>
                                </span>
                            </span>
                        </div>

                        <a href="#top" className="forge-brand" aria-label="FIRAS — home">
                            <span className="forge-brand-copy">
                                <strong>FIRAS</strong>
                                <small>RISE WITH FIRE</small>
                            </span>
                        </a>

                        <div className="forge-right">
                            <nav className="forge-nav" aria-label="Primary" dir="rtl">
                                <div className="forge-nav-list">
                                    {NAV_DEFS.map((item) => (
                                        <a
                                            key={item.href}
                                            href={item.href}
                                            aria-current={activeHash === item.href ? 'page' : undefined}
                                            className={`forge-link${activeHash === item.href ? ' active' : ''}`}
                                        >
                                            {item.icon}
                                            <span>{isAr ? item.ar : item.en}</span>
                                        </a>
                                    ))}
                                </div>
                            </nav>
                            <div className="forge-actions">
                                <a className="forge-live-cta" href="https://kick.com/firas" target="_blank" rel="noopener noreferrer">
                                    <span>{isAr ? 'شاهد البث' : 'Watch live'}</span>
                                    <ArrowIcon />
                                </a>
                                <button type="button" className="forge-action" onClick={onToggleLang} aria-label={isAr ? 'Switch to English' : 'التبديل إلى العربية'} title={isAr ? 'English' : 'العربية'}>
                                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-6.4-3.8-9S9.5 5.6 12 3z" /></svg>
                                </button>
                                <button type="button" className="forge-action" onClick={() => setOpen((value) => !value)} aria-label={isAr ? 'فتح القائمة' : 'Open menu'} aria-expanded={open}>
                                    {open ? (
                                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                                    ) : (
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="forge-bottom" dir="ltr">
                        <span className="forge-bottom-line" />
                        <span>THE FIRE NEVER FADES</span>
                        <span className="forge-bottom-line reverse" />
                    </div>

                    <div className={`forge-menu${open ? ' open' : ''}`}>
                        <div className="forge-menu-inner">
                            <div className="forge-panel">
                                <nav className="forge-panel-nav" aria-label="Mobile menu" dir={isAr ? 'rtl' : 'ltr'}>
                                    <div className="forge-panel-head">
                                        <img src={profileImage} alt="" loading="lazy" />
                                        <span>
                                            <b dir="ltr">FIRAS</b>
                                            <small>{headerTitle}</small>
                                            <em>{isLive ? `${statusText} • ${viewersLabel}` : statusText}</em>
                                        </span>
                                    </div>
                                    {NAV_DEFS.map((item) => (
                                        <a
                                            key={item.href}
                                            href={item.href}
                                            onClick={() => goTo(item.id)}
                                            aria-current={activeHash === item.href ? 'page' : undefined}
                                            className={`forge-panel-link${activeHash === item.href ? ' active' : ''}`}
                                        >
                                            {item.icon}
                                            <span>{isAr ? item.ar : item.en}</span>
                                        </a>
                                    ))}
                                    <a href="https://kick.com/firas" target="_blank" rel="noopener noreferrer" className="forge-panel-link gold" onClick={() => setOpen(false)}>
                                        <ArrowIcon />
                                        <span>{isAr ? 'شاهد البث المباشر' : 'Watch live'}</span>
                                    </a>
                                    <div className="forge-panel-tools">
                                        <button type="button" className="forge-panel-link" onClick={() => { onToggleLang(); setOpen(false); }}>
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-6.4-3.8-9S9.5 5.6 12 3z" /></svg>
                                            <span>{isAr ? 'English' : 'العربية'}</span>
                                        </button>
                                        <button type="button" className="forge-panel-link" onClick={() => { onRefresh(); setOpen(false); }}>
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4v5h.6m15.3 2A8 8 0 0 0 4.6 9m0 0H9m11 11v-5h-.6a8 8 0 0 1-15.3-2m15.3 2H15" /></svg>
                                            <span>{isAr ? 'تحديث' : 'Refresh'}</span>
                                        </button>
                                    </div>
                                </nav>
                            </div>
                        </div>
                    </div>
                </div>
            </header>
        </>
    );
};