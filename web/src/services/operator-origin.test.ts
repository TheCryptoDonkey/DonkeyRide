import { beforeEach, describe, expect, it } from 'vitest';
import {
  getSelectedOperatorBase,
  safeOperatorOrigin,
  setSelectedOperatorBase,
} from './operator-origin';

describe('operator origin', () => {
  beforeEach(() => localStorage.clear());

  it('accepts https and loopback http but rejects arbitrary insecure origins', () => {
    expect(safeOperatorOrigin('https://rides.example/path')).toBe('https://rides.example');
    expect(safeOperatorOrigin('http://localhost:3100/path')).toBe('http://localhost:3100');
    expect(safeOperatorOrigin('http://rides.example')).toBeNull();
    expect(safeOperatorOrigin('javascript:alert(1)')).toBeNull();
  });

  it('persists a runtime-selected operator', () => {
    setSelectedOperatorBase('https://operator.example/api');
    expect(getSelectedOperatorBase()).toBe('https://operator.example');
  });
});
