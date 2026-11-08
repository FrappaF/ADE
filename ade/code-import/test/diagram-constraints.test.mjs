/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagramColumnConstraints, validateDiagramColumnConstraints } from '../../ai/diagramConstraints.ts';

const unit = text => ({ ref: 'u0', file: 'db/schema.sql', text, start: 0, end: text.length, language: 'text', name: 'db/schema.sql' });
test('complete simple DDL exposes explicit constraints, ignoring nested type arguments and check-expression keywords', () => {
	const sql = 'CREATE TABLE tasks (id BIGINT PRIMARY KEY, title VARCHAR(100) NOT NULL, price DECIMAL(10,2), note TEXT CHECK (note IS NOT NULL OR 1 = 1));';
	assert.deepEqual(diagramColumnConstraints([unit(sql)]).map(({ table, column, notNull, primary }) => ({ table, column, notNull, primary })), [
		{ table: 'tasks', column: 'id', notNull: null, primary: true }, { table: 'tasks', column: 'title', notNull: true, primary: null }, { table: 'tasks', column: 'price', notNull: null, primary: null }, { table: 'tasks', column: 'note', notNull: null, primary: null }
	]);
});
test('partial, quoted, commented or non-SQL text does not produce alleged SQL proof', () => {
	for (const text of ['CREATE TABLE tasks (title TEXT NOT NULL', 'CREATE TABLE "tasks" (title TEXT NOT NULL);', "CREATE TABLE tasks (title TEXT DEFAULT 'NOT NULL');", '-- CREATE TABLE tasks (title TEXT NOT NULL);']) { assert.deepEqual(diagramColumnConstraints([unit(text)]), []); }
	assert.deepEqual(diagramColumnConstraints([{ ...unit('CREATE TABLE tasks (title TEXT NOT NULL);'), file: 'notes.py' }]), []);
});
test('AI-chosen table metadata cannot contradict a proven column constraint', () => {
	const result = { elements: [], concepts: [{ key: 'tasks', name: 'tasks', kind: 'table' }], notation: { elements: [{ ref: 'c:tasks', details: { members: [{ name: 'title', required: false }] } }] } };
	const facts = diagramColumnConstraints([unit('CREATE TABLE tasks (title TEXT NOT NULL);')]);
	assert.throws(() => validateDiagramColumnConstraints(result, facts), /NOT NULL/);
	result.notation.elements[0].details.members[0].required = true;
	assert.doesNotThrow(() => validateDiagramColumnConstraints(result, facts));
});

test('multiple declarations of the same physical column remain ambiguous instead of forcing one contract', () => {
	const result = { elements: [], concepts: [{ key: 'tasks', name: 'tasks', kind: 'table' }], notation: { elements: [{ ref: 'c:tasks', details: { members: [{ name: 'title', required: false }] } }] } };
	const facts = diagramColumnConstraints([unit('CREATE TABLE tasks (title TEXT NOT NULL); CREATE TABLE tasks (title TEXT);')]);
	assert.doesNotThrow(() => validateDiagramColumnConstraints(result, facts));
});
