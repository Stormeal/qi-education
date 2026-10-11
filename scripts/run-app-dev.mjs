import concurrently from 'concurrently';

// Keep an explicit shell choice byte-for-byte; dotenv still supplies it when absent.
const apiEnv = process.env.USE_SHARED_SERVICES === undefined ? {} : { env: { USE_SHARED_SERVICES: process.env.USE_SHARED_SERVICES } };

const forwardedArgs = process.argv.slice(2);
const frontendArgs = forwardedArgs.length > 0 ? ` -- ${forwardedArgs.join(' ')}` : '';

const { result } = concurrently(
  [
    { command: 'npm run api:dev', name: 'api', ...apiEnv },
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
