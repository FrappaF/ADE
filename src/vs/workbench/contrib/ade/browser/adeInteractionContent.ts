/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { describeModelInteraction } from '../common/modelInteractions.js';
import { describeModelExpression, describeModelVariable } from '../common/modelValues.js';
import { type SemanticModelV4 } from '../common/modelTypes.js';

/** Shared visual and accessible reading. Data labels are plain text and all UI prose is localized. */
export function adeInteractionRows(model: SemanticModelV4, id: string): { id: string; depth: number; kind: string; text: string; label: string }[] {
	const elements = new Map(model.semantics.elements.map(element => [element.id, element.name]));
	return describeModelInteraction(model, id).map(row => {
		const call = model.foundation.occurrences.find(entry => entry.id === row.id), frame = model.foundation.frames.find(entry => entry.id === row.id);
		let text = row.id;
		if (frame?.kind === 'unspecified' && frame.description) {
			const label = frame.description.operator === 'alt' ? localize('ade.scenario.alt', "Exclusive Alternatives") : frame.description.operator === 'par' ? localize('ade.scenario.parallel', "Parallel Branches") : frame.description.operator === 'loop' ? localize('ade.scenario.loop', "Descriptive Loop") : localize('ade.scenario.optional', "Optional Branch");
			return { ...row, text: label, label };
		}
		if (row.kind === 'operand') {
			const operand = model.foundation.frames.flatMap(frame => frame.kind === 'unspecified' && frame.description ? frame.description.operands : []).find(operand => operand.id === row.id);
			if (operand) { const label = operand.condition.state === 'known' ? localize('ade.scenario.condition', "Condition: {0}", String(operand.condition.value)) : localize('ade.scenario.unknownCondition', "Condition Is Unknown"); return { ...row, text: label, label }; }
		}
		if (call?.profile === 'descriptive') {
			const alternatives = model.foundation.frames.flatMap(frame => frame.kind === 'unspecified' && frame.description ? frame.description.operands.filter(operand => operand.steps.includes(call.id)).map(operand => operand.condition.state === 'known' ? String(operand.condition.value) : '?') : []);
			const label = localize('ade.scenario.message', "{0} → {1}: {2} · {3}", elements.get(call.from) ?? call.from, elements.get(call.to) ?? call.to, call.name ?? call.id, alternatives.join(' · '));
			return { ...row, text: label, label };
		}
		if (row.kind === 'unordered') { const label = localize('ade.scenario.unordered', "Order Between the Following Events Is Unknown"); return { ...row, text: label, label }; }
		if (call) {
			const operation = model.foundation.blueprint?.operations.find(entry => entry.id === call.operationId), execution = call.execution;
			text = localize('ade.interaction.read.message', "{0} → {1}: {2}. {3}. Result: {4}. Reply Required. Timeout: {5} ms. Errors Propagate. Arguments: {6}. Correlation: {7}.", elements.get(call.from) ?? call.from, elements.get(call.to) ?? call.to, operation?.name ?? call.operationId, execution?.mode === 'async' ? localize('ade.interaction.read.async', "Asynchronous Local Call") : localize('ade.interaction.read.sync', "Synchronous Call"), execution ? describeModelVariable(model, execution.resultId) : '?', execution?.timeoutMs ?? '?', execution?.arguments.map(arg => `${operation?.inputs.find(field => field.id === arg.fieldId)?.name ?? arg.fieldId} = ${describeModelExpression(model, arg.expression)}`).join(', ') ?? '', execution ? describeModelExpression(model, execution.correlation) : '?');
		} else if (frame?.kind === 'alt') { text = localize('ade.interaction.read.alt', "Alternative · Exclusive Choice · Else Covers All Other Outcomes"); }
		else if (frame?.kind === 'opt') { text = localize('ade.interaction.read.opt', "Optional · Guard: {0}", describeModelExpression(model, frame.guard)); }
		else if (frame?.kind === 'loop') { text = localize('ade.interaction.read.loop', "Loop · Guard: {0} · Counter: {1} (Starts at Zero) · Maximum: {2} · Limit Exceeded Fails", describeModelExpression(model, frame.guard), frame.iterationId, frame.maxIterations); }
		else if (frame?.kind === 'par') { text = localize('ade.interaction.read.par', "Parallel · Join All · {0} · Results in Declared Order", frame.failure === 'cancel' ? localize('ade.interaction.read.cancel', "Cancel Remaining Branches and Drain") : localize('ade.interaction.read.collect', "Collect All Outcomes")); }
		else if (frame?.kind === 'critical') { text = localize('ade.interaction.read.critical', "Critical Region · Resource: {0} · Exclusion Within This Interaction", frame.resource); }
		else if (frame?.kind === 'ref') {
			const target = model.foundation.interactions.find(entry => entry.id === frame.interactionId), contract = model.foundation.blueprint?.operations.find(entry => entry.id === target?.execution?.operationId);
			text = localize('ade.interaction.read.ref', "Reference: {0} · Revision: {1} · Contract: {2} · Arguments: {3} · Result: {4}", frame.interactionId, frame.revision, contract?.name ?? '?', frame.arguments.map(arg => `${contract?.inputs.find(field => field.id === arg.fieldId)?.name ?? arg.fieldId} = ${describeModelExpression(model, arg.expression)}`).join(', '), frame.resultId);
		} else if (row.kind === 'operand') {
			const owner = model.foundation.frames.find(frame => frame.kind === 'alt' && frame.operands.some(operand => operand.id === row.id));
			const operand = owner?.kind === 'alt' ? owner.operands.find(operand => operand.id === row.id) : undefined;
			text = operand && 'guard' in operand ? operand.guard === null ? localize('ade.interaction.read.else', "Else · Every Other Declared Outcome") : localize('ade.interaction.read.guard', "Guard: {0}", describeModelExpression(model, operand.guard)) : localize('ade.interaction.read.branch', "Parallel Branch");
		}
		const operation = call ? model.foundation.blueprint?.operations.find(entry => entry.id === call.operationId) : undefined;
		const label = call ? localize('ade.interaction.read.callSummary', "{0} → {1} · {2}\n{3} · Reply Within {4} ms", elements.get(call.from) ?? call.from, elements.get(call.to) ?? call.to, operation?.name ?? call.operationId, call.execution?.mode === 'async' ? localize('ade.interaction.read.async', "Asynchronous Local Call") : localize('ade.interaction.read.sync', "Synchronous Call"), call.execution?.timeoutMs ?? '?') : text;
		return { ...row, text, label };
	});
}
