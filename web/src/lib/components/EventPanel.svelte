<script lang="ts" module>
	export type CalEvent = {
		id: string;
		href: string;
		etag: string;
		uid: string;
		cal: string;
		title: string;
		start: number;
		end: number;
		all_day: boolean;
		location: string;
		notes: string;
		remind_min: number | null;
		recurring: boolean;
	};
	export type Cal = { href: string; name: string; color: string; pyle: boolean };
</script>

<script lang="ts">
	import { api } from '#lib/api.ts';
	import { fromInput, toInput } from '#lib/model.ts';

	let {
		event,
		day,
		calendars,
		onclose,
		onsaved
	}: {
		event: CalEvent | null; // null = evento novo
		day: Date; // dia sugerido para evento novo
		calendars: Cal[];
		onclose: () => void;
		onsaved: () => void;
	} = $props();

	const REMINDERS: [number | null, string][] = [
		[null, 'sem lembrete'],
		[0, 'na hora'],
		[5, '5 min antes'],
		[15, '15 min antes'],
		[30, '30 min antes'],
		[60, '1 h antes'],
		[120, '2 h antes'],
		[1440, '1 dia antes'],
		[2880, '2 dias antes']
	];

	const pad = (n: number) => String(n).padStart(2, '0');
	const dateInput = (t: number) => {
		const d = new Date(t * 1000);
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	};
	const fromDate = (v: string) => (v ? Math.floor(new Date(v + 'T00:00').getTime() / 1000) : null);

	// valores iniciais
	function initial() {
		if (event) return { ...event };
		const s = new Date(day);
		const n = new Date();
		s.setHours(s.toDateString() === n.toDateString() ? n.getHours() + 1 : 9, 0, 0, 0);
		const start = Math.floor(s.getTime() / 1000);
		return { title: '', start, end: start + 3600, all_day: false, location: '', notes: '', remind_min: 15 as number | null };
	}
	const init = initial();
	let title = $state(init.title);
	let allDay = $state(init.all_day);
	let start = $state(init.start);
	let end = $state(init.end);
	let location = $state(init.location);
	let notes = $state(init.notes);
	let remind = $state<number | null>(init.remind_min);
	let busy = $state(false);
	let error = $state('');
	let confirmDelete = $state(false);

	const cal = $derived(event ? calendars.find((c) => c.href === event.cal) : calendars.find((c) => c.pyle));
	// eventos que repetem ou de outros calendários: só leitura (edite no iPhone)
	const readOnly = $derived(!!event && (event.recurring || !cal?.pyle));

	// no "dia inteiro", o fim que a pessoa vê é o último dia (o iCloud guarda o dia seguinte)
	const lastDay = $derived(allDay ? Math.max(start, end - 86400) : end);

	function setStart(v: number | null) {
		if (v == null) return;
		const dur = end - start;
		start = v;
		end = v + Math.max(dur, allDay ? 86400 : 0);
	}
	function toggleAllDay(v: boolean) {
		allDay = v;
		const d = new Date(start * 1000);
		if (v) {
			d.setHours(0, 0, 0, 0);
			start = Math.floor(d.getTime() / 1000);
			end = start + 86400;
		} else {
			d.setHours(9, 0, 0, 0);
			start = Math.floor(d.getTime() / 1000);
			end = start + 3600;
		}
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!title.trim()) return (error = 'Dê um título ao evento.');
		if (end < start) return (error = 'O fim está antes do início.');
		busy = true;
		error = '';
		const body = { title, start, end, all_day: allDay, location, notes, remind_min: remind };
		try {
			if (event) await api('/events', { method: 'PUT', body: JSON.stringify({ ...body, href: event.href, uid: event.uid }) });
			else await api('/events', { method: 'POST', body: JSON.stringify(body) });
			onsaved();
			onclose();
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busy = false;
		}
	}

	async function remove() {
		if (!event) return;
		if (!confirmDelete) {
			confirmDelete = true;
			setTimeout(() => (confirmDelete = false), 4000);
			return;
		}
		busy = true;
		try {
			await api(`/events?href=${encodeURIComponent(event.href)}`, { method: 'DELETE' });
			onsaved();
			onclose();
		} catch (err) {
			error = (err as Error).message;
			busy = false;
		}
	}

	const fmtWhen = (t: number) =>
		new Date(t * 1000).toLocaleString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="scrim" onclick={onclose} aria-hidden="true"></div>

