import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const PORT = process.env.PORT ?? 3100;

async function collectBody(req) {
	const chunks = [];
	for await (const chunk of req) chunks.push(chunk);
	return Buffer.concat(chunks);
}

function compile(inputPath, outputPath) {
	return new Promise((resolve, reject) => {
		execFile('typst', ['compile', inputPath, outputPath], { timeout: 60_000 }, (err, _stdout, stderr) => {
			if (err) reject(new Error(stderr || err.message));
			else resolve();
		});
	});
}

async function downloadImages(images, dir) {
	await Promise.all(
		Object.entries(images).map(async ([filename, url]) => {
			const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
			if (!res.ok) throw new Error(`Failed to fetch image "${filename}": HTTP ${res.status}`);
			const buf = Buffer.from(await res.arrayBuffer());
			await writeFile(join(dir, filename), buf);
		})
	);
}

const server = createServer(async (req, res) => {
	// Health check
	if (req.method === 'GET' && req.url === '/health') {
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.end('ok');
		return;
	}

	if (req.method !== 'POST' || req.url !== '/compile') {
		res.writeHead(404);
		res.end();
		return;
	}

	const id = randomUUID();
	const workDir = join(tmpdir(), `typst-${id}`);
	const inputPath = join(workDir, 'main.typ');
	const outputPath = join(workDir, 'main.pdf');

	try {
		await mkdir(workDir, { recursive: true });

		const bodyBuf = await collectBody(req);
		const contentType = req.headers['content-type'] ?? '';

		let source, images = {};
		if (contentType.includes('application/json')) {
			const data = JSON.parse(bodyBuf.toString('utf8'));
			source = data.source;
			images = data.images ?? {};
		} else {
			source = bodyBuf.toString('utf8');
		}

		if (!source?.trim()) {
			res.writeHead(400, { 'Content-Type': 'text/plain' });
			res.end('Empty source');
			return;
		}

		if (Object.keys(images).length > 0) {
			await downloadImages(images, workDir);
		}

		await writeFile(inputPath, source, 'utf8');
		await compile(inputPath, outputPath);

		const pdf = await readFile(outputPath);

		res.writeHead(200, { 'Content-Type': 'application/pdf' });
		res.end(pdf);
	} catch (err) {
		console.error('[typst-service] compile error:', err.message);
		res.writeHead(500, { 'Content-Type': 'text/plain' });
		res.end(err.message);
	} finally {
		await rm(workDir, { recursive: true, force: true }).catch(() => {});
	}
});

server.listen(PORT, () => {
	console.log(`[typst-service] listening on :${PORT}`);
});
