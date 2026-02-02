-- FIX 1: Add service role access policy to profiles table
-- (profiles already has proper user-scoped RLS, but service_role access is needed for edge functions)
CREATE POLICY "Service role full access on profiles"
ON public.profiles
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- FIX 2: Create user roles system for admin access control
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (bypasses RLS, no recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles table
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on user_roles"
ON public.user_roles FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- FIX 3: Remove anonymous write policies from meditation storage
DROP POLICY IF EXISTS "Allow anonymous upload to meditations bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous update in meditations bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous delete in meditations bucket" ON storage.objects;

-- Only service role can write to meditations bucket
CREATE POLICY "Service role can write to meditations bucket"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'meditations' AND auth.role() = 'service_role');

CREATE POLICY "Service role can update meditations bucket"
ON storage.objects FOR UPDATE
USING (bucket_id = 'meditations' AND auth.role() = 'service_role');

CREATE POLICY "Service role can delete from meditations bucket"
ON storage.objects FOR DELETE
USING (bucket_id = 'meditations' AND auth.role() = 'service_role');

-- Admins can also write to meditations bucket
CREATE POLICY "Admins can upload to meditations bucket"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'meditations' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update meditations bucket"
ON storage.objects FOR UPDATE
USING (bucket_id = 'meditations' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete from meditations bucket"
ON storage.objects FOR DELETE
USING (bucket_id = 'meditations' AND public.has_role(auth.uid(), 'admin'));

-- FIX 4: Remove anonymous write policies from meditation_audios table
DROP POLICY IF EXISTS "Allow anonymous insert on meditation_audios" ON public.meditation_audios;
DROP POLICY IF EXISTS "Allow anonymous update on meditation_audios" ON public.meditation_audios;
DROP POLICY IF EXISTS "Allow anonymous delete on meditation_audios" ON public.meditation_audios;

-- Only service role or admins can modify meditation_audios
CREATE POLICY "Admins can insert meditation_audios"
ON public.meditation_audios FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update meditation_audios"
ON public.meditation_audios FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete meditation_audios"
ON public.meditation_audios FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));