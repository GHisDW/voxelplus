import { api } from '../services/api';

export interface TosGateEvents {
  onAccepted: () => void;
}

export class TosGatePage {
  private readonly container: HTMLElement;
  private currentPoint = 0;

  private readonly points = [
    {
      title: 'Minecraft ownership',
      body: 'Voxel⁺ is not affiliated with Minecraft, Mojang Studios, or Microsoft. Minecraft is owned by Mojang Studios, which is owned by Microsoft.'
    },
    {
      title: 'Responsible use',
      body: 'Voxel⁺ may be used for legitimate purposes, but it can be used for piracy or other unauthorized activity. Do not misuse Voxel⁺. Only continue if you agree to use it responsibly and legally.'
    },
    {
      title: 'Open source & third-party files',
      body: 'Voxel⁺ is open source and is not itself malware. Voxel⁺ is not responsible for malicious files you choose to install, including unverified third-party .jar mods or other files. Only use files from sources you trust.'
    }
  ];

  constructor(private readonly events: TosGateEvents) {
    this.container = document.createElement('div');

    this.container.style.cssText = `
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      box-sizing: border-box;
      background: var(--bg-app);
      z-index: 9999;
    `;
  }

  public render(): HTMLElement {
    this.renderPoint();
    return this.container;
  }

  private renderPoint(): void {
    const point = this.points[this.currentPoint];

    this.container.innerHTML = `
      <div
        class="modal-content animate-scale-in"
        style="
          max-width: 680px;
          width: 100%;
          box-sizing: border-box;
        "
      >
        <div style="
          text-align: center;
          padding: 18px 10px 10px;
        ">
          <div style="
            width: 64px;
            height: 64px;
            margin: 0 auto 16px;
            border-radius: var(--radius-lg);
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--accent-gradient);
            color: white;
            font-size: 28px;
            font-weight: 900;
            box-shadow: 0 8px 24px var(--accent-glow);
          ">
            V⁺
          </div>

          <div class="brand-title" style="
            justify-content: center;
            font-size: 2rem;
            margin-bottom: 8px;
          ">
            VOXEL<span class="plus-badge">⁺</span>
          </div>

          <h2 style="
            margin: 14px 0 8px;
            color: var(--text-primary);
            font-size: 1.4rem;
            font-weight: 800;
          ">
            Before You Continue
          </h2>

          <p style="
            margin: 0;
            color: var(--text-secondary);
            font-size: 0.9rem;
            line-height: 1.5;
          ">
            Please acknowledge each point before using Voxel⁺.
          </p>
        </div>

        <div style="
          margin: 22px 0 18px;
          padding: 22px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
        ">
          <div style="
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 14px;
          ">
            <span class="badge badge-recommended">
              ${this.currentPoint + 1} / ${this.points.length}
            </span>

            <h3 style="
              margin: 0;
              color: var(--text-primary);
              font-size: 1.08rem;
              font-weight: 800;
            ">
              ${point.title}
            </h3>
          </div>

          <p style="
            margin: 0;
            color: var(--text-secondary);
            line-height: 1.75;
            font-size: 0.95rem;
          ">
            ${point.body}
          </p>
        </div>

        <div
          class="modal-footer"
          style="
            gap: 10px;
            display: flex;
            justify-content: flex-end;
          "
        >
          <button
            type="button"
            class="btn btn-secondary"
            id="btn-tos-no"
            style="
              color: #ef4444;
              border-color: #ef444455;
            "
          >
            NO, QUIT APP
          </button>

          <button
            type="button"
            class="btn btn-primary"
            id="btn-tos-yes"
          >
            YES, CONTINUE →
          </button>
        </div>
      </div>
    `;

    const quitButton = this.container.querySelector(
      '#btn-tos-no'
    ) as HTMLButtonElement;

    const continueButton = this.container.querySelector(
      '#btn-tos-yes'
    ) as HTMLButtonElement;

    quitButton.onclick = () => {
      void api.quitApp();
    };

    continueButton.onclick = () => {
      if (this.currentPoint < this.points.length - 1) {
        this.currentPoint += 1;
        this.renderPoint();
        return;
      }

      this.events.onAccepted();
    };
  }
}
