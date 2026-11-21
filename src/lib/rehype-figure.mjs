// Абзац, в котором только картинка, превращается в <figure>; alt становится подписью.
//   ![Схема сборки](/images/blog-arch.svg)  →  <figure><img …><figcaption>Схема сборки</figcaption></figure>
export function rehypeFigure() {
  return (tree) => walk(tree);
}

function walk(node) {
  if (!node.children) return;
  node.children = node.children.map((child) => {
    if (child.type === 'element' && child.tagName === 'p') {
      const kids = child.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
      const img = kids[0];
      if (kids.length === 1 && img.type === 'element' && img.tagName === 'img') {
        img.properties = { ...img.properties, loading: 'lazy', decoding: 'async' };
        const alt = img.properties.alt ? String(img.properties.alt) : '';
        const caption = alt
          ? [{ type: 'element', tagName: 'figcaption', properties: {}, children: [{ type: 'text', value: alt }] }]
          : [];
        return { type: 'element', tagName: 'figure', properties: {}, children: [img, ...caption] };
      }
    }
    walk(child);
    return child;
  });
}
