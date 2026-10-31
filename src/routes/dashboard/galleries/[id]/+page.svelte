<script lang="ts">
  import type { PageProps } from './$types';
  import PhotoUploader from '#lib/components/PhotoUploader.svelte';
  import ShareLink from '#lib/components/ShareLink.svelte';
  import { formatPhotos } from '#lib/format.ts';
  import { enhance, type SubmitFunction } from '$app/forms';
  import { untrack } from 'svelte';
  let { data, form }: PageProps = $props();
  let title = $state(untrack(() => String(form?.values?.title ?? data.gallery.title)));
  let description = $state(
    untrack(() => String(form?.values?.description ?? data.gallery.description)),
  );
  let theme = $state(untrack(() => String(form?.values?.theme ?? data.gallery.theme)));
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
    <p class="eyebrow">
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
<div class="editor-layout">
  <aside id="gallery-settings">
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
      {#if data.gallery.status === 'published'}<p>
          Галерея доступна клиенту по ссылке. Чтобы изменить её, снимите публикацию.
        </p>
        <a class="public-link" href={data.gallery.link!} target="_blank" rel="noreferrer"
          >Открыть галерею <span class="visually-hidden">в новой вкладке</span>↗</a
        >
        <ShareLink href={data.gallery.link!} />
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
            disabled={locked || dirty || data.photos.length === 0}
            aria-describedby="publish-hint"
            >{pending === '?/publish' ? 'Публикуем…' : 'Опубликовать галерею ↗'}</button
          >
          <p id="publish-hint" class="muted form-hint">
            {uploading
              ? 'Дождитесь завершения загрузки фотографий.'
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
        bind:busy={uploading}
        disabled={pending !== null}
      />{/if}
    <div class="photo-grid editor-grid">
      {#each data.photos as photo, i (photo.id)}<article class="photo-item">
          <img
            src={photo.url}
            alt={photo.filename}
            width={photo.width}
            height={photo.height}
            loading="lazy"
          />
          <div class="photo-caption">
            <span>{photo.filename}</span>{#if photo.id === data.gallery.coverId}<span class="badge"
                >Обложка</span
              >{/if}
          </div>
          {#if data.gallery.status === 'draft'}<div class="photo-actions">
              <form method="POST" action="?/cover" use:enhance={submit}>
                <input type="hidden" name="photoId" value={photo.id} /><button
                  disabled={locked || photo.id === data.gallery.coverId}>На обложку</button
                >
              </form>
              <form method="POST" action="?/move" class="reorder-actions" use:enhance={submit}>
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
            </div>{/if}
        </article>{:else}<p class="empty">
          Пока ни одного снимка.<br />Добавьте фотографии, чтобы оживить историю.
        </p>{/each}
    </div>
  </section>
</div>
