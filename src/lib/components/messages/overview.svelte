<script lang="ts">
	import MessageIcon from '../icons/message.svelte';
	import { scale } from 'svelte/transition';
</script>

<div class="mx-auto max-w-3xl md:mt-20" transition:scale={{ opacity: 0, start: 0.98 }}>
	<div class="flex max-w-xl flex-col gap-8 rounded-xl p-6 text-center leading-relaxed">
		<p class="flex flex-row items-center justify-center gap-4 text-4xl">
			<span>🔍</span>
			<span>+</span>
			<span>🧱</span>
			<span>+</span>
			<span>🎨</span>
		</p>
		<p>
			Welcome to <span class="font-medium">Zlide</span> — retrieval, structuring and layout, united
			into one Slide & Poster Agent. Chat with GLM below, or open
			<a class="font-medium underline underline-offset-4" href="/studio"> Zlide Studio </a>
			and turn one sentence into a polished deck or poster.
		</p>
		<p class="flex items-center justify-center gap-2 text-sm text-muted-foreground">
			<MessageIcon size={16} />
			Stage 1 here (charts, outlines, briefs) → Stage 2 in the Studio (slides_glm_agent).
		</p>
	</div>
</div>
