import { describe, expectTypeOf, it } from 'vitest';
import type { WorkerEntrypoint } from 'cloudflare:workers';
import type { TrainingRpc as Entrypoint } from './worker';
import type { TrainingRpc as Published } from '$rpc';

/** The methods a caller can call, without what every entrypoint has. */
type Methods<T> = Pick<T, Exclude<keyof T, keyof WorkerEntrypoint>>;

// A type check: `npm run check` fails when it does not hold; at run time it
// passes whatever the types say.
describe('the TrainingRpc entrypoint', () => {
	it('has exactly the methods the published package declares, with the same types', () => {
		expectTypeOf<Methods<Entrypoint>>().toEqualTypeOf<Methods<Published>>();
	});
});
