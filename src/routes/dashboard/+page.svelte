<script lang="ts">
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Галереи · Viewport</title></svelte:head>
<div class="page-heading">
  <div>
    <p class="eyebrow">КАБИНЕТ / {data.user.name}</p>
    <h1>Ваши галереи<span class="accent">.</span></h1>
  </div>
  <form method="POST" action="/logout"><button>Выйти</button></form>
</div>
<p class="muted">
  Оригиналы: {(data.usage.used / 1048576).toFixed(1)} МБ · зарезервировано {(
    data.usage.reserved / 1048576
  ).toFixed(1)} МБ · лимит {(data.usage.quota / 1073741824).toFixed(1)} ГБ
</p>
<section class="create-gallery">
  <h2>Новая история</h2>
  <form method="POST">
    <label
      >Название галереи<input
        name="title"
        placeholder="Например, осенняя прогулка"
        maxlength="120"
        required
        value={form?.title ?? ''}
      /></label
    ><button class="primary">Создать галерею ↗</button>
  </form>
  {#if form?.message}<p class="feedback error" role="alert">{form.message}</p>{/if}
</section>
<div class="gallery-list">
  {#each data.galleries as gallery, i}<a
      class="gallery-row"
      href={`/dashboard/galleries/${gallery.id}`}
      ><span class="muted">{String(i + 1).padStart(2, '0')}</span>
      <h2>{gallery.title}</h2>
      <span class="badge">{gallery.status === 'draft' ? 'Черновик' : 'Опубликована'}</span><span
        aria-hidden="true">↗</span
      ></a
    >{:else}<p class="empty">
      Здесь начнётся ваша первая история.<br />Создайте галерею и добавьте фотографии.
    </p>{/each}
</div>
