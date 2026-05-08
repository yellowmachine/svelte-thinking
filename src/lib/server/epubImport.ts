import type { Db } from '$lib/server/db';
import { project } from '$lib/server/db/schemas/projects.schema';
import { document } from '$lib/server/db/schemas/documents.schema';
import { reference, projectReference } from '$lib/server/db/schemas/references.schema';
import { eq, and } from 'drizzle-orm';
import { resolveProjectS3Config } from '$lib/server/s3Storage';
import { uploadFileWithConfig } from '$lib/server/storage';

type WithRLS = <T>(fn: (db: Db) => Promise<T>) => Promise<T>;

export async function processEpubImport({
	projectId,
	userId,
	withRLS,
	buffer,
	referenceId: providedReferenceId,
	sourceUrl = ''
}: {
	projectId: string;
	userId: string;
	withRLS: WithRLS;
	buffer: Uint8Array;
	referenceId?: string;
	sourceUrl?: string;
}): Promise<void> {
	const log = (...args: unknown[]) => console.log('[importEpub]', ...args);

	await withRLS((db) =>
		db.update(project).set({ isImporting: true }).where(eq(project.id, projectId))
	);

	(async () => {
		try {
			log('start', { projectId, bytes: buffer.byteLength });

			// Unzip
			const { unzipSync } = await import('fflate');
			const files = unzipSync(buffer);
			const decode = (b: Uint8Array) => new TextDecoder().decode(b);
			log('unzipped, files:', Object.keys(files).length);

			// Find OPF via META-INF/container.xml
			const containerXml = decode(files['META-INF/container.xml']);
			const { parseHTML } = await import('linkedom');
			const { document: containerDoc } = parseHTML(`<?xml version="1.0"?>${containerXml}`);
			const rootfilePath = containerDoc.querySelector('rootfile')?.getAttribute('full-path') ?? '';
			if (!rootfilePath) throw new Error('No rootfile in container.xml');
			log('rootfile:', rootfilePath);

			// Parse OPF
			const opfBase = rootfilePath.includes('/')
				? rootfilePath.slice(0, rootfilePath.lastIndexOf('/') + 1)
				: '';
			const opfXml = decode(files[rootfilePath]);
			const { document: opfDoc } = parseHTML(`<?xml version="1.0"?>${opfXml}`);

			// Metadata
			const metaEl = (localName: string) =>
				opfDoc.getElementsByTagName(`dc:${localName}`)[0] ??
				opfDoc.getElementsByTagName(localName)[0] ??
				null;
			const title = metaEl('title')?.textContent?.trim() ?? 'Untitled';
			const creatorEl = metaEl('creator');
			const creatorText = creatorEl?.textContent?.trim() ?? '';
			const dateText = metaEl('date')?.textContent?.trim()?.slice(0, 4) ?? '';
			log('metadata:', { title, creatorText, dateText });

			// Parse author name
			let authorFirst = '',
				authorLast = creatorText;
			if (creatorText.includes(',')) {
				const [last, first] = creatorText.split(',').map((s: string) => s.trim());
				authorLast = last;
				authorFirst = first ?? '';
			} else if (creatorText.includes(' ')) {
				const parts = creatorText.split(' ');
				authorFirst = parts.slice(0, -1).join(' ');
				authorLast = parts[parts.length - 1];
			}
			const authors = creatorText ? [{ first: authorFirst, last: authorLast }] : [];

			// Manifest
			const manifestItems = new Map<string, string>();
			Array.from(opfDoc.getElementsByTagName('item')).forEach((item) => {
				const id = item.getAttribute('id');
				const href = item.getAttribute('href');
				const type = item.getAttribute('media-type') ?? '';
				if (id && href && (type.includes('html') || type.includes('xhtml'))) {
					manifestItems.set(id, href);
				}
			});

			// Spine
			const spineItems: string[] = [];
			Array.from(opfDoc.getElementsByTagName('itemref')).forEach((ref) => {
				const idref = ref.getAttribute('idref');
				if (idref && manifestItems.has(idref)) spineItems.push(idref);
			});
			log('spine chapters:', spineItems.length);

			// Bibliography reference
			const { generateCiteKey } = await import('$lib/utils/bibtex');
			const citeKey = generateCiteKey(
				authors.length ? authors : [{ first: '', last: 'unknown' }],
				dateText
			);

			const { default: createDOMPurify } = await import('dompurify');

			// S3 (optional — only for image uploads)
			const s3 = await resolveProjectS3Config(projectId, userId, withRLS).catch(() => null);

			const normalizePath = (p: string) => {
				const parts = p.split('/');
				const out: string[] = [];
				for (const part of parts) {
					if (part === '..') out.pop();
					else if (part && part !== '.') out.push(part);
				}
				return out.join('/');
			};

			const imageExtMime: Record<string, string> = {
				jpg: 'image/jpeg',
				jpeg: 'image/jpeg',
				png: 'image/png',
				gif: 'image/gif',
				svg: 'image/svg+xml',
				webp: 'image/webp'
			};

			let resolvedRefId: string;

			if (providedReferenceId) {
				resolvedRefId = providedReferenceId;
				await withRLS((db) =>
					db
						.insert(projectReference)
						.values({ projectId, referenceId: resolvedRefId })
						.onConflictDoNothing()
				);
				log('using provided referenceId:', resolvedRefId);
			} else {
				const refId = crypto.randomUUID();
				await withRLS((db) =>
					db
						.insert(reference)
						.values({
							id: refId,
							userId,
							citeKey,
							type: 'book',
							title,
							authors,
							editors: [],
							year: dateText,
							url: sourceUrl,
							abstract: '',
							journal: '',
							booktitle: '',
							publisher: '',
							doi: '',
							volume: '',
							issue: '',
							pages: '',
							extra: {}
						})
						.onConflictDoNothing()
				);

				const refs = await withRLS((db) =>
					db
						.select({ id: reference.id })
						.from(reference)
						.where(and(eq(reference.userId, userId), eq(reference.citeKey, citeKey)))
						.limit(1)
				);
				resolvedRefId = refs[0]?.id ?? refId;

				await withRLS((db) =>
					db
						.insert(projectReference)
						.values({ projectId, referenceId: resolvedRefId })
						.onConflictDoNothing()
				);
				log('auto-created reference, citeKey:', citeKey);
			}

			// Pre-load existing titles
			const existingTitleRows = await withRLS((db) =>
				db.select({ title: document.title }).from(document).where(eq(document.projectId, projectId))
			);
			const takenTitles = new Set(existingTitleRows.map((r) => r.title));

			function uniqueTitle(base: string): string {
				if (!takenTitles.has(base)) {
					takenTitles.add(base);
					return base;
				}
				let n = 2;
				while (takenTitles.has(`${base} (${n})`)) n++;
				const t = `${base} (${n})`;
				takenTitles.add(t);
				return t;
			}

			const chapterSections: string[] = [];

			for (let i = 0; i < spineItems.length; i++) {
				const idref = spineItems[i];
				const href = manifestItems.get(idref)!;
				const filePath = opfBase + href;
				const fileData = files[filePath] ?? files[href];
				log(
					`chapter ${i + 1}/${spineItems.length}: idref=${idref} href=${href} found=${!!fileData}`
				);
				if (!fileData) continue;

				const chapterHtml = decode(fileData);
				const chapterDir = href.includes('/') ? href.slice(0, href.lastIndexOf('/') + 1) : '';

				const { document: chDoc, window: chWindow } = parseHTML(chapterHtml);

				if (s3) {
					const imgEls = Array.from(chDoc.querySelectorAll('img'));
					for (const img of imgEls) {
						const src = img.getAttribute('src');
						if (
							!src ||
							src.startsWith('data:') ||
							src.startsWith('http://') ||
							src.startsWith('https://')
						)
							continue;
						const imgPath = normalizePath(opfBase + chapterDir + src);
						const imgData = files[imgPath] ?? files[normalizePath(opfBase + src)] ?? files[src];
						if (!imgData) {
							img.removeAttribute('src');
							continue;
						}
						const ext = src.split('.').pop()?.toLowerCase() ?? 'jpg';
						const mimeType = imageExtMime[ext] ?? 'image/jpeg';
						const s3Key = `projects/${projectId}/epub-images/${crypto.randomUUID()}.${ext}`;
						try {
							const s3Url = await uploadFileWithConfig(s3, s3Key, Buffer.from(imgData), mimeType);
							img.setAttribute('src', s3Url);
						} catch (e) {
							log(`  image upload failed: ${e}`);
							img.removeAttribute('src');
						}
					}
				}

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const purify = createDOMPurify(chWindow as any);
				const htmlToSanitize = chDoc.documentElement?.outerHTML ?? chapterHtml;
				const clean = purify.sanitize(htmlToSanitize, {
					ADD_TAGS: ['figure', 'figcaption'],
					ADD_ATTR: ['role']
				});

				const { document: cleanDoc } = parseHTML(clean);
				const bodyContent = cleanDoc.querySelector('body')?.innerHTML?.trim() ?? '';
				if (!bodyContent) continue;

				const chapterTitle =
					chDoc.querySelector('h1, h2')?.textContent?.trim() ||
					chDoc.querySelector('title')?.textContent?.trim() ||
					`Chapter ${i + 1}`;

				const hasHeading = !!cleanDoc.querySelector('body h1, body h2');
				const sectionHtml = hasHeading
					? `<section>${bodyContent}</section>`
					: `<section><h2>${chapterTitle}</h2>${bodyContent}</section>`;

				chapterSections.push(sectionHtml);
				log(`  collected chapter "${chapterTitle}"`);
			}

			if (chapterSections.length > 0) {
				const combinedHtml = `<html><body>${chapterSections.join('\n')}</body></html>`;
				const docTitle = uniqueTitle(title.slice(0, 250));
				const docId = crypto.randomUUID();
				log(`inserting book document "${docTitle}" with ${chapterSections.length} chapters`);

				await withRLS((db) =>
					db.insert(document).values({
						id: docId,
						projectId,
						title: docTitle,
						type: 'book',
						ownerUserId: userId,
						generatedByAi: false,
						isReadonly: true,
						renderedHtml: combinedHtml,
						sourceReferenceId: resolvedRefId
					})
				).catch((e) => log(`failed to insert book document: ${e.message}`));
			}

			await withRLS((db) =>
				db.update(project).set({ isImporting: false }).where(eq(project.id, projectId))
			);
			log('done', chapterSections.length, 'chapters merged into 1 document');
		} catch (err) {
			console.error('[importEpub] failed:', err);
			await withRLS((db) =>
				db.update(project).set({ isImporting: false }).where(eq(project.id, projectId))
			).catch(console.error);
		}
	})();
}
