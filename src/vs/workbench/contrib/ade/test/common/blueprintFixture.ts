/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type SemanticModelV4 } from '../../common/modelTypes.js';

/** Authored structural fixture for portable workbench tests; no Node filesystem dependency. */
export const blueprintFixture: SemanticModelV4 = {
	"version": 4,
	"id": "blueprint.checkout",
	"name": "Checkout Blueprint",
	"semantics": {
		"elements": [
			{
				"id": "person.buyer",
				"kind": "actor",
				"name": "Buyer"
			},
			{
				"id": "system.shop",
				"kind": "system",
				"name": "Shop",
				"scope": "governed"
			},
			{
				"id": "system.payments",
				"kind": "system",
				"name": "Payments",
				"scope": "external"
			},
			{
				"id": "container.api",
				"kind": "container",
				"name": "API",
				"runtimeKind": "service",
				"description": "Owns checkout and audit responsibilities"
			},
			{
				"id": "container.store",
				"kind": "container",
				"name": "Store",
				"runtimeKind": "store",
				"description": "Stores orders and stock"
			},
			{
				"id": "component.checkout",
				"kind": "component",
				"name": "Checkout",
				"description": "Confirms an order and requests stock"
			},
			{
				"id": "component.audit",
				"kind": "component",
				"name": "Audit",
				"description": "Records checkout outcomes"
			},
			{
				"id": "component.stock",
				"kind": "component",
				"name": "Stock",
				"description": "Reserves available stock"
			},
			{
				"id": "package.money",
				"kind": "package",
				"name": "Money",
				"description": "Shared nondeployable money definitions"
			},
			{
				"id": "contract.checkout",
				"kind": "contract",
				"name": "Checkout API"
			},
			{
				"id": "contract.stockRequired",
				"kind": "interface",
				"name": "Stock Required"
			},
			{
				"id": "contract.stockProvided",
				"kind": "interface",
				"name": "Stock Provided"
			},
			{
				"id": "feature.checkout",
				"kind": "feature",
				"name": "Checkout"
			},
			{
				"id": "feature.audit",
				"kind": "feature",
				"name": "Audit"
			}
		],
		"relations": [
			{
				"id": "relation.buyer",
				"kind": "invocation",
				"from": "person.buyer",
				"to": "system.shop",
				"name": "Place order"
			},
			{
				"id": "relation.payments",
				"kind": "invocation",
				"from": "component.checkout",
				"to": "system.payments",
				"name": "Authorize payment"
			},
			{
				"id": "relation.stock",
				"kind": "dependency",
				"from": "component.checkout",
				"to": "component.stock",
				"name": "Reserve stock"
			}
		]
	},
	"views": [
		{
			"id": "c4.l1",
			"name": "Shop Context",
			"kind": "c4Context",
			"subjectId": "system.shop",
			"contextIds": [
				"person.buyer",
				"system.payments"
			],
			"nodes": [
				{
					"elementId": "person.buyer",
					"x": 0,
					"y": 0
				},
				{
					"elementId": "system.shop",
					"x": 260,
					"y": 0
				},
				{
					"elementId": "system.payments",
					"x": 520,
					"y": 0
				}
			],
			"relationIds": [
				"relation.buyer"
			]
		},
		{
			"id": "c4.l2",
			"name": "Shop Containers",
			"kind": "c4Container",
			"subjectId": "system.shop",
			"contextIds": [
				"system.payments"
			],
			"nodes": [
				{
					"elementId": "system.shop",
					"x": 0,
					"y": 0
				},
				{
					"elementId": "container.api",
					"x": 260,
					"y": 0
				},
				{
					"elementId": "container.store",
					"x": 520,
					"y": 0
				},
				{
					"elementId": "system.payments",
					"x": 0,
					"y": 180
				}
			],
			"relationIds": []
		},
		{
			"id": "c4.l3",
			"name": "API Components",
			"kind": "c4Component",
			"subjectId": "container.api",
			"contextIds": [
				"package.money",
				"component.stock",
				"contract.checkout"
			],
			"nodes": [
				{
					"elementId": "container.api",
					"x": 0,
					"y": 0
				},
				{
					"elementId": "component.checkout",
					"x": 260,
					"y": 0
				},
				{
					"elementId": "component.audit",
					"x": 520,
					"y": 0
				},
				{
					"elementId": "package.money",
					"x": 0,
					"y": 180
				},
				{
					"elementId": "component.stock",
					"x": 800,
					"y": 180
				},
				{
					"elementId": "contract.checkout",
					"x": 520,
					"y": 180
				}
			],
			"relationIds": [
				"relation.stock"
			]
		},
		{
			"id": "c4.l4",
			"name": "Checkout Contract",
			"kind": "class",
			"subjectId": "contract.checkout",
			"contextIds": [],
			"nodes": [
				{
					"elementId": "contract.checkout",
					"x": 0,
					"y": 0
				}
			],
			"relationIds": []
		}
	],
	"foundation": {
		"ownership": [
			{
				"id": "ownership.container.api",
				"elementId": "container.api",
				"ownerId": "system.shop",
				"role": "architecture"
			},
			{
				"id": "ownership.container.store",
				"elementId": "container.store",
				"ownerId": "system.shop",
				"role": "architecture"
			},
			{
				"id": "ownership.component.checkout",
				"elementId": "component.checkout",
				"ownerId": "container.api",
				"role": "architecture"
			},
			{
				"id": "ownership.component.audit",
				"elementId": "component.audit",
				"ownerId": "container.api",
				"role": "architecture"
			},
			{
				"id": "ownership.component.stock",
				"elementId": "component.stock",
				"ownerId": "container.store",
				"role": "architecture"
			},
			{
				"id": "ownership.package.money",
				"elementId": "package.money",
				"ownerId": "system.shop",
				"role": "architecture"
			},
			{
				"id": "ownership.contract.checkout",
				"elementId": "contract.checkout",
				"ownerId": "component.checkout",
				"role": "architecture"
			},
			{
				"id": "ownership.contract.stockRequired",
				"elementId": "contract.stockRequired",
				"ownerId": "component.checkout",
				"role": "architecture"
			},
			{
				"id": "ownership.contract.stockProvided",
				"elementId": "contract.stockProvided",
				"ownerId": "component.stock",
				"role": "architecture"
			}
		],
		"memberships": [
			{
				"id": "membership.feature.checkout.component.checkout",
				"elementId": "component.checkout",
				"featureId": "feature.checkout"
			},
			{
				"id": "membership.feature.checkout.package.money",
				"elementId": "package.money",
				"featureId": "feature.checkout"
			},
			{
				"id": "membership.feature.audit.component.audit",
				"elementId": "component.audit",
				"featureId": "feature.audit"
			},
			{
				"id": "membership.feature.audit.package.money",
				"elementId": "package.money",
				"featureId": "feature.audit"
			}
		],
		"integrations": [
			{
				"id": "integration.payments",
				"consumerId": "component.checkout",
				"externalId": "system.payments"
			}
		],
		"types": [
			{
				"id": "type.text",
				"name": "String",
				"kind": "primitive",
				"primitive": "string",
				"fields": []
			},
			{
				"id": "type.count",
				"name": "Integer",
				"kind": "primitive",
				"primitive": "integer",
				"fields": []
			},
			{
				"id": "type.order",
				"name": "Order",
				"kind": "record",
				"fields": [
					{
						"id": "field.orderId",
						"name": "orderId",
						"type": "",
						"typeId": "type.text",
						"required": true,
						"nullable": {
							"state": "known",
							"value": false
						}
					}
				]
			},
			{
				"id": "type.failure",
				"name": "Failure",
				"kind": "record",
				"fields": [
					{
						"id": "field.failureCode",
						"name": "code",
						"type": "",
						"typeId": "type.text",
						"required": true,
						"nullable": {
							"state": "known",
							"value": false
						}
					}
				]
			},
			{
				"id": "type.status",
				"name": "Status",
				"kind": "enum",
				"values": [
					"confirmed",
					"refused"
				],
				"fields": []
			},
			{
				"id": "type.orders",
				"name": "Orders",
				"kind": "collection",
				"itemTypeId": "type.order",
				"fields": []
			},
			{
				"id": "type.orderRef",
				"name": "Order Reference",
				"kind": "reference",
				"targetTypeId": "type.order",
				"fields": []
			}
		],
		"occurrences": [
			{
				"id": "call.reserve.1",
				"operationId": "operation.reserve",
				"from": "component.checkout",
				"to": "component.stock"
			},
			{
				"id": "call.reserve.2",
				"operationId": "operation.reserve",
				"from": "component.checkout",
				"to": "component.stock"
			}
		],
		"frames": [],
		"interactions": [],
		"assertions": [],
		"platform": {
			"bindings": [
				{
					"id": "binding.container.api",
					"elementId": "container.api",
					"profileId": "fixture.spec",
					"technology": {
						"state": "known",
						"value": "fixture-runtime"
					}
				},
				{
					"id": "binding.container.store",
					"elementId": "container.store",
					"profileId": "fixture.spec",
					"technology": {
						"state": "known",
						"value": "fixture-runtime"
					}
				}
			]
		},
		"decisions": [
			{
				"id": "adr.transport",
				"revision": "adr.1",
				"status": "accepted",
				"scopeIds": [
					"component.checkout"
				],
				"constraints": [
					{
						"id": "constraint.protocol",
						"category": "protocol",
						"subject": {
							"kind": "transport",
							"id": "transport.stock"
						},
						"field": "/protocol",
						"value": {
							"state": "known",
							"value": "fixture-protocol"
						}
					}
				],
				"record": {
					"number": "1",
					"title": "Declared stock protocol",
					"context": "Checkout calls the stock provider",
					"decision": "Use the declared protocol for stock requests",
					"consequences": [
						"Requests have a versioned payload"
					],
					"history": []
				}
			},
			{
				"id": "adr.unrelated",
				"revision": "adr.1",
				"status": "proposed",
				"scopeIds": [
					"feature.audit"
				],
				"constraints": [],
				"record": {
					"number": "2",
					"title": "Audit draft",
					"context": "Unresolved audit design",
					"decision": "Pending",
					"consequences": [],
					"history": []
				}
			}
		],
		"blueprint": {
			"operations": [
				{
					"id": "operation.confirm",
					"ownerId": "contract.checkout",
					"name": "confirmOrder",
					"inputs": [
						{
							"id": "input.operation.confirm",
							"name": "order",
							"type": "",
							"typeId": "type.order",
							"required": true,
							"nullable": {
								"state": "known",
								"value": false
							}
						}
					],
					"outputs": [
						{
							"id": "output.operation.confirm",
							"name": "result",
							"type": "",
							"typeId": "type.status",
							"required": true,
							"nullable": {
								"state": "known",
								"value": false
							}
						}
					],
					"errors": [
						{
							"id": "error.operation.confirm",
							"code": "OUT_OF_STOCK",
							"description": "The requested stock is unavailable",
							"typeId": "type.failure"
						}
					],
					"effects": [
						"stock.reserve"
					],
					"preconditions": [
						"An order has at least one item"
					],
					"postconditions": [
						"The outcome is recorded"
					],
					"permissions": [
						{
							"actorId": "person.buyer",
							"capability": "checkout"
						}
					],
					"acceptanceCriteria": [
						{
							"id": "criterion.operation.confirm",
							"given": "Available stock",
							"when": "An order is confirmed",
							"then": "Stock is reserved once"
						}
					]
				},
				{
					"id": "operation.reserveRequired",
					"ownerId": "contract.stockRequired",
					"name": "reserveStock",
					"inputs": [
						{
							"id": "input.operation.reserveRequired",
							"name": "order",
							"type": "",
							"typeId": "type.order",
							"required": true,
							"nullable": {
								"state": "known",
								"value": false
							}
						}
					],
					"outputs": [
						{
							"id": "output.operation.reserveRequired",
							"name": "result",
							"type": "",
							"typeId": "type.status",
							"required": true,
							"nullable": {
								"state": "known",
								"value": false
							}
						}
					],
					"errors": [
						{
							"id": "error.operation.reserveRequired",
							"code": "OUT_OF_STOCK",
							"description": "The requested stock is unavailable",
							"typeId": "type.failure"
						}
					],
					"effects": [
						"stock.reserve"
					],
					"preconditions": [
						"An order has at least one item"
					],
					"postconditions": [
						"The outcome is recorded"
					],
					"permissions": [
						{
							"actorId": "person.buyer",
							"capability": "checkout"
						}
					],
					"acceptanceCriteria": [
						{
							"id": "criterion.operation.reserveRequired",
							"given": "Available stock",
							"when": "An order is confirmed",
							"then": "Stock is reserved once"
						}
					]
				},
				{
					"id": "operation.reserve",
					"ownerId": "contract.stockProvided",
					"name": "reserveStock",
					"inputs": [
						{
							"id": "input.operation.reserve",
							"name": "order",
							"type": "",
							"typeId": "type.order",
							"required": true,
							"nullable": {
								"state": "known",
								"value": false
							}
						}
					],
					"outputs": [
						{
							"id": "output.operation.reserve",
							"name": "result",
							"type": "",
							"typeId": "type.status",
							"required": true,
							"nullable": {
								"state": "known",
								"value": false
							}
						}
					],
					"errors": [
						{
							"id": "error.operation.reserve",
							"code": "OUT_OF_STOCK",
							"description": "The requested stock is unavailable",
							"typeId": "type.failure"
						}
					],
					"effects": [
						"stock.reserve"
					],
					"preconditions": [
						"An order has at least one item"
					],
					"postconditions": [
						"The outcome is recorded"
					],
					"permissions": [
						{
							"actorId": "person.buyer",
							"capability": "checkout"
						}
					],
					"acceptanceCriteria": [
						{
							"id": "criterion.operation.reserve",
							"given": "Available stock",
							"when": "An order is confirmed",
							"then": "Stock is reserved once"
						}
					]
				}
			],
			"interfaces": [
				{
					"id": "interface.checkout",
					"elementId": "contract.checkout",
					"version": "1",
					"operationIds": [
						"operation.confirm"
					],
					"invariants": [
						"Contract members are shared by identity"
					]
				},
				{
					"id": "interface.required",
					"elementId": "contract.stockRequired",
					"version": "1",
					"operationIds": [
						"operation.reserveRequired"
					],
					"invariants": [
						"Contract members are shared by identity"
					]
				},
				{
					"id": "interface.stock",
					"elementId": "contract.stockProvided",
					"version": "1",
					"operationIds": [
						"operation.reserve"
					],
					"invariants": [
						"Contract members are shared by identity"
					]
				}
			],
			"ports": [
				{
					"id": "port.checkout",
					"elementId": "component.checkout",
					"interfaceId": "interface.checkout",
					"direction": "provided"
				},
				{
					"id": "port.required",
					"elementId": "component.checkout",
					"interfaceId": "interface.required",
					"direction": "required"
				},
				{
					"id": "port.stock",
					"elementId": "component.stock",
					"interfaceId": "interface.stock",
					"direction": "provided"
				}
			],
			"connections": [
				{
					"id": "connection.stock",
					"requiredPortId": "port.required",
					"providedPortId": "port.stock",
					"operations": [
						{
							"requiredOperationId": "operation.reserveRequired",
							"providedOperationId": "operation.reserve"
						}
					]
				}
			],
			"transports": [
				{
					"id": "transport.payment",
					"relationId": "relation.payments",
					"protocol": "fixture-protocol",
					"format": "fixture-format",
					"schemaTypeId": "type.order",
					"schemaVersion": "1"
				},
				{
					"id": "transport.stock",
					"relationId": "relation.stock",
					"protocol": "fixture-protocol",
					"format": "fixture-format",
					"schemaTypeId": "type.order",
					"schemaVersion": "1"
				}
			],
			"modules": [
				{
					"id": "module.money",
					"elementId": "package.money",
					"consumerIds": [
						"component.checkout",
						"component.audit"
					],
					"library": {
						"state": "known",
						"value": "money-contract"
					},
					"version": {
						"state": "known",
						"value": "1"
					}
				}
			],
			"fieldMappings": []
		}
	},
	"codeMappings": [],
	"verifications": []
};
