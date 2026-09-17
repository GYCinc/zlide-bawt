/**
 * GLM Slide/Poster Agent — raw HTTP client.
 *
 * TRUTH #1 (from the investigative deep-dives): the Z.ai SDKs have NO method
 * for agent_id-based calls. `client.chat.completions.create()` knows nothing
 * of `agent_id`, `conversation_id`, or the SSE phases (thinking/tool/answer).
 * So the slide agent is driven here with plain fetch — the SDK and the agent
 * are strangers by day…
 *
 * …but they dabble on naughty nights: same API key, same base URL, and the
 * chat-completions side (via @ai-sdk/zai) feeds this agent charts, outlines
 * and structured content in the two-stage pipeline.
 *
 * HIDDEN SECRETS honoured here (reverse-engineered, handle with care):
 * - 5 tools, not 3: search, insert_page, remove_slides + access_page, modify_page
 * - export custom_variables: include_html, include_pdf
 * - async-result endpoint for polling long jobs
 * - conversation_id persistence = multi-turn refinement + "time machine"
 * - poster mode = aspect-ratio switch, not a different agent
 */

import { ZAI_API_KEY, ZAI_BASE_URL } from '$env/static/private';
import { buildTemplateContract, type TemplateId } from './templates';
import { iterateSseEvents } from './sse';

