import concurrently from 'concurrently';

const forwardedArgs = process.argv.slice(2);
const frontendArgs = forwardedArgs.length > 0 ? ` -- ${forwardedArgs.join(' ')}` : '';

const { result } = concurrently(
  [
    { command: 'npm run api:dev', name: 'api' },
    { command: `npm run app:dev:frontend${frontendArgs}`, name: 'app' },
  ],
  {
    prefixColors: ['blue', 'green'],
    killOthersOn: ['failure'],
  },
);

try {
  await result;
} catch {
  process.exitCode = 1;
}
