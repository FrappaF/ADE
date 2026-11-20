import * as dom from '../../../../base/browser/dom.js';
import { equals } from '../../../../base/common/objects.js';
import { localize } from '../../../../nls.js';
import { areModelOperationsCompatible } from '../common/modelContractValidation.js';
import { emptyBlueprint } from '../common/modelFoundation.js';
import { blueprintRules, type Knowledge, type ModelBlueprint, type ModelOperation, type SemanticElement, type SemanticModelV4 } from '../common/modelTypes.js';
import { getElementPath } from '../common/visualNavigation.js';
import { type BlueprintEditMode } from './adeBlueprintEditing.js';
import { type BlueprintActivity, type BlueprintActivityContext, type BlueprintForm, type BlueprintOption } from './adeBlueprintForm.js';
import { elementLabels, relationLabels } from './adeLabels.js';

type Port = ModelBlueprint['ports'][number];
type Contract = ModelBlueprint['interfaces'][number];

function declarations(model: SemanticModelV4): ModelBlueprint {
	return model.foundation.blueprint ?? emptyBlueprint();
}

function elementName(model: SemanticModelV4, id: string): string {
	return model.semantics.elements.find(element => element.id === id)?.name ?? id;
}

function contextualElement(context: BlueprintActivityContext): string | undefined {
	return context.model.semantics.elements.find(element => element.id === context.targetId)?.id;
}

function elementOptions(model: SemanticModelV4, accepts: (element: SemanticElement) => boolean = () => true): BlueprintOption[] {
	return model.semantics.elements.filter(accepts).map(element => {
		const path = getElementPath(model, element.id).slice(0, -1).map(ancestor => ancestor.name);
		const description = [elementLabels[element.kind], ...path].join(' · ');
		return { id: element.id, label: element.name, description };
	});
}

function typeOptions(model: SemanticModelV4): BlueprintOption[] {
	return model.foundation.types.map(type => ({
		id: type.id,
		label: type.name,
		description: model.foundation.types.some(other => other.id !== type.id && other.name === type.name) ? type.id : undefined
	}));
}

function contractOption(model: SemanticModelV4, contract: Contract): BlueprintOption {
	return {
		id: contract.id,
		label: elementName(model, contract.elementId),
		description: localize('ade.blueprint.form.contractVersion', "Version {0}", contract.version)
	};
}

function portOption(model: SemanticModelV4, blueprint: ModelBlueprint, port: Port): BlueprintOption {
	const contract = blueprint.interfaces.find(item => item.id === port.interfaceId);
	const name = contract
		? localize('ade.blueprint.form.versionedContract', "{0}, version {1}", elementName(model, contract.elementId), contract.version)
		: port.interfaceId;
	return {
		id: port.id,
		label: elementName(model, port.elementId),
		description: port.direction === 'provided'
			? localize('ade.blueprint.form.provides', "Provides {0}", name)
			: localize('ade.blueprint.form.requires', "Requires {0}", name)
	};
}

function relationOptions(model: SemanticModelV4): BlueprintOption[] {
	return model.semantics.relations.map(relation => ({
		id: relation.id,
		label: relation.name || relationLabels[relation.kind],
		description: localize('ade.blueprint.form.fromTo', "{0} → {1}", elementName(model, relation.from), elementName(model, relation.to))
	}));
}

function matchingElement<T extends { id: string }>(entries: readonly T[], targetId: string | undefined, matches: (entry: T, target: string) => boolean): string | undefined {
	return entries.find(entry => entry.id === targetId)?.id ?? (targetId ? entries.find(entry => matches(entry, targetId))?.id : undefined);
}

function optionWithCurrent(options: readonly BlueprintOption[], current: string | undefined): readonly BlueprintOption[] {
	return current && !options.some(option => option.id === current)
		? [...options, { id: current, label: current, description: localize('ade.blueprint.form.unavailable', "Reference needs review") }]
		: options;
}

