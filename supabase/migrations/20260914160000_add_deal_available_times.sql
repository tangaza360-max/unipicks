ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS available_from time,
  ADD COLUMN IF NOT EXISTS available_until time;

ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_available_times_check;

ALTER TABLE public.deals
  ADD CONSTRAINT deals_available_times_check
  CHECK (
    (available_from IS NULL AND available_until IS NULL)
    OR
    (available_from IS NOT NULL AND available_until IS NOT NULL)
  );
