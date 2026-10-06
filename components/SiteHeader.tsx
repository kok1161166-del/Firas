import React, { useEffect, useRef, useState } from 'react';
import type { Language } from '../types';

interface SiteHeaderProps {
    lang: Language;
    onToggleLang: () => void;
    profileImage: string;
    headerTitle: string;
    isLive: boolean;
    viewers: number;
    statusText: string;
    onOpenSearch: () => void;
}

export const NAV_DEFS = [
    {
        href: '#top', id: 'top', ar: 'الرئيسية', en: 'Home',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h5v-6h4v6h5V9.5" /></svg>,
    },
    {
        href: '#socials', id: 'socials', ar: 'ساحة التواصل', en: 'Socials',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></svg>,
    },
    {
        href: '#live', id: 'live', ar: 'مسرح البث', en: 'Live Theater',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="13" rx="3" /><path d="M10 9.5v5l4.5-2.5z" fill="currentColor" stroke="none" /><path d="M8 21h8" /></svg>,
    },
    {
        href: '#community', id: 'community', ar: 'مقر المجتمع', en: 'Community',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.8-3 2.9-4.5 5.5-4.5s4.7 1.5 5.5 4.5" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.6c2.3.2 3.9 1.6 4.5 4" /></svg>,
    },
    {
        href: '#/gallery', id: '/gallery', ar: 'معرض الصور', en: 'Gallery',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="M4.5 17.5 10 12l3.5 3.5L17 12l2.5 2.5" /></svg>,
    },
    {
        href: '#support', id: 'support', ar: 'دعم القناة', en: 'Support',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.3C4.5 6.6 6.7 5 8.8 5c1.4 0 2.6.7 3.2 1.8C12.6 5.7 13.8 5 15.2 5c2.1 0 4.3 1.6 4.3 4.7C19.5 15.4 12 20 12 20z" /></svg>,
    },
    {
        href: '#moderators', id: 'moderators', ar: 'المشرفون', en: 'Moderators',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" /><path d="M9.5 12l2 2 3.5-4" /></svg>,
    },
    {
        href: '#leaderboard', id: 'leaderboard', ar: 'لوحة الشرف', en: 'Legends',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M7 6H4c0 3 2 5 4.5 5.2M17 6h3c0 3-2 5-4.5 5.2M12 14v4M8.5 20h7" /></svg>,
    },
    {
        href: '#archive', id: 'archive', ar: 'الأرشيف', en: 'Archive',
        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7.5 5v14M16.5 5v14M3 9.5h4.5M3 14.5h4.5M16.5 9.5H21M16.5 14.5H21" /></svg>,
    },
] as const;



const ArrowIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
);

