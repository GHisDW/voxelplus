/**
 * Funny one-liners that get rolled under the logo while the launcher boots.
 * Minecraft-style splash text, launcher flavoured.
 */
export const SPLASH_TEXTS: readonly string[] = [
  'Now with 20% more voxels!',
  'Also try Minecraft!',
  'Also try not touching the config!',
  '100% mod-free! (until you install 300)',
  'Gradle is thinking about it…',
  'It works on my machine!',
  'Java 21 or bust!',
  'Now with fewer crashes! Probably.',
  'Creepers were here.',
  'Allocating more RAM than your fridge.',
  'Fabric-ated with love!',
  'Quilted for your comfort!',
  'Forge ahead! NeoForge too!',
  'Mods? In MY launcher?',
  'Definitely not a virus!',
  'Mojang approved-ish!',
  'Not affiliated with Mojang, but we wish.',
  'Loading… please do not blink.',
  '0% vibes, 100% code!',
  'Powered by questionable decisions!',
  'Splash text not found!?',
  'Loading chunks… all of them.',
  'Your RAM is fine. Trust me.',
  'An Enderman stole the progress bar.',
  'Right-click to win!',
  'Shift-click your problems away!',
  'Now with extra enchantment glint!',
  'The cake is a lie. The mods are not.',
  'One does not simply launch Minecraft.',
  'This text is randomized. Magic!',
  'Also try turning it off and on again!',
  'Reticulating splines…',
  'Mining diamonds… in the loading bar!',
  '9 out of 10 creepers recommend it!',
  'Now 30% more grayscale!',
  'Colors may appear during loading!',
  'Blurring in 3… 2… 1…',
  'Sharpening pixels as we speak!',
  'Saturating your expectations!',
  'Now in glorious Technicolor!',
  'Sssssss… just kidding!',
  'Do not feed the Endermen!',
  'Bedrock edition? Never heard of her.',
  'F3 + H for happiness!',
  'Ender pearl in the microwave!',
  'Hitting the sweet spot of chunk loading!',
  'Loading… /gamerule doLoadingBar true',
  'Java args go brrr!',
  'Warming up the JVM!',
  'Now with fewer stack traces!',
  'Your instance has entered the chat.',
  'Downloading more RAM… (jk)',
  'Please wait, composting chunks.',
  'Powered by one sleep-deprived dev!',
  'Also try Voxel-! (wait, that is us)',
  'Loading, but with style!',
  'Achievement unlocked: Patience!',
  'There is no cow level. Probably.',
  'Summoning the loading spirits!',
  'Mod loading order: yes.',
  'Now with 100% genuine water!',
  'Careful, the loading bar is hungry.',
  'Tip: do not punch the logo!',
  'Follow the yellow splash text!',
  'Not a paid actor. Unless…',
  'Vanilla is fine. Vanilla + 400 mods is finer.',
  'Compiling your future backlog!',
  'Your FPS is in another castle.',
  'Now with cross-loader chaos!',
  'Totally not staring at the progress bar.'
];

const PHASE_TIMINGS = {
  /** Blurred grayscale is already on screen when the overlay mounts. */
  grayscale: 1500,
  color: 1500,
  normal: 1500,
  hold: 1200,
  exit: 700
} as const;

/**
 * Discord-style startup animation: the Voxel+ mark sits in the middle of a dark
 * canvas, resolves from a blurred grayscale blob -> sharp grayscale -> a hint of
 * colour -> full colour, then the overlay fades away to reveal the launcher.
 *
 * The splash is intentionally skipped on first run so the setup wizard opens
 * immediately, and it never plays twice in the same renderer session.
 */
export class SplashScreen {
  private static hasPlayed = false;
  private static activeOverlay: HTMLElement | null = null;
  private static cancelPlayback: (() => void) | null = null;
  private static onSplashComplete: (() => void) | null = null;

