import { describe, expect, it } from 'vitest';
import { dialogOutcome } from './confirm-dialog';

describe('dialogOutcome', () => {
	it('posts on confirm once the dialog is ready', () => {
		expect(dialogOutcome('confirm', true)).toBe('submit');
	});

	it('does nothing on confirm while a choice is still missing', () => {
		expect(dialogOutcome('confirm', false)).toBe('stay');
	});

	it('closes without posting on Cancel or Escape, ready or not', () => {
		expect(dialogOutcome('cancel', true)).toBe('close');
		expect(dialogOutcome('cancel', false)).toBe('close');
		expect(dialogOutcome('escape', true)).toBe('close');
		expect(dialogOutcome('escape', false)).toBe('close');
	});
});
