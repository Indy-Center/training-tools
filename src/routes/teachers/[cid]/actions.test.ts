import { describeNamedActions } from '$lib/testing/named-actions';
import { actions } from './+page.server';

describeNamedActions('/teachers/[cid]', actions, [
	'setQualifications',
	'updateAdmin',
	'updateProfile'
]);
