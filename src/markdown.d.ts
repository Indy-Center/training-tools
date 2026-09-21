/**
 * `.md` imports resolve to rendered HTML, compiled at build time by the
 * `training-tools:markdown` plugin in vite.config.ts.
 *
 * The string is trusted HTML — it came from a file in this repo, through a
 * reviewed pull request — which is what makes it safe to render with `{@html}`.
 */
declare module '*.md' {
	const html: string;
	export default html;
}
