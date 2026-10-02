/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * FIRAS CITADEL RUNNER — HUD
 *
 * A single endless run. No shop, no menus, no side buttons: hearts, sector
 * and score live on the left rail while the tier tracker (progress + word
 * letters) sits centred at the top. Every milestone hands over a harder
 * tier, so the only ending is death — and that screen turns the run into a
 * server-signed, shareable score image.
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Heart, Trophy, MapPin, RefreshCw, Shield,
  RotateCcw, Flame, Award, Gem, Share2, BadgeCheck, Loader2,
} from 'lucide-react';
import { useStore } from '../../store';
import { GameStatus, GEMINI_COLORS, getTargetWord } from '../../types';
import { audio } from '../System/Audio';
import { submitRun, type ScoreReceipt } from '../System/ScoreAuthority';
import { buildScoreCard, shareScoreCard } from '../System/ScoreCard';

/** Statuses the runner is allowed to be in — everything else snaps into a run. */
const LIVE_STATUSES = new Set<GameStatus>([
  GameStatus.PLAYING,
  GameStatus.ONLINE,
  GameStatus.PAUSED,
  GameStatus.LEVEL_COMPLETE,
  GameStatus.VICTORY,
  GameStatus.GAME_OVER,
]);

const nf = (n: number) => n.toLocaleString('en-US');

/* ------------------------------------------------------------------ */
/*  Backdrop — shared by the win / loss screens                        */
/* ------------------------------------------------------------------ */

const Embers: React.FC<{ count?: number; tint?: string }> = ({ count = 16, tint = '#F0DDAE' }) => (
  <div className="cit-embers" aria-hidden="true">
    {Array.from({ length: count }).map((_, i) => (
      <span
        key={i}
        className="cit-ember"
        style={{
          left: `${(i * 97) % 100}%`,
          background: tint,
          animationDuration: `${9 + (i % 7) * 1.6}s`,
          animationDelay: `${(i % 11) * 0.9}s`,
          width: i % 3 === 0 ? 3 : 4,
          height: i % 3 === 0 ? 3 : 4,
        }}
      />
    ))}
  </div>
);

/* ------------------------------------------------------------------ */
/*  Life unit                                                          */
/*                                                                     */
/*  Not a rotated chip — a bevelled gold plate with the heart engraved */
/*  into it in ink, the same metal language as the hub's buttons and   */
/*  medallions. Spent lives sink back into an empty socket so the row  */
/*  still reads as a gauge rather than a row of gaps.                  */
/* ------------------------------------------------------------------ */

