/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CodeDiagramExploration } from './codeBridge.js';

/** Presentation state only; publication is still validated by the diagram service. */
export function getDiagramExplorationPhase(exploration: CodeDiagramExploration | undefined): 'incomplete' | 'review' | 'applied' | undefined {
	if (!exploration) { return undefined; }
	if (exploration.phase && exploration.phase !== 'review') { return 'incomplete'; }
	const drafts = exploration.proposals.filter(proposal => proposal.status !== 'applied');
	const tasks = exploration.plan?.items.map(item => exploration.tasks.find(task => task.id === item.id)) ?? exploration.tasks;
	const planned = exploration.workflow !== 'project' || !!exploration.plan?.items.length;
	if (exploration.batch?.blockers.length || !planned) { return 'incomplete'; }
	if (!drafts.length && exploration.proposals.some(proposal => proposal.status === 'applied') && tasks.every(task => task?.status === 'applied' || task?.status === 'cancelled')) { return 'applied'; }
	if (drafts.length && drafts.every(proposal => proposal.status === 'ready') && tasks.every(task => task?.status === 'ready' || task?.status === 'applied' || task?.status === 'cancelled')) { return 'review'; }
	return 'incomplete';
}
