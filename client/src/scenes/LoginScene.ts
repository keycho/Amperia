import Phaser from 'phaser';
import { DISTRICT_KEY, rememberedDistrict, TOKEN_KEY } from '../net/NetClient';
import { showLoginOverlay } from '../ui/loginOverlay';

/** Email-first sign-in (guest allowed); a stored token skips the overlay. */
export class LoginScene extends Phaser.Scene {
  constructor() {
    super('login');
  }

  create(): void {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored !== null && stored !== '') {
      this.scene.start('world', { token: stored, district: rememberedDistrict() });
      return;
    }
    void showLoginOverlay().then((r) => {
      localStorage.setItem(TOKEN_KEY, r.token);
      localStorage.setItem(DISTRICT_KEY, r.district);
      this.scene.start('world', { token: r.token, district: r.district });
    });
  }
}
