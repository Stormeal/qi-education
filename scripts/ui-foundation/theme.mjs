// Reads the custom properties declared inside the @theme block of a CSS file.

export function readTheme(cssText) {
  const start = /@theme\b[^{]*\{/.exec(cssText);
  if (!start) throw new Error('No @theme block found');
  let depth = 1;
  let i = start.index + start[0].length;
  const begin = i;
  while (i < cssText.length && depth > 0) {
    if (cssText[i] === '{') depth += 1;
    else if (cssText[i] === '}') depth -= 1;
    i += 1;
  }
  const body = cssText.slice(begin, i - 1).replace(/\/\*[\s\S]*?\*\//g, '');
  const values = {};
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    values[match[1]] = match[2].trim().replace(/\s+/g, ' ');
  }
  return values;
}
