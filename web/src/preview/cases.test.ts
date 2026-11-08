import axios from 'axios';
import { beforeEach, describe, expect, it } from 'vitest';
import { previewAdapter, resetPreview } from './adapter';
const client = (role: string) =>
  axios.create({ adapter: previewAdapter, headers: { Authorization: 'Bearer preview:' + role } });
const tenant = client('TENANT');
const manager = client('LEASING_MANAGER');
const admin = client('ADMIN');
beforeEach(resetPreview);
describe('synthetic case workflow', () => {
  it('keeps draft requests private until an explicit tenant submission', async () => {
    const draft = (
      await tenant.post('/requests', {
        contractId: 'contract-1',
        clientId: crypto.randomUUID(),
        type: 'GENERAL',
        title: 'Private draft',
        description: 'Draft contents',
        draft: true,
      })
    ).data;
    await expect(manager.get('/requests/' + draft.id)).rejects.toMatchObject({
      response: { status: 404 },
    });
    expect(draft.canMessage).toBe(false);
    const submitted = (
      await tenant.post('/requests/' + draft.id + '/respond', {
        clientId: crypto.randomUUID(),
        status: 'SUBMITTED',
        expectedVersion: 1,
      })
    ).data;
    expect(submitted.events).toHaveLength(2);
    expect((await manager.get('/requests/' + draft.id)).data.status).toBe('SUBMITTED');
  });
  it('persists a submission once and excludes unsupported types', async () => {
    expect((await tenant.get('/requests/options')).data.types).toEqual([
      'MAINTENANCE',
      'NEIGHBOR_COMPLAINT',
      'KEY_LOCK_CHANGE',
      'GENERAL',
    ]);
    const body = {
      contractId: 'contract-1',
      clientId: crypto.randomUUID(),
      type: 'GENERAL',
      title: 'Synthetic report',
      description: 'Synthetic private details',
    };
    const first = await tenant.post('/requests', body);
    const second = await tenant.post('/requests', body);
    expect(first.data.id).toBe(second.data.id);
    expect(second.data.events).toHaveLength(1);
    expect(
      (await manager.get('/requests', { params: { q: 'Synthetic report', type: 'GENERAL' } })).data,
    ).toHaveLength(1);
    await expect(tenant.post('/requests', { ...body, title: 'Altered' })).rejects.toMatchObject({
      response: { status: 409 },
    });
    await expect(tenant.post('/requests', { ...body, type: 'MOVE_OUT' })).rejects.toMatchObject({
      response: { status: 409 },
    });
    await expect(admin.get('/requests')).rejects.toMatchObject({ response: { status: 403 } });
    await expect(manager.post('/requests', body)).rejects.toMatchObject({
      response: { status: 403 },
    });
  });
  it('requires tenant acknowledgement and rejects stale or forbidden decisions', async () => {
    const path = '/requests/request-1/respond';
    const transition = async (status: string, version: number, actor = manager) =>
      (
        await actor.post(path, {
          clientId: crypto.randomUUID(),
          status,
          expectedVersion: version,
          message: 'Synthetic explanation',
        })
      ).data;
    await transition('IN_PROGRESS', 1);
    const resolved = await transition('RESOLVED', 2);
    await expect(transition('CLOSED', 3)).rejects.toMatchObject({ response: { status: 409 } });
    await expect(transition('APPROVED', 3, tenant)).rejects.toMatchObject({
      response: { status: 403 },
    });
    await expect(transition('REOPENED', 2, tenant)).rejects.toMatchObject({
      response: { status: 409 },
    });
    await transition('ACCEPTED', 3, tenant);
    const closed = await transition('CLOSED', 4);
    expect(closed.resolvedAt).toBe(resolved.resolvedAt);
    await expect(
      tenant.post('/requests/request-1/messages', {
        clientId: crypto.randomUUID(),
        message: 'Blocked',
      }),
    ).rejects.toMatchObject({ response: { status: 409 } });
    const reopened = await transition('REOPENED', 5, tenant);
    expect(reopened.events).toHaveLength(6);
    expect(reopened.events[5].actorName).toBe('Demo Tenant');
  });
  it('replays messages without duplicates and preserves legacy records without fictional authors', async () => {
    const body = { clientId: crypto.randomUUID(), message: 'Synthetic message' };
    await manager.post('/requests/request-1/messages', body);
    const replay = await manager.post('/requests/request-1/messages', body);
    expect(replay.data.version).toBe(2);
    expect(replay.data.events).toHaveLength(2);
    expect(JSON.stringify(replay.data)).not.toContain('clientId');
    await expect(
      manager.post('/requests/request-1/messages', { ...body, message: 'Changed' }),
    ).rejects.toMatchObject({ response: { status: 409 } });
    const store = JSON.parse(localStorage.getItem('leaseflow-preview-data-v1')!);
    delete store.requests[0].events;
    delete store.requests[0].version;
    localStorage.setItem('leaseflow-preview-data-v1', JSON.stringify(store));
    const legacy = (await tenant.get('/requests/request-1')).data;
    expect(legacy.events).toEqual([]);
    expect(legacy.version).toBe(0);
  });
});
