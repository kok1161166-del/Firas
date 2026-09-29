import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { KickIcon, XIcon, SnapchatIcon, DiscordIcon, TikTokIcon, WhatsAppIcon, InstagramIcon, YoutubeIcon, FacebookIcon, MailIcon } from './components/Icons';
import { SocialLink, Language } from './types';
import { supabase } from './supabaseClient';
import { AnnouncementTicker, SponsorsSection, ClipsSection, ScheduleSection, FAQSection } from './components/PublicWidgets';
import { StreamPlayer } from './components/StreamPlayer';
import { ChatWidget } from './components/Chat';
import { DiscordWidget, YoutubeWidget } from './components/CommunityWidgets';

// Heavy below-fold / on-demand chunks — split out of the first paint
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const StatsSection = lazy(() => import('./components/StatsSection').then(m => ({ default: m.StatsSection })));
const AIChat = lazy(() => import('./components/AIChat').then(m => ({ default: m.AIChat })));

// --- Constants (preserved) ---
const DEFAULT_PROFILE_IMAGE = "/favicon.png";
import { kickFetch } from './utils/kickApi';
import { getAllSocialMediaStats, formatFollowerCount, readSocialCache, SOCIAL_TTL_MS } from './utils/socialMediaApi';
import { getTipLeaderboard, TipDonor, TipInterval } from './utils/supportersApi';

const PC_BACKGROUND = "/bg-pc.jpg";
const MOBILE_BACKGROUND = "/bg-mobile.jpg";
const CHANNEL_SLUG = 'iabs';

const createSocialLink = (key: string, value: string, followerCount?: string, specialDetail?: string): SocialLink | null => {
    if (!value) return null;
    const handle = value.replace(/^https?:\/\/(www\.)?(twitter|x|instagram|youtube|discord|tiktok|facebook|snapchat|whatsapp)\.com\//i, '')
        .replace(/\/channel\//i, '')
        .replace(/^@/, '')
        .replace(/\/$/, '');
    switch (key) {
        case 'twitter': return { name: 'X', url: value.startsWith('http') ? value : `https://x.com/${handle}`, icon: <XIcon className="w-7 h-7" />, color: '', username: `@${handle}`, hex: '#FFFFFF', followerCount, specialDetail };
        case 'instagram': return { name: 'Instagram', url: value.startsWith('http') ? value : `https://instagram.com/${handle}`, icon: <InstagramIcon className="w-7 h-7" />, color: '', username: `@${handle}`, hex: '#E1306C', followerCount, specialDetail };
        case 'youtube': return { name: 'YouTube', url: value.startsWith('http') ? value : `https://youtube.com/@${handle}`, icon: <YoutubeIcon className="w-7 h-7" />, color: '', username: 'Channel', hex: '#FF0000', followerCount, specialDetail };
        case 'discord': return { name: 'Discord', url: value.startsWith('http') ? value : `https://discord.gg/${handle}`, icon: <DiscordIcon className="w-7 h-7" />, color: '', username: 'Community', hex: '#5865F2', followerCount, specialDetail };
        case 'tiktok': return { name: 'TikTok', url: value.startsWith('http') ? value : `https://tiktok.com/@${handle}`, icon: <TikTokIcon className="w-7 h-7" />, color: '', username: `@${handle}`, hex: '#FE2C55', followerCount, specialDetail };
        case 'facebook': return { name: 'Facebook', url: value.startsWith('http') ? value : `https://facebook.com/${handle}`, icon: <FacebookIcon className="w-7 h-7" />, color: '', username: 'Page', hex: '#1877F2', followerCount, specialDetail };
        case 'snapchat': return { name: 'Snapchat', url: value.startsWith('http') ? value : `https://snapchat.com/add/${handle}`, icon: <SnapchatIcon className="w-7 h-7" />, color: '', username: 'iabsq', hex: '#FFFC00', followerCount, specialDetail };
        case 'whatsapp': return { name: 'WhatsApp', url: value, icon: <WhatsAppIcon className="w-7 h-7" />, color: '', username: 'Group', hex: '#25D366', followerCount, specialDetail };
        default: return null;
    }
};

const KICK_SOCIAL: SocialLink = {
    name: 'KICK',
    url: 'https://kick.com/iabs',
    icon: <KickIcon className="w-8 h-8" />,
    color: '',
    username: 'iABS',
    hex: '#53FC18',
    followerCount: '121.1K',
    specialDetail: 'البث الأساسي والتفاعل المباشر'
};

const EMAIL_ADDRESS = "";

const TRANSLATIONS = {
    en: {
        status: 'LIVE NOW', statusOffline: 'OFFLINE',
        headerTitle: 'iABS STREAM HUB',
        eyebrow: 'King of acceptance & consistency',
        nameAr: 'Mohammed Al-Qahtani',
        bio: 'Mohammed Al-Qahtani broadcasts here daily. Welcome! Follow the king of acceptance and perseverance for a better life.',
        tags: ['Gaming', 'Just Chatting', 'Live Daily'],
        defaultStreamTitle: 'CHECK OUT THE VODS | FOLLOW NOW',
        defaultCategory: 'Offline',
        footer: '© 2026 iABS. All Rights Reserved.',
        poweredBy: 'POWERED BY HSG',
        watchLive: 'Watch Live', joinDiscord: 'Join Discord',
        subOnly: 'SUB ONLY', dropsEnabled: 'DROPS ENABLED', noTags: 'No tags',
        shareTitle: 'iABS Stream Hub', shareText: 'Check out iABS live on Kick!', copied: 'Link copied!',
        contact: 'Contact & Business',
        lastSessionReport: 'Last session report', ago: 'Ago', duration: 'Duration',
        categoriesSpent: 'Categories in this stream', highlights: 'Stream highlights',
        socialsTitle: 'Social Arena', socialsSub: 'One hub — every platform. Pick your battlefield.',
        communityTitle: 'Community HQ', supportTitle: 'Support & Donation', supportSub: 'Your support keeps the stream legendary.',
        tiersTitle: 'Special alert tiers', pollLive: 'LIVE POLL',
        theaterTitle: 'Live Theater', viewers: 'watching',
        statsKick: 'Kick followers', statsViews: 'Site visits', statsPlatforms: 'Platforms', statsStatus: 'Status',
        follow: 'Follow', open: 'Open', followers: 'followers',
    },
    ar: {
        status: 'بث مباشر الآن', statusOffline: 'غير متصل حالياً',
        headerTitle: 'مركز iABS للبث المباشر',
        eyebrow: 'ملك القبول والاستمرارية لحياة أفضل',
        nameAr: 'محمد القحطاني',
        bio: 'محمد القحطاني يبث هنا يومياً — حياك الله. تابع ملك القبول والاستمرارية، واستمتع بأقوى بثوث الألعاب والسوالف والفعاليات مع مجتمع الأساطير.',
        tags: ['ألعاب', 'سوالف', 'بث يومي'],
        defaultStreamTitle: 'تابع البثوث السابقة | تابعني الآن',
        defaultCategory: 'غير متصل',
        footer: '© 2026 iABS. جميع الحقوق محفوظة.',
        poweredBy: 'بدعم من HSG',
        watchLive: 'شاهد البث', joinDiscord: 'انضم للديسكورد',
        subOnly: 'للمشتركين فقط', dropsEnabled: 'الجوائز مفعلة', noTags: 'لا يوجد وسوم',
        shareTitle: 'مركز بث iABS', shareText: 'تابع بث iABS المباشر على كيك!', copied: 'تم نسخ الرابط!',
        contact: 'للتواصل والإعلان',
        lastSessionReport: 'تقرير الجلسة الأخيرة', ago: 'منذ', duration: 'المدة',
        categoriesSpent: 'الفئات التي تم بثها', highlights: 'لقطات ممتعة من البث',
        socialsTitle: 'ساحة التواصل', socialsSub: 'كل المنصات في مكان واحد — اختر ساحتك.',
        communityTitle: 'مقر المجتمع', supportTitle: 'الدعم المادي', supportSub: 'دعمك يخلي البث أسطوري ويستمر.',
        tiersTitle: 'مستويات التنبيه الخاصة', pollLive: 'تصويت مباشر',
        theaterTitle: 'مسرح البث المباشر', viewers: 'مشاهد',
        statsKick: 'متابع كيك', statsViews: 'زيارة للموقع', statsPlatforms: 'منصة', statsStatus: 'الحالة',
        follow: 'تابع', open: 'افتح', followers: 'متابع',
    }
};

// ================= DESIGN SYSTEM =================

const Reveal: React.FC<{ children: React.ReactNode; delay?: number; className?: string; as?: 'div' | 'section' }> = ({ children, delay = 0, className = '' }) => {
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
        let raf = 0; let w = 0; let h = 0;
        const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
        type P = { x: number; y: number; r: number; vy: number; vx: number; a: number; red: boolean };
        let parts: P[] = [];
        const resize = () => {
            w = window.innerWidth; h = window.innerHeight;
            canvas.width = w * DPR; canvas.height = h * DPR;
            canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
            const n = Math.min(70, Math.floor(w / 22));
            parts = Array.from({ length: n }, () => ({
                x: Math.random() * w, y: Math.random() * h,
                r: 0.6 + Math.random() * 2.2,
                vy: -(0.15 + Math.random() * 0.55), vx: (Math.random() - 0.5) * 0.25,
                a: 0.15 + Math.random() * 0.5, red: Math.random() > 0.72,
            }));
        };
        resize();
        window.addEventListener('resize', resize);
        const tick = () => {
            ctx.clearRect(0, 0, w, h);
            for (const p of parts) {
                p.y += p.vy; p.x += p.vx;
                if (p.y < -8) { p.y = h + 8; p.x = Math.random() * w; }
                if (p.x < -8) p.x = w + 8; if (p.x > w + 8) p.x = -8;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = p.red ? `rgba(255,45,45,${p.a})` : `rgba(255,255,255,${p.a * 0.55})`;
                ctx.shadowBlur = p.red ? 12 : 0;
                ctx.shadowColor = 'rgba(255,45,45,0.8)';
                ctx.fill();
                ctx.shadowBlur = 0;
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
    }, []);
    return (
        <div className="fixed inset-0 z-0 bg-[#050505] overflow-hidden" aria-hidden="true">
            <div className="absolute inset-0 responsive_bg scale-105 opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-[#050505]" />
            <div className="absolute inset-0 grid-lines opacity-70" />
            <div className="absolute -top-40 right-[-10%] w-[55vw] h-[55vw] max-w-[720px] max-h-[720px] rounded-full bg-[#FF2D2D]/20 blur-[140px] animate-aurora" />
            <div className="absolute top-[30%] left-[-12%] w-[42vw] h-[42vw] max-w-[560px] max-h-[560px] rounded-full bg-[#FF2D2D]/10 blur-[130px] animate-aurora" style={{ animationDelay: '-6s' }} />
            <div className="absolute bottom-[-20%] right-[20%] w-[36vw] h-[36vw] max-w-[480px] max-h-[480px] rounded-full bg-[#53FC18]/[0.06] blur-[120px] animate-aurora" style={{ animationDelay: '-3s' }} />
            <canvas ref={canvasRef} className="absolute inset-0 opacity-80" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,transparent_40%,rgba(0,0,0,0.55)_100%)]" />
        </div>
    );
};

