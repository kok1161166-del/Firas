import React from 'react';
import type { Language } from '../types';
import { GallerySection } from './GallerySection';

// ============================================================
//  صفحة المعرض المستقلة (#/gallery) — شريط علوي + قسم المعرض كاملاً
// ============================================================

export const GalleryPage: React.FC<{ lang: Language; onClose: () => void }> = ({
  lang, onClose,
}) => {
  const ar = lang === 'ar';
  return (
    <div className="fixed inset-0 z-[80] bg-[#0B0906] overflow-y-auto" role="dialog" aria-modal="true" aria-label="Gallery page">
      {/* خلفية القلعة */}
      <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
        <div className="absolute inset-0 fortress_bg opacity-60" />
        <div className="absolute inset-0 fortress_overlay" />
      </div>

      {/* محتوى الصفحة (تحت الهيدر الرئيسي الثابت) */}
      <div className="relative z-10 w-full max-w-[1200px] mx-auto px-3 sm:px-4 md:px-8 pb-10 pt-[76px] md:pt-[86px]">
        <div className="flex items-center gap-2.5 mb-3">
          <button type="button" onClick={onClose}
            className="btn-arena h-10 px-4 rounded-full bg-black/55 backdrop-blur border border-[#C9A24B]/40 text-[#F0DDAE] text-[12px] font-black flex items-center gap-2 hover:bg-[#C9A24B]/10">
            <svg className="w-4 h-4 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {ar ? 'الرئيسية' : 'Home'}
          </button>
          <span className="text-[10px] font-black tracking-[0.3em] text-[#D9C08A]/70" dir="ltr">FIRAS • GALLERY PAGE</span>
        </div>
        <GallerySection lang={lang} />
        <footer className="mt-10 rounded-[24px] border border-white/10 bg-black/60 p-6 text-center">
          <p className="text-[11px] font-black tracking-[0.3em] text-white/50 uppercase">
            {ar ? 'بدعم من HSG' : 'POWERED BY HSG'}
          </p>
          <p className="text-[11px] text-white/35 mt-1">© 2026 Firas. All Rights Reserved.</p>
        </footer>
      </div>
    </div>
  );
};