  public static show(onComplete?: () => void): Promise<void> {
    // Never replay during the same session (hot reloads, re-inits, etc).
    if (this.hasPlayed || typeof document === 'undefined') {
      onComplete?.();
      return Promise.resolve();
    }
    this.hasPlayed = true;
    this.onSplashComplete = onComplete || null;

    const overlay = document.createElement('div');
    overlay.className = 'splash-screen';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.setAttribute('aria-label', 'Voxel+ is starting up');
    overlay.dataset.phase = '0';
    overlay.innerHTML = `
      <div class="splash-aura" aria-hidden="true"></div>
      <div class="splash-particles" aria-hidden="true"></div>
      <div class="splash-stage">
        <div class="splash-logo-frame">
          <div class="splash-logo-glow" aria-hidden="true"></div>
          <div class="splash-logo-ring" aria-hidden="true"></div>
          <div class="splash-logo-aura" aria-hidden="true"></div>
          <img class="splash-logo" src="logo.png" alt="Voxel+" draggable="false" />
        </div>
        <div class="splash-meta">
          <div class="splash-text-row">
            <span class="splash-text"></span>
          </div>
          <div class="splash-progress" aria-hidden="true">
            <div class="splash-progress-fill"></div>
          </div>
          <div class="splash-status">Waking up the voxels…</div>
        </div>
      </div>
      <div class="splash-footer">VOXEL⁺ LAUNCHER</div>
      <div class="splash-skip-hint">click anywhere to skip</div>
    `;

    document.body.appendChild(overlay);
    this.activeOverlay = overlay;
    this.rollText(overlay);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return this.playReduced(overlay);
    }

    return this.play(overlay);
  }

  /**
   * Removes the splash immediately (used when the first-run wizard should open
   * without a boot animation). Safe to call when no splash is mounted.
   */
  public static isVisible(): boolean {
    return this.activeOverlay !== null;
  }

  public static abort(): void {
    const overlay = this.activeOverlay;
    this.activeOverlay = null;
    this.cancelPlayback?.();
    this.cancelPlayback = null;
    overlay?.remove();
  }

  private static play(overlay: HTMLElement): Promise<void> {
    return new Promise<void>((resolve) => {
      let finished = false;
      let skipped = false;

      const finish = (): void => {
        if (finished) return;
        finished = true;
        overlay.classList.add('splash-exit');
        window.setTimeout(() => {
          overlay.remove();
          if (this.activeOverlay === overlay) {
            this.activeOverlay = null;
            this.cancelPlayback = null;
          }
          this.onSplashComplete?.();
          this.onSplashComplete = null;
          resolve();
        }, PHASE_TIMINGS.exit);
      };

      // Lets abort() stop the timeline without waiting for the exit animation.
      this.cancelPlayback = () => {
        finished = true;
        skipped = true;
        resolve();
      };

      const advance = async (delay: number, phase: number, status: string): Promise<boolean> => {
        await wait(delay);
        if (skipped || finished) return false;
        this.setPhase(overlay, phase);
        this.rollText(overlay);
        this.setStatus(overlay, status);
        return true;
      };

      overlay.addEventListener('click', () => {
        skipped = true;
        finish();
      }, { once: true });

      void (async () => {
        if (!(await advance(PHASE_TIMINGS.grayscale, 1, 'Sharpening the pixels…'))) return;
        if (!(await advance(PHASE_TIMINGS.color, 2, 'Mixing in a splash of colour…'))) return;
        if (!(await advance(PHASE_TIMINGS.normal, 3, 'Ready. Probably.'))) return;
        await wait(PHASE_TIMINGS.hold);
        if (skipped || finished) return;
        finish();
      })();
    });
  }

  private static async playReduced(overlay: HTMLElement): Promise<void> {
    this.setPhase(overlay, 3);
    this.setStatus(overlay, 'Ready.');
    await wait(250);
    overlay.classList.add('splash-exit');
    await wait(250);
    overlay.remove();
    if (this.activeOverlay === overlay) {
      this.activeOverlay = null;
      this.cancelPlayback = null;
    }
  }

  private static setPhase(overlay: HTMLElement, phase: number): void {
    overlay.dataset.phase = String(phase);
    const logo = overlay.querySelector('.splash-logo');
    if (!logo) return;
    for (let i = 0; i < 4; i++) {
      logo.classList.remove(`splash-phase-${i}`);
    }
    logo.classList.add(`splash-phase-${phase}`);
  }

  private static rollText(overlay: HTMLElement): void {
    const textEl = overlay.querySelector('.splash-text');
    if (!textEl) return;

    const current = textEl.textContent;
    let next: string = current ?? '';
    // Avoid showing the same splash twice in a row so every phase feels new.
    for (let attempt = 0; attempt < 8 && next === current; attempt++) {
      next = SPLASH_TEXTS[Math.floor(Math.random() * SPLASH_TEXTS.length)];
    }

    textEl.textContent = next;
    textEl.classList.remove('splash-text-pop');
    // Force a reflow so the pop animation restarts on every swap.
    void (textEl as HTMLElement).offsetWidth;
    textEl.classList.add('splash-text-pop');
  }

  private static setStatus(overlay: HTMLElement, status: string): void {
    const statusEl = overlay.querySelector('.splash-status');
    if (statusEl) statusEl.textContent = status;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

