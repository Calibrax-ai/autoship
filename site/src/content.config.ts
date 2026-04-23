import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
	docs: defineCollection({
		loader: docsLoader({
			pattern: ['**/*.{md,mdx,mdoc}', '!_assets/**'],
		}),
		schema: docsSchema(),
	}),
};
