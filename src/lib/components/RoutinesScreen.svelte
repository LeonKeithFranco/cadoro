<!--
  @component
  The Routines screen: every routine that isn't deleted, in the order the user chose, with "+ New
  routine" and, for each routine, Edit, Duplicate and Delete. In custom order the routines can be
  reordered by dragging their handles or with Move up and Move down. Editing happens in place,
  one routine at a time, and asks "Discard changes?" before opening another routine, or leaving
  the screen, with changes that aren't saved. It follows storage, so a change from another tab
  shows as it's made.
-->
<script module lang="ts">
	import type { RouteId } from '$app/types';
	import type { RoutineSort } from '../settings';

	/**
	 * The screens the user can leave for, which is the only place leaving can be asked about and
	 * then carried on to with `goto`, since the app has no other pages.
	 */
	const SCREEN_ROUTES: RouteId[] = ['/', '/routines', '/stats', '/settings'];

	/** An order the list can be sorted in, with its name in the drop-down. */
	type SortOption = {
		/** The sort, as `Settings` remembers it. */
		value: RoutineSort;
		/** What the drop-down calls it. */
		label: string;
	};

	/** The seven orders, in the order the drop-down lists them. */
	const SORT_OPTIONS: SortOption[] = [
		{ value: 'custom', label: 'Custom order' },
		{ value: 'title-asc', label: 'Title (A–Z)' },
		{ value: 'title-desc', label: 'Title (Z–A)' },
		{ value: 'last-used', label: 'Last used' },
		{ value: 'most-work', label: 'Most work time' },
		{ value: 'newest', label: 'Newest' },
		{ value: 'oldest', label: 'Oldest' }
	];

	/** The routine being edited, and the routine as it was before the edit. */
	type Editing = {
		/** The routine as it was when editing started, which Cancel goes back to. */
		original: Routine;
		/** The routine with the user's changes so far. */
		draft: Routine;
		/** Whether it's a new routine, which isn't saved until Save is pressed. */
		isNew: boolean;
		/** What went wrong the last time Save was pressed, if anything. */
		saveError?: string | undefined;
	};
</script>

