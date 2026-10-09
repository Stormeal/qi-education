/**
 * Parses markup into a container that belongs to a separate, window-less document.
 * Stored lesson HTML can then be inspected or rewritten without loading its
 * resources or running its event handlers (US-P007). Never attach the result to
 * the page; pass its innerHTML through an Angular [innerHTML] binding instead.
 */
export function inertHtml(document: Document, html: string): HTMLElement {
  const container = document.implementation.createHTMLDocument('').createElement('div');
  container.innerHTML = html;
  return container;
}
