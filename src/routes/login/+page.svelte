<script lang="ts">
  import { onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
  let register = $derived(data.register || !!form?.register);
  let showPassword = $state(false);
  let mounted = $state(false);
  let submitting = $state(false);
  onMount(() => {
    mounted = true;
  });
</script>

<svelte:head><title>{register ? 'Создать аккаунт' : 'Вход'} · Viewport</title></svelte:head>
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
    {#if data.reset}<p class="feedback" role="status">
        Пароль обновлён. Войдите с новым паролем.
      </p>{/if}
    {#if form?.message}<p class="feedback error" role="alert">{form.message}</p>{/if}
    <form
      method="POST"
      aria-busy={submitting}
      use:enhance={({ cancel }) => {
        if (submitting) {
          cancel();
          return;
        }
        submitting = true;
        return async ({ update }) => {
          try {
            await update({ reset: false });
          } finally {
            submitting = false;
          }
        };
      }}
    >
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
          autocapitalize="none"
          spellcheck="false"
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
            aria-describedby={register ? 'password-hint' : undefined}
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
      {#if register}<p id="password-hint" class="muted">От 10 до 128 символов</p>{/if}
      {#if register}<label
          >Код приглашения<input
            name="inviteCode"
            type="password"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            maxlength="256"
            required
            aria-describedby="invite-hint"
          /></label
        >
        <p id="invite-hint" class="muted">Для регистрации нужен код от организатора демо.</p>{/if}
      <input type="hidden" name="mode" value={register ? 'register' : 'login'} />
      <input type="hidden" name="returnTo" value={data.returnTo} />
      <button class="primary" disabled={submitting}
        >{submitting
          ? register
            ? 'Создаём аккаунт…'
            : 'Входим…'
          : register
            ? 'Зарегистрироваться'
            : 'Войти'} <span aria-hidden="true">↗</span></button
      >
      <a
        class="text-button"
        href={`${register ? '/login?' : '/login?mode=register&'}returnTo=${encodeURIComponent(data.returnTo)}`}
        >{register ? 'Уже есть аккаунт? Войти' : 'Впервые здесь? Создать аккаунт'}</a
      >
      {#if !register}<a class="text-button" href="/recover">Забыли пароль?</a>{/if}
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