<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Plus from '@lucide/svelte/icons/plus';
	import { dragHandleZone, type DndEvent } from 'svelte-dnd-action';
	import { onMount, untrack } from 'svelte';
	import { newRoutine, canDeleteRoutine, type Routine } from '../routine';
	import { duplicateRoutine } from '../routine-duplication';
	import { moveRoutineDown, moveRoutineUp } from '../routine-order';
	import { sortRoutines, type RoutineUsage } from '../routine-sort';
	import type { SettingsSession } from '../settings.svelte';
	import type { CadoroStorage } from '../storage/storage';
	import { COMPACT_BUTTON_SHAPE, PRIMARY_BUTTON_COLOURS } from './button-colours';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import RoutineCard from './RoutineCard.svelte';
	import RoutineForm from './RoutineForm.svelte';
	import ScreenHeading from './ScreenHeading.svelte';

	/** The props the Routines screen takes. */
	type Props = {
		/** Where routines are saved, followed and read. */
		storage: CadoroStorage;
		/** The settings, which remember the chosen sort. */
		settingsSession: SettingsSession;
		/** The routines not deleted as the app opened, so the first render already lists them. */
		initialRoutines: readonly Routine[];
		/**
		 * The id of the routine a run in progress, in this tab or another, is running, or `null`
		 * when none is. That routine can't be edited or deleted, because a saved run is restored
		 * from its routine and is forgotten if the routine is gone.
		 */
		runningRoutineId?: string | null;
		/** Returns a new unique id each time it's called. `crypto.randomUUID` unless a test gives its own. */
		newId?: () => string;
		/** Returns the current moment. `new Date()` unless a test gives its own. */
		now?: () => Date;
	};

	let {
		storage,
		settingsSession,
		initialRoutines,
		runningRoutineId = null,
		newId = (): string => crypto.randomUUID(),
		now = (): Date => new Date()
	}: Props = $props();

	/** The routines not deleted, in custom order, as storage last reported them. */
	// Only the first value of the prop is wanted, since storage's reports take over from there.
	let routines = $state.raw<Routine[]>(untrack(() => [...initialRoutines]));

	/** The runs and work periods that "last used" and "most work" are worked out from. */
	let usage = $state.raw<RoutineUsage>({ runs: [], workPeriods: [] });

	let sort = $derived(settingsSession.settings.routineSort);
	let isInCustomOrder = $derived(sort === 'custom');
	let sorted = $derived(sortRoutines(routines, sort, usage));
	let canDelete = $derived(canDeleteRoutine(routines));

	/** The routine being edited, or `null` when none is. */
	let editing = $state.raw<Editing | null>(null);

	/** Whether the edit has changes that aren't saved. */
	let hasUnsavedChanges = $derived(
		editing !== null && JSON.stringify(editing.draft) !== JSON.stringify(editing.original)
	);

	/**
	 * What to do once the user agrees to discard their changes, or `null` while the question isn't
	 * being asked.
	 */
	let afterDiscard = $state.raw<(() => void) | null>(null);

	/** The routine the user asked to delete, or `null` while the question isn't being asked. */
	let routineToDelete = $state.raw<Routine | null>(null);

	/** The routines while one is being dragged, in the order the drag has them so far, or `null`. */
	let draggedRoutines = $state.raw<Routine[] | null>(null);

	/** Whether the list has drag handles: in custom order, while no routine is being edited. */
	let hasDragHandles = $derived(isInCustomOrder && editing === null);

	onMount(() => {
		const stop = storage.watchRoutines(
			(changed) => {
				routines = changed;
			},
			(error: unknown) => {
				console.error('Changes to the routines can no longer be followed.', error);
			}
		);
		Promise.all([storage.getRuns(), storage.getWorkPeriods()])
			.then(([runs, workPeriods]) => {
				usage = { runs, workPeriods };
			})
			.catch((error: unknown) => {
				console.error('The runs could not be read, so "last used" and "most work" are off.', error);
			});
		return stop;
	});

	beforeNavigate((navigation) => {
		if (!hasUnsavedChanges) {
			return;
		}

		// Closing the tab can't wait for the dialog, so the browser asks instead.
		navigation.cancel();
		const screen = SCREEN_ROUTES.find((route) => route === navigation.to?.route.id);
		if (navigation.willUnload || screen === undefined) {
			return;
		}
		afterDiscard = (): void => {
			editing = null;
			void goto(resolve(screen));
		};
	});

	/**
	 * Runs an action that would drop the edit in progress, after asking when it has unsaved changes.
	 *
	 * @param action - What to do, such as opening another routine for editing.
	 */
	function discardingChanges(action: () => void): void {
		if (hasUnsavedChanges) {
			afterDiscard = action;
		} else {
			action();
		}
	}

	/** Runs what the user agreed to discard their changes for. */
	function confirmDiscard(): void {
		const action = afterDiscard;
		afterDiscard = null;
		action?.();
	}

	/**
	 * Tells the user and logs that a save or other change to storage failed.
	 *
	 * @param what - What was being done, such as "Deleting the routine".
	 * @param error - What storage threw.
	 */
	function reportFailure(what: string, error: unknown): void {
		console.error(`${what} failed.`, error);
	}

	/**
	 * Says why an edit can't be saved, which it can't once a run of its routine has started.
	 *
	 * @param current - The edit.
	 * @returns The reason, or `undefined` when it can be saved.
	 */
	function lockedReasonOf(current: Editing): string | undefined {
		return !current.isNew && current.original.id === runningRoutineId
			? 'A run of this routine has started, so it can’t be saved. Cancel, and edit it once the run ends.'
			: undefined;
	}

	/** Opens a new routine for editing at the top of the list. */
	function startNewRoutine(): void {
		discardingChanges(() => {
			const created = newRoutine(now(), newId);
			editing = { original: created, draft: created, isNew: true };
		});
	}

	/**
	 * Opens a routine for editing in place.
	 *
	 * @param routine - The routine to edit.
	 */
	function startEditing(routine: Routine): void {
		discardingChanges(() => {
			editing = { original: routine, draft: routine, isNew: false };
		});
	}

	/** Saves the routine being edited, and closes the form once it's saved. */
	async function save(): Promise<void> {
		const current = editing;
		if (current === null || lockedReasonOf(current) !== undefined) {
			return;
		}

		const draft = current.draft;
		const trimmed: Routine = {
			...draft,
			title: draft.title.trim(),
			blocks: draft.blocks.map((block) => ({ ...block, title: block.title.trim() }))
		};
		try {
			if (current.isNew) {
				await storage.createRoutine(trimmed);
			} else if (hasUnsavedChanges) {
				await storage.saveRoutine(trimmed);
			}
			editing = null;
		} catch (error) {
			reportFailure('Saving the routine', error);
			editing = { ...current, saveError: 'The routine could not be saved. Try again.' };
		}
	}

	/**
	 * Saves a copy of a routine just below it.
	 *
	 * @param routine - The routine to copy.
	 */
	async function duplicate(routine: Routine): Promise<void> {
		try {
			await storage.duplicateRoutine(duplicateRoutine(routine, now(), newId), routine.id);
		} catch (error) {
			reportFailure('Duplicating the routine', error);
		}
	}

	/** Deletes the routine the user confirmed deleting. */
	async function confirmDelete(): Promise<void> {
		const routine = routineToDelete;
		routineToDelete = null;
		if (routine === null || routine.id === runningRoutineId) {
			return;
		}

		try {
			await storage.deleteRoutine(routine.id);
		} catch (error) {
			reportFailure('Deleting the routine', error);
		}
	}

	/**
	 * Saves the routines in a new custom order, which shows at once and is undone if it fails.
	 *
	 * @param ordered - The routines in their new order.
	 */
	async function reorder(ordered: Routine[]): Promise<void> {
		routines = ordered.map((routine, index) => ({ ...routine, customPosition: index }));
		try {
			await storage.reorderRoutines(ordered.map((routine) => routine.id));
		} catch (error) {
			reportFailure('Reordering the routines', error);
			routines = await storage.getRoutines();
		}
	}

	/**
	 * Takes on the routines as a drag has them.
	 *
	 * @param event - The drag-and-drop library's event, whose items are the routines in the new order.
	 */
	function considerRoutines(event: CustomEvent<DndEvent<Routine>>): void {
		draggedRoutines = event.detail.items;
	}

	/**
	 * Saves the routines as dropped.
	 *
	 * @param event - The drag-and-drop library's event, whose items are the routines in the new order.
	 */
	function dropRoutines(event: CustomEvent<DndEvent<Routine>>): void {
		draggedRoutines = null;
		void reorder(event.detail.items);
	}

	/**
	 * Remembers the sort the user chose in the drop-down.
	 *
	 * @param value - The chosen option's value.
	 */
	function chooseSort(value: string): void {
		const option = SORT_OPTIONS.find((candidate) => candidate.value === value);
		if (option !== undefined) {
			void settingsSession.save({ routineSort: option.value });
		}
	}
