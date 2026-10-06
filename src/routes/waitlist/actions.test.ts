import { describeNamedActions } from '$lib/testing/named-actions';
import { actions } from './+page.server';

describeNamedActions('/waitlist', actions, [
	'assignVatusa',
	'completeVatusa',
	'assignTeacher',
	'changeTeacher',
	'removeStudent',
	'withdrawStudent'
]);
