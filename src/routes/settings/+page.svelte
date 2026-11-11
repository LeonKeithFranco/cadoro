<!--
  @component
  The Settings screen, a placeholder until there's something to set, with the app's version.
-->
<script lang="ts">
	import ScreenPlaceholder from '#lib/components/ScreenPlaceholder.svelte';
</script>

<ScreenPlaceholder
	title="Settings"
	message="The theme, chimes, backups and more will be set here in a later version."
/>
<p class="mt-6 text-sm text-zinc-600 dark:text-zinc-400">Version {__APP_VERSION__}</p>
