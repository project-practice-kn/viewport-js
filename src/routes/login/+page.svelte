<script lang="ts">
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
  let register = $derived(data.register || !!form?.register);
</script>

<svelte:head><title>Вход · Viewport</title></svelte:head>
<div class="login-layout">
  <section class="intro">
    <p class="eyebrow">ПРОСТРАНСТВО ДЛЯ ВАШИХ ИСТОРИЙ</p>
    <h1>Снимки готовы.<br /><em>Пора делиться.</em></h1>
    <p class="lede">
      Соберите фотографии в галерею и отправьте клиенту одну ссылку. Оригиналы останутся в полном
      качестве.
    </p>
    <div class="frame-art" aria-hidden="true">
      <span>V</span><small>VIEWPORT / PHOTO DELIVERY</small>
    </div>
  </section>
  <section class="login-panel">
    <p class="eyebrow">КАБИНЕТ ФОТОГРАФА</p>
    <h2>{register ? 'Создать аккаунт' : 'С возвращением'}</h2>
    {#if form?.message}<p class="feedback error" role="alert">{form.message}</p>{/if}
    <form method="POST">
      {#if register}<label
          >Ваше имя<input
            name="name"
            autocomplete="name"
            required
            maxlength="100"
            value={form?.name ?? ''}
          /></label
        >{/if}
      <label
        >Email<input
          type="email"
          name="email"
          autocomplete="email"
          required
          value={form?.email ?? ''}
        /></label
      >
      <label
        >Пароль<input
          type="password"
          name="password"
          autocomplete={register ? 'new-password' : 'current-password'}
          required
          minlength="10"
          maxlength="128"
        /></label
      >
      <p class="muted">От 10 до 128 символов</p>
      <button class="primary" name="mode" value={register ? 'register' : 'login'}
        >{register ? 'Зарегистрироваться' : 'Войти'} <span aria-hidden="true">↗</span></button
      >
      <a class="text-button" href={register ? '/login' : '/login?mode=register'}
        >{register ? 'Уже есть аккаунт? Войти' : 'Впервые здесь? Создать аккаунт'}</a
      >
    </form>
  </section>
</div>
