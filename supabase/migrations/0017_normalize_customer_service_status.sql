update public.customers
set service_status = 'inactive'
where lower(trim(service_status)) in ('ended', 'no longer servicing', 'no_longer_servicing');

update public.customers
set service_status = 'active'
where service_status is null or trim(service_status) = '';
