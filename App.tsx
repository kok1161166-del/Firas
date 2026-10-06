import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { KickIcon, XIcon, SnapchatIcon, DiscordIcon, TikTokIcon, WhatsAppIcon, InstagramIcon, YoutubeIcon, FacebookIcon } from './components/Icons';
import { SocialLink, Language } from './types';
import { StreamPlayer } from './components/StreamPlayer';
import { SiteHeader } from './components/SiteHeader';
import { RunnerShowcase } from './components/RunnerShowcase';
import { ChatWidget } from './components/Chat';
import { DiscordWidget, YoutubeWidget } from './components/CommunityWidgets';
import { SearchOverlay } from './components/SearchOverlay';
import { GalleryTeaser } from './components/GalleryTeaser';
import { GalleryPage } from './components/GalleryPage';
import { GalleryAdmin } from './components/GalleryAdmin';

// توجيه صفحة المعرض: مسار /gallery + توافق #/gallery و #gallery-<id> (روابط المشاركة)
// الإدارة صفحة سرية مستقلة على مسار /admin فقط (بدون أي زر في الموقع)
type GalleryRoute = 'home' | 'gallery';
const galleryRouteFromLocation = (): GalleryRoute => {
    if (typeof window === 'undefined') return 'home';
    if (window.location.pathname.replace(/\/$/, '') === '/gallery') return 'gallery';
    const h = window.location.hash;
    if (h === '#/gallery' || h.startsWith('#/gallery?') || h.startsWith('#gallery-')) return 'gallery';
    return 'home';
};

// Heavy below-fold / on-demand chunks — split out of the first paint
const StatsSection = lazy(() => import('./components/StatsSection').then(m => ({ default: m.StatsSection })));
const RunnerGame = lazy(() => import('./components/RunnerGame'));
const AIChat = lazy(() => import('./components/AIChat').then(m => ({ default: m.AIChat })));
const ModeratorsSection = lazy(() => import('./components/ModeratorsSection'));

// --- Constants (preserved) ---
const DEFAULT_PROFILE_IMAGE = "/firas-mark.webp";
import { kickFetch } from './utils/kickApi';
import { getAllSocialMediaStats, formatFollowerCount, readSocialCache, SOCIAL_TTL_MS } from './utils/socialMediaApi';

const PC_BACKGROUND = "/bg-pc.jpg";
const MOBILE_BACKGROUND = "/bg-mobile.jpg";
const CHANNEL_SLUG = 'firas';

const createSocialLink = (key: string, value: string, followerCount?: string, specialDetail?: string): SocialLink | null => {
    if (!value) return null;
    const handle = value.replace(/^https?:\/\/(www\.)?(twitter|x|instagram|youtube|discord|tiktok|facebook|snapchat|whatsapp)\.com\//i, '')
        .replace(/\/channel\//i, '')
        .replace(/^@/, '')
        .replace(/\/$/, '');
    switch (key) {
        case 'twitter': return { name: 'X', url: value.startsWith('http') ? value : `https://x.com/${handle}`, icon: <XIcon className="w-7 h-7" />, color: '', username: `@${handle}`, hex: '#D9C08A', followerCount, specialDetail };
        case 'instagram': return { name: 'Instagram', url: value.startsWith('http') ? value : `https://instagram.com/${handle}`, icon: <InstagramIcon className="w-7 h-7" />, color: '', username: `@${handle}`, hex: '#D9C08A', followerCount, specialDetail };
        case 'youtube': return { name: 'YouTube', url: value.startsWith('http') ? value : `https://youtube.com/@${handle}`, icon: <YoutubeIcon className="w-7 h-7" />, color: '', username: 'Channel', hex: '#D9C08A', followerCount, specialDetail };
        case 'discord': return { name: 'Discord', url: value.startsWith('http') ? value : `https://discord.gg/${handle}`, icon: <DiscordIcon className="w-7 h-7" />, color: '', username: 'Community', hex: '#D9C08A', followerCount, specialDetail };
        case 'tiktok': return { name: 'TikTok', url: value.startsWith('http') ? value : `https://tiktok.com/@${handle}`, icon: <TikTokIcon className="w-7 h-7" />, color: '', username: `@${handle}`, hex: '#D9C08A', followerCount, specialDetail };
        case 'facebook': return { name: 'Facebook', url: value.startsWith('http') ? value : `https://facebook.com/${handle}`, icon: <FacebookIcon className="w-7 h-7" />, color: '', username: 'Page', hex: '#D9C08A', followerCount, specialDetail };
        case 'snapchat': return { name: 'Snapchat', url: value.startsWith('http') ? value : `https://snapchat.com/add/${handle}`, icon: <SnapchatIcon className="w-7 h-7" />, color: '', username: 'firasq', hex: '#D9C08A', followerCount, specialDetail };
        case 'whatsapp': return { name: 'WhatsApp', url: value, icon: <WhatsAppIcon className="w-7 h-7" />, color: '', username: 'T • F • X - Live', hex: '#D9C08A', followerCount, specialDetail };
        default: return null;
    }
};

const KICK_SOCIAL: SocialLink = {
    name: 'KICK',
    url: 'https://kick.com/firas',
    icon: <KickIcon className="w-8 h-8" />,
    color: '',
    username: 'Firas',
    hex: '#C9A24B',
    followerCount: '121.1K',
    specialDetail: 'البث الأساسي'
};

// Static 5-platform roster — built synchronously so all cards render on first
// paint even before live follower counts arrive (no empty grid gaps).
const buildDefaultSocials = (stats: Record<string, string>): SocialLink[] => ([
    { ...KICK_SOCIAL, followerCount: stats['KICK'] || KICK_SOCIAL.followerCount },
    createSocialLink('tiktok', 'https://www.tiktok.com/@vfiras3', stats['TikTok'], 'المقاطع'),
    createSocialLink('twitter', 'https://x.com/vfiras3', stats['X'], 'الأخبار'),
    createSocialLink('discord', 'https://discord.gg/tmfx', stats['Discord'], 'المجتمع'),
    createSocialLink('whatsapp', 'https://whatsapp.com/channel/0029VadcjLc4Y9lnhHoOAw0a', stats['WhatsApp'], 'تنبيهات البث'),
].filter(Boolean) as SocialLink[]);

const TRANSLATIONS = {
    en: {
        status: 'LIVE NOW', statusOffline: 'OFFLINE',
        headerTitle: 'FIRAS STREAM HUB',
        nameAr: 'Firas',
        bio: '',
        rolePre: 'Streamer & content creator for',
        roleTeam: 'LEVEL ONE',
        defaultStreamTitle: 'CHECK OUT THE VODS | FOLLOW NOW',
        defaultCategory: 'Offline',
        footer: '© 2026 Firas. All Rights Reserved.',
        poweredBy: 'POWERED BY HSG',
        watchLive: 'Watch Live', joinDiscord: 'Join Discord',
        subOnly: 'SUB ONLY', dropsEnabled: 'DROPS ENABLED', noTags: 'No tags',
        shareTitle: 'Firas Stream Hub', shareText: 'Check out Firas live on Kick!',         copied: 'Link copied!',
        lastSessionReport: 'Last session report', ago: 'Ago', duration: 'Duration',
        categoriesSpent: 'Categories in this stream', highlights: 'Stream highlights',
        socialsTitle: 'Social Arena', socialsSub: 'One hub — every platform.',
        communityTitle: 'Community HQ', supportTitle: 'Support & Donation',
        modsTitle: 'Moderators',
        tiersTitle: 'Special alert tiers',
        theaterTitle: 'Live Theater', viewers: 'watching',
        statsKick: 'Kick followers', statsPlatforms: 'Platforms', statsStatus: 'Status',
        follow: 'Follow', open: 'Open', followers: 'followers',
    },
    ar: {
        status: 'بث مباشر الآن', statusOffline: 'غير متصل حالياً',
        headerTitle: 'مركز FIRAS للبث المباشر',
        nameAr: 'فراس',
        bio: '',
        rolePre: 'ستريمر وصانع محتوى في',
        roleTeam: 'فريق لفل ون',
        defaultStreamTitle: 'تابع البثوث السابقة | تابعني الآن',
        defaultCategory: 'غير متصل',
        footer: '© 2026 Firas. جميع الحقوق محفوظة.',
        poweredBy: 'بدعم من HSG',
        watchLive: 'شاهد البث', joinDiscord: 'انضم للديسكورد',
        subOnly: 'للمشتركين فقط', dropsEnabled: 'الجوائز مفعلة', noTags: 'لا يوجد وسوم',
        shareTitle: 'مركز بث Firas', shareText: 'تابع بث Firas المباشر على كيك!',         copied: 'تم نسخ الرابط!',
        lastSessionReport: 'تقرير الجلسة الأخيرة', ago: 'منذ', duration: 'المدة',
        categoriesSpent: 'الفئات التي تم بثها', highlights: 'لقطات ممتعة من البث',
        socialsTitle: 'ساحة التواصل', socialsSub: 'كل المنصات في مكان واحد.',
        communityTitle: 'مقر المجتمع', supportTitle: 'الدعم',
        modsTitle: 'المشرفون',
        tiersTitle: 'مستويات التنبيه الخاصة',
        theaterTitle: 'مسرح البث المباشر', viewers: 'مشاهد',
        statsKick: 'متابع كيك', statsPlatforms: 'منصة', statsStatus: 'الحالة',
        follow: 'تابع', open: 'افتح', followers: 'متابع',
    }
};

// ================= DESIGN SYSTEM =================

export const Reveal: React.FC<{ children: React.ReactNode; delay?: number; className?: string; as?: 'div' | 'section' }> = ({ children, delay = 0, className = '' }) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (typeof IntersectionObserver === 'undefined') { el.classList.add('is-visible'); return; }
        const obs = new IntersectionObserver((entries) => {
            entries.forEach((e) => { if (e.isIntersecting) { el.classList.add('is-visible'); obs.disconnect(); } });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        obs.observe(el);
        return () => obs.disconnect();
    }, []);
    return <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
};

const ArenaBackground: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        let raf = 0; let w = 0; let h = 0; let running = true;
        const DPR = 1;
        // Calm brown embers — few, slow, no glow (smooth on mobile)
        type P = { x: number; y: number; r: number; vy: number; vx: number; sway: number; phase: number; a: number; ember: boolean };
        let parts: P[] = [];
        const resize = () => {
            w = window.innerWidth; h = window.innerHeight;
            canvas.width = w * DPR; canvas.height = h * DPR;
            canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
            const isMobile = w < 768;
            const n = Math.min(isMobile ? 18 : 30, Math.floor(w / 48));
            parts = Array.from({ length: n }, () => ({
                x: Math.random() * w, y: Math.random() * h,
                r: 0.7 + Math.random() * 2.4,
                vy: -(0.25 + Math.random() * 0.7), vx: (Math.random() - 0.5) * 0.2,
                sway: 0.3 + Math.random() * 0.9, phase: Math.random() * Math.PI * 2,
                a: 0.2 + Math.random() * 0.55, ember: Math.random() > 0.4,
            }));
        };
        resize();
        window.addEventListener('resize', resize);
        const onVis = () => {
            const hidden = document.hidden;
            if (hidden && running) { running = false; cancelAnimationFrame(raf); }
            else if (!hidden && !running) { running = true; raf = requestAnimationFrame(tick); }
        };
        document.addEventListener('visibilitychange', onVis);
        let t = 0;
        const tick = () => {
            if (!running) return;
            t += 0.016;
            ctx.clearRect(0, 0, w, h);
            for (const p of parts) {
                p.y += p.vy * 0.7;
                p.x += p.vx + Math.sin(t * p.sway + p.phase) * 0.15;
                if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
                if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;
                const alpha = Math.max(0, Math.min(1, p.a * 0.7));
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = p.ember ? `rgba(201,162,75,${alpha})` : `rgba(235,225,205,${alpha * 0.35})`;
                ctx.fill();
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => { running = false; cancelAnimationFrame(raf); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', onVis); };
    }, []);
    return (
        <div className="fixed inset-0 z-0 bg-[#0B0906] overflow-hidden" aria-hidden="true">
            {/* the citadel artwork — hero of the whole design */}
            <div className="absolute inset-0 fortress_bg" />
            <div className="absolute inset-0 fortress_overlay" />
            {/* calm static aura — no beams, no infinite motion */}
            <div className="absolute -top-32 -left-32 w-[46vw] h-[46vw] max-w-[560px] max-h-[560px] rounded-full bg-[#C9A24B]/[0.07] blur-[130px]" />
            <div className="absolute top-[8%] right-[-8%] w-[34vw] h-[34vw] max-w-[440px] max-h-[440px] rounded-full bg-[#8A6A3A]/[0.08] blur-[120px]" />
            <canvas ref={canvasRef} className="absolute inset-0 opacity-70" />
            {/* readability vignette: dark void in the middle, deep ink at content depth */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_62%_44%_at_50%_30%,transparent_20%,rgba(11,9,6,0.62)_100%)]" />
            <div className="absolute inset-x-0 bottom-0 h-[24%] bg-gradient-to-t from-[#0B0906] via-[#0B0906]/70 to-transparent" />
        </div>
    );
};

