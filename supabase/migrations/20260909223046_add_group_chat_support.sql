-- Add group chat support to chat_messages
ALTER TABLE public.chat_messages
  ADD COLUMN group_order_id uuid REFERENCES public.group_orders(id) ON DELETE CASCADE;

-- receiver_id is only needed for 1:1 messages; group messages have no single receiver
ALTER TABLE public.chat_messages
  ALTER COLUMN receiver_id DROP NOT NULL;

-- Ensure a message is either 1:1 (has receiver_id) or group (has group_order_id), not neither
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_target_check
  CHECK (
    (receiver_id IS NOT NULL AND group_order_id IS NULL) OR
    (receiver_id IS NULL AND group_order_id IS NOT NULL)
  );

CREATE INDEX idx_chat_messages_group_order_id ON public.chat_messages USING btree (group_order_id);

-- RLS: group order members can view messages for their group order
CREATE POLICY "Group members can view group chat messages" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (
    group_order_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.group_order_members
      WHERE group_order_members.group_order_id = chat_messages.group_order_id
        AND group_order_members.student_id = auth.uid()
    )
  );

-- RLS: group order members can send messages to their group order
CREATE POLICY "Group members can send group chat messages" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    group_order_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.group_order_members
      WHERE group_order_members.group_order_id = chat_messages.group_order_id
        AND group_order_members.student_id = auth.uid()
    )
  );
