<script lang="ts">
  import type { PageProps } from './$types';
  import PhotoUploader from '#lib/components/PhotoUploader.svelte';
  import { enhance } from '$app/forms';
  let { data, form }: PageProps = $props();
  let saving = $state(false);
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
  <span class="badge">{data.photos.length} фото</span>
</div>
{#if form?.message}<p class:success={form.success} class="feedback" role="status">
    {form.message}
  </p>{/if}
<div class="editor-layout">
  <aside>
    <h2>Детали истории</h2>
    <form
      method="POST"
      action="?/save"
      use:enhance={() => {
        saving = true;
        return async ({ update }) => {
          await update();
          saving = false;
        };
      }}
    >
      <fieldset disabled={data.gallery.status === 'published' || saving}>
        <label
          >Название<input
            name="title"
            maxlength="120"
            required
            value={String(form?.values?.title ?? data.gallery.title)}
          /></label
        >
        <label
          >Описание<textarea name="description" maxlength="2000" rows="4"
            >{String(form?.values?.description ?? data.gallery.description)}</textarea
          ></label
        >
        <label
          >Тема<select name="theme" value={String(form?.values?.theme ?? data.gallery.theme)}
            ><option value="light">Светлая</option><option value="dark">Тёмная</option></select
          ></label
        >
        <button>{saving ? 'Сохраняем…' : 'Сохранить настройки'}</button>
      </fieldset>
    </form>
    <div class="publish-panel">
      {#if data.gallery.status === 'published'}<p>
          Галерея доступна клиенту по ссылке. Чтобы изменить её, снимите публикацию.
        </p>
        <a class="public-link" href={data.gallery.link!}>Открыть публичную галерею ↗</a><label
          >Ссылка для клиента<input
            readonly
            value={new URL(
              data.gallery.link!,
              typeof window === 'undefined' ? 'http://localhost:5173' : window.location.origin,
            ).href}
            onclick={(e) => e.currentTarget.select()}
          /></label
        >
        <form method="POST" action="?/unpublish"><button>Снять с публикации</button></form>{:else}<p
          class="muted"
        >
          Для публикации загрузите хотя бы один снимок и дождитесь завершения обработки. Первый
          снимок станет обложкой.
        </p>
        <form method="POST" action="?/publish">
          <button class="primary">Опубликовать галерею ↗</button>
        </form>{/if}
    </div>
  </aside>
  <section aria-label="Фотографии галереи">
    {#if data.gallery.status === 'draft'}<PhotoUploader galleryId={data.gallery.id} />{/if}
    <div class="photo-grid editor-grid">
      {#each data.photos as photo, i}<article class="photo-item">
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
              <form method="POST" action="?/cover">
                <input type="hidden" name="photoId" value={photo.id} /><button
                  disabled={photo.id === data.gallery.coverId}>На обложку</button
                >
              </form>
              <form method="POST" action="?/move">
                <input type="hidden" name="photoId" value={photo.id} /><button
                  name="direction"
                  value="up"
                  disabled={i === 0}
                  aria-label={`Переместить ${photo.filename} раньше`}>←</button
                ><button
                  name="direction"
                  value="down"
                  disabled={i === data.photos.length - 1}
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
