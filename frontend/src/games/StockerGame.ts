import { StockerMode, StockerRunResult } from '../../../electron/types';
import { api } from '../services/api';
import { NotificationToast } from '../components/NotificationToast';

export class StockerGame {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private animId: number = 0;
  private mode: StockerMode = 'wave';
  private running: boolean = false;
  private gameOver: boolean = false;

  private score: number = 0;
  private distance: number = 0;
  private obstaclesCleared: number = 0;
  private startTime: number = 0;

  // Player physics
  private playerY: number = 150;
  private playerVelY: number = 0;
  private readonly playerX: number = 60;
  private readonly playerSize: number = 18;
  private isHolding: boolean = false;

  // Obstacles
  private obstacles: { x: number; topH: number; bottomY: number; width: number; cleared: boolean }[] = [];
  private lastObstacleX: number = 0;

  private onGameEndCallback?: () => void;

  constructor(mode: StockerMode = 'wave', onGameEnd?: () => void) {
    this.mode = mode;
    this.onGameEndCallback = onGameEnd;
  }

  public render(container: HTMLElement): void {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 14px; width: 100%;">
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; max-width: 680px; padding: 0 4px;">
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-secondary ${this.mode === 'wave' ? 'btn-primary' : ''}" id="stocker-mode-wave">Wave Mode</button>
            <button class="btn btn-secondary ${this.mode === 'ship' ? 'btn-primary' : ''}" id="stocker-mode-ship">Ship Mode</button>
          </div>
          <div style="display: flex; gap: 16px; font-weight: 700; font-family: var(--font-mono);">
            <div style="color: var(--accent-primary);">SCORE: <span id="stocker-score">0</span></div>
            <div style="color: var(--text-secondary);">DIST: <span id="stocker-dist">0m</span></div>
          </div>
        </div>

        <div style="position: relative; width: 680px; height: 320px; background: var(--bg-terminal); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.5);">
          <canvas id="stocker-canvas" width="680" height="320" style="display: block; width: 100%; height: 100%; cursor: pointer;"></canvas>
          <div id="stocker-overlay" style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--scrim); backdrop-filter: blur(4px);">
            <div style="font-size: 1.6rem; font-weight: 900; color: var(--text-terminal); margin-bottom: 6px;">STOCKER</div>
            <div style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 18px;">Hold Space / Click / Touch to thrust upward</div>
            <button class="btn btn-primary" id="stocker-btn-start" style="padding: 10px 32px; font-weight: 700;">START RUN</button>
          </div>
        </div>
      </div>
    `;

    this.canvas = container.querySelector('#stocker-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;

    const startBtn = container.querySelector('#stocker-btn-start') as HTMLElement;
    const overlay = container.querySelector('#stocker-overlay') as HTMLElement;

    startBtn.onclick = () => {
      overlay.style.display = 'none';
      this.startGame();
    };

    const waveBtn = container.querySelector('#stocker-mode-wave') as HTMLElement;
    const shipBtn = container.querySelector('#stocker-mode-ship') as HTMLElement;

    waveBtn.onclick = () => {
      if (this.mode !== 'wave') {
        this.mode = 'wave';
        this.render(container);
      }
    };
    shipBtn.onclick = () => {
      if (this.mode !== 'ship') {
        this.mode = 'ship';
        this.render(container);
      }
    };

    // Controls
    const setHold = (val: boolean) => { this.isHolding = val; };
    window.onkeydown = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        setHold(true);
      }
    };
    window.onkeyup = (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        setHold(false);
      }
    };

    this.canvas.onmousedown = () => setHold(true);
    window.onmouseup = () => setHold(false);
    this.canvas.ontouchstart = (e) => { e.preventDefault(); setHold(true); };
    this.canvas.ontouchend = () => setHold(false);
  }

  private startGame(): void {
    this.running = true;
    this.gameOver = false;
    this.score = 0;
    this.distance = 0;
    this.obstaclesCleared = 0;
    this.startTime = Date.now();
    this.playerY = 160;
    this.playerVelY = 0;
    this.obstacles = [];
    this.lastObstacleX = 400;

    this.spawnInitialObstacles();
    this.loop();
  }

  private spawnInitialObstacles(): void {
    for (let i = 0; i < 4; i++) {
      this.spawnObstacle(400 + i * 180);
    }
  }

  private spawnObstacle(x: number): void {
    const gap = this.mode === 'wave' ? 95 : 115;
    const topH = 40 + Math.random() * (this.canvas.height - gap - 80);
    this.obstacles.push({
      x,
      topH,
      bottomY: topH + gap,
      width: 44,
      cleared: false
    });
    this.lastObstacleX = x;
  }

  private loop = (): void => {
    if (!this.running) return;

    this.update();
    this.draw();

    if (!this.gameOver) {
      this.animId = requestAnimationFrame(this.loop);
    } else {
      this.handleGameOver();
    }
  };

  private update(): void {
    this.distance += 2;
    this.score = Math.floor(this.distance / 2) + (this.obstaclesCleared * 50);

    const scoreEl = document.getElementById('stocker-score');
    const distEl = document.getElementById('stocker-dist');
    if (scoreEl) scoreEl.textContent = this.score.toString();
    if (distEl) distEl.textContent = `${Math.floor(this.distance / 10)}m`;

    // Mode-specific physics
    if (this.mode === 'wave') {
      // Wave mode: sharp angled up/down
      const speed = 4.2;
      this.playerVelY = this.isHolding ? -speed : speed;
      this.playerY += this.playerVelY;
    } else {
      // Ship mode: smooth thruster acceleration + gravity
      const gravity = 0.35;
      const thrust = -0.7;
      if (this.isHolding) {
        this.playerVelY += thrust;
      } else {
        this.playerVelY += gravity;
      }
      this.playerVelY = Math.max(-5.5, Math.min(5.5, this.playerVelY));
      this.playerY += this.playerVelY;
    }

    // Boundary check
    if (this.playerY < 0 || this.playerY + this.playerSize > this.canvas.height) {
      this.gameOver = true;
    }

    // Scroll obstacles
    const speed = 3.6 + Math.min(3, this.distance / 3000);
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.x -= speed;

      // Score clearance
      if (!obs.cleared && obs.x + obs.width < this.playerX) {
        obs.cleared = true;
        this.obstaclesCleared++;
      }

      // Collision detection
      if (
        this.playerX + this.playerSize > obs.x &&
        this.playerX < obs.x + obs.width
      ) {
        if (this.playerY < obs.topH || this.playerY + this.playerSize > obs.bottomY) {
          this.gameOver = true;
        }
      }

      // Remove off-screen
      if (obs.x + obs.width < -50) {
        this.obstacles.splice(i, 1);
      }
    }

    // Spawn new obstacles
    if (this.lastObstacleX - speed < this.canvas.width + 120) {
      this.spawnObstacle(this.canvas.width + 160 + Math.random() * 40);
    }
  }

  private draw(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.ctx.fillStyle = '#06080e';
    this.ctx.fillRect(0, 0, w, h);

    // Grid lines
    this.ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    this.ctx.lineWidth = 1;
    const offset = -(this.distance % 30);
    for (let x = offset; x < w; x += 30) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, h);
      this.ctx.stroke();
    }

    // Draw obstacles
    for (const obs of this.obstacles) {
      this.ctx.fillStyle = this.mode === 'wave' ? '#10b981' : '#06b6d4';
      // Top pillar
      this.ctx.fillRect(obs.x, 0, obs.width, obs.topH);
      // Bottom pillar
      this.ctx.fillRect(obs.x, obs.bottomY, obs.width, h - obs.bottomY);

      // Glow accent edges
      this.ctx.fillStyle = '#fff';
      this.ctx.fillRect(obs.x, obs.topH - 2, obs.width, 2);
      this.ctx.fillRect(obs.x, obs.bottomY, obs.width, 2);
    }

    // Draw player
    this.ctx.save();
    this.ctx.translate(this.playerX, this.playerY);
    if (this.mode === 'wave') {
      // Wave arrow icon
      this.ctx.fillStyle = '#38bdf8';
      this.ctx.beginPath();
      this.ctx.moveTo(this.playerSize, this.playerSize / 2);
      this.ctx.lineTo(0, 0);
      this.ctx.lineTo(4, this.playerSize / 2);
      this.ctx.lineTo(0, this.playerSize);
      this.ctx.closePath();
      this.ctx.fill();
    } else {
      // Ship rocket icon
      this.ctx.fillStyle = '#f59e0b';
      this.ctx.fillRect(0, 0, this.playerSize, this.playerSize);
      this.ctx.fillStyle = '#fbbf24';
      this.ctx.fillRect(3, 3, this.playerSize - 6, this.playerSize - 6);
    }
    this.ctx.restore();
  }

  private async handleGameOver(): Promise<void> {
    this.running = false;
    cancelAnimationFrame(this.animId);

    const runResult: StockerRunResult = {
      mode: this.mode,
      score: this.score,
      distance: this.distance,
      obstaclesCleared: this.obstaclesCleared,
      durationMs: Date.now() - this.startTime,
      timestamp: new Date().toISOString()
    };

    try {
      const reward = await api.recordStockerRun(runResult);
      NotificationToast.show(`Run Complete! Earned ${reward.vpEarned} VP (Score: ${this.score})`, 'success');
      if (reward.newAchievements.length > 0) {
        NotificationToast.show(`🏆 Unlocked ${reward.newAchievements.length} new achievement(s)!`, 'success');
      }
    } catch (e) {
      console.error('Failed to submit stocker run', e);
    }

    const overlay = document.getElementById('stocker-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      overlay.innerHTML = `
        <div style="font-size: 1.8rem; font-weight: 900; color: var(--danger); margin-bottom: 4px;">GAME OVER</div>
        <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-terminal); margin-bottom: 2px;">Score: ${this.score}</div>
        <div style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 18px;">Cleared ${this.obstaclesCleared} barriers</div>
        <button class="btn btn-primary" id="stocker-btn-restart" style="padding: 10px 32px; font-weight: 700;">PLAY AGAIN</button>
      `;
      const restartBtn = overlay.querySelector('#stocker-btn-restart') as HTMLElement;
      restartBtn.onclick = () => {
        overlay.style.display = 'none';
        this.startGame();
      };
    }

    if (this.onGameEndCallback) this.onGameEndCallback();
  }

  public destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.animId);
  }
}
