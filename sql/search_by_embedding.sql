-- Deprecated original implementation retained below (commented out) for reference.
-- New hybrid search with optional theme/document filters.

-- New signature: search_passages_by_embedding(query_embedding vector(1536), match_limit int default 10, theme_filter text default null, document_filter text default null)
-- Returns a typed table for easier consumption.

create or replace function public.search_passages_by_embedding(
  query_embedding vector(1536),
  match_limit int default 200,
  theme_filter text default null,
  document_filter text default null
)
returns table (
  passage_id int,
  document_id int,
  overview_id int,
  label text,
  content text,
  similarity real
)
language plpgsql
security definer
as $$
begin
  perform set_config('ivfflat.probes','10', true);

  return query
  select
    p.passage_id,
    p.document_id,
    p.overview_id,
    p.label,
    p.content,
  (1 - (ep.embedding_vector <=> query_embedding))::real as similarity
  from embedding_passage ep
  join passage p on p.passage_id = ep.passage_id
  left join passage_theme pt on pt.passage_id = p.passage_id
  left join theme t on t.theme_id = pt.theme_id
  left join document d on d.document_id = p.document_id
  where
    (theme_filter is null or t.name ilike '%' || theme_filter || '%')
    and (document_filter is null or d.title ilike '%' || document_filter || '%' or d.author ilike '%' || document_filter || '%')
  order by ep.embedding_vector <=> query_embedding
  limit match_limit;
end;
$$;

comment on function public.search_passages_by_embedding is 'Hybrid semantic passage search with optional theme/document filters';
