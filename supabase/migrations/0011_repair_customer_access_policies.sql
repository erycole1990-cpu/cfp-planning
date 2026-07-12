drop policy if exists "customers_v1_read" on customers;
drop policy if exists "customers_v1_write" on customers;
drop policy if exists "customers_role_read" on customers;
drop policy if exists "customers_role_insert" on customers;
drop policy if exists "customers_role_update" on customers;
drop policy if exists "customers_role_delete" on customers;

create policy "customers_role_read" on customers for select to authenticated using (
  cfp_can_access_customer(id)
);

create policy "customers_role_insert" on customers for insert to authenticated with check (
  cfp_is_admin()
  or (
    cfp_user_role() = 'agent'
    and assigned_agent_user_id = auth.uid()
  )
);

create policy "customers_role_update" on customers for update to authenticated using (
  cfp_can_access_customer(id)
) with check (
  cfp_can_access_customer(id)
);

create policy "customers_role_delete" on customers for delete to authenticated using (
  cfp_is_admin()
);
