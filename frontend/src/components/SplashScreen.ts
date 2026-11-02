/**
 * Funny one-liners that get rolled under the logo while the launcher boots.
 * Minecraft-style splash text, launcher flavoured.
 *
 * Each splash has a weight for weighted random selection:
 * - weight 0: never selected in weighted mode, selected uniformly when all weights are 0
 * - weight > 0: relative probability for weighted selection
 * - weight 100: always selected if it's the only nonzero weight
 */
export interface SplashText {
  text: string;
  weight: number;
}

export const SPLASH_TEXTS: readonly SplashText[] = [
  { text: 'Now with 20% more voxels!', weight: 0 },
  { text: 'Also try Minecraft!', weight: 0 },
  { text: 'Also try not touching the config!', weight: 0 },
  { text: '100% mod-free! (until you install 300)', weight: 0 },
  { text: 'Gradle is thinking about it…', weight: 0 },
  { text: 'It works on my machine!', weight: 0 },
  { text: 'Java 21 or bust!', weight: 0 },
  { text: 'Now with fewer crashes! Probably.', weight: 0 },
  { text: 'Creepers were here.', weight: 0 },
  { text: 'Allocating more RAM than your fridge.', weight: 0 },
  { text: 'Fabric-ated with love!', weight: 0 },
  { text: 'Quilted for your comfort!', weight: 0 },
  { text: 'Forge ahead! NeoForge too!', weight: 0 },
  { text: 'Mods? In MY launcher?', weight: 0 },
  { text: 'Definitely not a virus!', weight: 0 },
  { text: 'Mojang approved-ish!', weight: 0 },
  { text: 'Not affiliated with Mojang, but we wish.', weight: 0 },
  { text: 'Loading… please do not blink.', weight: 0 },
  { text: '0% vibes, 100% code!', weight: 0 },
  { text: 'Powered by questionable decisions!', weight: 0 },
  { text: 'Splash text not found!?', weight: 0 },
  { text: 'Loading chunks… all of them.', weight: 0 },
  { text: 'Your RAM is fine. Trust me.', weight: 0 },
  { text: 'An Enderman stole the progress bar.', weight: 0 },
  { text: 'Right-click to win!', weight: 0 },
  { text: 'Shift-click your problems away!', weight: 0 },
  { text: 'Now with extra enchantment glint!', weight: 0 },
  { text: 'The cake is a lie. The mods are not.', weight: 0 },
  { text: 'One does not simply launch Minecraft.', weight: 0 },
  { text: 'This text is randomized. Magic!', weight: 0 },
  { text: 'Also try turning it off and on again!', weight: 0 },
  { text: 'Reticulating splines…', weight: 0 },
  { text: 'Mining diamonds… in the loading bar!', weight: 0 },
  { text: '9 out of 10 creepers recommend it!', weight: 0 },
  { text: 'Now 30% more grayscale!', weight: 0 },
  { text: 'Colors may appear during loading!', weight: 0 },
  { text: 'Blurring in 3… 2… 1…', weight: 0 },
  { text: 'Sharpening pixels as we speak!', weight: 0 },
  { text: 'Saturating your expectations!', weight: 0 },
  { text: 'Now in glorious Technicolor!', weight: 0 },
  { text: 'Sssssss… just kidding!', weight: 0 },
  { text: 'Do not feed the Endermen!', weight: 0 },
  { text: 'Bedrock edition? Never heard of her.', weight: 0 },
  { text: 'F3 + H for happiness!', weight: 0 },
  { text: 'Ender pearl in the microwave!', weight: 0 },
  { text: 'Hitting the sweet spot of chunk loading!', weight: 0 },
  { text: 'Loading… /gamerule doLoadingBar true', weight: 0 },
  { text: 'Java args go brrr!', weight: 0 },
  { text: 'Warming up the JVM!', weight: 0 },
  { text: 'Now with fewer stack traces!', weight: 0 },
  { text: 'Your instance has entered the chat.', weight: 0 },
  { text: 'Downloading more RAM… (jk)', weight: 0 },
  { text: 'Please wait, composting chunks.', weight: 0 },
  { text: 'Powered by one sleep-deprived dev!', weight: 0 },
  { text: 'Also try Voxel-! (wait, that is us)', weight: 0 },
  { text: 'Why did you download this?', weight: 0 },
  { text: 'Loading, but with style!', weight: 0 },
  { text: 'Achievement unlocked: Patience!', weight: 0 },
  { text: 'There is no cow level. Probably.', weight: 0 },
  { text: 'Summoning the loading spirits!', weight: 0 },
  { text: 'Mod loading order: yes.', weight: 0 },
  { text: 'Now with 100% genuine water!', weight: 0 },
  { text: 'Careful, the loading bar is hungry.', weight: 0 },
  { text: 'Tip: do not punch the logo!', weight: 0 },
  { text: 'Follow the yellow splash text!', weight: 0 },
  { text: 'Not a paid actor. Unless…', weight: 0 },
  { text: 'Vanilla is fine. Vanilla + 400 mods is finer.', weight: 0 },
  { text: 'Compiling your future backlog!', weight: 0 },
  { text: 'Your FPS is in another castle.', weight: 0 },
  { text: 'Now with cross-loader chaos!', weight: 0 },
  { text: 'Totally not staring at the progress bar.', weight: 0 }
];

/**
 * Selects a splash text based on weighted random selection.
 *
 * Rules:
 * - If all weights are 0, use uniform random selection (preserves existing behavior)
 * - If at least one weight > 0, use weighted selection based on relative probabilities
 * - If exactly one message has weight 100 and all others are 0, always select that message
 * - Invalid weights (negative, NaN, Infinity, non-numeric) are treated as 0
 * - Empty arrays return a fallback message
 */
export function selectSplashText(splashes: readonly SplashText[]): string {
  if (!splashes || splashes.length === 0) {
    return 'Loading voxels…';
  }

  // Normalize weights: handle invalid values
  const normalized = splashes.map(s => ({
    text: s.text,
    weight: typeof s.weight === 'number' && isFinite(s.weight) && s.weight >= 0 ? s.weight : 0
  }));

  // Check if all weights are zero
  const allZero = normalized.every(s => s.weight === 0);
  if (allZero) {
    // Uniform random selection (preserves existing behavior)
    const index = Math.floor(Math.random() * normalized.length);
    return normalized[index].text;
  }

  // Check if exactly one message has weight 100 and all others are 0
  const weight100Entries = normalized.filter(s => s.weight === 100);
  if (weight100Entries.length === 1 && normalized.filter(s => s.weight > 0 && s.weight !== 100).length === 0) {
    return weight100Entries[0].text;
  }

  // Weighted random selection
  const totalWeight = normalized.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) {
    // Fallback to uniform if somehow total is 0 but not all are 0
    const index = Math.floor(Math.random() * normalized.length);
    return normalized[index].text;
  }

  let random = Math.random() * totalWeight;
  for (const splash of normalized) {
    random -= splash.weight;
    if (random <= 0) {
      return splash.text;
    }
  }

  // Fallback (should not reach here)
  return normalized[normalized.length - 1].text;
}

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
      next = selectSplashText(SPLASH_TEXTS);
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

