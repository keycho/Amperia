import type { DistrictId } from '@shared/map';
import { FilamentRoom } from './FilamentRoom.js';

/**
 * The Terrarium — the hanging-garden tier (districts block D2). Same
 * authoritative brain as the Filament with the district switched: the
 * peaceful scavenge (compost heaps, herb/seed rares), Loftpod berths,
 * NO mobs, no Scrapcache. The gentlest room in the city.
 */
export class TerrariumRoom extends FilamentRoom {
  protected override districtId: DistrictId = 'terrarium';
}
