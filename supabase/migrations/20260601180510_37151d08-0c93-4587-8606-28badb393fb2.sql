-- Tornar FKs para profiles.user_id ON UPDATE CASCADE para permitir
-- a re-vinculação de profiles legados (WhatsApp ghost) ao novo auth.uid().
ALTER TABLE public.messages DROP CONSTRAINT messages_user_id_fkey;
ALTER TABLE public.messages ADD CONSTRAINT messages_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.checkins DROP CONSTRAINT checkins_user_id_fkey;
ALTER TABLE public.checkins ADD CONSTRAINT checkins_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.commitments DROP CONSTRAINT commitments_user_id_fkey;
ALTER TABLE public.commitments ADD CONSTRAINT commitments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.conversation_followups DROP CONSTRAINT fk_user;
ALTER TABLE public.conversation_followups ADD CONSTRAINT fk_user
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.time_capsules DROP CONSTRAINT time_capsules_user_id_fkey;
ALTER TABLE public.time_capsules ADD CONSTRAINT time_capsules_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.user_insights DROP CONSTRAINT user_insights_user_id_fkey;
ALTER TABLE public.user_insights ADD CONSTRAINT user_insights_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.user_meditation_history DROP CONSTRAINT user_meditation_history_user_id_fkey;
ALTER TABLE public.user_meditation_history ADD CONSTRAINT user_meditation_history_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.weekly_plans DROP CONSTRAINT weekly_plans_user_id_fkey;
ALTER TABLE public.weekly_plans ADD CONSTRAINT weekly_plans_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON UPDATE CASCADE ON DELETE CASCADE;