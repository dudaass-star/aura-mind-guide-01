UPDATE public.session_ratings SET rating = CASE
  WHEN rating <= 2 THEN 1
  WHEN rating <= 4 THEN 2
  WHEN rating <= 6 THEN 3
  WHEN rating <= 8 THEN 4
  ELSE 5 END
WHERE rating > 5 OR rating < 1;
ALTER TABLE public.session_ratings DROP CONSTRAINT IF EXISTS session_ratings_rating_check;
ALTER TABLE public.session_ratings ADD CONSTRAINT session_ratings_rating_check CHECK (rating >= 1 AND rating <= 5);