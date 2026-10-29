# Write-up — BookLeaf Author Support Portal

## What I prioritised
1. **The core ticket loop, end to end.** An author raises a query, the admin sees it ranked in the queue, opens it with a draft ready, edits and sends it, and the author sees the reply live. Everything else was built around that loop.
2. **AI that an ops team can trust**, not just an API call:
   - **Code computes every number and date** (royalty totals, the ₹1,000 threshold, the next payout deadline), and the model only writes the words. It is told to quote the facts exactly, and a reply that still contains a `[placeholder]` cannot be sent. This removes the most dangerous failure, a confident wrong amount or date sent to an author.
   - **Only the knowledge base for the ticket's category** is sent, plus the tone rules. The conversation is capped at the last 4 messages.
   - **The small model triages; the large model drafts.** Every call is logged with tokens, latency and cost.
3. **Graceful degradation as a design rule.** Keyword rules classify a ticket instantly, before any AI call. AI work runs in a background queue, enqueued in the same transaction as the ticket, with retries, a circuit breaker, one repair attempt and a model fallback. Creating a ticket and replying by hand never depend on the AI.
4. **The data's edge cases**: books in production with no MRP or royalties, zero and sub-threshold royalties, and ISBNs on books not yet at the ISBN stage. These are handled in code and in the prompts, not left to the model.

## Trade-offs I made
- **Modular monolith over microservices.** One deployable unit, with module boundaries (each module owns its tables, its validation and its errors) that could be split later. For a 5-day build this gives most of the structure for little of the operational cost.
- **PostgreSQL for everything: data, job queue (pg-boss) and live events (LISTEN/NOTIFY).** No Redis or message broker to run. The cost is that the queue and the events compete with normal database load. That is fine at this size; at real BookLeaf volume they would move to dedicated infrastructure.
- **SSE over WebSockets.** Updates only flow one way, so SSE is simpler and works with normal cookies. Events carry IDs only, and the browser re-fetches through the permission-checked API, so no data can leak through the stream.
- **Cookie sessions on one origin (Vercel rewrites `/api` to Render) instead of tokens in the browser.** Safer against XSS and needs no CORS, but ties the frontend to the rewrite.
- **Groq + open-weight gpt-oss models.** Fast and cheap, with strict JSON output. A smaller ecosystem than OpenAI or Anthropic, so the provider sits behind one small interface and can be swapped.
- **Attachments are UI only**, as allowed. Real uploads need storage, scanning and access control, and I preferred to spend that time on the AI and the ticket flow.

## What testing on real data changed
Measurement found problems the design alone didn't:
- The labelled triage set (21 cases) runs against the real model. It is now at 100% category and 100% priority, against 95% / 86% for keyword rules alone.
- The first manual tests found that **5 of 9 draft calls failed**. The cause was not the schema: the reasoning models used up their whole token budget "thinking" and returned an empty answer. Raising the budget, and treating Groq's rejection as repairable output, fixed it.
- The same tests found that "a few months" was ranked Critical and a vague "refund" was ranked Low. Both were fixed by explicit rubric rules and new evaluation cases.

## Taking it to production
- **Reliability:** a separate worker service, paid hosting with no cold starts, a staging environment, and a separate test database in CI. Add alerting on the AI failure rate and on SLA breaches, both already computed by `/stats/overview`.
- **Product:**
  - email or WhatsApp notifications when BookLeaf replies;
  - real attachments, with the defect photos the print-quality policy needs;
  - an admin statistics dashboard;
  - saved queue views and bulk actions;
  - canned answers built from the drafts admins send unchanged (we already record whether each draft was sent as-is or edited).
- **AI:**
  - Grow the evaluation set from real, anonymised tickets, and add an evaluation for draft quality (factual accuracy, tone, next step) with human review of samples.
  - Use admin overrides as feedback, and A/B test prompt versions (already versioned and logged).
  - Retrieval (RAG) only once the knowledge base outgrows what fits per category.
- **Data:** connect real royalty breakdowns per platform, so the AI can explain a low payout line by line, as the brief's sample answer expects.
