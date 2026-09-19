ALTER FUNCTION public.has_role(uuid, public.app_role) SECURITY INVOKER;
GRANT SELECT ON public.user_roles TO authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;