const SectionHeading: React.FC<{ no: string; title: string; sub?: string; en?: string }> = ({ no, title, sub, en }) => (
    <div className="flex items-end gap-3 md:gap-4 mb-6 md:mb-9">
        <span className="font-gaming text-3xl sm:text-4xl md:text-6xl leading-none text-stroke-red select-none shrink-0" dir="ltr">{no}</span>
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl sm:text-2xl md:text-4xl font-black tracking-tight text-white">{title}</h2>
                {en && <span className="hidden sm:inline text-[10px] font-bold tracking-[0.3em] text-white/30 uppercase" dir="ltr">{en}</span>}
            </div>
            {sub && <p className="text-[13px] md:text-sm text-white/50 mt-1 font-medium">{sub}</p>}
            <div className="mt-2.5 md:mt-3 h-px w-full bg-gradient-to-l from-[#FF2D2D]/60 via-white/10 to-transparent" />
        </div>
    </div>
);

const Marquee: React.FC<{ lang: Language }> = ({ lang }) => {
    const items = lang === 'ar'
        ? ['بث يومي مباشر', 'ملك القبول', 'مجتمع الأساطير', 'تفاعل لا يتوقف', 'جوائز ودروبس', 'ألعاب وتحديات', 'سوالف وفعاليات']
        : ['DAILY LIVE', 'KING OF ACCEPTANCE', 'LEGENDS COMMUNITY', 'NONSTOP HYPE', 'DROPS & REWARDS', 'GAMES & CHALLENGES', 'CHATTING & EVENTS'];
    const row = [...items, ...items];
    return (
        <div className="relative -mx-3 sm:-mx-4 md:-mx-8 overflow-hidden border-y border-white/10 bg-black/60 backdrop-blur-md marquee-mask" dir="ltr" aria-hidden="true">
            <div className="flex w-max animate-marquee gap-0 py-2.5 md:py-3">
                {row.map((t, i) => (
                    <span key={i} className="flex items-center gap-6 px-6 whitespace-nowrap text-[12px] md:text-sm font-black tracking-[0.25em] text-white/60">
                        <span className={i % 2 ? 'text-white/60' : 'text-[#FF2D2D]'}>{t}</span>
                        <span className="w-1.5 h-1.5 rotate-45 bg-[#FF2D2D]/70 inline-block" />
                    </span>
                ))}
            </div>
        </div>
    );
};

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
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-l from-transparent via-[#FF2D2D] to-transparent" />
                <div className="relative p-5 sm:p-8 md:p-10">
                    {/* header */}
                    <div className="flex flex-wrap items-center gap-3 mb-6 md:mb-8 animate-fade-in-up">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#FF2D2D] shadow-[0_0_14px_#FF2D2D] animate-pulse shrink-0" />
                        <span className="text-[11px] font-black tracking-[0.35em] text-white/45 uppercase">{t.lastSessionReport}</span>
                        <span className="ms-auto flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-black px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-white/70">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                {fullDate} • {timeAgo(data.created_at)}
                            </span>
                            <span className={`text-[10px] font-black px-3 py-1.5 rounded-full border tracking-widest ${isSubOnly ? 'bg-amber-400/10 border-amber-400/40 text-amber-300' : 'bg-[#53FC18]/10 border-[#53FC18]/40 text-[#53FC18]'}`}>
                                {isSubOnly ? t.subOnly : 'PUBLIC'}
                            </span>
                        </span>
                    </div>

                    {/* hero */}
                    <div className="flex flex-col lg:flex-row gap-6 md:gap-8 items-start">
                        <div className="[perspective:1200px] w-full lg:w-[380px] shrink-0 animate-fade-in-up" style={{ animationDelay: '80ms' }}>
                            <a href={vodUrl} target="_blank" rel="noopener noreferrer"
                                className="group relative block aspect-video rounded-2xl overflow-hidden border border-[#FF2D2D]/30 bg-black shadow-[0_24px_60px_-16px_rgba(255,45,45,0.4)] [transform:rotateY(-7deg)_rotateX(2deg)] hover:[transform:rotateY(0deg)_rotateX(0deg)] transition-transform duration-700">
                                <img src={thumbnail} alt="Last Session" loading="lazy" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                                <span className="absolute top-3 start-3 text-[10px] font-black px-2.5 py-1 rounded-full bg-black/70 border border-white/15 text-white/80 backdrop-blur">VOD</span>
                                <span className="absolute inset-0 m-auto w-14 h-14 md:w-16 md:h-16 rounded-full bg-[#FF2D2D]/25 backdrop-blur-md border border-[#FF2D2D]/70 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 shadow-[0_0_36px_rgba(255,45,45,0.55)]">
                                    <svg className="w-6 h-6 text-white fill-current translate-x-[1px] rtl:-translate-x-[1px]" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                </span>
                                <span className="absolute bottom-3 end-3 text-[10px] font-black px-2.5 py-1 rounded-lg bg-black/75 border border-white/15 text-white" dir="ltr">{formatDuration(data.duration)}</span>
                                <span className="absolute bottom-3 start-3 inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-lg bg-black/75 border border-white/15 text-white" dir="ltr">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                    {compact(views)}
                                </span>
                            </a>
                            <span className="mt-3 w-full min-h-[48px] flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#ff4d4d] to-[#FF2D2D] text-black font-black text-sm shadow-[0_12px_30px_-10px_rgba(255,45,45,0.6)] active:scale-[0.98] transition-transform">
                                {L.watch}
                                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                            </span>
                        </div>

                        <div className="flex-1 min-w-0 w-full">
                            <div className="flex flex-wrap items-center gap-2 mb-3 animate-fade-in-up" style={{ animationDelay: '140ms' }}>
                                <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-white/[0.07] border border-white/10 text-white/70" dir="ltr">{data.language || 'AR'}</span>
                                <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-white/[0.07] border border-white/10 text-white/70">{data.is_mature ? '18+' : L.family}</span>
                                {catTags.map((tag, i) => <span key={i} className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#FF2D2D]/10 border border-[#FF2D2D]/30 text-[#ff8080]" dir="ltr">#{tag}</span>)}
                            </div>
                            <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-white leading-snug mb-5 animate-fade-in-up" style={{ animationDelay: '180ms' }}>{data.session_title || data.title}</h3>
                            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-3">
                                {stats.map((s, i) => (
                                    <div key={i} className={`card-sheen relative overflow-hidden rounded-2xl border px-4 py-4 text-center backdrop-blur-md animate-fade-in-up ${s.hot ? 'bg-[#FF2D2D]/[0.07] border-[#FF2D2D]/25' : 'bg-white/[0.04] border-white/10'}`} style={{ animationDelay: `${220 + i * 80}ms` }}>
                                        <span className={`mx-auto w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${s.hot ? 'bg-[#FF2D2D]/15 text-[#ff6b6b]' : 'bg-white/[0.07] text-white/60'}`}>{s.icon}</span>
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
                                                    <span className={`text-[10px] sm:text-[11px] font-black ${cur ? 'text-[#ff6b6b]' : 'text-white/45'}`} dir="ltr">{compact(v)}</span>
                                                    <span className="tier-bar w-full max-w-[90px] rounded-t-lg border-x border-t relative overflow-hidden"
                                                        style={{
                                                            height: `${h}%`, animationDelay: `${i * 120}ms`,
                                                            background: cur ? 'linear-gradient(to bottom, #FF2D2D, #FF2D2D55 60%, rgba(0,0,0,0.5))' : 'linear-gradient(to bottom, rgba(255,255,255,0.35), rgba(255,255,255,0.06))',
                                                            borderColor: cur ? '#FF2D2D88' : 'rgba(255,255,255,0.15)',
                                                            boxShadow: cur ? '0 0 22px -4px rgba(255,45,45,0.7)' : 'none',
                                                        }}>
                                                        <span className="absolute top-0 inset-x-2 h-1 rounded-full bg-white/40 blur-[1px]" />
                                                    </span>
                                                    <span className={`w-full max-w-[90px] h-1.5 rounded-b bg-black/70 border-x border-b ${cur ? 'border-[#FF2D2D]/50' : 'border-white/10'}`} />
                                                </a>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {data.categories?.length > 0 && (
                                <div className="mt-6 animate-fade-in-up" style={{ animationDelay: '620ms' }}>
                                    <p className="text-[10px] font-black tracking-[0.25em] text-white/30 uppercase mb-3">{t.categoriesSpent}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {data.categories.map((cat: any, i: number) => {
                                            const catName = cat.name || cat.category?.name || 'Just Chatting';
                                            const slug = cat.slug || cat.category?.slug || catName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
                                            const catImg = cat.banner?.url || cat.banner?.responsive || cat.category?.banner?.url || cat.category?.banner?.responsive || cat.responsive_url || cat.thumbnail?.url || cat.category?.responsive_url || cat.category?.thumbnail?.url || `https://files.kick.com/categories/${slug}/fullsize.png`;
                                            return (
                                                <span key={i} className="inline-flex items-center gap-2 bg-white/[0.05] border border-white/10 rounded-full ps-1 pe-3 py-1 hover:border-[#FF2D2D]/40 transition-colors">
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
                                <span className="w-2 h-2 rounded-full bg-neon shadow-[0_0_10px_#53FC18]" />
                                <span className="text-[11px] font-black tracking-[0.25em] text-white/40 uppercase">{t.highlights}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 md:gap-4">
                                {clips.slice(0, 3).map((clip: any, i: number) => (
                                    <a key={clip.id || i} href={`https://kick.com/${CHANNEL_SLUG}?clip=${clip.id}`} target="_blank" rel="noopener noreferrer"
                                        className="group relative aspect-video rounded-xl md:rounded-2xl overflow-hidden border border-white/10 bg-black hover:border-[#53FC18]/60 hover:-translate-y-1 transition-all duration-300">
                                        <img src={clip.thumbnail_url || clip.thumbnail?.url || PC_BACKGROUND} alt={clip.title} loading="lazy"
                                            className="w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                                        <span className="absolute top-1.5 start-1.5 w-5 h-5 md:w-6 md:h-6 rounded-lg bg-black/70 border border-white/15 text-white/80 text-[9px] md:text-[10px] font-black flex items-center justify-center backdrop-blur" dir="ltr">{i + 1}</span>
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-[#53FC18]/25 backdrop-blur border border-[#53FC18]/60 flex items-center justify-center">
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

// --- Platform identity gradients (same palette, richer expression) ---
const BRAND_GRADIENTS: Record<string, string> = {
    KICK: 'linear-gradient(135deg, rgba(83,252,24,0.28), rgba(83,252,24,0.05) 55%, transparent)',
    Snapchat: 'linear-gradient(135deg, rgba(255,252,0,0.20), rgba(255,140,0,0.07) 55%, transparent)',
    Instagram: 'linear-gradient(135deg, rgba(225,48,108,0.28), rgba(129,52,175,0.14) 50%, rgba(255,170,60,0.08))',
    TikTok: 'linear-gradient(135deg, rgba(254,44,85,0.24), rgba(37,244,238,0.12) 60%, transparent)',
    X: 'linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.02) 60%, transparent)',
    WhatsApp: 'linear-gradient(135deg, rgba(37,211,102,0.26), rgba(37,211,102,0.05) 55%, transparent)',
    Discord: 'linear-gradient(135deg, rgba(88,101,242,0.30), rgba(88,101,242,0.07) 55%, transparent)',
    YouTube: 'linear-gradient(135deg, rgba(255,0,0,0.26), rgba(255,0,0,0.05) 55%, transparent)',
};

// --- Social Card — premium edition (same data + behavior) ---
const SocialCard: React.FC<{ social: SocialLink; index: number; featured?: boolean; lang: Language }> = ({ social, index, featured = false, lang }) => {
    const [hover, setHover] = useState(false);
    const [launching, setLaunching] = useState(false);
    const [pressed, setPressed] = useState(false);
    const brand = social.hex || '#ffffff';
    const bright = social.name === 'Snapchat' || social.name === 'KICK';
    const go = (e: React.MouseEvent) => {
        e.preventDefault();
        if (launching) return;
        setLaunching(true);
        window.setTimeout(() => { window.location.href = social.url; }, 420);
    };
    const active = hover || launching;
    const card = (
        <div className={`card-sheen relative h-full rounded-[22px] border bg-[#0b0b0b]/92 backdrop-blur-xl overflow-hidden transition-all duration-300 group-hover:-translate-y-1 group-active:translate-y-0 group-active:scale-[0.985] ${launching ? 'glitch-active' : ''} ${pressed ? 'scale-[0.985]' : ''}`}
            style={{ borderColor: launching ? brand : active ? `${brand}99` : 'rgba(255,255,255,0.09)', boxShadow: active ? `0 18px 44px -16px ${brand}66, inset 0 1px 0 rgba(255,255,255,0.08)` : '0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
            {/* brand wash */}
            <div className="absolute inset-0 pointer-events-none transition-opacity duration-500" style={{ background: BRAND_GRADIENTS[social.name] || `linear-gradient(135deg, ${brand}22, transparent 60%)`, opacity: active ? 1 : 0.75 }} />
            {/* giant watermark icon */}
            <div className="absolute -end-3 -bottom-5 opacity-[0.07] group-hover:opacity-[0.13] transition-opacity duration-500 pointer-events-none scale-[2.6] origin-bottom" style={{ color: brand }}>
                {social.icon}
            </div>
            {/* top energy line */}
            <span className="absolute top-0 start-6 end-6 h-[2.5px] rounded-full transition-all duration-500" style={{ background: `linear-gradient(90deg, transparent, ${brand}, transparent)`, opacity: active ? 1 : 0.3, boxShadow: active ? `0 0 18px ${brand}` : 'none' }} />
            {launching && <span className="absolute bottom-0 start-0 h-1 animate-charge z-30" style={{ width: '100%', backgroundColor: brand, boxShadow: `0 0 12px ${brand}` }} />}
            <div className={`relative p-4 sm:p-5 flex items-center gap-3.5 sm:gap-4 ${featured ? 'min-h-[128px]' : 'min-h-[104px]'}`}>
                {/* icon medallion */}
                <div className={`${featured ? 'w-[68px] h-[68px]' : 'w-[60px] h-[60px]'} rounded-[18px] flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-[1.06] group-hover:-rotate-3`}
                    style={{
                        color: active && bright ? '#000' : brand,
                        background: active && bright ? brand : `linear-gradient(160deg, ${brand}2e, rgba(255,255,255,0.04))`,
                        border: `1.5px solid ${active ? brand : 'rgba(255,255,255,0.13)'}`,
                        boxShadow: active ? `0 0 26px ${brand}55, inset 0 1px 0 rgba(255,255,255,0.25)` : `inset 0 1px 0 rgba(255,255,255,0.08)`
                    }}>
                    {launching
                        ? <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        : social.icon}
                </div>
                {/* texts */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: launching ? brand : active ? brand : 'rgba(255,255,255,0.48)' }}>
                            {launching ? 'LAUNCHING…' : social.name}
                        </span>
                        {featured && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-[3px] rounded-full bg-[#53FC18]/15 border border-[#53FC18]/45 text-[#53FC18] tracking-[0.14em]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#53FC18] animate-pulse" />MAIN STAGE
                            </span>
                        )}
                    </div>
                    <p className={`font-black text-white truncate leading-tight mt-0.5 ${featured ? 'text-[22px] sm:text-2xl' : 'text-[17px]'}`} dir="ltr">{social.username}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                        {social.followerCount && (
                            <span className={`inline-flex items-center gap-1 text-[11px] font-black text-white/85 ${social.name === 'Snapchat' ? 'blur-[3px] select-none' : ''}`} dir="ltr">
                                <svg className="w-3 h-3 text-white/40" fill="currentColor" viewBox="0 0 20 20"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" /></svg>
                                {social.followerCount}
                            </span>
                        )}
                        {social.specialDetail && <span className="text-[11px] text-white/40 font-medium truncate">{social.specialDetail}</span>}
                    </div>
                </div>
                {/* CTA */}
                <span className={`shrink-0 flex items-center justify-center rounded-full font-black transition-all duration-300 ${featured ? 'w-12 h-12' : 'w-11 h-11'}`}
                    style={{
                        background: active ? brand : 'rgba(255,255,255,0.07)',
                        color: active ? (bright ? '#000' : '#fff') : '#fff',
                        border: `1.5px solid ${active ? brand : 'rgba(255,255,255,0.14)'}`,
                        boxShadow: active ? `0 0 20px ${brand}66` : 'none'
                    }}>
                    <svg className="w-5 h-5 rtl:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                </span>
            </div>
            {/* bottom fill line */}
            <span className="absolute bottom-0 start-0 h-[2px] transition-all duration-500" style={{ width: active ? '100%' : '0%', background: brand, boxShadow: `0 0 10px ${brand}` }} />
        </div>
    );
    return (
        <a href={social.url} onClick={go} onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setPressed(false); }}
            onTouchStart={() => setPressed(true)} onTouchEnd={() => setPressed(false)}
            style={{ animationDelay: `${Math.min(index * 60, 400)}ms` }}
            className={`group relative block animate-fade-in-up select-none rounded-[22px] ${launching ? 'z-40' : ''}`}
            title={`${social.name} - iABS Official`} aria-label={lang === 'ar' ? `تابع iABS على ${social.name}` : `Visit iABS on ${social.name}`}>
            {featured ? (
                <div className="rounded-[24px] p-[1.5px] bg-gradient-to-l from-[#53FC18] via-[#53FC18]/25 to-[#FF2D2D]/70 shadow-[0_0_35px_rgba(83,252,24,0.15)]">
                    <div className="rounded-[22.5px] bg-[#0b0b0b]">{card}</div>
                </div>
            ) : (
                <>
                    <div className="absolute -inset-0.5 rounded-[24px] opacity-0 group-hover:opacity-100 group-active:opacity-60 transition-opacity duration-500 blur-xl pointer-events-none" style={{ background: `linear-gradient(135deg, ${brand}44, transparent 65%)` }} />
                    {card}
                </>
            )}
        </a>
    );
};

// ============ SUPPORTERS — live Streamlabs tip leaderboard (gold/blue) ============
type Supporter = { id: number; name: string; amount: number; currency: string; message?: string; source: string; created_at: string };

const rankRing = (rank: number): string => {
    if (rank === 1) return 'conic-gradient(from 200deg, #b8ffe4, #1d7a5c, #e6fff4, #1d7a5c, #b8ffe4)';
    if (rank === 2) return 'conic-gradient(from 200deg, #ffb59d, #8f2f10, #ffe0d2, #8f2f10, #ffb59d)';
    if (rank === 3) return 'conic-gradient(from 200deg, #c4b0ff, #4a2b9d, #e6dcff, #4a2b9d, #c4b0ff)';
    return 'conic-gradient(from 200deg, #6FF2C4, #1e293b, rgba(139,92,246,0.5), #1e293b, #6FF2C4)';
};

const RankAvatar: React.FC<{ name: string; rank: number; size: string }> = ({ name, rank, size }) => {
    const initial = (name || '?').trim().charAt(0).toUpperCase();
    return (
        <span className={`relative ${size} rounded-full p-[2.5px] shrink-0 block`} style={{ background: rankRing(rank) }}>
            <span className="w-full h-full rounded-full bg-[#070b16] flex items-center justify-center font-black text-white">{initial}</span>
        </span>
    );
};

// Rank square: mint (right) melting through violet into coral (left)
const RankBadge: React.FC<{ rank: number; big?: boolean }> = ({ rank, big = false }) => (
    <span
        className={`${big ? 'w-12 h-12 text-xl' : 'w-9 h-9 text-base sm:w-11 sm:h-11 sm:text-lg'} rounded-xl font-gaming shrink-0 flex items-center justify-center text-white`}
        dir="ltr"
        style={{
            background: 'linear-gradient(to left, #6FF2C4 0%, #8B5CF6 52%, #FF7A59 100%)',
            textShadow: '0 2px 4px rgba(0,0,0,0.7)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -3px 0 rgba(0,0,0,0.45), 0 6px 16px -6px rgba(139,92,246,0.7)',
        }}
    >
        {rank}
    </span>
);

// Special alert tiers — 3D metal bars ladder
const TIERS = [
    { amount: '25$', c: '#CD7F32', name: 'BRONZE', h: '28%' },
    { amount: '99$', c: '#C0C0C0', name: 'SILVER', h: '42%' },
    { amount: '300$', c: '#FFD700', name: 'GOLD', h: '60%' },
    { amount: '505$', c: '#00BFFF', name: 'DIAMOND', h: '80%' },
    { amount: '999$', c: '#FF2D2D', name: 'RUBY', h: '100%' },
];

const AlertTiers: React.FC<{ title: string; note: string }> = ({ title, note }) => (
    <div className="card-sheen mt-6 rounded-[26px] border border-white/10 bg-black/50 backdrop-blur-xl p-5 md:p-6 overflow-hidden">
        <p className="text-center text-[10px] md:text-[11px] font-black text-white/50 tracking-[0.3em] uppercase mb-5">{title}</p>
        <div className="flex items-end justify-center gap-2 sm:gap-4 h-44 sm:h-52" dir="ltr">
            {TIERS.map((tr, i) => (
                <div key={tr.amount} className="flex flex-col items-center justify-end h-full w-[17%] max-w-[110px] min-w-0">
                    <p className="text-sm sm:text-lg font-black tracking-wider mb-1.5" style={{ color: tr.c, textShadow: '0 2px 0 #000' }} dir="ltr">{tr.amount}</p>
                    <div className="tier-bar relative w-full rounded-t-xl border-x border-t overflow-hidden"
                        style={{ height: tr.h, background: `linear-gradient(to bottom, ${tr.c}, ${tr.c}66 55%, rgba(0,0,0,0.55))`, borderColor: `${tr.c}77`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -8px 16px rgba(0,0,0,0.5), 0 0 24px -6px ${tr.c}88`, animationDelay: `${i * 110}ms` }}>
                        <div className="absolute top-0 inset-x-2 h-1.5 rounded-full bg-white/50 blur-[1px]" />
                        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.12] to-transparent" />
                    </div>
                    <div className="w-full h-2 rounded-b-md bg-black/70 border-x border-b border-white/10" />
                    <p className="text-[8px] sm:text-[9px] font-black tracking-[0.22em] text-white/40 mt-1.5">{tr.name}</p>
                </div>
            ))}
        </div>
        <p className="text-center text-[10px] text-white/30 mt-4 font-medium">{note}</p>
    </div>
);

// Static-3D donate gate with true brand identities + ambient effects (3D stays fixed)
const DonateGate: React.FC<{
    lang: Language; title: string; url: string;
    color: string; color2?: string; label: string;
    markImg?: string; glyph?: string;
    secure: string; cta: string;
}> = ({ lang, title, url, color, color2, label, markImg, glyph = '$', secure, cta }) => {
    const [hover, setHover] = useState(false);
    const [busy, setBusy] = useState(false);
    const go = (e: React.MouseEvent) => {
        e.preventDefault(); if (busy) return; setBusy(true);
        window.setTimeout(() => { window.open(url, '_blank'); window.setTimeout(() => setBusy(false), 600); }, 350);
    };
    const frame = color2
        ? `linear-gradient(165deg, ${color}, ${color2} 55%, ${color})`
        : `linear-gradient(165deg, ${color}99, rgba(255,255,255,0.12) 30%, rgba(255,255,255,0.04) 60%, ${color}55)`;
    const glowBg = color2
        ? `linear-gradient(150deg, ${color}55, ${color2}44 60%, transparent)`
        : `linear-gradient(150deg, ${color}44, transparent 60%)`;
    const wash = color2
        ? `linear-gradient(140deg, ${color}26, ${color2}1a 55%, transparent)`
        : `linear-gradient(140deg, ${color}1f, transparent 55%)`;
    const topLine = color2
        ? `linear-gradient(90deg, transparent, ${color}, ${color2}, transparent)`
        : `linear-gradient(90deg, transparent, ${color}, transparent)`;
    const ctaBg = color2 ? `linear-gradient(135deg, ${color}, ${color2})` : `linear-gradient(180deg, #fff 0%, ${color} 65%, ${color})`;
    const ctaColor = color2 ? '#fff' : '#000';
    return (
        <a href={url} onClick={go} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
            className="group relative block rounded-[26px] [perspective:900px]" aria-label={`${title} donation`}>
            <div className="absolute -inset-1 rounded-[28px] blur-2xl pointer-events-none transition-opacity duration-300 animate-pulse-slow" style={{ background: glowBg, opacity: hover ? 1 : 0.45 }} />
            <div className="rounded-[26px] p-[2px] transition-transform duration-300 group-hover:scale-[1.01]" style={{ background: frame }}>
                <div className="card-sheen relative rounded-[24px] bg-[#0b0b0b] overflow-hidden [transform-style:preserve-3d]">
                    <div className="absolute inset-0 pointer-events-none" style={{ background: wash }} />
                    <div className="absolute top-0 inset-x-10 h-[2px] rounded-full" style={{ background: topLine }} />
                    <div className="relative p-5 sm:p-6">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-[10px] font-black tracking-[0.3em] uppercase" style={{ color }}>{busy ? (lang === 'en' ? 'OPENING…' : 'جاري الفتح…') : label}</span>
                            <span className="inline-flex items-center gap-1 text-[9px] font-black tracking-[0.2em] text-white/45 uppercase">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                {secure}
                            </span>
                        </div>
                        <div className="flex items-center gap-4 mt-4 [transform:translateZ(34px)]">
                            <span className="relative w-16 h-16 sm:w-[76px] sm:h-[76px] rounded-[20px] flex items-center justify-center shrink-0 overflow-hidden transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3"
                                style={markImg
                                    ? { border: `1.5px solid ${color}77`, boxShadow: `0 14px 30px -10px ${color}77, inset 0 1px 0 rgba(255,255,255,0.25)` }
                                    : { background: `linear-gradient(160deg, ${color}, ${color}88)`, border: `1.5px solid ${color}`, boxShadow: `0 14px 30px -10px ${color}88, inset 0 1px 0 rgba(255,255,255,0.4)` }}>
                                {markImg
                                    ? <img src={markImg} alt={`${title} logo`} className="w-full h-full object-cover" loading="lazy" />
                                    : <span className="text-3xl sm:text-4xl font-black text-black" style={{ textShadow: '0 1px 0 rgba(255,255,255,0.4)' }}>{glyph}</span>}
                            </span>
                            <h3 className="font-black text-white tracking-tight leading-none text-[34px] sm:text-[40px] [transform:translateZ(18px)]"
                                style={{ textShadow: '0 1px 0 #000, 0 2px 0 #000, 0 3px 0 rgba(0,0,0,0.7), 0 4px 14px rgba(0,0,0,0.8)' }} dir="ltr">{title}</h3>
                        </div>
                        <span className="mt-5 w-full min-h-[52px] inline-flex items-center justify-center gap-2 rounded-2xl font-black text-sm transition-all duration-300 group-hover:brightness-110 group-active:scale-[0.98]"
                            style={{ background: ctaBg, color: ctaColor, boxShadow: hover ? `0 0 28px ${color}88` : `0 10px 24px -10px ${color}88`, textShadow: color2 ? '0 1px 2px rgba(0,0,0,0.5)' : 'none' }}>
                            {cta}
                            <svg className={`w-4 h-4 ${lang === 'ar' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                        </span>
                    </div>
                </div>
            </div>
        </a>
    );
};

const SupportArena: React.FC<{ lang: Language; supporters: Supporter[] }> = ({ lang, supporters }) => {
    const t = TRANSLATIONS[lang];
    const [tab, setTab] = useState<TipInterval>('all');
    const [board, setBoard] = useState<TipDonor[] | null>(null);
    useEffect(() => {
        let dead = false;
        setBoard(null);
        getTipLeaderboard(tab).then(list => {
            if (dead) return;
            if (list.length) setBoard(list);
            else setBoard(supporters.slice(0, 10).map((s, i) => ({ name: s.name, rank: i + 1 })));
        }).catch(() => { if (!dead) setBoard([]); });
        return () => { dead = true; };
    }, [tab, supporters]);
    const top3 = (board || []).slice(0, 3);
    const rows = (board || []).slice(3);
    const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;
    const stepH = [ 'h-[74px] sm:h-[92px]', 'h-[104px] sm:h-[128px]', 'h-[58px] sm:h-[72px]' ];
    const tabs: { id: TipInterval; ar: string; en: string }[] = [
        { id: 'week', ar: 'أسبوعي', en: 'WEEKLY' },
        { id: 'month', ar: 'شهري', en: 'MONTHLY' },
        { id: 'all', ar: 'الكل', en: 'ALL TIME' },
    ];
    return (
        <div className="w-full">
            {/* gates — true brand identities from official logos */}
            <div className="relative">
                <div className="absolute -top-10 right-0 w-64 h-64 rounded-full bg-[#6FF2C4]/15 blur-[90px] animate-aurora pointer-events-none" aria-hidden="true" />
                <div className="absolute -bottom-10 left-0 w-72 h-72 rounded-full bg-[#8B5CF6]/20 blur-[100px] animate-aurora pointer-events-none" style={{ animationDelay: '-7s' }} aria-hidden="true" />
                {/* locked direction: Streamlabs (mint) always right, Dokan (coral/violet) always left */}
                <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-5" dir="rtl">
                    <DonateGate lang={lang} title="PAYPAL" url="https://streamlabs.com/iabs/tip" color="#6FF2C4" markImg="/streamlabs-mark.png"
                        label={lang === 'en' ? 'STREAMLABS' : 'ستريم لابس'} secure={lang === 'en' ? 'SECURE' : 'آمن'} cta={lang === 'en' ? 'Donate via PayPal' : 'ادعم عبر PayPal'} />
                    <DonateGate lang={lang} title="DOKAN" url="https://tip.dokan.sa/abs" color="#FF7A59" color2="#8B5CF6" markImg="/creators-mark.png"
                        label={lang === 'en' ? 'CREATORS • SEND TIP' : 'كريترز • دعم دكان'}
                        secure={lang === 'en' ? 'SECURE' : 'آمن'} cta={lang === 'en' ? 'Donate via Dokan' : 'ادعم عبر دكان'} />
                </div>
            </div>

            {/* hall of legends — live Streamlabs leaderboard */}
            <div className="mt-6 md:mt-8 rounded-[26px] border border-white/10 bg-[#080b10]/95 backdrop-blur-xl overflow-hidden">
                <div className="h-[3px] bg-gradient-to-l from-[#6FF2C4] via-[#8B5CF6] to-[#FF7A59]" />
                <div className="p-5 sm:p-7">
                    <div className="text-center mb-5">
                        <p className="font-gaming text-3xl sm:text-4xl leading-none" dir="ltr">
                            <span className="text-[#6FF2C4]" style={{ textShadow: '0 2px 0 #000, 0 0 26px rgba(111,242,196,0.5)' }}>HALL OF </span><span className="bg-clip-text text-transparent bg-gradient-to-r from-[#FF7A59] to-[#8B5CF6]" style={{ filter: 'drop-shadow(0 2px 0 #000) drop-shadow(0 0 18px rgba(139,92,246,0.45))' }}>LEGENDS</span>
                        </p>
                        <p className="text-xs sm:text-sm font-black text-white/50 mt-1.5">{lang === 'en' ? 'Live top tippers' : 'أعلى الداعمين المباشرين'}</p>
                    </div>

                    {/* interval tabs */}
                    <div className="flex justify-center mb-6">
                        <div className="inline-flex rounded-2xl border border-white/10 bg-black/60 p-1 gap-1" role="tablist" aria-label="Leaderboard interval">
                            {tabs.map(tb => {
                                const on = tab === tb.id;
                                return (
                                    <button key={tb.id} role="tab" aria-selected={on} onClick={() => setTab(tb.id)}
                                        className={`px-5 sm:px-7 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all duration-300 active:scale-95 ${on ? 'text-black' : 'text-white/55 hover:text-white'}`}
                                        style={on ? { background: 'linear-gradient(to left, #6FF2C4, #8B5CF6 55%, #FF7A59)', boxShadow: '0 6px 20px -6px rgba(139,92,246,0.8)', color: '#000' } : undefined}>
                                        {lang === 'en' ? tb.en : tb.ar}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {board === null ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3" aria-hidden="true">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 animate-pulse">
                                    <span className="w-11 h-11 rounded-xl bg-gradient-to-l from-[#6FF2C4]/25 via-[#8B5CF6]/20 to-[#FF7A59]/25" />
                                    <span className="h-4 rounded-lg bg-white/10 flex-1" />
                                </div>
                            ))}
                        </div>
                    ) : board.length > 0 ? (
                        <div key={tab}>
                            {/* static 3D podium — names only */}
                            <div className="flex items-end justify-center gap-2 sm:gap-5 [perspective:800px] mb-6" dir="ltr">
                                {podiumOrder.map((d, i) => {
                                    const rank = i === 1 ? 1 : i === 0 ? 2 : 3;
                                    return (
                                        <div key={`${tab}-${d.rank}-${d.name}`} className="flex flex-col items-center w-[30%] max-w-[190px] animate-fade-in-up" style={{ animationDelay: `${i * 90}ms` }}>
                                            <RankAvatar name={d.name} rank={d.rank} size={rank === 1 ? 'w-14 h-14 sm:w-16 sm:h-16' : 'w-11 h-11 sm:w-14 sm:h-14'} />
                                            <p className="text-white font-black text-xs sm:text-sm truncate max-w-full mt-2" dir="auto">{d.name}</p>
                                            <div className={`${stepH[i]} w-full mt-2 rounded-t-xl border-x border-t border-white/15 relative overflow-hidden [transform:rotateX(8deg)] origin-bottom`}
                                                style={{ background: 'linear-gradient(to left, rgba(111,242,196,0.30), rgba(139,92,246,0.26) 55%, rgba(255,122,89,0.28))' }}>
                                                <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] to-transparent" />
                                                <span className="absolute inset-0 flex items-start justify-center pt-2 font-gaming text-2xl sm:text-3xl text-white/30" dir="ltr">{d.rank}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {/* ranks wall — name + rank only, 2×2 on mobile */}
                            {rows.length > 0 && (
                                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                                    {rows.map((d, i) => (
                                        <div key={`${tab}-${d.rank}-${d.name}`}
                                            className="group flex items-center gap-2 sm:gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 sm:p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#6FF2C4]/50 hover:shadow-[0_14px_36px_-12px_rgba(111,242,196,0.4)] animate-fade-in-up"
                                            style={{ animationDelay: `${Math.min(i * 60, 420)}ms` }}>
                                            <RankBadge rank={d.rank} />
                                            <p className="flex-1 min-w-0 text-xs sm:text-[15px] font-black text-white truncate" dir="auto">{d.name}</p>
                                            <span className="hidden sm:block text-[9px] font-black tracking-[0.2em] text-white/30 uppercase shrink-0" dir="ltr">RANK #{d.rank}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-dashed border-[#8B5CF6]/40 bg-[#8B5CF6]/[0.04] p-6 sm:p-8 text-center">
                            <div className="mx-auto w-16 h-16 rounded-[20px] bg-gradient-to-b from-[#6FF2C4]/25 to-[#FF7A59]/10 border border-[#6FF2C4]/40 flex items-center justify-center">
                                <svg className="w-8 h-8 text-[#FF7A59]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8m-4-4v4M7 4h10v5a5 5 0 01-10 0V4zm0 0H4v2a3 3 0 003 3m10-5h3v2a3 3 0 01-3 3" /></svg>
                            </div>
                            <p className="text-white font-black mt-4">{lang === 'en' ? 'Be the first legend' : 'كن أول أسطورة تدعم البث'}</p>
                            <p className="text-white/40 text-xs font-medium mt-1">{lang === 'en' ? 'Your name will shine here forever' : 'اسمك سيخلد هنا في قاعة الأساطير'}</p>
                        </div>
                    )}
                </div>
            </div>

            <AlertTiers title={t.tiersTitle} note={lang === 'en' ? 'Donations are non-refundable' : 'التبرعات غير قابلة للاسترداد'} />
        </div>
    );
};

export default function App() {
    const [isHoveringProfile, setIsHoveringProfile] = useState(false);
    const [lang, setLang] = useState<Language>('ar');
    const [branding] = useState({ profileImage: DEFAULT_PROFILE_IMAGE, bannerImage: PC_BACKGROUND });

    const [socialStats, setSocialStats] = useState<Record<string, string>>({
        'KICK': '121.1K', 'Snapchat': '50K', 'Instagram': '21.3K', 'TikTok': '68.3K+',
        'X': '68.6K', 'WhatsApp': '16K', 'Discord': '10.5K', 'YouTube': '110.1K+'
    });

    const [socials, setSocials] = useState<SocialLink[]>([]);
    const [lastSession, setLastSession] = useState<any>(null);
    const [pastSessions, setPastSessions] = useState<any[]>([]);
    const [clips, setClips] = useState<any[]>([]);
    const [supporters, setSupporters] = useState<any[]>([]);

    const [showAdminLogin, setShowAdminLogin] = useState(false);
    const [adminEmail, setAdminEmail] = useState('');
    const [adminPassword, setAdminPassword] = useState('');
    const [adminBusy, setAdminBusy] = useState(false);
    const [adminSessionUserId, setAdminSessionUserId] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [showAdminDashboard, setShowAdminDashboard] = useState(false);
    const [visitorCount, setVisitorCount] = useState(0);
    const [activePoll, setActivePoll] = useState<any>(null);

    const [announcement, setAnnouncement] = useState<any>(null);
    const [sponsors, setSponsors] = useState<any[]>([]);
    const [clipsList, setClipsList] = useState<any[]>([]);
    const [schedule, setSchedule] = useState<any[]>([]);
    const [isScheduleActive, setIsScheduleActive] = useState(true);
    const [faqs, setFaqs] = useState<any[]>([]);
    const [isFaqActive, setIsFaqActive] = useState(true);

    const fetchPublicData = async () => {
        try {
            // Parallel: one round-trip instead of 8 sequential ones
            const [annRes, sponRes, clpRes, schRes, fqRes, schToggleRes, faqToggleRes, seoRes] = await Promise.all([
                supabase.from('announcements').select('*').eq('id', 1).single(),
                supabase.from('sponsors').select('*').order('id', { ascending: false }),
                supabase.from('highlight_clips').select('*').order('id', { ascending: false }),
                supabase.from('schedule').select('*').order('id', { ascending: true }),
                supabase.from('faqs').select('*').order('id', { ascending: false }),
                supabase.from('announcements').select('*').eq('id', 2).single(),
                supabase.from('announcements').select('*').eq('id', 3).single(),
                supabase.from('seo_settings').select('*').eq('id', 1).single(),
            ]);
            const ann = annRes.data;
            if (ann && (ann.is_active === true || ann.is_active === 'true' || ann.is_active === 1 || ann.is_active === '1')) setAnnouncement(ann);
            else setAnnouncement(null);

            setSponsors(sponRes.data || []);
            setClipsList(clpRes.data || []);
            setSchedule(schRes.data || []);
            setFaqs(fqRes.data || []);

            const schToggle = schToggleRes.data;
            if (schToggle) setIsScheduleActive(schToggle.is_active === true || schToggle.is_active === 'true');
            else setIsScheduleActive(true);
            const faqToggle = faqToggleRes.data;
            if (faqToggle) setIsFaqActive(faqToggle.is_active === true || faqToggle.is_active === 'true');
            else setIsFaqActive(true);

            const seo = seoRes.data;
            if (seo) {
                document.title = seo.title || "iABS Stream Hub";
                const setMeta = (name: string, content: string, isProperty = false) => {
                    if (!content) return;
                    const attr = isProperty ? 'property' : 'name';
                    let meta = document.querySelector(`meta[${attr}="${name}"]`);
                    if (!meta) { meta = document.createElement('meta'); meta.setAttribute(attr, name); document.head.appendChild(meta); }
                    meta.setAttribute('content', content);
                };
                setMeta('description', seo.description);
                setMeta('keywords', seo.keywords || 'iABS, Kick, Streamer');
                setMeta('og:title', seo.title, true);
                setMeta('og:description', seo.description, true);
            }
        } catch (e) { console.error("Public Data Fetch Exception:", e); }
    };

    useEffect(() => {
        let isTracked = false;
        const initData = async () => {
            if (!sessionStorage.getItem('site_visited') && !isTracked) {
                isTracked = true;
                sessionStorage.setItem('site_visited', 'true');
                const { data: overall } = await supabase.from('site_stats').select('visits').eq('id', 1).single();
                if (overall) {
                    const newVisits = overall.visits + 1;
                    await supabase.from('site_stats').update({ visits: newVisits }).eq('id', 1);
                    setVisitorCount(newVisits);
                }
                const today = new Date().toISOString().split('T')[0];
                const { data: todayStats } = await supabase.from('daily_views').select('*').eq('view_date', today).single();
                if (todayStats) await supabase.from('daily_views').update({ views_count: todayStats.views_count + 1 }).eq('id', todayStats.id);
                else await supabase.from('daily_views').insert([{ view_date: today, views_count: 1 }]);
            }
            fetchPublicData();
        };
        initData();
        const initAdmin = async () => {
            try { const { data } = await supabase.auth.getSession(); setAdminSessionUserId(data.session?.user?.id ?? null); }
            catch { setAdminSessionUserId(null); }
        };
        initAdmin();
        const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => setAdminSessionUserId(session?.user?.id ?? null));

        const fetchLive = async () => {
            const { data: statData } = await supabase.from('site_stats').select('visits').eq('id', 1).single();
            if (statData) setVisitorCount(statData.visits);
            const { data: pollData } = await supabase.from('polls').select('*').eq('is_active', true).order('id', { ascending: false }).limit(1).single();
            setActivePoll(pollData || null);
            const { data: annToggle } = await supabase.from('announcements').select('*').eq('id', 1).single();
            if (annToggle && (annToggle.is_active === true || annToggle.is_active === 'true' || annToggle.is_active === 1 || annToggle.is_active === '1')) setAnnouncement(annToggle);
            else setAnnouncement(null);
        };
        fetchLive();
        const interval = setInterval(fetchLive, 30000);
        return () => { clearInterval(interval); authSub?.subscription?.unsubscribe(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Supporters wall — reads public `donations` table (graceful when missing/empty)
    useEffect(() => {
        (async () => {
            try {
                const { data, error } = await supabase.from('donations').select('*').eq('is_visible', true).order('amount', { ascending: false }).limit(24);
                if (!error && data) setSupporters(data);
            } catch { /* table may not exist yet */ }
        })();
    }, []);
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

    const refreshIsAdmin = async (userId: string | null) => {
        if (!userId) { setIsAdmin(false); setShowAdminDashboard(false); return; }
        const { data, error } = await supabase.from('admin_users').select('user_id,is_active,role').eq('user_id', userId).eq('is_active', true).maybeSingle();
        if (error) { setIsAdmin(false); return; }
        setIsAdmin(!!data);
        if (!data) setShowAdminDashboard(false);
    };

    useEffect(() => { refreshIsAdmin(adminSessionUserId); }, [adminSessionUserId]);

    const handleVote = async (optionId: number) => {
        if (!activePoll || localStorage.getItem(`voted_${activePoll.id}`)) return;
        const newOptions = activePoll.options.map((opt: any) => opt.id === optionId ? { ...opt, votes: opt.votes + 1 } : opt);
        await supabase.from('polls').update({ options: newOptions }).eq('id', activePoll.id);
        setActivePoll({ ...activePoll, options: newOptions });
        localStorage.setItem(`voted_${activePoll.id}`, 'true');
    };

    const handleAdminLogin = async () => {
        if (!adminEmail || !adminPassword) { alert(lang === 'en' ? 'Enter email and password' : 'اكتب الإيميل وكلمة المرور'); return; }
        setAdminBusy(true);
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
            if (error) { alert((lang === 'en' ? 'Login failed: ' : 'فشل تسجيل الدخول: ') + error.message); return; }
            const userId = data.user?.id ?? null;
            setAdminSessionUserId(userId);
            await refreshIsAdmin(userId);
            if (userId) {
                const { data: adminRow } = await supabase.from('admin_users').select('user_id').eq('user_id', userId).eq('is_active', true).maybeSingle();
                if (adminRow) { setShowAdminLogin(false); setAdminPassword(''); setShowAdminDashboard(true); }
                else {
                    const email = data.user?.email || adminEmail;
                    const username = email.split('@')[0];
                    const { error: insertError } = await supabase.from('admin_users').insert([{ user_id: userId, username, email, password_hash: '', full_name: username, role: 'admin', is_active: true }]);
                    if (insertError) alert((lang === 'en' ? 'This account is not an admin: ' : 'هذا الحساب ليس أدمن: ') + insertError.message);
                    else { await refreshIsAdmin(userId); setShowAdminLogin(false); setAdminPassword(''); setShowAdminDashboard(true); }
                }
            }
        } catch (err: any) { alert((lang === 'en' ? 'Unexpected error: ' : 'خطأ غير متوقع: ') + (err?.message || '')); }
        finally { setAdminBusy(false); }
    };

    const handleAdminLogout = async () => {
        setAdminBusy(true);
        try { await supabase.auth.signOut(); }
        finally { setAdminBusy(false); setIsAdmin(false); setAdminSessionUserId(null); setShowAdminDashboard(false); }
    };

    useEffect(() => {
        const updated = [
            { ...KICK_SOCIAL, followerCount: socialStats['KICK'] },
            createSocialLink('snapchat', 'https://www.snapchat.com/@iabsq', socialStats['Snapchat'], 'يوميات حصرية وتغطيات خاصة'),
            createSocialLink('instagram', 'https://www.instagram.com/absq/', socialStats['Instagram'], 'صور وكواليس حصرية'),
            createSocialLink('tiktok', 'https://www.tiktok.com/@iabsq', socialStats['TikTok'], 'أقوى المقاطع والتحديات'),
            createSocialLink('twitter', 'https://x.com/iABSq', socialStats['X'], 'أخبار وتحديثات سريعة'),
            createSocialLink('whatsapp', 'https://www.whatsapp.com/channel/0029VadbqYx5Ui2eInkr7v2E', socialStats['WhatsApp'], 'تواصل مباشر وتنبيهات البث'),
            createSocialLink('discord', 'https://discord.com/invite/64aggJ9yRA', socialStats['Discord'], 'أكبر تجمع للأساطير'),
            createSocialLink('youtube', 'https://www.youtube.com/channel/UCdIM7MB-8G-FgE7ld3XAQ8w', socialStats['YouTube'], 'أرشيف البثوث ومقاطع مميزة'),
        ].filter(Boolean) as SocialLink[];
        setSocials(updated);
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
                const videosRawData = await kickFetch(`https://kick.com/api/v2/channels/${CHANNEL_SLUG}/videos`, true);
                const videosArray = videosRawData?.videos || (Array.isArray(videosRawData) ? videosRawData : []);
                if (videosArray?.length > 0) { setLastSession(videosArray[0]); setPastSessions(videosArray.slice(1, 4)); }
                else {
                    const streams = data.previous_livestreams || data.recent_streams || [];
                    if (streams?.length > 0) { setLastSession(streams[0]); setPastSessions(streams.slice(1, 4)); }
                }
                const clipsRawData = await kickFetch(`https://kick.com/api/v2/channels/${CHANNEL_SLUG}/clips?limit=5`, true);
                const clipsData = clipsRawData?.data || clipsRawData;
                const clipsArray = clipsData?.clips || (Array.isArray(clipsData) ? clipsData : (clipsData?.data && Array.isArray(clipsData.data) ? clipsData.data : []));
                setClips(clipsArray.slice(0, 3));
            }
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        fetchKickStatus();
        const kickInterval = setInterval(fetchKickStatus, 60000);
        return () => clearInterval(kickInterval);
    }, [fetchKickStatus]);

    const handleShare = async () => {
        const shareUrl = "https://kick.com/iabs";
        if (navigator.share) { try { await navigator.share({ title: t.shareTitle, text: t.shareText, url: shareUrl }); } catch { /* dismissed */ } }
        else { try { await navigator.clipboard.writeText(shareUrl); } catch { /* clipboard blocked */ } alert(t.copied); }
    };

    const displayTitle = streamInfo.isLive ? streamInfo.title : t.defaultStreamTitle;
    const displayCategory = streamInfo.isLive ? streamInfo.category : t.defaultCategory;
    const kickCard = socials.find(s => s.name === 'KICK');
    const snapCard = socials.find(s => s.name === 'Snapchat');
    const restSocials = socials.filter(s => s.name !== 'KICK' && s.name !== 'Snapchat');

    useEffect(() => {
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    }, [lang]);

    return (
        <div className={`grain relative min-h-screen w-full overflow-x-hidden ${lang === 'ar' ? 'font-arabic' : 'font-sans'}`}>
            {isAdmin && showAdminDashboard && (
                <Suspense fallback={<div className="min-h-screen bg-[#050505] flex items-center justify-center"><div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-[#FF2D2D] animate-spin" /></div>}>
                    <AdminDashboard supabase={supabase} visitorCount={visitorCount} activePoll={activePoll} setActivePoll={setActivePoll}
                        onLogout={handleAdminLogout} onBack={() => setShowAdminDashboard(false)} fetchLive={fetchPublicData} />
                </Suspense>
            )}
            {isAdmin && showAdminDashboard ? null : (
                <>
                    <ArenaBackground />
                    <div className="relative z-10 w-full max-w-[1200px] mx-auto px-3 sm:px-4 md:px-8 pb-10 overflow-clip">

                        {/* ===== NAV — urgent edition ===== */}
                        <header className="sticky top-2 md:top-5 z-50">
                            <div className="absolute -top-8 inset-x-8 h-16 bg-[#FF2D2D]/15 blur-[50px] rounded-full pointer-events-none" aria-hidden="true" />
                            <nav className="glass relative flex items-center justify-between gap-2 px-3 sm:px-4 md:px-6 py-2.5 rounded-2xl border border-white/10 shadow-[0_18px_50px_rgba(0,0,0,0.55)] overflow-hidden" aria-label="Main">
                                <span className="absolute top-0 inset-x-10 h-[2px] rounded-full bg-gradient-to-r from-transparent via-[#FF2D2D]/80 to-transparent pointer-events-none" aria-hidden="true" />
                                <a href="#top" className="flex items-center gap-2.5 shrink-0 min-w-0">
                                    <span className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden border border-[#FF2D2D]/50 shadow-[0_0_18px_rgba(255,45,45,0.4)] block shrink-0">
                                        <img src={branding.profileImage} alt="iABS logo" className="w-full h-full object-cover" />
                                        <span className={`absolute bottom-0.5 end-0.5 w-2.5 h-2.5 rounded-full border-2 border-black ${streamInfo.isLive ? 'bg-[#53FC18] animate-pulse' : 'bg-white/30'}`} />
                                    </span>
                                    <span className="leading-none min-w-0">
                                        <span className="flex items-center gap-1.5 font-black text-[17px] tracking-tight" dir="ltr">
                                            <span className="text-[#FF2D2D]">i</span><span className="text-white">ABS</span>
                                            {streamInfo.isLive && <span className="text-[8px] font-black px-1.5 py-[3px] rounded-md bg-[#53FC18] text-black tracking-widest animate-pulse">LIVE</span>}
                                        </span>
                                        <span className="hidden min-[400px]:block text-[8px] font-bold tracking-[0.28em] text-white/40 uppercase truncate">{t.headerTitle}</span>
                                    </span>
                                </a>
                                <div className="hidden lg:flex items-center gap-1 text-[13px] font-bold text-white/60">
                                    <a href="#socials" className="px-4 py-2 rounded-xl hover:text-white hover:bg-white/5 transition-colors">{lang === 'en' ? 'Socials' : 'التواصل'}</a>
                                    <a href="#live" className="px-4 py-2 rounded-xl hover:text-white hover:bg-white/5 transition-colors">{lang === 'en' ? 'Live' : 'البث'}</a>
                                    <a href="#support" className="px-4 py-2 rounded-xl hover:text-white hover:bg-white/5 transition-colors">{lang === 'en' ? 'Support' : 'الدعم'}</a>
                                    <a href="#schedule" className="px-4 py-2 rounded-xl hover:text-white hover:bg-white/5 transition-colors">{lang === 'en' ? 'Schedule' : 'الجدول'}</a>
                                </div>
                                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                                    <span className={`hidden sm:inline-flex items-center gap-2 text-[11px] font-black px-3 py-2 rounded-full border ${streamInfo.isLive ? 'border-[#53FC18]/50 bg-[#53FC18]/10 text-[#53FC18]' : 'border-white/15 bg-white/5 text-white/50'}`}>
                                        <span className={`w-2 h-2 rounded-full shrink-0 ${streamInfo.isLive ? 'bg-[#53FC18] animate-pulse shadow-[0_0_10px_#53FC18]' : 'bg-white/30'}`} />
                                        {streamInfo.isLive ? t.status : t.statusOffline}
                                        {streamInfo.isLive && streamInfo.viewers > 0 && <span dir="ltr">• {streamInfo.viewers.toLocaleString()}</span>}
                                    </span>
                                    <button onClick={() => fetchKickStatus()} aria-label="Refresh"
                                        className="btn-arena w-11 h-11 rounded-xl bg-white/[0.06] border border-white/10 text-white/60 hover:text-white active:scale-95 flex items-center justify-center">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    </button>
                                    <button onClick={() => setLang(p => p === 'en' ? 'ar' : 'en')}
                                        className="btn-arena h-11 px-4 sm:px-5 rounded-xl bg-gradient-to-b from-[#ff4d4d] to-[#FF2D2D] text-black text-xs font-black tracking-wider active:scale-95 shadow-[0_0_24px_rgba(255,45,45,0.4)]">
                                        {lang === 'en' ? 'عربي' : 'EN'}
                                    </button>
                                </div>
                            </nav>
                            {/* mobile: fused status + breaking box */}
                            <div className="sm:hidden mt-2 rounded-2xl p-[1px] bg-gradient-to-b from-white/15 via-white/[0.06] to-transparent">
                                <div className="rounded-[15px] bg-black/70 backdrop-blur-md overflow-hidden">
                                    <div className={`h-[2px] ${streamInfo.isLive ? 'bg-gradient-to-l from-[#53FC18] via-[#53FC18]/40 to-transparent' : 'bg-gradient-to-l from-[#FF2D2D] via-[#FF2D2D]/40 to-transparent'}`} />
                                    <div className="px-4 py-2.5 flex items-center justify-center gap-2">
                                        <span className={`w-2 h-2 rounded-full shrink-0 ${streamInfo.isLive ? 'bg-[#53FC18] animate-pulse shadow-[0_0_10px_#53FC18]' : 'bg-[#FF2D2D] animate-pulse shadow-[0_0_10px_#FF2D2D]'}`} />
                                        <p className={`text-[11px] font-black ${streamInfo.isLive ? 'text-[#53FC18]' : 'text-white/60'}`}>
                                            {streamInfo.isLive ? `${t.status}${streamInfo.viewers > 0 ? ` • ${streamInfo.viewers.toLocaleString()} ${t.viewers}` : ''}` : t.statusOffline}
                                        </p>
                                    </div>
                                    {announcement?.message && (
                                        <>
                                            <div className="mx-4 h-px bg-gradient-to-l from-transparent via-white/15 to-transparent" />
                                            <div className="px-4 py-2.5 flex items-center gap-2.5">
                                                <span className="shrink-0 text-[9px] font-black px-2.5 py-1 rounded-lg bg-gradient-to-b from-[#ff4d4d] to-[#FF2D2D] text-black tracking-widest shadow-[0_0_14px_rgba(255,45,45,0.5)]">{lang === 'en' ? 'LIVE' : 'عاجل'}</span>
                                                <p className="text-xs font-bold text-white/85 truncate flex-1">{announcement.message}</p>
                                                <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#FF2D2D] animate-pulse" />
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="mt-2 hidden md:flex justify-start px-1">
                                <AnnouncementTicker announcement={announcement} />
                            </div>
                        </header>

                        {/* ===== HERO ===== */}
                        <section id="top" className="pt-8 md:pt-16 pb-6 md:pb-8 overflow-clip">
                            <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-8 lg:gap-10 items-center justify-items-center lg:justify-items-stretch">
                                <div className="animate-fade-in-up w-full max-w-xl text-center lg:text-start order-2 lg:order-1">
                                    <div className="inline-flex items-center gap-2.5 rounded-full border border-[#FF2D2D]/35 bg-[#FF2D2D]/[0.08] px-4 py-1.5 mb-5">
                                        <span className={`w-2 h-2 rounded-full shrink-0 ${streamInfo.isLive ? 'bg-[#53FC18] animate-pulse shadow-[0_0_10px_#53FC18]' : 'bg-[#FF2D2D] animate-pulse shadow-[0_0_10px_#FF2D2D]'}`} />
                                        <span className="text-[10px] md:text-xs font-black tracking-[0.18em] text-white/80 uppercase">{t.eyebrow}</span>
                                    </div>
                                    <p className="text-white/45 font-bold text-xs sm:text-sm md:text-base mb-2">{t.nameAr} • <span dir="ltr" className="text-white/30">MOHAMMED AL-QAHTANI</span></p>
                                    <h1 className="wm-mark relative font-gaming leading-none tracking-wide select-none text-[clamp(96px,24vw,180px)] lg:text-[180px]" dir="ltr" aria-label="iABS">
                                        <span aria-hidden="true" className="wm-depth wm-depth-1 font-gaming leading-none tracking-wide">iABS</span>
                                        <span aria-hidden="true" className="wm-depth wm-depth-2 font-gaming leading-none tracking-wide">iABS</span>
                                        <span aria-hidden="true" className="relative z-10">
                                            <span className="wm-letter wm-stroke">i</span><span className="wm-letter wm-stroke">A</span><span className="wm-letter wm-stroke">B</span><span className="wm-letter wm-stroke">S</span>
                                        </span>
                                        <span aria-hidden="true" className="wm-sheen font-gaming leading-none tracking-wide z-20">iABS</span>
                                    </h1>
                                    <p className="font-gaming text-xl sm:text-2xl md:text-4xl text-stroke mt-1 tracking-wide" dir="ltr" aria-hidden="true">KING OF ACCEPTANCE</p>
                                    <p className="text-white/65 text-[15px] md:text-lg leading-relaxed max-w-xl mt-4 md:mt-5 font-medium mx-auto lg:mx-0">{t.bio}</p>
                                    <div className="flex flex-wrap justify-center lg:justify-start gap-2 sm:gap-2.5 mt-4 md:mt-5">
                                        {t.tags.map((tag, i) => (
                                            <span key={i} className="px-3.5 sm:px-4 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-[11px] sm:text-xs font-bold text-white/75">#{tag}</span>
                                        ))}
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 mt-6 md:mt-7">
                                        <a href="https://kick.com/iabs" target="_blank" rel="noopener noreferrer"
                                            className="btn-arena inline-flex items-center justify-center gap-2.5 px-7 py-4 sm:py-3.5 rounded-2xl bg-gradient-to-b from-[#ff4d4d] to-[#FF2D2D] text-black font-black text-[15px] md:text-base shadow-[0_0_35px_rgba(255,45,45,0.45)] active:scale-[0.98]">
                                            <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                            {t.watchLive}
                                        </a>
                                        <a href="https://discord.com/invite/64aggJ9yRA" target="_blank" rel="noopener noreferrer"
                                            className="btn-arena inline-flex items-center justify-center gap-2.5 px-7 py-4 sm:py-3.5 rounded-2xl bg-white/[0.06] border border-white/15 text-white font-black text-[15px] md:text-base active:scale-[0.98]">
                                            <DiscordIcon className="w-5 h-5 shrink-0" />
                                            {t.joinDiscord}
                                        </a>
                                    </div>
                                    <div className="grid grid-cols-3 w-full gap-2 sm:gap-3 mt-6 md:mt-8">
                                        {[
                                            { v: socialStats['KICK'] || '—', l: t.statsKick },
                                            { v: visitorCount > 0 ? visitorCount.toLocaleString() : '—', l: t.statsViews },
                                            { v: '8', l: t.statsPlatforms },
                                        ].map((s, i) => (
                                            <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur px-2 sm:px-4 py-3 sm:py-3.5 text-center min-w-0">
                                                <p className="text-lg sm:text-xl md:text-2xl font-black text-white truncate" dir="ltr">{s.v}</p>
                                                <p className="text-[9px] md:text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1 truncate">{s.l}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Profile visual — first on mobile only */}
                                <div className="flex justify-center lg:justify-start animate-fade-in w-full order-1 lg:order-2" style={{ animationDelay: '150ms' }}>
                                    <div className="relative mx-6 sm:mx-8" onMouseEnter={() => setIsHoveringProfile(true)} onMouseLeave={() => setIsHoveringProfile(false)}>
                                        <div className="profile-3d-ring" />
                                        <div className="profile-3d-ring-inner" />
                                        <div className="tech-corner tech-corner-tl" /><div className="tech-corner tech-corner-tr" />
                                        <div className="tech-corner tech-corner-bl" /><div className="tech-corner tech-corner-br" />
                                        <div className="relative w-48 h-48 sm:w-64 sm:h-64 md:w-72 md:h-72 rounded-full overflow-hidden border-2 border-white/15 shadow-[0_0_70px_rgba(255,45,45,0.3)] bg-black transition-transform duration-500 hover:scale-[1.03]">
                                            <div className="profile-scanner" />
                                            <img src={branding.profileImage} alt="iABS - Mohammed Al-Qahtani official profile" className={`w-full h-full object-cover transition-transform duration-700 ${isHoveringProfile ? 'scale-110 rotate-1' : ''}`} loading="eager" />
                                            <div className="absolute inset-0 shadow-[inset_0_0_40px_rgba(0,0,0,0.75)] pointer-events-none" />
                                        </div>
                                        <div className="absolute -bottom-2 -end-1 z-20">
                                            <div className="relative w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center">
                                                <div className="absolute inset-0 bg-[#53FC18] rounded-2xl blur-lg opacity-40 animate-pulse" />
                                                <div className="relative w-full h-full bg-black rounded-2xl border border-[#53FC18]/60 flex items-center justify-center rotate-6">
                                                    <KickIcon className="w-6 h-6 sm:w-7 sm:h-7 text-[#53FC18] -rotate-6" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className={`absolute -top-2 -start-2 sm:-start-4 glass border rounded-2xl px-3 py-2 shadow-xl animate-float-soft max-w-[150px] ${streamInfo.isLive ? 'border-[#53FC18]/40' : 'border-white/10'}`}>
                                            <p className="text-[8px] sm:text-[9px] font-black tracking-widest text-white/40 uppercase">{streamInfo.isLive ? (lang === 'en' ? 'WATCHING' : 'مشاهد') : (lang === 'en' ? 'STATUS' : 'الحالة')}</p>
                                            <p className={`text-xs sm:text-sm font-black truncate ${streamInfo.isLive ? 'text-[#53FC18]' : 'text-white/70'}`} dir="ltr">
                                                {streamInfo.isLive ? `${streamInfo.viewers.toLocaleString()} ${t.viewers}` : t.statusOffline}
                                            </p>
                                        </div>
                                        <div className="absolute top-1/3 -end-2 md:-end-10 glass border border-[#FF2D2D]/30 rounded-2xl px-3 py-2 shadow-xl animate-float hidden min-[420px]:block" style={{ animationDelay: '-2s' }}>
                                            <p className="text-[8px] sm:text-[9px] font-black tracking-widest text-[#FF2D2D] uppercase" dir="ltr">KICK</p>
                                            <p className="text-xs sm:text-sm font-black text-white" dir="ltr">{socialStats['KICK']}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <Marquee lang={lang} />

                        {/* ===== SOCIALS BENTO ===== */}
                        <section id="socials" className="pt-12 md:pt-16 scroll-mt-28">
                            <Reveal><SectionHeading no="01" title={t.socialsTitle} sub={t.socialsSub} en="SOCIAL ARENA" /></Reveal>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                                {kickCard && (
                                    <Reveal delay={0} className="sm:col-span-2">
                                        <SocialCard social={kickCard} index={0} featured lang={lang} />
                                    </Reveal>
                                )}
                                {snapCard && (
                                    <Reveal delay={80}>
                                        <SocialCard social={snapCard} index={1} lang={lang} />
                                    </Reveal>
                                )}
                                {restSocials.map((s, i) => (
                                    <Reveal key={s.name} delay={Math.min(i * 60, 300)}>
                                        <SocialCard social={s} index={i + 2} lang={lang} />
                                    </Reveal>
                                ))}
                            </div>
                        </section>

                        {/* ===== LIVE THEATER ===== */}
                        {streamInfo.isLive && (
                            <section id="live" className="pt-12 md:pt-16 scroll-mt-28 animate-slide-down">
                                <Reveal><SectionHeading no="02" title={t.theaterTitle} sub={`${streamInfo.viewers.toLocaleString()} ${t.viewers}`} en="LIVE THEATER" /></Reveal>
                                <div className="relative rounded-[28px] p-[1px] bg-gradient-to-b from-[#FF2D2D]/60 via-white/10 to-transparent shadow-[0_30px_90px_rgba(255,45,45,0.18)]">
                                    <div className="rounded-[27px] bg-[#080808] overflow-hidden">
                                        <div className="flex flex-col xl:flex-row gap-0">
                                            <div className="flex-1 min-w-0 p-3 md:p-4">
                                                <div className="aspect-video rounded-2xl overflow-hidden bg-black border border-white/10">
                                                    <StreamPlayer lang={lang} isLive={streamInfo.isLive} viewers={streamInfo.viewers} channelSlug={CHANNEL_SLUG} poster={branding.bannerImage} />
                                                </div>
                                                <div className="p-4 md:p-5 flex flex-col gap-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0 flex-1">
                                                            <h3 className="text-lg md:text-2xl font-black text-white truncate" title={displayTitle}>{displayTitle}</h3>
                                                            <p className="text-sm text-white/50 font-bold mt-1"><span className="text-[#FF2D2D]">i</span><span className="text-white">ABS</span> <span className="text-white/25 mx-1">•</span> {displayCategory}</p>
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
                                            <div className="w-full xl:w-[360px] shrink-0 p-3 md:p-4 xl:ps-0">
                                                <div className="h-[480px] xl:h-full min-h-[480px] rounded-2xl overflow-hidden border border-white/10">
                                                    <ChatWidget lang={lang} isDemo={false} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        )}

                        {/* ===== COMMUNITY ===== */}
                        <section className="pt-12 md:pt-16">
                            <Reveal><SectionHeading no={streamInfo.isLive ? '03' : '02'} title={t.communityTitle} en="COMMUNITY HQ" /></Reveal>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-5">
                                <Reveal delay={0}><DiscordWidget lang={lang} /></Reveal>
                                <Reveal delay={100}><YoutubeWidget lang={lang} /></Reveal>
                            </div>
                        </section>

                        {/* ===== SUPPORT ===== */}
                        <section id="support" className="pt-12 md:pt-16 scroll-mt-28">
                            <Reveal><SectionHeading no={streamInfo.isLive ? '04' : '03'} title={t.supportTitle} sub={t.supportSub} en="SUPPORT" /></Reveal>
                            <Reveal delay={80}><SupportArena lang={lang} supporters={supporters} /></Reveal>
                        </section>

                        {/* ===== POLL ===== */}
                        {activePoll && (
                            <section className="pt-12 md:pt-16">
                                <Reveal>
                                    <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0a0a0a]/85 backdrop-blur-xl p-6 md:p-9 shadow-2xl">
                                        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-l from-transparent via-[#FF2D2D] to-transparent" />
                                        <div className="flex items-center justify-center gap-3 mb-7">
                                            <span className="w-2 h-2 rounded-full bg-[#FF2D2D] shadow-[0_0_10px_#FF2D2D] animate-pulse" />
                                            <h3 className="text-lg md:text-2xl font-black text-white text-center">{activePoll.question}</h3>
                                            <span className="w-2 h-2 rounded-full bg-[#FF2D2D] shadow-[0_0_10px_#FF2D2D] animate-pulse" />
                                        </div>
                                        <div className="flex flex-col gap-3 max-w-2xl mx-auto">
                                            {activePoll.options.map((opt: any) => {
                                                const total = activePoll.options.reduce((s: number, o: any) => s + o.votes, 0);
                                                const pct = total === 0 ? 0 : Math.round((opt.votes / total) * 100);
                                                const voted = !!localStorage.getItem(`voted_${activePoll.id}`);
                                                return (
                                                    <button key={opt.id} onClick={() => handleVote(opt.id)} disabled={voted}
                                                        className={`relative overflow-hidden rounded-2xl border p-4 md:p-5 transition-all duration-300 text-start ${voted ? 'border-white/[0.07] bg-white/[0.03] cursor-default' : 'border-white/10 bg-black/40 hover:border-[#FF2D2D]/50 hover:-translate-y-0.5'}`}>
                                                        {voted && <span className="absolute top-0 bottom-0 end-0 bg-gradient-to-l from-[#FF2D2D]/25 to-transparent transition-all duration-1000" style={{ width: `${pct}%` }} />}
                                                        <span className="relative z-10 flex justify-between items-center gap-3">
                                                            <span className="font-black text-white">{opt.text}</span>
                                                            {voted && <span className="text-sm font-black text-white/60" dir="ltr">{pct}% ({opt.votes})</span>}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <p className="text-center text-[10px] text-white/30 mt-6 font-black tracking-[0.3em] uppercase">{t.pollLive}</p>
                                    </div>
                                </Reveal>
                            </section>
                        )}

                        {/* ===== LAST SESSION ===== */}
                        {!streamInfo.isLive && (
                            <section className="pt-12 md:pt-16">
                                <LastSessionReport lang={lang} data={lastSession} clips={clips} past={pastSessions} />
                            </section>
                        )}

                        {/* ===== DYNAMIC: SPONSORS + CLIPS ===== */}
                        <section className="pt-12 md:pt-16 grid lg:grid-cols-2 gap-8 items-start">
                            <Reveal><SponsorsSection sponsors={sponsors} /></Reveal>
                            <Reveal delay={100}><ClipsSection clips={clipsList} /></Reveal>
                        </section>

                        <div id="schedule" className="pt-4 scroll-mt-28">
                            {isScheduleActive && <Reveal><ScheduleSection schedule={schedule} /></Reveal>}
                            {isFaqActive && <Reveal><FAQSection faqs={faqs} /></Reveal>}
                        </div>

                        <section className="pt-12 md:pt-16">
                            <Reveal><Suspense fallback={<div className="w-full h-40 rounded-[26px] border border-white/10 bg-white/[0.02] animate-pulse" />}><StatsSection lang={lang} /></Suspense></Reveal>
                        </section>

                        {/* ===== FOOTER ===== */}
                        <footer className="mt-16 md:mt-24 rounded-[28px] border border-white/10 bg-black/60 backdrop-blur-xl overflow-hidden relative">
                            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-[#FF2D2D]/70 to-transparent" />
                            <div className="p-8 md:p-12 text-center relative">
                                <p className="font-gaming text-[18vw] md:text-[120px] leading-none text-stroke opacity-40 select-none" dir="ltr" aria-hidden="true">iABS</p>
                                <div className="flex flex-wrap justify-center gap-2.5 -mt-4 md:-mt-8 relative">
                                    {socials.slice(0, 6).map(s => (
                                        <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={s.name}
                                            className="btn-arena w-11 h-11 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:border-[#FF2D2D]/50">
                                            <span className="scale-[0.8] block">{s.icon}</span>
                                        </a>
                                    ))}
                                </div>
                                {EMAIL_ADDRESS && (
                                    <a href={`mailto:${EMAIL_ADDRESS}`} className="inline-flex items-center gap-2 mt-6 text-white/40 hover:text-white text-xs font-bold transition-colors">
                                        <MailIcon className="w-4 h-4" /> {t.contact}: {EMAIL_ADDRESS}
                                    </a>
                                )}
                                <p className="text-[11px] font-black tracking-[0.3em] text-white/50 mt-6 uppercase">{t.poweredBy}</p>
                                <p className="text-[11px] text-white/35 mt-1">{t.footer}</p>
                                <button onClick={() => { if (isAdmin) setShowAdminDashboard(true); else setShowAdminLogin(true); }}
                                    className="mt-4 text-white/20 hover:text-white/60 transition-colors" aria-label="Admin">
                                    <svg className="w-4 h-4 mx-auto" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                                </button>
                            </div>
                        </footer>
                    </div>

                    <Suspense fallback={null}><AIChat lang={lang} /></Suspense>

                    {showAdminLogin && !isAdmin && (
                        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setShowAdminLogin(false)}>
                            <div className="bg-[#0c0c0c] border border-[#FF2D2D]/25 rounded-[28px] p-8 w-full max-w-sm shadow-[0_0_80px_rgba(255,45,45,0.2)] animate-fade-in-up relative overflow-hidden" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Admin login">
                                <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-l from-transparent via-[#FF2D2D] to-transparent" />
                                <div className="flex justify-center mb-6">
                                    <span className="w-14 h-14 rounded-2xl bg-[#FF2D2D]/10 border border-[#FF2D2D]/30 flex items-center justify-center">
                                        <svg className="w-7 h-7 text-[#FF2D2D]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                    </span>
                                </div>
                                <h2 className="text-xl font-black text-white mb-1 text-center">{lang === 'en' ? 'Welcome Back' : 'مرحباً بعودتك'}</h2>
                                <p className="text-white/40 text-sm text-center mb-6">{lang === 'en' ? 'Sign in to access the admin panel' : 'سجل الدخول للوحة التحكم'}</p>
                                <label className="block text-xs font-bold text-white/40 mb-1.5">{lang === 'en' ? 'Email' : 'البريد الإلكتروني'}</label>
                                <input type="email" autoComplete="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)}
                                    placeholder={lang === 'en' ? 'Email address' : 'البريد الإلكتروني'}
                                    className="w-full bg-black/60 border border-white/10 rounded-xl p-3.5 text-white font-bold focus:border-[#FF2D2D]/60 outline-none transition-colors placeholder:text-white/20 mb-3" />
                                <label className="block text-xs font-bold text-white/40 mb-1.5">{lang === 'en' ? 'Password' : 'كلمة المرور'}</label>
                                <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdminLogin()} autoFocus
                                    placeholder={lang === 'en' ? 'Password' : 'كلمة المرور'}
                                    className="w-full bg-black/60 border border-white/10 rounded-xl p-3.5 text-white font-bold focus:border-[#FF2D2D]/60 outline-none transition-colors placeholder:text-white/20 mb-6" />
                                <div className="flex gap-2.5">
                                    <button onClick={() => setShowAdminLogin(false)} className="flex-1 bg-white/5 hover:bg-white/10 text-white/70 font-bold py-3.5 rounded-xl transition-colors border border-white/10">{lang === 'en' ? 'Cancel' : 'إلغاء'}</button>
                                    <button disabled={adminBusy} onClick={handleAdminLogin}
                                        className="flex-1 bg-[#FF2D2D] hover:bg-[#ff4d4d] text-black font-black py-3.5 rounded-xl transition-colors disabled:opacity-60">
                                        {adminBusy ? (lang === 'en' ? 'Signing in…' : 'جاري الدخول…') : (lang === 'en' ? 'Sign In' : 'تسجيل الدخول')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
