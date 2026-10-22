-- Movimento único: toda adesão já libera o convite individual.
UPDATE public.movement_members SET ambassador_since = created_at WHERE ambassador_since IS NULL;

CREATE OR REPLACE FUNCTION public.movement_member_invite_ready()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.ambassador_since := COALESCE(NEW.ambassador_since, now());
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS movement_member_invite_ready ON public.movement_members;
CREATE TRIGGER movement_member_invite_ready BEFORE INSERT OR UPDATE ON public.movement_members
FOR EACH ROW EXECUTE FUNCTION public.movement_member_invite_ready();