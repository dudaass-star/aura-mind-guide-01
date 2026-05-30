CREATE POLICY "Users can read own asaas_payments via customer_id"
ON public.asaas_payments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.asaas_customer_id IS NOT NULL
      AND p.asaas_customer_id = asaas_payments.asaas_customer_id
  )
);