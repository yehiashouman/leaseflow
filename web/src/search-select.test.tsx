import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchSelect } from './components/ui/search-select';
import { countries, languages, dubaiAreas } from './reference-options';
afterEach(cleanup);
describe('reference choices', () => {
  it('searches country names, supports keyboard choice, and submits the selected value', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <form>
        <label htmlFor="nationality">Nationality</label>
        <SearchSelect id="nationality" name="nationality" options={countries} />
      </form>,
    );
    await user.click(screen.getByLabelText('Nationality'));
    const search = screen.getByRole('combobox', { name: 'Search choices' });
    await user.type(search, 'Egypt');
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Nationality').textContent).toContain('Egypt');
    expect(new FormData(container.querySelector('form')!).get('nationality')).toBe('Egypt');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
  it('preserves a saved historical value absent from the current catalogue', () => {
    const { container } = render(
      <form>
        <SearchSelect name="area" defaultValue="Historic area label" options={dubaiAreas} />
      </form>,
    );
    expect(new FormData(container.querySelector('form')!).get('area')).toBe('Historic area label');
    expect(screen.getByRole('combobox').textContent).toContain('Historic area label');
  });
  it('offers a deliberate unlisted-building path without inventing catalogue entries', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <form>
        <SearchSelect name="building" options={[]} allowCustom />
      </form>,
    );
    await user.click(screen.getByRole('combobox'));
    await user.type(
      screen.getByRole('combobox', { name: 'Search choices' }),
      'Portfolio Building 45',
    );
    await user.click(
      screen.getByRole('button', { name: 'Add unlisted building: Portfolio Building 45' }),
    );
    expect(new FormData(container.querySelector('form')!).get('building')).toBe(
      'Portfolio Building 45',
    );
  });
  it('provides country, language, and Dubai catalogues without duplicate values', () => {
    expect(countries.length).toBe(249);
    expect(languages.length).toBeGreaterThan(180);
    expect(dubaiAreas.some((item) => item.value === 'Deira')).toBe(true);
    expect(dubaiAreas.some((item) => item.value === 'Dubai Marina')).toBe(true);
    for (const choices of [countries, languages, dubaiAreas])
      expect(new Set(choices.map((item) => item.value)).size).toBe(choices.length);
  });
});
