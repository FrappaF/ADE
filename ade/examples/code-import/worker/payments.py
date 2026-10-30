# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

class PaymentWorker:
	def charge(self, amount: float) -> bool:
		return amount > 0
