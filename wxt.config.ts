import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

const ICONS = {
  16: 'icon/16.png',
  32: 'icon/32.png',
  48: 'icon/48.png',
  96: 'icon/96.png',
  128: 'icon/128.png',
};

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  // NihongoTracker uses port 3000 in development. Keep the extension dev server away from it.
  dev: {
    server: {
      port: 3210,
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    icons: ICONS,
    action: {
      default_icon: ICONS,
      default_title: 'NTExtended',
    },
    permissions: ['storage', 'alarms', 'activeTab', 'scripting', 'tabs'],
    host_permissions: [
      'https://nihongotracker.app/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
      '*://*.youtube.com/*',
      'https://reader.ttsu.app/*',
      'https://app.yatsu.moe/*',
    ],
    optional_host_permissions: ['*://*/*'],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'ntextended@nihongotracker.app',
              strict_min_version: '128.0',
              data_collection_permissions: {
                required: ['browsingActivity', 'websiteContent'],
              },
            },
          },
        }
      : {}),
  }),
});
