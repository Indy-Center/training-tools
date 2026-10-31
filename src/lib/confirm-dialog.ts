/**
 * What `ConfirmDialog` does with each way out of it. Pure, so the rule that
 * only the confirm button ever posts is tested without a browser.
 *
 * - `submit`: post the form the dialog sits in, and close.
 * - `close`: close, and post nothing.
 * - `stay`: leave it open; the confirm button is disabled until it is ready.
 */
export type DialogAction = 'confirm' | 'cancel' | 'escape';
export type DialogOutcome = 'submit' | 'close' | 'stay';

export function dialogOutcome(action: DialogAction, ready: boolean): DialogOutcome {
	if (action !== 'confirm') return 'close';
	return ready ? 'submit' : 'stay';
}
