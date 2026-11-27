<script lang="ts" module>
	export type FieldType = 'short' | 'long' | 'choice' | 'checks' | 'select' | 'date' | 'email' | 'phone' | 'number' | 'scale' | 'section';
	export type Field = {
		id: string;
		type: FieldType;
		label: string;
		help?: string;
		required?: boolean;
		options?: string[];
		min?: number;
		max?: number;
	};
	export const TYPE_NAMES: Record<FieldType, string> = {
		short: 'texto curto',
		long: 'texto longo',
		choice: 'uma opção',
		checks: 'várias opções',
		select: 'lista suspensa',
		date: 'data',
		email: 'e-mail',
		phone: 'telefone',
		number: 'número',
		scale: 'escala',
		section: 'título de seção'
	};
</script>

<script lang="ts">
	let {
		fields,
		values = $bindable({}),
		disabled = false
	}: { fields: Field[]; values?: Record<string, string | string[]>; disabled?: boolean } = $props();

	function toggleCheck(id: string, opt: string, on: boolean) {
		const cur = (values[id] as string[]) ?? [];
		values[id] = on ? [...cur, opt] : cur.filter((x) => x !== opt);
	}
	const range = (f: Field) => Array.from({ length: (f.max ?? 5) - (f.min ?? 1) + 1 }, (_, i) => (f.min ?? 1) + i);
</script>

<div class="fields">
	{#each fields as f, i (f.id)}
		{#if f.type === 'section'}
			<div class="section">
				<h2 class="title-lg">{f.label}</h2>
				{#if f.help}<p class="help">{f.help}</p>{/if}
			</div>
		{:else}
			<div class="q">
				<label class="ql" for="q-{f.id}">
					<span class="n meta">{String(i + 1).padStart(2, '0')}</span>
					<span>{f.label || 'pergunta sem título'}{#if f.required}<b class="req" title="obrigatória"> *</b>{/if}</span>
				</label>
				{#if f.help}<p class="help">{f.help}</p>{/if}

				{#if f.type === 'long'}
					<textarea id="q-{f.id}" class="field area" rows="4" bind:value={values[f.id]} {disabled} required={f.required}></textarea>
				{:else if f.type === 'choice'}
					<div class="opts" role="radiogroup" aria-labelledby="q-{f.id}">
						{#each f.options ?? [] as o (o)}
							<label class="opt"><input type="radio" name="q-{f.id}" value={o} bind:group={values[f.id]} {disabled} required={f.required} /> <span>{o}</span></label>
						{/each}
					</div>
				{:else if f.type === 'checks'}
					<div class="opts">
						{#each f.options ?? [] as o (o)}
							<label class="opt"
								><input
									type="checkbox"
									checked={((values[f.id] as string[]) ?? []).includes(o)}
									onchange={(e) => toggleCheck(f.id, o, e.currentTarget.checked)}
									{disabled}
								/> <span>{o}</span></label
							>
						{/each}
					</div>
				{:else if f.type === 'select'}
					<select id="q-{f.id}" bind:value={values[f.id]} {disabled} required={f.required}>
						<option value="">escolha…</option>
						{#each f.options ?? [] as o (o)}<option value={o}>{o}</option>{/each}
					</select>
				{:else if f.type === 'scale'}
					<div class="scale" role="radiogroup">
						{#each range(f) as n (n)}
							<label class="sc" class:on={String(values[f.id]) === String(n)}>
								<input type="radio" name="q-{f.id}" value={String(n)} bind:group={values[f.id]} {disabled} required={f.required} />{n}
							</label>
						{/each}
					</div>
				{:else}
					<input
						id="q-{f.id}"
						class="field"
						type={f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : f.type === 'number' ? 'text' : 'text'}
						inputmode={f.type === 'number' ? 'decimal' : f.type === 'phone' ? 'tel' : undefined}
						autocomplete={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'off'}
						bind:value={values[f.id]}
						{disabled}
						required={f.required}
					/>
				{/if}
			</div>
		{/if}
	{/each}
</div>

<style>
	.fields {
		display: grid;
		gap: 30px;
	}
	.section {
		border-top: 2px solid var(--black);
		padding-top: 12px;
		display: grid;
		gap: 6px;
	}
	.q {
		display: grid;
		gap: 8px;
	}
	.ql {
		display: grid;
		grid-template-columns: 28px 1fr;
		gap: 6px;
		font-size: var(--t-md);
		font-weight: 500;
		align-items: baseline;
	}
	.req {
		color: var(--accent);
		font-weight: 400;
	}
	.help {
		font-size: var(--t-sm);
		color: var(--grey);
		white-space: pre-wrap;
		padding-left: 34px;
	}
	.section .help {
		padding-left: 0;
	}
	.q > .field,
	.q > select,
	.q > .opts,
	.q > .scale {
		margin-left: 34px;
		width: calc(100% - 34px);
	}
	.area {
		resize: vertical;
	}
	.opts {
		display: grid;
		gap: 2px;
	}
	.opt {
		display: flex;
		gap: 10px;
		align-items: center;
		padding: 7px 0;
		cursor: pointer;
		font-size: var(--t-md);
	}
	.opt input {
		accent-color: var(--accent);
		width: 18px;
		height: 18px;
		flex: none;
	}
	select {
		border: var(--rule);
		border-radius: 0;
		background: var(--white);
		padding: 10px;
	}
	.scale {
		display: flex;
		flex-wrap: wrap;
	}
	.sc {
		min-width: 42px;
		height: 42px;
		display: grid;
		place-items: center;
		border: var(--rule);
		margin-left: -1px;
		cursor: pointer;
		font-family: var(--mono);
	}
	.sc:first-child {
		margin-left: 0;
	}
	.sc input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.sc.on {
		background: var(--black);
		color: var(--white);
	}
	.sc:has(input:focus-visible) {
		outline: 2px solid var(--accent);
	}
</style>
