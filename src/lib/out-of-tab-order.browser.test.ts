import { afterEach, describe, expect, it } from 'vitest';
import { outOfTabOrder } from './out-of-tab-order';

describe('outOfTabOrder', () => {
	/** The element each test makes, removed afterwards. */
	let element: HTMLElement;

	// Makes a fresh element on the page, as a drag handle is.
	const makeElement = (): void => {
		element = document.createElement('div');
		element.tabIndex = 0;
		document.body.append(element);
	};

	// Takes the element off the page again.
	afterEach(() => {
		element.remove();
	});

	it('takes an element out of the Tab order at once', () => {
		makeElement();

		outOfTabOrder(element);

		expect(element.tabIndex).toBe(-1);
	});

	it('puts it back out whenever something else sets its tabindex', async () => {
		makeElement();
		outOfTabOrder(element);

		element.tabIndex = 0;

		await expect.poll(() => element.tabIndex).toBe(-1);
	});

	it('stops watching once destroyed', async () => {
		makeElement();
		const action = outOfTabOrder(element);

		action.destroy();
		element.tabIndex = 0;
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(element.tabIndex).toBe(0);
	});
});
