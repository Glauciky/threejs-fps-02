// Night Harbor look plan, one place. Night navy, steel, hazard paint and one
// safety-orange accent; friendly cyan and enemy red are the only team colours.
// The same names are the CSS custom properties in index.html, so the HUD and
// the 3D scene never drift apart.
export const PALETTE = {
  canvas: '#0a0f16',
  surface: '#1a2330',
  hairline: '#2e3a48',
  ink: '#e8e2d4',
  muted: '#7d8ea0',
  accent: '#ff7a1a',
  friendly: '#2ec4b6',
  enemy: '#e5484d',
};

export function shade(name) {
  return PALETTE[name];
}
