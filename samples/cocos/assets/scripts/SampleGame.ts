import {
  _decorator,
  Camera,
  Canvas,
  Color,
  Component,
  Graphics,
  gfx,
  ImageAsset,
  Label,
  Layers,
  Node,
  ResolutionPolicy,
  resources,
  screen,
  UITransform,
  Vec3,
  view,
} from 'cc';
import { SuperboxPlay } from 'db://superbox-play/SuperboxPlay';

/**
 * Cocos 샘플 — 씬에 든 것은 이 스크립트 하나고 화면은 코드로 그린다(샘플을 작게 두려고).
 * 첫 씬 뒤에 자원을 더 받으므로 로딩 화면을 잡아 두었다가(holdLoading) 다 받으면 닫는다.
 */
const { ccclass } = _decorator;

SuperboxPlay.holdLoading();

const UI_LAYER = Layers.Enum.UI_2D;
const DESIGN_WIDTH = 720;
const DESIGN_HEIGHT = 1280;
const BUTTON_WIDTH = 620;
const BUTTON_HEIGHT = 104;
const BACKGROUND = new Color(15, 26, 28, 255);

interface SampleState {
  gems: number;
  rewards: number;
  missions: number;
  paused: boolean;
  resumed: number;
  environment: string;
  tiles: number;
  log: string[];
}

const state: SampleState = { gems: 0, rewards: 0, missions: 0, paused: false, resumed: 0, environment: '', tiles: 0, log: [] };
(globalThis as unknown as { sampleState: SampleState }).sampleState = state;

@ccclass('SampleGame')
export class SampleGame extends Component {
  private wallet: Label | null = null;
  private status: Label | null = null;

  onLoad(): void {
    // 프로젝트 설정은 너비 맞춤이다 — 세로형 UI 가 가로로 넓은 창(데스크톱)에서 위아래로 잘리지 않게 높이에 맞춘다
    const frame = screen.windowSize;
    if (frame.width / frame.height > DESIGN_WIDTH / DESIGN_HEIGHT) view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_HEIGHT);
    const size = view.getVisibleSize();
    const camera = this.createCamera(size.height);
    const canvas = this.createCanvas(camera);
    this.status = this.addLabel(canvas, '게임존과 연결하는 중…', new Vec3(0, 360, 0), 26);
    this.wallet = this.addLabel(canvas, '', new Vec3(0, 300, 0), 34);
    this.addButton(canvas, '보상형 광고', new Vec3(0, 120, 0), new Color(20, 184, 166, 255), () => this.showRewarded());
    this.addButton(canvas, '젬 300 구매', new Vec3(0, -10, 0), new Color(38, 58, 60, 255), () => this.purchase());
    this.addButton(canvas, '한 판 끝(미션)', new Vec3(0, -140, 0), new Color(38, 58, 60, 255), () => this.finishStage());
    this.renderWallet();
  }

  start(): void {
    SuperboxPlay.on('app.pause', () => {
      state.paused = true;
    });
    SuperboxPlay.on('app.resume', () => {
      state.paused = false;
      state.resumed += 1;
    });
    void SuperboxPlay.init().then((session) => {
      state.environment = session?.environment ?? 'none';
      if (this.status) this.status.string = session ? `환경: ${session.environment}` : '게임존 밖이에요';
    });
    resources.loadDir(
      'generated',
      ImageAsset,
      (finished: number, total: number) => {
        state.tiles = finished;
        SuperboxPlay.reportProgress(finished, total);
      },
      (error: Error | null) => {
        if (error) {
          SuperboxPlay.loading?.error(error);
          return;
        }
        SuperboxPlay.completeLoading();
      },
    );
  }

  private createCamera(height: number): Camera {
    const node = new Node('Camera');
    node.layer = UI_LAYER;
    node.setParent(this.node);
    node.setPosition(0, 0, 1000);
    const camera = node.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = height / 2;
    camera.near = 1;
    camera.far = 2000;
    camera.visibility = UI_LAYER;
    camera.clearFlags = gfx.ClearFlagBit.COLOR;
    camera.clearColor = BACKGROUND;
    return camera;
  }

  private createCanvas(camera: Camera): Node {
    const node = new Node('Canvas');
    node.layer = UI_LAYER;
    node.setParent(this.node);
    node.addComponent(UITransform);
    const canvas = node.addComponent(Canvas);
    canvas.cameraComponent = camera;
    return node;
  }

  private addLabel(parent: Node, text: string, position: Vec3, fontSize: number): Label {
    const node = new Node('Label');
    node.layer = UI_LAYER;
    node.setParent(parent);
    node.setPosition(position);
    node.addComponent(UITransform);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 8;
    label.color = new Color(255, 255, 255, 255);
    return label;
  }

  private addButton(parent: Node, text: string, position: Vec3, color: Color, run: () => Promise<void>): void {
    const node = new Node(text);
    node.layer = UI_LAYER;
    node.setParent(parent);
    node.setPosition(position);
    node.addComponent(UITransform).setContentSize(BUTTON_WIDTH, BUTTON_HEIGHT);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = color;
    graphics.roundRect(-BUTTON_WIDTH / 2, -BUTTON_HEIGHT / 2, BUTTON_WIDTH, BUTTON_HEIGHT, 24);
    graphics.fill();
    this.addLabel(node, text, new Vec3(0, 0, 0), 32);
    node.on(Node.EventType.TOUCH_END, () => {
      run().catch((error: { code?: string; message?: string }) => {
        state.log.push(`실패 ${error.code ?? ''} ${error.message ?? ''}`);
      });
    });
  }

  private renderWallet(): void {
    if (this.wallet) this.wallet.string = `젬 ${state.gems} · 광고 보상 ${state.rewards} · 미션 ${state.missions}`;
  }

  private async showRewarded(): Promise<void> {
    const result = await SuperboxPlay.ads.showRewarded('continue');
    if (result.rewarded) state.rewards += 1;
    this.renderWallet();
  }

  private async purchase(): Promise<void> {
    const order = await SuperboxPlay.store.purchase('gem_300');
    if (order.status !== 'paid') return;
    state.gems += 300;
    this.renderWallet();
    await SuperboxPlay.store.completeOrder(order.orderId);
  }

  private async finishStage(): Promise<void> {
    const result = await SuperboxPlay.missions.track('stage_clear', 1);
    if (result.accepted) state.missions += 1;
    this.renderWallet();
  }
}
