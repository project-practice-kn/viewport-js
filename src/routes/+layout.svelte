<script lang="ts">
  import 'bulma/css/bulma.min.css';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

<main class="section">
  <div class="container">{@render children()}</div>
</main>
