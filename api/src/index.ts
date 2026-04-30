import { apiConfig } from './config.js';
import { createServer } from './server.js';

const app = createServer();

app.listen(apiConfig.PORT, () => {
  console.log(`QI-Education API listening on http://localhost:${apiConfig.PORT}`);
});
