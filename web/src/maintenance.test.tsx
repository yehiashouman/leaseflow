import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from './api';
import { MaintenanceAssessment } from './components/maintenance-assessment';
import type { CaseRecord } from './cases';
afterEach(cleanup);
const sample = (): CaseRecord => ({
  id: 'r1',
  contractId: 'c1',
  type: 'MAINTENANCE',
  title: 'Repair',
  description: 'Tap repair',
  status: 'IN_PROGRESS',
  version: 3,
  canAssessMaintenance: true,
  maintenanceAssessments: [],
});
function page(data = sample()) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <MaintenanceAssessment data={data} />
    </QueryClientProvider>,
  );
}
describe('maintenance responsibility controls', () => {
  it('posts a literal proposed amount and evidence without a charge or deduction command', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: sample() });
    page();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Record responsibility' }));
    await user.selectOptions(screen.getByLabelText('Responsibility'), 'TENANT_COST');
    await user.type(screen.getByLabelText('Proposed tenant cost'), '150.25');
    await user.type(screen.getByLabelText('Explanation *'), 'Broken handle');
    await user.type(
      screen.getByLabelText('Evidence notes'),
      'Inspection recorded a snapped handle',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(post).toHaveBeenCalledWith(
      '/requests/r1/maintenance',
      expect.objectContaining({
        expectedVersion: 3,
        classification: 'TENANT_COST',
        proposedAmount: '150.25',
        evidenceNotes: 'Inspection recorded a snapped handle',
      }),
    );
    expect(post).toHaveBeenCalledTimes(1);
  });
  it('retains stale values and the original version after a conflict', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 409,
          data: { message: 'Case changed. Reload before another assessment' },
        },
      });
    page();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Record responsibility' }));
    await user.type(screen.getByLabelText('Explanation *'), 'Under inspection');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Case changed');
    expect((screen.getByLabelText('Explanation *') as HTMLTextAreaElement).value).toBe(
      'Under inspection',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(post.mock.calls[0]![1]).toEqual(post.mock.calls[1]![1]);
  });
  it('separates cost acceptance and dispute from repair completion with an exact assessment identifier', async () => {
    const data = sample();
    data.canAssessMaintenance = false;
    data.canRespondMaintenance = true;
    data.maintenanceAssessments = [
      {
        id: 'a1',
        caseVersion: 2,
        classification: 'TENANT_COST',
        proposedAmount: '150.25',
        currency: 'AED',
        explanation: 'Broken handle',
        evidenceNotes: 'Dated inspection note',
        decision: null,
        responseExplanation: null,
        respondedAt: null,
        createdAt: '2026-11-08T00:00:00Z',
      },
    ];
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data });
    page(data);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Dispute proposed cost' }));
    await user.type(screen.getByLabelText('Response explanation *'), 'Present on arrival');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(post).toHaveBeenCalledWith(
      '/requests/r1/maintenance/a1/respond',
      expect.objectContaining({
        expectedVersion: 3,
        decision: 'DISPUTED',
        explanation: 'Present on arrival',
      }),
    );
    expect(screen.getByText(/No charge or deposit deduction exists/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('hides unauthorized commands and excludes non-maintenance cases', () => {
    const data = sample();
    data.canAssessMaintenance = false;
    page(data);
    expect(screen.queryByRole('button', { name: 'Record responsibility' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Accept proposed cost' })).toBeNull();
    cleanup();
    page({ ...data, type: 'GENERAL' });
    expect(screen.queryByRole('heading', { name: 'Maintenance responsibility' })).toBeNull();
  });
});
