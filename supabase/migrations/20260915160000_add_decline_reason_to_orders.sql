alter table public.orders
  add column decline_reason text;

alter table public.orders
  add column decline_reason_note text;

alter table public.orders
  add constraint orders_decline_reason_check
  check (
    decline_reason is null
    or decline_reason in (
      'unavailable',
      'too_busy',
      'closed',
      'price_changed',
      'other'
    )
  );

alter table public.orders
  add constraint orders_decline_reason_note_check
  check (
    decline_reason_note is null
    or char_length(trim(decline_reason_note)) between 1 and 300
  );

create index orders_decline_reason_idx
  on public.orders(decline_reason);
