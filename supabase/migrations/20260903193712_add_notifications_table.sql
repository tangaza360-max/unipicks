-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  student_name text,
  student_email text,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'redemption' CHECK (type IN ('redemption', 'new_deal', 'expiry', 'system')),
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Merchants can view their own notifications
CREATE POLICY "Merchants can view their own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (merchant_id = auth.uid());

-- Policy: System can insert notifications (trigger or service role)
CREATE POLICY "System can insert notifications"
ON public.notifications
FOR INSERT
TO service_role
WITH CHECK (true);

-- Allow authenticated users (merchants) to mark notifications as read
CREATE POLICY "Merchants can update their own notifications"
ON public.notifications
FOR UPDATE
TO authenticated
USING (merchant_id = auth.uid())
WITH CHECK (merchant_id = auth.uid());

-- Index for faster queries
CREATE INDEX idx_notifications_merchant_id ON public.notifications(merchant_id);
CREATE INDEX idx_notifications_read ON public.notifications(read);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at);