export interface Payment {
	amount: number;
	currency: string;
}

export class Checkout {
	pay(payment: Payment): boolean {
		return payment.amount > 0 && payment.currency === 'EUR';
	}
}
