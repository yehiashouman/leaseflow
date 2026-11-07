import { beforeEach, describe, expect, it } from 'vitest';
import axios from 'axios';
import { previewAdapter, resetPreview } from './adapter';

const client = axios.create({
  adapter: previewAdapter,
  headers: { Authorization: 'Bearer preview:LEASING_MANAGER' },
});
beforeEach(resetPreview);
describe('isolated preview data', () => {
  it('creates, edits, and persists a landlord without a network request', async () => {
    const created = await client.post('/inventory/landlords', {
      name: 'Demo Owner Two',
      email: 'two@preview.invalid',
    });
    await client.patch('/inventory/landlords/' + created.data.id, { name: 'Updated Owner' });
    const rows = await client.get('/inventory/landlords');
    expect(rows.data.some((item: { name: string }) => item.name === 'Updated Owner')).toBe(true);
  });
  it('creates a draft unit and a room and exposes them through detail', async () => {
    const unit = await client.post('/inventory/units', {
      name: 'Demo Unit Two',
      area: 'Demo Area',
      declarationAccepted: true,
    });
    expect(unit.data.active).toBe(false);
    await client.post('/inventory/units/' + unit.data.id + '/spaces', {
      name: 'Room A',
      type: 'ROOM',
      capacity: 1,
    });
    const detail = await client.get('/inventory/units/' + unit.data.id);
    expect(detail.data.spaces).toHaveLength(1);
  });
  it('rejects disabled accommodation and invalid master rooms', async () => {
    await expect(
      client.post('/inventory/units/unit-1/spaces', {
        name: 'Bed',
        type: 'BED_SPACE',
        capacity: 1,
      }),
    ).rejects.toMatchObject({ response: { status: 422 } });
    await expect(
      client.post('/inventory/units/unit-1/spaces', {
        name: 'Master',
        type: 'MASTER_ROOM',
        capacity: 1,
      }),
    ).rejects.toMatchObject({ response: { status: 422 } });
  });
  it('enforces role separation in the demo and refuses unsupported writes', async () => {
    await expect(client.get('/dashboard/admin')).rejects.toMatchObject({
      response: { status: 403 },
    });
    await expect(client.post('/payments', {})).rejects.toMatchObject({ response: { status: 501 } });
  });
  it('reset restores fixtures without deletion of real application storage', async () => {
    sessionStorage.setItem('accessToken', 'real-session-example');
    localStorage.setItem('unrelated', 'retain');
    await client.post('/inventory/landlords', { name: 'Temporary Demo' });
    resetPreview();
    expect((await client.get('/inventory/landlords')).data).toHaveLength(1);
    expect(sessionStorage.getItem('accessToken')).toBe('real-session-example');
    expect(localStorage.getItem('unrelated')).toBe('retain');
  });
});