/** The record chooser can expose objects created in a different retained form. */
function modelSelect(form: BlueprintForm, parent: HTMLElement, label: string, options: (model: SemanticModelV4) => readonly BlueprintOption[], current?: string): HTMLSelectElement {
	const displayed = (list: readonly BlueprintOption[], selected?: string) => optionWithCurrent(list, selected);
	const select = form.select(parent, label, displayed(options(form.context.model), current), current, { required: true });
	const placeholder = select.options[0]?.value === '' ? select.options[0].cloneNode(true) : undefined;
	form.onShow(() => {
		const value = select.value;
		const items = displayed(options(form.context.model), value);
		const elements = items.map(item => {
			const option = dom.$<HTMLOptionElement>('option', { value: item.id });
			option.textContent = item.description ? localize('ade.blueprint.form.optionDetail', "{0} · {1}", item.label, item.description) : item.label;
			return option;
		});
		select.replaceChildren(...(placeholder ? [placeholder.cloneNode(true), ...elements] : elements));
		select.value = value;
	});
	return select;
}

function related(form: BlueprintForm, parent: HTMLElement, label: string, mode: BlueprintEditMode, target?: () => string | undefined): void {
	form.action(parent, label, () => form.context.open(mode, target?.() || undefined));
}

function knowledgeControl(form: BlueprintForm, parent: HTMLElement, label: string, existing?: Knowledge): () => Knowledge | undefined {
	const state = form.select(parent, label, [
		{ id: 'known', label: localize('ade.blueprint.form.known', "Known Value") },
		{ id: 'unknown', label: localize('ade.blueprint.form.unknown', "Unknown — Requires Clarification") },
		{ id: 'omitted', label: localize('ade.blueprint.form.omitted', "Explicitly Omitted") }
	], existing?.state, { required: true });
	const knownRow = dom.append(parent, dom.$('div'));
	const previous = existing?.state === 'known' ? String(existing.value ?? '') : '';
	const known = form.text(knownRow, localize('ade.blueprint.form.declaredValue', "Declared Value"), previous);
	const unknownRow = dom.append(parent, dom.$('div'));
	const reason = form.text(unknownRow, localize('ade.blueprint.form.reason', "Reason"), existing?.state === 'unknown' ? existing.reason : '', { multiline: true, required: true });
	const refresh = () => {
		known.disabled = knownRow.hidden = state.value !== 'known';
		reason.disabled = unknownRow.hidden = state.value !== 'unknown';
	};
	refresh();
	state.addEventListener('change', refresh);
	return () => {
		switch (state.value) {
			case 'known': return existing?.state === 'known' && known.value === previous ? existing : { state: 'known', value: known.value };
			case 'unknown': return reason.value.trim() ? { state: 'unknown', reason: reason.value } : undefined;
			case 'omitted': return { state: 'omitted' };
			default: return undefined;
		}
	};
}

function integrationActivity(context: BlueprintActivityContext): BlueprintActivity {
	const entries = context.model.foundation.integrations;
	return {
		records: entries.map(entry => ({ id: entry.id, label: localize('ade.blueprint.form.integrationLabel', "{0} → {1}", elementName(context.model, entry.consumerId), elementName(context.model, entry.externalId)) })),
		initialId: matchingElement(entries, context.targetId, (entry, id) => entry.consumerId === id || entry.externalId === id),
		createLabel: localize('ade.blueprint.form.addIntegration', "Declare Integration"),
		render(form, recordId) {
			const entry = entries.find(item => item.id === recordId);
			const endpoints = form.group(localize('ade.blueprint.form.integrationEndpoints', "Elements Involved"), localize('ade.blueprint.form.integrationPurpose', "Declare which external system a model element depends on."));
			const consumer = modelSelect(form, endpoints, localize('ade.blueprint.form.consumerElement', "Consumer Element"), elementOptions, entry?.consumerId ?? contextualElement(context));
			const external = modelSelect(form, endpoints, localize('ade.blueprint.form.externalSystem', "External System"), model => elementOptions(model, element => element.scope === 'external'), entry?.externalId);
			if (!context.model.semantics.elements.some(element => element.scope === 'external')) {
				form.note(endpoints, localize('ade.blueprint.form.noExternal', "Classify a system as external before declaring the integration."));
			}
			related(form, endpoints, localize('ade.blueprint.form.openSystemScope', "Open System Scope"), 'scope', () => external.value);
			form.onEdit(model => {
				if (!consumer.value || !external.value) { return undefined; }
				const existing = model.foundation.integrations.find(item => item.consumerId === consumer.value && item.externalId === external.value);
				if (existing && existing.id !== entry?.id) {
					throw new Error(localize('ade.blueprint.form.duplicateIntegration', "These elements already have an integration declaration. Select it to make changes."));
				}
				const next = { id: entry?.id ?? form.newId, consumerId: consumer.value, externalId: external.value };
				return equals(next, entry) ? undefined : { kind: 'integration', entry: next };
			});
		}
	};
}

