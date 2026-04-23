import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
	docs: defineCollection({
		loader: docsLoader({
			pattern: ['**/*.{md,mdx,mdoc}', '!_assets/**'],
		}),
		schema: docsSchema(),
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
