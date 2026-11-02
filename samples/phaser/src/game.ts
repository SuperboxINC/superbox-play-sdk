import * as Phaser from 'phaser';
import { SBPLAY_EVENTS, superboxPlayPlugin } from 'superbox-play-sdk/phaser';

/**
 * Phaser 샘플 — Boot(파일 하나) → Preload(32장) → Main. 플러그인이 로더 둘의 진행률을 이어 주고 Main 이 뜨면 로딩 화면을 닫는다.
 * 게임 코드는 Phaser 3 · 4 에서 같다.
 */
const TILE_COUNT = 32;
const WIDTH = 720;
const HEIGHT = 1280;

const state = { gems: 0, rewards: 0, missions: 0, paused: false, resumed: 0, environment: '', safeAreaBottom: 0, log: [] as string[] };

declare global {
  interface Window {
    sampleState: typeof state;
    sampleGame: Phaser.Game;
  }
}
window.sampleState = state;

function tileName(index: number): string {
  return `tile-${String(index).padStart(2, '0')}`;
}

class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }
  preload(): void {
    this.load.image('badge', 'assets/tile-00.png');
  }
  create(): void {
    this.scene.start('Preload');
  }
}

class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }
  preload(): void {
    for (let index = 1; index < TILE_COUNT; index += 1) this.load.image(tileName(index), `assets/${tileName(index)}.png`);
  }
  create(): void {
    this.scene.start('Main');
  }
}

interface ButtonSpec {
  readonly label: string;
  readonly color: number;
  run(): Promise<void>;
}

class MainScene extends Phaser.Scene {
  private status!: Phaser.GameObjects.Text;
  private wallet!: Phaser.GameObjects.Text;

  constructor() {
    super('Main');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#14101f');
    this.add.image(WIDTH / 2, 240, 'badge').setDisplaySize(620, 348);
    this.status = this.add.text(50, 440, '게임존과 연결하는 중…', { fontFamily: 'sans-serif', fontSize: '26px', color: '#b8b5c4' });
    this.wallet = this.add.text(50, 490, '', { fontFamily: 'sans-serif', fontSize: '34px', color: '#ffffff' });
    this.renderWallet();

    const buttons: readonly ButtonSpec[] = [
      { label: '보상형 광고', color: 0x8b5cf6, run: () => this.showRewarded() },
      { label: '젬 300 구매', color: 0x3b3454, run: () => this.purchase() },
      { label: '한 판 끝(미션)', color: 0x3b3454, run: () => this.finishStage() },
    ];
    buttons.forEach((button, index) => this.addButton(button, 620 + index * 130));

    this.game.events.on(SBPLAY_EVENTS.PAUSE, () => {
      state.paused = true;
    });
    this.game.events.on(SBPLAY_EVENTS.RESUME, () => {
      state.paused = false;
      state.resumed += 1;
    });
    this.game.events.on(SBPLAY_EVENTS.SAFE_AREA, (insets: { bottom: number }) => {
      state.safeAreaBottom = insets.bottom;
    });

    void this.sbplay.ready.then((session) => {
      state.environment = session?.environment ?? 'none';
      this.status.setText(session ? `환경: ${session.environment}` : '게임존 밖이에요');
    });
  }

  private addButton(button: ButtonSpec, y: number): void {
    const background = this.add.rectangle(WIDTH / 2, y, 620, 104, button.color).setInteractive({ useHandCursor: true });
    this.add.text(WIDTH / 2, y, button.label, { fontFamily: 'sans-serif', fontSize: '32px', color: '#ffffff' }).setOrigin(0.5);
    background.on('pointerup', () => {
      button.run().catch((error: { code?: string; message?: string }) => {
        state.log.push(`실패 ${error.code ?? ''} ${error.message ?? ''}`);
      });
    });
  }

  private renderWallet(): void {
    this.wallet?.setText(`젬 ${state.gems} · 광고 보상 ${state.rewards} · 미션 ${state.missions}`);
  }

  private async showRewarded(): Promise<void> {
    const result = await this.sbplay.ads.showRewarded('continue');
    if (result.rewarded) state.rewards += 1;
    this.renderWallet();
  }

  private async purchase(): Promise<void> {
    const order = await this.sbplay.store.purchase('gem_300');
    if (order.status !== 'paid') return;
    state.gems += 300;
    this.renderWallet();
    await this.sbplay.store.completeOrder(order.orderId);
  }

  private async finishStage(): Promise<void> {
    const result = await this.sbplay.missions.track('stage_clear', 1);
    if (result.accepted) state.missions += 1;
    this.renderWallet();
  }
}

window.sampleGame = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#14101f',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  plugins: { global: [superboxPlayPlugin()] },
  scene: [BootScene, PreloadScene, MainScene],
} as Phaser.Types.Core.GameConfig);
