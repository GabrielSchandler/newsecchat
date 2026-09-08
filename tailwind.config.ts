import type { Config } from 'tailwindcss';

/**
 * Paleta NewSec — os valores vêm do site do produto (GRSCRM-SITE,
 * `src/app/globals.css`), pra que os três produtos da marca pareçam a
 * mesma família. Regras que não se quebram:
 *
 * - `brand-500` como TEXTO sobre fundo escuro fica na fronteira do WCAG AA.
 *   Em fundo escuro usar `brand-300`. Como fundo de botão com texto branco,
 *   `brand-500` é válido.
 * - Raio máximo de 8px em qualquer elemento.
 * - Vermelho é acento (erro, marca, destaque). A cor de AÇÃO do produto é o
 *   verde-petróleo `produto-700` — o operador passa horas nesta tela e um
 *   vermelho em cada botão cansa.
 */
const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './componentes/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        tinta: {
          950: '#0b0b0d',
          900: '#121317',
          850: '#17181d',
          800: '#1b1b1f',
          700: '#2a2d35',
          600: '#3a3e48',
        },
        bruma: {
          600: '#5f6674',
          500: '#7b8393',
          400: '#9aa1b0',
          300: '#c2c7d1',
          200: '#e2e5ea',
          100: '#f1f3f6',
          50: '#f7f8fa',
        },
        marca: {
          50: '#fdeced',
          300: '#ff5a5f',
          500: '#e31b23',
          600: '#b5121a',
        },
        produto: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          500: '#14b8a6',
          700: '#0f766e',
          800: '#115e59',
        },
        osso: '#faf9f7',
        tela: '#f7f8fa',
        sucesso: { 100: '#dcfce7', 600: '#16a34a', 700: '#15803d' },
        alerta: { 100: '#fef3c7', 600: '#d97706', 700: '#b45309' },
      },
      fontFamily: {
        sans: ['var(--fonte-sora)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: '8px',
        xl: '8px',
        '2xl': '8px',
        '3xl': '8px',
      },
      keyframes: {
        'entrar-suave': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'entrar-suave': 'entrar-suave 160ms ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
