import { api } from '../services/api';
import { NotificationToast } from '../components/NotificationToast';

export interface OnboardingEvents { onComplete: () => void; }

/** First-launch device identity enrollment. No credential field is accepted here. */
export class OnboardingPage {
  private container = document.createElement('div');
  private username = '';
  private bio = '';
  private isPublic = true;
  private events: OnboardingEvents;
  constructor(events: OnboardingEvents) { this.events = events; this.container.className = 'animate-fade-in'; }
  public async render(): Promise<HTMLElement> { this.draw(); return this.container; }
  private draw() {
    this.container.innerHTML = `<div style="width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 30%,#1e1b4b 0%,#090a0f 70%);padding:24px"><section class="modal-content animate-scale-in" style="max-width:500px;width:100%;padding:32px"><h1 style="margin:0 0 10px">Create your Voxel⁺ identity</h1><p style="color:var(--text-secondary)">This installation will generate a device-bound Ed25519 keypair. The private key stays encrypted in Windows secure storage and never leaves this device.</p><p style="color:var(--text-secondary)">There is no password, email login, or cross-device recovery. A different device gets a different identity.</p><label>PUBLIC USERNAME<input id="vp-username" class="input-field" placeholder="3–20 letters, numbers, or _" style="width:100%;margin:8px 0 16px" /></label><label>BIO (OPTIONAL)<textarea id="vp-bio" class="input-field" style="width:100%;margin:8px 0 16px"></textarea></label><label style="display:flex;gap:8px;align-items:center"><input id="vp-public" type="checkbox" checked /> Show my Player Card publicly</label><div id="vp-error" style="color:#ff8794;margin:14px 0"></div><button id="vp-submit" class="btn btn-primary" style="width:100%;padding:12px;margin-top:10px">GENERATE DEVICE IDENTITY →</button></section></div>`;
    const username = this.container.querySelector('#vp-username') as HTMLInputElement;
    const bio = this.container.querySelector('#vp-bio') as HTMLTextAreaElement;
    const pub = this.container.querySelector('#vp-public') as HTMLInputElement;
    const error = this.container.querySelector('#vp-error') as HTMLElement;
    (this.container.querySelector('#vp-submit') as HTMLButtonElement).onclick = async () => {
      this.username = username.value.trim(); this.bio = bio.value; this.isPublic = pub.checked;
      try {
        await api.createDeviceIdentity();
        const status = await api.getDeviceIdentityStatus();
        if (status.exists && await api.getCurrentSession()) { await api.authenticateDevice(); this.events.onComplete(); return; }
        await api.createAccount({ username: this.username, bio: this.bio, isPublic: this.isPublic });
        this.events.onComplete();
      } catch (e: any) { error.textContent = e?.message || 'Device registration failed.'; NotificationToast.show(error.textContent, 'error'); }
    };
  }
}