function platformActivity(context: BlueprintActivityContext): BlueprintActivity {
	const entries = context.model.foundation.platform.bindings;
	return {
		records: entries.map(entry => ({ id: entry.id, label: elementName(context.model, entry.elementId), description: entry.profileId })),
		initialId: matchingElement(entries, context.targetId, (entry, id) => entry.elementId === id),
		createLabel: localize('ade.blueprint.form.addPlatform', "Add Platform Binding"),
		render(form, recordId) {
			const entry = entries.find(item => item.id === recordId);
			const target = form.group(localize('ade.blueprint.form.elementProfile', "Element and Profile"));
			const element = modelSelect(form, target, localize('ade.blueprint.form.boundElement', "Element"), elementOptions, entry?.elementId ?? contextualElement(context));
			const profile = form.text(target, localize('ade.blueprint.form.profileId', "Declared Profile Identifier"), entry?.profileId, { required: true });
			const technology = form.group(localize('ade.blueprint.form.technology', "Technology"), localize('ade.blueprint.form.technologyPurpose', "Record the technology or describe what is needed to make the choice."));
			const readTechnology = knowledgeControl(form, technology, localize('ade.blueprint.form.technologyState', "Technology State"), entry?.technology);
			related(form, target, localize('ade.blueprint.form.openResponsibility', "Open Scope and Responsibility"), 'scope', () => element.value);
			form.onEdit(model => {
				const technology = readTechnology();
				if (!element.value || !profile.value.trim() || !technology) { return undefined; }
				const next = { id: entry?.id ?? form.newId, elementId: element.value, profileId: profile.value, technology };
				if (equals(next, entry)) { return undefined; }
				if (model.foundation.platform.bindings.some(item => item.id !== next.id && item.elementId === next.elementId && item.profileId === next.profileId)) {
					throw new Error(localize('ade.blueprint.form.duplicatePlatform', "This element already has a binding for the profile. Select it to make changes."));
				}
				return { kind: 'platformBinding', entry: next };
			});
		}
	};
}

function portActivity(context: BlueprintActivityContext): BlueprintActivity {
	const blueprint = declarations(context.model);
	return {
		records: blueprint.ports.map(port => portOption(context.model, blueprint, port)),
		initialId: matchingElement(blueprint.ports, context.targetId, (entry, id) => entry.elementId === id || entry.interfaceId === id),
		createLabel: localize('ade.blueprint.form.addPort', "Add Interface to Element"),
		render(form, recordId) {
			const entry = blueprint.ports.find(item => item.id === recordId);
			const definition = form.group(localize('ade.blueprint.form.interfaceAssignment', "Element and Interface"), localize('ade.blueprint.form.interfacePurpose', "Choose Provided for an element that offers a contract, or Required for an element that needs it."));
			const isPortOwner = (element: SemanticElement) => blueprintRules.portOwners.some(kind => kind === element.kind);
			const target = context.model.semantics.elements.find(element => element.id === context.targetId && isPortOwner(element));
			const element = modelSelect(form, definition, localize('ade.blueprint.form.boundElement', "Element"), model => elementOptions(model, isPortOwner), entry?.elementId ?? target?.id);
			const contract = modelSelect(form, definition, localize('ade.blueprint.form.contract', "Declared Contract or Interface"), model => declarations(model).interfaces.map(item => contractOption(model, item)), entry?.interfaceId);
			const direction = form.select(definition, localize('ade.blueprint.form.direction', "Direction"), [
				{ id: 'provided', label: localize('ade.blueprint.form.provided', "Provided") },
				{ id: 'required', label: localize('ade.blueprint.form.required', "Required") }
			], entry?.direction, { required: true });
			if (!blueprint.interfaces.length) {
				form.note(definition, localize('ade.blueprint.form.noInterfaces', "Declare an interface and its operations before assigning it to an element."));
			}
			related(form, definition, localize('ade.blueprint.form.openInterfaces', "Open Interface Definitions"), 'interfaces', () => contract.value);
			related(form, definition, localize('ade.blueprint.form.openConnections', "Open Interface Connections"), 'connections', () => entry?.id ?? form.newId);
			form.onEdit(() => {
				if (!element.value || !contract.value || (direction.value !== 'provided' && direction.value !== 'required')) { return undefined; }
				return { kind: 'blueprint', section: 'ports', entry: { id: entry?.id ?? form.newId, elementId: element.value, interfaceId: contract.value, direction: direction.value } };
			});
		}
	};
}

