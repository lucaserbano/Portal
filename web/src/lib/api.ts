import { goto } from '$app/navigation';
import { resolve } from '$app/paths';

const API = import.meta.env.VITE_API_URL as string;
const KEY = 'pyle.token';

export const auth = {
	get token() {
		return localStorage.getItem(KEY);
	},
	set(token: string) {
		localStorage.setItem(KEY, token);
	},
	clear() {
		localStorage.removeItem(KEY);
	}
};

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
	const headers = new Headers(init.headers);
	if (auth.token) headers.set('Authorization', `Bearer ${auth.token}`);
	if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

	let res: Response;
	try {
		res = await fetch(API + path, { ...init, headers });
	} catch {
		throw new ApiError(0, 'Sem conexão com o servidor.');
	}
	const data = await res.json().catch(() => ({}));
	if (res.status === 401 && path !== '/auth/login') {
		auth.clear();
		goto(resolve('/login'));
	}
	if (!res.ok) throw new ApiError(res.status, data.error ?? `Erro ${res.status}`);
	return data as T;
}
