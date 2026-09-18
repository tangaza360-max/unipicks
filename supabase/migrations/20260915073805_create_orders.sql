create table public.orders (
  id uuid primary key default gen_random_uuid(),

  student_id uuid not null references auth.users(id),
  merchant_id uuid not null references auth.users(id),
  deal_id uuid not null references public.deals(id),

  quantity integer not null default 1
    check (quantity > 0),

  unit_price numeric(10,2) not null
    check (unit_price >= 0),

  total_price numeric(10,2) not null
    check (total_price >= 0),

  status text not null default 'pending_confirmation'
    check (
      status in (
        'pending_confirmation',
        'confirmed',
        'payment_processing',
        'paid',
        'redeemed',
        'completed',
        'cancelled',
        'payment_expired',
        'declined',
        'refunded'
      )
    ),

  confirmation_deadline timestamptz not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders enable row level security;

create index orders_student_id_idx
  on public.orders(student_id);

create index orders_merchant_id_idx
  on public.orders(merchant_id);

create index orders_deal_id_idx
  on public.orders(deal_id);

create index orders_status_idx
  on public.orders(status);

create index orders_confirmation_deadline_idx
  on public.orders(confirmation_deadline);

create policy "Students can view their own orders"
on public.orders
for select
to authenticated
using (student_id = auth.uid());

create policy "Merchants can view orders for their deals"
on public.orders
for select
to authenticated
using (merchant_id = auth.uid());

grant select on public.orders to authenticated;
