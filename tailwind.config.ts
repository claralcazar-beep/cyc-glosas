import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        marca: {
          50: '#eef6f4',
          100: '#d5eae5',
          500: '#1f7a6d',
          600: '#176356',
          700: '#124e44',
          900: '#0b2f29',
        },
      },
    },
  },
  plugins: [],
};

export default config;
