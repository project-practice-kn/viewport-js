<script lang="ts">
  import type { PageProps } from './$types';
  import { enhance } from '$app/forms';
  import { formatBytes } from '#lib/format.ts';
  let { data, form }: PageProps = $props();
  let creating = $state(false);
  let occupied = $derived(data.usage.used + data.usage.reserved);
</script>

<svelte:head><title>Галереи · Viewport</title></svelte:head>
<div class="page-heading">
  <div>
    <p class="eyebrow">КАБИНЕТ / {data.user.name}</p>
    <h1>Ваши галереи<span class="accent">.</span></h1>
  </div>
  <form method="POST" action="/logout"><button>Выйти</button></form>
</div>
<section class="storage-summary" aria-label="Использование хранилища">
  <div class="storage-caption">
    <span>Хранилище оригиналов</span><span
      >{formatBytes(occupied)} из {formatBytes(data.usage.quota)}</span
    >
  </div>
  <meter
    min="0"
    max={data.usage.quota}
    value={Math.min(occupied, data.usage.quota)}
    aria-label="Занятое место с учётом загрузок">{formatBytes(occupied)}</meter
  >
  <p class="muted">
    Оригиналы: {formatBytes(data.usage.used)}{#if data.usage.reserved > 0}
      · загружается: {formatBytes(data.usage.reserved)}{/if}
  </p>
</section>
<section class="create-gallery">
  <h2>Новая история</h2>
  <form
    method="POST"
    aria-busy={creating}
    use:enhance={({ cancel }) => {
      if (creating) {
        cancel();
        return;
      }
      creating = true;
      return async ({ update }) => {
        try {
          await update({ reset: false });
        } finally {
          creating = false;
        }
      };
    }}
  >
    <label
      >Название галереи<input
        name="title"
        placeholder="Например, осенняя прогулка"
        maxlength="120"
        required
        value={form?.title ?? ''}
      /></label
    ><button class="primary" disabled={creating}
      >{creating ? 'Создаём…' : 'Создать галерею ↗'}</button
    >
  </form>
  {#if form?.message}<p class="feedback error" role="alert">{form.message}</p>{/if}
</section>
<section class="gallery-list" aria-labelledby="gallery-list-title">
  <div class="section-heading">
    <h2 id="gallery-list-title">Все галереи</h2>
    <span class="muted">{data.galleries.length}</span>
  </div>
  {#each data.galleries as gallery, i}<a
      class="gallery-row"
      href={`/dashboard/galleries/${gallery.id}`}
      ><span class="muted">{String(i + 1).padStart(2, '0')}</span>
      <h2>{gallery.title}</h2>
      <span class="badge" class:published={gallery.status === 'published'}
        >{gallery.status === 'draft' ? 'Черновик' : 'Опубликована'}</span
      ><span aria-hidden="true">↗</span></a
    >{:else}<p class="empty">
      Здесь начнётся ваша первая история.<br />Создайте галерею и добавьте фотографии.
    </p>{/each}
</section>
