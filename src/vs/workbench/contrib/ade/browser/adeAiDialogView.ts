/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/ade.css';
import * as dom from '../../../../base/browser/dom.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { AdeControls } from './adeControls.js';
import { type AdeAiDialogOptions, type AdeAiMessage } from './adeAiDialog.js';
import { type CodeAiProgress } from '../common/codeBridge.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import '../../../../base/browser/ui/codicons/codicon/codicon-modifiers.css';

/** A transient, focus-trapping surface. Only generated project artifacts outlive its closure. */
export class AdeAiDialog extends Disposable {
	readonly element: HTMLDialogElement;
	readonly content: HTMLElement;
	get token() { return this.cancellation.token; }
	private readonly cancellation = this._register(new CancellationTokenSource());
	private readonly restoreFocus = AdeControls.captureActiveFocus();
	private closed = false;
	private progress: HTMLElement | undefined;
	private executionStatus: HTMLElement | undefined;
	private transcript: HTMLElement | undefined;
	private turnActive = false;
	private readonly responses = new Map<string, { text: string; element: HTMLElement }>();
	private readonly messages: AdeAiMessage[] = [];

	constructor(parent: HTMLElement, private readonly options: AdeAiDialogOptions) {
		super();
		this.element = dom.append(parent, dom.$<HTMLDialogElement>('dialog.ade-ai-dialog'));
		this.element.setAttribute('aria-label', localize('ade.ai.dialog.title', "A.D.E Assistant"));
		const header = dom.append(this.element, dom.$('header.ade-ai-dialog-header'));
		dom.append(header, dom.$('h2')).textContent = localize('ade.ai.dialog.title', "A.D.E Assistant");
		const close = dom.append(header, dom.$<HTMLButtonElement>('button'));
		close.type = 'button'; close.textContent = localize('ade.ai.dialog.close', "Close");
		this._register(dom.addDisposableListener(close, 'click', () => { void this.close(); }));
		dom.append(this.element, dom.$('p.ade-ai-dialog-hint')).textContent = localize('ade.ai.dialog.transient', "This conversation resets when closed. Prepared diagrams stay in your project and update automatically.");
		this.content = dom.append(this.element, dom.$('div.ade-ai-dialog-content'));
		this._register(dom.addDisposableListener(this.element, 'cancel', event => { event.preventDefault(); void this.close(); }));
		this.element.showModal();
	}