export const SectionHeading: React.FC<{ no: string; title: string; sub?: string; en?: string }> = ({ no, title, sub, en }) => (
    <div className="flex items-end gap-3 md:gap-4 mb-4 md:mb-5">
        <span className="font-gaming text-3xl sm:text-4xl md:text-6xl leading-none text-stroke-red select-none shrink-0" dir="ltr">{no}</span>
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl sm:text-2xl md:text-4xl font-black tracking-tight text-white">{title}</h2>
                {en && <span className="hidden sm:inline text-[10px] font-bold tracking-[0.3em] text-white/30 uppercase" dir="ltr">{en}</span>}
            </div>
            {sub && <p className="text-[13px] md:text-sm text-white/50 mt-1 font-medium">{sub}</p>}
            <div className="mt-2.5 md:mt-3 h-px w-full bg-gradient-to-l from-[#C9A24B]/60 via-white/10 to-transparent" />
        </div>
    </div>
);

// --- Count-up number (rAF, reduced-motion safe) ---
const CountUp: React.FC<{ value: number; duration?: number }> = ({ value, duration = 1300 }) => {
    const [n, setN] = useState(0);
    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(value); return; }
        let raf = 0;
        const t0 = performance.now();
        const step = (t: number) => {
            const p = Math.min(1, (t - t0) / duration);
            setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
            if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [value, duration]);
    return <span dir="ltr">{n.toLocaleString('en-US')}</span>;
};

