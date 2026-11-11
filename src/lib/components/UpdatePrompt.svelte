<!--
  @component
  Registers the service worker, and offers to reload when a new version of the app is waiting.
  The offer waits while a run is in progress, so an update never interrupts focused work or
  throws a run away. Later puts it off until the app next opens, when the new version takes over
  by itself.
-->
<script lang="ts">
	import { useRegisterSW } from 'virtual:pwa-register/svelte';
	import { reloadPage } from '#lib/page-reload.ts';

	/** The props the prompt takes. */
	type Props = {
		/** Whether a run is under way, which holds the offer back until it ends. */
		runInProgress: boolean;
	};

	let { runInProgress }: Props = $props();

	/**
	 * Whether a new version already controls this page, because Reload was pressed in another of
	 * the app's tabs while this one was mid-run. Reload can then only reload, as no version is
	 * left waiting.
	 */
	let isNewVersionInControl = false;

	/**
	 * Reloads into the new version once it controls the page, unless this page is mid-run.
	 *
	 * @remarks
	 * The plugin calls this in every tab the app has open, not just the one where Reload was
	 * pressed, and would otherwise reload each of them at once.
	 */
	function onNeedReload(): void {
		if (runInProgress) {
			isNewVersionInControl = true;
			return;
		}

		reloadPage();
	}

	/**
	 * Whether a new version is waiting to take over, and the way to hand over to it.
	 *
	 * @remarks
	 * Registers the service worker as the prompt starts. `needRefresh` is a Svelte store, which
	 * `$needRefresh` in the markup reads and follows.
	 */
	const { needRefresh, updateServiceWorker } = useRegisterSW({ onNeedReload });

	/**
	 * Hands over to the new version, which reloads the page once it's in control, or reloads at
	 * once if it already is.
	 */
	function reload(): void {
		if (isNewVersionInControl) {
			reloadPage();
			return;
		}

		void updateServiceWorker();
	}

	/** Hides the offer. The waiting version takes over the next time the app opens. */
	function putOff(): void {
		needRefresh.set(false);
	}
</script>

<!-- Always in the page, because screen readers only announce changes inside a status region that
     was already there. It floats above the phone's tab bar, and in the bottom-right corner from
     48rem up, where there's no tab bar. The empty region lets taps through to the page. -->
<div
	role="status"
	class="pointer-events-none fixed inset-x-4 bottom-20 z-20 flex justify-center md:bottom-4 md:left-auto"
>
	{#if $needRefresh && !runInProgress}
		<!-- In the page's opposite colours, as pop-up messages usually are, so it never blends into
		     a card behind it. -->
		<div
			class="pointer-events-auto flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-zinc-900 py-3 pr-3 pl-4 text-zinc-100 shadow-xl dark:bg-zinc-100 dark:text-zinc-900"
		>
			<p>A new version is ready.</p>
			<div class="flex gap-2 *:rounded-lg *:px-4 *:py-2 *:font-medium">
				<button
					type="button"
					onclick={reload}
					class="bg-rose-400 text-zinc-950 hover:bg-rose-300 dark:bg-rose-700 dark:text-white dark:hover:bg-rose-800"
				>
					Reload
				</button>
				<button type="button" onclick={putOff} class="hover:bg-zinc-800 dark:hover:bg-zinc-200">
					Later
				</button>
			</div>
		</div>
	{/if}
</div>
