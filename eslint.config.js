import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import svelte from 'eslint-plugin-svelte';
import tsdoc from 'eslint-plugin-tsdoc';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import vitest from '@vitest/eslint-plugin';
import playwright from 'eslint-plugin-playwright';

/** The `.gitignore` file, whose ignored files, such as the build, hold no code to check. */
const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

/**
 * Where a module-level declaration sits: the file itself in a `.ts` file, or a `<script>` in a
 * Svelte component, whose parser puts each script's code inside a `SvelteScriptElement`.
 */
const MODULE_LEVEL = ':matches(Program, SvelteScriptElement)';

/** The names of the runes whose variables need no doc comment, as an esquery regex. */
const RUNE_NAME = '/^\\$(state|derived|props)$/';

/**
 * A variable whose value comes from a Svelte rune, such as `let count = $state(0)` or
 * `$derived.by(...)`. A component's state and props are named for what they hold, and its doc
 * comment and `Props` type already describe them, so these need no comment of their own.
 */
// Attribute paths such as `init.callee.name`, because esquery 1.7 fails to match field
// selectors such as `CallExpression.init` inside `:has(> ...)`.
const RUNE_DECLARATION =
	'VariableDeclaration:has(> VariableDeclarator:matches(' +
	`[init.callee.name=${RUNE_NAME}], [init.callee.object.name=${RUNE_NAME}]))`;

/** The import pattern that keeps Dexie inside `src/lib/storage/`. */
const DEXIE_IMPORT = {
	regex: '^dexie(/|$)',
	message: 'Only `src/lib/storage/` uses Dexie: go through `CadoroStorage`.'
};

/** The global that keeps IndexedDB inside `src/lib/storage/`. */
const STORAGE_GLOBALS = [
	{ name: 'indexedDB', message: 'Only `src/lib/storage/` opens IndexedDB.' }
];

/** The global that keeps `localStorage` to the theme mirror. */
const LOCAL_STORAGE_GLOBAL = {
	name: 'localStorage',
	message: 'Only `src/lib/storage/theme-mirror.ts` uses `localStorage`.'
};

/**
 * The same two, reached through an object that holds the globals, such as `window.indexedDB` or
 * `globalThis.localStorage`, which `no-restricted-globals` doesn't see.
 */
const STORAGE_PROPERTIES = ['window', 'globalThis', 'self'].map((object) => ({
	object,
	property: 'indexedDB',
	message: 'Only `src/lib/storage/` opens IndexedDB.'
}));

/** The `localStorage` half of {@link STORAGE_PROPERTIES}, for where IndexedDB is allowed. */
const LOCAL_STORAGE_PROPERTIES = ['window', 'globalThis', 'self'].map((object) => ({
	object,
	property: 'localStorage',
	message: 'Only `src/lib/storage/theme-mirror.ts` uses `localStorage`.'
}));

/**
 * The engine and the pure logic modules, which take the moment as an argument and import no
 * Svelte, SvelteKit or component. The `*.svelte.ts` files that match, which keep state, are left
 * out where the globs are used.
 */
const PURE_MODULES = [
	'src/lib/run.ts',
	'src/lib/run-records.ts',
	'src/lib/run-in-progress.ts',
	'src/lib/block-view.ts',
	'src/lib/routine.ts',
	'src/lib/routine-*.ts',
	'src/lib/stats-*.ts',
	'src/lib/streaks.ts',
	'src/lib/target-stats.ts',
	'src/lib/day-slices.ts',
	'src/lib/work-in-progress.ts',
	'src/lib/work-totals.ts',
	'src/lib/backup-*.ts',
	'src/lib/csv-export.ts',
	'src/lib/chime-schedule.ts'
];

/**
 * The rules `npm run lint` checks, which CI runs on every pull request. Each object applies to
 * the files its `files` pattern matches, and one without a pattern applies to every file. See
 * {@link https://eslint.org/docs/latest/use/configure/ | ESLint's guide}.
 */
