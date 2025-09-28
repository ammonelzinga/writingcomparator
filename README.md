# Writing Comparator

Local Next.js app to browse, upload, and compare documents stored in Supabase.

Features
- List documents in a left menu
- Read passages and overviews
- Open two documents side-by-side for comparison
- Upload documents (metadata + parsing + embeddings)
- Ask natural-language questions that produce SQL (via OpenAI), show SQL, run it, and render results + a friendly summary

Setup
1. Install dependencies: npm install
2. Copy `.env.example` to `.env.local` and fill SUPABASE_URL, SUPABASE_KEY, and OPENAI_KEY
3. Run dev: npm run dev

Notes
- This project uses your existing Supabase database described in `SchemaCreation.sql`.
- Uploads call OpenAI to generate embeddings and extract themes; keep an eye on usage.
