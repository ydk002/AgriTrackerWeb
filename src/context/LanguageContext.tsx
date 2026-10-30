import { useState, useCallback, type ReactNode } from 'react';
import { LanguageContext, translations, type Locale } from './languageContextInstance';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('agri_locale');
    if (saved === 'en' || saved === 'hu' || saved === 'ro') {
      return saved;
    }
    return 'en';
  });

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    localStorage.setItem('agri_locale', nextLocale);
  }, []);

  const t = useCallback(
    (key: string): string => {
      return translations[locale][key] || translations.en[key] || key;
    },
    [locale]
  );

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
