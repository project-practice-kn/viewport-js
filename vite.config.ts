import { defineConfig, loadEnv, createLogger } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-node';

Object.assign(process.env, loadEnv(process.env.NODE_ENV || 'development', process.cwd(), ''));

// SvelteKit 3 logs request paths during development. Share tokens and signed URLs are credentials.
const logger = createLogger();
const customLogger = { ...logger };
for (const method of ['info', 'warn', 'error'] as const) {
  customLogger[method] = (message, options) => {
    if (/^\d{3} (GET|POST|PUT|DELETE|HEAD|OPTIONS) /.test(message)) return;
    logger[method](
      message
        .replace(/https?:\/\/[^\s"`]+/g, '[URL скрыт]')
        .replace(/(\/g\/|\/api\/downloads\/)[^/?\s]+/g, '$1[токен скрыт]'),
      options,
    );
  };
}

export default defineConfig({
  customLogger,
  plugins: [
    sveltekit({
      adapter: adapter(),
      paths: { origin: process.env.ORIGIN || 'http://localhost:5173' },
    }),
  ],
});
