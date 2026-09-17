/**
 * Z.ai Tokenizer — server-side only, and deliberately so.
 *
 * Flash prices EVERYTHING: text (prompt_tokens) and images (image_tokens —
 * verified: a 1px PNG meters 640 image_tokens). So one meter serves both the
 * $0.7/M slide flow and the $1.20/M Turbo V look. No client tokenizer, no
 * native demons, never leaves the server.
 */

import { ZAI_API_KEY, ZAI_BASE_URL } from '$env/static/private';
import { SLIDE_TOKEN_PRICE_PER_M } from './slide-agent';
import { VISION_PRICE_PER_M } from './vision';

const BASE_URL = (ZAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4').replace(/\/$/, '');

export interface TokenEstimate {
	model: string;
	prompt_tokens: number;
	image_tokens: number;
	total_tokens: number;
	/** USD at the $0.7/M slide-agent meter. */
	estimated_usd: number;
	/** USD for one Turbo V look at this image (~600 completion tokens for the brief). Null when no image. */
	vision_look_usd: number | null;
}

/** Approx completion tokens in a Turbo V brief. */
const VISION_BRIEF_COMPLETION = 600;

export async function estimateTokens(
	text: string,
	model = 'glm-5.3-flash',
	image?: string
): Promise<TokenEstimate> {
	const content: Array<Record<string, unknown>> = [{ type: 'text', text }];
	if (image) {
		if (!image.startsWith('data:image/') && !image.startsWith('https://'))
			throw new Error('Image must be a data URL or https URL');
		if (image.length > 4_500_000) throw new Error('Image too large (cap ~3MB)');
		content.push({ type: 'image_url', image_url: { url: image } });
	}
	const res = await fetch(`${BASE_URL}/tokenizer`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${ZAI_API_KEY}`
		},
		body: JSON.stringify({ model, messages: [{ role: 'user', content }] })
	});
	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new Error(`Tokenizer request failed (${res.status}): ${detail.slice(0, 300)}`);
	}
	const data = (await res.json()) as {
		usage?: { prompt_tokens?: number; image_tokens?: number; total_tokens?: number };
	};
	const prompt_tokens = data.usage?.prompt_tokens ?? 0;
	const image_tokens = data.usage?.image_tokens ?? 0;
	const total_tokens = data.usage?.total_tokens ?? prompt_tokens + image_tokens;
	// Misfortune to those who accept API: a 200 with zero usage is a lie
	// (seen with model codes the meter doesn't know). Name it, don't print $0.
	if (total_tokens === 0 && (text.trim() || image)) {
		throw new Error('Meter returned zero tokens — it does not know this model; use glm-5.3-flash.');
	}
	return {
		model,
		prompt_tokens,
		image_tokens,
		total_tokens,
		estimated_usd: (total_tokens / 1_000_000) * SLIDE_TOKEN_PRICE_PER_M,
		vision_look_usd: image
			? ((total_tokens + VISION_BRIEF_COMPLETION) / 1_000_000) * VISION_PRICE_PER_M
			: null
	};
}
