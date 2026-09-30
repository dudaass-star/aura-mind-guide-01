ALTER TABLE public.weekly_reports
  DROP CONSTRAINT weekly_reports_user_id_fkey,
  ADD CONSTRAINT weekly_reports_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES public.profiles(user_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.consolidate_portal_identity(
  _profile_id uuid,
  _new_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old_user_id uuid;
  _table record;
  _moved_tables jsonb := '{}'::jsonb;
  _affected bigint;
BEGIN
  SELECT user_id
    INTO _old_user_id
  FROM public.profiles
  WHERE id = _profile_id
  FOR UPDATE;

  IF _old_user_id IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF _old_user_id = _new_user_id THEN
    RETURN jsonb_build_object(
      'consolidated', true,
      'already_linked', true,
      'old_user_id', _old_user_id,
      'new_user_id', _new_user_id,
      'moved_tables', _moved_tables
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _new_user_id
      AND id <> _profile_id
  ) THEN
    RAISE EXCEPTION 'target_profile_exists';
  END IF;

  UPDATE public.profiles
  SET user_id = _new_user_id,
      updated_at = now()
  WHERE id = _profile_id;

  FOR _table IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'user_id'
      AND c.udt_name = 'uuid'
      AND c.table_name <> 'profiles'
      AND c.table_name NOT IN (
        'asaas_payments',
        'asaas_pix_authorizations',
        'inter_pix_charges',
        'inter_pix_recurrences',
        'user_roles',
        'woovi_charges',
        'woovi_disputes',
        'woovi_subscriptions'
      )
    ORDER BY c.table_name
  LOOP
    EXECUTE format(
      'UPDATE public.%I SET user_id = $1 WHERE user_id = $2',
      _table.table_name
    ) USING _new_user_id, _old_user_id;

    GET DIAGNOSTICS _affected = ROW_COUNT;
    IF _affected > 0 THEN
      _moved_tables := _moved_tables || jsonb_build_object(_table.table_name, _affected);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'consolidated', true,
    'already_linked', false,
    'old_user_id', _old_user_id,
    'new_user_id', _new_user_id,
    'moved_tables', _moved_tables
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consolidate_portal_identity(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consolidate_portal_identity(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.consolidate_portal_identity(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consolidate_portal_identity(uuid, uuid) TO service_role;