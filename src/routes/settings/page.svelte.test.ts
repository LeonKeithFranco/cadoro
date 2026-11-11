import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import packageJson from '../../../package.json' with { type: 'json' };
import SettingsPage from './+page.svelte';

describe('the Settings screen', () => {
	it("shows the app's version from package.json", async () => {
		render(SettingsPage);

		await expect.element(page.getByText(`Version ${packageJson.version}`)).toBeVisible();
	});
});
