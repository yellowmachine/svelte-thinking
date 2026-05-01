import { pipeline } from '@huggingface/transformers';
const p = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'fp32' });
await p('warmup', { pooling: 'mean', normalize: true });
console.log('Model cached');
