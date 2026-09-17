/**
 * Template catalog — where the templates live.
 *
 * THE LAW OF TEMPLATES (from the investigative scrolls): the slide agent has
 * NO saved-template store ("Template saving: No — must implement externally").
 * What it DOES do — confirmed in §6 Template Hacking and §8.2 Template Seed —
 * is pick up templates you feed it: an HTML shell whose classes/structure it
 * preserves while filling content, or a JSON outline it translates into
 * slides. So templates live HERE, in this house, and ride inside the prompt
 * as a fill-this contract (see buildTemplateContract). HTML and JSON both.
 */

export type TemplateId = 'none' | 'slide-shell' | 'poster-shell' | 'json-outline' | 'custom';

export interface SlideTemplate {
	id: Exclude<TemplateId, 'none' | 'custom'>;
	label: string;
	kind: 'html' | 'json';
	body: string;
}

export const TEMPLATES: SlideTemplate[] = [
	{
		id: 'slide-shell',
		label: 'Minimal slide shell (HTML)',
		kind: 'html',
		body: `<section class="zl-cover"><h1>{{title}}</h1><p class="zl-sub">{{subtitle}}</p></section>
<section class="zl-body"><h2>{{headline}}</h2><ul><li>{{point}}</li></ul><figure class="zl-chart">{{chart}}</figure></section>
<section class="zl-close"><h2>{{title}}</h2><p>{{takeaway}}</p></section>
<style>:root{--zl-accent:#4f46e5;--zl-ink:#111827;--zl-bg:#ffffff}</style>`
	},
	{
		id: 'poster-shell',
		label: 'Poster canvas (HTML)',
		kind: 'html',
		body: `<article class="zl-poster"><header><h1>{{headline}}</h1></header><section class="zl-stats"><div>{{stat}}</div></section><footer>{{cta}}</footer></article>
<style>:root{--zl-accent:#db2777;--zl-ink:#18181b;--zl-bg:#fafafa}.zl-poster{aspect-ratio:3/4}</style>`
	},
	{
		id: 'json-outline',
		label: 'Deck outline (JSON)',
		kind: 'json',
		body: `{"title":"","slides":[{"headline":"","bullets":[],"chart":null}],"closing":""}`
	}
];

/**
 * The fill-this contract: instructs the agent to preserve the template's
 * structure/classes/keys and replace every {{placeholder}} (or empty JSON
 * value) with researched, styled content. Custom text is used verbatim.
 */
export function buildTemplateContract(templateId: TemplateId, customTemplate?: string): string {
	if (templateId === 'none') return '';
	const body =
		templateId === 'custom'
			? (customTemplate ?? '').slice(0, 8000)
			: (TEMPLATES.find((t) => t.id === templateId)?.body ?? '');
	if (!body.trim()) return '';
	const kind = templateId === 'custom' ? 'template' : (TEMPLATES.find((t) => t.id === templateId)?.kind ?? 'template');
	return [
		`TEMPLATE CONTRACT — fill this ${kind}, do not redesign it:`,
		kind === 'json'
			? `Translate the topic into this exact JSON shape, filling every empty value with researched content:`
			: `Preserve every class, tag and CSS variable below. Replace each {{placeholder}} with researched, styled content:`,
		body
	].join('\n');
}
