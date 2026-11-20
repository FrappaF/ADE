import { localize } from '../../../../nls.js';
import { describeModelInteraction } from '../common/modelInteractions.js';
import { describeModelExpression, describeModelVariable } from '../common/modelValues.js';
import { type SemanticModelV4 } from '../common/modelTypes.js';

/** Shared visual and accessible reading. Data labels are plain text and all UI prose is localized. */
export function orditoInteractionRows(model: SemanticModelV4, id: string): { id: string; depth: number; kind: string; text: string; label: string }[] {
	const elements = new Map(model.semantics.elements.map(element => [element.id, element.name]));
	return describeModelInteraction(model, id).map(row => {
		const call = model.foundation.occurrences.find(entry => entry.id === row.id), frame = model.foundation.frames.find(entry => entry.id === row.id);
		let text = row.id;
		if (frame?.kind === 'unspecified' && frame.description) {
			const label = frame.description.operator === 'alt' ? localize('ordito.scenario.alt', "Exclusive Alternatives") : frame.description.operator === 'par' ? localize('ordito.scenario.parallel', "Parallel Branches") : frame.description.operator === 'loop' ? localize('ordito.scenario.loop', "Descriptive Loop") : localize('ordito.scenario.optional', "Optional Branch");
			return { ...row, text: label, label };
		}
		if (row.kind === 'operand') {
			const operand = model.foundation.frames.flatMap(frame => frame.kind === 'unspecified' && frame.description ? frame.description.operands : []).find(operand => operand.id === row.id);
			if (operand) { const label = operand.condition.state === 'known' ? localize('ordito.scenario.condition', "Condition: {0}", String(operand.condition.value)) : localize('ordito.scenario.unknownCondition', "Condition Is Unknown"); return { ...row, text: label, label }; }
		}
		if (call?.profile === 'descriptive') {
			const alternatives = model.foundation.frames.flatMap(frame => frame.kind === 'unspecified' && frame.description ? frame.description.operands.filter(operand => operand.steps.includes(call.id)).map(operand => operand.condition.state === 'known' ? String(operand.condition.value) : '?') : []);
			const label = localize('ordito.scenario.message', "{0} → {1}: {2} · {3}", elements.get(call.from) ?? call.from, elements.get(call.to) ?? call.to, call.name ?? call.id, alternatives.join(' · '));
			return { ...row, text: label, label };
		}
		if (row.kind === 'unordered') { const label = localize('ordito.scenario.unordered', "Order Between the Following Events Is Unknown"); return { ...row, text: label, label }; }
		if (call) {
			const operation = model.foundation.blueprint?.operations.find(entry => entry.id === call.operationId), execution = call.execution;
			text = localize('ordito.interaction.read.message', "{0} → {1}: {2}. {3}. Result: {4}. Reply Required. Timeout: {5} ms. Errors Propagate. Arguments: {6}. Correlation: {7}.", elements.get(call.from) ?? call.from, elements.get(call.to) ?? call.to, operation?.name ?? call.operationId, execution?.mode === 'async' ? localize('ordito.interaction.read.async', "Asynchronous Local Call") : localize('ordito.interaction.read.sync', "Synchronous Call"), execution ? describeModelVariable(model, execution.resultId) : '?', execution?.timeoutMs ?? '?', execution?.arguments.map(arg => `${operation?.inputs.find(field => field.id === arg.fieldId)?.name ?? arg.fieldId} = ${describeModelExpression(model, arg.expression)}`).join(', ') || localize('ordito.interaction.noArguments', "None"), execution ? describeModelExpression(model, execution.correlation) : '?');
		} else if (frame?.kind === 'alt') { text = localize('ordito.interaction.read.alt', "Alternative · Exclusive Choice · Else Covers All Other Outcomes"); }
		else if (frame?.kind === 'opt') { text = localize('ordito.interaction.read.opt', "Optional · Guard: {0}", describeModelExpression(model, frame.guard)); }
		else if (frame?.kind === 'loop') { text = localize('ordito.interaction.read.loop', "Loop · Guard: {0} · Counter: {1} (Starts at Zero) · Maximum: {2} · Limit Exceeded Fails", describeModelExpression(model, frame.guard), describeModelVariable(model, frame.iterationId), frame.maxIterations); }
		else if (frame?.kind === 'par') { text = localize('ordito.interaction.read.par', "Parallel · Join All · {0} · Results in Declared Order", frame.failure === 'cancel' ? localize('ordito.interaction.read.cancel', "Cancel Remaining Branches and Drain") : localize('ordito.interaction.read.collect', "Collect All Outcomes")); }
		else if (frame?.kind === 'critical') { text = localize('ordito.interaction.read.critical', "Critical Region · Resource: {0} · Exclusion Within This Interaction", frame.resource); }
		else if (frame?.kind === 'ref') {
			const target = model.foundation.interactions.find(entry => entry.id === frame.interactionId), contract = model.foundation.blueprint?.operations.find(entry => entry.id === target?.execution?.operationId);
			text = localize('ordito.interaction.read.ref', "Reference: {0} · Revision: {1} · Contract: {2} · Arguments: {3} · Result: {4}", frame.interactionId, frame.revision, contract?.name ?? '?', frame.arguments.map(arg => `${contract?.inputs.find(field => field.id === arg.fieldId)?.name ?? arg.fieldId} = ${describeModelExpression(model, arg.expression)}`).join(', ') || localize('ordito.interaction.noArguments', "None"), frame.resultId);
		} else if (row.kind === 'operand') {
			const owner = model.foundation.frames.find(frame => (frame.kind === 'alt' || frame.kind === 'par') && frame.operands.some(operand => operand.id === row.id));
			const operand = owner?.kind === 'alt' ? owner.operands.find(operand => operand.id === row.id) : undefined;
			text = operand && 'guard' in operand ? operand.guard === null ? localize('ordito.interaction.read.else', "Else · Every Other Declared Outcome") : localize('ordito.interaction.read.guard', "Guard: {0}", describeModelExpression(model, operand.guard)) : localize('ordito.interaction.read.branchNumber', "Parallel Branch {0}", owner?.kind === 'par' ? owner.operands.findIndex(operand => operand.id === row.id) + 1 : '?');
		}
		const operation = call ? model.foundation.blueprint?.operations.find(entry => entry.id === call.operationId) : undefined;
		const label = call ? localize('ordito.interaction.read.callSummary', "{0} → {1} · {2}\n{3} · Reply Within {4}\u00a0ms", elements.get(call.from) ?? call.from, elements.get(call.to) ?? call.to, operation?.name ?? call.operationId, call.execution?.mode === 'async' ? localize('ordito.interaction.read.async', "Asynchronous Local Call") : localize('ordito.interaction.read.sync', "Synchronous Call"), call.execution?.timeoutMs ?? '?') : text;
		return { ...row, text, label };
	});
}
