<script lang="ts">
	let { html, mode }: { html: string; mode: 'slide' | 'poster' } = $props();

	/* THE ANTI-JERK LAW: srcdoc re-mounts the whole document. Updating it per
	   answer chunk = a reload storm. Throttle to one paint per ~350ms (trailing
	   edge), flush the final paint when the stream rests. The iframe's internal
	   scroll anchor also dies on remount — throttling is what keeps it alive. */
	let paintedHtml = $state('');
	let painting = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		void html;
		if (timer) return; // a paint is already scheduled — trailing edge wins
		painting = true;
		timer = setTimeout(() => {
			timer = undefined;
			paintedHtml = html;
			painting = false;
		}, 350);
	});

	$effect(() => {
		// Unmount hygiene: never paint after death.
		return () => {
			if (timer) clearTimeout(timer);
		};
	});

	const ready = $derived(paintedHtml.length > 0);
</script>

<div
	class="relative overflow-hidden rounded-xl border bg-white"
	class:aspect-video={mode === 'slide'}
	class:mx-auto={mode === 'poster'}
	class:max-w-sm={mode === 'poster'}
>
	{#if ready}
		<iframe
			title="Slide preview"
			sandbox="allow-same-origin"
			srcdoc={paintedHtml}
			class="size-full min-h-[420px] w-full border-0"
		></iframe>
		{#if painting}
			<!-- Whisper, not a scream: a corner breath while the next paint waits -->
			<div
				class="absolute right-2 top-2 size-2 animate-pulse rounded-full bg-primary/60"
				aria-hidden="true"
			></div>
		{/if}
	{:else}
		<div
			class="flex size-full min-h-[420px] flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground"
		>
			<p class="text-3xl">🖼️</p>
			<p>
				Your {mode === 'slide' ? 'slides (16:9 landscape)' : 'poster (3:4 portrait canvas)'} will
				render here — painted smoothly, never mid-chunk.
			</p>
		</div>
	{/if}
</div>
