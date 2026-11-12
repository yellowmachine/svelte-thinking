import { describe, it, expect, vi } from 'vitest';

// Behave like production: private targets are not allowed.
vi.mock('$app/environment', () => ({ dev: false }));
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('node:dns/promises', () => ({
	lookup: vi.fn(async (host: string) => {
		const table: Record<string, string[]> = {
			'example.org': ['93.184.215.14'],
			redis: ['172.18.0.5'],
			'mixed.test': ['93.184.215.14', '10.0.0.7']
		};
		if (!table[host]) throw new Error('ENOTFOUND');
		return table[host].map((address) => ({ address, family: 4 }));
	})
}));

const { isPrivateAddress, assertPublicUrl, safeFetch, UnsafeUrlError } =
	await import('./safeFetch');

describe('isPrivateAddress', () => {
	it.each([
		'127.0.0.1',
		'10.1.2.3',
		'172.16.0.1',
		'172.31.255.255',
		'192.168.1.1',
		'169.254.169.254',
		'100.64.0.1',
		'0.0.0.0',
		'::1',
		'::',
		'fd00::1',
		'fe80::1',
		'::ffff:10.0.0.1',
		'not-an-ip'
	])('refuses %s', (ip) => expect(isPrivateAddress(ip)).toBe(true));

	it.each(['93.184.215.14', '8.8.8.8', '172.32.0.1', '2606:4700::1111', '::ffff:8.8.8.8'])(
		'accepts %s',
		(ip) => expect(isPrivateAddress(ip)).toBe(false)
	);
});

describe('assertPublicUrl', () => {
	it('accepts a public host', async () => {
		await expect(assertPublicUrl('https://example.org/page')).resolves.toBeInstanceOf(URL);
	});

	it('refuses stack services, private IPs, other schemes and credentials', async () => {
		for (const url of [
			'http://redis:6379',
			'http://127.0.0.1:3000/admin',
			'http://[::1]/',
			'http://169.254.169.254/latest/meta-data',
			'http://mixed.test/',
			'file:///etc/passwd',
			'https://user:pass@example.org/',
			'http://nowhere.invalid/'
		]) {
			await expect(assertPublicUrl(url), url).rejects.toBeInstanceOf(UnsafeUrlError);
		}
	});
});

describe('safeFetch', () => {
	it('checks every redirect target', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(null, { status: 302, headers: { location: 'http://redis:6379/' } })
			);
		vi.stubGlobal('fetch', fetchMock);
		await expect(safeFetch('https://example.org/go')).rejects.toBeInstanceOf(UnsafeUrlError);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		vi.unstubAllGlobals();
	});

	it('follows public redirects and returns the final response', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: '/final' } }))
			.mockResolvedValueOnce(new Response('ok', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		const res = await safeFetch('https://example.org/start');
		expect(await res.text()).toBe('ok');
		expect(String(fetchMock.mock.calls[1][0])).toBe('https://example.org/final');
		vi.unstubAllGlobals();
	});
});
