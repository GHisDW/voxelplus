import { SkinViewer } from 'skinview3d';

let viewer: SkinViewer | null = null;

export function initSkinViewer(
  canvas: HTMLCanvasElement,
  skinUrl: string,
  model: 'steve' | 'alex' = 'steve'
): SkinViewer {
  if (viewer) {
    viewer.dispose();
    viewer = null;
  }

  viewer = new SkinViewer({
    canvas,
    width: 280,
    height: 360,
    skin: skinUrl,
  });

  viewer.fov = 45;
  viewer.zoom = 0.8;
  viewer.autoRotate = false;

  viewer.controls.enableRotate = true;
  viewer.controls.enableZoom = false;
  viewer.controls.enablePan = false;

  viewer.loadSkin(skinUrl, {
    model: model === 'alex' ? 'slim' : 'default',
  });

  return viewer;
}

export function destroySkinViewer(): void {
  if (viewer) {
    viewer.dispose();
    viewer = null;
  }
}