const LifeUnit: React.FC<{ active: boolean; wasLost: boolean; index: number }> = ({ active, wasLost, index }) => (
  <div
    className="cit-heart"
    data-on={active ? '1' : '0'}
    data-break={wasLost ? '1' : '0'}
    style={{ animationDelay: `${index * 90}ms` }}
  >
    <span className="cit-heart__bevel" aria-hidden="true" />
    <span className="cit-heart__glyph">
      {active || wasLost
        ? <Heart className="w-[13px] h-[13px]" fill="currentColor" strokeWidth={0} />
        : <span className="cit-heart__socket" />}
    </span>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Result shell — the citadel frame, blooms, embers and tech corners  */
/* ------------------------------------------------------------------ */

const ResultShell: React.FC<{
  variant: 'win' | 'lose';
  children: React.ReactNode;
}> = ({ variant, children }) => (
  <div className="absolute inset-0 z-[100] flex items-center justify-center overflow-y-auto cit-scroll-hide p-4 md:p-6">
    {/* deep void + drifting gold/ember blooms */}
    <div
      className="absolute inset-0"
      style={{
        background: variant === 'win'
          ? 'radial-gradient(ellipse 70% 55% at 50% 38%, rgba(201,162,75,0.16), transparent 68%), linear-gradient(180deg, rgba(11,9,6,0.9), rgba(5,4,3,0.96))'
          : 'radial-gradient(ellipse 70% 55% at 50% 38%, rgba(196,106,47,0.16), transparent 68%), linear-gradient(180deg, rgba(11,9,6,0.92), rgba(5,4,3,0.97))',
      }}
    />
    <div className="cit-aurora" />
    <div
      className="cit-bloom"
      style={{ top: '-14%', left: '4%', width: '46vw', height: '46vw', background: variant === 'win' ? 'rgba(201,162,75,0.20)' : 'rgba(196,106,47,0.18)' }}
    />
    <div
      className="cit-bloom"
      style={{ bottom: '-20%', right: '2%', width: '40vw', height: '40vw', animationDelay: '3.5s', background: 'rgba(138,106,58,0.20)' }}
    />
    <Embers count={18} tint={variant === 'win' ? '#F0DDAE' : '#FFD9A8'} />

    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
      className={`cit-frame cit-frame--${variant} relative w-full max-w-lg my-auto`}
    >
      <span className="cit-frame__rule" />
      <span className="cit-corner cit-corner--tl" />
      <span className="cit-corner cit-corner--tr" />
      <span className="cit-corner cit-corner--bl" />
      <span className="cit-corner cit-corner--br" />
      {children}
    </motion.div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Result medallion — emblem disc inside a spinning conic halo        */
/* ------------------------------------------------------------------ */

const ResultMedallion: React.FC<{ variant: 'win' | 'lose'; children: React.ReactNode }> = ({ variant, children }) => (
  <div className="relative grid place-items-center">
    <span className="cit-halo" aria-hidden="true" />
    <span className="cit-halo cit-halo--rev" aria-hidden="true" />
    <motion.div
      initial={{ scale: 0.3, rotate: variant === 'win' ? -25 : 25 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 140, damping: 13, delay: 0.12 }}
      className={`cit-medal ${variant === 'lose' ? 'cit-medal--lose' : ''} relative z-10`}
    >
      {children}
    </motion.div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Stat tile                                                          */
/* ------------------------------------------------------------------ */

const Stat: React.FC<{ label: string; value: string; icon: React.ReactNode; tone?: string }> = ({
  label, value, icon, tone = '#F0DDAE',
}) => (
  <div className="cit-stat">
    <span className="mx-auto mb-1.5 grid place-items-center w-7 h-7 rounded-lg" style={{ background: 'rgba(201,162,75,0.14)', color: tone }}>
      {icon}
    </span>
    <p className="text-lg md:text-2xl font-black leading-none cit-gold-text" dir="ltr">{value}</p>
    <p className="cit-kicker mt-1.5 !text-[8px]">{label}</p>
  </div>
);

/* ------------------------------------------------------------------ */
/*  TIER BANNER — non-blocking celebration                              */
/* ------------------------------------------------------------------ */

/**
 * The endless runner never stops to congratulate you. A tier clearing is a
 * gold banner that slides in over the action and slides back out, while the
 * next (wider, faster, denser) tier is already running underneath.
 */
const TierBanner: React.FC = () => {
  const flash = useStore(s => s.milestoneFlash);
  const dismiss = useStore(s => s.dismissMilestone);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(dismiss, 2800);
    return () => window.clearTimeout(t);
  }, [flash, dismiss]);

  return (
    <AnimatePresence>
      {flash && (
        <motion.div
          key={flash.id}
          initial={{ opacity: 0, y: -26, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -18, scale: 0.98 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-24 md:top-32 left-1/2 -translate-x-1/2 z-[90] pointer-events-none"
        >
          <div className="cit-frame cit-frame--win relative flex items-center gap-4 rounded-3xl px-5 md:px-7 py-3.5 md:py-4">
            <span className="cit-frame__rule" />
            <span className="cit-corner cit-corner--tl" />
            <span className="cit-corner cit-corner--tr" />
            <span className="cit-corner cit-corner--bl" />
            <span className="cit-corner cit-corner--br" />

            <div className="relative grid place-items-center w-12 h-12 shrink-0">
              <span className="cit-halo" aria-hidden="true" />
              <span className="cit-medal !w-12 !h-12">
                <Trophy className="w-6 h-6" strokeWidth={2} />
              </span>
            </div>

            <div className="flex flex-col leading-tight text-start">
              <span className="cit-chip !py-1 !px-2.5 !text-[8px] self-start mb-1.5">
                <span className="w-1 h-1 rotate-45 bg-[#C9A24B] inline-block" />
                <span dir="ltr">TIER {String(flash.level).padStart(2, '0')} SECURED</span>
              </span>
              <span className="cit-gold-text--shine text-lg md:text-2xl font-black leading-none" dir="rtl">
                رحلتك ما توقفت
              </span>
              <span className="cit-kicker !text-[8px] mt-1.5" dir="ltr">
                +{nf(flash.score)} tier yield · {flash.letters} letters · wider · faster
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/* ------------------------------------------------------------------ */
/*  LOSS — the run ends, the score gets signed and shared               */
/* ------------------------------------------------------------------ */

const LoseScreen: React.FC = () => {
  const level = useStore(s => s.level);
  const score = useStore(s => s.score);
  const gemsCollected = useStore(s => s.gemsCollected);
  const totalLetters = useStore(s => s.totalLetters);
  const distance = useStore(s => s.distance);
  const tierStart = useStore(s => s.tierStart);
  const targetDistance = useStore(s => s.targetDistance);
  const runSeconds = useStore(s => s.runSeconds);
  const restartGame = useStore(s => s.restartGame);
  const startGame = useStore(s => s.startGame);
  const setBest = useStore(s => s.setBest);

  const [receipt, setReceipt] = useState<ScoreReceipt | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const tierPct = Math.min(100, Math.round(((distance - tierStart) / Math.max(1, targetDistance - tierStart)) * 100));

  // Hand the raw run to the server exactly once, and remember whatever it
  // decides is real. Nothing on this screen ever renders the raw claim.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await submitRun({
        score,
        distance,
        gems: gemsCollected,
        letters: totalLetters,
        tiers: level,
        seconds: runSeconds,
      });
      if (cancelled) return;
      if (!res) {
        // No authority reachable (offline, or running `vite dev` without the
        // serverless function). Say so instead of spinning forever.
        setOffline(true);
        return;
      }
      setReceipt(res);
      setBest(res.accepted.score, res.accepted.distance, res.receipt);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const onShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const accepted = receipt?.accepted ?? {
        score, distance, gems: gemsCollected, letters: totalLetters, tiers: level, seconds: runSeconds,
      };
      const blob = await buildScoreCard({
        score: accepted.score,
        distance: accepted.distance,
        gems: accepted.gems,
        letters: accepted.letters,
        tiers: accepted.tiers,
        receipt: receipt?.receipt ?? '',
        verified: !!receipt?.clean,
        best: Math.max(receipt?.best ?? 0, accepted.score),
      });
      const outcome = await shareScoreCard(blob, accepted.score);
      if (outcome === 'downloaded') flash('تم حفظ الصورة على جهازك');
      else if (outcome === 'shared') flash('تم المشاركة');
    } catch {
      flash('تعذّر إنشاء الصورة — حاول مرة ثانية');
    } finally {
      setBusy(false);
    }
  };

  const verified = !!receipt;
  const clean = !!receipt?.clean;
  const pending = !verified && !offline;

  return (
    <ResultShell variant="lose">
      <div className="relative flex flex-col items-center px-6 py-8 md:px-10 md:py-10 text-center">

        <ResultMedallion variant="lose">
          <Flame className="w-11 h-11" strokeWidth={1.7} />
        </ResultMedallion>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }} className="mt-6">
          <span className="cit-chip !border-[rgba(196,106,47,0.55)] !bg-[rgba(196,106,47,0.1)] !text-[#FFD9A8]">
            <span className="w-1.5 h-1.5 rotate-45 bg-[#C46A2F] inline-block" />
            <span dir="ltr">SIGNAL LOST</span>
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34 }}
          className="mt-4 text-3xl md:text-5xl font-black leading-[1.05]"
        >
          <span
            className="block"
            style={{
              background: 'linear-gradient(135deg,#FFE0BE 0%,#E8A05A 40%,#A2521F 100%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}
            dir="rtl"
          >
            انتهت المحاولة
          </span>
          <span className="mt-1 block text-white/85 text-base md:text-xl tracking-[0.22em] uppercase font-black" dir="ltr">
            Critical Failure
          </span>
        </motion.h1>

        <div className="mt-4 flex items-center gap-3 w-full max-w-[300px]">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#C46A2F]/70" />
          <span className="text-[10px] font-black tracking-[0.34em] text-[#E8A05A]/85 uppercase whitespace-nowrap" dir="ltr">
            Tier {String(level).padStart(2, '0')} · {tierPct}%
          </span>
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#C46A2F]/70" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42 }}
          className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-2.5 w-full"
        >
          <Stat label="Run Yield" value={nf(score)} icon={<Award className="w-4 h-4" />} tone="#FFD9A8" />
          <Stat label="Distance" value={`${Math.floor(distance)}`} icon={<MapPin className="w-4 h-4" />} tone="#E8A05A" />
          <Stat label="Gems" value={`${gemsCollected}`} icon={<Gem className="w-4 h-4" />} tone="#D9C08A" />
          <Stat label="Tiers" value={`${level}`} icon={<Shield className="w-4 h-4" />} tone="#C46A2F" />
        </motion.div>

        {/* ---- verification strip ---- */}
        <motion.div
          initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.48 }}
          className="mt-3 w-full rounded-2xl border px-3.5 py-3 flex items-center gap-3 text-start"
          style={{
            borderColor: clean ? 'rgba(83,252,24,0.35)' : verified ? 'rgba(226,116,43,0.4)' : 'rgba(201,162,75,0.25)',
            background: clean ? 'rgba(83,252,24,0.07)' : verified ? 'rgba(226,116,43,0.07)' : 'rgba(201,162,75,0.05)',
          }}
        >
          {pending ? (
            <Loader2 className="w-4 h-4 shrink-0 animate-spin text-[#C9A24B]" />
          ) : clean ? (
            <BadgeCheck className="w-4 h-4 shrink-0 text-[#53FC18]" />
          ) : (
            <Shield className="w-4 h-4 shrink-0 text-[#E2742B]" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black tracking-[0.2em] uppercase text-white/80" dir="ltr">
              {pending ? 'VERIFYING ON SERVER' : clean ? 'SERVER VERIFIED' : verified ? 'SCORE ADJUSTED' : 'UNVERIFIED RUN'}
            </p>
            <p className="text-[10px] text-white/45 mt-0.5 truncate" dir="ltr">
              {pending
                ? 'جارٍ التحقق من صحة الجولة'
                : verified
                  ? `RECEIPT ${receipt?.receipt ?? ''}`
                  : 'NO SERVER REACHABLE · THIS RUN IS NOT SIGNED'}
            </p>
          </div>
          {!clean && verified && (
            <span className="shrink-0 text-[9px] font-black text-[#E2742B]" dir="ltr">
              {(receipt?.flags ?? []).join(' / ').toUpperCase()}
            </span>
          )}
        </motion.div>

        {/* ---- share + retry ---- */}
        <motion.div
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.54 }}
          className="mt-5 w-full flex flex-col sm:flex-row gap-2.5"
        >
          <button
            type="button"
            onClick={onShare}
            disabled={busy}
            className="cit-btn cit-btn--gold group flex-1 py-4 md:py-[18px] text-base md:text-lg disabled:opacity-70"
          >
            {busy
              ? <Loader2 className="relative z-10 w-5 h-5 animate-spin" />
              : <Share2 className="relative z-10 w-5 h-5" />}
            <span className="relative z-10" dir="rtl">مشاركة السكور</span>
            <span className="cit-btn__sheen" />
          </button>
          <button
            type="button"
            onClick={() => { audio.init(); restartGame(); }}
            className="cit-btn cit-btn--ghost group sm:w-[42%] py-4 text-sm"
          >
            <RefreshCw className="relative z-10 w-4 h-5 transition-transform duration-700 group-hover:rotate-180" />
            <span className="relative z-10" dir="rtl">إعادة</span>
            <span className="cit-btn__sheen" />
          </button>
        </motion.div>

        {/* Secondary: wipe the run and start from tier 1 */}
        <button
          type="button"
          onClick={() => { audio.init(); startGame(1); }}
          className="cit-kicker mt-2 !text-[8px] opacity-45 hover:opacity-90 transition-opacity"
          dir="rtl"
        >
          ابدأ جولة جديدة من القطاع 01
        </button>

        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="cit-glass absolute bottom-5 rounded-full px-4 py-2 text-[11px] font-black text-[#F0DDAE]"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>

        <p className="cit-kicker mt-6 !text-[8px] opacity-35" dir="ltr">
          T×M×F×X · Level One Clan
        </p>
      </div>
    </ResultShell>
  );
};

