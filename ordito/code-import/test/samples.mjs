/** Small independent source inputs; these are parsed, never executed. */
export const samples = [
	['javascript', 'checkout.js', 'import { charge } from "./gateway.js"; export class Checkout { pay(amount) { return charge(amount); } }'],
	['typescript', 'checkout.ts', 'import { charge } from "./gateway.js"; export interface Payment { amount: number; } export class Checkout { pay(amount: number): boolean { return charge(amount); } }'],
	['tsx', 'checkout.tsx', 'import React from "react"; export function Checkout() { return <button>Pay</button>; }'],
	['python', 'checkout.py', 'from gateway import charge\nclass Checkout:\n    def pay(self, amount: float) -> bool:\n        return charge(amount)\n'],
	['java', 'Checkout.java', 'import payments.Gateway; public class Checkout { public boolean pay(double amount) { return Gateway.charge(amount); } }'],
	['csharp', 'Checkout.cs', 'using Payments; public class Checkout { public bool Pay(double amount) { return Gateway.Charge(amount); } }'],
	['c', 'checkout.c', '#include "gateway.h"\nstruct Checkout { int amount; };\nint pay(int amount) { return charge(amount); }'],
	['cpp', 'checkout.cpp', '#include "gateway.hpp"\nclass Checkout { public: bool pay(double amount) { return charge(amount); } };'],
	['go', 'checkout.go', 'package checkout\nimport "payments"\ntype Checkout struct {}\nfunc (c Checkout) Pay(amount float64) bool { return payments.Charge(amount) }'],
	['rust', 'checkout.rs', 'use payments::charge;\nstruct Checkout {}\nimpl Checkout { fn pay(&self, amount: f64) -> bool { charge(amount) } }'],
	['php', 'checkout.php', '<?php\nuse Payments\\Gateway;\nclass Checkout { public function pay(float $amount): bool { return Gateway::charge($amount); } }'],
	['ruby', 'checkout.rb', 'require "gateway"\nclass Checkout\n  def pay(amount)\n    charge(amount)\n  end\nend\n'],
	['swift', 'checkout.swift', 'import Payments\nclass Checkout { func pay(amount: Double) -> Bool { return charge(amount) } }'],
	['dart', 'checkout.dart', 'import "gateway.dart";\nclass Checkout { bool pay(double amount) { return charge(amount); } }'],
	['kotlin', 'Checkout.kt', 'import payments.charge\nclass Checkout {\n fun pay(amount: Double): Boolean {\n  return charge(amount)\n }\n}\n'],
	['scala', 'Checkout.scala', 'import payments.charge\nclass Checkout {\n def pay(amount: Double): Boolean = { charge(amount) }\n}\n']
];
