// Hard-coded colour literals: counting them against a baseline keeps new ones out.

const HEX = '#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])';
const FUNC = '(?:rgba?|hsla?)\\([^()]*\\)';
const COLOR = new RegExp(`${HEX}|${FUNC}`, 'gi');

export function colorLiterals(text) {
  return [...text.matchAll(COLOR)].map((m) => m[0].toLowerCase().replace(/\s+/g, ''));
}

export function compareToBaseline(current, baseline) {
  const findings = [];
  for (const file of Object.keys(current).sort()) {
    for (const color of Object.keys(current[file]).sort()) {
      const count = current[file][color];
      const allowed = baseline[file]?.[color] ?? 0;
      if (count > allowed) findings.push({ file, color, count, allowed });
    }
  }
  return findings;
}
