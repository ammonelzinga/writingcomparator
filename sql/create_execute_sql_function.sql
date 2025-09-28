-- create_execute_sql_function.sql
-- Safe helper to execute read-only SELECT statements returned by an LLM.
-- IMPORTANT: Review and understand security implications before enabling in production.

-- This function takes a single SQL string and returns SETOF jsonb rows for SELECT statements.
-- It enforces a few basic safety checks:
--  - The statement must start with SELECT (case-insensitive)
--  - It disallows common dangerous keywords (INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE)
--  - It forbids semicolons to reduce multi-statement injections

create or replace function public.execute_sql(p_sql text)
returns setof jsonb
language plpgsql
security definer
as $$
declare
  _sql text := trim(p_sql);
  _rec record;
begin
  if _sql = '' then
    raise exception 'empty sql';
  end if;

  -- basic sanitation
  if position(';' in _sql) > 0 then
    raise exception 'multiple statements or semicolons not allowed';
  end if;

  if lower(left(_sql, 6)) <> 'select' then
    raise exception 'only SELECT queries are permitted';
  end if;

  -- disallow dangerous tokens anywhere
  if _sql ~* '\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|execute)\b' then
    raise exception 'disallowed keyword in query';
  end if;

  -- execute the query in a safe way and return rows as jsonb
  -- set ivfflat probes locally for this transaction so vector index searches use more probes
  perform set_config('ivfflat.probes', '10', true);

  for _rec in execute format('select to_jsonb(t) as row from (%s) t', _sql) loop
    return next _rec.row;
  end loop;
  return;
end;
$$;

-- SECURITY NOTE:
-- This function is created SECURITY DEFINER. The owner should be a database role with
-- limited read-only privileges on the target tables. By default it runs with the
-- privileges of the role that owns the function. Do NOT make the owner the service
-- role if that role has more privileges than necessary.

-- Recommended workflow to install safely:
-- 1) Create a dedicated database role (e.g. "api_readonly") and grant it SELECT
--    on the tables needed (document, overview, passage, theme, passage_theme, overview_theme, embedding_*).
-- 2) Create this function as that role (or set the owner to that role). Then ensure
--    the Supabase server key used by your Next.js API routes is a role that can
--    execute this function but does not have superuser privileges.

-- Example SQL to create the role and grant minimal rights (run as a psql superuser in Supabase SQL editor):
--
-- -- 1. create the role
-- create role api_readonly noinherit login password 'a_strong_random_password';
--
-- -- 2. grant CONNECT on database (replace db name if needed)
-- grant connect on database current_database() to api_readonly;
--
-- -- 3. grant usage on schema public
-- grant usage on schema public to api_readonly;
--
-- -- 4. grant select on tables you want to expose
-- grant select on table public.document to api_readonly;
-- grant select on table public.overview to api_readonly;
-- grant select on table public.passage to api_readonly;
-- grant select on table public.theme to api_readonly;
-- grant select on table public.passage_theme to api_readonly;
-- grant select on table public.overview_theme to api_readonly;
-- grant select on table public.embedding_overview to api_readonly;
-- grant select on table public.embedding_passage to api_readonly;

-- -- 5. change owner of the function to api_readonly (run as the function owner or superuser):
-- alter function public.execute_sql(text) owner to api_readonly;

-- After these steps, your API can call the function. In Supabase you might need to set the
-- function's owner appropriately. If your server key is the service role with broad privileges,
-- consider creating a separate role and using the 'set_config' technique or limited JWT to
-- call this function as that role.

-- Example call (from server-side code using supabase-js):
-- const { data, error } = await supabase.rpc('execute_sql', { sql: 'SELECT title, author FROM document LIMIT 10' });

-- End of file
