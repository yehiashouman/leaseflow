import { beforeEach, describe, expect, it } from 'vitest';
import axios from 'axios';
import { previewAdapter, resetPreview } from './adapter';

const client = axios.create({
  adapter: previewAdapter,
  headers: { Authorization: 'Bearer preview:LEASING_MANAGER' },
});
beforeEach(resetPreview);
describe('isolated preview data', () => {
  it('archives, filters, restores, and links synthetic landlord details', async () => {
    const response = await client.post('/inventory/landlords', {
      name: 'Archive Owner',
      companyName: 'Archive Company',
      preferredContactMethod: 'EMAIL',
    });
    const id = response.data.id;
    await client.post('/inventory/landlords/' + id + '/archive');
    expect(
      (await client.get('/inventory/landlords')).data.some(
        (item: { id: string }) => item.id === id,
      ),
    ).toBe(false);
    expect(
      (
        await client.get('/inventory/landlords', {
          params: { status: 'ARCHIVED', q: 'Archive Company' },
        })
      ).data,
    ).toHaveLength(1);
    await expect(
      client.post('/inventory/units', {
        name: 'Blocked Unit',
        area: 'Dubai',
        landlordId: id,
        declarationAccepted: true,
      }),
    ).rejects.toMatchObject({ response: { status: 404 } });
    await client.post('/inventory/landlords/' + id + '/restore');
    await client.post('/inventory/units', {
      name: 'Restored Unit',
      area: 'Dubai',
      landlordId: id,
      declarationAccepted: true,
    });
    expect((await client.get('/inventory/landlords/' + id)).data.units).toHaveLength(1);
  });
  it('blocks archive of linked landlords and edits of archived landlords', async () => {
    await expect(client.post('/inventory/landlords/landlord-1/archive')).rejects.toMatchObject({
      response: { status: 409 },
    });
    const created = await client.post('/inventory/landlords', { name: 'Archived Owner' });
    await client.post('/inventory/landlords/' + created.data.id + '/archive');
    await expect(
      client.patch('/inventory/landlords/' + created.data.id, { name: 'Forbidden Edit' }),
    ).rejects.toMatchObject({ response: { status: 409 } });
  });
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
  it('persists vacant room edits, maintenance, inactivity, and restoration', async () => {
    const created = await client.post('/inventory/units/unit-1/spaces', {
      name: 'Room B',
      type: 'ROOM',
      capacity: 1,
    });
    for (const availability of ['MAINTENANCE', 'INACTIVE', 'ACTIVE']) {
      const result = await client.patch('/inventory/spaces/' + created.data.id, {
        name: 'Room Beta',
        type: 'ROOM',
        capacity: 2,
        askingRent: '2500',
        availability,
      });
      expect(result.data.status).toBe(availability === 'ACTIVE' ? 'AVAILABLE' : availability);
      expect(result.data.enabled).toBe(availability !== 'INACTIVE');
    }
    const detail = await client.get('/inventory/units/unit-1');
    expect(
      detail.data.spaces.find((space: { id: string }) => space.id === created.data.id).name,
    ).toBe('Room Beta');
  });
  it('rejects occupied-room holds and preserves contract rent after a price edit', async () => {
    const body = {
      name: 'Master Room',
      type: 'MASTER_ROOM',
      capacity: 2,
      askingRent: 4000,
      amenities: { privateBathroom: true },
    };
    await expect(
      client.patch('/inventory/spaces/space-1', { ...body, availability: 'MAINTENANCE' }),
    ).rejects.toMatchObject({ response: { status: 409 } });
    await client.patch('/inventory/spaces/space-1', { ...body, availability: 'ACTIVE' });
    expect((await client.get('/contracts')).data[0].monthlyRent).toBe('3500');
    const tenant = axios.create({
      adapter: previewAdapter,
      headers: { Authorization: 'Bearer preview:TENANT' },
    });
    await expect(
      tenant.patch('/inventory/spaces/space-1', { ...body, availability: 'ACTIVE' }),
    ).rejects.toMatchObject({ response: { status: 403 } });
  });
});
