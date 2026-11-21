import { describe, expect, it } from 'vitest';
import { apiBase } from './api-base';

describe('API base configuration', () => {
  it('normalizes approved local and external API roots', () => {
    expect(apiBase()).toBe('/api/v1');
    expect(apiBase('/api/v1/')).toBe('/api/v1');
    expect(apiBase('https://api.example.com/api/v1/')).toBe('https://api.example.com/api/v1');
  });
  it.each([
    '//example.com/api/v1',
    'https://user:password@example.com/api/v1',
    'https://example.com/api/v1?secret=value',
    'https://example.com/v1',
    'javascript:alert(1)',
  ])('rejects an invalid API root %s', (value) => {
    expect(() => apiBase(value)).toThrow(/VITE_API_URL/);
  });
});
