import { Emitter } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';

export const IOrditoOperationService = createDecorator<OrditoOperationService>('orditoOperationService');

/** One project-changing operation at a time, including dialogs between worker requests. */
export class OrditoOperationService extends Disposable {
	declare readonly _serviceBrand: undefined;
	private readonly changes = this._register(new Emitter<void>());
	readonly onDidChange = this.changes.event;
	private owner: 'code' | 'ai' | undefined;
	get busy(): boolean { return this.owner !== undefined; }
	acquire(owner: 'code' | 'ai'): IDisposable | undefined {
		if (this.owner) { return undefined; }
		this.owner = owner; this.changes.fire();
		return toDisposable(() => { this.owner = undefined; this.changes.fire(); });
	}
}
registerSingleton(IOrditoOperationService, OrditoOperationService, InstantiationType.Delayed);