function portOperations(blueprint: ModelBlueprint, portId: string): ModelOperation[] {
	const port = blueprint.ports.find(item => item.id === portId);
	const operationIds = blueprint.interfaces.find(contract => contract.id === port?.interfaceId)?.operationIds ?? [];
	return operationIds.flatMap(id => blueprint.operations.find(operation => operation.id === id) ?? []);
}

function operationLabel(model: SemanticModelV4, operation: ModelOperation): string {
	const parameters = operation.inputs.map(field => model.foundation.types.find(type => type.id === field.typeId)?.name ?? field.type);
	return localize('ade.blueprint.form.signature', "{0}({1})", operation.name, parameters.join(', '));
}

function renderConnection(form: BlueprintForm, recordId?: string): void {
	const { context } = form;
	const blueprint = declarations(context.model);
	const entry = blueprint.connections.find(item => item.id === recordId);
	const section = form.group(localize('ade.blueprint.form.connectionEndpoints', "Connection Endpoints"), localize('ade.blueprint.form.connectionPurpose', "Connect a required interface to one provider and match each required operation."));
	const required = modelSelect(form, section, localize('ade.blueprint.form.requiredBy', "Required by"), model => {
		const current = declarations(model);
		const occupied = new Set(current.connections.filter(item => item.id !== (entry?.id ?? form.newId)).map(item => item.requiredPortId));
		return current.ports.filter(port => port.direction === 'required' && !occupied.has(port.id)).map(port => portOption(model, current, port));
	}, entry?.requiredPortId ?? blueprint.ports.find(port => port.direction === 'required' && port.id === context.targetId)?.id);
	const provided = modelSelect(form, section, localize('ade.blueprint.form.providedBy', "Provided by"), model => {
		const current = declarations(model);
		return current.ports.filter(port => port.direction === 'provided').map(port => portOption(model, current, port));
	}, entry?.providedPortId ?? blueprint.ports.find(port => port.direction === 'provided' && port.id === context.targetId)?.id);
	related(form, section, localize('ade.blueprint.form.openPorts', "Open Provided and Required Interfaces"), 'ports', () => required.value || provided.value);
	const mapping = form.group(localize('ade.blueprint.form.operationMapping', "Operation Mapping"));
	const mappingRows = dom.append(mapping, dom.$('div.ade-blueprint-collection'));
	const answers = new Map<string, Map<string, string>>();
	const endpointKey = (requiredId: string, providedId: string) => JSON.stringify([requiredId, providedId]);
	if (entry) {
		answers.set(endpointKey(entry.requiredPortId, entry.providedPortId), new Map(entry.operations.map(item => [item.requiredOperationId, item.providedOperationId])));
	}

	let shown = '';
	const showMapping = () => {
		if (!required.value || !provided.value) {
			if (shown === 'empty') { return; }
			shown = 'empty';
			mappingRows.replaceChildren();
			form.note(mappingRows, localize('ade.blueprint.form.pickEndpoints', "Choose both endpoints to see their operations."));
			return;
		}
		const model = context.model;
		const current = declarations(model);
		const expected = portOperations(current, required.value);
		const offered = portOperations(current, provided.value);
		const key = endpointKey(required.value, provided.value);
		const candidates = expected.map(operation => ({
			id: operation.id,
			label: operationLabel(model, operation),
			options: offered.filter(candidate => areModelOperationsCompatible(model, operation, candidate)).map(operation => ({ id: operation.id, label: operationLabel(model, operation) }))
		}));
		const signature = JSON.stringify([key, candidates]);
		if (signature === shown) { return; }
		shown = signature;
		mappingRows.replaceChildren();
		const selected = answers.get(key) ?? new Map<string, string>();
		answers.set(key, selected);
		if (!candidates.length) {
			form.note(mappingRows, localize('ade.blueprint.form.noMappings', "The required interface has no declared operations."));
		}
		for (const operation of candidates) {
			const row = dom.append(mappingRows, dom.$('div.ade-blueprint-collection-row'));
			const saved = selected.get(operation.id);
			const currentId = operation.options.some(choice => choice.id === saved)
				? saved
				: operation.options.some(candidate => candidate.id === operation.id)
					? operation.id
					: operation.options.length === 1 ? operation.options[0].id : undefined;
			const field = form.select(row, localize('ade.blueprint.form.providerFor', "Provider for {0}", operation.label), operation.options, currentId, { required: true });
			selected.set(operation.id, field.value);
			if (!operation.options.length) {
				form.note(row, localize('ade.blueprint.form.incompatibleMapping', "The provider has no compatible signature for this operation."));
			}
			field.addEventListener('change', () => selected.set(operation.id, field.value));
		}
	};
	required.addEventListener('change', showMapping);
	provided.addEventListener('change', showMapping);
	form.onShow(showMapping);
	showMapping();
	form.onEdit(model => {
		if (!required.value || !provided.value) { return undefined; }
		const current = declarations(model);
		const existing = current.connections.find(item => item.requiredPortId === required.value);
		if (existing && existing.id !== entry?.id) {
			throw new Error(localize('ade.blueprint.form.duplicateConnection', "This required interface already has a connection. Edit that connection to change its provider."));
		}
		const selected = answers.get(endpointKey(required.value, provided.value));
		const expected = portOperations(current, required.value);
		const offered = portOperations(current, provided.value);
		const operations = expected.map(operation => ({ requiredOperationId: operation.id, providedOperationId: selected?.get(operation.id) ?? '' }));
		if (operations.some(item => !offered.some(operation => operation.id === item.providedOperationId))) {
			throw new Error(localize('ade.blueprint.form.reviewMappings', "Review the operation mapping for the selected interfaces."));
		}
		return { kind: 'blueprint', section: 'connections', entry: { id: entry?.id ?? form.newId, requiredPortId: required.value, providedPortId: provided.value, operations } };
	});
}

