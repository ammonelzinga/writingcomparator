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


