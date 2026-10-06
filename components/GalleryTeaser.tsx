import React, { useEffect, useState } from 'react';
import type { Language } from '../types';
import { fetchWall } from '../services/galleryApi';

// ============================================================
//  بوابة المعرض — بطاقة عرض جميلة في الرئيسية تفتح صفحة المعرض
//  (المعرض نفسه أصبح صفحة مستقلة #/gallery)
// ============================================================

export const GalleryTeaser: React.FC<{ lang: Language; onOpen: () => void }> = ({ lang, onOpen }) => {
  const ar = lang === 'ar';
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let dead = false;
    fetchWall('newest', false)
      .then((w) => { if (!dead) setCount(w.length); })
      .catch(() => {});
    return () => { dead = true; };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-[#C9A24B]/25 group">
      {/* البانر */}
      <div className="absolute inset-0" aria-hidden="true"
        style={{ backgroundImage: "url('/bg-content.png')", backgroundSize: 'cover', backgroundPosition: 'center 30%' }} />
      <div className="absolute inset-0" aria-hidden="true"
        style={{ background: 'linear-gradient(to left, rgba(11,9,6,0.92) 20%, rgba(11,9,6,0.55) 60%, rgba(11,9,6,0.75))' }} />
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-[#C9A24B] to-transparent" aria-hidden="true" />
      <div className="absolute -bottom-20 -start-20 w-72 h-72 rounded-full bg-[#C9A24B]/10 blur-[90px] pointer-events-none" aria-hidden="true" />

      <div className="relative p-6 sm:p-10 flex flex-col md:flex-row items-center gap-6 md:gap-10">
        {/* اللوجو */}
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-full bg-[#C9A24B]/20 blur-2xl" aria-hidden="true" />
          <img src="/firas-mark.webp" alt="Firas logo"
            className="relative w-24 h-24 sm:w-32 sm:h-32 object-contain animate-float-soft transition-transform duration-500 group-hover:scale-105"
            style={{ filter: 'drop-shadow(0 8px 30px rgba(201,162,75,0.55))' }} loading="lazy" />
        </div>

        {/* النص */}
        <div className="flex-1 min-w-0 text-center md:text-start">
          <p className="text-[10px] font-black tracking-[0.35em] text-[#D9C08A]/80 uppercase" dir="ltr">FIRAS • GALLERY WALL</p>
          <h3 className="mt-1 text-2xl sm:text-4xl font-black text-white leading-tight">
            {ar ? 'معرض الصور والفيديو' : 'Photo & Video Wall'}
          </h3>
          <p className="mt-2 text-[13px] sm:text-sm text-white/60 font-medium max-w-lg">
            {ar
              ? 'جدار إبداعات المتابعين في صفحة خاصة — تصفح، ارفع صورتك، وادخل الإدارة من هناك'
              : 'Community edits on its own page — browse, upload, and manage from there'}
          </p>
          <div className="mt-3 flex items-center justify-center md:justify-start gap-2 flex-wrap">
            <span className="inline-flex items-center gap-2 text-[11px] font-black px-4 py-2 rounded-full bg-black/50 border border-[#C9A24B]/40 text-[#F0DDAE]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C9A24B] animate-pulse" />
              <span dir="ltr">{count === null ? '…' : count}</span> {ar ? 'منشور معتمد' : 'approved'}
            </span>
          </div>
        </div>

        {/* زر الدخول */}
        <div className="shrink-0 flex flex-col items-center gap-2.5">
          <button type="button" onClick={onOpen}
            className="btn-arena btn-gold min-h-[56px] px-8 rounded-2xl font-black text-[15px] flex items-center gap-2.5">
            {ar ? 'ادخل المعرض' : 'Enter gallery'}
            <svg className="w-5 h-5 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </button>
          <span className="text-[10px] font-bold tracking-[0.2em] text-white/30 uppercase" dir="ltr">GALLERY PAGE →</span>
        </div>
      </div>
    </div>
  );
};
