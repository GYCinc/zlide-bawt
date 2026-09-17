import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { allowAnonymousChats } from '$lib/utils/constants.js';
import { exportSlides } from '$lib/server/zai/slide-agent';

const schema = z.object({
	conversationId: z.string().min(1).max(128),
	format: z.enum(['html', 'pdf']).default('pdf')
});

/** POST /api/slides/export — forwards the hidden include_html/include_pdf contract. */
export async function POST({ request, locals: { user } }: { request: Request; locals: { user: unknown } }) {
	if (!user && !allowAnonymousChats) error(401, 'Unauthorized');

	const parsed = schema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, parsed.error.issues[0]?.message ?? 'Invalid request');

	const { conversationId, format } = parsed.data;
	const upstream = await exportSlides(conversationId, format).catch(() => null);
	if (!upstream || !upstream.ok) error(502, 'Export failed upstream');

	const ext = format === 'pdf' ? 'pdf' : 'html';
	return new Response(upstream.body, {
		headers: {
			'Content-Type': format === 'pdf' ? 'application/pdf' : 'text/html; charset=utf-8',
			'Content-Disposition': `attachment; filename="zlide-${conversationId.slice(0, 8)}.${ext}"`
		}
	});
}
