import { createOpenAI } from '@ai-sdk/openai';
import { customProvider } from 'ai';
import { OPENAI_API_KEY, ZAI_API_KEY } from '$env/static/private';

const openai = createOpenAI({ apiKey: OPENAI_API_KEY });
// EXORCISM NOTE: `@ai-sdk/zai` was tried here first — every published
// generation speaks LanguageModelV4 (ai v5 spec) while this house runs ai v4
// (LanguageModelV1). The demon was real. The blessed passage, straight from
// the Z.ai docs ("OpenAI SDK Compatibility"), is the OpenAI-compatible wire
// protocol at /paas/v4 — the same blood the slide agent endpoint shares on
// its naughty nights. GLM models ride it with zero new dependencies, and the
// slide agent itself still goes raw HTTP (no SDK wraps agent_id) — see
// $lib/server/zai/slide-agent.ts.
const zai = createOpenAI({
	apiKey: ZAI_API_KEY,
	baseURL: 'https://api.z.ai/api/paas/v4'
});

// THE LAW: nothing thinks here but GLM-5.3-Flash. Verified alive on chat,
// verified true on the token meter (23 tokens for a test line), and the whole
// hack is the price — a preflight costs $0.0000175, ~250 huge PDFs for $3.
// Calling bigger money is stupid. The ONE exception is Turbo V (glm-4.5v,
// ~$1.20/M): it can LOOK at images and translate them for the slide agent —
// and it fires only with explicit user permission, gated in code
// (see $lib/server/zai/vision.ts + the generate route's visionConsent).
const flash = zai('glm-5.3-flash');

export const myProvider = customProvider({
	languageModels: {
		'chat-model-glm-flash': flash,
		// Legacy ids resolve to Flash so old cookies never crash —
		// and never again summon anything expensive.
		'chat-model-glm': flash,
		'chat-model-small': flash,
		'chat-model-large': flash,
		'chat-model-reasoning': flash,
		'title-model': flash,
		'artifact-model': flash
	},
	imageModels: {
		// Dormant. No flow in this house calls them; they stay unlit.
		'small-model': openai.image('dall-e-2'),
		'large-model': openai.image('dall-e-3')
	}
});
