import React, { useEffect, useState } from 'react';
import type { Language } from '../types';

interface RosterEntry {
  kick: string;
  x: string;
  boss?: boolean;
}

// 11 moderators — Kick name + X handle (live data via FixTweet)
const ROSTER: RosterEntry[] = [
  { kick: 'A7MEDO', x: '_A7MEDO_', boss: true },
  { kick: 'iiiBADR', x: '1liBadr' },
  { kick: 'JustN2sr', x: 'JustN2sr' },
  { kick: 'llHMD', x: '1HHMMDD' },
  { kick: '2Yaseer', x: 'ieY52' },
  { kick: 'M0ATAZ', x: 'S7_Moataz' },
  { kick: 'Alghamdiz', x: 'S7le_A' },
  { kick: 'xAREEJ1', x: 'itsxAREEJ1' },
  { kick: 'uANWAR', x: '_pnj8' },
  { kick: 'MISK_RY', x: 'MISK_RY' },
  { kick: '7rema', x: '7reml4' },
];

interface ModProfile {
  name: string;
  handle: string;
  avatar: string;
  banner: string;
  bio: string;
  followers: number | null;
  tweets: number | null;
  live: boolean;
}

const CACHE_KEY = 'firas_mods_cache_v1';
const CACHE_TTL_MS = 30 * 60 * 1000;
const REFRESH_MS = 10 * 60 * 1000;

const compact = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '---';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
};

async function fetchJson(url: string, timeoutMs = 10000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Layer 1: our server proxy (no CORS issues) → Layer 2: direct FixTweet → Layer 3: static fallback
async function fetchMod(handle: string): Promise<ModProfile | null> {
  const target = `https://api.fxtwitter.com/${handle}`;
  let user: any = null;
  try {
    const via = await fetchJson('/api/kick?endpoint=' + encodeURIComponent(target));
    user = via?.user || null;
  } catch { /* fall through */ }
  if (!user) {
    try {
      const direct = await fetchJson(target);
      user = direct?.user || null;
    } catch { /* fall through */ }
  }
  if (!user) return null;
  const avatarRaw: string = user.avatar_url || '';
  const bannerRaw: string = user.banner_url || '';
  return {
    name: user.name || handle,
    handle: user.screen_name || handle,
    avatar: avatarRaw ? avatarRaw.replace('_normal.', '_400x400.') : '',
    banner: bannerRaw ? `${bannerRaw}/1500x500` : '',
    bio: user.description || '',
    followers: typeof user.followers === 'number' ? user.followers : null,
    tweets: typeof user.tweets === 'number' ? user.tweets : null,
    live: true,
  };
}

function readCache(): { at: number; data: Record<string, ModProfile> } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

const XIconSmall: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
);

const KickIconSmall: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 3h4v7h2l3-3h4l-4 4 4 4h-4l-3-3H8v3H4V3zm9 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" /></svg>
);

const CrownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.5 8.5 6.5 12l5.5-7 5.5 7 4-3.5L20 18H4L2.5 8.5z" /><rect x="4" y="18.6" width="16" height="2.2" rx="1.1" /></svg>
);

const ShieldIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M9.5 12l2 2 3.5-4" /></svg>
);

interface ModeratorsSectionProps {
  lang: Language;
}