export const SiteHeader: React.FC<SiteHeaderProps> = ({
    lang, onToggleLang, isLive, viewers, statusText, onOpenSearch,
}) => {
    const [compact, setCompact] = useState(false);
    const [hash, setHash] = useState('');
    const [spacerH, setSpacerH] = useState(0);
    const headerRef = useRef<HTMLElement>(null);
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
        const el = headerRef.current;
        if (!el) return;
        const measure = () => setSpacerH(el.offsetHeight);
        measure();
        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', measure);
            return () => window.removeEventListener('resize', measure);
        }
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
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

    const FALLBACK_TARGETS: Record<string, string[]> = {
        live: ['archive', 'clips'],
        archive: ['clips'],
    };

    const resolveTarget = (id: string): HTMLElement | null => {
        const candidates = [id, ...(FALLBACK_TARGETS[id] ?? [])];
        for (const candidate of candidates) {
            const el = document.getElementById(candidate);
            if (el) return el;
        }
        return null;
    };

    const goTo = (id: string) => {
        const target = resolveTarget(id);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            window.history.replaceState(null, '', `#${target.id}`);
        }
        else window.location.hash = `#${id}`;
        (document.activeElement as HTMLElement | null)?.blur?.();
    };

    const renderLinks = (items: typeof NAV_DEFS) => (
        <>
            {items.map((item) => (
                <a
                    key={item.href}
                    href={item.href}
                    onClick={(event) => { event.preventDefault(); goTo(item.id); }}
                    aria-current={activeHash === item.href ? 'page' : undefined}
                    className={`forge-link${activeHash === item.href ? ' active' : ''}`}
                >
                    {item.icon}
                    <span>{isAr ? item.ar : item.en}</span>
                </a>
            ))}
        </>
    );

    return (
        <>
            <style>{`
            .forge-header{--forge-gold:#D9B45E;--forge-bright:#F7E4A8;position:fixed;top:0;left:0;right:0;z-index:60;width:100%;
                padding:0;animation:forge-enter 1.1s cubic-bezier(.16,1,.3,1) both;transition:padding .35s ease}
            .forge-header.forge-compact{padding-top:0;padding-bottom:0}
            .forge-spacer{width:100%;flex:none}
            section[id]{scroll-margin-top:96px}
            #leaderboard{scroll-margin-top:96px}
            .forge-menu.open .forge-menu-inner{overflow-y:auto;max-height:calc(100dvh - 210px);scrollbar-width:thin}
            @keyframes forge-enter{from{opacity:0;transform:translateY(-22px)}to{opacity:1;transform:translateY(0)}}
            @keyframes forge-pulse{50%{transform:scale(1.22);opacity:.72}}
            .forge-ambient{position:absolute;inset:0 0 auto;height:150px;pointer-events:none;background:
                linear-gradient(180deg,rgba(7,6,4,.92),rgba(7,6,4,.7) 52%,transparent),
                radial-gradient(500px 130px at 50% 0%,rgba(217,180,94,.14),transparent 75%);
                mask-image:linear-gradient(to bottom,#000 0%,#000 65%,transparent 100%);-webkit-mask-image:linear-gradient(to bottom,#000 0%,#000 65%,transparent 100%)}
            .forge-wrap{position:relative;width:100%;max-width:none;margin:0;overflow:visible}

            /* ===== البار فل: على دار الشاشة — فخم ومتناسق مع الهوية الذهبية ===== */
            .forge-main{position:relative;display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:70px;
                width:100%;padding:10px 26px;
                border:none !important;border-left:none !important;border-right:none !important;border-top:none !important;
                border-bottom:1px solid rgba(201,162,75,0.28) !important;outline:none !important;
                border-radius:0;
                background:linear-gradient(180deg,rgba(24,17,9,.98) 0%,rgba(12,9,5,.98) 60%,rgba(9,6,3,.98) 100%);
                box-shadow:0 14px 44px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,244,214,.08);
                backdrop-filter:blur(20px) saturate(1.25);-webkit-backdrop-filter:blur(20px);
                transition:min-height .35s ease,box-shadow .35s ease,transform .35s ease;overflow:visible}
            .forge-header.forge-compact .forge-main{min-height:62px}
            .forge-main::before{content:"";position:absolute;top:0;left:0;right:0;height:1px;pointer-events:none;
                background:linear-gradient(90deg,transparent,rgba(255,240,191,.28) 30%,rgba(255,240,191,.28) 70%,transparent)}
            .forge-main::after{content:"";position:absolute;bottom:-1px;left:0;right:0;height:1px;pointer-events:none;
                background:linear-gradient(90deg,transparent 2%,rgba(201,162,75,.9) 25%,#F0DDAE 50%,rgba(201,162,75,.9) 75%,transparent 98%);
                box-shadow:0 0 18px rgba(201,162,75,.45)}

            .forge-side{display:flex;align-items:center;gap:12px;min-width:0;position:relative;z-index:2}
            .forge-status-side{flex:none}
            .forge-nav-center{flex:1;display:flex;justify-content:center;min-width:0}
            .forge-actions-side{flex:none;justify-content:flex-end}

            /* الحالة */
            .forge-status{display:flex;align-items:center;gap:10px;flex:none}
            .forge-status-orb{width:40px;height:40px;display:grid;place-items:center;border-radius:50%;flex:none;
                border:none;background:rgba(255,255,255,.05);color:var(--forge-gold)}
            .forge-status-copy{min-width:0}
            .forge-status-label{display:block;color:rgba(247,228,168,.42);font-size:8px;font-weight:900;letter-spacing:.18em;white-space:nowrap}
            .forge-status-line{display:flex;align-items:center;gap:7px;margin-top:5px;color:#FFF5D8;font-size:12px;font-weight:900;white-space:nowrap}
            .forge-live-dot{width:7px;height:7px;border-radius:50%;background:#8B7D5B;flex:none}
            .forge-live-dot.on{background:#53FC18;box-shadow:0 0 0 4px rgba(83,252,24,.11),0 0 14px #53FC18;animation:forge-pulse 2.6s ease-in-out infinite}
            .forge-viewers{padding-inline-start:10px;border-inline-start:1px solid rgba(255,255,255,.1);color:var(--forge-gold);font-size:11px;font-weight:950;direction:ltr}

            /* روابط — شريط واحد متصل بمسافات موحدة */
            .forge-nav{display:flex;align-items:center;min-width:0;max-width:100%;overflow-x:auto;scrollbar-width:none}
            .forge-nav::-webkit-scrollbar{display:none}
            .forge-nav-list{display:flex;align-items:center;gap:2px;direction:rtl;flex-wrap:nowrap;justify-content:center}
            .forge-link{position:relative;display:inline-flex;align-items:center;gap:5px;padding:12px 7px;color:rgba(255,246,218,.64);
                font-size:11.5px;font-weight:900;text-decoration:none;white-space:nowrap;transition:color .2s ease,transform .2s ease}
            .forge-link::before{content:"";position:absolute;right:50%;transform:translateX(50%);bottom:4px;width:0;height:2px;border-radius:99px;background:var(--forge-bright);
                box-shadow:0 0 11px rgba(247,228,168,.9);transition:width .25s ease}
            .forge-link:hover,.forge-link.active{color:var(--forge-bright);transform:translateY(-1px)}
            .forge-link.active::before{width:24px}
            .forge-link svg{opacity:.6;transition:opacity .2s ease;flex:none}
            .forge-link:hover svg,.forge-link.active svg{opacity:1}

            /* الأكشن + البراند */
            .forge-actions{display:flex;align-items:center;gap:7px;flex:none}
            .forge-action{width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;
                color:rgba(255,246,218,.78);background:rgba(255,255,255,.05);border:none !important;cursor:pointer;transition:all .2s ease}
            .forge-action:hover{color:#FFF8E5;background:rgba(217,180,94,.16);transform:translateY(-1px)}
            .forge-live-cta{height:38px;display:inline-flex;align-items:center;gap:8px;padding:0 15px;border-radius:999px;color:#100D08;border:none;
                background:linear-gradient(135deg,#FFF0BF 0%,#E3BD64 50%,#A77A2A 100%);box-shadow:0 9px 24px -10px rgba(217,180,94,.95),inset 0 1px 0 rgba(255,255,255,.75);
                font-size:11px;font-weight:950;text-decoration:none;white-space:nowrap;transition:transform .2s ease,filter .2s ease}
            .forge-live-cta:hover{filter:brightness(1.08);transform:translateY(-1px)}
            .forge-brand{display:flex;align-items:center;gap:9px;flex:none;text-decoration:none;direction:ltr}
            .forge-brand-logo{display:block;width:32px;height:32px;object-fit:contain;flex:none;filter:drop-shadow(0 2px 8px rgba(247,228,168,.28))}
            .forge-brand-copy strong{font-size:19px;font-weight:950;letter-spacing:.14em;color:#FFF8E5;white-space:nowrap}

            .forge-menu{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .35s cubic-bezier(.16,1,.3,1),opacity .25s,margin .3s}
            .forge-menu.open{grid-template-rows:1fr;opacity:1;margin-top:9px}
            .forge-menu-inner{overflow:hidden}
            .forge-panel{padding:1px;border-radius:20px;background:linear-gradient(125deg,rgba(247,228,168,.7),rgba(217,180,94,.08) 42%,rgba(247,228,168,.55))}
            .forge-panel-nav{display:flex;flex-direction:column;gap:7px;padding:13px;border-radius:19px;background:linear-gradient(180deg,rgba(19,14,8,.98),rgba(6,5,4,.99))}
            .forge-panel-link{display:flex;align-items:center;gap:12px;min-height:48px;padding:0 14px;border:1px solid rgba(247,228,168,.12);border-radius:13px;
                color:rgba(255,246,218,.76);font-size:14px;font-weight:900;text-decoration:none;transition:all .2s ease}
            .forge-panel-link:hover,.forge-panel-link.active{color:#FFF1B6;border-color:rgba(247,228,168,.52);background:rgba(217,180,94,.1)}
            .forge-panel-link.gold{color:#100D08;background:linear-gradient(135deg,#FFF0BF,#E3BD64 55%,#A77A2A);border-color:transparent}
            .forge-header a:focus-visible,.forge-header button:focus-visible{outline:2px solid #F7E4A8;outline-offset:3px}

            @media(max-width:1350px){.forge-link svg{display:none}}
            @media(max-width:1180px){
                .forge-link{padding-inline:5px;font-size:10.5px}
                .forge-live-cta{padding-inline:11px}
                .forge-brand-copy strong{font-size:17px}
            }
            @media(max-width:940px){
                .forge-header{padding:0}.forge-header.forge-compact{padding-top:0;padding-bottom:0}
                .forge-main{min-height:60px;padding:8px 12px;gap:8px}
                .forge-nav,.forge-status-copy,.forge-viewers,.forge-live-cta,.forge-brand-copy{display:none}
                .forge-status-orb{width:36px;height:36px}
                .forge-brand-logo{width:34px;height:34px}
            }
            @media(max-width:940px){section[id],#leaderboard{scroll-margin-top:84px}.forge-menu.open .forge-menu-inner{max-height:calc(100dvh - 160px)}}
            @media(prefers-reduced-motion:reduce){.forge-header,.forge-live-dot.on{animation:none}.forge-link,.forge-action,.forge-live-cta{transition:none}}
            `}</style>

            <div className="forge-spacer" aria-hidden="true" style={{ height: spacerH }} />
            <header ref={headerRef} className={`forge-header${compact ? ' forge-compact' : ''}`}>
                <span className="forge-ambient" aria-hidden="true" />
                <div className="forge-wrap">
                    <div className="forge-main">
                        {/* الحالة */}
                        <div className="forge-side forge-status-side">
                            <div className="forge-status" dir={isAr ? 'rtl' : 'ltr'}>
                                <span className="forge-status-orb" aria-hidden="true">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /><circle cx="12" cy="12" r="3.2" /></svg>
                                </span>
                                <span className="forge-status-copy">
                                    <span className="forge-status-label">FIRAS LIVE SYSTEM</span>
                                    <span className="forge-status-line">
                                        <i className={`forge-live-dot${isLive ? ' on' : ''}`} aria-hidden="true" />
                                        <span>{statusText}</span>
                                        <b className="forge-viewers">{isLive ? viewersLabel : 'OFF'}</b>
                                    </span>
                                </span>
                            </div>
                        </div>

                        {/* روابط واحدة متصلة بالنص — مسافة موحدة بين كل الأزرار */}
                        <div className="forge-side forge-nav-center">
                            <nav className="forge-nav" aria-label="Primary" dir="rtl">
                                <div className="forge-nav-list">{renderLinks(NAV_DEFS)}</div>
                            </nav>
                        </div>

                        {/* الأزرار + البراند */}
                        <div className="forge-side forge-actions-side">
                            <div className="forge-actions">
                                <a className="forge-live-cta" href="https://kick.com/firas" target="_blank" rel="noopener noreferrer">
                                    <span>{isAr ? 'شاهد البث' : 'Watch live'}</span>
                                    <ArrowIcon />
                                </a>
                                <button type="button" className="forge-action" onClick={onToggleLang} aria-label={isAr ? 'Switch to English' : 'التبديل إلى العربية'} title={isAr ? 'English' : 'العربية'}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-6.4-3.8-9S9.5 5.6 12 3z" /></svg>
                                </button>
                                <button type="button" className="forge-action" onClick={onOpenSearch} aria-label={isAr ? 'ابحث في المقاطع والبثوث' : 'Search clips and streams'} title={isAr ? 'بحث' : 'Search'}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" /></svg>
                                </button>
                            </div>
                            <a href="#top" className="forge-brand" aria-label="FIRAS — home" onClick={(e) => { e.preventDefault(); goTo('top'); }}>
                                <img className="forge-brand-logo" src="/firas-f.png" alt="" aria-hidden="true" />
                                <span className="forge-brand-copy"><strong>FIRAS</strong></span>
                            </a>
                        </div>
                    </div>
                </div>
            </header>
        </>
    );
};
