import React, { useEffect, useState, useRef } from 'react';
import Hls from 'hls.js';
import { Language, LeaderboardData, Clip, Video, ChannelInfo, LeaderboardEntry } from '../types';
import { KickIcon } from './Icons';
import BotrixLeaderboard from './BotrixLeaderboard';
import { kickFetch } from '../utils/kickApi';

interface StatsSectionProps {
  lang: Language;
}

const FALLBACK_IMAGE = "https://files.kick.com/images/user/1106194/profile_image/conversion/140c7236-24f9-4267-b318-6be659f6035e-fullsize.webp";

const formatNumber = (num: number) => {
  return new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(num || 0);
};

const fmtDur = (ms: number) => {
  const s = Math.floor((ms > 1000000 ? ms / 1000 : ms) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// Skeleton Primitive
const Skeleton: React.FC<{ className: string }> = ({ className }) => (
  <div className={`bg-white/5 animate-pulse rounded-xl ${className}`}></div>
);

// Animated followers counter (rAF, reduced-motion safe)
const KickCount: React.FC<{ value: number }> = ({ value }) => {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(value); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 1400);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span dir="ltr">{n.toLocaleString('en-US')}</span>;
};

// --- CHAMPION ICONS ---

const CrownIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <defs>
      <linearGradient id="crownGold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FDE68A" />
        <stop offset="55%" stopColor="#F59E0B" />
        <stop offset="100%" stopColor="#B45309" />
      </linearGradient>
    </defs>
    <path fill="url(#crownGold)" d="M2.5 8.5 6.5 12l5.5-7 5.5 7 4-3.5L20 18H4L2.5 8.5z" />
    <rect x="4" y="18.6" width="16" height="2.2" rx="1.1" fill="url(#crownGold)" />
    <circle cx="12" cy="12.6" r="1.4" fill="#FFF7D6" />
  </svg>
);

const BoltIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <defs>
      <linearGradient id="boltRose" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FDA4AF" />
        <stop offset="55%" stopColor="#F43F5E" />
        <stop offset="100%" stopColor="#9F1239" />
      </linearGradient>
    </defs>
    <path fill="url(#boltRose)" d="M13 2 4.5 13.5H10L9 22l8.5-11.5H12L13 2z" />
  </svg>
);

const MedalIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <defs>
      <linearGradient id="medalCyan" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#67E8F9" />
        <stop offset="55%" stopColor="#0891B2" />
        <stop offset="100%" stopColor="#155E75" />
      </linearGradient>
    </defs>
    <path stroke="url(#medalCyan)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M8.5 9.5 6 2h4.5L12 6.8 13.5 2H18l-2.5 7.5" />
    <circle cx="12" cy="15" r="5.2" stroke="url(#medalCyan)" strokeWidth="2.2" />
    <circle cx="12" cy="15" r="1.6" fill="url(#medalCyan)" />
  </svg>
);

interface LeaderboardCardProps {
  title: string;
  subtitle: string;
  data: LeaderboardEntry[];
  icon: React.ReactNode;
  accentColor: 'yellow' | 'rose' | 'cyan';
  isMain?: boolean;
  lang: Language;
  t: any;
  delay: number;
  emptyLabel?: string;
  className?: string;
}

