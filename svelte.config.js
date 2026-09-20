// Org fork rather than upstream: we need a custom worker entry (src/worker.ts)
// for the roster cron, and later an RPC export. Upstream clobbers a custom
// `main` on every build. See .ai/decisions/0006-training-tools-owns-the-roster.md
import adapter from '@indy-center/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter()
	}
};

export default config;
