<script lang="ts">
  import type { PageProps } from './$types';
  import PhotoUploader from '#lib/components/PhotoUploader.svelte';
  import ShareLink from '#lib/components/ShareLink.svelte';
  import DownloadArchive from '#lib/components/DownloadArchive.svelte';
  import { refreshPreviews } from '#lib/refreshPreviews.ts';
  import { formatBytes, formatPhotos } from '#lib/format.ts';
  import { photoViewer } from '#lib/photoViewer.ts';
  import { enhance, type SubmitFunction } from '$app/forms';
  import { beforeNavigate, invalidateAll } from '$app/navigation';
  import { untrack, onMount } from 'svelte';
  let { data, form }: PageProps = $props();
  let title = $state(untrack(() => String(form?.values?.title ?? data.gallery.title)));
  let description = $state(
    untrack(() => String(form?.values?.description ?? data.gallery.description)),
  );
  let theme = $state(untrack(() => String(form?.values?.theme ?? data.gallery.theme)));
  let selected = $state<string[]>([]);
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
  });
  let grid = $state<HTMLDivElement>();
  let previewProblem = $state('');
  let blockedUploads = $derived(
    data.uploads.filter((p) => p.reservationStatus === 'reserved').length,
  );
  beforeNavigate(({ cancel, willUnload, from, to }) => {
    if (
      !dirty ||
      uploading ||
      (to?.url.pathname === from?.url.pathname && to?.url.search === from?.url.search)
    )
      return;
    if (willUnload || !window.confirm('Есть несохранённые настройки. Покинуть страницу?')) cancel();
  });
  let editorId = untrack(() => data.gallery.id);
  $effect(() => {
    if (editorId === data.gallery.id) return;
    editorId = data.gallery.id;
    title = data.gallery.title;
    description = data.gallery.description;
    theme = data.gallery.theme;
  });
  let pending = $state<string | null>(null);
  let uploading = $state(false);
  let locked = $derived(pending !== null || uploading);
  let dirty = $derived(
    title !== data.gallery.title ||
      description !== data.gallery.description ||
      theme !== data.gallery.theme,
  );
  const submit: SubmitFunction = ({ action, cancel }) => {
    if (locked) {
      cancel();
      return;
    }
    pending = action.search;
    return async ({ update, result }) => {
      try {
        await update({ reset: false });
        if (result.type === 'failure' && ['?/delete', '?/removePhotos'].includes(action.search))
          await invalidateAll();
        if (result.type === 'success' && action.search === '?/removePhotos') selected = [];
        if (result.type === 'success' && action.search === '?/save') {
          title = data.gallery.title;
          description = data.gallery.description;
          theme = data.gallery.theme;
        }
      } finally {
        pending = null;
      }
    };
  };
</script>

<svelte:head><title>{data.gallery.title} · Viewport</title></svelte:head>
<a class="back-link" href="/dashboard">← Все галереи</a>
<div class="page-heading">
  <div>
    <p class="editor-status">
      {data.gallery.status === 'draft' ? 'ЧЕРНОВИК / РЕДАКТОР' : 'ОПУБЛИКОВАНА'}
    </p>
    <h1>{data.gallery.title}</h1>
  </div>
  <span class="badge">{formatPhotos(data.photos.length)}</span>
</div>
<nav class="editor-nav" aria-label="Разделы редактора">
  <a href="#gallery-photos">Фотографии</a>
  <a href="#gallery-settings">Настройки и публикация</a>
