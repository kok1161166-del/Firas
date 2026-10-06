-- ============================================================
--  FIRAS Gallery Wall — Migration v2 (شغّلها بعد v1)
--  Supabase Dashboard → SQL Editor → New Query → Run
--  إضافات لوحة الإدارة الكاملة: روابط/أقفال مراجعة/ملاحظات/سجل تدقيق
-- ============================================================

-- ---------- 1) أعمدة جديدة على gallery_items ----------
alter table public.gallery_items
  add column if not exists kind text not null default 'upload' check (kind in ('upload','link'));
alter table public.gallery_items
  add column if not exists url text;
alter table public.gallery_items
  add column if not exists reject_reason text not null default '';
alter table public.gallery_items
  add column if not exists internal_note text not null default '';
alter table public.gallery_items
  add column if not exists reviewing_by text;
alter table public.gallery_items
  add column if not exists reviewing_at timestamptz;
alter table public.gallery_items
  add column if not exists reviewed_at timestamptz;
alter table public.gallery_items
  add column if not exists reviewer text not null default '';

create index if not exists gallery_items_kind_idx on public.gallery_items (kind);
create index if not exists gallery_items_review_idx on public.gallery_items (reviewing_by, reviewing_at);

-- ---------- 2) سجل التدقيق (كل إجراء إشرافي) ----------
create table if not exists public.gallery_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('approve','reject','unpublish','undo','update','note','clear_reports','remove')),
  item_id uuid references public.gallery_items(id) on delete set null,
  item_name text not null default '',
  reason text not null default '',
  note text not null default '',
  admin text not null default 'admin',
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists gallery_audit_created_idx on public.gallery_audit (created_at desc);
create index if not exists gallery_audit_item_idx on public.gallery_audit (item_id, created_at desc);

alter table public.gallery_audit enable row level security;
-- لا سياسات عامة: الكتابة والقراءة عبر API الخلفي (service_role) فقط.

-- ---------- 3) جهاز المُبلِّغ (اختياري لكشف التكرار) ----------
alter table public.gallery_reports add column if not exists device_id text;

-- ---------- تم ----------
-- لا حاجة لتغيير سياسات v1: القراءة العامة تبقى للمعتمد فقط،
-- وكل الكتابة الجديدة تتم عبر /api/gallery/admin بمفتاح service_role.
