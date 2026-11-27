<script lang="ts" module>
	// Intervalos já vistos ficam na memória: trocar de mês mostra na hora e atualiza por trás
	const cache = new Map<string, any>();
</script>

<script lang="ts">
	import { api } from '#lib/api.ts';
	import { PRIORITY_LABEL, cardVars, labelVars, isLate, type Priority } from '#lib/model.ts';
	import TaskPanel from '#lib/components/TaskPanel.svelte';
	import EventPanel, { type Cal, type CalEvent } from '#lib/components/EventPanel.svelte';

	type AgTask = {
		id: string;
		title: string;
		start_at: number | null;
		due_at: number | null;
		priority: Priority;
		color: string | null;
		done_at: number | null;
		boards: string[];
		labels: string[];
		people: string[];
	};
	type Named = { id: string; name: string };
	type Data = {
		tasks: AgTask[];
		events: CalEvent[];
		calendars: Cal[];
		boards: Named[];
		labels: (Named & { color: string })[];
		people: Named[];
		error: string | null;
	};

	const DAY = 86400;
	const WEEKDAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
	const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

	// ---------- Datas (fuso do aparelho) ----------
	const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
	const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
	const weekStart = (d: Date) => addDays(dayStart(d), -((d.getDay() + 6) % 7)); // segunda-feira
	const sec = (d: Date) => Math.floor(d.getTime() / 1000);
	const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
	const pad = (n: number) => String(n).padStart(2, '0');
	const hm = (t: number) => {
		const d = new Date(t * 1000);
		return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
	};
	const hShort = (t: number) => {
		const d = new Date(t * 1000);
		return d.getMinutes() ? `${d.getHours()}h${pad(d.getMinutes())}` : `${d.getHours()}h`;
	};

	// ---------- Estado ----------
	let view = $state<'mes' | 'semana'>((localStorage.getItem('pyle.agenda.view') as 'mes' | 'semana') ?? 'mes');
	let cursor = $state(dayStart(new Date())); // dia de referência
	let selected = $state(dayStart(new Date()));
	let data = $state<Data | null>(null);
	let loading = $state(false);
	let loadError = $state('');
	let openTask = $state<string | null>(null);
	let eventPanel = $state<{ event: CalEvent | null; day: Date } | null>(null);
	let showFilters = $state(false);

	// Filtros (lembrados neste aparelho). Vazio = tudo. Dentro do grupo: "ou"; entre grupos: "e".
	type Filters = { boards: string[]; labels: string[]; prios: string[]; people: string[]; hiddenCals: string[]; done: boolean; tasks: boolean; events: boolean };
	const F0: Filters = { boards: [], labels: [], prios: [], people: [], hiddenCals: [], done: true, tasks: true, events: true };
	let filters = $state<Filters>({ ...F0, ...JSON.parse(localStorage.getItem('pyle.agenda.filters') ?? '{}') });
	$effect(() => {
		localStorage.setItem('pyle.agenda.filters', JSON.stringify(filters));
	});
	$effect(() => {
		localStorage.setItem('pyle.agenda.view', view);
	});
	const activeFilters = $derived(
		filters.boards.length + filters.labels.length + filters.prios.length + filters.people.length + filters.hiddenCals.length + (filters.done ? 0 : 1) + (filters.tasks ? 0 : 1) + (filters.events ? 0 : 1)
	);
	function toggleIn(key: 'boards' | 'labels' | 'prios' | 'people' | 'hiddenCals', v: string) {
		filters[key] = filters[key].includes(v) ? filters[key].filter((x) => x !== v) : [...filters[key], v];
	}

	// ---------- Intervalo visível ----------
	const range = $derived.by(() => {
		if (view === 'semana') {
			const s = weekStart(cursor);
			return { from: s, to: addDays(s, 7) };
		}
		const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
		const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
		return { from: weekStart(first), to: addDays(weekStart(last), 7) };
	});
	const weeks = $derived.by(() => {
		const out: Date[][] = [];
		for (let w = range.from; w < range.to; w = addDays(w, 7)) out.push([0, 1, 2, 3, 4, 5, 6].map((i) => addDays(w, i)));
		return out;
	});

	async function load() {
		const key = `${sec(range.from)}-${sec(range.to)}`;
		const hit = cache.get(key);
		if (hit) data = hit;
		loading = true;
		try {
			const d = await api<Data>(`/agenda?from=${sec(range.from)}&to=${sec(range.to)}`);
			cache.set(key, d);
			if (key === `${sec(range.from)}-${sec(range.to)}`) data = d;
			loadError = '';
		} catch (e) {
			loadError = (e as Error).message;
		} finally {
			loading = false;
		}
	}
	$effect(() => {
		range;
		load();
	});
	function reload() {
		cache.clear();
		load();
	}

	// ---------- Filtragem ----------
	const tasks = $derived.by(() => {
		if (!data || !filters.tasks) return [];
		return data.tasks.filter(
			(t) =>
				(filters.done || !t.done_at) &&
				(!filters.boards.length || t.boards.some((b) => filters.boards.includes(b))) &&
				(!filters.labels.length || t.labels.some((l) => filters.labels.includes(l))) &&
				(!filters.prios.length || filters.prios.includes(t.priority ?? 'sem')) &&
				(!filters.people.length || t.people.some((p) => filters.people.includes(p)))
		);
	});
	// os filtros de quadro/label/prioridade/pessoa são das tarefas; eventos só somem pelo calendário
	const events = $derived(data && filters.events ? data.events.filter((e) => !filters.hiddenCals.includes(e.cal)) : []);
	const calOf = (href: string) => data?.calendars.find((c) => c.href === href);

	// ---------- Barras (tarefas e eventos de vários dias) ----------
	type Span = { kind: 'task'; t: AgTask; s: number; e: number } | { kind: 'event'; ev: CalEvent; s: number; e: number };
	const taskSpan = (t: AgTask) => {
		let a = (t.start_at ?? t.due_at)!;
		let b = (t.due_at ?? t.start_at)!;
		if (a > b) [a, b] = [b, a];
		return [dayStart(new Date(a * 1000)), dayStart(new Date(b * 1000))] as const;
	};
	// fim do evento é exclusivo: um evento até 00:00 termina no dia anterior
	const eventSpan = (ev: CalEvent) => [dayStart(new Date(ev.start * 1000)), dayStart(new Date((Math.max(ev.end, ev.start + 1) - 1) * 1000))] as const;
	const multiDay = (ev: CalEvent) => {
		const [a, b] = eventSpan(ev);
		return !sameDay(a, b);
	};

	function lanes(week: Date[]) {
		const ws = week[0];
		const we = week[6];
		const idx = (d: Date) => Math.round((d.getTime() - ws.getTime()) / 864e5);
		const spans: Span[] = [];
		for (const t of tasks) {
			const [a, b] = taskSpan(t);
			if (b < ws || a > we) continue;
			spans.push({ kind: 'task', t, s: Math.max(0, idx(a)), e: Math.min(6, idx(b)) });
		}
		for (const ev of events) {
			if (!multiDay(ev)) continue;
			const [a, b] = eventSpan(ev);
			if (b < ws || a > we) continue;
			spans.push({ kind: 'event', ev, s: Math.max(0, idx(a)), e: Math.min(6, idx(b)) });
		}
		spans.sort((x, y) => x.s - y.s || y.e - y.s - (x.e - x.s));
		const ends: number[] = [];
		const placed = spans.map((sp) => {
			let lane = ends.findIndex((end) => end < sp.s);
			if (lane === -1) lane = ends.push(sp.e) - 1;
			else ends[lane] = sp.e;
			return { ...sp, lane };
		});
		return { placed, count: ends.length };
	}

	// eventos de um dia só (lista dentro do dia), em ordem de horário
	function dayEvents(d: Date) {
		return events.filter((ev) => !multiDay(ev) && sameDay(new Date(ev.start * 1000), d)).sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.start - b.start);
	}
	// tudo o que toca um dia (lista do dia selecionado)
	function dayItems(d: Date) {
		const s = sec(d);
		const e = s + DAY;
		return {
			tasks: tasks
				.filter((t) => {
					const [a, b] = taskSpan(t);
					return a <= d && b >= d;
				})
				.sort((a, b) => (a.due_at ?? 0) - (b.due_at ?? 0)),
			events: events.filter((ev) => ev.start < e && ev.end > s).sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.start - b.start)
		};
	}

	// ---------- Navegação ----------
	function move(n: number) {
		cursor = view === 'semana' ? addDays(cursor, 7 * n) : new Date(cursor.getFullYear(), cursor.getMonth() + n, 1);
		if (view === 'semana') selected = addDays(selected, 7 * n);
	}
	function today() {
		cursor = dayStart(new Date());
		selected = cursor;
	}
	function pick(d: Date) {
		selected = d;
		cursor = view === 'semana' ? d : cursor;
	}
	const heading = $derived.by(() => {
		if (view === 'mes') return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
		const a = weekStart(cursor);
		const b = addDays(a, 6);
		return a.getMonth() === b.getMonth()
			? `${a.getDate()}–${b.getDate()} ${MONTHS[a.getMonth()]}`
			: `${a.getDate()} ${MONTHS[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MONTHS[b.getMonth()].slice(0, 3)}`;
	});
	const todayD = dayStart(new Date());
	const dayTitle = (d: Date) => d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
	const boardName = (id: string) => data?.boards.find((b) => b.id === id)?.name ?? '';
