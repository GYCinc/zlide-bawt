import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { allowAnonymousChats } from '$lib/utils/constants.js';
import { streamSlideAgent } from '$lib/server/zai/slide-agent';
import { describeImageForSlides, VISION_PRICE_PER_M } from '$lib/server/zai/vision';

const schema = z.object({
	prompt: z.string().min(3).max(2000),
	mode: z.enum(['slide', 'poster']).default('slide'),
	pageCount: z.number().int().min(1).max(30).default(8),
	style: z.string().max(300).optional(),
	conversationId: z.string().max(128).optional(),
	templateId: z.enum(['none', 'slide-shell', 'poster-shell', 'json-outline', 'custom']).default('none'),
	customTemplate: z.string().max(8000).optional(),
	// STAGE 0 — the Turbo V look. Big money next to Flash: an image WITHOUT
	// visionConsent === true is rejected here, in code. Permission is law.
	imageDataUrl: z.string().max(4_500_000).optional(),
	visionConsent: z.boolean().default(false)
});

/**
 * POST /api/slides/generate — Server-Sent Events passthrough.
 * Events: `phase` (thinking|tool|answer text fragments), `done` (conversationId + usage + vision).
 * Send `conversationId` back on the next call to refine the same deck multi-turn.
 */
export async function POST({ request, locals: { user } }: { request: Request; locals: { user: unknown } }) {
	// The streaming sword is not wielded by just anyone.
	if (!user && !allowAnonymousChats) error(401, 'Unauthorized');

	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, parsed.error.issues[0]?.message ?? 'Invalid request');

	const {
		prompt,
		mode,
		pageCount,
		style,
		conversationId,
		templateId,
		customTemplate,
		imageDataUrl,
		visionConsent
	} = parsed.data;

	if (imageDataUrl && !visionConsent) {
		error(400, 'Turbo V needs your permission: confirm the priced look before sending an image.');
	}

	const stream = new ReadableStream({
		async start(controller) {
			const enc = new TextEncoder();
			const send = (event: string, data: unknown) =>
				controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
			try {
				let lastConversationId = conversationId;
				let lastUsage: unknown = null;
				let imageBrief = '';
				let vision: { total_tokens: number; usd: number } | null = null;

				// Stage 0: the permitted look. Turbo V translates pixels → brief.
				if (imageDataUrl) {
					const seen = await describeImageForSlides(imageDataUrl, prompt);
					imageBrief = seen.brief;
					vision = {
						total_tokens: seen.usage.total_tokens,
						usd: (seen.usage.total_tokens / 1_000_000) * VISION_PRICE_PER_M
					};
					send('phase', {
						phase: 'tool',
						tool: 'turbo_v_look',
						text: `Turbo V saw: ${seen.brief.slice(0, 200)}`
					});
				}

				for await (const evt of streamSlideAgent({
					prompt,
					mode,
					pageCount,
					style,
					conversationId,
					templateId,
					customTemplate,
					imageBrief,
					signal: request.signal
				})) {
					if (evt.conversationId) lastConversationId = evt.conversationId;
					if (evt.usage) lastUsage = evt.usage;
					if (evt.text) send('phase', { phase: evt.phase, tool: evt.tool, text: evt.text });
				}
				send('done', { conversationId: lastConversationId, usage: lastUsage, vision });
			} catch (e) {
				send('error', { message: e instanceof Error ? e.message : 'Generation failed' });
			} finally {
				controller.close();
			}
		},
		cancel() {
			/* request.signal aborts the upstream fetch */
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}
