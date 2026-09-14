ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS available_days text[]
  NOT NULL
  DEFAULT ARRAY[
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday'
  ]::text[];

ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_available_days_check;

ALTER TABLE public.deals
  ADD CONSTRAINT deals_available_days_check
  CHECK (
    available_days <@ ARRAY[
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday'
    ]::text[]
    AND cardinality(available_days) > 0
  );
