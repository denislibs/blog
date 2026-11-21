// Цвета обложек по тегам: блок «Читать дальше» рисует обложку из двух пятен на тёмном фоне.
const TAG_COLORS: Record<string, [string, string, string]> = {
  perf: ['#ff5fa2', '#ff7a45', '#2b1020'],
  javascript: ['#ffd166', '#ff9a3d', '#241a06'],
  motion: ['#ff5fa2', '#6cc6ff', '#1a1030'],
  react: ['#6cc6ff', '#9b6bff', '#101833'],
  css: ['#ff9a3d', '#ffd166', '#2a1a08'],
  flutter: ['#4fc3f7', '#2fc4a5', '#06222a'],
  swiftui: ['#ff7a45', '#ff3b5c', '#2a0f0a'],
  postgres: ['#7aa2ff', '#4cc38a', '#0d1a2a'],
  sql: ['#7aa2ff', '#4cc38a', '#0d1a2a'],
  git: ['#ff7a45', '#b07bff', '#1d1026'],
  tools: ['#b9c3da', '#6cc6ff', '#12161f'],
  meta: ['#ffc2d4', '#b07bff', '#1c1222'],
  astro: ['#ff5fa2', '#b07bff', '#1a0f24'],
};
const FALLBACK: [string, string, string] = ['#b9c3da', '#ff5fa2', '#141518'];

export function coverGradient(tags: string[]) {
  const [a, b, bg] = TAG_COLORS[tags[0]] ?? FALLBACK;
  return `radial-gradient(circle at 22% 30%, ${a}, transparent 46%), radial-gradient(circle at 78% 72%, ${b}, transparent 52%), ${bg}`;
}
