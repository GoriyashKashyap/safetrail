export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        shield: {
          50:  '#f0f7ff',
          100: '#e0effe',
          200: '#bae3fd',
          300: '#7cc9fa',
          400: '#38a3f5',
          500: '#1a8fe8',
          600: '#0d72c9',
          700: '#0957a0',
          900: '#052d54',
        },
        pulse: {
          400: '#f97c50',
          500: '#f45e28',
          600: '#d44315',
        },
        safe: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
        warn: {
          50:  '#fffbeb',
          100: '#fef3c7',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        danger: {
          50:  '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
        }
      },
      fontFamily: {
        display: ['"DM Sans"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'ping-once': 'ping 0.8s cubic-bezier(0,0,0.2,1) 1',
      }
    }
  },
  plugins: []
}
