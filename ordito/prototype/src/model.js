'use strict';
const kinds = new Set(['actor', 'component', 'class', 'state', 'action']);
function validateModel(model) {
  if (!model || model.version !== 1 || typeof model.name !== 'string' || !Array.isArray(model.nodes) || !Array.isArray(model.edges)) {
    throw new Error('Invalid model. Expected version 1, a name, nodes, and edges.');
  }
  const ids = new Set();
  for (const node of model.nodes) {
    if (!node || typeof node.id !== 'string' || !node.id || ids.has(node.id) || typeof node.label !== 'string' || !kinds.has(node.kind)) {
      throw new Error('Invalid node. Expected a unique ID, a label, and a supported kind.');
    }
    ids.add(node.id);
  }
  for (const edge of model.edges) {
    if (!edge || !ids.has(edge.from) || !ids.has(edge.to) || typeof edge.label !== 'string') throw new Error('Invalid relationship or missing node.');
  }
  return model;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
}
function renderModel(model) {
  validateModel(model);
  const width = 900;
  const height = Math.max(240, Math.ceil(model.nodes.length / 3) * 180 + 50);
  const positions = new Map(model.nodes.map((node, i) => [node.id, {x: 35 + (i % 3) * 295, y: 40 + Math.floor(i / 3) * 180}]));
  const edges = model.edges.map(edge => {
    const a = positions.get(edge.from), b = positions.get(edge.to);
    return `<g><line x1="${a.x+110}" y1="${a.y+50}" x2="${b.x+110}" y2="${b.y+50}" stroke="currentColor" marker-end="url(#arrow)"/><text x="${(a.x+b.x)/2+110}" y="${(a.y+b.y)/2+42}" text-anchor="middle">${escapeHtml(edge.label)}</text></g>`;
  }).join('');
  const nodes = model.nodes.map(node => {
    const p = positions.get(node.id);
    return `<g><rect x="${p.x}" y="${p.y}" width="220" height="100" rx="10"/><text x="${p.x+15}" y="${p.y+28}" class="kind">«${escapeHtml(node.kind)}»</text><foreignObject x="${p.x+15}" y="${p.y+40}" width="190" height="55"><div xmlns="http://www.w3.org/1999/xhtml">${escapeHtml(node.label)}</div></foreignObject></g>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:var(--vscode-font-family, sans-serif);color:var(--vscode-editor-foreground,#ddd);background:var(--vscode-editor-background,#181818);padding:24px}svg{width:100%;min-width:600px}rect{fill:var(--vscode-sideBar-background,#282828);stroke:var(--vscode-focusBorder,#5588ff)}text{fill:currentColor;font-size:12px}.kind{opacity:.65}h1{font-size:26px}p{opacity:.7}foreignObject div{overflow-wrap:anywhere;font-size:16px}</style></head><body><h1>${escapeHtml(model.name)}</h1><p>Experimental structure view · ${model.nodes.length} elements · ${model.edges.length} relationships</p><svg role="img" aria-label="Model diagram" viewBox="0 0 ${width} ${height}"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="10" refY="3" orient="auto"><path d="M0,0 L0,6 L10,3 z" fill="currentColor"/></marker></defs>${edges}${nodes}</svg><p>Edit and save the JSON file to update this view.</p></body></html>`;
}
module.exports = {validateModel, renderModel};
