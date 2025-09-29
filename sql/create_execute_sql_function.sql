-- Unrestricted executor: execute any SQL passed in and return any resulting rows as jsonb.
-- WARNING: This removes all checks. Use only in a trusted development environment.

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

  -- Handle leading SET statements (apply via set_config) so callers can include
  -- lines like: SET ivfflat.probes = 10;  followed by their query. We strip and
  -- apply SETs, then execute the remaining SQL.
  declare
    pos int;
    set_stmt text;
    set_body text;
    set_name text;
    set_val text;
  begin
    loop
      _sql := ltrim(_sql);
      if _sql ~* '^SET\b' then
        pos := position(';' in _sql);
        if pos = 0 then
          raise exception 'unterminated SET statement';
        end if;
        set_stmt := substring(_sql from 1 for pos);
        -- remove processed SET
        _sql := ltrim(substring(_sql from pos + 1));

        -- remove leading SET and optional LOCAL
        set_body := regexp_replace(set_stmt, '^\s*SET\s+(LOCAL\s+)?', '', 'i');
        -- strip trailing semicolon
        set_body := regexp_replace(set_body, ';\s*$', '');

        set_name := trim(split_part(set_body, '=', 1));
        set_val := trim(split_part(set_body, '=', 2));
        set_val := regexp_replace(set_val, '^\s*''(.*)''\s*$', '\1');

        perform set_config(set_name, set_val, true);
        -- continue to process additional leading SETs
      else
        exit;
      end if;
    end loop;
  end;

  -- Execute the remaining SQL and return rows as jsonb. We try to wrap it first,
  -- then fall back to executing raw SQL if needed.
  for _rec in execute format('select to_jsonb(t) as row from (%s) t', _sql) loop
    return next _rec.row;
  end loop;

  begin
    for _rec in execute _sql loop
      if _rec is not null then
        return next to_jsonb(_rec);
      end if;
    end loop;
  exception when others then
    raise;
  end;

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

-- ------------------------------------------------------------------
-- Trusted execution function (DANGEROUS - use only for admin/dev)
-- ------------------------------------------------------------------
-- This function will execute arbitrary SQL passed in p_sql and return rows as jsonb.
-- WARNING: Only create this function in a controlled environment. The function SHOULD be
-- owned by a restricted role (for example 'api_admin_trusted') that has the minimal
-- privileges required. Do NOT set the owner to a superuser or a broadly-privileged role.

create or replace function public.execute_sql_trusted(p_sql text)
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

  -- Execute without any sanitization. Caller must ensure this is only invoked in safe contexts.
  for _rec in execute format('select to_jsonb(t) as row from (%s) t', _sql) loop
    return next _rec.row;
  end loop;
  return;
end;
$$;

-- Helper functions to return embedding vectors by id or theme name.
-- These are convenience wrappers so SQL generated by the LLM that calls
-- embedding_passage(passage_id) or theme_embedding(name) will work.
-- They simply select the vector column from the respective tables.

create or replace function public.embedding_passage(p_passage_id integer)
returns vector
language sql
stable
as $$
  select embedding_vector from embedding_passage where passage_id = p_passage_id limit 1;
$$;

create or replace function public.theme_embedding(p_name text)
returns vector
language sql
stable
as $$
  select embedding_vector from theme where name = p_name limit 1;
$$;
