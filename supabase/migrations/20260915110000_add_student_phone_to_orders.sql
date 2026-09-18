alter table public.orders
  add column student_phone text;

create index orders_student_phone_idx
  on public.orders(student_phone);
