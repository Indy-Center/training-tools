import { describeNamedActions } from '$lib/testing/named-actions';
import { actions } from './+page.server';

describeNamedActions('/teach', actions, [
	'claimExam',
	'completeExam',
	'completeTraining',
	'failExam'
]);
