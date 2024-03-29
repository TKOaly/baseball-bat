import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { AppWrapper } from './app-wrapper';

import englishTranslations from '../i18n/en.json';
import finnishTranslations from '../i18n/fi.json';
import { createRoot } from 'react-dom/client';

import '@fontsource/dm-serif-display';
import '@fontsource-variable/montserrat';

i18n.use(initReactI18next).init({
  resources: {
    en: englishTranslations,
    fi: finnishTranslations,
  },

  lng: 'fi',
});

const root = document.getElementById('root')!;
createRoot(root).render(<AppWrapper />);
