/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Authored test fixture: a deliberately multi-perspective system, not a claim of AI output.
export const architectureFiles = {
	'app/domain/Task.java': 'package app.domain; public class Task { public long id; public String title; public boolean completed; public void complete() { completed = true; } }',
	'app/store/TaskStore.java': 'package app.store; import app.domain.Task; public interface TaskStore { Task find(long id); void save(Task task); }',
	'app/service/TaskService.java': 'package app.service; import app.domain.Task; import app.store.TaskStore; public class TaskService { private TaskStore store; public void complete(long id) { Task task = store.find(id); task.complete(); store.save(task); } }',
	'db/schema.sql': 'CREATE TABLE users (id BIGINT PRIMARY KEY, name VARCHAR(100) NOT NULL); CREATE TABLE tasks (id BIGINT PRIMARY KEY, owner_id BIGINT NOT NULL REFERENCES users(id), title VARCHAR(200) NOT NULL, completed BOOLEAN NOT NULL DEFAULT FALSE);',
	'deploy/compose.yaml': 'services:\n  api:\n    image: task-api:1\n    ports: ["8080:8080"]\n    networks: [backend]\n    depends_on: [database]\n  database:\n    image: postgres:17\n    networks: [backend]\nnetworks:\n  backend:\n    driver: bridge\n',
	'web/routes.py': 'def complete_task(request, task_service):\n    task_service.complete(request.task_id)\n    return {"ok": True}\n'
};
const specs = [
	['person', 'actor', 'Task Owner'], ['system', 'system', 'Task System'], ['api', 'container', 'Task API', 'system'], ['db', 'resource', 'Task Data', 'system'],
	['service', 'component', 'Task Service', 'api'], ['port', 'interface', 'Task Store Port', 'api'], ['entity', 'entity', 'Task'], ['owner', 'entity', 'Owner'],
	['tasks', 'table', 'tasks'], ['users', 'table', 'users'], ['task-class', 'class', 'Task'], ['service-class', 'class', 'TaskService'],
	['domain', 'package', 'Domain'], ['store', 'package', 'Persistence'], ['host', 'deploymentNode', 'Compose Host'], ['artifact', 'artifact', 'Task API Image'],
	['network', 'networkNode', 'Backend Bridge'], ['usecase', 'useCase', 'Complete Task', 'system'], ['process', 'process', 'Process Task Change'], ['data', 'dataStore', 'Task Records'],
	['complete', 'action', 'Complete Task'], ['open', 'state', 'Incomplete', 'db'], ['done', 'state', 'Complete', 'db']
];
const edges = [
	['context', 'communication', 'person', 'system'], ['http', 'communication', 'person', 'api'], ['sql', 'communication', 'api', 'db'],
	['port', 'implementation', 'service', 'port'], ['owns', 'association', 'owner', 'entity'], ['fk', 'association', 'tasks', 'users'],
	['uses-class', 'dependency', 'service-class', 'task-class'], ['layer', 'dependency', 'store', 'domain'], ['deploy', 'hosting', 'host', 'artifact'],
	['serves', 'hosting', 'host', 'api'], ['network', 'communication', 'network', 'api'], ['capability', 'association', 'person', 'usecase'],
	['input', 'dataFlow', 'person', 'process'], ['output', 'dataFlow', 'process', 'data'], ['invoke', 'invocation', 'person', 'complete'], ['save', 'write', 'complete', 'db'], ['finish', 'transition', 'open', 'done']
];
const views = [
	['c4Context', ['person', 'system'], ['context']], ['c4Container', ['person', 'system', 'api', 'db'], ['http', 'sql']],
	['c4Component', ['api', 'service', 'port'], ['port']], ['erd', ['owner', 'entity'], ['owns']], ['databaseSchema', ['tasks', 'users'], ['fk']],
	['deployment', ['host', 'artifact', 'api'], ['deploy', 'serves']], ['class', ['service-class', 'task-class'], ['uses-class']],
	['useCase', ['person', 'system', 'usecase'], ['capability']], ['component', ['service', 'port'], ['port']], ['package', ['store', 'domain'], ['layer']],
	['dataFlow', ['person', 'process', 'data'], ['input', 'output']], ['network', ['network', 'api'], ['network']],
	['activity', ['person', 'complete', 'db'], ['invoke', 'save']], ['sequence', ['person', 'complete', 'db'], ['invoke', 'save']], ['state', ['db', 'open', 'done'], ['finish']]
];
const member = (name, type, key = 'none') => ({ name, type, kind: 'attribute', key, required: true });
export function notationAnalysis(context) {
	const source = context.units[0][0], ref = key => 'c:' + key;
	const notation = {
		elements: [
			{ ref: ref('tasks'), details: { technology: 'PostgreSQL', environment: '', members: [member('id', 'BIGINT', 'primary'), member('owner_id', 'BIGINT', 'foreign'), member('title', 'VARCHAR(200)')] } },
			{ ref: ref('users'), details: { technology: 'PostgreSQL', environment: '', members: [member('id', 'BIGINT', 'primary'), member('name', 'VARCHAR(100)')] } },
			{ ref: ref('task-class'), details: { technology: 'Java', environment: '', members: [member('id', 'long'), { ...member('complete', 'void'), kind: 'method' }] } },
			{ ref: ref('host'), details: { technology: 'Compose', environment: 'Local', members: [] } }
		],
		relations: [{ key: 'fk', details: { sourceMultiplicity: '0..*', targetMultiplicity: '1', sourceMember: 'owner_id', targetMember: 'id', protocol: '' } }, { key: 'http', details: { sourceMultiplicity: '', targetMultiplicity: '', sourceMember: '', targetMember: '', protocol: 'HTTP' } }]
	};
	return {
		summary: 'A task system with domain, database and deployment perspectives', questions: [], features: [{ key: 'tasks', name: 'Tasks', description: 'Manage tasks' }], elements: [],
		concepts: specs.map(([key, kind, name, parent]) => ({ key, kind, name, parent: parent ? ref(parent) : null, feature: 'tasks', description: name, source })),
		relations: edges.map(([key, kind, from, to]) => ({ key, kind, from: ref(from), to: ref(to), name: key, condition: null, evidence: [source], classification: 'inferred' })),
		diagrams: [], overview: { key: 'overview', name: 'Task Overview', intent: 'Shared semantic design' }, notation,
		coverage: { targets: Object.fromEntries(context.units.map(row => [row[0], ref('system')])) },
		plan: [{ key: 'overview', name: 'Task Overview', kind: 'structure', feature: null, intent: 'Shared semantic design', focus: specs.map(([key]) => ref(key)) }, ...views.map(([kind, nodes]) => ({ key: kind.toLowerCase(), name: kind, kind, feature: 'tasks', intent: 'Understand ' + kind, focus: nodes.map(ref) }))]
	};
}
export function notationView(context) {
	return { ...(['structure', 'activity', 'sequence', 'state'].includes(context.diagram.kind) ? {} : { connections: [] }), questions: [], nodes: context.diagram.focus, relations: context.diagram.kind === 'structure' ? edges.map(([key]) => key) : views.find(([kind]) => kind === context.diagram.kind)[2] };
}