	showConversation(): void {
		const transcript = dom.append(this.content, dom.$('div.ade-ai-transcript'));
		this.transcript = transcript;
		transcript.setAttribute('role', 'log'); transcript.setAttribute('aria-live', 'polite');
		const status = dom.append(this.content, dom.$('p.ade-ai-dialog-status')); status.setAttribute('role', 'status');
		this.executionStatus = status;
		this.progress = dom.append(this.content, dom.$('p.ade-ai-dialog-status'));
		const form = dom.append(this.content, dom.$<HTMLFormElement>('form.ade-ai-composer'));
		const input = dom.append(form, dom.$<HTMLTextAreaElement>('textarea'));
		input.setAttribute('aria-label', localize('ade.ai.dialog.message', "Message the Assistant")); input.rows = 3;
		input.placeholder = localize('ade.ai.dialog.placeholder', "Describe the diagrams or changes you need…");
		input.setAttribute('aria-description', localize('ade.ai.dialog.keyboard', "Enter to Send. Shift+Enter for a New Line."));
		input.value = this.options.prompt ?? '';
		const send = dom.append(form, dom.$<HTMLButtonElement>('button')); send.type = 'submit'; send.textContent = localize('ade.ai.dialog.send', "Send");
		const setSending = (active: boolean) => {
			send.disabled = active; send.setAttribute('aria-busy', String(active)); dom.clearNode(send);
			if (active) { const icon = renderIcon(ThemeIcon.modify(Codicon.loading, 'spin')); icon.setAttribute('aria-hidden', 'true'); send.appendChild(icon); }
			dom.append(send, dom.$('span')).textContent = active ? localize('ade.ai.dialog.sending', "Working…") : localize('ade.ai.dialog.send', "Send");
		};
		this._register(dom.addDisposableListener(input, 'keydown', (event: KeyboardEvent) => {
			if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) { return; }
			event.preventDefault(); event.stopPropagation();
			if (!event.repeat && !send.disabled) { form.requestSubmit(send); }
		}));
		const append = (message: AdeAiMessage) => {
			const article = dom.append(transcript, dom.$('article.ade-ai-message'));
			dom.append(article, dom.$('strong')).textContent = message.role === 'user' ? localize('ade.ai.dialog.you', "You") : localize('ade.ai.dialog.assistant', "Assistant");
			dom.append(article, dom.$('div')).textContent = message.text;
			transcript.scrollTop = transcript.scrollHeight;
		};
		this._register(dom.addDisposableListener(form, 'submit', async event => {
			event.preventDefault();
			const text = input.value.trim();
			if (!text || send.disabled || !this.options.send) { return; }
			this.messages.push({ role: 'user', text }); append(this.messages[this.messages.length - 1]); input.value = '';
			setSending(true); input.disabled = true; this.content.setAttribute('aria-busy', 'true');
			this.turnActive = true; this.responses.clear();
			status.setAttribute('role', 'status');
			status.textContent = localize('ade.ai.dialog.working', "Working… You Can Close This Dialog to Stop. Completed Drafts Are Saved.");
			try {
				const response = await this.options.send(structuredClone(this.messages), this.cancellation.token);
				if (this.closed) { return; }
				this.messages.push({ role: 'assistant', text: response });
				if (![...this.responses.values()].some(item => item.text.trimEnd() === response.trimEnd())) { append(this.messages[this.messages.length - 1]); }
				status.textContent = '';
			} catch (error) {
				if (!this.closed) { status.textContent = error instanceof Error ? error.message : String(error); status.setAttribute('role', 'alert'); }
			} finally {
				this.turnActive = false;
				if (!this.closed) { setSending(false); input.disabled = false; this.content.setAttribute('aria-busy', 'false'); input.focus(); }
			}
		}));
		input.focus();
	}

	updateProgress(message: string): void { if (!this.closed && this.progress) { this.progress.textContent = message; } }

	updateConversation(event: CodeAiProgress): void {
		if (this.closed || !this.turnActive || !this.executionStatus || !this.transcript) { return; }
		if (event.kind === 'message' && event.text) {
			const id = event.itemId ?? 'response';
			let item = this.responses.get(id);
			if (!item) {
				const article = dom.append(this.transcript, dom.$('article.ade-ai-message'));
				dom.append(article, dom.$('strong')).textContent = localize('ade.ai.dialog.assistant', "Assistant");
				item = { text: '', element: dom.append(article, dom.$('div')) }; this.responses.set(id, item);
			}
			item.text = event.text; item.element.textContent = event.text;
			this.transcript.scrollTop = this.transcript.scrollHeight;
		}
		const tools: Record<string, string> = {
			ade_project_inspect: localize('ade.ai.progress.inspect', "Inspecting the Project and Saved Drafts…"),
			ade_source_search: localize('ade.ai.progress.search', "Searching Project Sources…"),
			ade_source_read: localize('ade.ai.progress.read', "Reading Project Sources…"),
			ade_model_propose: localize('ade.ai.progress.propose', "Preparing a Diagram Draft…"),
			ade_view_preview: localize('ade.ai.progress.preview', "Checking a Diagram Preview…"),
			ade_proposal_discard: localize('ade.ai.progress.discard', "Archiving an Obsolete Invalid Draft…")
		};
		this.executionStatus.textContent = event.kind === 'connecting' ? localize('ade.ai.progress.connect', "Connecting to the Assistant and Project Tools…") : event.kind === 'waiting' ? localize('ade.ai.progress.waiting', "The Provider Connection Was Interrupted. Waiting for Its Retry… You Can Close the Assistant to Stop.") : event.kind === 'tool' ? tools[event.tool ?? ''] ?? localize('ade.ai.progress.tool', "Updating Project Diagrams…") : localize('ade.ai.progress.thinking', "Waiting for the Assistant…");
	}

	async close(): Promise<void> {
		if (this.closed) { return; }
		this.closed = true; this.cancellation.cancel(); this.messages.length = 0;
		this.element.close(); this.element.remove();
		try { await this.options.onClose(); }
		finally { this.dispose(); this.restoreFocus(); }
	}

	override dispose(): void {
		this.cancellation.cancel(); this.element.remove(); this.messages.length = 0;
		super.dispose();
	}
}
