import type { DistrictId } from '@shared/map';
import { FilamentRoom } from './FilamentRoom.js';

/**
 * The Stacks — the vertical quarter where Sparks live (districts block
 * D1). Same authoritative brain as the Filament with the district
 * switched: dense alley junk, Signal shrines at street level and on the
 * Roofline, no mobs (people live here), no Scrapcache rules.
 */
export class StacksRoom extends FilamentRoom {
  protected override districtId: DistrictId = 'stacks';
}
