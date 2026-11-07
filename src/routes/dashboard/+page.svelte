<script lang="ts">
  import type { PageProps } from './$types';
  import { enhance } from '$app/forms';
  import { formatBytes, formatPhotos } from '#lib/format.ts';
  import ShareLink from '#lib/components/ShareLink.svelte';
  import { onMount } from 'svelte';
  let { data, form }: PageProps = $props();
  let creating = $state(false);
  let occupied = $derived(data.usage.used + data.usage.reserved);
  let localDates = $state(false);
  onMount(() => {
    localDates = true;
  });
</script>

<svelte:head><title>Галереи · Viewport</title></svelte:head>
<div class="page-heading">
  <div>
    <p class="account-name">Кабинет фотографа · {data.user.name}</p>
    <h1>Ваши галереи<span class="accent">.</span></h1>
  </div>
  <div class="account-actions">
    <a href="/dashboard/account">Настройки аккаунта</a>
    <form method="POST" action="/logout"><button>Выйти</button></form>
  </div>
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
  <form method="GET" class="gallery-filters">
    <label
      >Поиск по названию<input
        type="search"
        placeholder="Название галереи…"
        name="q"
        value={data.query}
        maxlength="120"
      /></label
    >
    <label for="gallery-status"
      >Статус<select id="gallery-status" name="status" value={data.status}
        ><option value="">Все галереи</option><option value="draft">Черновики</option><option
          value="published">Опубликованные</option
        ></select
      ></label
    >
    <label for="gallery-sort"
      >Сортировать<select id="gallery-sort" name="sort" value={data.sort}>
        <option value="date">По дате изменения</option><option value="name">По названию</option
        ><option value="size">По размеру</option>
      </select></label
    >
    <button>Найти</button><a href="/dashboard">Сбросить</a>
  </form>
  <div class="gallery-tiles">
    {#each data.galleries as gallery}<article class="gallery-tile">
        <a
          class="gallery-tile-cover"
          href={`/dashboard/galleries/${gallery.id}`}
          aria-label={`Открыть галерею «${gallery.title}»`}
        >
          {#if gallery.coverUrl}<img
              src={gallery.coverUrl}
              alt=""
              width="720"
              height="480"
              loading="lazy"
            />
          {:else}<div class="gallery-tile-empty">
              <span class="empty-cover-mark" aria-hidden="true"></span><span
                >Добавьте первые фотографии</span
              >
            </div>{/if}
          <span class="badge" class:published={gallery.status === 'published'}
            >{gallery.deleting
              ? 'Удаление не завершено'
              : gallery.status === 'draft'
                ? 'Черновик'
                : 'Опубликована'}</span
          >
          <span class="gallery-tile-arrow" aria-hidden="true">↗</span>
        </a>
        <div class="gallery-tile-caption">
          <h2><a href={`/dashboard/galleries/${gallery.id}`}>{gallery.title}</a></h2>
          <p class="muted">
            {formatPhotos(gallery.photoCount)} · {formatBytes(gallery.photoBytes)}
          </p>
          <time
            class="gallery-tile-date"
            datetime={new Date(gallery.updatedAt).toISOString()}
            title="Дата изменения"
          >
            {localDates
              ? new Date(gallery.updatedAt).toLocaleDateString('ru-RU')
              : `${new Date(gallery.updatedAt).toLocaleDateString('ru-RU', { timeZone: 'UTC' })} UTC`}
          </time>
        </div>
        {#if gallery.link}<div class="gallery-tile-actions">
            <a href={gallery.link} target="_blank" rel="noreferrer">Для клиента ↗</a><ShareLink
              href={gallery.link}
              compact
            />
          </div>{/if}
      </article>{:else}<p class="empty">
        {#if data.query || data.status}Галереи не найдены. Измените условия поиска.{:else}Здесь
          начнётся ваша первая история.<br />Создайте галерею и добавьте фотографии.{/if}
      </p>{/each}
  </div>
</section>
