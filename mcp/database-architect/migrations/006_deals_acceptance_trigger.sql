-- When a client becomes active, mark the latest in-flight deal as accepted.

create or replace function public.set_latest_deal_accepted_on_activation()
returns trigger
language plpgsql
as $$
begin
  -- Only act on transitions into active-client.
  if new.status = 'active-client' and (old.status is distinct from 'active-client') then
    with target as (
      select id
      from public.deals
      where client_id = new.id
        and accepted_at is null
        and proposal_status in ('draft', 'sent')
      order by
        sent_at desc nulls last,
        created_at desc
      limit 1
    )
    update public.deals d
    set
      proposal_status = 'accepted',
      accepted_at = now()
    from target t
    where d.id = t.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_deals_set_accepted_at on public.clients;
create trigger trg_deals_set_accepted_at
after update on public.clients
for each row
execute function public.set_latest_deal_accepted_on_activation();

