const {test} = require('node:test');
const assert = require('node:assert/strict');
const {validateModel, renderModel} = require('../src/model');
const example = require('../examples/checkout.diagram.json');
test('validates and renders the example', () => {
  assert.equal(validateModel(example), example);
  assert.match(renderModel(example), /Customer/);
});
test('rejects dangling relationships and duplicate IDs', () => {
  assert.throws(() => validateModel({...example, edges: [{from: 'missing', to: 'order', label: ''}]}));
  assert.throws(() => validateModel({...example, nodes: [example.nodes[0], example.nodes[0]]}));
});
test('escapes user content and forbids scripts', () => {
  const html = renderModel({...example, name: '<script>alert(1)</script>'});
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /default-src 'none'/);
});
