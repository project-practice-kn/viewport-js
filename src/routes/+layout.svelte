<script lang="ts">
  import 'bulma/css/bulma.min.css';
  import '#lib/styles/app.css';
  import type { LayoutProps } from './$types';
  let { children }: LayoutProps = $props();
</script>

<a class="skip-link" href="#main-content">Перейти к содержимому</a>
<header class="site-header">
  <a href="/" class="wordmark" aria-label="Viewport — главная"
    ><span class="logo-mark" aria-hidden="true"></span>viewport<span class="accent">®</span></a
  ><span class="header-note">ФОТОГРАФИИ, КОТОРЫЕ ОБЪЕДИНЯЮТ</span>
</header>
<main id="main-content" class="site-main" tabindex="-1">{@render children()}</main>
