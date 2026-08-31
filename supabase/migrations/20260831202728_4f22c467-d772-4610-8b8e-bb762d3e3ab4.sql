with copies as (
  select e.created_at as copied_at,
         (select cs.id from public.checkout_sessions cs
           where cs.payment_method in ('pix','pix_auto','pix_automatic')
             and cs.created_at between e.created_at - interval '20 minutes' and e.created_at + interval '1 minute'
           order by cs.created_at desc limit 1) as session_id
  from public.checkout_funnel_events e
  where e.step = 'pix_copy'
), agg as (
  select session_id, min(copied_at) as copied_at
  from copies where session_id is not null group by session_id
)
update public.checkout_sessions cs
set pix_copied_at = agg.copied_at
from agg
where cs.id = agg.session_id and cs.pix_copied_at is null;