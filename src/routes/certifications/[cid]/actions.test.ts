import { describeNamedActions } from '$lib/testing/named-actions';
import { actions } from './+page.server';

describeNamedActions('/certifications/[cid]', actions, ['setCertification', 'toggleEndorsement']);
