from gateway import charge as pay

def checkout(amount: float) -> bool:
	marker = '😀'; return pay(amount)
