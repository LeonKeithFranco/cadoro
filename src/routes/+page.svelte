<!--
  @component
  The Timer screen, the app's home, showing the app's one timer session, which the root layout's
  `load` made.
-->
<script lang="ts">
	import TimerScreen from '#lib/components/TimerScreen.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<TimerScreen session={data.timerSession} />
