-- search_by_embedding.sql
-- Creates a safe RPC to perform vector similarity search on passages
-- Usage: select * from public.search_passages_by_embedding(ARRAY[...], 10, 0, null);
create or replace function public.search_passages_by_embedding(
  p_embedding double precision[],
  p_limit int,
  p_offset int,
  p_document_id int default null
) returns setof jsonb
language plpgsql
security definer
as $$
declare
  _sql text;
begin
  -- Ensure probes local setting for ivfflat index performance
  perform set_config('ivfflat.probes','10', true);

  if p_document_id is null then
    _sql := 'select jsonb_build_object(''passage_id'', p.passage_id, ''content'', p.content, ''score'', 1 - (e.embedding_vector <#> $1::vector)) '
          || 'from embedding_passage e join passage p on p.passage_id = e.passage_id '
          || 'order by 1 - (e.embedding_vector <#> $1::vector) desc '
          || 'limit $2 offset $3';
    return query execute _sql using p_embedding, p_limit, p_offset;
  else
    _sql := 'select jsonb_build_object(''passage_id'', p.passage_id, ''content'', p.content, ''score'', 1 - (e.embedding_vector <#> $1::vector)) '
          || 'from embedding_passage e join passage p on p.passage_id = e.passage_id '
          || 'where p.document_id = $4 '
          || 'order by 1 - (e.embedding_vector <#> $1::vector) desc '
          || 'limit $2 offset $3';
    return query execute _sql using p_embedding, p_limit, p_offset, p_document_id;
  end if;
end;
$$;

comment on function public.search_passages_by_embedding is 'Search passages by embedding vector safely using parameterized embedding argument';
