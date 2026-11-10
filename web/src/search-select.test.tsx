import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordEditor } from './components/record-editor';
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
  it('limits building choices to the selected area and clears a prior area selection', async () => {
    const user = userEvent.setup();
    render(
      <RecordEditor
        open
        title="Unit"
        onOpenChange={() => {}}
        onSave={async () => {}}
        fields={[
          { name: 'area', label: 'Area', value: 'Dubai Marina' },
          {
            name: 'building',
            label: 'Building',
            searchable: true,
            dependsOn: 'area',
            value: 'Aurora',
            options: [
              { value: 'Aurora', label: 'Aurora', area: 'Dubai Marina' },
              { value: 'Grande', label: 'Grande', area: 'Downtown Dubai' },
            ],
          },
        ]}
      />,
    );
    await user.click(screen.getByLabelText('Building'));
    expect(screen.getByRole('option', { name: 'Aurora' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Grande' })).toBeNull();
    await user.keyboard('{Escape}');
    await user.click(screen.getByLabelText('Area'));
    await user.type(screen.getByRole('combobox', { name: 'Search choices' }), 'Downtown Dubai');
    await user.click(screen.getByRole('option', { name: 'Downtown Dubai' }));
    expect(screen.getByLabelText('Building').textContent).toContain('Select an option');
    await user.click(screen.getByLabelText('Building'));
    expect(screen.getByRole('option', { name: 'Grande' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Aurora' })).toBeNull();
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
