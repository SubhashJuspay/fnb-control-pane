import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';
import preset from '@repo/config/tailwind';

const config: Config = {
  presets: [preset as Config],
  content: ['./src/**/*.{ts,tsx}'],
  plugins: [animate],
};

export default config;
