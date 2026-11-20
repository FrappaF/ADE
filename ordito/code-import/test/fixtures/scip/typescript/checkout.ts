import { charge as pay } from './gateway.js';

export function checkout(amount: number): boolean {
	const marker = '😀'; return pay(amount);
}
