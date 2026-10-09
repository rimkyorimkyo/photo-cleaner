/**
 * Generates aesthetic procedural sample photos for instant demonstration.
 * Includes burst shots (similar images), screenshots, food, and travel photos.
 */

import { computeDHash, createThumbnail } from './optimizer.js';

function createProceduralImage(width, height, drawFn) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    drawFn(ctx, width, height);

    canvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/jpeg', 0.95);
  });
}

export async function generateSamplePhotos() {
  const samples = [];

  // 1. Burst Shots (Similar Sunset Beach - 3 consecutive photos)
  for (let i = 1; i <= 3; i++) {
    const blob = await createProceduralImage(1600, 1200, (ctx, w, h) => {
      // Sunset Sky
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#f97316');
      grad.addColorStop(0.4, '#fb923c');
      grad.addColorStop(0.7, '#f43f5e');
      grad.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Sun
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(w * 0.5 + (i * 10), h * 0.45, 90, 0, Math.PI * 2);
      ctx.fill();

      // Sea
      const seaGrad = ctx.createLinearGradient(0, h * 0.6, 0, h);
      seaGrad.addColorStop(0, '#0284c7');
      seaGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = seaGrad;
      ctx.fillRect(0, h * 0.6, w, h * 0.4);

      // Waves & Reflection
      ctx.fillStyle = 'rgba(254, 240, 138, 0.25)';
      ctx.fillRect(w * 0.42 + (i * 8), h * 0.6, 260, h * 0.4);

      // Text Badge
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText(`연속 촬영 #${i} (노을 해변)`, 60, h - 60);
    });

    const { thumbBlob, origWidth, origHeight } = await createThumbnail(blob);
    const dhash = await computeDHash(blob);

    samples.push({
      id: 'sample_sunset_' + i,
      name: `IMG_20261009_노을해변_연사0${i}.jpg`,
      size: blob.size + 1500000, // Make realistic ~2.2MB
      blob: blob,
      thumbnail: thumbBlob,
      width: origWidth,
      height: origHeight,
      folderId: '',
      isTrash: false,
      dhash: dhash,
      createdAt: Date.now() - (1000 * 60 * 60 * 3) + (i * 1200)
    });
  }

  // 2. Travel - Jeju Mountain & Sea
  {
    const blob = await createProceduralImage(1600, 1200, (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#38bdf8');
      grad.addColorStop(0.6, '#bae6fd');
      grad.addColorStop(1, '#059669');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Mountain
      ctx.fillStyle = '#065f46';
      ctx.beginPath();
      ctx.moveTo(w * 0.1, h * 0.7);
      ctx.lineTo(w * 0.5, h * 0.25);
      ctx.lineTo(w * 0.9, h * 0.7);
      ctx.fill();

      // Clouds
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.arc(w * 0.3, h * 0.2, 80, 0, Math.PI * 2);
      ctx.arc(w * 0.4, h * 0.18, 100, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = 'bold 36px sans-serif';
      ctx.fillStyle = 'white';
      ctx.fillText('제주도 한라산 풍경', 60, h - 60);
    });

    const { thumbBlob, origWidth, origHeight } = await createThumbnail(blob);
    const dhash = await computeDHash(blob);
    samples.push({
      id: 'sample_travel_1',
      name: 'IMG_20261008_제주여행.jpg',
      size: blob.size + 2400000,
      blob,
      thumbnail: thumbBlob,
      width: origWidth,
      height: origHeight,
      folderId: '',
      isTrash: false,
      dhash,
      createdAt: Date.now() - (1000 * 60 * 60 * 24 * 2)
    });
  }

  // 3. Cafe Coffee & Dessert
  {
    const blob = await createProceduralImage(1200, 1200, (ctx, w, h) => {
      // Wood table background
      ctx.fillStyle = '#78350f';
      ctx.fillRect(0, 0, w, h);

      // Plate
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.5, 360, 0, Math.PI * 2);
      ctx.fill();

      // Cake Slice
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.5);
      ctx.lineTo(w * 0.75, h * 0.3);
      ctx.lineTo(w * 0.75, h * 0.7);
      ctx.closePath();
      ctx.fill();

      // Coffee Cup
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(w * 0.25, h * 0.3, 120, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3f1d0b';
      ctx.beginPath();
      ctx.arc(w * 0.25, h * 0.3, 100, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = 'bold 36px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('주말 성수동 디저트 카페', 60, h - 60);
    });

    const { thumbBlob, origWidth, origHeight } = await createThumbnail(blob);
    const dhash = await computeDHash(blob);
    samples.push({
      id: 'sample_food_1',
      name: 'IMG_20261007_성수카페.jpg',
      size: blob.size + 1900000,
      blob,
      thumbnail: thumbBlob,
      width: origWidth,
      height: origHeight,
      folderId: '',
      isTrash: false,
      dhash,
      createdAt: Date.now() - (1000 * 60 * 60 * 24 * 3)
    });
  }

  // 4. Smartphone Screenshot
  {
    const blob = await createProceduralImage(1080, 2400, (ctx, w, h) => {
      // Mobile UI Mockup
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);

      // Status Bar
      ctx.fillStyle = '#334155';
      ctx.fillRect(0, 0, w, 80);

      // Message bubbles
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.roundRect(80, 240, 700, 180, 30);
      ctx.fill();

      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(300, 480, 700, 180, 30);
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 42px sans-serif';
      ctx.fillText('모바일 메신저 대화 캡처', 120, 340);
      ctx.fillText('내일 약속 장소 확인용 스크린샷', 340, 580);
    });

    const { thumbBlob, origWidth, origHeight } = await createThumbnail(blob);
    const dhash = await computeDHash(blob);
    samples.push({
      id: 'sample_screenshot_1',
      name: 'Screenshot_20261009-142231.png',
      size: blob.size + 1200000,
      blob,
      thumbnail: thumbBlob,
      width: origWidth,
      height: origHeight,
      folderId: '',
      isTrash: false,
      dhash,
      createdAt: Date.now() - (1000 * 60 * 60 * 5)
    });
  }

  // 5. Store Receipt / Document
  {
    const blob = await createProceduralImage(1200, 1800, (ctx, w, h) => {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 44px monospace';
      ctx.fillText('=== 마트 구매 영수증 ===', w * 0.15, 180);
      ctx.font = '32px monospace';
      ctx.fillText('일시: 2026-10-09 19:24', w * 0.15, 260);
      ctx.fillText('--------------------------------', w * 0.15, 320);
      ctx.fillText('생수 2L x 6           4,500원', w * 0.15, 400);
      ctx.fillText('유기농 사과 (1봉)      9,800원', w * 0.15, 480);
      ctx.fillText('신선 우유 1L          2,900원', w * 0.15, 560);
      ctx.fillText('--------------------------------', w * 0.15, 640);
      ctx.font = 'bold 40px monospace';
      ctx.fillText('합계 금액:           17,200원', w * 0.15, 740);
    });

    const { thumbBlob, origWidth, origHeight } = await createThumbnail(blob);
    const dhash = await computeDHash(blob);
    samples.push({
      id: 'sample_receipt_1',
      name: 'Receipt_20261009_마트영수증.jpg',
      size: blob.size + 800000,
      blob,
      thumbnail: thumbBlob,
      width: origWidth,
      height: origHeight,
      folderId: '',
      isTrash: false,
      dhash,
      createdAt: Date.now() - (1000 * 60 * 60 * 12)
    });
  }

  return samples;
}
