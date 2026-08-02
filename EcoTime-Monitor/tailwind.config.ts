import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Background scale
        'bg-dark':      '#070a13',
        'bg-primary':   '#0b1120',
        'bg-secondary': '#121b2e',
        'bg-tertiary':  '#1e293b',
        'bg-glass':     'rgba(18,27,46,0.75)',

        // Text
        'text-primary':   '#f8fafc',
        'text-secondary': '#94a3b8',
        'text-muted':     '#64748b',

        // Accent – Green
        green:        '#10b981',
        'green-glow': 'rgba(16,185,129,0.20)',
        'green-dim':  'rgba(16,185,129,0.10)',
        'green-border':'rgba(16,185,129,0.30)',

        // Accent – Amber
        amber:        '#f59e0b',
        'amber-glow': 'rgba(245,158,11,0.20)',
        'amber-border':'rgba(245,158,11,0.30)',

        // Accent – Rose
        rose:        '#f43f5e',
        'rose-glow': 'rgba(244,63,94,0.20)',
        'rose-border':'rgba(244,63,94,0.30)',

        // Accent – Blue
        'eco-blue':       '#3b82f6',
        'eco-blue-glow':  'rgba(59,130,246,0.20)',
        'eco-blue-border':'rgba(59,130,246,0.30)',

        // Accent – Purple
        purple:        '#a855f7',
        'purple-glow': 'rgba(168,85,247,0.20)',
        'purple-border':'rgba(168,85,247,0.30)',

        // Teal
        teal:        '#14b8a6',
        'teal-glow': 'rgba(20,184,166,0.20)',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        sm:  '8px',
        md:  '12px',
        lg:  '16px',
        xl:  '20px',
        '2xl': '24px',
        '3xl': '30px',
      },
      boxShadow: {
        sm:     '0 2px 8px -2px rgba(0,0,0,0.5)',
        md:     '0 10px 25px -5px rgba(0,0,0,0.4), 0 8px 16px -6px rgba(0,0,0,0.4)',
        lg:     '0 20px 40px -10px rgba(0,0,0,0.6), 0 12px 24px -8px rgba(0,0,0,0.6)',
        green:  '0 0 25px -5px rgba(16,185,129,0.4)',
        blue:   '0 0 25px -5px rgba(59,130,246,0.4)',
        purple: '0 0 25px -5px rgba(168,85,247,0.4)',
        glass:  'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      backgroundImage: {
        'grad-primary': 'linear-gradient(135deg,#10b981 0%,#3b82f6 100%)',
        'grad-purple':  'linear-gradient(135deg,#a855f7 0%,#6366f1 100%)',
        'grad-rose':    'linear-gradient(135deg,#f43f5e 0%,#f97316 100%)',
        'grad-dark':    'linear-gradient(180deg,#121b2e 0%,#070a13 100%)',
        'grad-teal':    'linear-gradient(135deg,#14b8a6 0%,#10b981 100%)',
      },
      animation: {
        'aurora':        'aurora 20s ease-in-out infinite alternate',
        'float':         'float 6s ease-in-out infinite',
        'pulse-glow':    'pulseGlow 2s ease-in-out infinite',
        'slide-in-left': 'slideInLeft 0.4s ease-out',
        'fade-up':       'fadeUp 0.5s ease-out',
        'spin-slow':     'spin 8s linear infinite',
      },
      keyframes: {
        aurora: {
          '0%':   { transform: 'translate(0%,0%) scale(1)',   opacity: '0.6' },
          '33%':  { transform: 'translate(5%,-5%) scale(1.1)', opacity: '0.8' },
          '66%':  { transform: 'translate(-3%,3%) scale(0.95)', opacity: '0.5' },
          '100%': { transform: 'translate(2%,-2%) scale(1.05)', opacity: '0.7' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0px)' },
          '50%':     { transform: 'translateY(-10px)' },
        },
        pulseGlow: {
          '0%,100%': { opacity: '1' },
          '50%':     { opacity: '0.5' },
        },
        slideInLeft: {
          from: { transform: 'translateX(-20px)', opacity: '0' },
          to:   { transform: 'translateX(0)',      opacity: '1' },
        },
        fadeUp: {
          from: { transform: 'translateY(20px)', opacity: '0' },
          to:   { transform: 'translateY(0)',     opacity: '1' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};

export default config;
