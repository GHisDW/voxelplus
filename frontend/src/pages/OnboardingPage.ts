import { api } from '../services/api';
import { NotificationToast } from '../components/NotificationToast';
import { MINECRAFT_AVATARS, getAvatarDataUrl } from '../assets/minecraftAvatars';
import { COSMETIC_ITEMS, getCosmeticDef } from '../assets/cosmeticAssets';

export interface OnboardingEvents {
  onComplete: () => void;
}

export class OnboardingPage {
  private mode: 'signup' | 'login' = 'signup';
  private currentStep: number = 1;
  private totalSteps: number = 8;
  private events: OnboardingEvents;
  private container: HTMLElement;

  // Form State
  private username: string = '';
  private password: string = '';
  private confirmPassword: string = '';
  private avatarType: 'preset' | 'custom' = 'preset';
  private selectedPreset: string = 'avatar_steve';
  private customAvatarBuffer: ArrayBuffer | null = null;
  private customAvatarName: string = '';
  private customAvatarMime: string = '';
  private customAvatarPreviewUrl: string = '';
  private bio: string = '';
  private selectedCosmeticId: string = 'dirt_block';
  private isPublic: boolean = true;

  // Login Form State
  private loginUsername: string = '';
  private loginPassword: string = '';

  private isSubmitting: boolean = false;
  private errorMessage: string = '';

  private cosmeticsPresets = COSMETIC_ITEMS;

  constructor(events: OnboardingEvents) {
    this.events = events;
    this.container = document.createElement('div');
    this.container.className = 'animate-fade-in';
    this.container.style.cssText = `
      width: 100vw;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 30%, #1e1b4b 0%, #090a0f 70%);
      position: absolute;
      inset: 0;
      z-index: 50;
      padding: 24px;
      overflow-y: auto;
    `;
  }

  public async render(): Promise<HTMLElement> {
    this.renderCurrentView();
    return this.container;
  }

