// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  integrations: [
      starlight({
          title: 'autoship',
          description:
              'Turns messy software work into bounded, reviewable, executable units.',
          customCss: ['./src/styles/starlight-overrides.css'],
          defaultLocale: 'root',
          expressiveCode: {
              themes: ['github-dark'],
              styleOverrides: {
                  borderRadius: '10px',
                  borderWidth: '0',
                  codeBackground: '#232220',
              },
          },
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
                  label: 'Architecture →',
                  link: '/architecture/',
                  attrs: { 'data-cross-section': 'true' },
              },
              {
                  label: 'Ideas →',
                  link: '/ideas/',
                  attrs: { 'data-cross-section': 'true' },
              },
              {
                  label: 'Learnings',
                  items: [
                      { label: 'Cross-track', slug: 'learnings' },
                      { label: 'Deliver', slug: 'deliver-learnings' },
                  ],
              },
              {
                  label: 'Status',
                  autogenerate: { directory: 'status' },
              },
              {
                  label: 'Archive',
                  collapsed: true,
                  autogenerate: { directory: 'archive' },
              },
          ],
      }),
	],

  vite: {
    plugins: [tailwindcss()],
  },
});