const BASE_URL = (ZAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4').replace(/\/$/, '');

/** Pay-as-you-go price of the slide agent flow: $0.7 per 1M tokens. */
export const SLIDE_TOKEN_PRICE_PER_M = 0.7;

export type SlideMode = 'slide' | 'poster';

export type AgentPhase = 'thinking' | 'tool' | 'answer';

export interface SlideGenerateOptions {
	/** One-sentence need, e.g. "a big-model market analysis PPT for an AI startup". */
	prompt: string;
	mode?: SlideMode;
	/** Desired page count — the agent honours explicit pagination requests. */
	pageCount?: number;
	/** Style keywords that actually move the model, e.g. "minimalist, dark, generous whitespace". */
	style?: string;
	/** Pass back to continue the same deck (multi-turn refine). Omit for a fresh deck. */
	conversationId?: string;
	/** Template seed: a built-in shell/outline the agent fills (see templates.ts). */
	templateId?: TemplateId;
	/** Custom template body (HTML or JSON) when templateId === 'custom'. */
	customTemplate?: string;
	/** Turbo V's brief for a user-supplied image — woven into the prompt. */
	imageBrief?: string;
	/** Optional signal forwarded to fetch for cancellation. */
	signal?: AbortSignal;
}

export interface AgentEvent {
	phase: AgentPhase;
	/** Tool name when phase === 'tool' (search | insert_page | remove_slides | access_page | modify_page). */
	tool?: string;
	/** Slide positions touched, when the tool manipulates pages. */
	position?: number[];
	/** Incremental text/HTML fragment. */
	text: string;
	/** Present on the terminal answer event. */
	conversationId?: string;
	/** Present on the terminal answer event. */
	usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface SlidePromptParts {
	topic: string;
	mode: SlideMode;
	pageCount: number;
	style: string;
	templateId?: TemplateId;
	customTemplate?: string;
	imageBrief?: string;
}

/** Style keywords proven to steer the agent's layout engine. */
export const STYLE_PRESETS = [
	'minimalist, generous whitespace, Inter-like type',
	'bold startup pitch, high contrast, big numbers',
	'academic, serif headings, muted palette, structured sections',
	'playful poster, vibrant gradient, oversized headline',
	'dark tech keynote, neon accents, cinematic imagery'
] as const;

/**
 * Anatomy of a perfect slide prompt: topic + purpose + audience + pagination
 * + style + output contract (self-contained HTML, inline CSS). Posters add an
 * explicit single-canvas aspect-ratio instruction.
 */
export function buildSlidePrompt({
	topic,
	mode,
	pageCount,
	style,
	templateId = 'none',
	customTemplate = '',
	imageBrief = ''
}: SlidePromptParts): string {
	const pages =
		mode === 'poster'
			? `Design ONE single-canvas poster (portrait 3:4 aspect, no pagination).`
			: `Create exactly ${pageCount} slides (16:9 landscape, one idea per slide: cover, agenda, body, data, closing).`;
	const contract = buildTemplateContract(templateId, customTemplate);
	return [
		`Topic: ${topic}.`,
		pages,
		`Visual style: ${style}.`,
		`Use the web-search tool for fresh, accurate facts; weave key numbers into charts and callouts.`,
		imageBrief
			? `SOURCE IMAGE BRIEF (translate this into the visuals): ${imageBrief}`
			: ``,
		contract,
		mode === 'poster'
			? `If you animate, request it now: subtle entrance motion only, print-safe fallback.`
			: `Cover + closing must carry the topic title; keep text scannable (headline + 3 bullets max per slide).`,
		`Output self-contained HTML with inline CSS so it can be previewed and exported as-is.`
	]
		.filter(Boolean)
		.join(' ');
}

function headers(): Record<string, string> {
	return {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${ZAI_API_KEY}`
	};
}

function toAgentEvent(raw: unknown): AgentEvent | null {
	if (!raw || typeof raw !== 'object') return null;
	const msg = (raw as { choices?: Array<{ message?: Record<string, unknown> }> }).choices?.[0]
		?.message;
	if (!msg || typeof msg !== 'object') return null;
	const phase = (msg['phase'] as AgentPhase | undefined) ?? 'answer';
	const content = (msg['content'] as Array<{ type?: string; text?: string }> | undefined) ?? [];
	const text = content
		.filter((c) => typeof c?.text === 'string')
		.map((c) => c.text as string)
		.join('');
	// Tool calls surface inside the content blocks of tool-phase messages.
	const toolMatch = text.match(/"(search|insert_page|remove_slides|access_page|modify_page)"/);
	return {
		phase,
		tool: toolMatch?.[1],
		text,
		conversationId: (raw as { conversation_id?: string }).conversation_id,
		usage: (raw as { usage?: AgentEvent['usage'] }).usage
	};
}

/**
 * Invoke slides_glm_agent with streaming. Yields thinking/tool/answer events
 * in order; the final answer event carries conversationId + usage.
 */
export async function* streamSlideAgent(
	options: SlideGenerateOptions
): AsyncGenerator<AgentEvent, void, void> {
	const {
		prompt,
		mode = 'slide',
		pageCount = 8,
		style = STYLE_PRESETS[0],
		conversationId,
		templateId = 'none',
		customTemplate = '',
		imageBrief = ''
	} = options;
	const res = await fetch(`${BASE_URL}/agents`, {
		method: 'POST',
		headers: headers(),
		signal: options.signal,
		body: JSON.stringify({
			agent_id: 'slides_glm_agent',
			stream: true,
			...(conversationId ? { conversation_id: conversationId } : {}),
			messages: [
				{
					role: 'user',
					content: [
						{
							type: 'text',
							text: buildSlidePrompt({
								topic: prompt,
								mode,
								pageCount,
								style,
								templateId,
								customTemplate,
								imageBrief
							})
						}
					]
				}
			]
		})
	});

	if (!res.ok || !res.body) {
		const detail = await res.text().catch(() => '');
		throw new Error(`Slide agent request failed (${res.status}): ${detail.slice(0, 300)}`);
	}

	// Block-true streaming: complete events only, shredded chunks never parsed.
	// And the stream must SPEAK: upstream silence is an error, not a deck.
	let heard = false;
	for await (const payload of iterateSseEvents(res.body)) {
		try {
			const event = toAgentEvent(JSON.parse(payload));
			if (event && (event.text || event.conversationId)) {
				heard = true;
				yield event;
			}
		} catch {
			// Complete block, malformed JSON — skip, the stream continues.
		}
	}
	if (!heard) throw new Error('Slide agent returned silence (zero events) — check prompt and model.');
}

/** Poll a long-running job via the overlooked async-result endpoint. */
export async function getAsyncResult<T = unknown>(asyncId: string): Promise<T> {
	const res = await fetch(`${BASE_URL}/agents/async-result/${asyncId}`, { headers: headers() });
	if (!res.ok) throw new Error(`async-result poll failed (${res.status})`);
	return (await res.json()) as T;
}

export type ExportFormat = 'html' | 'pdf';

/**
 * Export a finished conversation. The hidden custom_variables —
 * include_html / include_pdf — decide which artefacts come back.
 */
export async function exportSlides(
	conversationId: string,
	format: ExportFormat = 'pdf'
): Promise<Response> {
	return fetch(`${BASE_URL}/agents/export`, {
		method: 'POST',
		headers: headers(),
		body: JSON.stringify({
			agent_id: 'slides_glm_agent',
			conversation_id: conversationId,
			custom_variables: {
				include_html: format === 'html',
				include_pdf: format === 'pdf'
			}
		})
	});
}

/** USD cost for a token count at the slide-agent meter. */
export function estimateCost(totalTokens: number): number {
	return (totalTokens / 1_000_000) * SLIDE_TOKEN_PRICE_PER_M;
}
