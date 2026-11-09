/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SemanticElement, SemanticModel, SemanticRelation } from './semanticModel.js';

export interface SystemBranch {
	root: SemanticElement;
	members: { element: SemanticElement; depth: number }[];
}

export interface SystemConnection {
	from: string;
	to: string;
	relations: SemanticRelation[];
}

/** Derived overview, independent of diagram placement; every semantic identity appears once. */
export function getSystemMap(model: SemanticModel): { branches: SystemBranch[]; connections: SystemConnection[] } {
	const children = new Map<string | undefined, SemanticElement[]>();
	for (const element of model.semantics.elements) {
		const parentId = model.version === 4 ? model.foundation.ownership.find(entry => entry.elementId === element.id)?.ownerId : element.parentId;
		const siblings = children.get(parentId) ?? [];
		siblings.push(element);
		children.set(parentId, siblings);
	}
	const owners = new Map<string, string>();
	const branches: SystemBranch[] = [];
	for (const root of children.get(undefined) ?? []) {
		const branch: SystemBranch = { root, members: [] };
		const pending = [{ element: root, depth: 0 }];
		while (pending.length) {
			const member = pending.pop()!;
			if (owners.has(member.element.id)) { continue; }
			owners.set(member.element.id, root.id);
			branch.members.push(member);
			pending.push(...(children.get(member.element.id) ?? []).map(element => ({ element, depth: member.depth + 1 })).reverse());
		}
		branches.push(branch);
	}
	const connections: SystemConnection[] = [];
	const bySource = new Map<string, Map<string, SystemConnection>>();
	for (const relation of model.semantics.relations) {
		const from = owners.get(relation.from);
		const to = owners.get(relation.to);
		if (!from || !to) { continue; }
		const targets = bySource.get(from) ?? new Map<string, SystemConnection>();
		bySource.set(from, targets);
		let connection = targets.get(to);
		if (!connection) {
			connection = { from, to, relations: [] };
			targets.set(to, connection);
			connections.push(connection);
		}
		connection.relations.push(relation);
	}
	return { branches, connections };
}
