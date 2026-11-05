<script lang="ts">
  import { beforeNavigate, invalidateAll } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import { formatBytes } from '#lib/format.ts';
  let {
    galleryId,
    usage,
    busy = $bindable(false),
    disabled = false,
  }: {
    galleryId: string;
    usage: { used: number; reserved: number; quota: number };
    busy?: boolean;
    disabled?: boolean;
  } = $props();
  type Item = {
    file: File;
    status: string;
    progress: number;
    id?: string;
    failed: boolean;
    done: boolean;
    uploaded: boolean;
    rejected: boolean;
    xhr?: XMLHttpRequest;
    cancelled?: boolean;
  };
  let items: Item[] = $state([]),
    message = $state(''),
    mounted = $state(false);
  let disposed = false;
  let preparation: Promise<unknown> = Promise.resolve();
  let completed = $derived(items.filter((i) => i.done).length);
  let failed = $derived(items.filter((i) => i.failed && !i.rejected).length);
  let queued = $derived(items.filter((i) => i.status === 'В очереди'));
  let queueBytes = $derived(queued.reduce((n, i) => n + i.file.size, 0));
  let requiredBytes = $derived(queued.reduce((n, i) => n + (i.id ? 0 : i.file.size), 0));
  let free = $derived(Math.max(0, usage.quota - usage.used - usage.reserved));
  let summary = $derived(
    items.length
      ? `${busy ? 'Загружаем' : 'Очередь'}: готово ${completed} из ${items.filter((i) => !i.rejected).length}${failed ? ` · ошибки: ${failed}` : ''}`
      : '',
  );
  onMount(() => {
    mounted = true;
  });
  onDestroy(() => {
    disposed = true;
    for (const i of items) {
      i.cancelled = true;
      i.xhr?.abort();
    }
  });
  beforeNavigate(({ cancel, willUnload, from, to }) => {
    if (!busy || (to?.url.pathname === from?.url.pathname && to?.url.search === from?.url.search))
      return;
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
      xhr.timeout = 300000;
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) item.progress = Math.round((e.loaded / e.total) * 100);
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error('Ошибка передачи файла'));
      xhr.onerror = () => reject(new Error('Нет соединения. Повторите загрузку'));
      xhr.ontimeout = () =>
        reject(new Error('Передача заняла слишком много времени. Повторите загрузку'));
      xhr.onabort = () => reject(new Error('Загрузка отменена'));
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
        // Serialize reservations, preserving the order in which files were selected.
        const prepared = preparation.then(() =>
          item.cancelled || disposed
            ? null
            : api('presign', {
                galleryId,
                files: [{ name: item.file.name, size: item.file.size, type: item.file.type }],
              }),
        );
        preparation = prepared.catch(() => {});
        const result = await prepared;
        if (!result) throw new Error('Загрузка отменена');
        const upload = result.uploads[0];
        item.id = upload.id;
        if (item.cancelled || disposed) {
          await api('cancel', { photoId: item.id });
          throw new Error('Загрузка отменена');
        }
        item.status = 'Передача';
        await put(item, upload.url, upload.requiredHeaders);
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
      if (!item.uploaded && item.id) {
        await api('cancel', { photoId: item.id }).catch(() => {});
        item.id = undefined;
      }
      if (/проверить изображение|истёк|завершена/.test(item.status)) {
        item.id = undefined;
        item.uploaded = false;
      }
    } finally {
      item.xhr = undefined;
    }
  }
  async function start() {
    if (busy || disabled || disposed || !queued.length) return;
    if (requiredBytes > free) {
      message = `В очереди ${formatBytes(queueBytes)}, свободно ${formatBytes(free)}. Уберите часть файлов или освободите место.`;
      return;
    }
    message = '';
    busy = true;
    async function worker() {
      while (!disposed) {
        const item = items.find((i) => i.status === 'В очереди');
        if (!item) return;
        item.status = 'Подготовка';
        await run(item);
      }
    }
    try {
      await Promise.all([worker(), worker()]);
      await refresh();
    } finally {
      busy = false;
    }
  }
  function choose(event: Event) {
    const input = event.target as HTMLInputElement;
    if (disabled || !input.files?.length) return;
    const additions = [...input.files].map((file) => {
      const rejected =
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
        file.size <= 0 ||
        file.size > 10485760;
      return {
        file,
        status: rejected ? 'Не подходит: нужен JPEG, PNG или WebP до 10 МиБ' : 'В очереди',
        progress: 0,
        failed: rejected,
        rejected,
        done: false,
        uploaded: false,
      };
    });
    input.value = '';
    items = [...items, ...additions];
    message = additions.some((i) => i.rejected)
      ? 'Неподходящие файлы отмечены. Остальные можно загрузить.'
      : '';
  }
  async function retry(item?: Item) {
    if (busy || disabled) return;
    for (const i of item ? [item] : items.filter((i) => i.failed && !i.rejected)) {
      i.status = 'В очереди';
      i.failed = false;
      i.cancelled = false;
    }
    await start();
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
  function removeQueued(item: Item) {
    items = items.filter((i) => i !== item);
  }
</script>

<section class="upload-area" aria-label="Загрузка фотографий">
  <p class="eyebrow">ДОБАВИТЬ ФОТОГРАФИИ</p>
  <p class="muted">
    Свободно {formatBytes(free)} из {formatBytes(usage.quota)} · зарезервировано {formatBytes(
      usage.reserved,
    )}
  </p>
  <label class="upload-picker"
    ><span>{busy ? 'Добавить в очередь' : 'Выбрать фотографии'}</span><input
      type="file"
      accept="image/jpeg,image/png,image/webp"
      multiple
      onchange={choose}
      disabled={!mounted || disabled}
      aria-describedby="upload-hint"
    /></label
  >
  <p id="upload-hint" class="muted">
    JPEG, PNG, WebP · до 10 МиБ на файл · две передачи одновременно
  </p>
  <noscript><p>Для прямой загрузки файлов в хранилище включите JavaScript.</p></noscript>
  {#if queued.length}<p role="status">В очереди: {queued.length} · {formatBytes(queueBytes)}</p>
    <button type="button" onclick={start} disabled={busy || disabled}>Начать загрузку</button>{/if}
  {#if failed}<button type="button" onclick={() => retry()} disabled={busy || disabled}
      >Повторить все ошибки</button
    >{/if}
  {#if message}<p class="feedback error" role="alert">{message}</p>{/if}
  <p class="upload-summary" role="status">{summary}</p>
  <ul class="upload-list">
    {#each items as item (item)}<li class:upload-failed={item.failed}>
        <div class="upload-file">
          <strong>{item.file.name}</strong><span class="muted">{formatBytes(item.file.size)}</span>
        </div>
        <span>{item.status}{item.status === 'Передача' ? ` · ${item.progress}%` : ''}</span>
        {#if !item.done && !item.failed && item.status !== 'В очереди'}<progress
            max="100"
            value={item.status === 'Передача' ? item.progress : undefined}
            aria-label={`Загрузка ${item.file.name}`}
          ></progress>{/if}
        {#if item.failed && !item.rejected}<button
            type="button"
            disabled={busy || disabled}
            onclick={() => retry(item)}>Повторить загрузку</button
          >{/if}
        {#if item.status === 'В очереди' || item.rejected}<button
            type="button"
            onclick={() => removeQueued(item)}>Убрать из очереди</button
          >{:else if !item.done && !item.failed && !item.uploaded}<button
            type="button"
            onclick={() => cancel(item)}>Отменить</button
          >{/if}
      </li>{/each}
  </ul>
</section>
