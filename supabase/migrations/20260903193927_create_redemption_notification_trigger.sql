-- Function to create a notification when a redemption is inserted
CREATE OR REPLACE FUNCTION public.handle_redemption_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deal_merchant_id uuid;
  deal_title text;
BEGIN
  -- Get the merchant_id and title from the deals table
  SELECT merchant_id, title INTO deal_merchant_id, deal_title
  FROM public.deals
  WHERE id = NEW.deal_id;

  -- Only create notification if the deal has a merchant
  IF deal_merchant_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      merchant_id,
      deal_id,
      student_name,
      student_email,
      message,
      type
    ) VALUES (
      deal_merchant_id,
      NEW.deal_id,
      NEW.student_name,
      (SELECT email FROM auth.users WHERE id = NEW.student_id),
      format('Student %s redeemed "%s"', NEW.student_name, deal_title),
      'redemption'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on redemptions table
DROP TRIGGER IF EXISTS redemption_notification_trigger ON public.redemptions;

CREATE TRIGGER redemption_notification_trigger
AFTER INSERT ON public.redemptions
FOR EACH ROW
EXECUTE FUNCTION public.handle_redemption_notification();