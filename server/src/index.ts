/** Production/dev server entry: API (+ built frontend when `dist/` exists). */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { config } from './config';

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const { app } = createApp({ serveFrontend: distDir });

app.listen(config.port, () => {
  console.log(`[server] Harar Cinema API listening on http://localhost:${config.port} (${config.nodeEnv})`);
});
