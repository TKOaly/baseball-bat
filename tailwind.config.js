module.exports = {
  content: ['frontend/**/*.tsx', './node_modules/flowbite/**/*.js'],
  theme: {
    extend: {
      gridTemplateColumns: {
        main: '15em auto 15em',
      },
      keyframes: {
        scale: {
          'from, to': {
            transform: 'sacle(1)',
          },

          '50%': {
            transform: 'scale(1.25)',
          },
        },
        fill: {
          '0%': { top: '0', height: '0%' },
          '50%': { top: '0', height: '100%' },
          '100%': { top: '100%', height: '0%' },
        },
      },
      animation: {
        scale: 'scale 1s ease-in-out infinite',
        fill: 'fill 2s ease-in-out infinite',
      },
    },
  },
  plugins: [require('flowbite/plugin')],
};
