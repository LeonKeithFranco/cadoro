<!--
  @component
  The Stats screen, showing the routines and work periods that the page's `load` read from
  storage, and the work so far in the run in progress, which it follows, since another tab may be
  counting it. While a work period counts, the figures move on every second.
-->
<script lang="ts">
	import StatsScreen from '#lib/components/StatsScreen.svelte';
	import type { StoredRunInProgress } from '#lib/run-in-progress.ts';
	import { nextLocalDay, startOfLocalDay } from '#lib/day-slices.ts';
	import { recordError } from '#lib/error-log.ts';
	import type { Routine } from '#lib/routine.ts';
	import type { WorkPeriod } from '#lib/run-records.ts';
	import { MS_PER_SECOND } from '#lib/time.ts';
	import { workInProgress } from '#lib/work-in-progress.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** The run in progress as last saved, in any tab. */
	let runInProgress = $state.raw<StoredRunInProgress | null>(null);
	/** The routines, deleted ones included, as last read. */
	let routines = $state.raw<Routine[]>([]);
	/** The saved work periods, as last read. */
	let workPeriods = $state.raw<WorkPeriod[]>([]);
	/** The current moment, which moves on while a work period counts. */
	let now = $state(Date.now());

	// Starts from what `load` read, then follows storage. A change to the run in progress, such as
	// another tab pressing Next, may have saved a work period, so the work periods and routines are
	// read again, and so are they when the routines change, as an import in another tab does. The figures keep what they show until that read arrives, so the work of a period
	// that just ended never drops to zero, and keep it if the read fails.
	$effect(() => {
		runInProgress = data.runInProgress;
		routines = data.routines;
		workPeriods = data.workPeriods;
		now = Date.now();

		let stopped = false;
		let revisionShown = data.runInProgress?.revision ?? null;
		let latestSaved = data.runInProgress;
		let reading = 0;

		/** Reads the routines and work periods again, showing them once both have arrived. */
		function readAgain(): void {
			reading += 1;
			void Promise.all([data.storage.getAllRoutines(), data.storage.getWorkPeriods()])
				.then(([readRoutines, readWorkPeriods]) => {
					if (stopped) {
						return;
					}
					routines = readRoutines;
					workPeriods = readWorkPeriods;
					runInProgress = latestSaved;
					now = Date.now();
				})
				.catch((error: unknown) => {
					void recordError('Could not read the work periods for Stats.', error);
				})
				.finally(() => {
					reading -= 1;
				});
		}

		const stopFollowing = data.storage.watchRunInProgress(
			(saved) => {
				latestSaved = saved;
				const changed = (saved?.revision ?? null) !== revisionShown;
				if (!changed) {
					// A heartbeat, which only moves the run's last save, unless a read is still pending.
					if (reading === 0) {
						runInProgress = saved;
						now = Date.now();
					}
					return;
				}
				revisionShown = saved?.revision ?? null;
				readAgain();
			},
			(error) => {
				void recordError('Could not read the run in progress for Stats.', error);
			}
		);

		// An import replaces the routines and the work periods together, and can leave the run in
		// progress at none, so with no run to change, only the routines tell this tab. The first
		// report only replays what `load` read.
		let replayed = false;
		const stopFollowingRoutines = data.storage.watchRoutines(
			() => {
				if (!replayed) {
					replayed = true;
					return;
				}
				readAgain();
			},
			(error) => {
				void recordError('Could not read the routines for Stats.', error);
			}
		);
		return (): void => {
			stopped = true;
			stopFollowing();
			stopFollowingRoutines();
		};
	});

	/** Whether the run in progress is in a work period that's counting. */
	const isCounting = $derived(
		runInProgress?.run.status === 'working' && runInProgress.run.runningSince !== null
	);

	// Moves `now` on every second while a work period counts, so its work grows on the screen.
	$effect(() => {
		if (!isCounting) {
			return;
		}
		const interval = setInterval((): void => {
			now = Date.now();
		}, MS_PER_SECOND);
		return (): void => {
			clearInterval(interval);
		};
	});

	/** The local midnight that starts the day `now` is in, which changes when a new day begins. */
	const today = $derived(startOfLocalDay(now));

	// Moves `now` on at the next local midnight, so a screen left open shows the new day as today,
	// and again each time it runs for the next one.
	$effect(() => {
		const untilMidnight = nextLocalDay(today) - Date.now();
		const timeout = setTimeout(
			(): void => {
				now = Date.now();
			},
			Math.max(untilMidnight, 0)
		);
		return (): void => {
			clearTimeout(timeout);
		};
	});

	/**
	 * Moves `now` on when the page becomes visible, since a sleeping device or a hidden tab may have
	 * let midnight pass without running the timer above.
	 */
	function refreshWhenVisible(): void {
		if (document.visibilityState === 'visible') {
			now = Date.now();
		}
	}

	/** The work so far in the current work period, or `null`. */
	const current = $derived(workInProgress(runInProgress, routines, now));
</script>

<svelte:document onvisibilitychange={refreshWhenVisible} />

<StatsScreen {workPeriods} {routines} {now} workInProgress={current} />