/* ------------------------------------------------------------------ */
/*  HUD                                                                */
/* ------------------------------------------------------------------ */

export const HUD: React.FC = () => {
  const lives = useStore(s => s.lives);
  const maxLives = useStore(s => s.maxLives);
  const collectedLetters = useStore(s => s.collectedLetters);
  const status = useStore(s => s.status);
  const level = useStore(s => s.level);
  const score = useStore(s => s.score);
  const distance = useStore(s => s.distance);
  const tierStart = useStore(s => s.tierStart);
  const targetDistance = useStore(s => s.targetDistance);
  const speed = useStore(s => s.speed);
  const isImmortalityActive = useStore(s => s.isImmortalityActive);

  const target = getTargetWord(level);
  // Progress is measured inside the current tier, while `distance` itself is
  // the endless lifetime counter that never rewinds.
  const tierSpan = Math.max(1, targetDistance - tierStart);
  const progress = Math.min(100, Math.max(0, ((distance - tierStart) / tierSpan) * 100));

  // Life-loss flash
  const prevLivesRef = useRef(lives);
  const [lostLifeIndex, setLostLifeIndex] = useState<number | null>(null);
  useEffect(() => {
    if (lives < prevLivesRef.current) {
      setLostLifeIndex(lives);
      const t = window.setTimeout(() => setLostLifeIndex(null), 900);
      prevLivesRef.current = lives;
      return () => window.clearTimeout(t);
    }
    prevLivesRef.current = lives;
  }, [lives]);

  // The runner is one continuous endless game: any non-gameplay status drops
  // straight back into a run, so the shop / menus / info pages never appear.
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    const st = useStore.getState();
    bootstrapped.current = true;
    if (!LIVE_STATUSES.has(st.status)) {
      st.startGame(Math.max(1, st.unlockedLevels));
    }
  }, []);

  if (status === GameStatus.GAME_OVER) return <LoseScreen />;

  return (
    <div className="absolute inset-0 z-50 pointer-events-none select-none font-cyber">

      {/* top scrim keeps the HUD legible over the scene */}
      <div className="cit-scrim" />
      <div className="cit-void" />

      {/* tier cleared — celebration, not an interruption */}
      <TierBanner />

      <div className="absolute inset-x-0 top-0 p-3 md:p-6">

        {/* ——— LEFT RAIL : hearts · tier · score ———
            One rail on every breakpoint: a vertical stack on desktop, a single
            strip on phones. The lives row scrolls rather than overflowing if a
            long run ever earns extra hearts. */}
        <div className="cit-glass inline-flex flex-row md:flex-col md:items-stretch items-center gap-x-3.5 gap-y-2 md:gap-x-0 md:gap-y-2.5 rounded-2xl px-3 py-2.5 md:px-3.5 md:py-3 max-w-full">

          {/* lives */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="cit-kicker !text-[7px] shrink-0" dir="ltr">Lives</span>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -my-0.5 py-0.5">
              {Array.from({ length: Math.max(1, maxLives) }).map((_, i) => (
                <LifeUnit
                  key={i}
                  index={i}
                  active={i < lives}
                  wasLost={i === lostLifeIndex}
                />
              ))}
            </div>
          </div>

          {/* hairline separator — horizontal on phones, vertical on desktop */}
          <span className="hidden md:block w-full h-px bg-gradient-to-r from-transparent via-[#C9A24B]/30 to-transparent" />
          <span className="md:hidden w-px h-6 bg-gradient-to-b from-transparent via-[#C9A24B]/30 to-transparent" />

          {/* tier */}
          <div className="flex items-center gap-2 md:items-start md:gap-2.5 shrink-0">
            <MapPin className="w-3.5 h-3.5 text-[#C9A24B] shrink-0" strokeWidth={2.2} />
            <div className="flex flex-col leading-none">
              <span className="cit-kicker !text-[7px]">Tier</span>
              <span className="text-base md:text-lg font-black cit-gold-text leading-tight" dir="ltr">
                {String(level).padStart(2, '0')}
              </span>
            </div>
          </div>

          <span className="hidden md:block w-full h-px bg-gradient-to-r from-transparent via-[#C9A24B]/30 to-transparent" />
          <span className="md:hidden w-px h-6 bg-gradient-to-b from-transparent via-[#C9A24B]/30 to-transparent" />

          {/* score */}
          <div className="flex flex-col leading-none md:items-start shrink-0">
            <span className="cit-kicker !text-[7px] mb-0.5">Score</span>
            <span className="text-base md:text-lg font-black cit-gold-text--shine" dir="ltr">
              {nf(score)}
            </span>
          </div>
        </div>

        {/* ——— CENTRE : progress + word letters ——— */}
        <div className="mt-3 md:mt-0 md:absolute md:top-0 md:left-1/2 md:-translate-x-1/2 w-full md:w-[46%] md:max-w-[440px]">
          <div className="w-full flex flex-col items-center gap-3">
            <div className="w-full flex items-center gap-2.5">
              <span className="cit-kicker !text-[8px] shrink-0 w-9 text-start" dir="ltr">{Math.floor(progress)}%</span>
              <div className="cit-progress flex-1">
                <motion.i
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: 'linear', duration: 0.35 }}
                />
              </div>
              <span className="cit-kicker !text-[8px] shrink-0 text-end" dir="ltr">{nf(tierSpan)} LY</span>
            </div>

            <div className="flex items-center justify-center gap-1.5 md:gap-2">
              {target.map((char, idx) => {
                const on = collectedLetters.includes(idx);
                const tone = GEMINI_COLORS[idx % GEMINI_COLORS.length];
                return (
                  <motion.div
                    key={`${char}-${idx}`}
                    className="cit-letter"
                    data-on={on ? '1' : '0'}
                    style={on ? { background: `linear-gradient(170deg, #FFF6DE 0%, ${tone} 55%, #8A6A3A 100%)`, color: '#0B0906' } : undefined}
                    animate={on ? { scale: [1, 1.14, 1] } : { scale: 1 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {char}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ——— AMBIENT TELEMETRY (bottom-left, non-interactive) ——— */}
      <div className="absolute bottom-4 left-4 md:bottom-6 md:left-6 flex items-center gap-3 text-[9px] md:text-[10px] uppercase tracking-[0.24em] text-white/35 font-black">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#53FC18] animate-pulse shadow-[0_0_10px_rgba(83,252,24,0.9)]" />
          <span className="text-white/55">Live</span>
        </span>
        <span className="opacity-20">|</span>
        <span className="inline-flex items-center gap-1.5" dir="ltr">
          <MapPin className="w-3 h-3 text-[#C9A24B]/70" />
          {Math.floor(distance)} LY
        </span>
        <span className="opacity-20">|</span>
        <span className="inline-flex items-center gap-1.5" dir="ltr">
          <Flame className="w-3 h-3 text-[#C9A24B]/70" />
          {Math.round((speed / 28.5) * 100)}%
        </span>
        <span className="opacity-20">|</span>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap" dir="ltr">
          <Shield className="w-3 h-3 text-[#C9A24B]/70" />
          INTENSITY {Math.floor(distance)}
        </span>
      </div>

      {/* phase-shift pulse */}
      <AnimatePresence>
        {isImmortalityActive && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 md:top-40 md:-translate-y-0 z-20"
          >
            <span className="cit-glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-[10px] md:text-xs font-black tracking-[0.24em] uppercase text-[#F0DDAE]" dir="ltr">
              <Shield className="w-4 h-4 fill-[#C9A24B] text-[#C9A24B]" />
              Phase Shift
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};