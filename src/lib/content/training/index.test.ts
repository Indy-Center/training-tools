import { describe, expect, it } from 'vitest';
import { fillCopy, TRAINING_COPY } from './index';

describe('fillCopy', () => {
	it('fills in the paused request copy with its course and date', () => {
		const copy = fillCopy(TRAINING_COPY['left-home-roster'], {
			course: 'Simple Local Control (S-LC)',
			restoreBy: 'November 19, 2026'
		});
		expect(copy.body.replace(/<!--[\s\S]*?-->/g, '').trim()).toBe(
			'<p>You&#39;ve left the ZID home roster, so your Simple Local Control (S-LC) request is paused. Come back by November 19, 2026 to keep your place.</p>'
		);
	});

	it('escapes what it fills in, and leaves unknown names alone', () => {
		const copy = fillCopy({ title: 't', body: '<p>{a} {b}</p>' }, { a: '<b>x</b> & "y"' });
		expect(copy.body).toBe('<p>&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot; {b}</p>');
	});
});
