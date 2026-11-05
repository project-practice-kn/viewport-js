<script lang="ts">
  import GalleryView from '#lib/components/GalleryView.svelte';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
</script>

<GalleryView {data} />
