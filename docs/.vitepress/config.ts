import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'EasyEDA MCP Pro',
  description:
    'Production-grade MCP server for EasyEDA Pro: safe PCB design inspection, BOM sourcing, manufacturing export, and AI-assisted hardware review.',
  base: '/easyeda-mcp-pro/',
  themeConfig: {
    logo: '/logo.png',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Tools Reference', link: '/reference/tools' },
      { text: 'Resources & Prompts', link: '/reference/resources-prompts' },
      { text: 'EasyEDA Compatibility', link: '/reference/easyeda-compatibility' },
      { text: 'Bridge Contract', link: '/reference/bridge-contract' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Configuration', link: '/guide/configuration' },
          { text: 'Troubleshooting', link: '/guide/troubleshooting' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'MCP Tools', link: '/reference/tools' },
          { text: 'Resources & Prompts', link: '/reference/resources-prompts' },
          { text: 'EasyEDA Compatibility', link: '/reference/easyeda-compatibility' },
          { text: 'Bridge Contract', link: '/reference/bridge-contract' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/oaslananka/easyeda-mcp-pro' }],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026-present oaslananka',
    },
  },
});