const LeaderboardCard: React.FC<LeaderboardCardProps> = ({ title, subtitle, data, icon, accentColor, isMain, lang, t, delay, emptyLabel, className }) => {

  // Config based on accent color
  const config = {
    yellow: {
      border: 'border-yellow-500/20',
      glow: 'shadow-[0_0_40px_-10px_rgba(234,179,8,0.15)]',
      text: 'text-yellow-400',
      bgIcon: 'bg-yellow-500/10',
      gradient: 'from-yellow-400 to-amber-600',
      subText: 'text-yellow-200/50',
      frame: 'from-yellow-400/70 via-yellow-400/10 to-transparent',
      glowColor: '234,179,8',
      barBright: '#FDE68A',
      barDeep: '#B45309',
      medalBg: 'linear-gradient(160deg,#FDE68A,#B45309)'
    },
    rose: {
      border: 'border-[#FF2D2D]/20',
      glow: 'shadow-[0_0_40px_-10px_rgba(255,45,45,0.15)]',
      text: 'text-[#FF2D2D]',
      bgIcon: 'bg-[#FF2D2D]/10',
      gradient: 'from-[#FF2D2D] to-red-800',
      subText: 'text-red-200/50',
      frame: 'from-[#FF2D2D]/70 via-[#FF2D2D]/10 to-transparent',
      glowColor: '255,45,45',
      barBright: '#FDA4AF',
      barDeep: '#9F1239',
      medalBg: 'linear-gradient(160deg,#FB7185,#9F1239)'
    },
    cyan: {
      border: 'border-cyan-500/20',
      glow: 'shadow-[0_0_40px_-10px_rgba(6,182,212,0.15)]',
      text: 'text-cyan-400',
      bgIcon: 'bg-cyan-500/10',
      gradient: 'from-cyan-400 to-blue-600',
      subText: 'text-cyan-200/50',
      frame: 'from-cyan-400/70 via-cyan-400/10 to-transparent',
      glowColor: '6,182,212',
      barBright: '#67E8F9',
      barDeep: '#0E7490',
      medalBg: 'linear-gradient(160deg,#67E8F9,#0E7490)'
    }
  }[accentColor];

  // Helper for Rank Badges
  const renderRankBadge = (rank: number) => {
    if (rank === 1) return (
      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-[#FFD700] to-[#FDB931] shadow-[0_0_15px_rgba(255,215,0,0.5)] border border-[#FFFACD]/50 text-black font-black text-sm shrink-0">
        1
      </div>
    );
    if (rank === 2) return (
      <div className="w-7 h-7 rounded-full flex items-center justify-center bg-gradient-to-br from-[#E0E0E0] to-[#BDBDBD] shadow-[0_0_10px_rgba(192,192,192,0.3)] border border-white/50 text-black font-black text-xs shrink-0">
        2
      </div>
    );
    if (rank === 3) return (
      <div className="w-6 h-6 rounded-full flex items-center justify-center bg-gradient-to-br from-[#E6A373] to-[#8B4513] shadow-[0_0_10px_rgba(205,127,50,0.3)] border border-[#FFDAB9]/30 text-white font-black text-[10px] shrink-0">
        3
      </div>
    );
    return (
      <span className="w-6 text-center text-xs font-bold text-white/30 font-mono shrink-0">
        {rank < 10 ? `0${rank}` : rank}
      </span>
    );
  };

  // Render Empty State
  if (!data || data.length === 0) {
    return (
      <div className={`
                 relative flex flex-col items-center justify-center p-6 text-center rounded-[26px] overflow-hidden
                 bg-[#080808]/80 backdrop-blur-xl border border-dashed border-white/10
                 transition-all duration-500 hover:border-white/20 group
                 ${isMain ? 'lg:-mt-4 z-10 min-h-[300px] md:min-h-[440px]' : 'min-h-[250px] md:min-h-[380px]'}
                 ${className}
             `}
        style={{ animationDelay: `${delay}ms` }}>
        <div className={`absolute top-0 inset-x-0 h-[2px] bg-gradient-to-l from-transparent via-white/20 to-transparent opacity-60`} />
        <div className={`p-4 md:p-5 rounded-2xl ${config.bgIcon} mb-4 md:mb-5 opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500 border border-white/10`}>
          {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: `w-6 h-6 md:w-8 md:h-8 ${config.text} drop-shadow-lg` })}
        </div>
        <h3 className={`text-sm md:text-base font-bold text-white/60 mb-1 uppercase tracking-[0.2em]`}>{title}</h3>
        <p className={`text-[10px] md:text-xs ${config.subText} font-medium`}>{emptyLabel || t.noData}</p>
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => b.quantity - a.quantity).slice(0, 10);
  const maxQ = Math.max(1, ...sorted.map(e => e.quantity || 0));
  const totalQ = sorted.reduce((s, e) => s + (e.quantity || 0), 0);
  const champ = sorted[0];

  return (
    <div
      className={`group relative rounded-[26px] p-[1.5px] bg-gradient-to-b ${config.frame} ${isMain ? 'md:-mt-8 z-20 md:scale-[1.03]' : ''} ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="absolute -inset-1.5 rounded-[28px] blur-2xl opacity-30 group-hover:opacity-70 transition-opacity duration-500 pointer-events-none" style={{ background: `linear-gradient(180deg, rgba(${config.glowColor},0.35), transparent 60%)` }} />
      <div className="card-sheen relative rounded-[24.5px] bg-[#080808]/95 backdrop-blur-xl overflow-hidden perspective-1000 [transform-style:preserve-3d]">
        <div className="absolute top-0 inset-x-8 h-[2px] rounded-full opacity-80" style={{ background: `linear-gradient(90deg, transparent, rgba(${config.glowColor},0.9), transparent)` }} />

        {/* Header with 3D medallion — stacks vertically in narrow half-cards */}
        <div className={`relative p-3 sm:p-4 md:p-6 pb-3 md:pb-4 flex ${isMain ? 'flex-row' : 'flex-col'} sm:flex-row items-center gap-2.5 sm:gap-3.5 md:gap-4 border-b border-white/5 z-10`}>
          <div className={`${isMain ? 'w-12 h-12 md:w-16 md:h-16' : 'w-10 h-10 md:w-16 md:h-16'} rounded-2xl flex items-center justify-center border border-white/15 shrink-0 [transform:translateZ(28px)] transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6`}
            style={{ background: config.medalBg, boxShadow: `0 12px 30px -8px rgba(${config.glowColor},0.55), inset 0 1px 0 rgba(255,255,255,0.45)` }}>
            {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: `${isMain ? 'w-6 h-6 md:w-8 md:h-8' : 'w-5 h-5 md:w-8 md:h-8'} drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]` }) : icon}
          </div>
          <div className={`min-w-0 flex-1 ${isMain ? '' : 'text-center sm:text-start'}`}>
            <h3 className={`text-base sm:text-lg md:text-2xl font-black text-white tracking-tight leading-none mb-1 ${lang === 'ar' ? 'font-arabic' : ''}`}>{title}</h3>
            <span className={`text-[8px] sm:text-[9px] md:text-[10px] font-bold uppercase tracking-[0.22em] md:tracking-[0.3em] bg-gradient-to-r ${config.gradient} bg-clip-text text-transparent`}>{subtitle}</span>
          </div>
          <div className={`${isMain ? 'text-end' : 'text-center sm:text-end'} shrink-0`}>
            <p className="text-base sm:text-lg md:text-xl font-black text-white leading-none" dir="ltr">{formatNumber(totalQ)}</p>
            <p className={`text-[8px] md:text-[9px] font-bold uppercase tracking-[0.2em] mt-1 ${config.subText}`}>{t.gift} • {sorted.length}</p>
          </div>
        </div>

        {/* Champion banner */}
        {champ && (
          <div className="mx-3 md:mx-4 mt-3 rounded-2xl p-[1px]" style={{ background: 'linear-gradient(120deg,#FDE68A,#B45309,#FDE68A)' }}>
            <div className="rounded-[15px] bg-black/85 px-2.5 sm:px-3 py-2 sm:py-2.5 flex items-center gap-2 overflow-hidden">
              <CrownIcon className="w-5 h-5 md:w-7 md:h-7 shrink-0 drop-shadow-[0_0_10px_rgba(255,215,0,0.6)]" />
              <p className="flex-1 min-w-0 text-xs sm:text-sm md:text-base font-black text-white truncate" dir="auto">{champ.username}</p>
              <p className="text-xs sm:text-sm md:text-base font-black text-[#FFD700] shrink-0" dir="ltr">{formatNumber(champ.quantity)}</p>
            </div>
          </div>
        )}

        {/* List with progress bars */}
        <div className="flex-1 p-2.5 md:p-4 space-y-1.5 md:space-y-2.5 relative overflow-y-auto max-h-[300px] md:max-h-[400px] scrollbar-hide">
          {sorted.slice(1).map((entry, idx) => {
            const rank = idx + 2;
            const pct = Math.max(4, Math.round(((entry.quantity || 0) / maxQ) * 100));
            return (
              <div key={idx} className="relative rounded-xl md:rounded-2xl p-1.5 sm:p-2 md:p-3 transition-all duration-300 group/row hover:bg-white/[0.04] hover:-translate-y-0.5 border border-transparent hover:border-white/10">
                <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 min-w-0">
                  <div className="shrink-0 flex justify-center w-8">
                    {renderRankBadge(rank)}
                  </div>
                  <span className="flex-1 min-w-0 text-xs sm:text-[13px] md:text-[15px] font-bold text-white/90 truncate group-hover/row:text-white transition-colors" dir="auto">
                    {entry.username}
                  </span>
                  <span className={`text-xs sm:text-[13px] md:text-[15px] font-black tracking-wide ${config.text} shrink-0`} dir="ltr">
                    {formatNumber(entry.quantity)}
                  </span>
                </div>
                <div className="mt-1.5 md:mt-2 ms-10 md:ms-11 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="bar-grow h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(to left, ${config.barBright}, ${config.barDeep})`, boxShadow: `0 0 8px rgba(${config.glowColor},0.5)`, animationDelay: `${idx * 80}ms`, transformOrigin: lang === 'ar' ? 'right' : 'left' }} />
                </div>
              </div>
            );
          })}
          <div className="h-3"></div>
        </div>

        {/* Bottom Fade Mask */}
        <div className="absolute bottom-0 left-0 right-0 h-12 md:h-16 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none z-20"></div>
      </div>
    </div>
  );
};


