/** "1 section", "2 sections". English nouns that take a plain "s" only. */
export const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;