  private renderCurrentView(): void {
    this.container.innerHTML = '';

    if (this.mode === 'login') {
      this.renderLoginCard();
    } else {
      this.renderSignupCard();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // SIGN IN VIEW
  // ─────────────────────────────────────────────────────────────

  private renderLoginCard(): void {
    const card = document.createElement('div');
    card.className = 'modal-content animate-scale-in';
    card.style.cssText = `
      max-width: 440px;
      width: 100%;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-xl);
      padding: 32px 28px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.6);
    `;

    card.innerHTML = `
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="
          width: 56px;
          height: 56px;
          border-radius: var(--radius-lg);
          background: var(--accent-gradient);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 1.8rem;
          font-weight: 900;
          color: white;
          box-shadow: 0 8px 24px var(--accent-glow);
          margin-bottom: 14px;
        ">
          V
        </div>
        <h2 style="font-size: 1.6rem; font-weight: 800; color: var(--text-primary);">Sign In to Voxel⁺</h2>
        <p style="font-size: 0.88rem; color: var(--text-secondary); margin-top: 4px;">
          Enter your Voxel⁺ username and password to restore your cloud session.
        </p>
      </div>

      ${this.errorMessage ? `
        <div style="
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: var(--radius-md);
          padding: 10px 14px;
          color: #f87171;
          font-size: 0.85rem;
          margin-bottom: 16px;
        ">
          ${this.errorMessage}
        </div>
      ` : ''}

      <form id="form-login" style="display: flex; flex-direction: column; gap: 16px;">
        <div>
          <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 6px;">
            USERNAME
          </label>
          <input type="text" id="login-username" class="input-field" placeholder="e.g. notch" value="${this.loginUsername}" style="width: 100%;" required />
        </div>

        <div>
          <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 6px;">
            PASSWORD
          </label>
          <input type="password" id="login-password" class="input-field" placeholder="••••••••" value="${this.loginPassword}" style="width: 100%;" required />
        </div>

        <button type="submit" class="btn btn-primary" id="btn-submit-login" style="width: 100%; padding: 12px; margin-top: 8px; font-weight: 700;" ${this.isSubmitting ? 'disabled' : ''}>
          ${this.isSubmitting ? 'Signing In...' : 'SIGN IN →'}
        </button>
      </form>

      <div style="text-align: center; margin-top: 20px; font-size: 0.85rem; color: var(--text-secondary);">
        Need an account?
        <a href="#" id="link-goto-signup" style="color: var(--accent-primary); font-weight: 700; text-decoration: none; margin-left: 4px;">
          Create a Voxel⁺ Account
        </a>
      </div>
    `;

    const form = card.querySelector('#form-login') as HTMLFormElement;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const u = (card.querySelector('#login-username') as HTMLInputElement).value.trim();
      const p = (card.querySelector('#login-password') as HTMLInputElement).value;
      if (!u || !p) return;

      this.isSubmitting = true;
      this.errorMessage = '';
      this.loginUsername = u;
      this.loginPassword = p;
      this.renderCurrentView();

      try {
        await api.loginAccount(u, p);
        NotificationToast.show(`Welcome back, @${u}!`, 'success');
        this.events.onComplete();
      } catch (err: any) {
        this.isSubmitting = false;
        this.errorMessage = err.message || 'Invalid username or password.';
        this.renderCurrentView();
      }
    };

    (card.querySelector('#link-goto-signup') as HTMLElement).onclick = (e) => {
      e.preventDefault();
      this.mode = 'signup';
      this.errorMessage = '';
      this.currentStep = 1;
      this.renderCurrentView();
    };

    this.container.appendChild(card);
  }

  // ─────────────────────────────────────────────────────────────
  // MULTI-STEP SIGNUP VIEW
  // ─────────────────────────────────────────────────────────────

  private renderSignupCard(): void {
    const card = document.createElement('div');
    card.className = 'modal-content animate-scale-in';
    card.style.cssText = `
      max-width: 580px;
      width: 100%;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-xl);
      padding: 32px 30px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.6);
      display: flex;
      flex-direction: column;
      gap: 20px;
    `;

    // Progress Bar (Steps 2 to 8)
    if (this.currentStep > 1) {
      const pct = Math.round(((this.currentStep - 1) / (this.totalSteps - 1)) * 100);
      const prog = document.createElement('div');
      prog.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 0.78rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px;">
          <span>STEP ${this.currentStep} OF ${this.totalSteps}</span>
          <span>${pct}% COMPLETED</span>
        </div>
        <div style="height: 6px; background: rgba(255,255,255,0.06); border-radius: var(--radius-full); overflow: hidden;">
          <div style="height: 100%; width: ${pct}%; background: var(--accent-gradient); transition: width 0.3s ease;"></div>
        </div>
      `;
      card.appendChild(prog);
    }

    if (this.errorMessage) {
      const errBox = document.createElement('div');
      errBox.style.cssText = `
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: var(--radius-md);
        padding: 10px 14px;
        color: #f87171;
        font-size: 0.85rem;
      `;
      errBox.textContent = this.errorMessage;
      card.appendChild(errBox);
    }

    // Step contents
    if (this.currentStep === 1) {
      // Step 1: Welcome
      card.innerHTML += `
        <div style="text-align: center; padding: 20px 12px;">
          <div style="
            width: 72px;
            height: 72px;
            border-radius: var(--radius-lg);
            background: var(--accent-gradient);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 2.4rem;
            font-weight: 900;
            color: white;
            box-shadow: 0 10px 28px var(--accent-glow);
            margin-bottom: 18px;
          ">
            V
          </div>
          <div class="brand-title" style="font-size: 2.2rem; justify-content: center; margin-bottom: 8px;">
            VOXEL<span class="plus-badge">⁺</span>
          </div>
          <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--text-primary); margin-bottom: 12px;">
            Minecraft Development, Cloud Connected.
          </h3>
          <p style="color: var(--text-secondary); font-size: 0.95rem; line-height: 1.6; max-width: 440px; margin: 0 auto 28px;">
            Create your player identity to synchronize your workspace, manage Minecraft instances, discover content, and unlock achievements.
          </p>

          <button class="btn btn-primary" id="btn-start-onboarding" style="padding: 12px 36px; font-size: 1.05rem; font-weight: 700;">
            CREATE ACCOUNT →
          </button>

          <div style="margin-top: 24px; font-size: 0.88rem; color: var(--text-secondary);">
            Already have an account?
            <a href="#" id="link-to-signin" style="color: var(--accent-primary); font-weight: 700; text-decoration: none; margin-left: 4px;">
              Sign In
            </a>
          </div>
        </div>
      `;

      (card.querySelector('#btn-start-onboarding') as HTMLElement).onclick = () => {
        this.currentStep = 2;
        this.errorMessage = '';
        this.renderCurrentView();
      };
      (card.querySelector('#link-to-signin') as HTMLElement).onclick = (e) => {
        e.preventDefault();
        this.mode = 'login';
        this.errorMessage = '';
        this.renderCurrentView();
      };

    } else if (this.currentStep === 2) {
      // Step 2: Choose Username
      card.innerHTML += `
        <div>
          <h3 style="font-size: 1.4rem; font-weight: 800; color: var(--text-primary);">Choose your Username</h3>
          <p style="font-size: 0.88rem; color: var(--text-secondary); margin-top: 4px;">
            This is your unique Voxel⁺ gamer tag. No email or phone number required.
          </p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 6px;">
              USERNAME
            </label>
            <input type="text" id="input-username" class="input-field" placeholder="e.g. Steve_Crafts" value="${this.username}" style="width: 100%;" autofocus />
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted);">
            3 to 20 characters · Alphanumeric, underscores, and hyphens only
          </div>
        </div>

        <div class="modal-footer" style="display: flex; justify-content: space-between; margin-top: 10px;">
          <button class="btn btn-secondary" id="btn-back">← Back</button>
          <button class="btn btn-primary" id="btn-next">Continue →</button>
        </div>
      `;

      const input = card.querySelector('#input-username') as HTMLInputElement;
      input.oninput = () => { this.username = input.value.trim(); };

      (card.querySelector('#btn-back') as HTMLElement).onclick = () => {
        this.currentStep = 1;
        this.renderCurrentView();
      };
      (card.querySelector('#btn-next') as HTMLElement).onclick = () => {
        if (this.username.length < 3 || this.username.length > 20) {
          this.errorMessage = 'Username must be between 3 and 20 characters.';
          this.renderCurrentView();
          return;
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(this.username)) {
          this.errorMessage = 'Username can only contain letters, numbers, hyphens, and underscores.';
          this.renderCurrentView();
          return;
        }
        this.errorMessage = '';
        this.currentStep = 3;
        this.renderCurrentView();
      };

    } else if (this.currentStep === 3) {
      // Step 3: Password
      card.innerHTML += `
        <div>
          <h3 style="font-size: 1.4rem; font-weight: 800; color: var(--text-primary);">Set your Password</h3>
          <p style="font-size: 0.88rem; color: var(--text-secondary); margin-top: 4px;">
            Choose a strong password. Because Voxel⁺ does not collect emails, password recovery is not possible.
          </p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 14px;">
          <div>
            <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 6px;">
              PASSWORD
            </label>
            <input type="password" id="input-password" class="input-field" placeholder="At least 6 characters" value="${this.password}" style="width: 100%;" />
          </div>
          <div>
            <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 6px;">
              CONFIRM PASSWORD
            </label>
            <input type="password" id="input-confirm-pass" class="input-field" placeholder="Repeat your password" value="${this.confirmPassword}" style="width: 100%;" />
          </div>
        </div>

        <div class="modal-footer" style="display: flex; justify-content: space-between; margin-top: 10px;">
          <button class="btn btn-secondary" id="btn-back">← Back</button>
          <button class="btn btn-primary" id="btn-next">Continue →</button>
        </div>
      `;

      const pInput = card.querySelector('#input-password') as HTMLInputElement;
      const cpInput = card.querySelector('#input-confirm-pass') as HTMLInputElement;

      pInput.oninput = () => { this.password = pInput.value; };
      cpInput.oninput = () => { this.confirmPassword = cpInput.value; };

      (card.querySelector('#btn-back') as HTMLElement).onclick = () => {
        this.currentStep = 2;
        this.renderCurrentView();
      };
      (card.querySelector('#btn-next') as HTMLElement).onclick = () => {
        if (this.password.length < 6) {
          this.errorMessage = 'Password must be at least 6 characters long.';
          this.renderCurrentView();
          return;
        }
        if (this.password !== this.confirmPassword) {
          this.errorMessage = 'Passwords do not match.';
          this.renderCurrentView();
          return;
        }
        this.errorMessage = '';
        this.currentStep = 4;
        this.renderCurrentView();
      };

    } else if (this.currentStep === 4) {
      // Step 4: Profile Picture
      const presets = Object.values(MINECRAFT_AVATARS);

      card.innerHTML += `
        <div>
          <h3 style="font-size: 1.4rem; font-weight: 800; color: var(--text-primary);">Choose Profile Picture</h3>
          <p style="font-size: 0.88rem; color: var(--text-secondary); margin-top: 4px;">
            Upload your own custom image (< 2 MB) or choose an official Minecraft avatar.
          </p>
        </div>

        <!-- Custom Upload Section -->
        <div style="display: flex; align-items: center; gap: 16px; padding: 16px; background: var(--bg-surface); border-radius: var(--radius-lg); border: 1px solid var(--border-subtle);">
          <div style="
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: var(--bg-card);
            border: 2px solid var(--accent-primary);
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          ">
            ${this.customAvatarPreviewUrl ? `<img src="${this.customAvatarPreviewUrl}" style="width: 100%; height: 100%; object-fit: cover;" />` : `<img src="${getAvatarDataUrl(this.selectedPreset)}" style="width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated;" />`}
          </div>

          <div style="flex: 1;">
            <input type="file" id="onboard-file-input" accept="image/png,image/jpeg,image/webp,image/gif" style="display: none;" />
            <button class="btn btn-secondary" id="btn-choose-file" style="padding: 8px 16px; font-size: 0.85rem;">
              ${this.customAvatarPreviewUrl ? 'Change Custom Image' : 'Upload Custom Image'}
            </button>
            <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 4px;">
              ${this.customAvatarName ? `Selected: ${this.customAvatarName}` : 'PNG, JPEG, WebP, GIF up to 2MB'}
            </div>
          </div>
        </div>

        <div style="text-align: center; color: var(--text-muted); font-size: 0.82rem; font-weight: 700;">
          — OR CHOOSE AN AUTHENTIC MINECRAFT AVATAR —
        </div>

        <!-- Presets Grid -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
          ${presets.map(p => `
            <div class="horizontal-card" data-preset="${p.id}" style="
              padding: 10px 12px;
              border-radius: var(--radius-md);
              background: var(--bg-card);
              border: 1px solid ${this.avatarType === 'preset' && this.selectedPreset === p.id ? 'var(--accent-primary)' : 'var(--border-subtle)'};
              display: flex;
              align-items: center;
              gap: 10px;
              cursor: pointer;
            ">
              <img src="${p.dataUrl}" alt="${p.name}" style="width: 34px; height: 34px; image-rendering: pixelated; border-radius: 4px;" />
              <span style="font-size: 0.9rem; font-weight: 700; color: var(--text-primary);">${p.name}</span>
            </div>
          `).join('')}
        </div>

        <div class="modal-footer" style="display: flex; justify-content: space-between; margin-top: 10px;">
          <button class="btn btn-secondary" id="btn-back">← Back</button>
          <button class="btn btn-primary" id="btn-next">Continue →</button>
        </div>
      `;

      const fileInput = card.querySelector('#onboard-file-input') as HTMLInputElement;
      (card.querySelector('#btn-choose-file') as HTMLElement).onclick = () => fileInput.click();

      fileInput.onchange = async () => {
        const file = fileInput.files?.[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
          NotificationToast.show('Image exceeds 2MB limit.', 'error');
          return;
        }

        this.customAvatarBuffer = await file.arrayBuffer();
        this.customAvatarName = file.name;
        this.customAvatarMime = file.type;
        this.customAvatarPreviewUrl = URL.createObjectURL(file);
        this.avatarType = 'custom';
        this.renderCurrentView();
      };

      card.querySelectorAll('[data-preset]').forEach(el => {
        (el as HTMLElement).onclick = () => {
          this.avatarType = 'preset';
          this.selectedPreset = el.getAttribute('data-preset') || 'avatar_steve';
          this.renderCurrentView();
        };
      });

      (card.querySelector('#btn-back') as HTMLElement).onclick = () => {
        this.currentStep = 3;
        this.renderCurrentView();
      };
      (card.querySelector('#btn-next') as HTMLElement).onclick = () => {
        this.errorMessage = '';
        this.currentStep = 5;
        this.renderCurrentView();
      };

    } else if (this.currentStep === 5) {
      // Step 5: Bio
      card.innerHTML += `
        <div>
          <h3 style="font-size: 1.4rem; font-weight: 800; color: var(--text-primary);">Player Bio</h3>
          <p style="font-size: 0.88rem; color: var(--text-secondary); margin-top: 4px;">
            Write a short introduction for your Voxel⁺ profile. You can change this anytime.
          </p>
        </div>

        <div>
          <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 6px;">
            ABOUT YOU
          </label>
          <textarea id="input-bio" class="input-field" rows="3" placeholder="Building awesome Minecraft modpacks on Voxel⁺..." style="width: 100%; resize: none;">${this.bio}</textarea>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 6px; text-align: right;">
            ${this.bio.length} / 160 characters
          </div>
        </div>

        <div class="modal-footer" style="display: flex; justify-content: space-between; margin-top: 10px;">
          <button class="btn btn-secondary" id="btn-back">← Back</button>
          <button class="btn btn-primary" id="btn-next">Continue →</button>
        </div>
      `;

      const bioArea = card.querySelector('#input-bio') as HTMLTextAreaElement;
      bioArea.oninput = () => { this.bio = bioArea.value.slice(0, 160); };

      (card.querySelector('#btn-back') as HTMLElement).onclick = () => {
        this.currentStep = 4;
        this.renderCurrentView();
      };
      (card.querySelector('#btn-next') as HTMLElement).onclick = () => {
        this.errorMessage = '';
        this.currentStep = 6;
        this.renderCurrentView();
      };

    } else if (this.currentStep === 6) {
      // Step 6: Initial Minecraft Cosmetic
      card.innerHTML += `
        <div>
          <h3 style="font-size: 1.4rem; font-weight: 800; color: var(--text-primary);">Select Starter Cosmetic</h3>
          <p style="font-size: 0.88rem; color: var(--text-secondary); margin-top: 4px;">
            Choose a Minecraft-themed item to showcase on your player card. More unlock through achievements.
          </p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; max-height: 280px; overflow-y: auto; padding-right: 4px;">
          ${this.cosmeticsPresets.map(c => `
            <div class="horizontal-card" data-cosmetic="${c.id}" style="
              padding: 12px 14px;
              border-radius: var(--radius-lg);
              background: var(--bg-card);
              border: 1px solid ${this.selectedCosmeticId === c.id ? 'var(--accent-primary)' : 'var(--border-subtle)'};
              display: flex;
              align-items: center;
              gap: 12px;
              cursor: pointer;
            ">
              <div style="
                width: 44px;
                height: 44px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #090a0f;
                border-radius: var(--radius-md);
                border: 1px solid rgba(255,255,255,0.1);
                flex-shrink: 0;
              " class="${c.effectClass || ''}">
                <img src="${c.textureUrl}" alt="${c.name}" style="width: 32px; height: 32px; object-fit: contain; image-rendering: pixelated;" />
              </div>
              <div style="min-width: 0;">
                <div style="font-weight: 700; font-size: 0.92rem; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
                  <span>${c.name}</span>
                  <span class="badge" style="font-size: 0.65rem; padding: 2px 6px;">${c.rarity}</span>
                </div>
                <div style="font-size: 0.73rem; color: var(--text-muted); margin-top: 2px;">${c.description}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="modal-footer" style="display: flex; justify-content: space-between; margin-top: 10px;">
          <button class="btn btn-secondary" id="btn-back">← Back</button>
          <button class="btn btn-primary" id="btn-next">Continue →</button>
        </div>
      `;

      card.querySelectorAll('[data-cosmetic]').forEach(el => {
        (el as HTMLElement).onclick = () => {
          this.selectedCosmeticId = el.getAttribute('data-cosmetic') || 'dirt_block';
          this.renderCurrentView();
        };
      });

      (card.querySelector('#btn-back') as HTMLElement).onclick = () => {
        this.currentStep = 5;
        this.renderCurrentView();
      };
      (card.querySelector('#btn-next') as HTMLElement).onclick = () => {
        this.errorMessage = '';
        this.currentStep = 7;
        this.renderCurrentView();
      };

    } else if (this.currentStep === 7) {
      // Step 7: Privacy & Directory Visibility
      card.innerHTML += `
        <div>
          <h3 style="font-size: 1.4rem; font-weight: 800; color: var(--text-primary);">Privacy & Directory</h3>
          <p style="font-size: 0.88rem; color: var(--text-secondary); margin-top: 4px;">
            Decide whether other players can discover your profile and creations in the Voxel⁺ Community.
          </p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 14px;">
          <div class="horizontal-card" data-public="true" style="
            padding: 16px;
            border-radius: var(--radius-lg);
            background: var(--bg-card);
            border: 1px solid ${this.isPublic ? 'var(--accent-primary)' : 'var(--border-subtle)'};
            display: flex;
            align-items: center;
            gap: 14px;
            cursor: pointer;
          ">
            <span style="font-size: 2rem;">🌐</span>
            <div style="flex: 1;">
              <div style="font-weight: 700; color: var(--text-primary);">Public Player Profile (Recommended)</div>
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">
                Show your profile, badges, and shared packs in the Community directory.
              </div>
            </div>
            ${this.isPublic ? '<span style="color: var(--accent-primary); font-weight: 800;">✓</span>' : ''}
          </div>

          <div class="horizontal-card" data-public="false" style="
            padding: 16px;
            border-radius: var(--radius-lg);
            background: var(--bg-card);
            border: 1px solid ${!this.isPublic ? 'var(--accent-primary)' : 'var(--border-subtle)'};
            display: flex;
            align-items: center;
            gap: 14px;
            cursor: pointer;
          ">
            <span style="font-size: 2rem;">🔒</span>
            <div style="flex: 1;">
              <div style="font-weight: 700; color: var(--text-primary);">Private Profile</div>
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">
                Hidden from public directory search. Syncs silently for your eyes only.
              </div>
            </div>
            ${!this.isPublic ? '<span style="color: var(--accent-primary); font-weight: 800;">✓</span>' : ''}
          </div>
        </div>

        <div class="modal-footer" style="display: flex; justify-content: space-between; margin-top: 10px;">
          <button class="btn btn-secondary" id="btn-back">← Back</button>
          <button class="btn btn-primary" id="btn-next">Review →</button>
        </div>
      `;

      card.querySelectorAll('[data-public]').forEach(el => {
        (el as HTMLElement).onclick = () => {
          this.isPublic = el.getAttribute('data-public') === 'true';
          this.renderCurrentView();
        };
      });

      (card.querySelector('#btn-back') as HTMLElement).onclick = () => {
        this.currentStep = 6;
        this.renderCurrentView();
      };
      (card.querySelector('#btn-next') as HTMLElement).onclick = () => {
        this.errorMessage = '';
        this.currentStep = 8;
        this.renderCurrentView();
      };

    } else if (this.currentStep === 8) {
      // Step 8: Review & Confirm
      const chosenCosmetic = this.cosmeticsPresets.find(c => c.id === this.selectedCosmeticId);

      card.innerHTML += `
        <div>
          <h3 style="font-size: 1.4rem; font-weight: 800; color: var(--text-primary);">Review & Create Account</h3>
          <p style="font-size: 0.88rem; color: var(--text-secondary); margin-top: 4px;">
            Here is how your player profile will look. Click "Create Voxel⁺ Account" to complete onboarding.
          </p>
        </div>

        <!-- Preview Card -->
        <div style="
          padding: 20px;
          background: linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.9)), var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xl);
          display: flex;
          align-items: center;
          gap: 18px;
        ">
          <div style="
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background: var(--accent-gradient);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2rem;
            color: white;
            overflow: hidden;
            border: 2px solid var(--accent-primary);
          ">
            ${this.customAvatarPreviewUrl ? `<img src="${this.customAvatarPreviewUrl}" style="width: 100%; height: 100%; object-fit: cover;" />` : `<img src="${getAvatarDataUrl(this.selectedPreset)}" style="width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated;" />`}
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.25rem; font-weight: 800; color: var(--text-primary);">@${this.username}</span>
              <span class="badge ${this.isPublic ? 'badge-recommended' : 'badge-lts'}">${this.isPublic ? 'PUBLIC' : 'PRIVATE'}</span>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">
              ${this.bio || 'Building with Voxel⁺'}
            </div>
            <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 0.78rem; color: #93c5fd;">
              <span>Starter Cosmetic:</span>
              ${chosenCosmetic?.textureUrl ? `<img src="${chosenCosmetic.textureUrl}" style="width: 20px; height: 20px; object-fit: contain; image-rendering: pixelated;" />` : ''}
              <span style="font-weight: 700;">${chosenCosmetic?.name || 'Grass Block'}</span>
            </div>
          </div>
        </div>

        <div class="modal-footer" style="display: flex; justify-content: space-between; margin-top: 10px;">
          <button class="btn btn-secondary" id="btn-back" ${this.isSubmitting ? 'disabled' : ''}>← Back</button>
          <button class="btn btn-primary" id="btn-finish" style="padding: 12px 28px; font-weight: 800;" ${this.isSubmitting ? 'disabled' : ''}>
            ${this.isSubmitting ? 'Creating Account...' : 'CREATE VOXEL⁺ ACCOUNT →'}
          </button>
        </div>
      `;

      (card.querySelector('#btn-back') as HTMLElement).onclick = () => {
        if (!this.isSubmitting) {
          this.currentStep = 7;
          this.renderCurrentView();
        }
      };

      (card.querySelector('#btn-finish') as HTMLElement).onclick = async () => {
        await this.submitAccountCreation();
      };
    }

    this.container.appendChild(card);
  }

  private async submitAccountCreation(): Promise<void> {
    this.isSubmitting = true;
    this.errorMessage = '';
    this.renderCurrentView();

    try {
      const avatarValue = this.avatarType === 'preset' ? this.selectedPreset : 'avatar_steve';

      // 1. Create account
      await api.createAccount({
        username: this.username,
        password: this.password,
        avatar: avatarValue,
        bio: this.bio,
        isPublic: this.isPublic
      });

      // 2. Upload custom avatar if chosen
      if (this.avatarType === 'custom' && this.customAvatarBuffer) {
        try {
          await api.uploadAvatar(this.customAvatarBuffer, this.customAvatarName, this.customAvatarMime);
        } catch (e) {
          console.warn('[Onboarding] Custom avatar upload failed:', e);
        }
      }

      // 3. Select starter cosmetic
      try {
        await api.selectCosmetic(this.selectedCosmeticId);
      } catch (e) {
        console.warn('[Onboarding] Starter cosmetic selection failed:', e);
      }

      // 4. Report ACCOUNT_CREATED achievement trigger
      try {
        await api.reportAchievementEvent('ACCOUNT_CREATED');
      } catch {}

      NotificationToast.show(`Account @${this.username} created successfully!`, 'success');
      this.events.onComplete();
    } catch (err: any) {
      this.isSubmitting = false;
      this.errorMessage = err.message || 'Account creation failed. Please try again.';
      this.renderCurrentView();
    }
  }
}
