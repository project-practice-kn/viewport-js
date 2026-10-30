<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
  let register = $derived(data.register || !!form?.register);
  let showPassword = $state(false);
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
  });
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
      <div class="password-field">
        <label for="password">Пароль</label>
        <div class="password-control">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            name="password"
            autocomplete={register ? 'new-password' : 'current-password'}
            required
            minlength="10"
            maxlength="128"
          />
          {#if mounted}
            <button
              type="button"
              class="password-toggle"
              aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              aria-pressed={showPassword}
              aria-controls="password"
              onclick={() => (showPassword = !showPassword)}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                {#if showPassword}<path d="m3 3 18 18" />{/if}
              </svg>
            </button>
          {/if}
        </div>
      </div>
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

<style>
  .password-field {
    margin-bottom: 20px;
  }
  .password-field label {
    margin-bottom: 8px;
  }
  .password-control {
    position: relative;
  }
  .password-control input {
    margin-top: 0;
    padding-right: 56px;
  }
  .password-toggle {
    position: absolute;
    right: 3px;
    top: 50%;
    transform: translateY(-50%);
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    color: #25312c;
  }
</style>
