import { copyFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';

const pagesOutput = resolve('app/dist/qi-education-app/browser');
const indexPath = resolve(pagesOutput, 'index.html');
const fallbackPath = resolve(pagesOutput, '404.html');

await access(indexPath, constants.R_OK);
await copyFile(indexPath, fallbackPath);

console.log(`Created GitHub Pages SPA fallback at ${fallbackPath}`);
