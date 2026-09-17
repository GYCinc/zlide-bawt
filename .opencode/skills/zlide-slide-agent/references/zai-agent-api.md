# Z.ai Agent API — raw contract

Base: `https://api.z.ai/api/paas/v4` (override via `ZAI_BASE_URL`). Auth: `Authorization: Bearer $ZAI_API_KEY`.

## Generate (streaming SSE)
`POST {BASE}/agents`
```json
{
  "agent_id": "slides_glm_agent",
  "stream": true,
  "conversation_id": "optional-for-refinement",
  "messages": [{ "role": "user", "content": [{ "type": "text", "text": "..." }] }]
}
```
Response: `text/event-stream`, `data:` lines with `{ choices: [{ message: { phase, content: [{ text }] } }], conversation_id, usage }`. Phases: `thinking`, `tool`, `answer`. Terminal: `data: [DONE]`. Tool names inside tool-phase text: `search`, `insert_page`, `remove_slides`, `access_page`, `modify_page`.

## Async poll (long jobs)
`GET {BASE}/agents/async-result/{async_id}`

## Export (hidden custom_variables)
`POST {BASE}/agents/export`
```json
{
  "agent_id": "slides_glm_agent",
  "conversation_id": "...",
  "custom_variables": { "include_html": true, "include_pdf": true }
}
```

## Tokenizer (server-side only)
`POST {BASE}/tokenizer`
```json
{ "model": "glm-5.3", "messages": [{ "role": "user", "content": "..." }] }
```
Returns `{ usage: { prompt_tokens, completion_tokens, total_tokens } }`.
