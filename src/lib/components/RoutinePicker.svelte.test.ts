import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createStarterRoutines } from '../routine';
import { numberedIds } from '../testing/ids';
import RoutinePicker from './RoutinePicker.svelte';

/** The starter routines, Classic then Classic with long break, with predictable ids. */
const routines = createStarterRoutines(new Date(0), numberedIds());

/** The starter routines, by name. */
const [classic, classicWithLongBreak] = routines;

describe('the routine picker', () => {
	it('lists the routines in their order', async () => {
		render(RoutinePicker, { routines, selectedId: classic.id, disabled: false, onselect: vi.fn() });

		const options = page.getByRole('combobox', { name: 'Routine' }).getByRole('option');
		await expect.element(options.first()).toBeInTheDocument();
		const optionNames = options.all().map((option) => option.element().textContent);
		expect(optionNames).toEqual(['Classic', 'Classic with long break']);
	});

	it('shows the chosen routine', async () => {
		render(RoutinePicker, {
			routines,
			selectedId: classicWithLongBreak.id,
			disabled: false,
			onselect: vi.fn()
		});

		await expect
			.element(page.getByRole('combobox', { name: 'Routine' }))
			.toHaveValue(classicWithLongBreak.id);
	});

	it("reports the routine the user chooses by its id, leaving the choice to the picker's owner", async () => {
		const onselect = vi.fn();
		render(RoutinePicker, { routines, selectedId: classic.id, disabled: false, onselect });

		await page.getByRole('combobox', { name: 'Routine' }).selectOptions('Classic with long break');

		expect(onselect).toHaveBeenCalledExactlyOnceWith(classicWithLongBreak.id);
	});

	it('can be locked', async () => {
		render(RoutinePicker, { routines, selectedId: classic.id, disabled: true, onselect: vi.fn() });

		await expect.element(page.getByRole('combobox', { name: 'Routine' })).toBeDisabled();
	});
});
