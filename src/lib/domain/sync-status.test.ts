import { describe, expect, it } from 'vitest';
import { summarizeSyncStatus } from './sync-status';

describe('summarizeSyncStatus', () => {
    it('reports offline when the device has no connection, regardless of pending work', () => {
        expect(summarizeSyncStatus({ pending: 0, rejected: 0 }, false)).toBe('offline');
        expect(summarizeSyncStatus({ pending: 3, rejected: 0 }, false)).toBe('offline');
    });

    it('reports error when anything was rejected by the server, even while online with no pending work', () => {
        expect(summarizeSyncStatus({ pending: 0, rejected: 1 }, true)).toBe('error');
    });

    it('reports error ahead of offline — a rejected record needs attention regardless of connectivity', () => {
        expect(summarizeSyncStatus({ pending: 0, rejected: 1 }, false)).toBe('error');
    });

    it('reports pending when online with unsynced work and nothing rejected', () => {
        expect(summarizeSyncStatus({ pending: 2, rejected: 0 }, true)).toBe('pending');
    });

    it('reports synced when online with nothing pending or rejected', () => {
        expect(summarizeSyncStatus({ pending: 0, rejected: 0 }, true)).toBe('synced');
    });
});
