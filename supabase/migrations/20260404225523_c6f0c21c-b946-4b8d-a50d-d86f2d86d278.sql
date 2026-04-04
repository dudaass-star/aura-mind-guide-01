
-- Allow portal token holders to read the profile associated with their token
CREATE POLICY "Portal token holders can read profile"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_portal_tokens
    WHERE user_portal_tokens.user_id = profiles.user_id
  )
);

-- Allow portal token holders to read their time capsules
CREATE POLICY "Portal token holders can read time_capsules"
ON public.time_capsules FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_portal_tokens
    WHERE user_portal_tokens.user_id = time_capsules.user_id
  )
);