export const StatsSection: React.FC<StatsSectionProps> = ({ lang }) => {
  // Initialize as null to indicate "loading"
  const [leaderboards, setLeaderboards] = useState<LeaderboardData | null>(null);
  const [clips, setClips] = useState<Clip[] | null>(null);
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [channelInfo, setChannelInfo] = useState<ChannelInfo | null>(null);


  const t = {
    followers: lang === 'en' ? 'Followers' : 'متابع',
    topGifters: lang === 'en' ? 'Top Gifters' : 'كبار الداعمين',
    allTime: lang === 'en' ? 'All Time' : 'الأفضل',
    monthly: lang === 'en' ? 'Monthly' : 'شهرياً',
    weekly: lang === 'en' ? 'Weekly' : 'أسبوعياً',
    recentClips: lang === 'en' ? 'Recent Clips' : 'آخر اللقطات',
    recentVods: lang === 'en' ? 'Past Streams' : 'البثوث السابقة',
    views: lang === 'en' ? 'Views' : 'مشاهدة',
    gift: lang === 'en' ? 'Gifts' : 'هدية',
    subBadges: lang === 'en' ? 'Sub Badges' : 'شارات المشتركين',
    noData: lang === 'en' ? 'No Data' : 'لا يوجد بيانات',
    watching: lang === 'en' ? 'Now Playing' : 'جاري المشاهدة',

    // Custom Empty States
    noDataWeekly: lang === 'en' ? 'No active gifters this week' : 'لا يوجد داعمين هذا الأسبوع',
    noDataMonthly: lang === 'en' ? 'No active gifters this month' : 'لا يوجد داعمين لهذا الشهر',
    noDataAllTime: lang === 'en' ? 'No records found' : 'لا يوجد سجلات بعد',
  };

  useEffect(() => {
    const channelSlug = 'iabs';
    
    const endpoints = {
      leaderboard: `https://kick.com/api/v2/channels/${channelSlug}/leaderboards`,
      clips: `https://kick.com/api/v2/channels/${channelSlug}/clips`,
      videos: `https://kick.com/api/v2/channels/${channelSlug}/videos`,
      channel: `https://kick.com/api/v2/channels/${channelSlug}`
    };

    // جلب معلومات القناة (المتابعين)
    kickFetch(endpoints.channel).then(rawData => {
        const data = rawData?.data || rawData; // فك التغليف إن وجد
        if (data) {
            setChannelInfo({
                followers_count: data.followers_count || 0,
                subscriber_badges: data.subscriber_badges || []
            });
        }
    }).catch(() => setChannelInfo({ followers_count: 0, subscriber_badges: [] }));

    // جلب الداعمين
    kickFetch(endpoints.leaderboard).then(rawData => {
        const data = rawData?.data || rawData; // فك التغليف
        if (data) {
            setLeaderboards({
                gifts: data.gifts || [],
                gifts_week: data.gifts_week || [],
                gifts_month: data.gifts_month || [] 
            });
        }
    }).catch(() => setLeaderboards({ gifts: [], gifts_week: [], gifts_month: [] }));

    // جلب اللقطات (آخر اللقطات مع منطق استخراج قوي لضمان ظهور البيانات)
    kickFetch(endpoints.clips).then(rawData => {
        // فك التغليف لجميع الهياكل المحتملة من Kick API
        const data = rawData?.data || rawData; 
        const clipsArray = data?.clips || (Array.isArray(data) ? data : (data?.data && Array.isArray(data.data) ? data.data : []));
        
        // ترتيب تنازلي حسب التاريخ (الأحدث أولاً)
        const sortedClips = [...clipsArray].sort((a: any, b: any) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        setClips(sortedClips.slice(0, 4));
    }).catch(() => setClips([]));

    // جلب الفيديوهات
    kickFetch(endpoints.videos).then(rawData => {
        const data = rawData?.data || rawData; // فك التغليف
        const videosArray = data?.videos || (Array.isArray(data) ? data : []);
        setVideos(videosArray.slice(0, 3));
    }).catch(() => setVideos([]));

  }, []);

  return (
    <>
      <div className="w-full space-y-16 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>

        {/* --- KICK FORTRESS: followers + sub badges in 3D --- */}
        {channelInfo ? (
          <div className="relative [perspective:1200px]">
            <div className="absolute -inset-2 rounded-[36px] bg-gradient-to-b from-[#FF2D2D]/15 via-transparent to-transparent blur-2xl pointer-events-none" aria-hidden="true" />
            <div className="group card-sheen relative overflow-hidden rounded-[30px] border border-[#FF2D2D]/25 bg-[#0d0505]/90 backdrop-blur-xl shadow-[0_30px_80px_-20px_rgba(255,45,45,0.3)] [transform-style:preserve-3d]">
              <div aria-hidden="true" className="absolute -end-8 -bottom-12 opacity-[0.07] scale-[3.2] origin-bottom-right pointer-events-none text-[#FF2D2D]">
                <KickIcon className="w-24 h-24" />
              </div>
              <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-l from-transparent via-[#FF2D2D]/70 to-transparent" />
              <div className="relative p-5 sm:p-8 flex flex-col lg:flex-row items-center gap-6 lg:gap-10 [transform-style:preserve-3d]">

                {/* 3D K emblem + live followers */}
                <div className="flex items-center justify-center sm:justify-start gap-4 sm:gap-5 shrink-0 w-full sm:w-auto">
                  <div className="relative w-[72px] h-[72px] sm:w-24 sm:h-24 shrink-0 [transform:translateZ(36px)]">
                    <KickIcon className="absolute inset-0 m-auto w-9 h-9 sm:w-12 sm:h-12 translate-x-[6px] translate-y-[7px] text-[#123f0c]" aria-hidden="true" />
                    <KickIcon className="absolute inset-0 m-auto w-9 h-9 sm:w-12 sm:h-12 translate-x-[3px] translate-y-[3px] text-[#1e6b12]" aria-hidden="true" />
                    <div className="absolute inset-0 rounded-[22px] sm:rounded-[24px] bg-gradient-to-b from-[#8dff6a] via-[#53FC18] to-[#2b9e1c] border border-[#c6ffab]/60 shadow-[0_0_44px_rgba(83,252,24,0.55),inset_0_2px_0_rgba(255,255,255,0.5)] flex items-center justify-center transition-transform duration-500 group-hover:scale-105 group-hover:rotate-3">
                      <KickIcon className="w-9 h-9 sm:w-12 sm:h-12 text-black" />
                    </div>
                    <span className="absolute -bottom-2 inset-x-6 h-3 rounded-full bg-[#53FC18]/50 blur-md" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 text-center sm:text-start [transform:translateZ(18px)]">
                    <p className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-[0.25em] text-[#ff6b6b] uppercase">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FF2D2D] animate-pulse shadow-[0_0_8px_#FF2D2D]" />
                      {t.followers} • KICK
                    </p>
                    <p className="text-4xl sm:text-5xl font-black text-white tracking-tighter leading-none mt-1 drop-shadow-lg">
                      <KickCount value={channelInfo.followers_count} />
                    </p>
                    <a href="https://kick.com/iabs" target="_blank" rel="noopener noreferrer"
                      className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-black px-5 py-2.5 rounded-full border border-[#FF2D2D]/60 text-[#ff6b6b] hover:bg-[#FF2D2D] hover:text-black hover:shadow-[0_0_24px_rgba(255,45,45,0.6)] active:scale-95 transition-all duration-300">
                      {lang === 'en' ? 'FOLLOW' : 'تابع الآن'}
                      <svg className={`w-3.5 h-3.5 ${lang === 'ar' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    </a>
                  </div>
                </div>

                {/* sub badges podium */}
                <div className="flex-1 w-full min-w-0">
                  {channelInfo.subscriber_badges && channelInfo.subscriber_badges.length > 0 && (
                    <>
                      <div className="flex items-center justify-center lg:justify-end gap-2.5 mb-4">
                        <span className="text-[10px] text-white/40 font-black uppercase tracking-[0.25em]">{t.subBadges}</span>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#FF2D2D]/15 border border-[#FF2D2D]/40 text-[#ff6b6b]" dir="ltr">{channelInfo.subscriber_badges.length}</span>
                      </div>
                      <div className="flex flex-wrap justify-center lg:justify-end gap-2 sm:gap-3.5">
                        {[...channelInfo.subscriber_badges].sort((a, b) => a.months - b.months).map((badge, i) => (
                          <div key={badge.id} className="flex flex-col items-center basis-[calc(25%-6px)] sm:basis-auto opacity-0 animate-fade-in-up" style={{ animationDelay: `${i * 90}ms` }}>
                            <div className="group/badge relative w-14 h-14 sm:w-[68px] sm:h-[68px] rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/10 p-2 transition-all duration-300 hover:-translate-y-1.5 hover:border-[#FF2D2D]/60 hover:shadow-[0_14px_30px_-8px_rgba(255,45,45,0.55)]">
                              <div className="absolute inset-x-3 top-0 h-px bg-gradient-to-l from-transparent via-white/40 to-transparent" />
                              <img
                                src={badge.badge_image.src}
                                alt={`${badge.months} months subscriber badge`}
                                loading="lazy"
                                className="w-full h-full object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.6)] transition-transform duration-300 group-hover/badge:scale-110"
                                title={`${badge.months} Months`}
                              />
                            </div>
                            <span className="mt-1.5 text-[9px] sm:text-[10px] font-black text-white/50 tracking-wider" dir="ltr">{badge.months}M</span>
                            <span className="w-8 h-[3px] rounded-full bg-black/60 border-b border-white/10 mt-1" aria-hidden="true" />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

              </div>
            </div>
          </div>
        ) : (
          <Skeleton className="h-32 w-full rounded-[30px]" />
        )}

        {/* --- LEADERBOARDS --- */}
        <div className="relative space-y-12">

          {/* Minimal Header */}
          <div className="flex flex-col items-center justify-center gap-2 text-center relative z-10">
            <h2 className={`text-3xl md:text-5xl font-black text-white tracking-tight drop-shadow-xl ${lang === 'ar' ? 'font-arabic' : ''}`}>
              {t.topGifters}
            </h2>
            <div className="h-px w-20 bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
          </div>

          {leaderboards ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-8 items-start relative px-1">

              {/* All Time (Center on Desktop, Top Full on Mobile) - Gold/Yellow Theme */}
              <LeaderboardCard
                title={t.allTime}
                subtitle="Legends"
                data={leaderboards.gifts}
                icon={<CrownIcon />}
                accentColor="yellow"
                isMain={true}
                lang={lang}
                t={t}
                delay={0}
                emptyLabel={t.noDataAllTime}
                className="col-span-2 md:col-span-1 order-1 md:order-2"
              />

              {/* Weekly (Left on Desktop, Side-by-side on Mobile) - Rose Theme */}
              <LeaderboardCard
                title={t.weekly}
                subtitle="Active"
                data={leaderboards.gifts_week}
                icon={<BoltIcon />}
                accentColor="rose"
                lang={lang}
                t={t}
                delay={100}
                emptyLabel={t.noDataWeekly}
                className="col-span-1 md:col-span-1 order-2 md:order-1"
              />

              {/* Monthly (Right on Desktop, Side-by-side on Mobile) - Cyan/Blue Theme */}
              <LeaderboardCard
                title={t.monthly}
                subtitle="Stars"
                data={leaderboards.gifts_month}
                icon={<MedalIcon />}
                accentColor="cyan"
                lang={lang}
                t={t}
                delay={200}
                emptyLabel={t.noDataMonthly}
                className="col-span-1 md:col-span-1 order-3 md:order-3"
              />

            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
              <Skeleton className="col-span-2 md:col-span-1 order-1 md:order-2 h-80 md:h-[480px] w-full rounded-3xl -mt-0 md:-mt-8" />
              <Skeleton className="col-span-1 order-2 md:order-1 h-64 md:h-96 w-full rounded-3xl" />
              <Skeleton className="col-span-1 order-3 md:order-3 h-64 md:h-96 w-full rounded-3xl" />
            </div>
          )}
        </div>

        {/* --- BOTRIX LEADERBOARD (Most Active Across Streams) --- */}
        <div className="pt-8 border-t border-white/5">
          <BotrixLeaderboard lang={lang} />
        </div>

        {/* --- CLIPS & VODS GRID --- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 pt-8 border-t border-white/5">

          {/* CLIPS — neon reel */}
          <div className="space-y-5 [perspective:1200px]">
            <div className="flex items-center gap-3.5">
              <div className="relative shrink-0 [transform:translateZ(24px)]">
                <div className="absolute -inset-1.5 bg-[#FF2D2D]/50 blur-xl opacity-40 rounded-2xl" />
                <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-b from-[#ff6b6b] to-[#a31212] border border-[#ffb3b3]/40 shadow-[0_10px_28px_-8px_rgba(255,45,45,0.6)] flex items-center justify-center transition-transform duration-500 hover:rotate-6 hover:scale-105">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-none">{t.recentClips}</h3>
                <p className="text-[10px] sm:text-[11px] font-bold text-white/35 uppercase tracking-[0.22em] mt-1" dir="ltr">{clips?.length || 0} CLIPS</p>
              </div>
              <a href="https://kick.com/iabs/clips" target="_blank" rel="noreferrer"
                className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-black px-3.5 py-2 rounded-full border border-white/10 text-white/55 hover:text-white hover:border-[#FF2D2D]/50 hover:shadow-[0_0_18px_rgba(255,45,45,0.35)] active:scale-95 transition-all">
                {lang === 'en' ? 'ALL' : 'الكل'}
                <svg className={`w-3.5 h-3.5 ${lang === 'ar' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </a>
            </div>

            {clips ? (
              clips.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {clips.map((clip, i) => (
                    <div key={clip.id} className="opacity-0 animate-fade-in-up" style={{ animationDelay: `${i * 90}ms` }}>
                      <a
                        href={`https://kick.com/iabs?clip=${clip.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="group relative block aspect-video rounded-2xl overflow-hidden border border-white/10 bg-[#050505] shadow-lg hover:border-[#FF2D2D]/50 hover:shadow-[0_18px_44px_-12px_rgba(255,45,45,0.45)] hover:[transform:perspective(800px)_rotateX(5deg)_rotateY(-5deg)_translateY(-4px)] transition-all duration-500 [transform-style:preserve-3d]"
                      >
                        <img
                          src={clip.thumbnail_url || FALLBACK_IMAGE}
                          alt={clip.title}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
                          }}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-80 group-hover:opacity-100"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 duration-300">
                          <div className="relative w-12 h-12 rounded-full bg-[#FF2D2D]/30 backdrop-blur-md border border-[#FF2D2D]/60 flex items-center justify-center group-hover:scale-110 transition-transform shadow-[0_0_28px_rgba(255,45,45,0.5)]">
                            <svg className="w-5 h-5 fill-white ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                          </div>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-90 pointer-events-none"></div>
                        <span className="absolute top-2 start-2 min-w-[22px] h-[22px] px-1.5 rounded-lg bg-black/70 backdrop-blur border border-[#FF2D2D]/40 text-[#ff8080] text-[10px] font-black flex items-center justify-center" dir="ltr">#{i + 1}</span>
                        <div className="absolute bottom-0 inset-x-0 p-2.5 sm:p-3">
                          <p className="text-[11px] sm:text-xs font-bold text-white truncate drop-shadow-md">{clip.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] text-white/70">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                              <span dir="ltr">{formatNumber(clip.view_count)}</span>
                            </span>
                            {(clip.creator as any)?.username && (
                              <span className="text-[9px] sm:text-[10px] text-[#ff8080] font-bold truncate" dir="auto">@{(clip.creator as any).username}</span>
                            )}
                          </div>
                        </div>
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 rounded-2xl bg-white/5 border border-dashed border-white/10 text-center text-white/30 text-sm">{t.noData}</div>
              )
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="aspect-video w-full rounded-2xl" />)}
              </div>
            )}
          </div>

          {/* VIDEOS — cinema archive */}
          <div className="space-y-5 [perspective:1200px]">
            <div className="flex items-center gap-3.5">
              <div className="relative shrink-0 [transform:translateZ(24px)]">
                <div className="absolute -inset-1.5 bg-white/30 blur-xl opacity-30 rounded-2xl" />
                <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-b from-[#3a3a3a] to-[#0c0c0c] border border-white/20 shadow-[0_10px_28px_-8px_rgba(0,0,0,0.8)] flex items-center justify-center transition-transform duration-500 hover:rotate-6 hover:scale-105">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-none">{t.recentVods}</h3>
                <p className="text-[10px] sm:text-[11px] font-bold text-white/35 uppercase tracking-[0.22em] mt-1" dir="ltr">{videos?.length || 0} VODS</p>
              </div>
              <a href="https://kick.com/iabs/videos" target="_blank" rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-black px-3.5 py-2 rounded-full border border-white/10 text-white/55 hover:text-white hover:border-[#FF2D2D]/50 hover:shadow-[0_0_18px_rgba(255,45,45,0.35)] active:scale-95 transition-all">
                {lang === 'en' ? 'ALL' : 'الكل'}
                <svg className={`w-3.5 h-3.5 ${lang === 'ar' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </a>
            </div>

            {videos ? (
              videos.length > 0 ? (
                <div className="space-y-3 sm:space-y-4">
                  {videos.map((video, i) => {
                    // Kick UUID is usually at root or nested in video.video for V2
                    const videoUUID = video.uuid || video.video?.uuid || video.id;
                    const dur = (video as any).duration || 0;
                    return (
                      <div key={video.id} className="opacity-0 animate-fade-in-up" style={{ animationDelay: `${i * 100}ms` }}>
                        <a
                          href={`https://kick.com/iabs/videos/${videoUUID}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-2xl bg-[#080808]/90 border border-white/[0.06] hover:border-[#FF2D2D]/40 hover:bg-[#0e0a0a] hover:-translate-y-1 hover:shadow-[0_18px_40px_-14px_rgba(255,45,45,0.4)] active:scale-[0.99] transition-all duration-300 cursor-pointer"
                        >
                          <div className="relative w-32 sm:w-40 aspect-video rounded-xl overflow-hidden shrink-0 bg-black shadow-inner [transform:perspective(600px)_rotateY(-7deg)] group-hover:[transform:perspective(600px)_rotateY(0deg)] transition-transform duration-500 border border-white/10 group-hover:border-[#FF2D2D]/40">
                            <img
                              src={video.thumbnail?.url || video.thumbnail?.src || (typeof video.thumbnail === 'string' ? video.thumbnail : '') || FALLBACK_IMAGE}
                              alt={video.session_title || video.title}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
                              }}
                              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-transparent transition-colors">
                              <div className="w-8 h-8 rounded-full bg-[#FF2D2D]/80 backdrop-blur-sm flex items-center justify-center border border-white/30 group-hover:scale-110 transition-transform shadow-[0_0_18px_rgba(255,45,45,0.6)]">
                                <svg className="w-4 h-4 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                              </div>
                            </div>
                            {dur > 0 && <span className="absolute bottom-1.5 end-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-md bg-black/80 border border-white/15 text-white" dir="ltr">{fmtDur(dur)}</span>}
                          </div>
                          <div className="min-w-0 flex-1 flex flex-col justify-center gap-1.5 py-0.5">
                            <h4 className="text-[13px] sm:text-sm font-bold text-white truncate group-hover:text-[#ff8080] transition-colors">
                              {video.session_title || video.title || 'Past Stream'}
                            </h4>
                            <div className="flex items-center gap-2.5 text-[10px] sm:text-[11px] text-white/40 font-medium">
                              <span className="truncate">{video.created_at ? new Date(video.created_at).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { day: 'numeric', month: 'short' }) : 'Recent'}</span>
                              <span className="w-1 h-1 rounded-full bg-white/20 shrink-0"></span>
                              <span className="inline-flex items-center gap-1 shrink-0" dir="ltr">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                {formatNumber(video.views || video.view_count || 0)}
                              </span>
                            </div>
                          </div>
                          <span className="self-center shrink-0 w-8 h-8 rounded-full border border-white/10 hidden sm:flex items-center justify-center text-white/40 group-hover:text-white group-hover:border-[#FF2D2D]/60 group-hover:bg-[#FF2D2D]/15 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition-all">
                            <svg className={`w-4 h-4 ${lang === 'ar' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                          </span>
                        </a>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 rounded-2xl bg-white/5 border border-dashed border-white/10 text-center text-white/30 text-sm">{t.noData}</div>
              )
            ) : (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="w-32 aspect-video shrink-0 rounded-xl" />
                    <div className="flex-1 space-y-2 py-2">
                      <Skeleton className="w-full h-4 rounded-md" />
                      <Skeleton className="w-2/3 h-3 rounded-md" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};