const ModeratorsSection: React.FC<ModeratorsSectionProps> = ({ lang }) => {
  const [profiles, setProfiles] = useState<Record<string, ModProfile>>(() => readCache()?.data || {});
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(() => readCache()?.at || null);

  const t = {
    live: lang === 'ar' ? 'مباشر من إكس' : 'Live from X',
    boss: lang === 'ar' ? 'الرايس' : 'THE BOSS',
    mod: lang === 'ar' ? 'مشرف' : 'MOD',
    followers: lang === 'ar' ? 'متابع' : 'Followers',
    posts: lang === 'ar' ? 'منشور' : 'Posts',
    follow: lang === 'ar' ? 'تابع' : 'Follow',
    viewKick: 'Kick',
    updated: lang === 'ar' ? 'آخر تحديث' : 'Updated',
  };

  useEffect(() => {
    let cancelled = false;
    const load = async (useCacheFirst = true) => {
      const cached = readCache();
      const fresh = cached && Date.now() - cached.at < CACHE_TTL_MS;
      if (useCacheFirst && fresh) {
        setProfiles(cached.data);
        setUpdatedAt(cached.at);
        setLoading(false);
        return;
      }
      setLoading(true);
      const next: Record<string, ModProfile> = {};
      // Batches of 3 to stay gentle on the API
      for (let i = 0; i < ROSTER.length; i += 3) {
        const batch = await Promise.all(
          ROSTER.slice(i, i + 3).map(async (m) => {
            try {
              return await fetchMod(m.x);
            } catch {
              return null;
            }
          })
        );
        if (cancelled) return;
        batch.forEach((p, k) => {
          if (p) next[ROSTER[i + k].x.toLowerCase()] = p;
        });
        setProfiles((prev) => ({ ...prev, ...next }));
      }
      if (cancelled) return;
      const at = Date.now();
      setUpdatedAt(at);
      setLoading(false);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ at, data: { ...(readCache()?.data || {}), ...next } }));
      } catch { /* ignore */ }
    };
    load(true);
    const timer = setInterval(() => load(false), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const timeAgo = (at: number | null) => {
    if (!at) return '';
    const s = Math.floor((Date.now() - at) / 1000);
    if (s < 60) return lang === 'ar' ? 'الآن' : 'now';
    if (s < 3600) return lang === 'ar' ? `منذ ${Math.floor(s / 60)} د` : `${Math.floor(s / 60)}m ago`;
    return lang === 'ar' ? `منذ ${Math.floor(s / 3600)} س` : `${Math.floor(s / 3600)}h ago`;
  };

  const boss = ROSTER[0];
  const rest = ROSTER.slice(1);
  const get = (x: string): ModProfile => {
    const p = profiles[x.toLowerCase()];
    if (p) return p;
    const r = ROSTER.find((m) => m.x.toLowerCase() === x.toLowerCase())!;
    return { name: r.kick, handle: x, avatar: '', banner: '', bio: '', followers: null, tweets: null, live: false };
  };
  const bossP = get(boss.x);

  return (
    <div className="w-full animate-fade-in-up">
      {/* live status line */}
      <div className="flex items-center justify-center gap-2 mb-5">
        <span className="inline-flex items-center gap-2 text-[10px] font-black tracking-[0.2em] uppercase px-4 py-2 rounded-full bg-white/[0.04] border border-white/10 text-white/60">
          <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-yellow-400 animate-pulse' : 'bg-[#53FC18] animate-pulse shadow-[0_0_8px_#53FC18]'}`} />
          {t.live}
          {updatedAt && <span className="text-white/30 normal-case tracking-normal font-bold">• {t.updated} {timeAgo(updatedAt)}</span>}
        </span>
      </div>

      {/* ===== BOSS HERO — A7MEDO ===== */}
      <div className="relative rounded-[28px] p-[1.5px] bg-gradient-to-b from-[#FFE9B8] via-[#C9A24B]/50 to-transparent shadow-[0_30px_90px_rgba(201,162,75,0.25)] mb-4 md:mb-6 overflow-hidden">
        <div className="relative rounded-[26.5px] bg-[#080808] overflow-hidden">
          {/* banner */}
          <div className="relative h-36 sm:h-48 md:h-56 overflow-hidden">
            {bossP.banner ? (
              <img src={bossP.banner} alt="" loading="lazy" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-l from-[#C9A24B]/30 via-white/[0.04] to-[#8B5CF6]/20" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/40 to-transparent" />
            {/* crown + boss tag */}
            <div className="absolute top-3 start-3 sm:top-4 sm:start-4 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-black tracking-[0.18em] px-3 py-1.5 rounded-full bg-gradient-to-b from-[#FFE9B8] via-[#C9A24B] to-[#8A6A3A] text-black shadow-[0_0_24px_rgba(201,162,75,0.7)]">
                <CrownIcon className="w-3.5 h-3.5" />
                {t.boss}
              </span>
            </div>
            <a href={`https://x.com/${boss.x}`} target="_blank" rel="noopener noreferrer" className="absolute top-3 end-3 sm:top-4 sm:end-4 w-9 h-9 rounded-xl bg-black/60 backdrop-blur border border-white/15 text-white/80 hover:text-black hover:bg-[#FFE9B8] flex items-center justify-center transition-all active:scale-95" aria-label="X profile">
              <XIconSmall className="w-4 h-4" />
            </a>
          </div>
          {/* identity */}
          <div className="relative px-5 sm:px-7 pb-5 sm:pb-6">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-10 sm:-mt-12">
              <span className="relative rounded-full p-[3px] w-20 h-20 sm:w-24 sm:h-24 shrink-0" style={{ background: 'conic-gradient(from 200deg,#ffe977,#8a6a00,#fff6c8,#8a6a00,#ffe977)', boxShadow: '0 0 44px rgba(255,215,106,0.55)' }}>
                {bossP.avatar
                  ? <img src={bossP.avatar} alt={bossP.name} loading="lazy" className="w-full h-full rounded-full object-cover bg-black" />
                  : <span className="w-full h-full rounded-full bg-white/[0.06] flex items-center justify-center font-black text-2xl text-white/80">{boss.kick.charAt(0)}</span>}
                <CrownIcon className="absolute -top-5 left-1/2 -translate-x-1/2 w-7 h-7 text-[#FFD76A] drop-shadow-[0_0_10px_rgba(255,215,106,0.9)] animate-float-soft" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-white leading-none" dir="ltr">{bossP.name}</h3>
                  <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-[#53FC18]/10 border border-[#53FC18]/40 text-[#53FC18]" dir="ltr">@{bossP.handle}</span>
                </div>
                <p className="text-[11px] font-black text-white/40 mt-1.5" dir="ltr">KICK: {boss.kick}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex flex-col items-center px-4 py-2 rounded-2xl bg-[#FFE9B8]/10 border border-[#FFE9B8]/30">
                  <span className="text-base sm:text-lg font-black text-[#FFE9B8]" dir="ltr">{compact(bossP.followers)}</span>
                  <span className="text-[9px] font-black tracking-[0.2em] text-white/40 uppercase">{t.followers}</span>
                </span>
                <span className="inline-flex flex-col items-center px-4 py-2 rounded-2xl bg-white/[0.04] border border-white/10">
                  <span className="text-base sm:text-lg font-black text-white/85" dir="ltr">{compact(bossP.tweets)}</span>
                  <span className="text-[9px] font-black tracking-[0.2em] text-white/40 uppercase">{t.posts}</span>
                </span>
              </div>
            </div>
            {bossP.bio && <p className="text-[13px] text-white/60 font-medium leading-relaxed mt-3 max-w-3xl" dir="auto">{bossP.bio}</p>}
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <a href={`https://x.com/${boss.x}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[12px] font-black px-5 py-2.5 rounded-xl bg-white text-black hover:bg-[#FFE9B8] transition-colors active:scale-95">
                <XIconSmall className="w-3.5 h-3.5" />
                {t.follow} @{bossP.handle}
              </a>
              <a href={`https://kick.com/${boss.kick}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[12px] font-black px-5 py-2.5 rounded-xl bg-white/[0.06] border border-white/15 text-white/80 hover:border-[#53FC18]/60 hover:text-[#53FC18] transition-colors active:scale-95">
                <KickIconSmall className="w-4 h-4" />
                {t.viewKick}
              </a>
            </div>
          </div>
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-[#FFE9B8]/70 to-transparent" aria-hidden="true" />
        </div>
      </div>

      {/* ===== MODS GRID ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {rest.map((m, i) => {
          const p = get(m.x);
          return (
            <div key={m.x} className="group relative rounded-[22px] border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden hover:border-[#C9A24B]/50 hover:-translate-y-1 hover:shadow-[0_24px_60px_-16px_rgba(201,162,75,0.35)] transition-all duration-300 animate-fade-in-up" style={{ animationDelay: `${Math.min(i * 60, 480)}ms` }}>
              {/* banner */}
              <div className="relative h-20 sm:h-24 overflow-hidden bg-gradient-to-l from-[#C9A24B]/20 via-white/[0.03] to-[#8B5CF6]/15">
                {p.banner && <img src={p.banner} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0b] via-transparent to-transparent" />
                <span className="absolute top-2.5 start-2.5 inline-flex items-center gap-1 text-[8px] font-black tracking-[0.16em] px-2 py-1 rounded-lg bg-black/60 backdrop-blur border border-white/15 text-white/75">
                  <ShieldIcon className="w-3 h-3 text-[#C9A24B]" />
                  {t.mod}
                </span>
                <a href={`https://x.com/${m.x}`} target="_blank" rel="noopener noreferrer" className="absolute top-2.5 end-2.5 w-8 h-8 rounded-lg bg-black/60 backdrop-blur border border-white/15 text-white/70 hover:text-black hover:bg-white flex items-center justify-center transition-all active:scale-95" aria-label="X profile">
                  <XIconSmall className="w-3.5 h-3.5" />
                </a>
              </div>
              {/* body */}
              <div className="relative px-4 pb-4">
                <div className="flex items-end gap-3 -mt-7">
                  <span className="relative rounded-full p-[2px] w-14 h-14 shrink-0 bg-gradient-to-b from-[#FFE9B8] via-[#C9A24B] to-[#8A6A3A] shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
                    {p.avatar
                      ? <img src={p.avatar} alt={p.name} loading="lazy" className="w-full h-full rounded-full object-cover bg-black" />
                      : <span className="w-full h-full rounded-full bg-white/[0.07] flex items-center justify-center font-black text-lg text-white/80">{m.kick.charAt(0).toUpperCase()}</span>}
                    {p.live && <span className="absolute bottom-0 end-0 w-3.5 h-3.5 rounded-full bg-[#53FC18] border-2 border-[#0b0b0b] shadow-[0_0_10px_#53FC18]" aria-hidden="true" />}
                  </span>
                  <div className="min-w-0 flex-1 pt-7">
                    <p className="font-black text-white text-[15px] truncate leading-tight" dir="ltr">{p.name}</p>
                    <p className="text-[11px] font-bold text-white/40 truncate" dir="ltr">@{p.handle}</p>
                  </div>
                </div>
                <p className="text-[10px] font-bold text-[#C9A24B]/80 mt-1" dir="ltr">KICK: {m.kick}</p>
                {p.bio
                  ? <p className="text-[12px] text-white/55 font-medium leading-relaxed mt-2 line-clamp-2 min-h-[32px]" dir="auto">{p.bio}</p>
                  : <p className="text-[12px] text-white/25 font-medium mt-2 min-h-[32px]" dir="auto">---</p>}
                <div className="flex items-center gap-2 mt-3">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 rounded-xl bg-[#FFE9B8]/10 border border-[#FFE9B8]/25 text-[#FFE9B8]" dir="ltr">
                    {compact(p.followers)} <span className="text-[9px] text-white/40 font-bold">{t.followers}</span>
                  </span>
                  <a href={`https://x.com/${m.x}`} target="_blank" rel="noopener noreferrer" className="ms-auto inline-flex items-center gap-1.5 text-[11px] font-black px-3.5 py-1.5 rounded-xl bg-white/[0.06] border border-white/12 text-white/70 hover:bg-white hover:text-black transition-all active:scale-95">
                    <XIconSmall className="w-3 h-3" />
                    {t.follow}
                  </a>
                  <a href={`https://kick.com/${m.kick}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/[0.06] border border-white/12 text-white/70 hover:border-[#53FC18]/60 hover:text-[#53FC18] transition-all active:scale-95" aria-label="Kick profile">
                    <KickIconSmall className="w-4 h-4" />
                  </a>
                </div>
              </div>
              <span className="absolute bottom-0 start-0 h-[2px] w-0 group-hover:w-full bg-gradient-to-r from-[#FFE9B8] to-[#C9A24B] transition-all duration-500" aria-hidden="true" />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ModeratorsSection;
