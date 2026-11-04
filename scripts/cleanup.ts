import { cleanup } from '../src/lib/server/photos/index.ts';
console.log(`Очищено записей: ${await cleanup(100)}`);
