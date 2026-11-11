<!--
  @component
  The Timer screen, the app's home, showing the app's one timer session.
-->
<script lang="ts">
	import TimerScreen from '#lib/components/TimerScreen.svelte';
	import { timerSession } from '#lib/timer.svelte.ts';
</script>

<TimerScreen session={timerSession} />
