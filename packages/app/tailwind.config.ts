import type { Config } from 'tailwindcss';
import { nextui } from '@nextui-org/react';
import plugin from 'tailwindcss/plugin';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './../../node_modules/@nextui-org/theme/dist/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary)',
        danger: 'rgb(255, 75, 118)',
      },
    },
  },
  darkMode: 'class',
  plugins: [
    plugin(({ matchComponents, theme, addComponents }) => {
      addComponents({
        //p-5 max-w-screen-md mx-auto
        '.s-container': {
          padding: theme('padding.5'),
          maxWidth: theme('maxWidth.screen-md'),
          minHeight: '100dvh',
          margin: '0 auto',
        },
      });
    }),
    nextui({
      addCommonColors: true,
      themes: {
        light: {
          colors: {
            background: '#FFFFFF',
            foreground: '#11181C',
          },
        },
        dark: {
          colors: {
            background: '#212330',
            foreground: '#FFF2F2',
            default: {
              100: '#2c2e39',
            },
            primary: {
              foreground: '#000',
            },
          },
        },
      },
    }),
  ],
};
export default config;
