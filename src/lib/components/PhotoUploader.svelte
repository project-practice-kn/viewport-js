<script lang="ts">
  import { beforeNavigate, invalidateAll } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import { formatBytes } from '#lib/format.ts';
  let {
    galleryId,
    busy = $bindable(false),
    disabled = false,
  }: { galleryId: string; busy?: boolean; disabled?: boolean } = $props();
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
    message = $state('');
  let mounted = $state(false);
  let disposed = false;
  let completed = $derived(items.filter((item) => item.done).length);
  let failed = $derived(items.filter((item) => item.failed).length);
  let summary = $derived(
    items.length
      ? `${busy ? 'Загружаем' : 'Загрузка завершена'}: готово ${completed} из ${items.length}${failed ? ` · не загружено: ${failed}` : ''}`
      : '',
  );
  onMount(() => {
    mounted = true;
  });
  onDestroy(() => {
    disposed = true;
    for (const item of items) {
      item.cancelled = true;
      item.xhr?.abort();
    }
  });
  beforeNavigate(({ cancel, willUnload, from, to }) => {
    if (!busy) return;
    if (to?.url.pathname === from?.url.pathname && to?.url.search === from?.url.search) return;
    if (willUnload || !window.confirm('Загрузка ещё идёт. Покинуть страницу и прервать загрузку?'))
      cancel();
  });
  async function api(operation: string, body: unknown) {
    const response = await fetch(`/api/uploads/${operation}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error('Сервер недоступен. Повторите попытку позже');
    }
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
      xhr.onload = () => {
        item.xhr = undefined;
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error('Ошибка передачи файла'));
      };
      xhr.onerror = () => {
        item.xhr = undefined;
        reject(new Error('Нет соединения. Повторите загрузку'));
      };
      xhr.onabort = () => {
        item.xhr = undefined;
        reject(new Error('Загрузка отменена'));
      };
      xhr.send(item.file);
    });
  }
  async function run(item: Item) {
    item.failed = false;
    item.cancelled = false;
    if (!item.uploaded) item.progress = 0;
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
    if (busy || disabled) return;
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
          f.size > 10485760,
      )
    ) {
      message = 'Выберите непустые файлы JPEG, PNG или WebP размером до 10 МиБ каждый';
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
      while (next < items.length) {
        const item = items[next++];
        if (!item.cancelled) await run(item);
      }
    }
    try {
      await Promise.all([worker(), worker()]);
      await refresh();
    } finally {
      busy = false;
    }
  }
  async function retry(item: Item) {
    if (busy || disabled) return;
    busy = true;
    try {
      await run(item);
      await refresh();
    } finally {
      busy = false;
    }
  }
  async function refresh() {
    if (disposed) return;
    try {
      await invalidateAll();
    } catch {
      message =
        'Не удалось обновить галерею. Обновите страницу, чтобы увидеть принятые фотографии.';
    }
  }
  function cancel(item: Item) {
    item.cancelled = true;
    item.failed = true;
    item.status = 'Загрузка отменена';
    item.xhr?.abort();
  }
</script>

<section class="upload-area" aria-label="Загрузка фотографий">
  <p class="eyebrow">ДОБАВИТЬ ФОТОГРАФИИ</p>
  <label class="upload-picker"
    ><span>Выбрать фотографии</span><input
      type="file"
      accept="image/jpeg,image/png,image/webp"
      multiple
      onchange={choose}
      disabled={!mounted || busy || disabled}
      aria-describedby="upload-hint"
    /></label
  >
  <p id="upload-hint" class="muted">JPEG, PNG, WebP · до 10 МиБ на файл · до 20 файлов за раз</p>
  <noscript><p>Для прямой загрузки файлов в хранилище включите JavaScript.</p></noscript>
  {#if message}<p role="alert" class="feedback error">{message}</p>{/if}
  <p class="upload-summary" role="status">{summary}</p>
  <ul class="upload-list">
    {#each items as item (item)}<li class:upload-failed={item.failed}>
        <div class="upload-file">
          <strong>{item.file.name}</strong><span class="muted">{formatBytes(item.file.size)}</span>
        </div>
        <span
          >{item.status}{#if item.status === 'Передача'}
            · {item.progress}%{/if}</span
        >
        {#if !item.done && !item.failed}<progress
            max="100"
            aria-label={`Загрузка ${item.file.name}`}
            value={item.status === 'Передача' ? item.progress : undefined}
          ></progress>{/if}
        {#if item.failed && !busy}<button
            type="button"
            {disabled}
            aria-label={`Повторить загрузку ${item.file.name}`}
            onclick={() => retry(item)}>Повторить загрузку</button
          >{/if}{#if !item.done && !item.failed && !item.uploaded}<button
            type="button"
            aria-label={`Отменить загрузку ${item.file.name}`}
            onclick={() => cancel(item)}>Отменить</button
          >{/if}
      </li>{/each}
  </ul>
</section>
