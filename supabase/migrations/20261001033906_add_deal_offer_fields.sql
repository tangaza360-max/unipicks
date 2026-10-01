-- Add offer_type and related fields to deals table
-- Supports: percentage, fixed_amount, bogo, fixed_price, tiered, free_shipping, group_buy

-- 1. Create the offer_type enum (idempotent)
DO $$ BEGIN
  CREATE TYPE public.deal_offer_type AS ENUM (
    'percentage',
    'fixed_amount',
    'bogo',
    'fixed_price',
    'tiered',
    'free_shipping',
    'group_buy'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add new columns to deals table (safe to re-run)
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS offer_type public.deal_offer_type NOT NULL DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS discount_value numeric,
  ADD COLUMN IF NOT EXISTS final_price numeric,
  ADD COLUMN IF NOT EXISTS buy_quantity integer,
  ADD COLUMN IF NOT EXISTS get_quantity integer,
  ADD COLUMN IF NOT EXISTS min_participants integer,
  ADD COLUMN IF NOT EXISTS tiered_rules jsonb;

-- 3. Backfill existing rows so old percentage deals are consistent
UPDATE public.deals
SET discount_value = discount_percent
WHERE offer_type = 'percentage'
  AND discount_value IS NULL
  AND discount_percent IS NOT NULL;

-- 4. Index for fast filtering by offer type
CREATE INDEX IF NOT EXISTS idx_deals_offer_type ON public.deals(offer_type);

-- 5. Documentation comments
COMMENT ON COLUMN public.deals.offer_type IS 'Type: percentage, fixed_amount, bogo, fixed_price, tiered, free_shipping, group_buy';
COMMENT ON COLUMN public.deals.discount_value IS 'Percentage (0-100) or fixed RWF amount';
COMMENT ON COLUMN public.deals.final_price IS 'Computed price the student pays';
COMMENT ON COLUMN public.deals.buy_quantity IS 'BOGO: items to buy';
COMMENT ON COLUMN public.deals.get_quantity IS 'BOGO: items given free';
COMMENT ON COLUMN public.deals.min_participants IS 'Group buy: minimum students';
COMMENT ON COLUMN public.deals.tiered_rules IS 'Tiered: JSON array of {min_qty, price}';
