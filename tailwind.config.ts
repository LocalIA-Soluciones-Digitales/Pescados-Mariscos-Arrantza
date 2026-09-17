/** @type {import('tailwindcss').Config} */
export default {
    content: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
      extend: {
        screens: {
          xs: '475px',
        },
        // Hex, not oklch: Tailwind v3's `/opacity` modifier (bg-background-50/95,
        // border-white/30, etc.) can only compute an alpha variant for color
        // formats it can parse, and it can't parse oklch() — with oklch values
        // here those modifiers silently produced no CSS at all. Values below are
        // the same colors, converted to hex (visually identical).
        colors: {
          background: {
            50: '#fcfcfa',
            100: '#f3f2ee',
            200: '#e7e4df',
            300: '#d7d4cd',
            400: '#c2bdb5',
            500: '#ada79e',
            600: '#958e85',
            700: '#777068',
            800: '#5b544c',
            900: '#3f3a34',
            950: '#25211d',
          },
          primary: {
            50: '#eaeff4',
            100: '#d0d9e1',
            200: '#abb9c7',
            300: '#7e92a3',
            400: '#4f6678',
            500: '#182b38',
            600: '#0c1d27',
            700: '#041119',
            800: '#02080e',
            900: '#010406',
            950: '#000102',
          },
          accent: {
            50: '#e6f1ef',
            100: '#c6ddd9',
            200: '#9ec0b9',
            300: '#7aa299',
            400: '#61827a',
            500: '#49645c',
            600: '#364e46',
            700: '#273a33',
            800: '#192822',
            900: '#0f1814',
            950: '#060a08',
          },
          secondary: {
            50: '#f9f5ee',
            100: '#efe7db',
            200: '#ded2c3',
            300: '#cabba9',
            400: '#b1a28f',
            500: '#948777',
            600: '#796c5f',
            700: '#5f5347',
            800: '#453b32',
            900: '#2c251f',
            950: '#1a1511',
          },
          foreground: {
            50: '#f4f5f6',
            100: '#dcdee0',
            200: '#babec1',
            300: '#94999c',
            400: '#6c7376',
            500: '#484e52',
            600: '#303639',
            700: '#1e2528',
            800: '#10171a',
            900: '#070c0e',
            950: '#020405',
          },
        },
        fontFamily: {
          heading: ['"Playfair Display"', 'Georgia', 'serif'],
          body: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
          label: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        },
        keyframes: {
          fadeIn: {
            '0%': { opacity: '0', transform: 'translateY(-4px)' },
            '100%': { opacity: '1', transform: 'translateY(0)' },
          },
        },
        animation: {
          fadeIn: 'fadeIn 0.25s ease-out',
        },
        // Sombras tintadas con el propio foreground de la marca (en vez del
        // negro plano por defecto de Tailwind) para que la elevación se
        // sienta parte del mismo sistema editorial, no un componente de
        // dashboard genérico pegado encima.
        boxShadow: {
          card: '0 1px 2px 0 rgb(38 42 46 / 0.05), 0 1px 1px 0 rgb(38 42 46 / 0.03)',
          'card-hover': '0 16px 32px -12px rgb(38 42 46 / 0.18), 0 4px 8px -4px rgb(38 42 46 / 0.08)',
        },
      },
    },
    plugins: [],
  }