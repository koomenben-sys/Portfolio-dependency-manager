// Minimal i18n: English strings are the keys; `nl` provides Dutch. Missing keys fall back to English.
// `t(key, vars)` interpolates {name} placeholders. Language lives in settings.language (default 'nl').
import { nl } from './nl';
import { useContext, createContext } from 'react';

export const LANGUAGES = [['nl', 'Nederlands'], ['en', 'English']];
const DICTS = { nl, en: {} };

export function translate(lang, key, vars) {
  let s = (DICTS[lang] && DICTS[lang][key]) ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  return s;
}

export const I18nContext = createContext('nl');
export function useT() {
  const lang = useContext(I18nContext);
  const t = (key, vars) => translate(lang, key, vars);
  t.lang = lang;
  return t;
}

// Status/label dictionaries used by domain constants (model.js keeps English labels; views translate).
export const dateLocale = (lang) => (lang === 'nl' ? 'nl-NL' : 'en-GB');
