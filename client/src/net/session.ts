import type { FilamentRoom } from './NetClient';

/** The active room connection, shared by scenes (set on join). */
export const session: { room: FilamentRoom | null } = { room: null };
