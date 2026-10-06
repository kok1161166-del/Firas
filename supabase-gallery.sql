-- ============================================================
--  FIRAS Gallery Wall — Supabase Schema (آمن + جاهز للنسخ)
--  الصق هذا كاملاً في: Supabase Dashboard → SQL Editor → New Query → Run
--
--  الفكرة:
--  • الصور/الفيديو تُرفع على ImageKit (3 حسابات failover) عبر /api/gallery/upload
--  • Supabase يخزّن فقط البيانات (روابط + أبعاد + حالة الاعتماد + عدّادات)
--  • المفاتيح السرّية تبقى في متغيرات بيئة السيرفر فقط (Vercel) ولا تظهر للمتصفح
-- ============================================================

-- ---------- 1) الجدول الرئيسي ----------
create table if not exists public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  caption text not null default '' check (char_length(caption) <= 300),
  media_type text not null check (media_type in ('image','video')),
  media_url text not null,
  poster_url text,
  width int check (width is null or (width between 1 and 8000)),
  height int check (height is null or (height between 1 and 8000)),
  file_id text,
  ik_account int not null default 1 check (ik_account in (1,2,3)),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  likes int not null default 0 check (likes >= 0),
  shares int not null default 0 check (shares >= 0),
  reports_count int not null default 0 check (reports_count >= 0),
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists gallery_items_status_created_idx
  on public.gallery_items (status, created_at desc);
create index if not exists gallery_items_likes_idx
  on public.gallery_items (likes desc) where status = 'approved';

-- ---------- 2) البلاغات ----------
create table if not exists public.gallery_reports (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.gallery_items(id) on delete cascade,
  reason text not null check (reason in ('spam','abuse','copyright','nsfw','other')),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists gallery_reports_item_idx
  on public.gallery_reports (item_id, created_at desc);
create index if not exists gallery_reports_status_idx
  on public.gallery_reports (status, created_at desc);

-- ---------- 3) اللايكات (منع التكرار) ----------
create table if not exists public.gallery_likes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.gallery_items(id) on delete cascade,
  voter_hash text not null,
  created_at timestamptz not null default now(),
  unique (item_id, voter_hash)
);

create index if not exists gallery_likes_item_idx
  on public.gallery_likes (item_id);

-- ---------- 4) تفعيل RLS ----------
alter table public.gallery_items enable row level security;
alter table public.gallery_reports enable row level security;
alter table public.gallery_likes enable row level security;

-- ---------- 5) السياسات (الأمان) ----------
-- القراءة العامة: فقط المعتمد — يُستخدم للجدار العام
drop policy if exists "public read approved" on public.gallery_items;
create policy "public read approved"
  on public.gallery_items for select
  to anon, authenticated
  using (status = 'approved');

-- لا يُسمح للمتصفح بالإدخال/التعديل المباشر إطلاقاً:
-- كل الكتابة تتم عبر API الخلفي بمفتاح service_role فقط.
-- (لا توجد سياسات INSERT/UPDATE/DELETE لغير service_role)

-- البلاغات واللايكات: تُكتب عبر API الخلفي فقط (service_role يتجاوز RLS)
-- لذلك لا ننشئ سياسات كتابة عامة هنا.

-- ---------- 6) عدّادات آمنة عبر دوال (اختياري — يستخدمها السيرفر) ----------
-- دالة زيادة اللايك
create or replace function public.gallery_inc_like(p_item uuid)
returns int language plpgsql security definer as $$
declare v int;
begin
  update public.gallery_items set likes = likes + 1 where id = p_item returning likes into v;
  return coalesce(v, -1);
end $$;

-- دالة زيادة المشاركة
create or replace function public.gallery_inc_share(p_item uuid)
returns int language plpgsql security definer as $$
declare v int;
begin
  update public.gallery_items set shares = shares + 1 where id = p_item returning shares into v;
  return coalesce(v, -1);
end $$;

-- ---------- 7) تنظيف تلقائي (اختياري) ----------
-- احذف المرفوضات الأقدم من 90 يوم (شغّلها يدوياً عند الحاجة):
-- delete from public.gallery_items where status = 'rejected' and created_at < now() - interval '90 days';

-- ---------- تم ----------
-- بعد التشغيل، أضف في Vercel → Settings → Environment Variables:
--   SUPABASE_URL
--   SUPABASE_SERVICE_ROLE_KEY   (السري — للسيرفر فقط)
--   SUPABASE_ANON_KEY           (العلني — للمتصفح، وهو نفس PUBLISHABLE_KEY)
--   IMAGEKIT_1_ID / IMAGEKIT_1_ENDPOINT / IMAGEKIT_1_PUBLIC_KEY / IMAGEKIT_1_PRIVATE_KEY
--   IMAGEKIT_2_ID / IMAGEKIT_2_ENDPOINT / IMAGEKIT_2_PUBLIC_KEY / IMAGEKIT_2_PRIVATE_KEY
--   IMAGEKIT_3_ID / IMAGEKIT_3_ENDPOINT / IMAGEKIT_3_PUBLIC_KEY / IMAGEKIT_3_PRIVATE_KEY
--   GALLERY_ADMIN_PASSWORD      (كلمة سر الإدارة — قوية وطويلة)
--   GALLERY_ADMIN_SECRET        (توقيع توكن الإدارة — نص عشوائي طويل)