// --- Last Session Report: MISSION DEBRIEF edition (rich Kick data) ---
const LastSessionReport: React.FC<{ lang: Language; data: any; clips: any[]; past?: any[] }> = ({ lang, data, clips, past = [] }) => {
    if (!data && (!clips || clips.length === 0)) return null;
    const timeAgo = (date: string) => {
        if (!date) return '---';
        const now = new Date(); const pastD = new Date(date);
        if (isNaN(pastD.getTime())) return '---';
        const diff = Math.floor((now.getTime() - pastD.getTime()) / 1000);
        if (diff < 60) return lang === 'en' ? `${diff}s ago` : `منذ ${diff} ثانية`;
        if (diff < 3600) return lang === 'en' ? `${Math.floor(diff / 60)}m ago` : `منذ ${Math.floor(diff / 60)} دقيقة`;
        if (diff < 86400) return lang === 'en' ? `${Math.floor(diff / 3600)}h ago` : `منذ ${Math.floor(diff / 3600)} ساعة`;
        return lang === 'en' ? `${Math.floor(diff / 86400)}d ago` : `منذ ${Math.floor(diff / 86400)} يوم`;
    };
    const formatDuration = (val: number) => {
        if (!val) return '0h 0m';
        const totalSeconds = val > 1000000 ? Math.floor(val / 1000) : val;
        return `${Math.floor(totalSeconds / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m`;
    };
    const t = TRANSLATIONS[lang] as any;
    const thumbnail = data.thumbnail?.url || data.thumbnail?.src || (typeof data.thumbnail === 'string' ? data.thumbnail : '') || (data.responsive_url) || PC_BACKGROUND;
    const views = Number(data.views ?? data.video?.views ?? 0);
    const peak = Number(data.viewer_count ?? 0);
    const durH = data.duration > 1000000 ? data.duration / 3600000 : (Number(data.duration) || 0) / 3600;
    const vph = durH > 0.05 ? Math.round(views / durH) : views;
    const vodUrl = `https://kick.com/${CHANNEL_SLUG}/videos/${data.id}`;
    const isSubOnly = data.video?.status === 'subscriber_only' || data.video?.is_private === true;
    const fullDate = (() => { try { return new Date(data.created_at).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } })();
    const sessions = [data, ...past].slice(0, 4);
    const maxV = Math.max(1, ...sessions.map((s: any) => Number(s.views ?? s.video?.views ?? 0)));
    const compact = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : `${v}`;
    const vodUrlOf = (v: any) => `https://kick.com/${CHANNEL_SLUG}/videos/${v.id}`;
    const catTags: string[] = [...new Set((data.categories || []).flatMap((c: any) => c.tags || []))].slice(0, 4) as string[];
    const L = {
        views: lang === 'en' ? 'VIEWS' : 'المشاهدات',
        peak: lang === 'en' ? 'PEAK' : 'الذروة',
        perHour: lang === 'en' ? 'VIEWS / HR' : 'مشاهدة / ساعة',
        pulse: lang === 'en' ? 'RECENT SESSIONS PULSE' : 'نبض الجلسات الأخيرة',
        watch: lang === 'en' ? 'WATCH VOD' : 'مشاهدة التسجيل',
        family: lang === 'en' ? 'FAMILY' : 'عائلي',
    };
    const stats = [
        { label: t.duration, value: <span dir="ltr">{formatDuration(data.duration)}</span>, hot: true, icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
        { label: L.views, value: <CountUp value={views} />, hot: false, icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> },
        { label: L.peak, value: <CountUp value={peak} />, hot: true, icon: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 1015 12a3 3 0 00-2.88 3.12z" clipRule="evenodd" /></svg> },
        { label: L.perHour, value: <CountUp value={vph} />, hot: false, icon: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg> },
    ];
    return (
        <Reveal className="w-full">
            <div className="relative overflow-hidden rounded-[28px] md:rounded-[36px] border border-white/10 bg-[#0a0a0a]/85 backdrop-blur-xl shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
                {/* cinematic ambient from thumbnail */}
                <img src={thumbnail} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-25 scale-110 pointer-events-none" />
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80 pointer-events-none" />
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-l from-transparent via-[#C9A24B] to-transparent" />
                <div className="relative p-5 sm:p-8 md:p-10">
                    {/* header */}
                    <div className="flex flex-wrap items-center gap-3 mb-6 md:mb-8 animate-fade-in-up">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#C9A24B] shadow-[0_0_14px_#C9A24B] animate-pulse shrink-0" />
                        <span className="text-[11px] font-black tracking-[0.35em] text-white/45 uppercase">{t.lastSessionReport}</span>
                        <span className="ms-auto flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-black px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-white/70">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                {fullDate} • {timeAgo(data.created_at)}
                            </span>
                            <span className={`text-[10px] font-black px-3 py-1.5 rounded-full border tracking-widest ${isSubOnly ? 'bg-amber-400/10 border-amber-400/40 text-amber-300' : 'bg-[#C9A24B]/10 border-[#C9A24B]/40 text-[#D9C08A]'}`}>
                                {isSubOnly ? t.subOnly : 'PUBLIC'}
                            </span>
                        </span>
                    </div>

                    {/* hero */}
                    <div className="flex flex-col lg:flex-row gap-6 md:gap-8 items-start">
                        <div className="[perspective:1200px] w-full lg:w-[380px] shrink-0 animate-fade-in-up" style={{ animationDelay: '80ms' }}>
                            <a href={vodUrl} target="_blank" rel="noopener noreferrer"
                                className="group relative block aspect-video rounded-2xl overflow-hidden border border-[#C9A24B]/30 bg-black shadow-[0_24px_60px_-16px_rgba(201,162,75,0.4)] [transform:rotateY(-7deg)_rotateX(2deg)] hover:[transform:rotateY(0deg)_rotateX(0deg)] transition-transform duration-700">
                                <img src={thumbnail} alt="Last Session" loading="lazy" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                                <span className="absolute top-3 start-3 text-[10px] font-black px-2.5 py-1 rounded-full bg-black/70 border border-white/15 text-white/80 backdrop-blur">VOD</span>
                                <span className="absolute inset-0 m-auto w-14 h-14 md:w-16 md:h-16 rounded-full bg-[#C9A24B]/25 backdrop-blur-md border border-[#C9A24B]/70 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 shadow-[0_0_36px_rgba(201,162,75,0.55)]">
                                    <svg className="w-6 h-6 text-white fill-current translate-x-[1px] rtl:-translate-x-[1px]" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                </span>
                                <span className="absolute bottom-3 end-3 text-[10px] font-black px-2.5 py-1 rounded-lg bg-black/75 border border-white/15 text-white" dir="ltr">{formatDuration(data.duration)}</span>
                                <span className="absolute bottom-3 start-3 inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-lg bg-black/75 border border-white/15 text-white" dir="ltr">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                    {compact(views)}
                                </span>
                            </a>
                            <span className="mt-3 w-full min-h-[48px] flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#F0DDAE] via-[#C9A24B] to-[#8A6A3A] text-black font-black text-sm shadow-[0_12px_30px_-10px_rgba(201,162,75,0.6)] active:scale-[0.98] transition-transform">
                                {L.watch}
                                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                            </span>
                        </div>

                        <div className="flex-1 min-w-0 w-full">
                            <div className="flex flex-wrap items-center gap-2 mb-3 animate-fade-in-up" style={{ animationDelay: '140ms' }}>
                                <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-white/[0.07] border border-white/10 text-white/70" dir="ltr">{data.language || 'AR'}</span>
                                <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-white/[0.07] border border-white/10 text-white/70">{data.is_mature ? '18+' : L.family}</span>
                                {catTags.map((tag, i) => <span key={i} className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#C9A24B]/10 border border-[#C9A24B]/30 text-[#D9C08A]" dir="ltr">#{tag}</span>)}
                            </div>
                            <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-white leading-snug mb-5 animate-fade-in-up" style={{ animationDelay: '180ms' }}>{data.session_title || data.title}</h3>
                            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-3">
                                {stats.map((s, i) => (
                                    <div key={i} className={`card-sheen relative overflow-hidden rounded-2xl border px-4 py-4 text-center backdrop-blur-md animate-fade-in-up ${s.hot ? 'bg-[#C9A24B]/[0.07] border-[#C9A24B]/25' : 'bg-white/[0.04] border-white/10'}`} style={{ animationDelay: `${220 + i * 80}ms` }}>
                                        <span className={`mx-auto w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${s.hot ? 'bg-[#C9A24B]/15 text-[#D9C08A]' : 'bg-white/[0.07] text-white/60'}`}>{s.icon}</span>
                                        <p className="text-lg sm:text-xl md:text-2xl font-black text-white">{s.value}</p>
                                        <p className="text-[9px] sm:text-[10px] font-bold text-white/35 uppercase tracking-widest mt-1">{s.label}</p>
                                    </div>
                                ))}
                            </div>

                            {/* recent sessions pulse */}
                            {sessions.length > 1 && (
                                <div className="mt-6 animate-fade-in-up" style={{ animationDelay: '540ms' }}>
                                    <p className="text-[10px] font-black tracking-[0.25em] text-white/30 uppercase mb-3">{L.pulse}</p>
                                    <div className="flex items-end gap-2 sm:gap-3 h-28 sm:h-32" dir="ltr">
                                        {sessions.map((s: any, i: number) => {
                                            const v = Number(s.views ?? s.video?.views ?? 0);
                                            const h = Math.max(10, Math.round((v / maxV) * 100));
                                            const cur = i === 0;
                                            return (
                                                <a key={s.id || i} href={vodUrlOf(s)} target="_blank" rel="noopener noreferrer" title={s.session_title || s.title}
                                                    className="flex-1 h-full flex flex-col items-center justify-end gap-1.5 group/bar min-w-0">
                                                    <span className={`text-[10px] sm:text-[11px] font-black ${cur ? 'text-[#D9C08A]' : 'text-white/45'}`} dir="ltr">{compact(v)}</span>
                                                    <span className="tier-bar w-full max-w-[90px] rounded-t-lg border-x border-t relative overflow-hidden"
                                                        style={{
                                                            height: `${h}%`, animationDelay: `${i * 120}ms`,
                                                            background: cur ? 'linear-gradient(to bottom, #C9A24B, #C9A24B55 60%, rgba(0,0,0,0.5))' : 'linear-gradient(to bottom, rgba(255,255,255,0.35), rgba(255,255,255,0.06))',
                                                            borderColor: cur ? '#C9A24B88' : 'rgba(255,255,255,0.15)',
                                                            boxShadow: cur ? '0 0 22px -4px rgba(201,162,75,0.7)' : 'none',
                                                        }}>
                                                        <span className="absolute top-0 inset-x-2 h-1 rounded-full bg-white/40 blur-[1px]" />
                                                    </span>
                                                    <span className={`w-full max-w-[90px] h-1.5 rounded-b bg-black/70 border-x border-b ${cur ? 'border-[#C9A24B]/50' : 'border-white/10'}`} />
                                                </a>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {data.categories?.length > 0 && (
                                <div className="mt-6 animate-fade-in-up" style={{ animationDelay: '620ms' }}>
                                    <p className="kicker text-white/30 mb-3" dir="ltr">// {t.categoriesSpent}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {data.categories.map((cat: any, i: number) => {
                                            const catName = cat.name || cat.category?.name || 'Just Chatting';
                                            const slug = cat.slug || cat.category?.slug || catName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
                                            const catImg = cat.banner?.url || cat.banner?.responsive || cat.category?.banner?.url || cat.category?.banner?.responsive || cat.responsive_url || cat.thumbnail?.url || cat.category?.responsive_url || cat.category?.thumbnail?.url || `https://files.kick.com/categories/${slug}/fullsize.png`;
                                            return (
                                                <span key={i} className="inline-flex items-center gap-2 bg-white/[0.05] border border-white/10 rounded-full ps-1 pe-3 py-1 hover:border-[#C9A24B]/40 transition-colors">
                                                    <span className="w-7 h-7 rounded-full overflow-hidden bg-black border border-white/10 block">
                                                        <img src={catImg} alt={catName} loading="lazy" className="w-full h-full object-cover"
                                                            onError={(e) => { const tg = e.target as HTMLImageElement; tg.src = tg.src.includes('picsum') ? DEFAULT_PROFILE_IMAGE : `https://picsum.photos/seed/${slug}/100/100`; }} />
                                                    </span>
                                                    <span className="text-[11px] font-bold text-white/75">{catName}</span>
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {clips && clips.length > 0 && (
                        <div className="mt-8 md:mt-10 pt-7 border-t border-white/[0.07] animate-fade-in-up" style={{ animationDelay: '680ms' }}>
                            <div className="flex items-center gap-2.5 mb-5">
                                <span className="w-2 h-2 rounded-full bg-[#C9A24B] shadow-[0_0_10px_rgba(201,162,75,0.8)]" />
                                <span className="text-[11px] font-black tracking-[0.25em] text-white/40 uppercase">{t.highlights}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 md:gap-4">
                                {clips.slice(0, 3).map((clip: any, i: number) => (
                                    <a key={clip.id || i} href={`https://kick.com/${CHANNEL_SLUG}?clip=${clip.id}`} target="_blank" rel="noopener noreferrer"
                                        className="group relative aspect-video rounded-xl md:rounded-2xl overflow-hidden border border-white/10 bg-black hover:border-[#C9A24B]/60 hover:-translate-y-1 transition-all duration-300">
                                        <img src={clip.thumbnail_url || clip.thumbnail?.url || PC_BACKGROUND} alt={clip.title} loading="lazy"
                                            className="w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                                        <span className="absolute top-1.5 start-1.5 w-5 h-5 md:w-6 md:h-6 rounded-lg bg-black/70 border border-white/15 text-white/80 text-[9px] md:text-[10px] font-black flex items-center justify-center backdrop-blur" dir="ltr">{i + 1}</span>
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-[#C9A24B]/25 backdrop-blur border border-[#C9A24B]/60 flex items-center justify-center">
                                                <svg className="w-4 h-4 md:w-5 md:h-5 text-white fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                            </span>
                                        </div>
                                        <div className="absolute bottom-0 inset-x-0 p-2 md:p-3">
                                            <p className="text-[8px] md:text-[11px] font-bold text-white truncate">{clip.title}</p>
                                            <p className="text-[7px] md:text-[10px] text-white/45 font-medium" dir="ltr">{clip.view_count || 0} {lang === 'en' ? 'views' : 'مشاهدة'}</p>
                                        </div>
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Reveal>
    );
};

// --- Unified brown identity (like the logo) — one calm wash for every platform ---
const UNIFIED_ICON = '#D9C08A';
const UNIFIED_WASH = 'linear-gradient(135deg, rgba(201,162,75,0.14), rgba(201,162,75,0.04) 55%, transparent)';
const BRAND_GRADIENTS: Record<string, string> = {
    KICK: UNIFIED_WASH,
    Snapchat: UNIFIED_WASH,
    Instagram: UNIFIED_WASH,
    TikTok: UNIFIED_WASH,
    X: UNIFIED_WASH,
    WhatsApp: UNIFIED_WASH,
    Discord: UNIFIED_WASH,
    YouTube: UNIFIED_WASH,
};

// --- Social Card — brown luxury edition (logo colors, calm + beautiful) ---
const SocialCard: React.FC<{ social: SocialLink; index: number; featured?: boolean; lang: Language }> = ({ social, index, featured = false, lang }) => {
    const [hover, setHover] = useState(false);
    const [launching, setLaunching] = useState(false);
    const go = (e: React.MouseEvent) => {
        e.preventDefault();
        if (launching) return;
        setLaunching(true);
        window.setTimeout(() => { window.location.href = social.url; }, 350);
    };
    const active = hover || launching;
    const followLabel = lang === 'ar' ? 'تابع' : 'Visit';
    const card = (
        <div
            className="relative h-full rounded-[24px] overflow-hidden transition-transform duration-300 ease-out group-hover:-translate-y-1.5 group-active:translate-y-0 group-active:scale-[0.99] border"
            style={{
                background: 'linear-gradient(165deg, #17100A 0%, #0E0A06 45%, #0B0805 100%)',
                borderColor: active ? 'rgba(217,192,138,0.65)' : featured ? 'rgba(201,162,75,0.4)' : 'rgba(255,255,255,0.09)',
                boxShadow: active
                    ? '0 22px 50px -20px rgba(201,162,75,0.4), inset 0 1px 0 rgba(240,221,174,0.22)'
                    : '0 12px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
        >
            {/* warm wash + faint dot texture */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: UNIFIED_WASH, opacity: active ? 0.9 : 0.55 }} />
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.5]"
                style={{ backgroundImage: 'radial-gradient(rgba(217,192,138,0.13) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
            />
            {/* top gold hairline */}
            <span
                className="absolute top-0 start-8 end-8 h-[2px] rounded-full transition-opacity duration-300"
                style={{ background: 'linear-gradient(90deg, transparent, #D9C08A, transparent)', opacity: active || featured ? 1 : 0.4 }}
            />
            {/* hover-only sheen sweep (no infinite animation = smooth) */}
            <span className="absolute inset-y-0 -left-2/3 w-2/3 rotate-12 bg-gradient-to-r from-transparent via-white/[0.09] to-transparent -translate-x-[120%] group-hover:translate-x-[320%] transition-transform duration-[900ms] ease-out pointer-events-none" />
            {featured && <span className="absolute inset-y-3 start-0 w-[3px] rounded-full bg-gradient-to-b from-[#F0DDAE] via-[#C9A24B] to-[#8A6A3A]" />}
            {launching && <span className="absolute bottom-0 start-0 h-[3px] animate-charge z-30" style={{ width: '100%', background: 'linear-gradient(90deg, #8A6A3A, #D9C08A)' }} />}

            <div className={`relative p-4 sm:p-5 flex items-center gap-3.5 sm:gap-4 ${featured ? 'min-h-[136px]' : 'min-h-[108px]'}`}>
                {/* icon medallion — engraved gold */}
                <div className="relative shrink-0">
                    <div
                        className={`${featured ? 'w-[70px] h-[70px]' : 'w-[62px] h-[62px]'} rounded-[20px] flex items-center justify-center transition-all duration-300 group-hover:scale-[1.06] group-hover:-rotate-3`}
                        style={{
                            color: active ? '#0B0906' : UNIFIED_ICON,
                            background: active
                                ? 'linear-gradient(180deg, #FFF3D6 0%, #E8D5A8 35%, #C9A24B 75%, #8A6A3A 100%)'
                                : 'linear-gradient(165deg, rgba(201,162,75,0.22), rgba(201,162,75,0.06) 60%, rgba(0,0,0,0.35))',
                            border: `1.5px solid ${active ? '#F0DDAE' : 'rgba(217,192,138,0.35)'}`,
                            boxShadow: active
                                ? '0 10px 26px -8px rgba(201,162,75,0.65), inset 0 1px 0 rgba(255,255,255,0.6)'
                                : 'inset 0 1px 0 rgba(240,221,174,0.18), 0 8px 20px rgba(0,0,0,0.45)',
                        }}
                    >
                        {launching
                            ? <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            : social.icon}
                        {/* tiny sparkle dot */}
                        <span className="absolute -top-1 -end-1 w-3.5 h-3.5 rounded-full bg-[#0B0906] border border-[#C9A24B]/60 flex items-center justify-center">
                            <span className="w-1 h-1 rounded-full bg-[#D9C08A]" />
                        </span>
                    </div>
                </div>

                {/* texts */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-[#D9C08A]/90">
                            <span className="w-1 h-1 rotate-45 bg-[#C9A24B] inline-block" />
                            {launching ? 'OPENING…' : social.name}
                        </span>
                        {featured && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black px-2.5 py-[4px] rounded-full text-black tracking-[0.14em]" style={{ background: 'linear-gradient(180deg, #F0DDAE, #C9A24B)' }}>
                                ★ {lang === 'ar' ? 'الأساسية' : 'MAIN'}
                            </span>
                        )}
                    </div>
                    <p className={`font-black text-white truncate leading-tight mt-1 ${featured ? 'text-[23px] sm:text-[26px]' : 'text-[17px] sm:text-lg'}`} dir="ltr" style={{ textShadow: '0 2px 14px rgba(0,0,0,0.6)' }}>
                        {social.username}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 min-w-0">
                        {social.followerCount && (
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-[#F0DDAE] rounded-full bg-black/45 border border-[#C9A24B]/30 px-2.5 py-1" dir="ltr">
                                <svg className="w-3 h-3 text-[#D9C08A]" fill="currentColor" viewBox="0 0 20 20"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" /></svg>
                                {social.followerCount}
                            </span>
                        )}
                        {social.specialDetail && <span className="text-[11px] text-white/45 font-bold truncate">{social.specialDetail}</span>}
                    </div>
                </div>

                {/* CTA — pill arrow */}
                <span className="shrink-0 flex flex-col items-center gap-1.5">
                    <span
                        className={`flex items-center justify-center rounded-full transition-all duration-300 ${featured ? 'w-12 h-12' : 'w-11 h-11'} ${active ? '-translate-x-0.5 rtl:translate-x-0.5' : ''}`}
                        style={{
                            background: active ? 'linear-gradient(180deg, #FFF3D6, #C9A24B)' : 'rgba(201,162,75,0.1)',
                            color: active ? '#0B0906' : '#F0DDAE',
                            border: `1.5px solid ${active ? '#F0DDAE' : 'rgba(217,192,138,0.35)'}`,
                            boxShadow: active ? '0 8px 22px -6px rgba(201,162,75,0.7)' : 'none',
                        }}
                    >
                        <svg className="w-5 h-5 rtl:rotate-180 transition-transform duration-300 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    </span>
                    <span className={`text-[9px] font-black tracking-[0.18em] transition-colors duration-300 ${active ? 'text-[#F0DDAE]' : 'text-white/30'}`}>
                        {followLabel}
                    </span>
                </span>
            </div>
            {/* bottom progress hairline */}
            <span className="absolute bottom-0 start-8 end-8 h-[2px] rounded-full overflow-hidden bg-white/[0.06]">
                <span className="block h-full rounded-full transition-all duration-500" style={{ width: active ? '100%' : featured ? '45%' : '22%', background: 'linear-gradient(90deg, #8A6A3A, #D9C08A)' }} />
            </span>
        </div>
    );
    return (
        <a href={social.url} onClick={go} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
            style={{ animationDelay: `${Math.min(index * 60, 400)}ms` }}
            className={`group relative block animate-fade-in-up select-none rounded-[24px] ${launching ? 'z-40' : ''} ${featured ? 'sm:col-span-2' : ''}`}
            title={`${social.name} - Firas Official`} aria-label={lang === 'ar' ? `تابع Firas على ${social.name}` : `Visit Firas on ${social.name}`}>
            {featured ? (
                <div className="rounded-[26px] p-[1.5px] transition-shadow duration-300" style={{ background: 'linear-gradient(120deg, #F0DDAE 0%, #C9A24B 30%, rgba(201,162,75,0.15) 55%, #C9A24B 75%, #8A6A3A 100%)', boxShadow: hover ? '0 24px 60px -22px rgba(201,162,75,0.5)' : '0 16px 40px -22px rgba(201,162,75,0.3)' }}>
                    <div className="rounded-[24.5px] bg-[#0b0b0b]">{card}</div>
                </div>
            ) : (
                <div className="rounded-[26px] p-px transition-all duration-300" style={{ background: hover ? 'linear-gradient(120deg, rgba(217,192,138,0.5), rgba(217,192,138,0.08))' : 'transparent' }}>
                    {card}
                </div>
            )}
        </a>
    );
};

// ============ SUPPORT — modern glass system (no leaderboard, removed per request) ============
type Supporter = { id: number; name: string; amount: number; currency: string; message?: string; source: string; created_at: string };

// Special alert tiers — static prestige cards (display only, no interaction)
const TIERS = [
    { amount: 50, label: '50$', c: '#E8D5A8', glow: 'rgba(232,213,168,0.35)', name: 'BRONZE', nameAr: 'برونزي', icon: '✦' },
    { amount: 100, label: '100$', c: '#D9C08A', glow: 'rgba(217,192,138,0.4)', name: 'SILVER', nameAr: 'فضي', icon: '⬣' },
    { amount: 200, label: '200$', c: '#C9A24B', glow: 'rgba(201,162,75,0.45)', name: 'GOLD', nameAr: 'ذهبي', icon: '◈', popular: true },
    { amount: 500, label: '500$', c: '#A8823F', glow: 'rgba(168,130,63,0.45)', name: 'DIAMOND', nameAr: 'ماسي', icon: '⬥' },
    { amount: 1000, label: '1000$', c: '#8A6A3A', glow: 'rgba(138,106,58,0.5)', name: 'RUBY', nameAr: 'أسطوري', icon: '❖' },
];

const AlertTiers: React.FC<{ title: string; note: string; lang: Language }> = ({ title, note, lang }) => {
    const max = 1000;
    const isAr = lang === 'ar';
    return (
        <div id="store" className="relative mt-4 md:mt-5 rounded-[28px] border border-white/10 bg-white/[0.03] overflow-hidden scroll-mt-32">
            <div className="absolute -top-24 start-1/4 w-96 h-96 rounded-full bg-[#C9A24B]/[0.08] blur-[110px] pointer-events-none" aria-hidden="true" />
            <div className="absolute -bottom-24 end-0 w-80 h-80 rounded-full bg-[#8A6A3A]/[0.10] blur-[100px] pointer-events-none" aria-hidden="true" />
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-[#C9A24B]/70 to-transparent" aria-hidden="true" />
            <div className="relative p-5 sm:p-7 md:p-8">
                <div className="flex items-center justify-center gap-2.5 mb-5 md:mb-6">
                    <span className="h-px w-8 sm:w-14 bg-gradient-to-l from-transparent to-[#C9A24B]/70" aria-hidden="true" />
                    <span className="w-1.5 h-1.5 rotate-45 bg-[#C9A24B] inline-block" aria-hidden="true" />
                    <p className="text-[11px] md:text-xs font-black text-white/60 tracking-[0.32em] uppercase">{title}</p>
                    <span className="w-1.5 h-1.5 rotate-45 bg-[#C9A24B] inline-block" aria-hidden="true" />
                    <span className="h-px w-8 sm:w-14 bg-gradient-to-r from-transparent to-[#C9A24B]/70" aria-hidden="true" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3" role="list">
                    {TIERS.map((tr) => {
                        const pct = Math.max(8, Math.round((tr.amount / max) * 100));
                        return (
                            <div key={tr.label} role="listitem"
                                className={`group relative text-start rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.015] p-4 sm:p-5 overflow-hidden transition-all duration-500 hover:-translate-y-1.5 hover:border-white/25 hover:shadow-[0_24px_60px_-18px_rgba(0,0,0,0.85)] ${tr.popular ? 'border-[#C9A24B]/40 -translate-y-1' : ''}`}>
                                <div className="absolute inset-0 opacity-70 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                                    style={{ background: `radial-gradient(220px circle at 50% 0%, ${tr.glow}, transparent 70%)` }} aria-hidden="true" />
                                {tr.popular && (
                                    <span className="absolute top-3 end-3 text-[8px] font-black tracking-[0.18em] px-2 py-1 rounded-full bg-[#C9A24B] text-black shadow-[0_0_18px_rgba(201,162,75,0.7)]">HOT</span>
                                )}
                                <span className="relative w-10 h-10 rounded-2xl flex items-center justify-center text-lg font-black border border-white/15 bg-white/[0.06] transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6"
                                    style={{ color: tr.c, boxShadow: `0 0 24px ${tr.glow}` }}>{tr.icon}</span>
                                <p className="relative text-2xl sm:text-[26px] font-black text-white tracking-tight mt-3" dir="ltr">{tr.label}</p>
                                <p className="relative text-[10px] font-black tracking-[0.22em] mt-1" style={{ color: tr.c }} dir="ltr">{tr.name}</p>
                                <p className="relative text-[11px] font-bold text-white/45 mt-0.5">{isAr ? tr.nameAr : tr.name}</p>
                                <div className="relative mt-3 h-1.5 rounded-full bg-white/[0.07] overflow-hidden" dir="ltr">
                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${tr.c}, ${tr.c}88)`, boxShadow: `0 0 12px ${tr.glow}` }} />
                                </div>
                                <span className="absolute bottom-0 start-0 h-[2px] w-0 group-hover:w-full transition-all duration-500" style={{ background: tr.c, boxShadow: `0 0 12px ${tr.c}` }} aria-hidden="true" />
                            </div>
                        );
                    })}
                </div>
                <p className="text-center text-[10px] text-white/30 mt-6 font-medium tracking-wide">{note}</p>
            </div>
        </div>
    );
};

// Modern donate gate — glass, glow orbs, magnetic CTA, smooth micro-interactions
const DonateGate: React.FC<{
    lang: Language; title: string; url: string;
    color: string; color2?: string; label: string;
    markImg?: string; glyph?: string;
    secure: string; cta: string; sub: string;
}> = ({ lang, title, url, color, color2, label, markImg, glyph = '$', secure, cta, sub }) => {
    const [hover, setHover] = useState(false);
    const [busy, setBusy] = useState(false);
    const go = (e: React.MouseEvent) => {
        e.preventDefault(); if (busy) return; setBusy(true);
        window.setTimeout(() => { window.open(url, '_blank'); window.setTimeout(() => setBusy(false), 600); }, 350);
    };
    const ctaBg = color2 ? `linear-gradient(135deg, ${color}, ${color2})` : `linear-gradient(135deg, #fff 0%, ${color} 60%, ${color})`;
    const ctaColor = color2 ? '#fff' : '#06281f';
    return (
        <a href={url} onClick={go} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
            className="group relative block rounded-[28px] transition-transform duration-500 hover:-translate-y-1.5 active:translate-y-0 active:scale-[0.99]" aria-label={`${title} donation`}>
            <div className="absolute -inset-2 rounded-[32px] blur-3xl pointer-events-none transition-opacity duration-700" style={{ background: `linear-gradient(150deg, ${color}40, ${color2 ? color2 + '33' : 'transparent'} 60%, transparent)`, opacity: hover ? 1 : 0.5 }} aria-hidden="true" />
            <div className="relative rounded-[28px] border border-white/10 bg-[#100C07]/95 overflow-hidden transition-all duration-500 group-hover:border-[#C9A24B]/40 group-hover:shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)]">
                <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(420px circle at 85% -10%, ${color}26, transparent 65%), radial-gradient(320px circle at 0% 110%, ${color2 || color}1f, transparent 60%)` }} aria-hidden="true" />
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-white/40 to-transparent" aria-hidden="true" />
                <span className="absolute top-4 end-4 inline-flex items-center gap-1.5 text-[9px] font-black tracking-[0.2em] px-2.5 py-1.5 rounded-full bg-black/50 border border-white/15 text-white/60 backdrop-blur">
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
                    {busy ? (lang === 'en' ? 'OPENING…' : 'جاري الفتح…') : 'LIVE'}
                </span>
                <div className="relative p-5 sm:p-7">
                    <div className="flex items-center gap-4">
                        <span className="relative w-[68px] h-[68px] sm:w-20 sm:h-20 rounded-[22px] flex items-center justify-center shrink-0 overflow-hidden border border-white/20 bg-black/40 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3"
                            style={{ boxShadow: hover ? `0 18px 44px -12px ${color}aa, inset 0 1px 0 rgba(255,255,255,0.25)` : `0 12px 30px -12px ${color}77, inset 0 1px 0 rgba(255,255,255,0.15)` }}>
                            {markImg
                                ? <img src={markImg} alt={`${title} logo`} className="w-full h-full object-cover" loading="lazy" />
                                : <span className="text-3xl font-black" style={{ color }}>{glyph}</span>}
                            <span className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black tracking-[0.3em] uppercase" style={{ color }}>{label}</p>
                            <h3 className="font-black text-white tracking-tight leading-none text-[24px] sm:text-4xl mt-1 break-words" dir="ltr">{title}</h3>
                            <p className="text-[12px] text-white/50 font-medium mt-1.5 leading-relaxed">{sub}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-4">
                        {[(lang === 'en' ? 'Instant alert' : 'تنبيه فوري'), (lang === 'en' ? 'On-screen name' : 'اسمك على الشاشة')].map((f) => (
                            <span key={f} className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-white/60">
                                <svg className="w-3 h-3" style={{ color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                {f}
                            </span>
                        ))}
                    </div>
                    <span className="mt-5 w-full min-h-[56px] inline-flex items-center justify-between gap-3 rounded-2xl ps-5 pe-2 py-2 font-black text-sm transition-all duration-300 group-hover:brightness-110"
                        style={{ background: ctaBg, color: ctaColor, boxShadow: hover ? `0 0 32px ${color}88, 0 16px 40px -12px ${color}66` : `0 12px 28px -12px ${color}66` }}>
                        <span className="inline-flex items-center gap-2">
                            {busy
                                ? <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                : null}
                            {cta}
                        </span>
                        <span className="w-11 h-11 rounded-xl bg-black/20 flex items-center justify-center transition-transform duration-300 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 rtl:rotate-180">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                        </span>
                    </span>
                    <p className="mt-3 flex items-center justify-center gap-1.5 text-[9px] font-bold tracking-[0.2em] text-white/35 uppercase">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        {secure}
                    </p>
                </div>
            </div>
        </a>
    );
};

const SupportArena: React.FC<{ lang: Language; supporters: Supporter[] }> = ({ lang }) => {
    const t = TRANSLATIONS[lang];
    return (
        <div className="w-full">
            {/* gates — modern glass duo */}
            <div className="relative">
                <div className="absolute -top-10 right-0 w-64 h-64 rounded-full bg-[#C9A24B]/10 blur-[90px] pointer-events-none" aria-hidden="true" />
                <div className="absolute -bottom-10 left-0 w-72 h-72 rounded-full bg-[#8A6A3A]/15 blur-[100px] pointer-events-none" aria-hidden="true" />
                <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-5" dir="rtl">
                    <DonateGate lang={lang} title="STREAMLABS" url="https://streamlabs.com/vfiras0" color="#C9A24B" markImg="/21785434543.png"
                        label={lang === 'en' ? 'STREAMLABS' : 'ستريم لابس'} secure={lang === 'en' ? 'SECURE • INSTANT' : 'آمن • فوري'} cta={lang === 'en' ? 'Donate via Streamlabs' : 'ادعم عبر ستريم لابس'}
                        sub={lang === 'en' ? 'Cards • instant alert' : 'بطاقات • تنبيه فوري'} />
                    <DonateGate lang={lang} title="DOKAN & CREATORS" url="https://tip.dokan.sa/vfiras" color="#C9A24B" color2="#8A6A3A" markImg="/2452444.png"
                        label={lang === 'en' ? 'DOKAN • SEND TIP' : 'دكان • إرسال دعم'}
                        secure={lang === 'en' ? 'SECURE • MADA' : 'آمن • مدى'} cta={lang === 'en' ? 'Donate via Dokan' : 'ادعم عبر دكان'}
                        sub={lang === 'en' ? 'Mada • Apple Pay' : 'مدى • آبل باي'} />
                </div>
            </div>

            <AlertTiers lang={lang} title={t.tiersTitle} note={lang === 'en' ? 'Non-refundable • live name' : 'غير قابلة للاسترداد • اسمك يظهر live'} />
        </div>
    );
};

export default function App() {
    const [theaterWide, setTheaterWide] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [galleryRoute, setGalleryRoute] = useState<GalleryRoute>(() => galleryRouteFromLocation());
    useEffect(() => {
        const onRoute = () => setGalleryRoute(galleryRouteFromLocation());
        window.addEventListener('hashchange', onRoute);
        window.addEventListener('popstate', onRoute);
        return () => {
            window.removeEventListener('hashchange', onRoute);
            window.removeEventListener('popstate', onRoute);
        };
    }, []);
    useEffect(() => {
        document.body.style.overflow = galleryRoute !== 'home' ? 'hidden' : '';
    }, [galleryRoute]);
    // مسار الإدارة السري — لا يظهر إلا بكتابة /admin يدوياً
    const [isAdminPath] = useState(() => window.location.pathname === '/admin');
    useEffect(() => {
        if (!isAdminPath) return;
        document.title = 'Console';
        const m = document.createElement('meta');
        m.name = 'robots';
        m.content = 'noindex, nofollow, noarchive';
        document.head.appendChild(m);
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, [isAdminPath]);
    const [lang, setLang] = useState<Language>('ar');
    const [view, setView] = useState<'home' | 'game'>('home');
    const openGame = () => setView('game');
    const closeGame = () => setView('home');
    const [branding] = useState({ profileImage: DEFAULT_PROFILE_IMAGE, bannerImage: PC_BACKGROUND });

    const [socialStats, setSocialStats] = useState<Record<string, string>>({
        'KICK': '121.1K', 'TikTok': '45.8K',
        'X': '68.6K', 'WhatsApp': '36K', 'Discord': '10.5K'
    });

    const [socials, setSocials] = useState<SocialLink[]>(() => buildDefaultSocials({
        'KICK': '121.1K', 'TikTok': '45.8K',
        'X': '68.6K', 'WhatsApp': '36K', 'Discord': '10.5K'
    }));
    const [lastSession, setLastSession] = useState<any>(null);
    const [pastSessions, setPastSessions] = useState<any[]>([]);
    const [clips, setClips] = useState<any[]>([]);

    // Live social counters — dedicated 5-minute loop + instant cache paint (API-style)
    useEffect(() => {
        const apply = (stats: { instagram?: number; tiktok?: number; twitter?: number; youtube?: number }) => {
            setSocialStats(prev => ({
                ...prev,
                'Instagram': formatFollowerCount(stats.instagram || 0),
                'TikTok': formatFollowerCount(stats.tiktok || 0),
                'X': formatFollowerCount(stats.twitter || 0),
                'YouTube': formatFollowerCount(stats.youtube || 0),
            }));
        };
        const cached = readSocialCache();
        if (cached) apply(cached);
        let dead = false;
        const refreshSocials = () => {
            getAllSocialMediaStats().then(stats => { if (!dead) apply(stats); }).catch(() => {});
        };
        refreshSocials();
        const socialInterval = setInterval(refreshSocials, SOCIAL_TTL_MS);
        return () => { dead = true; clearInterval(socialInterval); };
    }, []);

    useEffect(() => {
        setSocials(buildDefaultSocials(socialStats));
    }, [socialStats]);

    const [streamInfo, setStreamInfo] = useState({ isLive: false, viewers: 0, title: '', category: '', tags: [] as string[] });
    const t = TRANSLATIONS[lang];

    const fetchKickStatus = useCallback(async () => {
        try {
            const data = await kickFetch(`https://kick.com/api/v2/channels/${CHANNEL_SLUG}`, true);
            if (data) {
                const livestreamData = data.livestream || data.live_stream;
                const isLive = livestreamData && (livestreamData.is_live === true || livestreamData.is_live === 1);
                if (isLive) {
                    setStreamInfo({
                        isLive: true,
                        viewers: livestreamData.viewer_count || 0,
                        title: livestreamData.session_title || livestreamData.title || 'Live Stream',
                        category: livestreamData.categories?.[0]?.name || 'Just Chatting',
                        tags: livestreamData.tags ? livestreamData.tags.map((tg: any) => tg.name || tg) : []
                    });
                } else setStreamInfo(prev => ({ ...prev, isLive: false }));
                if (data.followers_count !== undefined) {
                    const count = data.followers_count;
                    setSocialStats(prev => ({ ...prev, 'KICK': count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count.toString() }));
                }
                const videosRawDataPromise = kickFetch(`https://kick.com/api/v2/channels/${CHANNEL_SLUG}/videos`, true);
                const clipsRawDataPromise = kickFetch(`https://kick.com/api/v2/channels/${CHANNEL_SLUG}/clips?limit=5`, true);
                const [videosRawData, clipsRawData] = await Promise.all([videosRawDataPromise, clipsRawDataPromise]);
                const videosArray = videosRawData?.videos || (Array.isArray(videosRawData) ? videosRawData : []);
                if (videosArray?.length > 0) { setLastSession(videosArray[0]); setPastSessions(videosArray.slice(1, 4)); }
                else {
                    const streams = data.previous_livestreams || data.recent_streams || [];
                    if (streams?.length > 0) { setLastSession(streams[0]); setPastSessions(streams.slice(1, 4)); }
                }
                const clipsData = clipsRawData?.data || clipsRawData;
                const clipsArray = clipsData?.clips || (Array.isArray(clipsData) ? clipsData : (clipsData?.data && Array.isArray(clipsData.data) ? clipsData.data : []));
                setClips((clipsArray || []).slice(0, 3));
            }
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        fetchKickStatus();
        const kickInterval = setInterval(fetchKickStatus, 60000);
        return () => clearInterval(kickInterval);
    }, [fetchKickStatus]);

    const handleShare = async () => {
        const shareUrl = "https://kick.com/firas";
        if (navigator.share) { try { await navigator.share({ title: t.shareTitle, text: t.shareText, url: shareUrl }); } catch { /* dismissed */ } }
        else { try { await navigator.clipboard.writeText(shareUrl); } catch { /* clipboard blocked */ } alert(t.copied); }
    };

    const displayTitle = streamInfo.isLive ? streamInfo.title : t.defaultStreamTitle;
    const displayCategory = streamInfo.isLive ? streamInfo.category : t.defaultCategory;
    const kickCard = socials.find(s => s.name === 'KICK');
    const restSocials = socials.filter(s => s.name !== 'KICK');

    useEffect(() => {
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    }, [lang]);

    // صفحة الإدارة السرية — تُعرض وحدها بدون أي محتوى من الموقع
    if (isAdminPath) {
        return (
            <div className={`grain relative min-h-screen w-full overflow-hidden bg-[#0B0906] ${lang === 'ar' ? 'font-arabic' : 'font-sans'}`}>
                <ArenaBackground />
                <GalleryAdmin lang={lang} onClose={() => { window.location.href = '/'; }} />
            </div>
        );
    }

    return (
        <div className={`grain relative min-h-screen w-full overflow-x-hidden ${lang === 'ar' ? 'font-arabic' : 'font-sans'}`}>
                <>
                    <ArenaBackground />
                    <div className={`relative ${galleryRoute === 'gallery' ? 'z-[90]' : 'z-20'}`}>
                        <SiteHeader
                            lang={lang}
                            onToggleLang={() => setLang(p => p === 'en' ? 'ar' : 'en')}
                            profileImage={branding.profileImage}
                            headerTitle={t.headerTitle}
                            isLive={streamInfo.isLive}
                            viewers={streamInfo.viewers}
                            statusText={streamInfo.isLive ? t.status : t.statusOffline}
                            onOpenSearch={() => setSearchOpen(true)}
                            onNavigate={() => {
                                // عند التنقل من صفحة المعرض: أغلقها أولاً ليعمل السكرول
                                if (galleryRoute !== 'home') setGalleryRoute('home');
                            }}
                        />
                    </div>
                    <div className="relative z-10 w-full max-w-[1200px] mx-auto px-3 sm:px-4 md:px-8 pb-10 overflow-clip">

                        {/* ===== HERO — فراس بالنص مع فراغ كبير فوق وتحت ===== */}
                        <section id="top" className="relative min-h-[46vh] md:min-h-[54vh] flex items-center justify-center py-16 md:py-24 overflow-clip">
                            <div className="relative mx-auto w-full max-w-2xl text-center">
                                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[220px] rounded-full bg-[#C9A24B]/[0.08] blur-[100px] pointer-events-none" aria-hidden="true" />
                                <h1 className="animate-fade-in-up relative font-heading font-black text-white leading-[1.05] tracking-tight text-[clamp(3rem,10vw,5.2rem)]" style={{ animationDelay: '120ms', textShadow: '0 4px 40px rgba(0,0,0,0.6)' }}>
                                    {lang === 'ar' ? (
                                        <>
                                            {t.nameAr}
                                            <span className="gold-text"> • </span>
                                            <span dir="ltr" className="hero-firas">FIRAS</span>
                                        </>
                                    ) : (
                                        <span dir="ltr" className="hero-firas">FIRAS</span>
                                    )}
                                </h1>
                                <div className="animate-fade-in-up flex items-center justify-center gap-3 mt-4" style={{ animationDelay: '260ms' }} aria-hidden="true">
                                    <span className="h-px w-16 sm:w-24 bg-gradient-to-l from-transparent via-[#C9A24B]/70 to-transparent" />
                                    <span className="w-1.5 h-1.5 rotate-45 bg-[#C9A24B] inline-block shadow-[0_0_12px_rgba(201,162,75,0.8)]" />
                                    <span className="h-px w-16 sm:w-24 bg-gradient-to-r from-transparent via-[#C9A24B]/70 to-transparent" />
                                </div>
                            </div>
                        </section>

                        {/* ===== SOCIALS BENTO — لازق بالبانر بدون فراغ ===== */}
                        <section id="socials" className="pt-2 md:pt-3 scroll-mt-28">
                            <Reveal><SectionHeading no="01" title={t.socialsTitle} sub={t.socialsSub} en="SOCIAL ARENA" /></Reveal>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                                {kickCard && (
                                    <Reveal delay={0} className="sm:col-span-2">
                                        <SocialCard social={kickCard} index={0} featured lang={lang} />
                                    </Reveal>
                                )}
                                {restSocials.map((s, i) => (
                                    <Reveal key={s.name} delay={Math.min(i * 60, 300)}>
                                        <SocialCard social={s} index={i + 1} lang={lang} />
                                    </Reveal>
                                ))}
                            </div>
                        </section>

                        {/* ===== LIVE THEATER ===== */}
                        {streamInfo.isLive && (
                            <section id="live" className="pt-6 md:pt-8 scroll-mt-28 animate-slide-down">
                                <Reveal><SectionHeading no="02" title={t.theaterTitle} sub={`${streamInfo.viewers.toLocaleString()} ${t.viewers}`} en="LIVE THEATER" /></Reveal>
                                <div className="relative rounded-[28px] p-[1px] bg-gradient-to-b from-[#C9A24B]/60 via-white/10 to-transparent shadow-[0_30px_90px_rgba(201,162,75,0.18)]">
                                    <div className="rounded-[27px] bg-[#080808] overflow-hidden">
                                    <div className="flex items-center gap-2.5 px-4 md:px-6 py-3 border-b border-white/[0.07] bg-black/60">
                                        <span className="flex gap-1.5" aria-hidden="true">
                                            <span className="w-2.5 h-2.5 rounded-full bg-[#C9A24B]/80" />
                                            <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
                                            <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-[0.24em] text-[#53FC18]" dir="ltr">
                                            <span className="w-1.5 h-1.5 rounded-full bg-[#53FC18] animate-pulse" />LIVE
                                        </span>
                                        <span className="ms-auto text-[11px] font-black text-white/45" dir="ltr">{streamInfo.viewers.toLocaleString()} {t.viewers}</span>
                                        <a href={`https://kick.com/${CHANNEL_SLUG}`} target="_blank" rel="noopener noreferrer" title={lang === 'en' ? 'Watch on Kick' : 'مشاهدة البث على كيك'} aria-label={lang === 'en' ? 'Watch on Kick' : 'مشاهدة البث على كيك'} className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/10 text-white/60 hover:text-[#D9C08A] hover:border-[#C9A24B]/50 flex items-center justify-center transition-all active:scale-95">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                        </a>
                                        <button type="button" onClick={() => setTheaterWide((v) => !v)} title={theaterWide ? (lang === 'en' ? 'Show chat' : 'إظهار الشات') : (lang === 'en' ? 'Theater mode' : 'وضع المسرح')} aria-pressed={theaterWide} className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all active:scale-95 ${theaterWide ? 'bg-[#C9A24B] border-[#C9A24B] text-black shadow-[0_0_16px_rgba(201,162,75,0.6)]' : 'bg-white/[0.05] border-white/10 text-white/60 hover:text-[#D9C08A] hover:border-[#C9A24B]/50'}`}>
                                            {theaterWide ? (
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" /></svg>
                                            ) : (
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
                                            )}
                                        </button>
                                    </div>
                                    <div className={theaterWide ? 'flex flex-col gap-0 items-stretch min-h-0' : 'flex flex-col xl:flex-row gap-0 items-stretch min-h-0'}>
                                        <div className="flex-1 min-w-0 p-3 md:p-4">
                                            <div className="aspect-video rounded-2xl overflow-hidden bg-black border border-[#C9A24B]/20">
                                                <StreamPlayer lang={lang} isLive={streamInfo.isLive} viewers={streamInfo.viewers} channelSlug={CHANNEL_SLUG} poster={branding.bannerImage} />
                                            </div>
                                            <div className="p-4 md:p-5 flex flex-col gap-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <a href={`https://kick.com/${CHANNEL_SLUG}`} target="_blank" rel="noopener noreferrer" title={lang === 'en' ? 'Watch on Kick' : 'مشاهدة البث على كيك'}>
                                                            <h3 className="text-lg md:text-2xl font-black text-white truncate hover:text-[#D9C08A] transition-colors" title={displayTitle}>{displayTitle}</h3>
                                                        </a>
                                                        <p className="text-sm text-white/50 font-bold mt-1"><span className="gold-text font-black" dir="ltr">FIRAS</span> <span className="text-white/25 mx-1">•</span> {displayCategory}</p>
                                                    </div>
                                                    <button onClick={handleShare} aria-label="Share"
                                                        className="btn-arena w-11 h-11 rounded-xl bg-white/[0.06] border border-white/10 text-white/70 hover:text-white flex items-center justify-center shrink-0">
                                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                                                    </button>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/[0.07]">
                                                    <span className="px-2.5 py-1 rounded-lg bg-[#53FC18]/10 border border-[#53FC18]/30 text-[#53FC18] text-[10px] font-black uppercase tracking-wider animate-tick">{t.dropsEnabled}</span>
                                                    {streamInfo.tags.length > 0
                                                        ? streamInfo.tags.map((tag, i) => <span key={i} className="px-2.5 py-1 rounded-lg bg-white/[0.05] text-white/55 text-[11px] font-bold">#{tag}</span>)
                                                        : <span className="text-white/30 text-xs italic">{t.noTags}</span>}
                                                </div>
                                            </div>
                                        </div>
                                        {!theaterWide && (
                                        <div className="w-full xl:w-[360px] shrink-0 min-h-0 min-w-0 p-3 md:p-4 xl:ps-0 flex flex-col">
                                            <div className="flex flex-col min-h-0 h-[480px] sm:h-[520px] xl:h-[600px] 2xl:h-[620px] rounded-2xl overflow-hidden border border-white/10">
                                                <ChatWidget lang={lang} isDemo={false} />
                                            </div>
                                        </div>
                                        )}
                                    </div>
                                    </div>
                                </div>
                            </section>
                        )}

                        {/* ===== COMMUNITY ===== */}
                        <section id="community" className="pt-6 md:pt-8 scroll-mt-28">
                            <Reveal><SectionHeading no={streamInfo.isLive ? '03' : '02'} title={t.communityTitle} en="COMMUNITY HQ" /></Reveal>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-5">
                                <Reveal delay={0}><DiscordWidget lang={lang} /></Reveal>
                                <Reveal delay={100}><YoutubeWidget lang={lang} /></Reveal>
                            </div>
                        </section>

                        {/* ===== SUPPORT ===== */}
                        <section id="support" className="pt-6 md:pt-8 scroll-mt-28">
                            <Reveal><SectionHeading no={streamInfo.isLive ? '04' : '03'} title={t.supportTitle} en="SUPPORT" /></Reveal>
                            <Reveal delay={80}><SupportArena lang={lang} supporters={[]} /></Reveal>
                        </section>

                        {/* ===== GALLERY TEASER — بوابة صفحة المعرض المستقلة ===== */}
                        <section id="gallery" className="pt-6 md:pt-8 scroll-mt-28">
                            <Reveal><SectionHeading no={streamInfo.isLive ? '05' : '04'} title={lang === 'ar' ? 'معرض الصور' : 'Gallery Wall'} sub={lang === 'ar' ? 'إبداعات المتابعين — صور وفيديو.' : 'Community edits — photos & videos.'} en="GALLERY WALL" /></Reveal>
                            <Reveal delay={80}><GalleryTeaser lang={lang} onOpen={() => { window.location.href = '/gallery'; }} /></Reveal>
                        </section>

                        {/* ===== MODERATORS ===== */}
                        <section id="moderators" className="pt-6 md:pt-8 scroll-mt-28">
                            <Reveal><SectionHeading no={streamInfo.isLive ? '06' : '05'} title={t.modsTitle} en="MODERATORS" /></Reveal>
                            <Reveal delay={80}><Suspense fallback={<div className="w-full h-64 rounded-[26px] border border-white/10 bg-white/[0.02] animate-pulse" />}><ModeratorsSection lang={lang} /></Suspense></Reveal>
                        </section>

                        {/* ===== LEADERBOARD + CLIPS (before archive) ===== */}
                        <section className="pt-6 md:pt-8">
                            <Reveal><Suspense fallback={<div className="w-full h-40 rounded-[26px] border border-white/10 bg-white/[0.02] animate-pulse" />}><StatsSection lang={lang} /></Suspense></Reveal>
                        </section>

                        {/* ===== LAST SESSION ===== */}
                        {!streamInfo.isLive && (
                            <section id="archive" className="pt-6 md:pt-8 scroll-mt-28">
                                <LastSessionReport lang={lang} data={lastSession} clips={clips} past={pastSessions} />
                            </section>
                        )}

                        {/* ===== FIRAS RUNNER ===== */}
                        <RunnerShowcase lang={lang} no={streamInfo.isLive ? '07' : '06'} onPlay={openGame} />

                        {/* ===== GALLERY PAGE — صفحة المعرض المستقلة ===== */}
                        {galleryRoute === 'gallery' && (
                            <GalleryPage
                                lang={lang}
                                onClose={() => { window.location.href = '/'; }}
                            />
                        )}

                        {/* ===== FOOTER ===== */}
                        <footer className="mt-10 md:mt-14 rounded-[28px] border border-white/10 bg-black/60 backdrop-blur-xl overflow-hidden relative">
                            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-[#C9A24B]/70 to-transparent" />
                            <div className="p-8 md:p-12 text-center relative">
                                <p className="font-gaming text-[18vw] md:text-[120px] leading-none text-stroke opacity-40 select-none" dir="ltr" aria-hidden="true">FIRAS</p>
                                <div className="flex flex-wrap justify-center gap-2.5 -mt-4 md:-mt-8 relative">
                                    {socials.slice(0, 5).map(s => (
                                        <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.name}
                                            className="btn-arena w-11 h-11 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:border-[#C9A24B]/50">
                                            <span className="scale-[0.8] block">{s.icon}</span>
                                        </a>
                                    ))}
                                </div>
                                <p className="text-[11px] font-black tracking-[0.3em] text-white/50 mt-6 uppercase">{t.poweredBy}</p>
                                <p className="text-[11px] text-white/35 mt-1">{t.footer}</p>
                            </div>
                        </footer>
                    </div>

                    {/* AI chat button hidden per request — uncomment to restore */}
                    {/* <Suspense fallback={null}><AIChat lang={lang} /></Suspense> */}

                    {/* ===== SITE SEARCH — clips, full streams, highlights + sections ===== */}
                    {searchOpen && (
                        <SearchOverlay
                            lang={lang}
                            clips={clips}
                            videos={[lastSession, ...pastSessions].filter(Boolean)}
                            onClose={() => setSearchOpen(false)}
                            onRefresh={() => fetchKickStatus()}
                        />
                    )}

                    {/* ===== FIRAS RUNNER — full game page overlay ===== */}
                    {view === 'game' && (
                        <div className="fixed inset-0 z-[80] bg-black" role="dialog" aria-modal="true" aria-label="Firas Runner">
                            <Suspense fallback={
                                <div className="w-full h-[100dvh] flex flex-col items-center justify-center gap-4 bg-black">
                                    <span className="w-14 h-14 rounded-full border-2 border-[#C9A24B]/25 border-t-[#F0DDAE] animate-spin" aria-hidden="true" />
                                    <span className="text-[11px] font-black tracking-[0.3em] text-[#D9C08A]/70 uppercase" dir="ltr">LOADING RUNNER…</span>
                                </div>
                            }>
                                <RunnerGame lang={lang} onExit={closeGame} />
                            </Suspense>
                        </div>
                    )}
                </>
        </div>
    );
}
