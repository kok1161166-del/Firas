import React from 'react';
import type { Language } from '../types';
import { Reveal, SectionHeading } from '../App';

interface RunnerShowcaseProps {
    lang: Language;
    no: string;
    onPlay: () => void;
}

export const RunnerShowcase: React.FC<RunnerShowcaseProps> = ({ lang, no, onPlay }) => {
    const isAr = lang === 'ar';
    const t = {
        title: isAr ? 'فيراس رنر' : 'FIRAS RUNNER',
        play: isAr ? 'العب الآن' : 'Play now',
        free: isAr ? 'بدون تسجيل — العب فوراً' : 'No sign-up — jump straight in',
        move: isAr ? 'الأسهم / السحب للحركة' : 'Arrows / swipe to move',
        jump: isAr ? 'مسافة / سحب لفوق للقفز' : 'Space / swipe up to jump',
    };

    return (
        <section id="runner" className="pt-12 md:pt-16 scroll-mt-28">
            <Reveal>
                <SectionHeading no={no} title={t.title} en="MINI GAME" />
            </Reveal>
            <Reveal delay={100}>
                <div className="citadel-frame relative overflow-hidden rounded-[28px] md:rounded-[36px]">
                    {/* neon aura fitting the game world */}
                    <div className="absolute -top-28 left-1/4 w-96 h-96 rounded-full bg-cyan-500/[0.12] blur-[110px] pointer-events-none" aria-hidden="true" />
                    <div className="absolute -bottom-28 right-0 w-80 h-80 rounded-full bg-[#C9A24B]/[0.12] blur-[110px] pointer-events-none" aria-hidden="true" />
                    <div className="absolute inset-0 grid-lines opacity-70 pointer-events-none" aria-hidden="true" />

                    <div className="relative grid lg:grid-cols-2 gap-6 md:gap-8 p-5 sm:p-7 md:p-10 items-center">
                        {/* Preview — click to play */}
                        <button
                            type="button"
                            onClick={onPlay}
                            className="group relative block w-full aspect-video rounded-2xl md:rounded-3xl overflow-hidden border border-[#C9A24B]/30 bg-black text-start shadow-[0_24px_70px_-20px_rgba(0,0,0,0.8)] active:scale-[0.99] transition-transform"
                            aria-label={t.play}
                        >
                            <img
                                src="/runner-banner.png"
                                alt="Firas Runner gameplay"
                                loading="lazy"
                                className="w-full h-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-105"
                                onError={(e) => { const t = e.target as HTMLImageElement; if (!t.src.includes('runner-preview')) t.src = '/runner-preview.png'; }}
                            />
                            <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" aria-hidden="true" />
                            <span className="tech-corner tech-corner-tl" aria-hidden="true" />
                            <span className="tech-corner tech-corner-tr" aria-hidden="true" />
                            <span className="tech-corner tech-corner-bl" aria-hidden="true" />
                            <span className="tech-corner tech-corner-br" aria-hidden="true" />
                            {/* play orb */}
                            <span className="absolute inset-0 m-auto w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#C9A24B]/25 backdrop-blur-md border border-[#F0DDAE]/70 flex items-center justify-center shadow-[0_0_44px_rgba(201,162,75,0.55)] transition-transform duration-300 group-hover:scale-110" aria-hidden="true">
                                <svg className="w-7 h-7 md:w-8 md:h-8 text-white fill-current translate-x-[2px] rtl:-translate-x-[2px]" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                            </span>
                            <span className="absolute top-3 start-3 inline-flex items-center gap-1.5 text-[10px] font-black px-3 py-1.5 rounded-full bg-black/70 border border-white/15 text-white/85 backdrop-blur" dir="ltr">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#53FC18] animate-pulse" /> 3D • NEON
                            </span>
                            <span className="absolute bottom-3 start-3 end-3 flex items-center justify-between gap-2">
                                <span className="text-[11px] md:text-xs font-black text-white/90">{t.free}</span>
                                <span className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#F0DDAE] via-[#C9A24B] to-[#8A6A3A] text-black text-[11px] md:text-xs font-black px-4 py-2 shadow-[0_10px_26px_-10px_rgba(201,162,75,0.7)]">
                                    {t.play}
                                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                </span>
                            </span>
                        </button>

                        {/* Info */}
                        <div className="min-w-0">
                            <span className="eyebrow-chip" dir="ltr">MINI GAME • FIRAS ARCADE</span>
                            <h3 className="font-heading font-black text-white leading-tight text-3xl sm:text-4xl md:text-5xl mt-4" dir={isAr ? 'rtl' : 'ltr'}>
                                {isAr ? (
                                    <>فيراس <span className="gold-text">رنر</span></>
                                ) : (
                                    <span dir="ltr" className="hero-firas">FIRAS RUNNER</span>
                                )}
                            </h3>
                            <div className="mt-5 h-px w-full bg-gradient-to-l from-[#C9A24B]/60 via-white/10 to-transparent" aria-hidden="true" />

                            <div className="grid sm:grid-cols-2 gap-2.5 mt-6">
                                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur px-4 py-3">
                                    <span className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-white/15 bg-black/50 px-2.5 py-1.5 text-[11px] font-black text-white/85 shadow-[0_2px_0_rgba(255,255,255,0.06)]" dir="ltr">← →</span>
                                    <span className="text-[12px] font-bold text-white/55 leading-snug">{t.move}</span>
                                </div>
                                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur px-4 py-3">
                                    <span className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-white/15 bg-black/50 px-2.5 py-1.5 text-[11px] font-black text-white/85 shadow-[0_2px_0_rgba(255,255,255,0.06)]" dir="ltr">SPACE</span>
                                    <span className="text-[12px] font-bold text-white/55 leading-snug">{t.jump}</span>
                                </div>
                            </div>

                            <div className="mt-7 flex flex-wrap items-center gap-4">
                                <button
                                    type="button"
                                    onClick={onPlay}
                                    className="btn-arena btn-gold inline-flex items-center justify-center gap-2.5 px-10 py-4 rounded-2xl font-black text-[15px] md:text-base active:scale-[0.98]"
                                >
                                    <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                    {t.play}
                                </button>
                                <span className="inline-flex items-center gap-2 text-[12px] font-bold text-white/45">
                                    <span className="w-1.5 h-1.5 rotate-45 bg-[#C9A24B]" aria-hidden="true" />
                                    {t.free}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </Reveal>
        </section>
    );
};
