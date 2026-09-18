CREATE TABLE IF NOT EXISTS public.merchant_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  caption text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '24 hours'),
  type text DEFAULT 'image'
);

ALTER TABLE public.merchant_stories ENABLE ROW LEVEL SECURITY;
