import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import svelte from 'eslint-plugin-svelte';
import tsdoc from 'eslint-plugin-tsdoc';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

/** The `.gitignore` file, whose ignored files, such as the build, hold no code to check. */
const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

/**
 * The rules `npm run lint` checks, which CI runs on every pull request. Each object applies to
 * the files its `files` pattern matches, and one without a pattern applies to every file. See
 * {@link https://eslint.org/docs/latest/use/configure/ | ESLint's guide}.
 */
export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
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
		// Doc comments in TypeScript files. JavaScript files, such as the configs, keep JSDoc,
		// which gives them types with tags such as `@type` that TSDoc doesn't have. Svelte
		// components come later, once there's a real one to decide how the rules fit.
		files: ['**/*.ts'],
		extends: [jsdoc.configs['flat/recommended-tsdoc-error']],
		plugins: { tsdoc },
		settings: {
			// TSDoc names a type parameter's tag `@typeParam`, where JSDoc uses `@template`.
			jsdoc: { tagNamePreference: { template: 'typeParam' } }
		},
		rules: {
			// Checks doc comments are valid TSDoc, such as a hyphen after a `@param` name.
			'tsdoc/syntax': 'error',
			// Checks each module-level declaration, type and field has a doc comment. Functions
			// inside other functions and `describe` blocks don't need one.
			'jsdoc/require-jsdoc': [
				'error',
				{
					require: { FunctionDeclaration: false },
					contexts: [
						'Program > FunctionDeclaration',
						'Program > VariableDeclaration',
						'Program > TSTypeAliasDeclaration',
						'Program > TSInterfaceDeclaration',
						'Program > ClassDeclaration',
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
	}
);
