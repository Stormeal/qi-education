import { inertHtml } from './inert-html';

describe('inertHtml (US-P007-AC01)', () => {
  it('parses stored markup outside the page so handlers and resources cannot run', () => {
    const container = inertHtml(document, '<h2>Title</h2><img src="x" onerror="window.__xss = true"><script>window.__xss = true</script>');

    expect(container.ownerDocument).not.toBe(document);
    expect(container.ownerDocument.defaultView).toBeNull();
    expect(container.isConnected).toBe(false);
    expect((window as unknown as { __xss?: boolean }).__xss).toBeUndefined();
  });

  it('keeps structure and attachment identifiers readable for the editor', () => {
    const container = inertHtml(document, '<div class="rich-attachment-card" data-attachment-id="a1"><strong>file.pdf</strong></div>');
    const card = container.querySelector<HTMLElement>('.rich-attachment-card');

    expect(card instanceof HTMLElement).toBe(true);
    expect(card?.dataset['attachmentId']).toBe('a1');
  });
});
