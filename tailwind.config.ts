import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';
const config: Config = {
  darkMode: ['class'], content: ['./app/**/*.{ts,tsx}', './componentes/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: {
      tinta: { 950: '#102438', 900: '#15283B', 850: '#172E3D', 800: '#234055', 700: '#344C63', 600: '#465F77' },
      bruma: { 600: '#58697C', 500: '#677C91', 400: '#8B9AAF', 300: '#CBD8E4', 200: '#DCE5EC', 100: '#EDF3F7', 50: '#F8FAFC' },
      marca: { 50: '#FFF0F2', 300: '#E9586C', 500: '#C63546', 600: '#A92234' },
      produto: { 50: '#E6F6FB', 100: '#D6F0FA', 500: '#00A7CD', 700: '#0087A5', 800: '#006F8A' },
      tela: '#F4F7FA', osso: '#FAFCFE', sucesso: { 100: '#E3F8ED', 600: '#16835D', 700: '#116947' },
      alerta: { 100: '#FFF2DC', 600: '#CB6B15', 700: '#A95009' }, ia: { 50: '#F0EAFF', 600: '#6D4AFF', 700: '#5734D6' },
    },
    fontFamily: { sans: ['Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'] },
    borderRadius: { lg: '7px', xl: '9px', '2xl': '9px', '3xl': '9px' },
  } },
  plugins: [animate],
};
export default config;
