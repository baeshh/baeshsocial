/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Semantic meaning is fixed: brand = action/selection, success = verified/done,
      // warning = waiting/deadline, danger = error/destructive.
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        accent: {
          50: '#f5f3ff',
          100: '#ede9fe',
          500: '#7c3aed',
          600: '#6d28d9',
          700: '#5b21b6',
        },
        success: {
          50: '#ecfdf6',
          100: '#d1fae9',
          600: '#0d9d75',
          700: '#0b7a5c',
        },
        warning: {
          50: '#fff8eb',
          100: '#fdecc8',
          600: '#a96a0b',
          700: '#8a5508',
        },
        danger: {
          50: '#fdf2f4',
          100: '#fbe2e6',
          600: '#c33b4c',
          700: '#a12d3d',
        },
        surface: {
          canvas: '#f8fafc',
          card: '#ffffff',
          muted: '#f1f5f9',
          border: '#e2e8f0',
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
        overlay: '0 24px 64px -24px rgba(15, 23, 42, 0.35)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      spacing: {
        rail: '4.5rem',
        sidebar: '15rem',
        'safe-b': 'env(safe-area-inset-bottom)',
      },
      fontFamily: {
        sans: [
          'Pretendard Variable',
          'Pretendard',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Apple SD Gothic Neo',
          'Noto Sans KR',
          'Segoe UI',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
