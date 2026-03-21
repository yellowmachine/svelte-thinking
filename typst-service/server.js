import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const PORT = process.env.PORT ?? 3100;

async function collectBody(req) {
	const chunks = [];
	for await (const chunk of req) chunks.push(chunk);
	return Buffer.concat(chunks).toString('utf8');
}

function compile(inputPath, outputPath) {
	return new Promise((resolve, reject) => {
		execFile('typst', ['compile', inputPath, outputPath], { timeout: 30_000 }, (err, _stdout, stderr) => {
			if (err) reject(new Error(stderr || err.message));
			else resolve();
		});
	});
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
	const inputPath = join(tmpdir(), `${id}.typ`);
	const outputPath = join(tmpdir(), `${id}.pdf`);

	try {
		const source = await collectBody(req);

		if (!source.trim()) {
			res.writeHead(400, { 'Content-Type': 'text/plain' });
			res.end('Empty source');
			return;
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
		await unlink(inputPath).catch(() => {});
		await unlink(outputPath).catch(() => {});
	}
});

server.listen(PORT, () => {
	console.log(`[typst-service] listening on :${PORT}`);
});
