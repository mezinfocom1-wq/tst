export const colors = {
  ink: '#17130f', inkSoft: '#4a433b', muted: '#7a7166', sand: '#faf7f2', sandDeep: '#f1ebe1', line: '#e6dfd3', surface: '#ffffff',
  brand: '#a66d1b', brandSoft: '#f4e4c3', brandLight: '#e2b866',
  ok: '#1f7a4d', okSoft: '#e4f3ea', warn: '#a65f00', warnSoft: '#fbefd9', danger: '#b3261e', dangerSoft: '#fbe6e4', info: '#1d5fa8', infoSoft: '#e3eefb',
};
export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'brand';
export const tones: Record<Tone, [string, string]> = {
  neutral: [colors.sandDeep, colors.inkSoft], ok: [colors.okSoft, colors.ok], warn: [colors.warnSoft, colors.warn],
  danger: [colors.dangerSoft, colors.danger], info: [colors.infoSoft, colors.info], brand: [colors.brandSoft, colors.brand],
};
