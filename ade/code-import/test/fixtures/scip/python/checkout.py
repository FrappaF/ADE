# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See License.txt in the project root for license information.

from gateway import charge as pay

def checkout(amount: float) -> bool:
	marker = '😀'; return pay(amount)
