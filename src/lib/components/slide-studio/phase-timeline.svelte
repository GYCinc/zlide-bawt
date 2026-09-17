<script lang="ts">
	export interface PhaseEvent {
		phase: 'thinking' | 'tool' | 'answer';
		tool?: string;
		text: string;
	}

	let { events }: { events: PhaseEvent[] } = $props();

	/* Rendered 1:1 from the event array — no coalescing, no index mangling.
	   Each fragment is a card; the last index is the live turn. */
	const cards = $derived(events);

	/* Fixed-stage transform carousel — no native scroll, no rAF.
	   Focal-Switching Engine: focalIndex + explicit live lock. */
	let isLiveLocked = $state(true);
	let focalIndex = $state(0);
	let lastTurnCount = $state(0);
	let selectedIdx = $state<number | null>(null);
	let idleTimer: ReturnType<typeof setTimeout> | undefined;
	let wheelLock = false;

	const IDLE_MS = 6500;
	const CARD_PX = 48;

	function armIdle() {
		clearTimeout(idleTimer);
		if (!isLiveLocked) {
			idleTimer = setTimeout(() => (isLiveLocked = true), IDLE_MS);
		}
	}

	$effect(() => {
		if (cards.length > lastTurnCount) {
			lastTurnCount = cards.length;
			if (isLiveLocked) {
				focalIndex = cards.length - 1;
			}
		}
	});

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		if (wheelLock || cards.length === 0) return;
		if (Math.abs(e.deltaY) < 16) return;

		wheelLock = true;
		setTimeout(() => (wheelLock = false), 80);

		if (e.deltaY < 0) {
			// Wheel up -> older cards
			isLiveLocked = false;
			focalIndex = Math.max(0, focalIndex - 1);
			armIdle();
		} else {
			// Wheel down -> newer cards
			focalIndex = Math.min(cards.length - 1, focalIndex + 1);
			if (focalIndex === cards.length - 1) {
				isLiveLocked = true; // proximity lock
				clearTimeout(idleTimer);
			}
		}
	}

	function selectTurn(i: number) {
		// Selection NEVER touches focalIndex — the card stays in place.
		selectedIdx = selectedIdx === i ? null : i;
		if (selectedIdx !== null) {
			isLiveLocked = false;
		}
		armIdle();
	}

	$effect(() => () => clearTimeout(idleTimer));

	export function reengageLive() {
		isLiveLocked = true;
		focalIndex = Math.max(0, cards.length - 1);
		clearTimeout(idleTimer);
	}
</script>

<div class="relative" onpointermove={armIdle} role="group" aria-label="Agent phases">
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="relative h-72 overflow-hidden rounded-xl border"
		onwheel={handleWheel}
	>
		{#if cards.length === 0}
			<div
				class="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground"
			>
				Phases appear here — <span class="mx-1 font-medium">thinking</span> →
				<span class="mx-1 font-medium">tool</span> →
				<span class="mx-1 font-medium">answer</span>. Click a turn to hold it.
			</div>
		{:else}
			{#each cards as c, i (i)}
				{@const diff = i - focalIndex}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
				<article
					class="phase-card relative flex h-12 items-start gap-2 rounded-lg border bg-card px-3 py-1 text-xs"
					class:is-selected={selectedIdx === i}
					style:transform="translateY({diff * CARD_PX}px) translateX({selectedIdx === i ? 6 : 0}px) scale({diff === 0 ? 1 : 0.96})"
					style:opacity="{diff === 0 ? 1 : Math.max(0.2, 1 - Math.abs(diff) * 0.25)}"
					style:z-index="{100 - Math.abs(diff)}"
					onclick={() => selectTurn(i)}
				>
					<!-- LIVE STATUS belongs to the last index in the data array, never
				     to the focal slot: historical turns are never orange. -->
				{#if c.phase === 'tool'}
					<span
						class="mt-px flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold {i === cards.length - 1
							? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
							: 'bg-muted text-muted-foreground'}"
						aria-hidden="true">T</span
					>
				{:else if c.phase === 'answer'}
					<span
						class="mt-px flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold {i === cards.length - 1
							? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
							: 'bg-muted text-muted-foreground'}"
						aria-hidden="true">A</span
					>
				{:else}
					<span
						class="mt-1.5 size-2 shrink-0 rounded-full {i === cards.length - 1
							? 'bg-orange-500'
							: 'bg-muted-foreground/40'}"
						aria-hidden="true"></span>
				{/if}
					<p class="line-clamp-2 leading-4 text-muted-foreground">{c.text.slice(0, 400)}</p>
				</article>
			{/each}
		{/if}
	</div>

	{#if !isLiveLocked && cards.length > 0}
		<span
			class="pointer-events-none absolute inset-x-0 bottom-2 mx-auto w-fit rounded-full border bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur"
		>
			reading history — live resumes in a breath ⏳
		</span>
	{/if}
</div>

<style>
	/* Pure transform stage: movement lives entirely in CSS.
	   Center-anchored — the focal card rests mid-stage with history above
	   and subsequent turns below; no card smashes the bottom edge. */
	.phase-card {
		position: absolute;
		bottom: calc(50% - 24px);
		left: 0.25rem;
		right: 0.25rem;
		overflow: hidden;
		cursor: pointer;
		transition:
			transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
			opacity 0.3s ease;
		will-change: transform, opacity;
	}
	.phase-card.is-selected {
		/* transform stays owned by the inline style — both axes live there.
		   This rule only decorates: border, shadow, stacking. */
		border-color: hsl(var(--primary));
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.14);
		z-index: 100;
	}
	@media (prefers-reduced-motion: reduce) {
		.phase-card {
			transition: none;
		}
	}
</style>
