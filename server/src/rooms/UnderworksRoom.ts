import type { DistrictId } from '@shared/map';
import { FilamentRoom } from './FilamentRoom.js';

/**
 * The Underworks — the dark district under the north deck (U-block).
 * Same authoritative brain as the Filament with the district switched:
 * the ruins of the Old Works, chasm catwalks, the densest Amperite in
 * the game, and near-zero ambient light — the darkness itself (U1) is
 * server-enforced through the lamp-radius interaction gate.
 */
export class UnderworksRoom extends FilamentRoom {
  protected override districtId: DistrictId = 'underworks';
}
