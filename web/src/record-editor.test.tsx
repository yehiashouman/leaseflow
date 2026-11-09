import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { RecordEditor } from './components/record-editor';

afterEach(cleanup);
describe('recoverable record validation', () => {
  it('preserves typed values and maps nested server errors beside the matching input', async () => {
    const error = new AxiosError('Validation failed');
    Object.assign(error, {
      response: {
        data: {
          message: 'Identity requires correction.',
          requestId: 'safe-request-id',
          details: [{ path: ['secondaryOccupant', 'fullName'], message: 'Enter the full name.' }],
        },
      },
    });
    const user = userEvent.setup();
    render(
      <RecordEditor
        open
        onOpenChange={() => {}}
        title="Occupant"
        fields={[
          { name: 'secondaryName', errorPath: 'secondaryOccupant.fullName', label: 'Full name' },
        ]}
        onSave={async () => {
          throw error;
        }}
      />,
    );
    const input = screen.getByLabelText('Full name');
    await user.type(input, 'Unchanged draft');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter the full name.')).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('editor-error-secondaryName');
    expect((input as HTMLInputElement).value).toBe('Unchanged draft');
    expect(screen.getByText(/Request: safe-request-id/)).toBeTruthy();
  });
  it('retains the form after an offline save and clears field errors before the next attempt', async () => {
    let calls = 0;
    const user = userEvent.setup();
    render(
      <RecordEditor
        open
        onOpenChange={() => {}}
        title="Record"
        fields={[{ name: 'note', label: 'Note', type: 'textarea' }]}
        onSave={async () => {
          calls++;
          if (calls === 1) throw new AxiosError('Network Error');
        }}
      />,
    );
    await user.type(screen.getByLabelText('Note'), 'Keep this draft');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Unable to save. Please try again.');
    expect((screen.getByLabelText('Note') as HTMLTextAreaElement).value).toBe('Keep this draft');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(calls).toBe(2);
    expect(screen.queryByText('Unable to save. Please try again.')).toBeNull();
  });
});