<aside class="panel" aria-label="Evento">
	<header class="top">
		<span class="meta cal"><i style:background={cal?.color ?? 'var(--accent)'}></i>{cal?.name ?? 'πύλη'}</span>
		<button class="btn close" type="button" onclick={onclose}>fechar</button>
	</header>

	{#if readOnly && event}
		<h2 class="title-lg">{event.title}</h2>
		<p class="label">
			{#if event.all_day}dia inteiro · {new Date(event.start * 1000).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
			{:else}{fmtWhen(event.start)} – {new Date(event.end * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{/if}
		</p>
		{#if event.location}<p class="label">{event.location}</p>{/if}
		{#if event.notes}<p class="notes">{event.notes}</p>{/if}
		<p class="meta note">
			{event.recurring ? 'Este evento se repete' : `Este evento é do calendário “${cal?.name ?? ''}”`}: para mudar, edite no app Calendário do iPhone. O portal só mostra.
		</p>
	{:else}
		<form onsubmit={save}>
			<!-- svelte-ignore a11y_autofocus -->
			<textarea class="title" rows="1" placeholder="título do evento" bind:value={title} autofocus={!event}
				onkeydown={(e) => e.key === 'Enter' && e.preventDefault()}></textarea>

			<dl>
				<dt>dia inteiro</dt>
				<dd><label class="opt"><input type="checkbox" checked={allDay} onchange={(e) => toggleAllDay(e.currentTarget.checked)} /> sim</label></dd>

				<dt>{allDay ? 'de' : 'início'}</dt>
				<dd>
					{#if allDay}
						<input class="field" type="date" value={dateInput(start)} onchange={(e) => setStart(fromDate(e.currentTarget.value))} />
					{:else}
						<input class="field" type="datetime-local" value={toInput(start)} onchange={(e) => setStart(fromInput(e.currentTarget.value))} />
					{/if}
				</dd>

				<dt>{allDay ? 'até' : 'fim'}</dt>
				<dd>
					{#if allDay}
						<input class="field" type="date" value={dateInput(lastDay)} min={dateInput(start)}
							onchange={(e) => { const v = fromDate(e.currentTarget.value); if (v != null) end = v + 86400; }} />
					{:else}
						<input class="field" type="datetime-local" value={toInput(end)}
							onchange={(e) => { const v = fromInput(e.currentTarget.value); if (v != null) end = v; }} />
					{/if}
				</dd>

				<dt>lembrete</dt>
				<dd>
					<select bind:value={remind} aria-label="Lembrete">
						{#each REMINDERS as [v, name] (name)}<option value={v}>{name}</option>{/each}
					</select>
				</dd>

				<dt>local</dt>
				<dd><input class="field" bind:value={location} placeholder="opcional" /></dd>

				<dt>notas</dt>
				<dd><textarea class="field notesfield" rows="3" bind:value={notes} placeholder="opcional"></textarea></dd>
			</dl>

			{#if error}<p class="err">{error}</p>{/if}

			<div class="row">
				<button class="btn save" disabled={busy}>{busy ? 'salvando…' : event ? 'salvar' : 'criar evento'}</button>
				{#if event}
					<button type="button" class="btn danger" onclick={remove} disabled={busy}>{confirmDelete ? 'toque de novo para apagar' : 'apagar'}</button>
				{/if}
			</div>
			<p class="meta">Vai para o calendário “{cal?.name ?? 'πύλη'}” do iCloud e aparece no iPhone em instantes.</p>
		</form>
	{/if}
</aside>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: var(--scrim);
		z-index: 10;
	}
	.panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(520px, 100vw);
		background: var(--white);
		border-left: var(--rule);
		z-index: 11;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0 var(--gutter) calc(var(--gutter) * 3);
		display: grid;
		align-content: start;
		gap: 18px;
	}
	.top {
		position: sticky;
		top: 0;
		z-index: 2;
		background: var(--white);
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 18px 0 12px;
		border-bottom: var(--rule);
	}
	.cal {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.cal i {
		width: 10px;
		height: 10px;
		display: inline-block;
	}
	.btn.close,
	.btn.save {
		background: var(--black);
		border-color: var(--black);
		color: var(--white);
	}
	.btn.close {
		padding: 8px 18px;
	}
	@media (hover: hover) {
		.btn.close:hover,
		.btn.save:hover {
			background: var(--accent);
			border-color: var(--accent);
		}
	}
	.btn.danger:hover {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--white);
	}
	form {
		display: grid;
		gap: 18px;
	}
	.title {
		font-size: var(--t-lg);
		line-height: 1.15;
		border: 0;
		border-bottom: var(--rule);
		resize: none;
		field-sizing: content;
		padding: 0 0 6px;
		outline: none;
		background: none;
		width: 100%;
	}
	.title:focus {
		border-bottom: 2px solid var(--accent);
	}
	dl {
		display: grid;
		grid-template-columns: 96px 1fr;
		gap: 12px;
		margin: 0;
		align-items: center;
	}
	dt {
		font-size: var(--t-sm);
		color: var(--grey);
	}
	dd {
		margin: 0;
		min-width: 0;
	}
	.field {
		padding: 6px 0;
	}
	.notesfield {
		resize: vertical;
	}
	select {
		border: var(--rule);
		border-radius: 0;
		background: var(--white);
		padding: 8px;
		font-size: var(--t-sm);
	}
	.opt {
		display: flex;
		gap: 6px;
		align-items: center;
		font-size: var(--t-sm);
	}
	input[type='checkbox'] {
		accent-color: var(--accent);
	}
	.row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.notes {
		white-space: pre-wrap;
		font-size: var(--t-sm);
	}
	.note {
		border-top: var(--rule-soft);
		padding-top: 12px;
	}
	.err {
		color: var(--accent);
	}
	@media (max-width: 600px) {
		.panel {
			border-left: 0;
		}
		dl {
			grid-template-columns: 1fr;
			gap: 4px;
		}
		dt {
			padding-top: 8px;
		}
	}
</style>