</script>

<section class="grid head">
	<h1 class="title-lg when">{heading}</h1>
	<div class="ctrl meta">
		<span class="nav">
			<button class="arrow" onclick={() => move(-1)} aria-label="Anterior">←</button>
			<button class="link" onclick={today}>hoje</button>
			<button class="arrow" onclick={() => move(1)} aria-label="Próximo">→</button>
		</span>
		<span class="seg">
			<button class:on={view === 'mes'} onclick={() => (view = 'mes')}>mês</button>
			<button class:on={view === 'semana'} onclick={() => ((view = 'semana'), (cursor = selected))}>semana</button>
		</span>
		<button class="link" onclick={() => (showFilters = !showFilters)} aria-expanded={showFilters}>filtros{activeFilters ? ` (${activeFilters})` : ''}</button>
		<button class="btn add" onclick={() => (eventPanel = { event: null, day: selected })}>+ evento</button>
	</div>
</section>

{#if data?.error}<p class="warn">iCloud: {data.error} As tarefas continuam aparecendo.</p>{/if}
{#if loadError}<p class="warn">{loadError}</p>{/if}

{#if showFilters && data}
	<section class="filters">
		<div class="fgroup">
			<span class="label">mostrar</span>
			<button class="chip" class:on={filters.tasks} onclick={() => (filters.tasks = !filters.tasks)}>tarefas</button>
			<button class="chip" class:on={filters.events} onclick={() => (filters.events = !filters.events)}>eventos</button>
			<button class="chip" class:on={filters.done} onclick={() => (filters.done = !filters.done)}>concluídas</button>
		</div>
		{#if data.calendars.length}
			<div class="fgroup">
				<span class="label">calendários</span>
				{#each data.calendars as c (c.href)}
					<button class="chip" class:on={!filters.hiddenCals.includes(c.href)} style="--c: {c.color}; --ink: #fff" onclick={() => toggleIn('hiddenCals', c.href)}>{c.name}</button>
				{/each}
			</div>
		{/if}
		<div class="fgroup">
			<span class="label">quadros</span>
			{#each data.boards as b (b.id)}
				<button class="chip" class:on={filters.boards.includes(b.id)} onclick={() => toggleIn('boards', b.id)}>{b.name}</button>
			{/each}
		</div>
		{#if data.labels.length}
			<div class="fgroup">
				<span class="label">labels</span>
				{#each data.labels as l (l.id)}
					<button class="chip" class:on={filters.labels.includes(l.id)} style={labelVars(l.color)} onclick={() => toggleIn('labels', l.id)}>{l.name}</button>
				{/each}
			</div>
		{/if}
		<div class="fgroup">
			<span class="label">prioridade</span>
			{#each ['critico', 'preocupante', 'bom'] as const as p (p)}
				<button class="chip" class:on={filters.prios.includes(p)} onclick={() => toggleIn('prios', p)}>{PRIORITY_LABEL[p]}</button>
			{/each}
			<button class="chip" class:on={filters.prios.includes('sem')} onclick={() => toggleIn('prios', 'sem')}>sem prioridade</button>
		</div>
		{#if data.people.length}
			<div class="fgroup">
				<span class="label">pessoa marcada</span>
				{#each data.people as p (p.id)}
					<button class="chip" class:on={filters.people.includes(p.id)} onclick={() => toggleIn('people', p.id)}>@{p.name}</button>
				{/each}
			</div>
		{/if}
		{#if activeFilters}<button class="link" onclick={() => (filters = { ...F0 })}>limpar filtros</button>{/if}
	</section>
{/if}

{#snippet bar(sp: Span & { lane: number }, week: Date[])}
	{#if sp.kind === 'task'}
		{@const t = sp.t}
		{@const [a, b] = taskSpan(t)}
		<button
			class="bar task p-{t.priority ?? 'none'}"
			class:done={!!t.done_at}
			class:late={isLate(t)}
			class:cutl={a < week[0]}
			class:cutr={b > week[6]}
			style="grid-column: {sp.s + 1} / {sp.e + 2}; grid-row: {sp.lane + 2}; {cardVars(t.color) ?? ''}"
			onclick={() => (openTask = t.id)}
			title="{t.title}{t.due_at ? ', prazo ' + new Date(t.due_at * 1000).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}"
		>{t.title}</button>
	{:else}
		{@const ev = sp.ev}
		<button
			class="bar ev"
			style="grid-column: {sp.s + 1} / {sp.e + 2}; grid-row: {sp.lane + 2}; --c: {calOf(ev.cal)?.color ?? 'var(--grey)'}"
			onclick={() => (eventPanel = { event: ev, day: selected })}
			title={ev.title}>{ev.title}</button
		>
	{/if}
{/snippet}

{#snippet dayList(d: Date, items: ReturnType<typeof dayItems>)}
	<ul class="items">
		{#each items.events as ev (ev.id)}
			<li>
				<button class="item" onclick={() => (eventPanel = { event: ev, day: d })}>
					<i class="sq" style:background={calOf(ev.cal)?.color ?? 'var(--grey)'}></i>
					<span class="meta time">{ev.all_day ? 'dia todo' : hm(ev.start)}</span>
					<span class="it">{ev.title}{#if ev.location}<span class="meta"> {ev.location}</span>{/if}</span>
				</button>
			</li>
		{/each}
		{#each items.tasks as t (t.id)}
			<li>
				<button class="item" onclick={() => (openTask = t.id)}>
					<i class="sq task" class:done={!!t.done_at}></i>
					<span class="meta time" class:late={isLate(t)}>
						{t.due_at && sameDay(new Date(t.due_at * 1000), d) ? 'prazo ' + hm(t.due_at) : t.start_at && sameDay(new Date(t.start_at * 1000), d) ? 'início ' + hm(t.start_at) : 'em andamento'}
					</span>
					<span class="it" class:done={!!t.done_at}>{t.title}{#if t.boards.length}<span class="meta"> {t.boards.map(boardName).join(', ')}</span>{/if}</span>
				</button>
			</li>
		{/each}
		{#if !items.events.length && !items.tasks.length}<li class="meta empty">nada marcado</li>{/if}
	</ul>
{/snippet}

<div class="cal" class:busy={loading && !data}>
	<div class="wdays">
		{#each WEEKDAYS as w (w)}<span class="meta">{w}</span>{/each}
	</div>

	{#each weeks as week (week[0].getTime())}
		{@const L = lanes(week)}
		<div class="week" class:wk={view === 'semana'} style="grid-template-rows: var(--h0) {'var(--lh) '.repeat(L.count)}1fr">
			{#each week as d, i (d.getTime())}
				<button
					class="day"
					class:out={view === 'mes' && d.getMonth() !== cursor.getMonth()}
					class:today={sameDay(d, todayD)}
					class:sel={sameDay(d, selected)}
					style="grid-column: {i + 1}"
					onclick={() => pick(d)}
					ondblclick={() => (eventPanel = { event: null, day: d })}
					aria-label={dayTitle(d)}
				><span class="num">{d.getDate()}</span></button>
			{/each}
			{#each L.placed as sp (sp.kind === 'task' ? 't' + sp.t.id : 'e' + sp.ev.id)}
				{@render bar(sp, week)}
			{/each}
			{#if view === 'mes'}
				{#each week as d, i (d.getTime())}
					{@const evs = dayEvents(d)}
					{#if evs.length}
						<div class="evs" style="grid-column: {i + 1}">
							{#each evs.slice(0, 3) as ev (ev.id)}
								<button class="ev1" style:--c={calOf(ev.cal)?.color ?? 'var(--grey)'} onclick={() => (eventPanel = { event: ev, day: d })} title={ev.title}>
									{#if !ev.all_day}<span class="t">{hShort(ev.start)}</span>{/if}{ev.title}
								</button>
							{/each}
							{#if evs.length > 3}<button class="more meta" onclick={() => pick(d)}>+{evs.length - 3}</button>{/if}
						</div>
					{/if}
				{/each}
			{/if}
		</div>
	{/each}
</div>

{#if view === 'semana'}
	<section class="weeklist">
		{#each weeks[0] as d (d.getTime())}
			<div class="wday" class:today={sameDay(d, todayD)}>
				<h2 class="label dname">
					<button class="link plain" onclick={() => pick(d)}>{dayTitle(d)}</button>
					<button class="link add1" onclick={() => (eventPanel = { event: null, day: d })} aria-label="Novo evento em {dayTitle(d)}">+</button>
				</h2>
				{@render dayList(d, dayItems(d))}
			</div>
		{/each}
	</section>
{:else}
	<section class="daydetail">
		<h2 class="label dname">
			<span>{dayTitle(selected)}</span>
			<button class="link" onclick={() => (eventPanel = { event: null, day: selected })}>+ evento neste dia</button>
		</h2>
		{@render dayList(selected, dayItems(selected))}
	</section>
{/if}

<p class="meta foot">
	As tarefas com data vão sozinhas para o calendário “πύλη” do iPhone, com aviso 1 h antes do prazo. Toque duas vezes num dia para criar um evento.
</p>

{#if openTask}
	<TaskPanel id={openTask} onclose={() => (openTask = null)} onchange={reload} />
{/if}
{#if eventPanel && data}
	<EventPanel event={eventPanel.event} day={eventPanel.day} calendars={data.calendars} onclose={() => (eventPanel = null)} onsaved={reload} />
{/if}

<style>
	.head {
		align-items: end;
		padding-bottom: 12px;
		border-bottom: var(--rule);
		margin-bottom: 14px;
	}
	.when {
		grid-column: 1 / span 6;
		font-size: var(--t-xl);
		line-height: 0.95;
		letter-spacing: -0.03em;
	}
	.ctrl {
		grid-column: 7 / -1;
		display: flex;
		flex-wrap: wrap;
		gap: 10px 18px;
		align-items: center;
		justify-content: flex-end;
		font-size: var(--t-sm);
	}
	.nav {
		display: flex;
		gap: 10px;
		align-items: center;
	}
	.arrow {
		background: none;
		border: var(--rule);
		width: 34px;
		height: 30px;
		cursor: pointer;
		font-size: 15px;
	}
	.link {
		background: none;
		border: 0;
		padding: 0;
		font-size: var(--t-sm);
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
		color: var(--black);
		font-family: var(--sans);
	}
	.link.plain {
		text-decoration: none;
	}
	.seg {
		display: flex;
	}
	.seg button {
		border: var(--rule);
		margin-left: -1px;
		background: var(--white);
		padding: 5px 10px;
		font-size: var(--t-sm);
		cursor: pointer;
		font-family: var(--sans);
	}
	.seg button.on {
		background: var(--black);
		color: var(--white);
	}
	.btn.add {
		background: var(--black);
		border-color: var(--black);
		color: var(--white);
		padding: 7px 14px;
		font-family: var(--sans);
	}
	.warn {
		color: var(--accent);
		font-size: var(--t-sm);
		margin-bottom: 10px;
	}

	/* ---------- Filtros ---------- */
	.filters {
		border: var(--rule);
		padding: 12px;
		display: grid;
		gap: 10px;
		margin-bottom: 14px;
	}
	.fgroup {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.fgroup .label {
		width: 120px;
		color: var(--grey);
	}
	.chip {
		font: 400 var(--t-xs) / 1 var(--mono);
		padding: 6px 8px;
		border: 1px solid var(--c, var(--black));
		color: var(--c, var(--black));
		background: var(--white);
		cursor: pointer;
	}
	.chip.on {
		background: var(--c, var(--black));
		color: var(--ink, var(--white));
	}

	/* ---------- Calendário ---------- */
	.cal {
		border-top: var(--rule);
		border-left: var(--rule);
		transition: opacity 0.2s;
	}
	.cal.busy {
		opacity: 0.4;
	}
	.wdays {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		border-bottom: var(--rule);
	}
	.wdays span {
		padding: 6px 8px;
		border-right: var(--rule);
	}
	.week {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		--h0: 28px;
		--lh: 22px;
		min-height: 116px;
		border-bottom: var(--rule);
		position: relative;
		row-gap: 2px;
	}
	.week.wk {
		min-height: 0;
		padding-bottom: 6px;
	}
	.day {
		grid-row: 1 / -1;
		border: 0;
		border-right: var(--rule);
		background: var(--white);
		padding: 0;
		cursor: pointer;
		text-align: left;
		align-self: stretch;
		display: flex;
		align-items: flex-start;
		font-family: var(--sans);
		color: var(--black);
	}
	.day .num {
		display: inline-block;
		padding: 5px 8px;
		font-size: var(--t-sm);
	}
	.day.out .num {
		color: var(--inactive);
	}
	.day.today .num {
		color: var(--accent);
		font-weight: 700;
	}
	.day.sel {
		background: var(--select-bg);
	}
	.bar {
		position: relative;
		z-index: 1;
		margin: 0 4px;
		min-width: 0;
		height: 22px;
		padding: 0 6px;
		border: var(--rule);
		background: var(--card-l, var(--white));
		font: 400 var(--t-xs) / 20px var(--sans);
		text-align: left;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		cursor: pointer;
		color: var(--black);
	}
	:global([data-theme='dark']) .bar.task {
		background: var(--card-d, var(--white));
	}
	.bar.cutl {
		margin-left: 0;
		border-left-style: dashed;
	}
	.bar.cutr {
		margin-right: 0;
		border-right-style: dashed;
	}
	.bar.p-preocupante {
		border-color: var(--accent);
	}
	.bar.p-critico {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.bar.late {
		box-shadow: inset 3px 0 0 var(--accent);
	}
	.bar.done {
		border-color: var(--inactive);
		color: var(--grey);
		text-decoration: line-through;
		background: var(--white);
	}
	.bar.ev {
		border: 0;
		background: color-mix(in srgb, var(--c) 22%, var(--white));
		box-shadow: inset 3px 0 0 var(--c);
	}
	.evs {
		grid-row: -2 / -1;
		position: relative;
		z-index: 1;
		display: grid;
		align-content: start;
		gap: 1px;
		padding: 2px 4px 6px;
		min-width: 0;
	}
	.ev1 {
		border: 0;
		background: none;
		padding: 1px 0 1px 6px;
		box-shadow: inset 2px 0 0 var(--c);
		font: 400 var(--t-xs) / 1.3 var(--sans);
		text-align: left;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		cursor: pointer;
		color: var(--black);
	}
	.ev1 .t {
		color: var(--grey);
		margin-right: 4px;
		font-family: var(--mono);
	}
	.more {
		border: 0;
		background: none;
		text-align: left;
		padding: 0 0 0 6px;
		cursor: pointer;
	}

	/* ---------- Lista do dia ---------- */
	.daydetail,
	.weeklist {
		margin-top: 22px;
	}
	.weeklist {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 0;
		border-left: var(--rule);
	}
	.wday {
		border-right: var(--rule);
		padding: 0 10px 12px;
		min-width: 0;
	}
	.wday.today .dname {
		color: var(--accent);
	}
	.dname {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
		border-bottom: 2px solid var(--black);
		padding-bottom: 6px;
		margin-bottom: 6px;
		font-weight: 500;
	}
	.dname span::first-letter,
	.dname .plain::first-letter {
		text-transform: uppercase;
	}
	.add1 {
		text-decoration: none;
		font-size: 18px;
		line-height: 1;
	}
	.items {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
	}
	.item {
		width: 100%;
		display: grid;
		grid-template-columns: auto auto 1fr;
		gap: 8px;
		align-items: baseline;
		background: none;
		border: 0;
		border-bottom: var(--rule-soft);
		padding: 8px 0;
		text-align: left;
		cursor: pointer;
		font-family: var(--sans);
		font-size: var(--t-sm);
	}
	.sq {
		width: 9px;
		height: 9px;
		display: inline-block;
	}
	.sq.task {
		border: var(--rule);
	}
	.sq.task.done {
		background: var(--black);
	}
	.time {
		min-width: 64px;
	}
	.time.late {
		color: var(--accent);
	}
	.it {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.it.done {
		text-decoration: line-through;
		color: var(--grey);
	}
	.empty {
		padding: 8px 0;
	}
	.foot {
		margin-top: 28px;
		max-width: 60ch;
	}

	@media (max-width: 900px) {
		.when {
			grid-column: 1 / -1;
		}
		.ctrl {
			grid-column: 1 / -1;
			justify-content: flex-start;
		}
		.weeklist {
			grid-template-columns: 1fr;
			border-left: 0;
		}
		.wday {
			border-right: 0;
			padding: 0 0 14px;
		}
	}
	@media (max-width: 600px) {
		.when {
			font-size: clamp(34px, 11vw, 56px);
		}
		.week {
			--h0: 24px;
			--lh: 17px;
			min-height: 84px;
			row-gap: 1px;
		}
		.day .num {
			padding: 3px 4px;
			font-size: 12px;
		}
		.wdays span {
			padding: 4px;
			font-size: 10px;
		}
		.bar {
			height: 17px;
			margin: 0 1px;
			padding: 0 3px;
			font-size: 10px;
			line-height: 15px;
		}
		.evs {
			padding: 1px 1px 4px;
		}
		.ev1 {
			font-size: 10px;
			padding-left: 3px;
		}
		.ev1 .t {
			display: none;
		}
		.fgroup .label {
			width: 100%;
		}
	}
</style>
