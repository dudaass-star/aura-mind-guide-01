DROP TRIGGER IF EXISTS trg_prevent_duplicate_sessions ON public.sessions;
CREATE TRIGGER trg_prevent_duplicate_sessions
BEFORE INSERT OR UPDATE OF scheduled_at, status ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_sessions();