/**
 * The error a sync throws instead of applying a run that changes more than its
 * limit allows, e.g. `Teacher roster would remove 3 of 5 teachers (limit 2); keeping it.`
 */
export function overLimitError(change: {
	/** What the run would do, e.g. `Teacher roster would remove`. */
	would: string;
	count: number;
	of: number;
	/** What is counted, e.g. `teachers`. */
	noun: string;
	limit: number;
	/** What is kept instead, e.g. `it`. */
	keeping: string;
	/** Anything to add after the sentence. */
	then?: string;
}): Error {
	const sentence =
		`${change.would} ${change.count} of ${change.of} ${change.noun} ` +
		`(limit ${change.limit}); keeping ${change.keeping}.`;
	return new Error(change.then ? `${sentence} ${change.then}` : sentence);
}
