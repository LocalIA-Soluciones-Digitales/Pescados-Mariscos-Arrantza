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
        colors: {
          background: {
            50: 'oklch(0.99 0.002 95)',
            100: 'oklch(0.96 0.005 90)',
            200: 'oklch(0.92 0.008 85)',
            300: 'oklch(0.87 0.010 82)',
            400: 'oklch(0.80 0.012 80)',
            500: 'oklch(0.73 0.014 78)',
            600: 'oklch(0.65 0.015 76)',
            700: 'oklch(0.55 0.016 74)',
            800: 'oklch(0.45 0.015 72)',
            900: 'oklch(0.35 0.012 70)',
            950: 'oklch(0.25 0.010 68)',
          },
          primary: {
            50: 'oklch(0.95 0.008 250)',
            100: 'oklch(0.88 0.015 248)',
            200: 'oklch(0.78 0.025 246)',
            300: 'oklch(0.65 0.035 244)',
            400: 'oklch(0.50 0.040 242)',
            500: 'oklch(0.28 0.035 238)',
            600: 'oklch(0.22 0.030 236)',
            700: 'oklch(0.17 0.025 234)',
            800: 'oklch(0.13 0.020 232)',
            900: 'oklch(0.10 0.015 230)',
            950: 'oklch(0.07 0.010 228)',
          },
          accent: {
            50: 'oklch(0.95 0.012 185)',
            100: 'oklch(0.88 0.025 183)',
            200: 'oklch(0.78 0.038 181)',
            300: 'oklch(0.68 0.045 179)',
            400: 'oklch(0.58 0.040 177)',
            500: 'oklch(0.48 0.035 175)',
            600: 'oklch(0.40 0.032 173)',
            700: 'oklch(0.33 0.028 171)',
            800: 'oklch(0.26 0.022 169)',
            900: 'oklch(0.20 0.016 167)',
            950: 'oklch(0.14 0.010 165)',
          },
          secondary: {
            50: 'oklch(0.97 0.010 80)',
            100: 'oklch(0.93 0.018 78)',
            200: 'oklch(0.87 0.025 76)',
            300: 'oklch(0.80 0.030 74)',
            400: 'oklch(0.72 0.032 72)',
            500: 'oklch(0.63 0.028 70)',
            600: 'oklch(0.54 0.026 68)',
            700: 'oklch(0.45 0.024 66)',
            800: 'oklch(0.36 0.020 64)',
            900: 'oklch(0.27 0.016 62)',
            950: 'oklch(0.20 0.012 60)',
          },
          foreground: {
            50: 'oklch(0.97 0.002 240)',
            100: 'oklch(0.90 0.004 238)',
            200: 'oklch(0.80 0.006 236)',
            300: 'oklch(0.68 0.008 234)',
            400: 'oklch(0.55 0.010 232)',
            500: 'oklch(0.42 0.010 230)',
            600: 'oklch(0.33 0.010 228)',
            700: 'oklch(0.26 0.012 226)',
            800: 'oklch(0.20 0.012 224)',
            900: 'oklch(0.15 0.010 222)',
            950: 'oklch(0.10 0.008 220)',
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