function connectionActivity(context: BlueprintActivityContext): BlueprintActivity {
	const blueprint = declarations(context.model);
	const label = (id: string) => {
		const port = blueprint.ports.find(item => item.id === id);
		return port ? elementName(context.model, port.elementId) : id;
	};
	return {
		records: blueprint.connections.map(entry => ({ id: entry.id, label: localize('ade.blueprint.form.connectionLabel', "{0} → {1}", label(entry.requiredPortId), label(entry.providedPortId)) })),
		initialId: matchingElement(blueprint.connections, context.targetId, (entry, id) => entry.requiredPortId === id || entry.providedPortId === id),
		createLabel: localize('ade.blueprint.form.addConnection', "Connect Interfaces"),
		render: renderConnection
	};
}

function transportActivity(context: BlueprintActivityContext): BlueprintActivity {
	const blueprint = declarations(context.model);
	const relations = new Map(relationOptions(context.model).map(option => [option.id, option]));
	return {
		records: blueprint.transports.map(entry => ({ id: entry.id, label: relations.get(entry.relationId)?.label ?? entry.relationId, description: localize('ade.blueprint.form.transportDetails', "{0} · {1}", entry.protocol, entry.format) })),
		initialId: matchingElement(blueprint.transports, context.targetId, (entry, id) => entry.relationId === id),
		createLabel: localize('ade.blueprint.form.addTransport', "Declare Transport"),
		render(form, recordId) {
			const entry = blueprint.transports.find(item => item.id === recordId);
			const transport = form.group(localize('ade.blueprint.form.relationProtocol', "Relationship and Protocol"));
			const relation = modelSelect(form, transport, localize('ade.blueprint.form.transportRelationship', "Transport Relationship"), model => {
				const occupied = new Set(declarations(model).transports.filter(item => item.id !== (entry?.id ?? form.newId)).map(item => item.relationId));
				return relationOptions(model).filter(option => !occupied.has(option.id));
			}, entry?.relationId ?? (context.targetId && relations.has(context.targetId) ? context.targetId : undefined));
			const protocol = form.text(transport, localize('ade.blueprint.form.protocol', "Protocol"), entry?.protocol, { required: true });
			const schema = form.group(localize('ade.blueprint.form.payload', "Payload Schema"), localize('ade.blueprint.form.payloadPurpose', "Use a shared type to describe the payload structure."));
			const format = form.text(schema, localize('ade.blueprint.form.payloadFormat', "Payload Format"), entry?.format, { required: true });
			const type = modelSelect(form, schema, localize('ade.blueprint.form.payloadType', "Declared Type"), typeOptions, entry?.schemaTypeId);
			const version = form.text(schema, localize('ade.blueprint.form.payloadVersion', "Payload Schema Version"), entry?.schemaVersion, { required: true });
			if (!relations.size) {
				form.note(transport, localize('ade.blueprint.form.noTransportRelationship', "Create a relationship between model elements before declaring its transport."));
			}
			related(form, schema, localize('ade.blueprint.form.openTypes', "Open Shared Types"), 'types', () => type.value);
			form.onEdit(model => {
				if (!relation.value || !protocol.value.trim() || !format.value.trim() || !type.value || !version.value.trim()) { return undefined; }
				const existing = declarations(model).transports.find(item => item.relationId === relation.value);
				if (existing && existing.id !== entry?.id) {
					throw new Error(localize('ade.blueprint.form.duplicateTransport', "This relationship already has a transport declaration. Select it to make changes."));
				}
				return { kind: 'blueprint', section: 'transports', entry: { id: entry?.id ?? form.newId, relationId: relation.value, protocol: protocol.value, format: format.value, schemaTypeId: type.value, schemaVersion: version.value } };
			});
		}
	};
}

