import Phaser from 'phaser';
import { DISTRICT_KEY, rememberedDistrict, TOKEN_KEY } from '../net/NetClient';
import { showLoginOverlay } from '../ui/loginOverlay';
import { bootDone } from '../boot/bootLoader';

/** Wallet-only sign-in, or read-only spectate (W7); a stored token skips both. */
export class LoginScene extends Phaser.Scene {
  constructor() {
    super('login');
  }

  create(): void {
    // P4: the first real scene is up (assets loaded + baked) — fade the boot
    // loader out. Sign-in overlay or the world's connecting screen paints under it.
    bootDone();
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored !== null && stored !== '') {
      this.scene.start('world', { token: stored, district: rememberedDistrict() });
      return;
    }
    void showLoginOverlay().then((choice) => {
      if (choice.kind === 'spectate') {
        // No wallet, no account — spectate the spawn district read-only.
        this.scene.start('world', { spectate: true, district: 'filament' });
        return;
      }
      const { auth } = choice;
      localStorage.setItem(TOKEN_KEY, auth.token);
      localStorage.setItem(DISTRICT_KEY, auth.district);
      this.scene.start('world', { token: auth.token, district: auth.district });
    });
  }
}
