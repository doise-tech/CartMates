-- CartMates · 0003 · Rule 5: quiet parties end on their own (checked every 15 minutes)
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'end-stale-parties',
  '*/15 * * * *',
  $$ select private.end_stale_parties(); $$
);
