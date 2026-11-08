import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const send = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-s3', async (original) => {
  const actual = await original<typeof import('@aws-sdk/client-s3')>();
  return {
    ...actual,
    S3Client: class {
      send = send;
    },
  };
});
import { privateStorage } from '../src/file-storage.js';
import { fileConfig } from '../src/file-policy.js';
const oldProvider = fileConfig.S3_PROVIDER;
const ownerAcl = {
  Owner: { ID: 'owner' },
  Grants: [{ Grantee: { Type: 'CanonicalUser', ID: 'owner' }, Permission: 'FULL_CONTROL' }],
};
beforeEach(() => {
  fileConfig.S3_PROVIDER = 's3';
  send.mockReset();
  send.mockImplementation(async (command) => {
    if (command.constructor.name === 'GetBucketPolicyCommand')
      throw Object.assign(new Error('No policy'), { name: 'NoSuchBucketPolicy' });
    if (command.constructor.name === 'GetBucketAclCommand') return ownerAcl;
    return {};
  });
});
afterEach(() => {
  fileConfig.S3_PROVIDER = oldProvider;
});
describe('private bucket verification by explicit provider', () => {
  it('accepts an S3 owner-only ACL without a bucket policy', async () => {
    await expect(privateStorage.verify()).resolves.toBeUndefined();
  });
  it.each([
    {
      Owner: { ID: 'owner' },
      Grants: [
        {
          Grantee: { Type: 'Group', URI: 'http://acs.amazonaws.com/groups/global/AllUsers' },
          Permission: 'READ',
        },
      ],
    },
    {
      Owner: { ID: 'owner' },
      Grants: [{ Grantee: { Type: 'CanonicalUser', ID: 'foreign' }, Permission: 'FULL_CONTROL' }],
    },
    { Grants: [{ Grantee: { Type: 'CanonicalUser' }, Permission: 'FULL_CONTROL' }] },
  ])('rejects public, foreign, or ambiguous S3 ACLs', async (acl) => {
    send.mockImplementation(async (command) => {
      if (command.constructor.name === 'GetBucketPolicyCommand')
        throw Object.assign(new Error(), { name: 'NoSuchBucketPolicy' });
      return command.constructor.name === 'GetBucketAclCommand' ? acl : {};
    });
    await expect(privateStorage.verify()).rejects.toThrow('Private bucket ACL is required');
  });
  it('verifies MinIO policy without trust in its dummy ACL', async () => {
    fileConfig.S3_PROVIDER = 'minio';
    await expect(privateStorage.verify()).resolves.toBeUndefined();
    expect(send.mock.calls.map(([command]) => command.constructor.name)).not.toContain(
      'GetBucketAclCommand',
    );
  });
  it('rejects a configured bucket policy for either provider', async () => {
    fileConfig.S3_PROVIDER = 'minio';
    send.mockImplementation(async (command) =>
      command.constructor.name === 'GetBucketPolicyCommand' ? { Policy: '{"public":true}' } : {},
    );
    await expect(privateStorage.verify()).rejects.toThrow(
      'Storage bucket policies require explicit deployment review',
    );
  });
  it('never treats a permission or network error as an absent policy', async () => {
    send.mockImplementation(async (command) => {
      if (command.constructor.name === 'GetBucketPolicyCommand')
        throw Object.assign(new Error('Denied'), { name: 'AccessDenied' });
      return {};
    });
    await expect(privateStorage.verify()).rejects.toThrow('Denied');
  });
});
