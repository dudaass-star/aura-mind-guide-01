
-- Function to decrement current_users when a profile is deleted
CREATE OR REPLACE FUNCTION public.decrement_instance_on_profile_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.whatsapp_instance_id IS NOT NULL THEN
    UPDATE public.whatsapp_instances
    SET current_users = GREATEST(0, current_users - 1)
    WHERE id = OLD.whatsapp_instance_id;
  END IF;
  RETURN OLD;
END;
$$;

-- Trigger that fires after a profile is deleted
CREATE TRIGGER on_profile_delete
  AFTER DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_instance_on_profile_delete();
