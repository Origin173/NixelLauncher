import { useEffect, useRef, useState } from 'react';
import type { SkinViewer } from 'skinview3d';
import { errorMessage } from '../../../shared/error-message';
import { tr } from '../../../shared/i18n';
import type { SkinModel } from '../../../shared/skins';
import { Notice } from '../ui';

export function SkinPreview({
  skin,
  model,
  cape,
}: {
  skin: string;
  model: SkinModel;
  cape?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let viewer: SkinViewer | undefined;
    const images: HTMLImageElement[] = [];
    const loadImage = async (source: string) => {
      const image = new Image();
      images.push(image);
      image.crossOrigin = 'anonymous';
      image.src = source;
      await image.decode();
      return image;
    };
    const resize = () => {
      if (viewer && container.current) viewer.width = Math.min(container.current.clientWidth, 340);
    };
    const observer = new ResizeObserver(resize);
    if (container.current) observer.observe(container.current);
    setError('');
    void Promise.all([import('skinview3d'), loadImage(skin), cape ? loadImage(cape) : undefined])
      .then(([{ SkinViewer }, skinImage, capeImage]) => {
        if (!active || !canvas.current) return;
        viewer = new SkinViewer({ canvas: canvas.current, width: 300, height: 320, zoom: 0.8 });
        viewer.playerObject.rotation.y = 0.35;
        viewer.controls.enablePan = false;
        resize();
        viewer.loadSkin(skinImage, { model: model === 'classic' ? 'default' : 'slim' });
        if (capeImage) viewer.loadCape(capeImage);
      })
      .catch((error) => {
        if (active) setError(errorMessage(error));
      });
    return () => {
      active = false;
      observer.disconnect();
      viewer?.dispose();
      for (const image of images) image.src = '';
    };
  }, [skin, model, cape]);
  return (
    <div ref={container} className="stack-tight" style={{ minWidth: 0 }}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={tr('skins.current')}
        style={{ maxWidth: '100%', touchAction: 'none' }}
      />
      {error ? (
        <Notice tone="danger">{tr('skins.previewFailed', { message: error })}</Notice>
      ) : (
        <p className="micro muted">{tr('skins.drag')}</p>
      )}
    </div>
  );
}
