<script lang="ts">
	export interface Usage {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	}

	export interface VisionSpend {
		total_tokens: number;
		usd: number;
	}

	let { usage, vision = null }: { usage: Usage | null; vision: VisionSpend | null } = $props();

	const cost = $derived(usage ? (usage.total_tokens / 1_000_000) * 0.7 : null);
	const decksPerDollar = $derived(
		cost !== null && cost > 0 ? Math.floor(1 / cost).toLocaleString() : null
	);
</script>

<div class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-3 py-2 text-xs">
	<span class="font-medium">⛽ Token meter</span>
	{#if usage}
		<span
			>{usage.total_tokens.toLocaleString()} tokens (in {usage.prompt_tokens.toLocaleString()} /
			out {usage.completion_tokens.toLocaleString()})</span
		>
		<span class="font-medium">≈ ${cost?.toFixed(4)} @ $0.7/M</span>
		{#if decksPerDollar}
			<span class="text-muted-foreground">≈ {decksPerDollar} decks per dollar</span>
		{/if}
	{:else}
		<span class="text-muted-foreground">usage + cost land here after generation</span>
	{/if}
	{#if vision}
		<span class="font-medium">👁 look: ${vision.usd.toFixed(4)}</span>
	{/if}
</div>
