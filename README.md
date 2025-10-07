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

## Deployment

You can deploy the app with either (a) Vercel only (simplest) or (b) Vercel for the UI/API plus a Render (or other) long‑running worker for heavy recompute jobs. The current code runs fine entirely on Vercel, but long uploads/recompute endpoints should stay within function execution limits (we cap durations via `vercel.json`).

### Required Environment Variables
Set these in your hosting provider dashboard (never commit secrets):

| Variable | Purpose | Notes |
|----------|---------|-------|
| SUPABASE_URL | Supabase project URL | From Supabase settings |
| SUPABASE_KEY | Supabase anon public key | Use anon key, NOT service role in client-facing runtime |
| OPENAI_KEY | OpenAI API key | Required for embeddings + SQL generation + summaries |
| OPENAI_CONCURRENCY (optional) | Max concurrent OpenAI calls | Default 4 |
| OPENAI_EMBED_BATCH (optional) | Embed request batch size | Start with 1–8 (depends on model limits) |
| OPENAI_REQ_TIMEOUT_MS (optional) | Default per-request timeout (ms) | Summary step overrides to 40s |

If you need a separate privileged key (e.g., for admin recompute scripts), run those scripts from a secure backend (Render worker) and keep the service role key off the public Vercel environment.

### Vercel Deployment Steps
1. Push your repository to GitHub (public or private).
2. In Vercel, "Import Project" → select the repo.
3. Framework auto-detect = Next.js; accept defaults.
4. Add Environment Variables (see table above) under Project Settings → Environment Variables.
5. Deploy.
6. (Optional) Protect heavy endpoints with a basic token header if you expect public traffic (see Security section).

The included `vercel.json` forces Node.js runtime for API routes and sets conservative resource limits. Adjust `maxDuration` or `memory` if you upgrade your plan.

### Render (Optional Worker)
If uploads or recompute endpoints begin to exceed Vercel's execution window:
1. Create a Render "Web Service" or "Background Worker" (Node 18+).
2. Copy the repo; set the same env vars plus any worker‑specific variable (e.g., `WORKER_ONLY=true`).
3. Add a small Express/Next custom script or a cron-like loop (Render supports cron jobs) that calls internal recompute endpoints or runs SQL directly.
4. From the Vercel app, convert long-running user actions into queued operations (e.g., insert a job row in a `job_queue` table that the worker polls).

### Background / Long Operations Strategy
Current endpoints perform work inline. To harden for scale:
1. Convert `upload` and `recompute-*` to enqueue a job (insert row with payload + status) and return immediately.
2. Worker polls every few seconds for `status='pending'` and processes.
3. UI polls `/api/job-status?id=...` for progress (counts already used in responses can be stored).
4. Optional: Use Supabase realtime or Postgres NOTIFY to push completion events.

### Production Hardening Tips
1. **Use only the anon key on Vercel.** Service role key must never be exposed in client-accessible builds.
2. **Rate limit API routes** (edge middleware or a lightweight token bucket) to prevent accidental OpenAI spend spikes.
3. **Add basic auth / token** for recompute & upload endpoints if public contributions are not desired.
4. **Logging**: Pipe `console.warn/error` to a log drain (Vercel integrations or a simple Logtail/Datadog). Capture counts of OpenAI failures.
5. **Cost control**: Set `OPENAI_CONCURRENCY=2` initially; raise only if latency is a problem.
6. **Monitoring**: A health endpoint (`/api/health`) that checks a trivial Supabase select can help external uptime checks.
7. **SQL guard**: Current SQL generation sanitizes writes; periodically review logs to ensure no unexpected patterns slip through.

### Local vs Production Considerations
| Concern | Local | Production |
|---------|-------|------------|
| Long uploads | OK (dev server) | Might exceed serverless timeout → queue + worker |
| OpenAI latency | Tolerable | Use batching + concurrency limit |
| Theme recompute | Manual button | Move to background job |
| Embedding dimension | Fixed (1536) | Keep consistent across models |

### Minimal Worker Example (Pseudo-code)
```
while (true) {
	const job = await nextPendingJob();
	if (job) { await process(job); }
	await sleep(3000);
}
```

### Security Reminder
Never trust LLM-generated SQL blindly in a multi-tenant environment. Here it is restricted to SELECT + optional leading SET. If you extend functionality, keep a strict parser or move to parameterized stored procedures.

### Rolling Back
If a deploy introduces errors, use Vercel's "Promote" to restore last good deployment rapidly. Keep an eye on OpenAI error rates; a surge often indicates a key issue or model instability.

---
Feel free to request a job queue scaffold or a worker script template; those can be added next if desired.
