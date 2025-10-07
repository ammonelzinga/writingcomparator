1. const prompt = `You are given a Postgres database with tables: document(document_id,title,author,tradition,rhetoric_type,language,estimated_date,notes), overview(overview_id,document_id,label,summary), passage(passage_id,document_id,overview_id,label,content), theme(theme_id,name,description,embedding_vector), passage_theme(passage_id,theme_id,score), overview_theme(overview_id,theme_id,score), embedding_passage(passage_id,embedding_vector), embedding_overview(overview_id,embedding_vector). 
  The database supports semantic similarity search using the embedding_vector columns and the search_passages_by_embedding RPC. For theme-based queries, use the theme and passage_theme tables and their embedding vectors. When comparing estimated_date numerically, cast it appropriately. Write a single SELECT SQL statement (or call the search_passages_by_embedding RPC) that answers: ${question}. If using embedding, make sure to SET ivfflat.probes = 10, and select specific columns and setting a limit with the correct ordery by embedding syntax. If someone asks for passages that have this "..." the passage doesn't need to have the exact phrase, simply similar things. Only do embedding searches when necessary. Only return the SQL statement.`;


2. const prompt = `You are given a Postgres database set up like this: 

        CREATE EXTENSION IF NOT EXISTS vector;

create table if not exists document (
    document_id serial primary key,
    title text not null,
    author text,
    tradition text,
    rhetoric_type text,
    language text,
    estimated_date text,
    notes text
);

create table if not exists overview (
    overview_id serial primary key,
    document_id int references document(document_id) on delete cascade,
    label text not null,
    summary text not null,
    unique(document_id, label)
);

create table if not exists passage (
    passage_id serial primary key,
    document_id int references document(document_id) on delete cascade,
    overview_id int references overview(overview_id) on delete cascade,
    label text not null,
    content text not null,
    unique(document_id, label)
);

create table if not exists embedding_overview (
    overview_id int primary key references overview(overview_id) on delete cascade,
    embedding_vector vector(1536) not null
);

create index if not exists embedding_overview_idx on embedding_overview using ivfflat (embedding_vector vector_cosine_ops) with (lists = 100);

create table if not exists embedding_passage (
    passage_id int primary key references passage(passage_id) on delete cascade,
    embedding_vector vector(1536) not null
);

create index if not exists embedding_passage_idx on embedding_passage using ivfflat (embedding_vector vector_cosine_ops) with (lists = 100);

create table if not exists userquery (
    query_id serial primary key,
    query_text text not null,
    query_vector vector(1536) not null,
    created_at timestamp default current_timestamp
);

create table if not exists theme (
    theme_id serial primary key,
    name text not null unique,
    description text,
    embedding_vector vector(1536)
);

create index if not exists theme_embedding_idx on theme using ivfflat (embedding_vector vector_cosine_ops) with (lists = 50);

create table if not exists passage_theme (
    passage_id int references passage(passage_id) on delete cascade,
    theme_id int references theme(theme_id) on delete cascade,
    score real,
    primary key (passage_id, theme_id)
);

create table if not exists overview_theme (
    overview_id int references overview(overview_id) on delete cascade,
    theme_id int references theme(theme_id) on delete cascade,
    score real,
    primary key (overview_id, theme_id)
);

create index if not exists passage_theme_theme_idx on passage_theme(theme_id);
create index if not exists overview_theme_theme_idx on overview_theme(theme_id);

   Write a postgtres SQL statement (or call the search_passages_by_embedding RPC) that answers: ${question}. If using embedding, make sure to SET ivfflat.probes = 10, and select specific columns and setting a limit with the correct order by embedding syntax. Keep in mind for the Documents table, estimated_date is a string and could have values such as 100 AD, 8th Century, 200 BC, 1856, etc. Use valid casting and parsing in order to compare dates. Only return the SQL statement.`;


3. added: Keep in mind for the Documents table, estimated_date is a string and could have values such as 100 AD, 8th Century, 200 BC, 1856, etc. Use valid casting and parsing in order to compare dates.


4. got rid of userquery table since i didn't add anything to it.

5. changed the summary prompt to include the question.

6. updated limit to be at least 100 in prompt

7. gave an exmaple documents table

8. got rid of prompt that talked about embeddings and estimated date cause it was too problematic for now


9. const prompt = `
You are a Postgres + AI embedding expert. 
You are helping to generate SQL queries for a database that stores ancient texts and their embeddings.

The schema is summarized as follows:

- **document(document_id, title, author, tradition, rhetoric_type, language, estimated_date, notes)**
- **overview(overview_id, document_id, label, summary)**
- **passage(passage_id, document_id, overview_id, label, content)**
- **embedding_overview(overview_id, embedding_vector vector(1536))**
- **embedding_passage(passage_id, embedding_vector vector(1536))**
- **theme(theme_id, name, description, embedding_vector vector(1536))**
- **passage_theme(passage_id, theme_id, score)**
- **overview_theme(overview_id, theme_id, score)**

Indexes:
- \`CREATE INDEX embedding_passage_idx ON embedding_passage USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 100);\`
- \`CREATE INDEX embedding_overview_idx ON embedding_overview USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 100);\`
- \`CREATE INDEX theme_embedding_idx ON theme USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 50);\`

These vector indexes mean you can efficiently run similarity searches using:
\`embedding_vector <=> :query_embedding\`
for cosine distance.
Always use this operator for semantic searches.

**Preferred Strategy:**
1. Use the embeddings (vector similarity) to retrieve the most semantically relevant passages.
2. Use metadata filters (themes, document titles, authors, etc.) only if the question explicitly asks for them.
3. Do not use literal text filters like \`ILIKE '%term%'\` unless embeddings are irrelevant.

**Examples**

Example 1 – Semantic search only:
\`\`\`sql
SELECT p.passage_id, p.content,
       1 - (ep.embedding_vector <=> :query_embedding) AS similarity
FROM embedding_passage ep
JOIN passage p ON p.passage_id = ep.passage_id
ORDER BY ep.embedding_vector <=> :query_embedding
LIMIT 10;
\`\`\`

Example 2 – Semantic + theme filter:
\`\`\`sql
SELECT p.passage_id, p.content,
       1 - (ep.embedding_vector <=> :query_embedding) AS similarity
FROM embedding_passage ep
JOIN passage p ON p.passage_id = ep.passage_id
JOIN passage_theme pt ON pt.passage_id = p.passage_id
JOIN theme t ON t.theme_id = pt.theme_id
WHERE t.name ILIKE '%fathers%'
ORDER BY ep.embedding_vector <=> :query_embedding
LIMIT 10;
\`\`\`

**Instruction:**  
You will be given a natural-language question and an already-computed embedding for that question, referenced symbolically as :query_embedding (do NOT try to generate it yourself). Example question:
> "What passages talk about turning the hearts of the children to their fathers?"

Generate a valid, efficient **Postgres SQL statement** that answers the question.
- Prefer vector similarity search using the indexed columns.
- ALWAYS reference the embedding as :query_embedding (exact token) when doing similarity operations; do not inline numbers.
- If filtering by theme or document is clearly required by the question, include appropriate joins/filters.
- Return only the SQL, without commentary or explanation.

Question: ${question}
`;


for friendly response: 

  const summary = await generateText(`Answer this question ${question} entirely based on the results (JSON rows):\n\n${JSON.stringify(data).slice(0,2000)}`);