export default defineConfig(
	includeIgnoreFile(gitignorePath),
	{
		// A comment such as `eslint-disable` can't switch a rule off, so a rule changes only here.
		linterOptions: { noInlineConfig: true }
	},
	js.configs.recommended,
	ts.configs.recommended,
	{
		// Rules that need type information, such as catching a promise nobody awaits.
		files: ['**/*.ts', '**/*.svelte'],
		extends: [ts.configs.recommendedTypeChecked],
		languageOptions: {
			parserOptions: { projectService: true, extraFileExtensions: ['.svelte'] }
		},
		rules: {
			// Off because it only flags `async` functions with no `await`, which is how the
			// in-memory storage and the tests' fakes implement an interface that returns promises,
			// and it catches nothing there. A forgotten `await` is caught by `no-floating-promises`.
			'@typescript-eslint/require-await': 'off',
			// `@ts-expect-error` is banned like `@ts-ignore`, since either hides a type error.
			'@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': true }]
		}
	},
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// Doc comments in TypeScript files and Svelte components. JavaScript files, such as the
		// configs, keep JSDoc, which gives them types with tags such as `@type` that TSDoc
		// doesn't have.
		files: ['**/*.ts', '**/*.svelte'],
		extends: [jsdoc.configs['flat/recommended-tsdoc-error']],
		plugins: { tsdoc },
		settings: {
			// TSDoc names a type parameter's tag `@typeParam`, where JSDoc uses `@template`.
			jsdoc: { tagNamePreference: { template: 'typeParam' } }
		},
		rules: {
			// Checks doc comments are valid TSDoc, such as a hyphen after a `@param` name.
			'tsdoc/syntax': 'error',
			// Checks each module-level declaration, type and field has a doc comment, apart from
			// rune variables. Functions inside other functions and `describe` blocks don't need one.
			'jsdoc/require-jsdoc': [
				'error',
				{
					require: { FunctionDeclaration: false },
					contexts: [
						`${MODULE_LEVEL} > FunctionDeclaration`,
						`${MODULE_LEVEL} > VariableDeclaration:not(${RUNE_DECLARATION})`,
						`${MODULE_LEVEL} > TSTypeAliasDeclaration`,
						`${MODULE_LEVEL} > TSInterfaceDeclaration`,
						`${MODULE_LEVEL} > ClassDeclaration`,
						// An exported item's comment sits on the `export`. Re-exports, which have no
						// declaration, keep their source's comment.
						'ExportNamedDeclaration[declaration]',
						'ExportDefaultDeclaration',
						'TSInterfaceBody > TSPropertySignature',
						'TSInterfaceBody > TSMethodSignature',
						'TSTypeAliasDeclaration > TSTypeLiteral > TSPropertySignature',
						'TSTypeAliasDeclaration > TSTypeLiteral > TSMethodSignature',
						'TSTypeAliasDeclaration > TSIntersectionType > TSTypeLiteral > TSPropertySignature',
						'ClassBody > PropertyDefinition'
					]
				}
			],
			// Every function and interface method documents each parameter and its result, unless
			// it returns nothing.
			'jsdoc/require-param': [
				'error',
				{
					checkDestructuredRoots: false,
					contexts: [
						'FunctionDeclaration',
						'TSInterfaceBody > TSMethodSignature',
						'TSTypeAliasDeclaration > TSTypeLiteral > TSMethodSignature'
					]
				}
			],
			'jsdoc/require-returns': [
				'error',
				{ contexts: ['FunctionDeclaration', 'TSMethodSignature:not(:has(TSVoidKeyword))'] }
			],
			// Each type parameter, as `@typeParam`, and each `throw`, as `@throws`. A promise's
			// rejections can't be found from the code, so they're documented by hand.
			'jsdoc/require-template': 'error',
			'jsdoc/require-throws': 'error',
			// A destructured parameter is named in prose.
			'jsdoc/check-param-names': ['error', { checkDestructured: false }],
			// A blank line between the summary and the tags, as TSDoc's examples have, and none
			// needed between tags.
			'jsdoc/tag-lines': ['error', 'any', { startLines: 1 }]
		}
	},
	{
		// Every function states its return type, so a change to what it returns shows in the
		// signature. `tsc` accepts a missing return type and infers it.
		files: ['**/*.ts', '**/*.svelte'],
		rules: {
			// A callback whose type comes from where it's passed stays untyped, like its parameters.
			'@typescript-eslint/explicit-function-return-type': 'error'
		}
	},
	{
		// A test that is skipped, focused or asserts nothing passes without checking anything.
		files: ['src/**/*.test.ts', 'dev-server.test.ts'],
		plugins: { vitest },
		rules: {
			'vitest/no-disabled-tests': 'error',
			'vitest/no-focused-tests': 'error',
			'vitest/expect-expect': 'error',
			'vitest/valid-expect': 'error',
			'vitest/no-identical-title': 'error'
		}
	},
	{
		// The same for the Playwright journeys.
		files: ['e2e/**/*.ts'],
		plugins: { playwright },
		rules: {
			'playwright/no-skipped-test': 'error',
			'playwright/no-focused-test': 'error',
			'playwright/expect-expect': [
				'error',
				// The journeys' own helpers whose job is to assert.
				{ assertFunctionNames: ['expectScreenShowing'] }
			],
			'playwright/missing-playwright-await': 'error',
			'playwright/valid-expect': 'error'
		}
	},
	{
		// ARCHITECTURE's invariant "Data goes only through `CadoroStorage`. Nothing else opens
		// IndexedDB": only `src/lib/storage/` imports Dexie or touches `indexedDB`, and
		// `localStorage` is kept to `theme-mirror.ts`, below. Tests are exempt, since they fake
		// and inspect these.
		files: ['src/**/*.ts', 'src/**/*.svelte'],
		ignores: ['src/lib/storage/**', '**/*.test.ts'],
		rules: {
			'no-restricted-imports': ['error', { patterns: [DEXIE_IMPORT] }],
			'no-restricted-globals': ['error', ...STORAGE_GLOBALS, LOCAL_STORAGE_GLOBAL],
			'no-restricted-properties': ['error', ...STORAGE_PROPERTIES, ...LOCAL_STORAGE_PROPERTIES]
		}
	},
	{
		// The same invariant inside `src/lib/storage/`, where Dexie and IndexedDB are allowed, but
		// `localStorage` is only for the theme mirror, which `app.html`'s first paint reads.
		files: ['src/lib/storage/**/*.ts'],
		ignores: ['src/lib/storage/theme-mirror.ts', '**/*.test.ts'],
		rules: {
			'no-restricted-globals': ['error', LOCAL_STORAGE_GLOBAL],
			'no-restricted-properties': ['error', ...LOCAL_STORAGE_PROPERTIES]
		}
	},
	{
		// ARCHITECTURE's cross-cutting concern "A failed save ... is logged with `console.error`":
		// failures go through `recordError`, so only `error-log.ts` writes to the console. Tests
		// spy on the console, so they're exempt.
		files: ['src/**/*.ts', 'src/**/*.svelte'],
		ignores: ['src/lib/error-log.ts', '**/*.test.ts'],
		rules: { 'no-console': 'error' }
	},
	{
		// ARCHITECTURE's invariant "Nothing in the engine or the view functions reads the clock, the
		// page or Svelte": the engine and the pure logic modules take `now` as an argument, and
		// import no Svelte, SvelteKit or component. They keep the storage invariant above too,
		// since this block's rules replace that block's for these files.
		files: PURE_MODULES,
		ignores: ['**/*.test.ts', '**/*.svelte.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						DEXIE_IMPORT,
						{ regex: '^svelte(/|$)', message: 'Pure logic imports nothing from Svelte.' },
						{ regex: '^\\$app/', message: 'Pure logic imports nothing from SvelteKit.' },
						{ regex: '\\.svelte(\\.ts)?$', message: 'Pure logic imports no component.' }
					]
				}
			],
			'no-restricted-globals': ['error', ...STORAGE_GLOBALS, LOCAL_STORAGE_GLOBAL],
			'no-restricted-properties': ['error', ...STORAGE_PROPERTIES, ...LOCAL_STORAGE_PROPERTIES],
			'no-restricted-syntax': [
				'error',
				{
					selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
					message: 'Pure logic takes the current moment as an argument, not from `Date.now()`.'
				},
				{
					selector: "NewExpression[callee.name='Date'][arguments.length=0]",
					message: 'Pure logic takes the current moment as an argument, not from `new Date()`.'
				},
				{
					selector: "CallExpression[callee.object.name='performance'][callee.property.name='now']",
					message:
						'Pure logic takes the current moment as an argument, not from `performance.now()`.'
				}
			]
		}
	},
	{
		// A component's own doc comment is an HTML comment starting `@component`, which editors
		// show when hovering over the component where it's used.
		files: ['**/*.svelte'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: 'Program:not(:has(> SvelteHTMLComment[value=/^\\s*@component\\s/]))',
					message: 'Start the component with a `<!-- @component -->` comment saying what it is.'
				}
			]
		}
	}
);
