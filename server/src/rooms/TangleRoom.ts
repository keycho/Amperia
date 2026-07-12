import type { DistrictId } from '@shared/map';
import { FilamentRoom } from './FilamentRoom.js';

/**
 * The Tangle — wire-maze outskirts. Same authoritative brain as the
 * Filament with the district switched: denser nodes, more Scuttlebots,
 * the first Junkhounds, no Dynamo warmth, and Scrapcache death rules.
 * PvE only.
 */
export class TangleRoom extends FilamentRoom {
  protected override districtId: DistrictId = 'tangle';
}
