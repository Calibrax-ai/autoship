import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

// Architecture long-form pieces that render through the custom
// Longform layout (warm palette, sticky sidebar). Kept out of the
// Starlight docs collection to avoid double-routing.
const LONGFORM_ARCHITECTURE = [
	'architecture/system-overview.md',
	'architecture/audit-architecture.md',
	'architecture/audit-tracker-sync.md',
	'architecture/deliver-architecture.md',
];

export const collections = {
	docs: defineCollection({
		loader: docsLoader({
			pattern: [
				'**/*.{md,mdx,mdoc}',
				'!_assets/**',
				'!**/archive/extract/implementation/**/*',
				...LONGFORM_ARCHITECTURE.map((p) => `!${p}`),
			],
		}),
		schema: docsSchema(),
	}),
	architecture: defineCollection({
		loader: glob({
			pattern: '{system-overview,audit-architecture,audit-tracker-sync,deliver-architecture}.md',
			base: '../docs/architecture',
		}),
		schema: z.object({
			title: z.string(),
			description: z.string().optional(),
			eyebrow: z.string().default('Architecture'),
			subtitle: z.string().optional(),
		}),
	}),
	ideas: defineCollection({
		loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/ideas' }),
		schema: z.object({
			title: z.string(),
			dek: z.string().optional(),
			date: z.coerce.date(),
			tags: z.array(z.string()).default([]),
			draft: z.boolean().default(false),
		}),
	}),
};
