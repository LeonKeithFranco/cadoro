import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { render } from 'vitest-browser-svelte';
import packageJson from '../../../package.json' with { type: 'json' };
import { DEFAULT_SETTINGS, type Settings } from '../settings';
import { SettingsSession } from '../settings.svelte';
import { InMemoryStorage } from '../storage/in-memory-storage';
import type { PersistenceManager } from '../storage/persistence';
import SettingsScreen from './SettingsScreen.svelte';

/** What a test sets up and checks: the storage and the session on it, and the fakes passed in. */
type Setup = {
	/** The storage the settings are saved in. */
	storage: InMemoryStorage;
	/** The settings session the screen shows. */
	session: SettingsSession;
	/** A spy standing in for the run's chimes, which previews play through. */
	preview: Mock<(chime: string) => Promise<void>>;
	/** The fake storage manager, or `undefined` for a browser without one. */
	manager: FakeManager | undefined;
};

/** A stand-in for `navigator.storage` that a test controls. */
type FakeManager = PersistenceManager & {
	/** Whether storage is persistent now. */
	isPersistent: boolean;
	/** Whether the browser grants a request for persistent storage. */
	willGrant: boolean;
	/** Counts the requests for persistent storage. */
	persistCalls: number;
};

/**
 * Makes a fake storage manager.
 *
 * @param isPersistent - Whether storage is persistent to begin with.
 * @param willGrant - Whether the browser grants a request for persistent storage.
 * @returns The manager, whose fields a test may change.
 */
function fakeManager(isPersistent: boolean, willGrant = true): FakeManager {
	const manager: FakeManager = {
		isPersistent,
		willGrant,
		persistCalls: 0,
		persisted: () => Promise.resolve(manager.isPersistent),
		persist: () => {
			manager.persistCalls++;
			manager.isPersistent = manager.isPersistent || manager.willGrant;
			return Promise.resolve(manager.isPersistent);
		}
	};
	return manager;
}

/**
 * Renders the Settings screen on in-memory storage.
 *
 * @param options - What differs from the defaults: the `saved` settings storage holds, whether
 * the wake lock `isSupported`, and the storage `manager`, which is one that's already persistent
 * unless given, or `null` for a browser without one.
 * @returns The storage, the session and the fakes.
 */
async function renderScreen({
	saved = {},
	isSupported = true,
	manager = fakeManager(true)
}: {
	saved?: Partial<Settings>;
	isSupported?: boolean;
	manager?: FakeManager | null;
} = {}): Promise<Setup> {
	const storage = new InMemoryStorage();
	await storage.saveSettings(saved);
	const session = new SettingsSession(storage, await storage.getSettings());
	const preview = vi.fn<(chime: string) => Promise<void>>(() => Promise.resolve());
	render(SettingsScreen, {
		settingsSession: session,
		chimes: { preview },
		isWakeLockSupported: isSupported,
		storageManager: manager ?? undefined,
		storage,
		saveFile: vi.fn(),
		now: () => new Date(2026, 10, 19)
	});
	return { storage, session, preview, manager: manager ?? undefined };
}

