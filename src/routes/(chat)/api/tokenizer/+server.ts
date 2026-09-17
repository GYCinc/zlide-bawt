import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { allowAnonymousChats } from '$lib/utils/constants.js';
import { estimateTokens } from '$lib/server/zai/tokenizer';

const schema = z.object({
	text: z.string().min(1).max(50_000),
	model: z.string().max(64).default('glm-5.3-flash'),
	// Optional image: the meter prices the Turbo V look (image_tokens + vision_look_usd).
	image: z.string().max(4_500_000).optional()
});

/** POST /api/tokenizer — server-side token count + $0.7/M cost preview. */
export async function POST({ request, locals: { user } }: { request: Request; locals: { user: unknown } }) {
	if (!user && !allowAnonymousChats) error(401, 'Unauthorized');

	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, parsed.error.issues[0]?.message ?? 'Invalid request');

	try {
		return Response.json(
			await estimateTokens(parsed.data.text, parsed.data.model, parsed.data.image)
		);
	} catch (e) {
		error(502, e instanceof Error ? e.message : 'Tokenizer failed');
	}
}