</script>

<ScreenHeading title="Routines" />

<div class="mt-4 flex flex-wrap items-end justify-between gap-3">
	<label class="block">
		<span class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Sort by</span>
		<select
			bind:value={(): string => sort, chooseSort}
			class="mt-1 block rounded-md border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
		>
			{#each SORT_OPTIONS as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</label>
	<button
		type="button"
		onclick={startNewRoutine}
		class="{COMPACT_BUTTON_SHAPE} {PRIMARY_BUTTON_COLOURS}"
	>
		<Plus class="size-4" />
		New routine
	</button>
</div>

{#snippet editor(current: Editing)}
	<div
		class="rounded-xl border border-rose-700 bg-white p-4 ring-1 ring-rose-700 md:p-6 dark:border-rose-400 dark:bg-zinc-900 dark:ring-rose-400"
	>
		<RoutineForm
			draft={current.draft}
			{newId}
			saveError={current.saveError}
			lockedReason={lockedReasonOf(current)}
			onchange={(draft: Routine): void => {
				editing = { ...current, draft, saveError: undefined };
			}}
			onsave={(): void => void save()}
			oncancel={(): void => {
				editing = null;
			}}
		/>
	</div>
{/snippet}

{#snippet card(routine: Routine, index: number)}
	<RoutineCard
		{routine}
		{isInCustomOrder}
		hasDragHandle={hasDragHandles}
		canMoveUp={index > 0}
		canMoveDown={index < sorted.length - 1}
		{canDelete}
		isRunning={routine.id === runningRoutineId}
		onedit={(): void => startEditing(routine)}
		onduplicate={(): void => void duplicate(routine)}
		ondelete={(): void => {
			routineToDelete = routine;
		}}
		onmoveup={(): void => void reorder(moveRoutineUp(routines, routine.id))}
		onmovedown={(): void => void reorder(moveRoutineDown(routines, routine.id))}
	/>
{/snippet}

<div class="mt-4 grid gap-4">
	{#if editing?.isNew}
		{@render editor(editing)}
	{/if}

	<!-- Handle zones share one state in the library, so the list is one only while no routine is
	     open, and the open routine's blocks have the only zone then. -->
	{#if hasDragHandles}
		<ul
			use:dragHandleZone={{
				items: draggedRoutines ?? sorted,
				flipDurationMs: 0,
				dropTargetStyle: {}
			}}
			onconsider={considerRoutines}
			onfinalize={dropRoutines}
			aria-label="Routines"
			class="grid gap-4"
		>
			{#each draggedRoutines ?? sorted as routine, index (routine.id)}
				<li aria-label={routine.title}>
					{@render card(routine, index)}
				</li>
			{/each}
		</ul>
	{:else}
		<ul aria-label="Routines" class="grid gap-4">
			{#each sorted as routine, index (routine.id)}
				<li aria-label={routine.title}>
					{#if editing !== null && !editing.isNew && editing.original.id === routine.id}
						{@render editor(editing)}
					{:else}
						{@render card(routine, index)}
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

{#if afterDiscard !== null}
	<ConfirmDialog
		title="Discard changes?"
		message="Your changes to this routine aren't saved, and are lost if you go on."
		confirmLabel="Discard"
		onconfirm={confirmDiscard}
		oncancel={(): void => {
			afterDiscard = null;
		}}
	/>
{/if}

{#if routineToDelete !== null}
	<ConfirmDialog
		title="Delete {routineToDelete.title}?"
		message="Its work stays in the stats, labelled as deleted."
		confirmLabel="Delete"
		onconfirm={(): void => void confirmDelete()}
		oncancel={(): void => {
			routineToDelete = null;
		}}
	/>
{/if}
