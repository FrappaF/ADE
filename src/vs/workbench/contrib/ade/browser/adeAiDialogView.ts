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

/** A transient, focus-trapping surface. Only generated project artifacts outlive its closure. */
export class AdeAiDialog extends Disposable {
	readonly element: HTMLDialogElement;
	readonly content: HTMLElement;
	get token() { return this.cancellation.token; }
	private readonly cancellation = this._register(new CancellationTokenSource());
	private readonly restoreFocus = AdeControls.captureActiveFocus();
	private closed = false;
	private progress: HTMLElement | undefined;
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
		transcript.setAttribute('role', 'log'); transcript.setAttribute('aria-live', 'polite');
		const status = dom.append(this.content, dom.$('p.ade-ai-dialog-status')); status.setAttribute('role', 'status');
		this.progress = status;
		const form = dom.append(this.content, dom.$<HTMLFormElement>('form.ade-ai-composer'));
		const input = dom.append(form, dom.$<HTMLTextAreaElement>('textarea'));
		input.setAttribute('aria-label', localize('ade.ai.dialog.message', "Message the Assistant")); input.rows = 3;
		input.placeholder = localize('ade.ai.dialog.placeholder', "Describe the diagrams or changes you need…");
		input.value = this.options.prompt ?? '';
		const send = dom.append(form, dom.$<HTMLButtonElement>('button')); send.type = 'submit'; send.textContent = localize('ade.ai.dialog.send', "Send");
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
			send.disabled = true; input.disabled = true; this.content.setAttribute('aria-busy', 'true');
			status.setAttribute('role', 'status');
			status.textContent = localize('ade.ai.dialog.working', "Working… You Can Close This Dialog to Stop. Completed Drafts Are Saved.");
			try {
				const response = await this.options.send(structuredClone(this.messages), this.cancellation.token);
				if (this.closed) { return; }
				this.messages.push({ role: 'assistant', text: response }); append(this.messages[this.messages.length - 1]); status.textContent = '';
			} catch (error) {
				if (!this.closed) { status.textContent = error instanceof Error ? error.message : String(error); status.setAttribute('role', 'alert'); }
			} finally {
				if (!this.closed) { send.disabled = false; input.disabled = false; this.content.setAttribute('aria-busy', 'false'); input.focus(); }
			}
		}));
		input.focus();
	}

	updateProgress(message: string): void { if (!this.closed && this.progress) { this.progress.textContent = message; } }

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
