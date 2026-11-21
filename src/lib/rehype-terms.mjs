// Ссылка вида [vsync](term:vsync) становится кнопкой с карточкой термина.
// Текст карточки берётся из src/lib/glossary.ts на клиенте, здесь только разметка.
export function rehypeTerms() {
  return (tree) => walk(tree);
}

function walk(node) {
  if (!node.children) return;
  for (const child of node.children) {
    if (child.type === 'element' && child.tagName === 'a') {
      const href = String(child.properties?.href ?? '');
      if (href.startsWith('term:')) {
        child.tagName = 'button';
        child.properties = { type: 'button', className: ['term'], dataTerm: href.slice(5) };
        continue;
      }
    }
    walk(child);
  }
}
