/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { expandDiagramContext, compactDiagramReply } from './compact-diagram-fixture.mjs';

export const todoFile = 'app/controllers/todos_controller.rb';
export const todoSource = `class TodosController < ApplicationController
  def index; @todos = Todo.all; end
  def create; Todo.create(todo_params); end
  def update; Todo.find(params[:id]).update(completed: true); end
  def destroy; Todo.find(params[:id]).destroy; end
  def todo_params; params.require(:todo).permit(:title, :completed); end
end`;
export const todoFiles = {
	'app/models/todo.rb': 'class Todo < ApplicationRecord\n validates :title, presence: true\nend',
	'app/views/todos/index.html.erb': '<h1>Tasks</h1><form action="/todos" method="post"><input name="todo[title]"><button>Add task</button></form>',
	'config/features.yml': 'features:\n  todos:\n    enabled: true\n',
	'config/routes.rb': 'Rails.application.routes.draw do\n resources :todos\n root "todos#index"\nend',
	'config/application.rb': 'class Application\n def boot; initialize_framework; end\nend',
	'test/todo_test.rb': 'class TodoTest\n def test_creation; assert Todo.new(title: "Read").valid?; end\nend'
};

export function interpretTodo(input) {
	const context = expandDiagramContext(input);
	const result = interpretTodoDomain(context);
	return input.format === 'compact-v2' && !input.compact ? compactDiagramReply(context, result) : result;
}

function interpretTodoDomain(context) {
	assert.equal(context.step, 'project');
	assert.ok(context.project.files.includes('config/routes.rb'));
	assert.ok(context.symbols.some(item => item.file === 'config/features.yml' && item.content.includes('enabled')));
	const symbol = (file, name) => { const item = context.symbols.find(item => item.file === file && item.name === name); assert.ok(item, file + ':' + name); return item.ref; };
	const ctrl = symbol(todoFile, 'TodosController'), resource = symbol('app/models/todo.rb', 'Todo');
	const actions = ['create', 'update', 'destroy'].map(name => symbol(todoFile, name));
	const uiSource = context.symbols.find(item => item.file.endsWith('.erb')).ref;
	const selected = [ctrl, resource, ...actions];
	const names = ['Task Management', 'Task', 'Add Task', 'Complete Task', 'Delete Task'];
	const nodes = ['c:person', 'c:task-list', ...selected];
	const relationships = [
		['uses', 'invocation', 'c:person', 'c:task-list'], ['submits', 'invocation', 'c:task-list', ctrl],
		...actions.flatMap((ref, i) => [[`dispatch-${i}`, 'invocation', ctrl, ref], [`persist-${i}`, 'write', ref, resource]])
	].map(([key, kind, from, to]) => ({ key, kind, from, to, name: key, condition: null, evidence: [ctrl, resource, uiSource], classification: 'inferred' }));
	return { summary: 'Manage tasks from a list through persistence', questions: [], features: [{ key: 'tasks', name: 'Manage Tasks', description: 'Add, complete and delete tasks.' }],
		elements: selected.map((ref, i) => ({ symbol: ref, kind: i === 0 ? 'controller' : i === 1 ? 'resource' : 'action', name: names[i], description: names[i], feature: 'tasks', parent: null })),
		concepts: [{ key: 'person', kind: 'actor', name: 'Person', description: 'Uses the task list', feature: 'tasks', parent: null, source: uiSource }, { key: 'task-list', kind: 'view', name: 'Task List', description: 'Shows tasks and submits changes', feature: 'tasks', parent: null, source: uiSource }],
		omissions: context.required.filter(item => !selected.includes(item.ref) && item.ref !== uiSource).map(item => ({ symbol: item.ref, representedBy: context.symbols.find(symbol => symbol.ref === item.ref).file === todoFile ? ctrl : null, reason: 'Supporting implementation or framework/test setup, already analyzed as evidence.' })),
		relations: relationships, diagrams: [{ key: 'tasks-overview', name: 'Task Management', kind: 'structure', feature: null, nodes, relations: relationships.map(item => item.key), intent: 'Responsibilities and declared/inferred interactions' }, { key: 'add-task', name: 'Add a Task', kind: 'activity', feature: 'tasks', nodes: ['c:person', 'c:task-list', ctrl, actions[0], resource], relations: ['uses', 'submits', 'dispatch-0', 'persist-0'], intent: 'Submission, creation and persistence inferred from source' }]
	};
}
