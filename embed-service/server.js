import { createServer } from 'node:http';

const PORT = process.env.PORT ?? 3200;

let pipeline = null;

async function loadModel() {
	const { pipeline: createPipeline } = await import('@huggingface/transformers');
	pipeline = await createPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
		dtype: 'fp32'
	});
	console.log('Embedding model loaded');
}

async function embed(texts) {
	const output = await pipeline(texts, { pooling: 'mean', normalize: true });
	// output.tolist() returns float[][] — one vector per input text
	return output.tolist();
}

async function collectBody(req) {
	const chunks = [];
	for await (const chunk of req) chunks.push(chunk);
	return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (req, res) => {
	if (req.method === 'GET' && req.url === '/health') {
		res.writeHead(pipeline ? 200 : 503);
		res.end(pipeline ? 'ok' : 'loading');
		return;
	}

	if (req.method === 'POST' && req.url === '/embed') {
		try {
			const body = JSON.parse(await collectBody(req));
			// Accepts { input: string } or { input: string[] }
			const texts = Array.isArray(body.input) ? body.input : [body.input];
			if (!texts.length || texts.some((t) => typeof t !== 'string')) {
				res.writeHead(400);
				res.end(JSON.stringify({ error: 'input must be a string or string[]' }));
				return;
			}
			const vectors = await embed(texts);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ embeddings: vectors }));
		} catch (err) {
			console.error('Embed error:', err);
			res.writeHead(500);
			res.end(JSON.stringify({ error: err.message }));
		}
		return;
	}

	res.writeHead(404);
	res.end('Not found');
});

server.listen(PORT, () => console.log(`embed-service listening on :${PORT}`));

// Load model at startup (may take a few seconds on first run — model downloads ~23MB)
loadModel().catch((err) => {
	console.error('Failed to load model:', err);
	process.exit(1);
});