</nav>
{#if form?.message}<p
    class:success={form.success}
    class="feedback"
    role={form.success ? 'status' : 'alert'}
  >
    {form.message}
  </p>{/if}
{#if data.gallery.deleting}
  <p class="feedback" role="status">
    Удаление не завершено. Файлы и галерея будут удалены после повтора.
  </p>
{:else}
  <div class="editor-layout">
    <aside id="gallery-settings" class="settings-panel">
      <h2>Детали истории</h2>
      <form method="POST" action="?/save" aria-busy={pending === '?/save'} use:enhance={submit}>
        <fieldset disabled={data.gallery.status === 'published' || locked}>
          <label>Название<input name="title" maxlength="120" required bind:value={title} /></label>
          <label
            >Описание<textarea name="description" maxlength="2000" rows="4" bind:value={description}
            ></textarea></label
          >
          <label
            >Тема<select name="theme" bind:value={theme}
              ><option value="light">Светлая</option><option value="dark">Тёмная</option></select
            ></label
          >
          <button>{pending === '?/save' ? 'Сохраняем…' : 'Сохранить настройки'}</button>
          {#if dirty}<p class="muted form-hint" role="status">Есть несохранённые изменения.</p>{/if}
        </fieldset>
      </form>
      <div class="publish-panel">
        <a href={`/dashboard/galleries/${data.gallery.id}/preview`} target="_blank" rel="noreferrer"
          >Предпросмотр для клиента ↗</a
        >
        <p class="muted">
          Готово: {data.photos.length} · незавершённых: {blockedUploads} · ошибок: {data.uploads.filter(
            (p) => p.status === 'failed',
          ).length} · обложка: {data.photos.find((p) => p.id === data.gallery.coverId)?.filename ??
            'не выбрана'}
        </p>
        {#if data.gallery.status === 'published'}<p>
            Галерея доступна клиенту по ссылке. Обложку можно менять ниже; для остальных изменений
            снимите публикацию.
          </p>
          <a class="public-link" href={data.gallery.link!} target="_blank" rel="noreferrer"
            >Открыть галерею <span class="visually-hidden">в новой вкладке</span>↗</a
          >
          <ShareLink href={data.gallery.link!} />
          <details class="link-settings">
            <summary>Изменить ссылку доступа</summary>
            <form
              method="POST"
              action="?/rotateLink"
              use:enhance={submit}
              aria-busy={pending === '?/rotateLink'}
            >
              <p class="muted">
                Старая ссылка перестанет открывать галерею. Уже выданные ссылки на файлы действуют
                до 120 секунд; начатый архив продолжит скачивание.
              </p>
              <label
                ><input type="checkbox" name="confirmLink" value="yes" required /> Подтверждаю смену ссылки</label
              >
              <button disabled={locked}
                >{pending === '?/rotateLink' ? 'Меняем ссылку…' : 'Сменить ссылку'}</button
              >
            </form>
          </details>
          <form
            method="POST"
            action="?/unpublish"
            use:enhance={submit}
            aria-busy={pending === '?/unpublish'}
          >
            <button disabled={locked}
              >{pending === '?/unpublish' ? 'Снимаем публикацию…' : 'Снять с публикации'}</button
            >
          </form>{:else}<p class="muted">
            Для публикации загрузите хотя бы один снимок и дождитесь завершения обработки. Первый
            снимок станет обложкой.
          </p>
          <form
            method="POST"
            action="?/publish"
            use:enhance={submit}
            aria-busy={pending === '?/publish'}
          >
            <button
              class="primary"
              disabled={locked ||
                dirty ||
                data.photos.length === 0 ||
                blockedUploads > 0 ||
                data.deletingPhotos.length > 0}
              aria-describedby="publish-hint"
              >{pending === '?/publish' ? 'Публикуем…' : 'Опубликовать галерею ↗'}</button
            >
            <p id="publish-hint" class="muted form-hint">
              {uploading
                ? 'Дождитесь завершения загрузки фотографий.'
                : blockedUploads > 0
                  ? `Есть незавершённые загрузки: ${blockedUploads}. Продолжите проверку или отмените их ниже.`
                  : data.deletingPhotos.length > 0
                    ? 'Завершите удаление фотографий.'
                    : dirty
                      ? 'Сохраните настройки перед публикацией.'
                      : data.photos.length === 0
                        ? 'Сначала добавьте фотографии.'
                        : 'Откроется доступ по ссылке. Для клиента аккаунт не нужен.'}
            </p>
          </form>{/if}
      </div>
    </aside>
    <section id="gallery-photos" aria-label="Фотографии галереи">
      {#if data.gallery.status === 'draft'}<PhotoUploader
          galleryId={data.gallery.id}
          usage={data.usage}
          bind:busy={uploading}
          disabled={pending !== null}
        />{/if}
      {#if data.gallery.status === 'draft' && data.uploads.length}
        <section aria-label="Незавершённые загрузки">
          <h2>Незавершённые загрузки</h2>
          <p class="muted">
            Файлы, не переданные целиком, выберите повторно. Для уже переданного файла можно
            продолжить проверку.
          </p>
          {#each data.uploads as upload}<article class="publish-panel">
              <strong>{upload.filename}</strong> · {formatBytes(upload.size)}
              <p>
                {upload.status === 'processing'
                  ? 'Обрабатывается'
                  : upload.canConfirm
                    ? 'Ожидает проверки'
                    : upload.status === 'failed'
                      ? 'Не загружен — выберите файл повторно'
                      : 'Срок загрузки истёк — выберите файл повторно'}
              </p>
              {#if upload.canConfirm}<form
                  method="POST"
                  action="?/confirmUpload"
                  use:enhance={submit}
                >
                  <input type="hidden" name="photoId" value={upload.id} /><button disabled={locked}
                    >Продолжить проверку</button
                  >
                </form>{/if}
              {#if upload.canCancel && upload.reservationStatus === 'reserved'}<form
                  method="POST"
                  action="?/cancelUpload"
                  use:enhance={submit}
                >
                  <input type="hidden" name="photoId" value={upload.id} /><button disabled={locked}
                    >Отменить загрузку</button
                  >
                </form>{/if}
              <a href="#upload-hint">Выбрать файл повторно ↑</a>
            </article>{/each}
          <a href={`/dashboard/galleries/${data.gallery.id}`} data-sveltekit-reload
            >Обновить состояния загрузок</a
          >
        </section>
      {/if}
      {#if data.deletingPhotos.length}<form
          method="POST"
          action="?/removePhotos"
          use:enhance={submit}
          class="feedback"
        >
          <p>
            Удаление не завершено: {data.deletingPhotos.map((p) => p.filename).join(', ')}. Место
            освободится после удаления файлов.
          </p>
          {#each data.deletingPhotos as photo}<input
              type="hidden"
              name="selected"
              value={photo.id}
            />{/each}
          <input type="hidden" name="confirmPhotos" value="yes" /><button disabled={locked}
            >Повторить удаление фотографий</button
          >
        </form>{/if}
      {#if data.photos.length}<DownloadArchive
          href={`/api/galleries/${data.gallery.id}/archive`}
          count={data.photos.length}
          bytes={data.photos.reduce((n, p) => n + p.size, 0)}
        />{/if}
      {#if data.gallery.status === 'draft' && data.photos.length}
        <form
          method="POST"
          id="selected-photos"
          action="?/moveMany"
          use:enhance={submit}
          class="selection-toolbar"
        >
          <p>Выбрано: {selected.length}</p>
          {#if mounted}<button
              type="button"
              disabled={locked}
              onclick={() => (selected = data.photos.map((p) => p.id))}>Выбрать все</button
            >
            <button type="button" disabled={locked} onclick={() => (selected = [])}
              >Снять выбор</button
            >{/if}
          <button name="target" value="start" disabled={locked || (mounted && !selected.length)}
            >В начало</button
          >
          <button name="target" value="end" disabled={locked || (mounted && !selected.length)}
            >В конец</button
          >
          <label
            ><input type="checkbox" name="confirmPhotos" value="yes" /> Подтверждаю удаление выбранных
            фотографий</label
          >
          <button formaction="?/removePhotos" disabled={locked || (mounted && !selected.length)}
            >Удалить выбранные</button
          >
        </form>
        <form method="POST" action="?/sort" use:enhance={submit}>
          <button disabled={locked}>Сортировать по имени</button>
        </form>
      {/if}
      {#if data.photos.length}
        <p class="photo-cover-hint" id="photo-cover-hint">
          Обложку можно менять в любой момент — порядок фотографий и ссылка для клиента сохранятся.
        </p>
      {/if}
      {#if previewProblem}<p class="feedback" role="alert">
          {previewProblem}
          <button type="button" onclick={() => grid?.dispatchEvent(new Event('retry-previews'))}
            >Обновить превью</button
          >
        </p>{/if}
      <div
        class="photo-grid editor-grid"
        bind:this={grid}
        data-downloads="true"
        data-refreshable="true"
        use:photoViewer
        use:refreshPreviews={{
          href: `/dashboard/galleries/${data.gallery.id}/previews?limit=10000`,
          onStatus: (message) => (previewProblem = message),
        }}
      >
        {#each data.photos as photo, i (photo.id)}<article class="photo-item">
            {#if data.gallery.status === 'draft'}<label
                ><input
                  type="checkbox"
                  form="selected-photos"
                  name="selected"
                  value={photo.id}
                  bind:group={selected}
                  disabled={locked}
                />
                Выбрать {photo.filename}</label
              >{/if}
            <a
              class="photo-preview"
              href={photo.url}
              target="_blank"
              rel="noreferrer"
              data-photo-id={photo.id}
              data-filename={photo.filename}
              data-download={`/api/galleries/${data.gallery.id}/photos/${photo.id}/download`}
              data-pswp-width={photo.width}
              data-pswp-height={photo.height}
              aria-label={`Посмотреть ${photo.filename}`}
              ><img
                src={photo.thumbnailUrl}
                alt={photo.filename}
                width={photo.width}
                height={photo.height}
                loading="lazy"
              />{#if photo.id === data.gallery.coverId}<span class="photo-cover-badge">Обложка</span
                >{/if}</a
            >
            <div class="photo-caption">
              <span>{photo.filename}</span>
              <a
                class="photo-download"
                href={`/api/galleries/${data.gallery.id}/photos/${photo.id}/download`}
                aria-label={`Скачать оригинал ${photo.filename}`}
                title="Скачать оригинал"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3v12m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
                </svg>
              </a>
            </div>
            <div class="photo-actions">
              <form
                method="POST"
                action="?/cover"
                use:enhance={submit}
                aria-busy={pending === '?/cover'}
              >
                <input type="hidden" name="photoId" value={photo.id} /><button
                  disabled={locked || photo.id === data.gallery.coverId}
                  aria-describedby="photo-cover-hint"
                  aria-label={`Сделать обложкой ${photo.filename}`}
                  >{photo.id === data.gallery.coverId
                    ? 'Обложка выбрана'
                    : 'Сделать обложкой'}</button
                >
              </form>
              {#if data.gallery.status === 'draft'}<form
                  method="POST"
                  action="?/move"
                  class="reorder-actions"
                  use:enhance={submit}
                >
                  <input type="hidden" name="photoId" value={photo.id} /><button
                    name="direction"
                    value="up"
                    disabled={locked || i === 0}
                    aria-label={`Переместить ${photo.filename} раньше`}>←</button
                  ><button
                    name="direction"
                    value="down"
                    disabled={locked || i === data.photos.length - 1}
                    aria-label={`Переместить ${photo.filename} позже`}>→</button
                  >
                </form>
              {/if}
            </div>
          </article>{:else}<p class="empty">
            Пока ни одного снимка.<br />Добавьте фотографии, чтобы оживить историю.
          </p>{/each}
      </div>
    </section>
  </div>
{/if}
{#if data.gallery.status === 'draft'}
  <details class="danger-panel" open={data.gallery.deleting}>
    <summary id="delete-heading">Удаление галереи</summary>
    <p>Галерея и все её фотографии будут удалены без возможности восстановления.</p>
    <form method="POST" action="?/delete" use:enhance={submit} aria-busy={pending === '?/delete'}>
      <label
        ><input type="checkbox" name="confirm" value="yes" required /> Подтверждаю удаление галереи и
        всех фотографий</label
      >
      <button disabled={locked}
        >{pending === '?/delete'
          ? 'Удаляем…'
          : data.gallery.deleting
            ? 'Повторить удаление'
            : 'Удалить галерею'}</button
      >
    </form>
  </details>
{/if}
