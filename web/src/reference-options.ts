import codes from './data/locale-codes.json';
import dubai from './data/dubai-areas.json';
import type { Choice } from './components/ui/search-select';

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });
const alphabetic = (a: Choice, b: Choice) => a.label.localeCompare(b.label);
export const countries: Choice[] = codes.countries
  .map((code) => ({ value: countryNames.of(code) ?? code, label: countryNames.of(code) ?? code }))
  .sort(alphabetic);
export const languages: Choice[] = codes.languages
  .map((code) => ({ value: code, label: languageNames.of(code) ?? code }))
  .sort(alphabetic);
export const dubaiAreas: Choice[] = dubai.areas.map((name) => ({ value: name, label: name }));
export const dubaiTimezone: Choice[] = [{ value: 'Asia/Dubai', label: 'Dubai (UTC+04:00)' }];
export function referenceOptions(name: string): Choice[] | undefined {
  if (/nationality$/i.test(name)) return countries;
  if (['preferredLanguage'].includes(name)) return languages;
  if (['preference_language', 'preference_sharedLanguage'].includes(name))
    return [
      ...new Map(
        languages.map((item) => [item.label, { value: item.label, label: item.label }]),
      ).values(),
    ];
  if (name === 'preference_gender')
    return ['Any', 'Male', 'Female'].map((value) => ({ value, label: value }));
  if (name === 'preference_sleepSchedule')
    return ['Early sleeper', 'Night owl', 'Flexible'].map((value) => ({ value, label: value }));
  if (name === 'preference_noise')
    return ['Quiet', 'Moderate', 'No preference'].map((value) => ({ value, label: value }));
  if (name === 'timezone') return dubaiTimezone;
  if (name === 'area') return dubaiAreas;
  if (name === 'emirate') return [{ value: 'Dubai', label: 'Dubai' }];
  return undefined;
}
