<script lang="ts">
	import type { Chat } from '@ai-sdk/svelte';
	import { Button } from './ui/button';
	import { fly } from 'svelte/transition';
	import { replaceState } from '$app/navigation';
	import type { User } from '$lib/server/db/schema';

	let { user, chatClient }: { user: User | undefined; chatClient: Chat } = $props();

	const suggestedActions = [
		{
			title: 'Draft a big-model market analysis',
			label: 'outline for my startup pitch deck',
			action:
				'Draft an outline for a big-model market analysis pitch deck: cover, market size, trends, competitors, closing.'
		},
		{
			title: 'Make a poster brief',
			label: `for my new visual understanding model`,
			action: `Write a poster brief for a new visual understanding model launch: headline, 3 key stats, call to action.`
		},
		{
			title: 'Turn dry numbers into',
			label: `a chart story for slides`,
			action: `Turn these numbers into a chart story for slides: Q1 12M, Q2 19M, Q3 31M user queries. Suggest chart types per slide.`
		},
		{
			title: 'What style keywords',
			label: 'steer slide layouts best?',
			action:
				'What style keywords steer GLM slide layouts best? Give me 5 style recipes for pitch, academic, and poster modes.'
		}
	];
</script>

<div class="grid w-full gap-2 sm:grid-cols-2">
	{#each suggestedActions as suggestedAction, i (suggestedAction.title)}
		<div
			in:fly|global={{ opacity: 0, y: 20, delay: 50 * i, duration: 400 }}
			class={i > 1 ? 'hidden sm:block' : 'block'}
		>
			<Button
				variant="ghost"
				onclick={async () => {
					if (user) {
						replaceState(`/chat/${chatClient.id}`, {});
					}
					await chatClient.append({
						role: 'user',
						content: suggestedAction.action
					});
				}}
				class="h-auto w-full flex-1 items-start justify-start gap-1 rounded-xl border px-4 py-3.5 text-left text-sm sm:flex-col"
			>
				<span class="font-medium">{suggestedAction.title}</span>
				<span class="text-muted-foreground">
					{suggestedAction.label}
				</span>
			</Button>
		</div>
	{/each}
</div>
