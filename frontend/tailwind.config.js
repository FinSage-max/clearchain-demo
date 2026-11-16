/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: '#101828',
        paper: '#eef3f7',
        moss: '#0f766e',
        clay: '#b45309',
        slate: '#334155',
      },
    },
  },
  plugins: [],
};
