/**
 * Worthy-of-the-sword SSE parsing.
 *
 * The naive way splits the byte stream on newlines and JSON.parses every
 * `data:` line — silently DROPPING any payload shredded mid-line across TCP
 * chunks (the catch swallows it forever). Live agent streams shred constantly.
 *
 * This parser instead accumulates bytes and only parses COMPLETE event blocks
 * (delimited by a blank line, per the SSE spec). Multi-line `data:` fields
 * are joined, `: comments` and pings are skipped, `[DONE]` ends iteration,
 * and the tail remainder is held — never parsed — until its block completes.
 * Pure module: no env imports, so it can be proven outside SvelteKit.
 */
export async function* iterateSseEvents(
	body: ReadableStream<Uint8Array>
): AsyncGenerator<string, void, void> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	function* takeBlocks(final: boolean): Generator<string, void, void> {
		const norm = buffer.replace(/\r\n/g, '\n');
		if (!final) {
			const parts = norm.split('\n\n');
			buffer = parts.pop() ?? '';
			yield* parts;
			return;
		}
		buffer = '';
		if (norm.trim()) yield norm;
	}

	function* payloads(blocks: Iterable<string>): Generator<string, void, void> {
		for (const block of blocks) {
			const data = block
				.split('\n')
				.filter((line) => line.startsWith('data:'))
				.map((line) => line.slice(5).replace(/^ /, '')) // SSE: strip exactly one leading space
				.join('\n')
				.trim();
			if (!data) continue; // comment / heartbeat / empty
			yield data;
		}
	}

	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (value) buffer += decoder.decode(value, { stream: true });
			for (const data of payloads(takeBlocks(false))) {
				if (data === '[DONE]') return;
				yield data;
			}
			if (done) {
				buffer += decoder.decode();
				for (const data of payloads(takeBlocks(true))) {
					if (data === '[DONE]') return;
					yield data;
				}
				return;
			}
		}
	} finally {
		reader.releaseLock();
	}
}
