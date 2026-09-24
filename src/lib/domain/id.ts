import { v4 as uuidv4 } from 'uuid';

/**
 * Canonical identifier for syncable domain records (products, orders, stock
 * movements). Generated client-side so a record has a stable cross-device
 * identity before it ever reaches the sync server.
 */
export function generateId(): string {
    return uuidv4();
}
