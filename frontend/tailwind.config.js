/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#dbeafe',
          500: '#2563eb',
          600: '#1d4ed8',
          700: '#1e40af',
        },
        accent: {
          50: '#f5f3ff',
          100: '#ede9fe',
          500: '#7c3aed',
          600: '#6d28d9',
        },
        surface: {
          canvas: '#f3f4f6',
          card: '#ffffff',
          muted: '#f1f5f9',
          border: '#e5e7eb',
        },
        ink: {
          strong: '#0f172a',
          body: '#334155',
          muted: '#64748b',
        },
      },
      boxShadow: {
        card: '0 12px 40px -24px rgba(15, 23, 42, 0.35)',
        soft: '0 16px 60px -36px rgba(37, 99, 235, 0.45)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