describe('the Settings screen', () => {
	it('is headed Settings and shows the app’s version from package.json', async () => {
		await renderScreen();

		await expect.element(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
		await expect.element(page.getByText(`Version ${packageJson.version}`)).toBeVisible();
	});

	describe('the theme', () => {
		it('shows the saved theme as chosen, and dark by default', async () => {
			await renderScreen();

			await expect.element(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
			await expect.element(page.getByRole('radio', { name: 'Light' })).not.toBeChecked();
			await expect.element(page.getByRole('radio', { name: 'System' })).not.toBeChecked();
		});

		it('offers System, Light and Dark in one group', async () => {
			await renderScreen();

			const group = page.getByRole('group', { name: 'Theme' });
			await expect.element(group.getByRole('radio')).toHaveLength(3);
		});

		it('saves the theme that is chosen', async () => {
			const { storage } = await renderScreen();

			await page.getByRole('radio', { name: 'Light' }).click();

			await expect.element(page.getByRole('radio', { name: 'Light' })).toBeChecked();
			await expect.poll(async () => (await storage.getSettings()).theme).toBe('light');
		});
	});

	describe('the chimes', () => {
		it('shows each alert’s saved chime, and the default for both at first', async () => {
			await renderScreen({ saved: { breakChime: 'bell-ding-3' } });

			await expect
				.element(page.getByRole('combobox', { name: 'Work target chime' }))
				.toHaveValue('bell-ding-1');
			await expect
				.element(page.getByRole('combobox', { name: 'Break chime' }))
				.toHaveValue('bell-ding-3');
		});

		it('lists every chime the app has, by name, in each picker', async () => {
			await renderScreen();

			const options = page.getByRole('combobox', { name: 'Break chime' }).getByRole('option');

			await expect.element(options).toHaveLength(4);
			await expect.element(options.nth(0)).toHaveTextContent('Bell ding 1');
			await expect.element(options.nth(3)).toHaveTextContent('Bell ding 4');
		});

		it('saves a chosen chime for its own alert only', async () => {
			const { storage } = await renderScreen();

			await page.getByRole('combobox', { name: 'Break chime' }).selectOptions('bell-ding-4');

			await expect.poll(async () => (await storage.getSettings()).breakChime).toBe('bell-ding-4');
			expect((await storage.getSettings()).targetChime).toBe('bell-ding-1');
		});

		it('shows the default chime for one the app no longer has', async () => {
			await renderScreen({ saved: { targetChime: 'a-removed-chime' } });

			await expect
				.element(page.getByRole('combobox', { name: 'Work target chime' }))
				.toHaveValue('bell-ding-1');
		});

		it('describes when each alert plays', async () => {
			await renderScreen();

			await expect
				.element(page.getByRole('combobox', { name: 'Work target chime' }))
				.toHaveAccessibleDescription('Plays when a work period reaches its target');
			await expect
				.element(page.getByRole('combobox', { name: 'Break chime' }))
				.toHaveAccessibleDescription('Plays when a break reaches 0:00');
		});
	});

	describe('previewing a chime', () => {
		it('plays the chime chosen for the alert whose Preview is pressed', async () => {
			const { preview } = await renderScreen({
				saved: { targetChime: 'bell-ding-2', breakChime: 'bell-ding-3' }
			});

			await page.getByRole('button', { name: 'Preview break chime' }).click();
			await page.getByRole('button', { name: 'Preview work target chime' }).click();

			expect(preview.mock.calls).toEqual([['bell-ding-3'], ['bell-ding-2']]);
		});

		it('plays a chime just chosen, before it is saved elsewhere', async () => {
			const { preview } = await renderScreen();

			await page.getByRole('combobox', { name: 'Work target chime' }).selectOptions('bell-ding-4');
			await page.getByRole('button', { name: 'Preview work target chime' }).click();

			expect(preview).toHaveBeenCalledExactlyOnceWith('bell-ding-4');
		});

		it('saves no setting', async () => {
			const { storage, preview } = await renderScreen();
			const before = await storage.getSettings();

			await page.getByRole('button', { name: 'Preview break chime' }).click();

			expect(preview).toHaveBeenCalledOnce();
			expect(await storage.getSettings()).toEqual(before);
		});
	});

	describe('the volume', () => {
		it('shows the saved volume on a slider from 0 to 100, with its value written out', async () => {
			await renderScreen({ saved: { volume: 35 } });

			const slider = page.getByRole('slider', { name: 'Volume' });
			await expect.element(slider).toHaveValue('35');
			await expect.element(slider).toHaveAttribute('min', '0');
			await expect.element(slider).toHaveAttribute('max', '100');
			await expect.element(page.getByText('35%')).toBeVisible();
		});

		it('shows the volume while it is dragged, and saves it once it is let go', async () => {
			const { storage } = await renderScreen();
			const slider = page.getByRole('slider', { name: 'Volume' }).element() as HTMLInputElement;

			slider.value = '20';
			slider.dispatchEvent(new Event('input', { bubbles: true }));
			await expect.element(page.getByText('20%')).toBeVisible();
			expect((await storage.getSettings()).volume).toBe(DEFAULT_SETTINGS.volume);
			slider.dispatchEvent(new Event('change', { bubbles: true }));

			await expect.poll(async () => (await storage.getSettings()).volume).toBe(20);
			await expect.element(page.getByText('20%')).toBeVisible();
		});

		it('follows a volume another tab saved', async () => {
			const { storage } = await renderScreen();

			await new SettingsSession(storage, DEFAULT_SETTINGS).save({ volume: 90 });

			await expect.element(page.getByText('90%')).toBeVisible();
			await expect.element(page.getByRole('slider', { name: 'Volume' })).toHaveValue('90');
		});
	});

	describe('keeping the screen awake', () => {
		it('is on by default, and saves a change', async () => {
			const { storage } = await renderScreen();
			const checkbox = page.getByRole('checkbox', { name: 'Keep the screen awake during a run' });
			await expect.element(checkbox).toBeChecked();

			await checkbox.click();

			await expect.element(checkbox).not.toBeChecked();
			await expect.poll(async () => (await storage.getSettings()).keepScreenAwake).toBe(false);
		});

		it('says so, and cannot be changed, where the browser has no wake lock', async () => {
			await renderScreen({ isSupported: false });

			const checkbox = page.getByRole('checkbox', { name: 'Keep the screen awake during a run' });
			await expect.element(checkbox).toBeDisabled();
			await expect.element(checkbox).not.toBeChecked();
			await expect
				.element(page.getByText("This browser can't keep the screen awake", { exact: false }))
				.toBeVisible();
		});

		it('shows no unsupported note where the browser has a wake lock', async () => {
			await renderScreen();

			await expect
				.element(page.getByText("can't keep the screen awake", { exact: false }))
				.not.toBeInTheDocument();
		});
	});

	describe('persistent storage', () => {
		it('says it is on, with no button to ask again', async () => {
			await renderScreen({ manager: fakeManager(true) });

			await expect.element(page.getByText('On', { exact: true })).toBeVisible();
			await expect.element(page.getByRole('button', { name: 'Ask again' })).not.toBeInTheDocument();
		});

		it('says it is off, with a button to ask again', async () => {
			await renderScreen({ manager: fakeManager(false) });

			await expect.element(page.getByText('Off', { exact: true })).toBeVisible();
			await expect.element(page.getByRole('button', { name: 'Ask again' })).toBeVisible();
		});

		it('asks the browser again, and shows it on once the browser grants it', async () => {
			const manager = fakeManager(false, true);
			await renderScreen({ manager });

			await page.getByRole('button', { name: 'Ask again' }).click();

			await expect.element(page.getByText('On', { exact: true })).toBeVisible();
			expect(manager.persistCalls).toBe(1);
			await expect.element(page.getByRole('button', { name: 'Ask again' })).not.toBeInTheDocument();
		});

		it('says the browser declined when it still is not persistent after asking', async () => {
			const manager = fakeManager(false, false);
			await renderScreen({ manager });

			await page.getByRole('button', { name: 'Ask again' }).click();

			await expect.element(page.getByText('The browser declined.', { exact: false })).toBeVisible();
			await expect.element(page.getByText('Off', { exact: true })).toBeVisible();
			await expect.element(page.getByRole('button', { name: 'Ask again' })).toBeVisible();
		});

		it('says it is unknown where the browser has no storage manager', async () => {
			await renderScreen({ manager: null });

			await expect.element(page.getByText('Unknown', { exact: true })).toBeVisible();
			await expect.element(page.getByRole('button', { name: 'Ask again' })).not.toBeInTheDocument();
		});

		it('reminds that clearing the site’s data still erases everything', async () => {
			await renderScreen();

			await expect
				.element(page.getByText("Clearing the site's data", { exact: false }))
				.toBeVisible();
		});
	});

	it('can be used with the keyboard alone', async () => {
		const { storage } = await renderScreen();

		await page.getByRole('radio', { name: 'Dark' }).click();
		await userEvent.keyboard('{ArrowLeft}');

		await expect.poll(async () => (await storage.getSettings()).theme).toBe('light');
	});
});
