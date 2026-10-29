/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './source-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSystemMap } from '../../src/vs/workbench/contrib/ade/common/systemMap.ts';
import { checkoutModel } from '../../src/vs/workbench/contrib/ade/common/checkoutModel.ts';

test('system map covers every identity and relationship exactly once, independently of diagrams', () => {
	const before = JSON.stringify(checkoutModel);
	const overview = getSystemMap(checkoutModel);
	assert.deepEqual(overview.branches.flatMap(branch => branch.members.map(member => member.element.id)).sort(), checkoutModel.semantics.elements.map(element => element.id).sort());
	assert.deepEqual(overview.connections.flatMap(connection => connection.relations.map(relation => relation.id)).sort(), checkoutModel.semantics.relations.map(relation => relation.id).sort());
	assert.ok(overview.branches.some(branch => branch.members.some(member => member.element.id === 'payment-contract')));
	const model = structuredClone(checkoutModel);
	model.views = [];
	assert.deepEqual(getSystemMap(model), overview);
	assert.equal(JSON.stringify(checkoutModel), before);
});

test('reparenting changes group ownership; same-name roots retain distinct identities', () => {
	const model = structuredClone(checkoutModel);
	const contract = model.semantics.elements.find(element => element.id === 'payment-contract');
	contract.parentId = 'purchase';
	model.semantics.elements.find(element => element.id === 'cart-management').name = 'Conferma acquisto';
	const overview = getSystemMap(model);
	assert.equal(overview.branches.find(branch => branch.root.id === 'purchase').members.find(member => member.element.id === contract.id).depth, 1);
	assert.deepEqual(overview.branches.filter(branch => branch.root.name === 'Conferma acquisto').map(branch => branch.root.id), ['purchase', 'cart-management']);
	model.semantics = { elements: [], relations: [] };
	assert.deepEqual(getSystemMap(model), { branches: [], connections: [] });
});
