import { describeNamedActions } from '$lib/testing/named-actions';
import { actions } from './+page.server';

describeNamedActions('/teach/report/[id]', actions, ['submit']);
