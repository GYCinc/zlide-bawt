/**
 * Turbo V — the seeing exception.
 *
 * DOCTRINE: Flash does everything. Turbo V (glm-4.5v, ~$1.20/M) does ONE
 * thing: LOOK at a user-supplied image and translate what it sees into a
 * compact brief the slide agent can turn into HTML. Big money next to
 * Flash's pocket change — so this module NEVER fires on its own. Callers
 * must present explicit user permission (visionConsent === true), enforced
 * again at the route. No consent, no look. That is the permission law.
 */

import { ZAI_API_KEY, ZAI_BASE_URL } from '$env/static/private';

const BASE_URL = (ZAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4').replace(/\/$/, '');

/** The only non-Flash model this house permits, and only when asked. */
export const VISION_MODEL = 'glm-4.5v';
/** USD per 1M tokens — ~1700x Flash's slide meter. Handle with permission. */
export const VISION_PRICE_PER_M = 1.2;

/** Cap data URLs at ~3MB so nobody bankrupts anyone by accident. */
const MAX_IMAGE_CHARS = 4_500_000;

const BRIEF_PROMPT = [
	'Describe this image for a slide/poster generator. Be compact and factual:',
	'1. Subject and scene. 2. Transcribe ALL visible text verbatim.',
	'3. Colors, mood, layout. 4. Any numbers, charts or logos.',
	'Output a short brief the slide agent can translate directly into HTML.'
].join(' ');

/** Look at an image (data URL or https URL); returns the brief plus metered usage. */
export async function describeImageForSlides(
	image: string,
	hint = ''
): Promise<{ brief: string; usage: { total_tokens: number } }> {
	const isUrl = image.startsWith('https://');
	const isData = image.startsWith('data:image/');
	if (!isUrl && !isData) throw new Error('Image must be a data URL or https URL');
	if (image.length > MAX_IMAGE_CHARS) throw new Error('Image too large (cap ~3MB)');

	const res = await fetch(`${BASE_URL}/chat/completions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${ZAI_API_KEY}`
		},
		body: JSON.stringify({
			model: VISION_MODEL,
			temperature: 0.2,
			max_tokens: 600,
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: hint ? `${BRIEF_PROMPT} Focus: ${hint}` : BRIEF_PROMPT },
						{ type: 'image_url', image_url: { url: image } }
					]
				}
			]
		})
	});
	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new Error(`Turbo V look failed (${res.status}): ${detail.slice(0, 200)}`);
	}
	const data = (await res.json()) as {
		choices?: Array<{ message?: { content?: string } }>;
		usage?: { total_tokens?: number };
	};
	const brief = data.choices?.[0]?.message?.content?.trim();
	if (!brief) throw new Error('Turbo V returned an empty brief');
	return { brief, usage: { total_tokens: data.usage?.total_tokens ?? 0 } };
}
