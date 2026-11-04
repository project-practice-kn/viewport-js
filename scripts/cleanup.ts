import { cleanup } from '../src/lib/server/photos/index.ts';
console.log(
  `Очищено истёкших резервов: ${await cleanup(100)}. Ключи удалённых галерей также проверены порцией до 100.`,
);
