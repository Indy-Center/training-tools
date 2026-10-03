/**
 * How dates read across the app.
 *
 * The locale is fixed rather than left to the runtime: the server renders in
 * the Worker's locale and the browser in the viewer's, so an unpinned
 * `toLocaleDateString()` can render one string and hydrate to another.
 */
const LOCALE = 'en-US';

const SHORT_DATE = new Intl.DateTimeFormat(LOCALE);
const LONG_DATE = new Intl.DateTimeFormat(LOCALE, {
	year: 'numeric',
	month: 'long',
	day: 'numeric'
});
const DATE_TIME = new Intl.DateTimeFormat(LOCALE, {
	year: 'numeric',
	month: 'numeric',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit'
});

type DateInput = Date | string | number;

/** "10/2/2026", or "October 2, 2026" when `style` is `long`. */
export function formatDate(value: DateInput, style: 'short' | 'long' = 'short'): string {
	return (style === 'long' ? LONG_DATE : SHORT_DATE).format(new Date(value));
}

/** "10/2/2026, 3:04 PM". */
export function formatDateTime(value: DateInput): string {
	return DATE_TIME.format(new Date(value));
}

/**
 * "just now", "12 minutes ago", "3 hours ago", "2 days ago".
 *
 * `now` is passed in rather than read here, so a page can hand the server's
 * clock to the browser and both render the same words.
 */
export function formatAgo(value: DateInput, now: DateInput): string {
	const minutes = Math.floor((new Date(now).getTime() - new Date(value).getTime()) / 60_000);
	if (minutes < 1) return 'just now';

	const [count, unit] =
		minutes < 60
			? [minutes, 'minute']
			: minutes < 60 * 24
				? [Math.floor(minutes / 60), 'hour']
				: [Math.floor(minutes / (60 * 24)), 'day'];

	return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}
