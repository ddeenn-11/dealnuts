/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#EFF1EC',
        surface: '#FBFAF7',
        ink: '#1F2A24',
        inkmuted: '#5B665E',
        line: '#C9CFC7',
        tag: '#FF5A3C',
        tagdark: '#E14A2C',
        deal: '#1B6E5B',
        dealdark: '#154F42',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(31, 42, 36, 0.06), 0 4px 10px rgba(31, 42, 36, 0.06)',
      },
    },
  },
  plugins: [],
}
