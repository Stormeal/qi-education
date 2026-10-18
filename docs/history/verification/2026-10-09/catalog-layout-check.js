// Run with the documented CUA read-only page evaluate API at each viewport.
// This checks rendered layout, rather than asserting CSS source declarations.
(() => {
  const failures = [];
  const cards = [...document.querySelectorAll('.catalog-card, .browse-card')].map(card => {
    const rect = card.getBoundingClientRect();
    const title = card.querySelector('h3');
    const pills = card.querySelector('.catalog-card-pills');
    const elements = [title, ...pills.children, card.querySelector('.catalog-card-price, .browse-card-price')].filter(Boolean);
    const clipping = elements.some(element => {
      const box = element.getBoundingClientRect();
      return box.left < rect.left - 1 || box.right > rect.right + 1 || box.top < rect.top - 1 || box.bottom > rect.bottom + 1;
    });
    const truncatedTitle = title.scrollHeight > title.clientHeight + 1 || title.scrollWidth > title.clientWidth + 1;
    const hiddenBadges = pills.scrollHeight > pills.clientHeight + 1 || pills.scrollWidth > pills.clientWidth + 1;
    if (clipping || truncatedTitle || hiddenBadges) failures.push({ title: title.textContent, clipping, truncatedTitle, hiddenBadges });
    return { title: title.textContent, height: rect.height, badges: pills.children.length };
  });
  if (!cards.length) failures.push({ missingCards: true });
  return { viewport: { width: innerWidth, height: innerHeight }, cards, failures, passed: failures.length === 0 };
})()
