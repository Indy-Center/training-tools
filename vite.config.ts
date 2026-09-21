import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import Icons from 'unplugin-icons/vite';
import { marked } from 'marked';

/**
 * Compile `.md` imports to an HTML string **at build time**.
 *
 * Build time, not runtime, on purpose:
 *
 * - `marked` stays a devDependency and never reaches the Worker bundle. Only
 *   the rendered HTML ships.
 * - No sanitiser is needed, because the content is ours and arrives through a
 *   reviewed pull request. That equation changes the moment any of this becomes
 *   user- or admin-supplied — rendering untrusted markdown into a page students
 *   load would be a stored-XSS vector, and would need both a runtime renderer
 *   and sanitisation. Do not quietly extend this plugin to cover that case.
 *
 * Course and lesson content is deliberately **not** handled here. It does not
 * live in this repo: it is course-specific, it is not for a browsing member of
 * the public, and it will eventually be generated rather than hand-written.
 */
function markdown(): Plugin {
	return {
		name: 'training-tools:markdown',
		enforce: 'pre',
		transform(code, id) {
			if (!id.endsWith('.md')) return null;

			// HTML comments are notes for whoever edits the file — "this is a draft",
			// "bump TERMS_VERSION when this changes". `marked` passes them straight
			// through, which would ship them in the page source to every student.
			const source = code.replace(/<!--[\s\S]*?-->/g, '');
			const html = marked.parse(source, { async: false });

			return {
				code: `export default ${JSON.stringify(html)};`,
				map: null
			};
		}
	};
}

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), Icons({ compiler: 'svelte' }), markdown()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
