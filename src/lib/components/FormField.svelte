<!--
  @component
  A labelled text or number input, with what's wrong with it, or a hint about it, shown below.
  The problem is also tied to the input for screen readers, so they read it with the field.
-->
<script lang="ts">
	import { ERROR_TEXT, INPUT_COLOURS, LABEL_TEXT } from './form-classes';

	/** The props a field takes. */
	type Props = {
		/** The field's label, which names the input. */
		label: string;
		/** What kind of input it is. */
		type: 'text' | 'number';
		/** The value shown. A number that isn't a number, such as an emptied field, shows blank. */
		value: string | number;
		/** What's wrong with the value, shown in rose below the input, or left out when it's fine. */
		problem?: string | undefined;
		/** A line that explains the field, shown below it when nothing is wrong. */
		hint?: string | undefined;
		/** Whether the input can't be changed. */
		disabled?: boolean;
		/** The input element once it's on the page, for a parent that moves the focus to it. */
		input?: HTMLInputElement | undefined;
		/** Called as the user types, with the input, whose `value` and `valueAsNumber` are new. */
		oninput: (input: HTMLInputElement) => void;
	};

	let {
		label,
		type,
		value,
		problem,
		hint,
		disabled = false,
		input = $bindable(),
		oninput
	}: Props = $props();

	const messageId = $props.id();

	let message = $derived(problem ?? hint);
</script>

<div>
	<label class="block">
		<span class={LABEL_TEXT}>{label}</span>
		<input
			bind:this={input}
			{type}
			value={typeof value === 'number' && Number.isNaN(value) ? '' : value}
			{disabled}
			aria-invalid={problem === undefined ? undefined : true}
			aria-describedby={message === undefined ? undefined : messageId}
			oninput={(event: Event & { currentTarget: HTMLInputElement }): void =>
				oninput(event.currentTarget)}
			class={[
				'mt-1 block w-full disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-rose-700 dark:aria-invalid:border-rose-400',
				INPUT_COLOURS
			]}
		/>
	</label>
	<!-- Outside the label, so the message isn't part of the input's name. -->
	{#if message !== undefined}
		<p
			id={messageId}
			class={[
				'mt-1 text-sm',
				problem === undefined ? 'text-zinc-600 dark:text-zinc-400' : ERROR_TEXT
			]}
		>
			{message}
		</p>
	{/if}
</div>
