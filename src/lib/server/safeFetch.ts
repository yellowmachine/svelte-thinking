/**
 * Fetching URLs that users give us (reference pages, imports, Jupyter servers,
 * S3 endpoints) without letting them reach the server's own network: the
 * stack's db, redis, typst and kroki, the host, or cloud metadata endpoints.
 *
 * Every hostname is resolved and each address checked; redirects are followed
 * by hand so each hop is checked too. Private targets are allowed under
 * `vite dev` (the local rustfs lives on localhost) and when
 * ALLOW_PRIVATE_URLS=true, for self-hosted setups whose Jupyter or S3 sit on
 * the same private network.
 *
 * Known limit: the check and the request resolve DNS separately, so a host
 * that changes its answer in between (DNS rebinding) is not caught.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

export class UnsafeUrlError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'UnsafeUrlError';
	}
}

function ipv4ToInt(ip: string): number {
	return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function inCidr4(ip: string, base: string, bits: number): boolean {
	const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
	return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const PRIVATE_V4: [string, number][] = [
	['0.0.0.0', 8], // "this network"
	['10.0.0.0', 8],
	['100.64.0.0', 10], // carrier-grade NAT
	['127.0.0.0', 8], // loopback
	['169.254.0.0', 16], // link-local, cloud metadata (169.254.169.254)
	['172.16.0.0', 12], // includes Docker's default bridge networks
	['192.0.0.0', 24],
	['192.168.0.0', 16],
	['198.18.0.0', 15], // benchmarking
	['224.0.0.0', 4], // multicast
	['240.0.0.0', 4] // reserved, broadcast
];

/** True for addresses that are not on the public internet. */
export function isPrivateAddress(ip: string): boolean {
	const version = isIP(ip);
	if (version === 4) return PRIVATE_V4.some(([base, bits]) => inCidr4(ip, base, bits));
	if (version === 6) {
		const v6 = ip.toLowerCase();
		// IPv4-mapped (::ffff:10.0.0.1) — judge the embedded IPv4 address
		const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
		if (mapped) return isPrivateAddress(mapped[1]);
		return (
			v6 === '::' ||
			v6 === '::1' ||
			/^f[cd]/.test(v6) || // unique local fc00::/7
			/^fe[89ab]/.test(v6) || // link-local fe80::/10
			/^ff/.test(v6) // multicast
		);
	}
	return true; // not an IP at all: refuse
}

function privateAllowed(): boolean {
	return dev || env.ALLOW_PRIVATE_URLS === 'true';
}

/**
 * Throws UnsafeUrlError unless `raw` is an http(s) URL whose host resolves
 * only to public addresses. Returns the parsed URL.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new UnsafeUrlError('Not a valid URL');
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new UnsafeUrlError('Only http and https URLs are allowed');
	}
	if (url.username || url.password) {
		throw new UnsafeUrlError('URLs with credentials are not allowed');
	}
	if (privateAllowed()) return url;

	const host = url.hostname.replace(/^\[|\]$/g, '');
	let addresses: string[];
	if (isIP(host)) {
		addresses = [host];
	} else {
		try {
			addresses = (await lookup(host, { all: true })).map((a) => a.address);
		} catch {
			throw new UnsafeUrlError(`Could not resolve ${host}`);
		}
	}
	if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
		throw new UnsafeUrlError('This address points to a private network and cannot be fetched');
	}
	return url;
}

/**
 * fetch() for user-supplied URLs: checks the URL and every redirect target
 * with assertPublicUrl. At most `maxRedirects` hops.
 */
export async function safeFetch(
	raw: string,
	init: RequestInit = {},
	maxRedirects = 5
): Promise<Response> {
	let current = raw;
	for (let hop = 0; hop <= maxRedirects; hop++) {
		const url = await assertPublicUrl(current);
		const res = await fetch(url, { ...init, redirect: 'manual' });
		const location = res.headers.get('location');
		if (res.status >= 300 && res.status < 400 && location) {
			current = new URL(location, url).toString();
			continue;
		}
		return res;
	}
	throw new UnsafeUrlError('Too many redirects');
}
