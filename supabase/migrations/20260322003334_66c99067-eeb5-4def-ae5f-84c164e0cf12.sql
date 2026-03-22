
DELETE FROM public.messages
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, role, content, date_trunc('minute', created_at)
        ORDER BY created_at ASC
      ) AS rn
    FROM public.messages
  ) sub
  WHERE rn > 1
);