function moduleActivity(context: BlueprintActivityContext): BlueprintActivity {
	const blueprint = declarations(context.model);
	return {
		records: blueprint.modules.map(entry => ({ id: entry.id, label: elementName(context.model, entry.elementId), description: entry.library.state === 'known' ? String(entry.library.value) : undefined })),
		initialId: matchingElement(blueprint.modules, context.targetId, (entry, id) => entry.elementId === id),
		createLabel: localize('ade.blueprint.form.addLibrary', "Bind Shared Library"),
		render(form, recordId) {
			const entry = blueprint.modules.find(item => item.id === recordId);
			const scope = form.group(localize('ade.blueprint.form.packageConsumers', "Package and Consumers"));
			const packages = (model: SemanticModelV4) => {
				const occupied = new Set(declarations(model).modules.filter(item => item.id !== (entry?.id ?? form.newId)).map(item => item.elementId));
				return elementOptions(model, element => element.kind === 'package' && !occupied.has(element.id));
			};
			const target = modelSelect(form, scope, localize('ade.blueprint.form.package', "Nondeployable Package"), packages, entry?.elementId ?? (packages(context.model).some(item => item.id === context.targetId) ? context.targetId : undefined));
			if (!context.model.semantics.elements.some(element => element.kind === 'package')) {
				form.note(scope, localize('ade.blueprint.form.noPackages', "Add a package to the model before binding a shared library."));
			}
			const consumers = form.group(localize('ade.blueprint.form.libraryConsumers', "Library Consumers"), localize('ade.blueprint.form.consumerHelp', "Select the elements that depend on this library."));
			const list = dom.append(consumers, dom.$('div.ade-blueprint-collection'));
			const selected = new Set(entry?.consumerIds ?? []);
			for (const option of elementOptions(context.model)) {
				const label = option.description ? localize('ade.blueprint.form.consumerOption', "{0} · {1}", option.label, option.description) : option.label;
				const check = form.check(list, label, selected.has(option.id));
				check.addEventListener('change', () => {
					if (check.checked) {
						selected.add(option.id);
					} else {
						selected.delete(option.id);
					}
				});
			}
			const library = form.group(localize('ade.blueprint.form.library', "Library"));
			const readLibrary = knowledgeControl(form, library, localize('ade.blueprint.form.libraryState', "Library State"), entry?.library);
			const version = form.group(localize('ade.blueprint.form.libraryVersion', "Library Version"));
			const readVersion = knowledgeControl(form, version, localize('ade.blueprint.form.versionState', "Version State"), entry?.version);
			form.onEdit(model => {
				const library = readLibrary();
				const version = readVersion();
				if (!target.value || !library || !version) { return undefined; }
				const existing = declarations(model).modules.find(item => item.elementId === target.value);
				if (existing && existing.id !== entry?.id) {
					throw new Error(localize('ade.blueprint.form.duplicateLibrary', "This package already has a shared library binding. Select it to make changes."));
				}
				return { kind: 'blueprint', section: 'modules', entry: { id: entry?.id ?? form.newId, elementId: target.value, consumerIds: [...selected], library, version } };
			});
		}
	};
}

