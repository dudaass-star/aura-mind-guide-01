
-- Rearma o convite D0 da Fernanda Maion (criada 16/05 17:04 BRT).
-- Ela nunca interagiu — o injetor D0 não estava deployado quando o trigger
-- inicial rodou. Como nenhuma mensagem do usuário foi processada ainda,
-- é seguro rearmar para que o convite dispare na 1ª resposta dela.
UPDATE public.profiles
SET pending_first_session_invite = true,
    first_session_invite_attempts = 0,
    needs_schedule_setup = false
WHERE user_id = 'a40cd317-85e9-42bf-8f1f-13ad18e8ae9a'
  AND pending_first_session_invite = false;
