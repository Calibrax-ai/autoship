// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'autoship',
			description:
				'Turns messy software work into bounded, reviewable, executable units.',
			components: {
				Head: './src/components/Head.astro',
			},
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/Calibrax-ai/autoship',
				},
			],
			sidebar: [
				{
					label: 'Architecture',
					items: [
						{ label: 'System Overview', slug: 'architecture/system-overview' },
						{ label: 'Extract', slug: 'architecture/extract-architecture' },
						{ label: 'Deliver', slug: 'architecture/deliver-architecture' },
						{ label: 'Program Template', slug: 'architecture/deliver-program-template' },
					],
				},
				{
					label: 'Learnings',
					items: [
						{ label: 'Cross-track', slug: 'learnings' },
						{ label: 'Extract', slug: 'extract-learnings' },
						{ label: 'Deliver', slug: 'deliver-learnings' },
					],
				},
				{
					label: 'Guides',
					items: [
						{ label: 'Harness Philosophy', slug: 'harness-philosophy' },
						{ label: 'Plan Reviewer Calibration', slug: 'plan-reviewer-calibration' },
					],
				},
				{
					label: 'Probes',
					slug: 'probe-summary',
				},
				{
					label: 'Archive',
					collapsed: true,
					autogenerate: { directory: 'archive' },
				},
			],
		}),
	],
});
