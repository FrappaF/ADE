/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type SemanticModelV4 } from '../../common/modelTypes.js';

export const nodeOrdersFixture: SemanticModelV4 = {
	"version": 4,
	"id": "project.node-orders",
	"name": "Orders · Pure Structural Slice",
	"semantics": {
		"elements": [
			{
				"id": "system.orders",
				"kind": "system",
				"name": "Orders",
				"scope": "governed"
			},
			{
				"id": "container.domain",
				"kind": "container",
				"name": "Order Domain",
				"runtimeKind": "application",
				"description": "Evaluate order quantity rules"
			},
			{
				"id": "component.checkout",
				"kind": "component",
				"name": "Checkout",
				"description": "Validate submitted quantities"
			},
			{
				"id": "component.audit",
				"kind": "component",
				"name": "Audit",
				"description": "An independent library consumer"
			},
			{
				"id": "package.rules",
				"kind": "package",
				"name": "Rules"
			},
			{
				"id": "class.rules",
				"kind": "class",
				"name": "Quantity Rules"
			},
			{
				"id": "feature.order",
				"kind": "feature",
				"name": "Submit Order"
			}
		],
		"relations": []
	},
	"views": [],
	"codeMappings": [],
	"verifications": [],
	"foundation": {
		"ownership": [
			{
				"id": "owner.container.domain",
				"elementId": "container.domain",
				"ownerId": "system.orders",
				"role": "architecture"
			},
			{
				"id": "owner.component.checkout",
				"elementId": "component.checkout",
				"ownerId": "container.domain",
				"role": "architecture"
			},
			{
				"id": "owner.component.audit",
				"elementId": "component.audit",
				"ownerId": "container.domain",
				"role": "architecture"
			},
			{
				"id": "owner.package.rules",
				"elementId": "package.rules",
				"ownerId": "container.domain",
				"role": "architecture"
			},
			{
				"id": "owner.class.rules",
				"elementId": "class.rules",
				"ownerId": "package.rules",
				"role": "architecture"
			}
		],
		"memberships": [
			{
				"id": "membership.checkout",
				"elementId": "component.checkout",
				"featureId": "feature.order"
			}
		],
		"integrations": [],
		"types": [
			{
				"id": "type.quantity",
				"name": "Quantity",
				"kind": "primitive",
				"primitive": "integer",
				"fields": []
			},
			{
				"id": "type.money",
				"name": "Minor Currency Units",
				"kind": "primitive",
				"primitive": "integer",
				"fields": []
			},
			{
				"id": "type.boolean",
				"name": "Boolean",
				"kind": "primitive",
				"primitive": "boolean",
				"fields": []
			},
			{
				"id": "type.text",
				"name": "Text",
				"kind": "primitive",
				"primitive": "string",
				"fields": []
			}
		],
		"blueprint": {
			"operations": [
				{
					"id": "operation.submit",
					"ownerId": "component.checkout",
					"name": "submitOrder",
					"inputs": [
						{
							"id": "input.operation.submit",
							"name": "quantity",
							"type": "",
							"typeId": "type.quantity",
							"required": true,
							"nullable": {
								"state": "known",
								"value": false
							}
						}
					],
					"outputs": [
						{
							"id": "output.operation.submit",
							"name": "accepted",
							"type": "",
							"typeId": "type.boolean",
							"required": true,
							"nullable": {
								"state": "known",
								"value": false
							}
						}
					],
					"errors": [],
					"effects": [],
					"permissions": [],
					"preconditions": [],
					"postconditions": [],
					"acceptanceCriteria": [
						{
							"id": "criterion.operation.submit",
							"given": "A quantity supplied by the user",
							"when": "Its sign is checked",
							"then": "Only positive quantities are accepted"
						}
					]
				},
				{
					"id": "operation.positive",
					"ownerId": "class.rules",
					"name": "isPositive",
					"inputs": [
						{
							"id": "input.operation.positive",
							"name": "quantity",
							"type": "",
							"typeId": "type.quantity",
							"required": true,
							"nullable": {
								"state": "known",
								"value": false
							}
						}
					],
					"outputs": [
						{
							"id": "output.operation.positive",
							"name": "accepted",
							"type": "",
							"typeId": "type.boolean",
							"required": true,
							"nullable": {
								"state": "known",
								"value": false
							}
						}
					],
					"errors": [],
					"effects": [],
					"permissions": [],
					"preconditions": [],
					"postconditions": [],
					"acceptanceCriteria": [
						{
							"id": "criterion.operation.positive",
							"given": "A quantity supplied by the user",
							"when": "Its sign is checked",
							"then": "Only positive quantities are accepted"
						}
					]
				}
			],
			"interfaces": [],
			"ports": [],
			"connections": [],
			"transports": [],
			"modules": [
				{
					"id": "module.rules",
					"elementId": "package.rules",
					"consumerIds": [
						"component.checkout",
						"component.audit"
					],
					"library": {
						"state": "known",
						"value": "rules"
					},
					"version": {
						"state": "known",
						"value": "1.0.0"
					}
				}
			],
			"fieldMappings": []
		},
		"occurrences": [
			{
				"id": "call.positive",
				"operationId": "operation.positive",
				"from": "component.checkout",
				"to": "class.rules"
			}
		],
		"frames": [],
		"interactions": [
			{
				"id": "scenario.submit",
				"ownerId": "component.checkout",
				"occurrenceIds": [
					"call.positive"
				],
				"frameIds": []
			}
		],
		"predicates": [
			{
				"id": "predicate.positive",
				"version": 1,
				"operationId": "operation.submit",
				"phase": "pre",
				"rootId": "positive",
				"nodes": [
					{
						"id": "quantity",
						"kind": "reference",
						"fieldId": "input.operation.submit",
						"path": []
					},
					{
						"id": "zero",
						"kind": "literal",
						"typeId": "type.quantity",
						"value": 0
					},
					{
						"id": "positive",
						"kind": "compare",
						"operator": "gt",
						"left": "quantity",
						"right": "zero"
					}
				]
			}
		],
		"assertions": [],
		"platform": {
			"bindings": [
				{
					"id": "binding.node",
					"elementId": "container.domain",
					"profileId": "node.esm",
					"technology": {
						"state": "known",
						"value": "node-esm"
					}
				}
			]
		},
		"decisions": [
			{
				"id": "adr.node",
				"revision": "1",
				"status": "accepted",
				"scopeIds": [
					"container.domain"
				],
				"constraints": [
					{
						"id": "constraint.node",
						"subject": {
							"kind": "binding",
							"id": "binding.node"
						},
						"field": "/technology/value",
						"value": {
							"state": "known",
							"value": "node-esm"
						},
						"category": "technology",
						"operator": "equals"
					}
				]
			}
		]
	}
};
