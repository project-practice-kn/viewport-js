<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  let { galleryId }: { galleryId: string } = $props();
  type Item = {
    file: File;
    status: string;
    progress: number;
    id?: string;
    failed: boolean;
    done: boolean;
    uploaded: boolean;
    xhr?: XMLHttpRequest;
    cancelled?: boolean;
  };
  let items: Item[] = $state([]),
    busy = $state(false),
    message = $state('');
  async function api(operation: string, body: unknown) {
    const response = await fetch(`/api/uploads/${operation}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Не удалось выполнить запрос');
    return result;
  }
  function put(item: Item, url: string, headers: Record<string, string>) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      item.xhr = xhr;
      xhr.open('PUT', url);
      for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) item.progress = Math.round((e.loaded / e.total) * 100);
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error('Ошибка передачи файла'));
      xhr.onerror = () => reject(new Error('Нет соединения. Повторите загрузку'));
      xhr.onabort = () => reject(new Error('Загрузка отменена'));
      xhr.send(item.file);
    });
  }
  async function run(item: Item) {
    item.failed = false;
    item.cancelled = false;
    try {
      if (!item.id) {
        item.status = 'Подготовка';
        const { uploads } = await api('presign', {
          galleryId,
          files: [{ name: item.file.name, size: item.file.size, type: item.file.type }],
        });
        item.id = uploads[0].id;
        if (item.cancelled) {
          await api('cancel', { photoId: item.id });
          throw new Error('Загрузка отменена');
        }
        item.status = 'Передача';
        await put(item, uploads[0].url, uploads[0].requiredHeaders);
        item.uploaded = true;
      }
      item.status = 'Проверка и создание превью';
      for (let attempt = 0; ; attempt++) {
        try {
          await api('confirm', { photoId: item.id });
          break;
        } catch (e) {
          if (attempt >= 4 || !(e instanceof Error) || !/занята|обрабатывается/.test(e.message))
            throw e;
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      item.status = 'Готово';
      item.done = true;
      item.progress = 100;
    } catch (e) {
      item.status = e instanceof Error ? e.message : 'Ошибка загрузки';
      item.failed = true;
      // Pending PUT failures are cancelled; confirm retries retain the same photo id.
      if (!item.uploaded && item.id) {
        await api('cancel', { photoId: item.id }).catch(() => {});
        item.id = undefined;
        item.uploaded = false;
      }
      if (/проверить изображение|истёк|завершена/.test(item.status)) {
        item.id = undefined;
        item.uploaded = false;
      }
    } finally {
      item.xhr = undefined;
    }
  }
  async function choose(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const files = [...input.files];
    input.value = '';
    if (files.length > 20) {
      message = 'Выберите не более 20 файлов за раз';
      return;
    }
    if (
      files.some(
        (f) =>
          !['image/jpeg', 'image/png', 'image/webp'].includes(f.type) ||
          f.size <= 0 ||
          f.size > 26214400,
      )
    ) {
      message = 'Допустимы только JPEG, PNG и WebP до 25 МБ';
      return;
    }
    message = '';
    busy = true;
    items = files.map((file) => ({
      file,
      status: 'В очереди',
      progress: 0,
      failed: false,
      done: false,
      uploaded: false,
    }));
    let next = 0;
    async function worker() {
      while (next < items.length) await run(items[next++]);
    }
    await Promise.all([worker(), worker()]);
    busy = false;
    await invalidateAll();
  }
  async function retry(item: Item) {
    busy = true;
    await run(item);
    busy = false;
    await invalidateAll();
  }
</script>

<section class="upload-area">
  <p class="eyebrow">ДОБАВИТЬ ФОТОГРАФИИ</p>
  <label class="file-label"
    >Выберите снимки<input
      type="file"
      accept="image/jpeg,image/png,image/webp"
      multiple
      onchange={choose}
      disabled={busy}
    /></label
  >
  <p class="muted">JPEG, PNG, WebP · до 25 МБ · до 20 файлов за раз</p>
  <noscript><p>Для прямой загрузки файлов в хранилище включите JavaScript.</p></noscript>
  {#if message}<p role="alert" class="feedback error">{message}</p>{/if}
  <ul class="upload-list" aria-live="polite">
    {#each items as item}<li>
        <strong>{item.file.name}</strong><span>{item.status} · {item.progress}%</span><progress
          max="100"
          value={item.progress}
        ></progress>{#if item.failed && !busy}<button type="button" onclick={() => retry(item)}
            >Повторить</button
          >{/if}{#if item.xhr}<button
            type="button"
            onclick={() => {
              item.cancelled = true;
              item.xhr?.abort();
            }}>Отменить</button
          >{/if}
      </li>{/each}
  </ul>
</section>
