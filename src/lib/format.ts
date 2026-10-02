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
