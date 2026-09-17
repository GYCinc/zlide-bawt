<script lang="ts">
	import { Button } from '../ui/button';
	import PhaseTimeline, { type PhaseEvent } from './phase-timeline.svelte';
	import SlidePreview from './slide-preview.svelte';
	import TokenMeter, { type Usage } from './token-meter.svelte';

	const STYLES = [
		'minimalist, generous whitespace, Inter-like type',
		'bold startup pitch, high contrast, big numbers',
		'academic, serif headings, muted palette, structured sections',
		'playful poster, vibrant gradient, oversized headline',
		'dark tech keynote, neon accents, cinematic imagery'
	];

	// Direct handle to the tether: notes focus calls reengageLive() imperatively.
	let timeline = $state<PhaseTimeline>();

	let prompt = $state('');
	let mode = $state<'slide' | 'poster'>('slide');
	let pageCount = $state(8);
	let style = $state(STYLES[0]);
	let refineText = $state('');
	let templateId = $state('none');
	let customTemplate = $state('');

	// The permitted eye: an image + a priced quote + explicit consent.
	let imageDataUrl = $state('');
	let imageName = $state('');
	let visionConsent = $state(false);
	let visionQuote = $state<{ image_tokens: number; usd: number } | null>(null);
	let vision = $state<{ total_tokens: number; usd: number } | null>(null);

	let status = $state<'idle' | 'streaming' | 'done' | 'error'>('idle');
	let currentPhase = $state<'thinking' | 'tool' | 'answer'>('thinking');
	let errorMsg = $state('');
	let events = $state<PhaseEvent[]>([]);
	let html = $state('');
	let conversationId = $state<string | undefined>(undefined);
	let usage = $state<Usage | null>(null);
	let estimate = $state<string>('');

	let abortController: AbortController | undefined;

	const canGenerate = $derived(prompt.trim().length >= 3 && status !== 'streaming');
	const phaseWord = $derived(
		currentPhase === 'thinking'
			? 'Thinking'
			: currentPhase === 'tool'
				? 'Researching & building slides'
				: 'Writing your deck'
	);

	function stop() {
		abortController?.abort();
		abortController = undefined;
		status = events.length > 0 ? 'done' : 'idle';
	}

	async function readSSE(res: Response) {
		const reader = res.body?.getReader();
		if (!reader) throw new Error('Empty stream');
		const decoder = new TextDecoder();
		let buffer = '';
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const chunks = buffer.split('\n\n');
			buffer = chunks.pop() ?? '';
			for (const chunk of chunks) {
				const lines = chunk.split('\n');
				const event = lines.find((l) => l.startsWith('event:'))?.slice(6).trim();
				const data = lines.find((l) => l.startsWith('data:'))?.slice(5).trim();
				if (!event || !data) continue;
				let payload: {
					phase?: PhaseEvent['phase'];
					tool?: string;
					text?: string;
					conversationId?: string;
					usage?: Usage;
					vision?: { total_tokens: number; usd: number };
					message?: string;
				};
				try {
					payload = JSON.parse(data);
				} catch {
					continue;
				}
				if (
					event === 'phase' &&
					(payload.phase === 'thinking' || payload.phase === 'tool' || payload.phase === 'answer')
				) {
					events.push({ phase: payload.phase, tool: payload.tool, text: payload.text ?? '' });
					currentPhase = payload.phase;
					if (payload.phase === 'answer') html += payload.text ?? '';
				} else if (event === 'done') {
					conversationId = payload.conversationId ?? conversationId;
					usage = payload.usage ?? usage;
					vision = payload.vision ?? vision;
				} else if (event === 'error') {
					throw new Error(payload.message ?? 'Generation failed');
				}
			}
		}
	}

	async function generate(refine?: string) {
		status = 'streaming';
		currentPhase = 'thinking';
		errorMsg = '';
		if (!refine) {
			events = [];
			html = '';
			usage = null;
			vision = null;
			conversationId = undefined;
		}
		abortController = new AbortController();
		try {
			const res = await fetch('/api/slides/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				signal: abortController.signal,
				body: JSON.stringify({
					prompt: refine ? `${prompt}\nRefinement: ${refine}` : prompt,
					mode,
					pageCount,
					style,
					conversationId,
					templateId,
					customTemplate: templateId === 'custom' ? customTemplate : undefined,
					imageDataUrl: visionConsent && imageDataUrl ? imageDataUrl : undefined,
					visionConsent
				})
			});
			if (!res.ok) throw new Error(`Studio request failed (${res.status})`);
			await readSSE(res);
			status = 'done';
			refineText = '';
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') return; // stopped on purpose
			status = 'error';
			errorMsg = e instanceof Error ? e.message : 'Generation failed';
		} finally {
			abortController = undefined;
		}
	}

	async function preflight() {
		estimate = 'counting…';
		try {
			const res = await fetch('/api/tokenizer', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: prompt })
			});
			if (!res.ok) throw new Error();
			const data = await res.json();
			estimate = `${data.total_tokens.toLocaleString()} tokens ≈ $${Number(data.estimated_usd).toFixed(4)}`;
		} catch {
			estimate = '';
		}
	}

	async function onImageFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		visionConsent = false;
		visionQuote = null;
		if (!file) {
			imageDataUrl = '';
			imageName = '';
			return;
		}
		if (file.size > 3 * 1024 * 1024) {
			errorMsg = 'Image too large — cap ~3MB.';
			status = 'error';
			return;
		}
		imageName = file.name;
		imageDataUrl = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = () => reject(new Error('Could not read file'));
			reader.readAsDataURL(file);
		});
	}

	async function priceLook() {
		visionQuote = null;
		visionConsent = false;
		if (!imageDataUrl) return;
		try {
			const res = await fetch('/api/tokenizer', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					text: prompt.trim() || 'Describe this image for slides',
					image: imageDataUrl
				})
			});
			if (!res.ok) throw new Error();
			const data = await res.json();
			visionQuote = {
				image_tokens: data.image_tokens ?? 0,
				usd: Number(data.vision_look_usd ?? 0)
			};
		} catch {
			errorMsg = 'Meter unreachable — the look cannot be priced, so it cannot be permitted.';
			status = 'error';
		}
	}

	async function exportAs(format: 'html' | 'pdf') {
		if (!conversationId) return;
		const res = await fetch('/api/slides/export', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ conversationId, format })
		});
		if (!res.ok) return;
		const blob = await res.blob();
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `zlide-${conversationId.slice(0, 8)}.${format}`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-8">
	<!-- Header: logo, name, one line. Nothing else. -->
	<header class="flex items-center gap-3">
		<img src="/favicon.png" alt="Zlide" class="size-10 rounded-lg" />
		<div>
			<h1 class="text-xl font-semibold tracking-tight">Zlide Studio</h1>
			<p class="text-xs text-muted-foreground">One sentence in. A deck or poster out.</p>
		</div>
	</header>

	<!-- Compose: everything you need, in one quiet card -->
	<section class="flex flex-col gap-3 rounded-2xl border bg-card p-4">
		<textarea
			bind:value={prompt}
			rows="3"
			onfocus={() => timeline?.reengageLive()}
			placeholder="Describe what you need — e.g. “a market-analysis deck for my AI startup”"
			class="resize-none rounded-xl border bg-background p-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
		></textarea>

		<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
			<div
				class="flex overflow-hidden rounded-lg border"
				role="group"
				aria-label="Output mode"
			>
				<button
					class="px-3 py-1.5 transition-all duration-200 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-95 {mode === 'slide'
						? 'bg-primary text-primary-foreground'
						: ''}"
					onclick={() => (mode = 'slide')}>Slides</button
				>
				<button
					class="px-3 py-1.5 transition-all duration-200 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-95 {mode === 'poster'
						? 'bg-primary text-primary-foreground'
						: ''}"
					onclick={() => (mode = 'poster')}>Poster</button
				>
			</div>
			{#if mode === 'slide'}
				<label class="flex items-center gap-2 text-muted-foreground">
					Pages
					<input
						type="number"
						bind:value={pageCount}
						min="1"
						max="30"
						class="w-14 rounded-lg border bg-background px-2 py-1 text-foreground"
					/>
				</label>
			{/if}
			<select
				bind:value={style}
				class="min-w-0 flex-1 rounded-lg border bg-background px-2 py-1.5"
				aria-label="Visual style"
			>
				{#each STYLES as s (s)}
					<option value={s}>{s}</option>
				{/each}
			</select>
		</div>

		<!-- Advanced: template + image, folded away until wanted -->
		<details class="group text-sm">
			<summary
				class="cursor-pointer list-none text-xs text-muted-foreground transition-colors hover:text-foreground"
			>
				⚙ Advanced — template & image
			</summary>
			<div class="mt-3 flex flex-col gap-3 border-t pt-3">
				<div class="flex flex-wrap items-center gap-2">
					<select
						bind:value={templateId}
						class="min-w-0 flex-1 rounded-lg border bg-background px-2 py-1.5"
						aria-label="Template"
					>
						<option value="none">No template — free design</option>
						<option value="slide-shell">Minimal slide shell (HTML)</option>
						<option value="poster-shell">Poster canvas (HTML)</option>
						<option value="json-outline">Deck outline (JSON)</option>
						<option value="custom">Custom paste…</option>
					</select>
				</div>
				{#if templateId === 'custom'}
					<textarea
						bind:value={customTemplate}
						rows="4"
						placeholder="Paste an HTML shell or JSON outline — the agent fills it, never redesigns it"
						class="resize-none rounded-xl border bg-background p-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
					></textarea>
				{/if}
				<div class="flex flex-wrap items-center gap-2">
					<input type="file" accept="image/*" onchange={onImageFile} class="text-xs" />
					{#if imageDataUrl}
						<img src={imageDataUrl} alt={imageName} class="h-10 w-10 rounded object-cover" />
						{#if !visionQuote}
							<Button onclick={priceLook} variant="outline" size="sm">Price the look</Button>
						{:else if !visionConsent}
							<Button size="sm" onclick={() => (visionConsent = true)}>
								Allow ${visionQuote.usd.toFixed(4)} look
							</Button>
						{:else}
							<span class="text-xs text-muted-foreground">✓ image permitted</span>
						{/if}
					{/if}
				</div>
			</div>
		</details>

		<!-- Action row: hint left, buttons right -->
		<div class="flex items-center justify-between gap-3">
			<span class="truncate text-xs text-muted-foreground">
				{#if estimate}
					{estimate} · $0.7/M
				{:else}
					Deck streams live — stop anytime to keep the good slides.
				{/if}
			</span>
			<div class="flex shrink-0 gap-2">
				{#if status === 'streaming'}
					<Button variant="outline" onclick={stop}>■ Stop</Button>
				{:else}
					<Button variant="outline" onclick={preflight} disabled={!canGenerate}>Estimate</Button>
					<Button onclick={() => generate()} disabled={!canGenerate}>Generate</Button>
				{/if}
			</div>
		</div>
	</section>

	{#if status === 'error'}
		<p class="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
			{errorMsg}
		</p>
	{/if}

	<!-- Results -->
	{#if events.length > 0 || status === 'done'}
		<div class="flex flex-col gap-4">
			{#if status === 'streaming'}
				<div class="flex items-center gap-2 text-xs text-muted-foreground">
					<span class="inline-block size-2 animate-pulse rounded-full bg-primary"></span>
					{phaseWord}…
				</div>
			{/if}

			<SlidePreview {html} {mode} />

			{#if conversationId && status !== 'streaming'}
				<div class="flex flex-wrap items-center gap-2">
					<input
						bind:value={refineText}
						onfocus={() => timeline?.reengageLive()}
						placeholder="Refine — e.g. “make slide 3 a bar chart, darker theme”"
						class="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
					/>
					<Button
						variant="outline"
						onclick={() => generate(refineText)}
						disabled={!refineText.trim()}>Refine</Button
					>
					<Button variant="outline" onclick={() => exportAs('pdf')} disabled={!conversationId}
						>PDF</Button
					>
					<Button variant="outline" onclick={() => exportAs('html')} disabled={!conversationId}
						>HTML</Button
					>
				</div>
			{/if}

			<details class="rounded-xl border">
				<summary
					class="cursor-pointer list-none px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
				>
					Agent activity ({events.length} steps) & token meter
				</summary>
				<div class="flex flex-col gap-3 border-t p-3">
					<PhaseTimeline bind:this={timeline} {events} />
					<TokenMeter {usage} {vision} />
				</div>
			</details>
		</div>
	{/if}
</div>
