---
name: zlide-slide-agent
description: Drive the Z.ai GLM Slide and Poster Agent (slides_glm_agent) with raw HTTP — generate decks and posters from one sentence, refine multi-turn via conversation_id, export PDF or HTML via hidden custom_variables. Use when the user asks to create slides, posters, pitch decks, export include_pdf or include_html, estimate slide token cost, or debug the Zlide Studio.
---

# Zlide Slide Agent

## The two truths (non-obvious — respect them)

1. The Z.ai SDKs have NO method for `agent_id` calls. `chat.completions.create()` knows nothing of the slide endpoint. Drive the agent with plain `fetch` — full contract in `references/zai-agent-api.md`.
2. `@ai-sdk/zai` speaks LanguageModelV4 (ai-v5 spec). On ai-v4 codebases it is a demon — use the OpenAI-compatible endpoint instead: baseURL `https://api.z.ai/api/paas/v4` with any OpenAI-style client. Never bundle a client tokenizer (tiktoken/tokenizers native builds); the server tokenizer API is the only door.

## Workflow

### 1. Stage 1 — structure (chat model, cheap)
Draft the outline with a GLM chat model first: cover, agenda, body, data, closing — one idea per slide. For posters: headline, 3 stats, call to action.

### 2. Stage 2 — generate (slide agent, metered $0.7/M tokens)
POST `{BASE}/agents` with body `{ agent_id: "slides_glm_agent", stream: true, messages: [{ role: "user", content: [{ type: "text", text: PROMPT }] }] }`, where `PROMPT` follows the anatomy below. Parse the SSE stream: `thinking` (log it), `tool` (log name: search, insert_page, remove_slides, access_page, modify_page), `answer` (accumulate HTML). The terminal event carries `conversation_id` + `usage` — persist both.

### 3. Refine (multi-turn — same deck)
Send the next prompt with `conversation_id` set, e.g. `make slide 3 a bar chart, darker theme`.

### 4. Export (the hidden switch)
POST `{BASE}/agents/export` with `{ agent_id: "slides_glm_agent", conversation_id, custom_variables: { include_pdf: true } }` for PDF or `{ include_html: true }` for HTML.

### 5. Cost
`usd = total_tokens / 1_000_000 * 0.7`. Preflight long prompts with POST `{BASE}/tokenizer` body `{ model, messages: [{ role: "user", content }] }`.

## Prompt anatomy (order matters)
`Topic` + `pagination` (slides: `exactly N slides 16:9`; poster: `ONE single-canvas poster portrait 3:4`) + `visual style keywords` + `search for fresh facts` + `output self-contained HTML with inline CSS`.

Style keywords that move the model: `minimalist, generous whitespace` / `bold startup pitch, high contrast, big numbers` / `academic, serif headings, muted palette` / `playful poster, vibrant gradient` / `dark tech keynote, neon accents`.

## In this repo (Zlide Studio)
- Server: `src/lib/server/zai/slide-agent.ts` (streamSlideAgent, exportSlides, estimateCost), `src/lib/server/zai/tokenizer.ts`.
- Routes: `POST /api/slides/generate` (SSE: `phase` then `done`), `POST /api/slides/export`, `POST /api/tokenizer`.
- UI: `/studio` — `src/lib/components/slide-studio/`.
- Env: `ZAI_API_KEY` required, `ZAI_BASE_URL` optional. Never read `~/.secrets.env` directly — source it into the shell before `pnpm dev`.

## Errors
- `401` from Z.ai: key missing or not exported into the dev server shell — re-source env and restart dev, do not hardcode keys.
- `Slide agent request failed (4xx/5xx)`: surface the first 300 chars of the upstream body, then retry once with a shorter prompt.
- Empty stream / no `conversation_id`: the job went async — poll `GET {BASE}/agents/async-result/{async_id}`.
- Type error `defaultObjectGenerationMode missing`: a V4 provider leaked into ai-v4 code — remove it, use the OpenAI-compatible baseURL.
