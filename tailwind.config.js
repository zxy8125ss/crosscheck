/** @type {import('tailwindcss').Config} */
const v = name => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: v('paper'), card: v('card'), sand: v('sand'), ink: v('ink'), muted: v('muted'),
        pine: v('pine'), bark: v('bark'), teal: v('teal'), line: v('line'), warn: v('warn'),
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Source Han Serif SC"', '"Songti SC"', 'STSong', 'serif'],
        sans: ['"Noto Sans SC"', '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '1.25rem' },
    },
  },
};
