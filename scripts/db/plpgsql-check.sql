-- Fail when any public plpgsql function references a column, table or
-- function that does not exist. plpgsql only resolves those at run time, so
-- without this check the bug ships and fails on first call (00112 → 00166).
--
-- Used by check-functions.sh after replaying all migrations. The same logic
-- was validated against prod on 2026-10-06 inside a rolled-back transaction:
-- 26 functions, 0 errors, and a planted missing-column trigger was caught.

create extension if not exists plpgsql_check;

do $$
declare
  r       record;
  e       record;
  rel     regclass;
  checked int := 0;
  skipped int := 0;
  errors  int := 0;
begin
  for r in
    select p.oid, p.proname, p.prorettype = 'trigger'::regtype as is_trigger
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
      join pg_language  l  on l.oid  = p.prolang
     where ns.nspname = 'public' and l.lanname = 'plpgsql'
     order by p.proname
  loop
    if r.is_trigger then
      -- A trigger function can only be checked against a table it's attached to.
      if not exists (select 1 from pg_trigger t where t.tgfoid = r.oid and not t.tgisinternal) then
        skipped := skipped + 1;
        continue;
      end if;
      for rel in
        select distinct t.tgrelid::regclass from pg_trigger t
         where t.tgfoid = r.oid and not t.tgisinternal
      loop
        for e in select * from plpgsql_check_function_tb(r.oid::regprocedure, rel) where level = 'error' loop
          errors := errors + 1;
          raise warning 'plpgsql_check: % (trigger on %): [%] %', r.proname, rel, e.sqlstate, e.message;
        end loop;
      end loop;
    else
      for e in select * from plpgsql_check_function_tb(r.oid::regprocedure) where level = 'error' loop
        errors := errors + 1;
        raise warning 'plpgsql_check: %: [%] %', r.proname, e.sqlstate, e.message;
      end loop;
    end if;
    checked := checked + 1;
  end loop;

  raise notice 'plpgsql_check: % functions checked, % unattached trigger functions skipped, % error(s)',
    checked, skipped, errors;

  if errors > 0 then
    raise exception 'plpgsql_check found % error(s): a function references something that does not exist and would fail at run time.', errors;
  end if;
end $$;