function domainFields(model: SemanticModelV4): (BlueprintOption & { typeId: string })[] {
	return model.foundation.types.flatMap(type => type.fields.flatMap(field => field.id ? [{ id: field.id, label: field.name, description: type.name, typeId: type.id }] : []));
}

function physicalFields(model: SemanticModelV4): (BlueprintOption & { kind: 'column' | 'member' })[] {
	return model.semantics.elements.flatMap(element => {
		if (element.kind !== 'table' && element.kind !== 'class') {
			return [];
		}
		const kind = element.kind === 'table' ? 'column' as const : 'member' as const;
		return (element.details?.members ?? []).flatMap(member => member.id && member.kind === 'attribute' ? [{ id: member.id, label: member.name, description: element.name, kind }] : []);
	});
}

function mappingActivity(context: BlueprintActivityContext): BlueprintActivity {
	const blueprint = declarations(context.model);
	const domains = domainFields(context.model);
	const physical = physicalFields(context.model);
	const qualified = (field: BlueprintOption | undefined, fallback: string) => field ? localize('ade.blueprint.form.qualifiedField', "{0}.{1}", field.description, field.label) : fallback;
	return {
		records: blueprint.fieldMappings.map(entry => ({
			id: entry.id,
			label: localize('ade.blueprint.form.mappingLabel', "{0} → {1}", qualified(domains.find(field => field.id === entry.domainFieldId), entry.domainFieldId), qualified(physical.find(field => field.id === entry.targetFieldId), entry.targetFieldId))
		})),
		initialId: matchingElement(blueprint.fieldMappings, context.targetId, (entry, id) => entry.domainFieldId === id || entry.targetFieldId === id),
		createLabel: localize('ade.blueprint.form.addMapping', "Add Field Mapping"),
		render(form, recordId) {
			const entry = blueprint.fieldMappings.find(item => item.id === recordId);
			const path = form.group(localize('ade.blueprint.form.mappingEndpoints', "Source and Destination"), localize('ade.blueprint.form.mappingPurpose', "Map a field from a shared record to a column or class attribute."));
			const domain = modelSelect(form, path, localize('ade.blueprint.form.domainField', "Domain Field"), domainFields, entry?.domainFieldId ?? domains.find(field => field.id === context.targetId)?.id);
			const target = modelSelect(form, path, localize('ade.blueprint.form.physicalField', "Physical Column or Class Attribute"), physicalFields, entry?.targetFieldId ?? physical.find(field => field.id === context.targetId)?.id);
			if (!physical.length) {
				form.note(path, localize('ade.blueprint.form.noPhysicalFields', "Declare a table column or class attribute before creating the mapping."));
			}
			related(form, path, localize('ade.blueprint.form.openDomainType', "Open Domain Type"), 'types', () => domainFields(context.model).find(field => field.id === domain.value)?.typeId);
			form.onEdit(model => {
				if (!domain.value || !target.value) { return undefined; }
				const destination = physicalFields(model).find(field => field.id === target.value);
				if (!destination) { throw new Error(localize('ade.blueprint.form.unavailableDestination', "Choose an existing physical column or class attribute.")); }
				const existing = declarations(model).fieldMappings.find(item => item.domainFieldId === domain.value && item.targetFieldId === destination.id);
				if (existing && existing.id !== entry?.id) {
					throw new Error(localize('ade.blueprint.form.duplicateMapping', "These fields already have a mapping. Select it to make changes."));
				}
				return { kind: 'blueprint', section: 'fieldMappings', entry: { id: entry?.id ?? form.newId, domainFieldId: domain.value, targetFieldId: destination.id, targetKind: destination.kind } };
			});
		}
	};
}

/** Activities that connect model elements or declare implementation bindings. */
export function blueprintConnectionActivity(mode: BlueprintEditMode, context: BlueprintActivityContext): BlueprintActivity | undefined {
	switch (mode) {
		case 'integration': return integrationActivity(context);
		case 'binding': return platformActivity(context);
		case 'ports': return portActivity(context);
		case 'connections': return connectionActivity(context);
		case 'transports': return transportActivity(context);
		case 'modules': return moduleActivity(context);
		case 'mapping': return mappingActivity(context);
		default: return undefined;
	}
}
