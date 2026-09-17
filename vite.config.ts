import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	// Zlide Studio lives at http://localhost:2828 — hardcoded, strict.
	// If 2828 is taken, the server REFUSES to start rather than drifting
	// to a random port. Kill the occupant first.
	server: {
		port: 2828,
		strictPort: true,
		host: '127.0.0.1'
	},
	preview: {
		port: 2828,
		strictPort: true,
		host: '127.0.0.1'
	}
});
