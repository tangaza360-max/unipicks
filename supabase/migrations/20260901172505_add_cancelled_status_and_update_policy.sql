-- Allow 'cancelled' status and add update policy for group_orders

-- Drop existing status check constraint and add a new one that includes 'cancelled'
ALTER TABLE public.group_orders DROP CONSTRAINT IF EXISTS group_orders_status_check;
ALTER TABLE public.group_orders ADD CONSTRAINT group_orders_status_check CHECK (status IN ('open', 'closed', 'cancelled'));

-- Allow the creator to update their own group orders (e.g., to cancel or close)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'group_orders' 
    AND policyname = 'Students can update their own group orders'
  ) THEN
    EXECUTE format('
      CREATE POLICY "Students can update their own group orders" 
      ON public.group_orders
      FOR UPDATE
      USING (auth.uid() = created_by)
    ');
  END IF;
END $$;