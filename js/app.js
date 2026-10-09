/**
 * Photo Cleaner Main Application
 * Modern Mobile-First Photo Storage Manager
 */

import {
  openDB,
  getAllPhotos,
  getAllFolders,
  addPhotos,
  addFolder,
  deleteFolder,
  updatePhoto,
  batchMovePhotos,
  batchTrashPhotos,
  batchPermanentDelete,
  clearTrash,
  getStorageStats
} from './db.js';

import {
  formatBytes,
  createThumbnail,
  computeDHash,
  groupSimilarPhotos,
  compressImage
} from './optimizer.js';

import { generateSamplePhotos } from './sampleData.js';
import { ICONS, showToast, openSheet, closeSheet, openViewer } from './ui.js';

class PhotoCleanerApp {
  constructor() {
    this.photos = [];
    this.folders = [];
    this.currentTab = 'photos'; // 'photos' | 'folders' | 'smart' | 'trash'
    this.activeFolderId = ''; // '' means all, '__unorganized__' means no folder
    this.selectedPhotoIds = new Set();
    this.isSelectMode = false;
    this.stats = {};

    this.init();
  }

  async init() {
    await openDB();
    this.bindDomEvents();
    await this.refreshData();
    this.render();
  }

  async refreshData() {
    this.photos = await getAllPhotos();
    this.folders = await getAllFolders();
    this.stats = await getStorageStats();
  }

  bindDomEvents() {
    // Tab Navigation
    document.querySelectorAll('.nav-tab-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });

    // File Input Import (Multiple Photos)
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', (e) => this.handleFileImport(e.target.files));

    // Sample Data Button
    document.getElementById('btnLoadSamples').addEventListener('click', () => this.loadSamples());

    // Toggle Select Mode
    document.getElementById('btnToggleSelect').addEventListener('click', () => {
      this.toggleSelectMode(!this.isSelectMode);
    });

    // Multi-Select Floating Action Bar Buttons
    document.getElementById('fabSelectAll').addEventListener('click', () => this.toggleSelectAll());
    document.getElementById('fabMoveBtn').addEventListener('click', () => this.openMoveFolderSheet());
    document.getElementById('fabCompressBtn').addEventListener('click', () => this.batchCompressSelected());
    document.getElementById('fabDeleteBtn').addEventListener('click', () => this.batchTrashSelected());
    document.getElementById('fabDownloadBtn').addEventListener('click', () => this.batchDownloadZip());

    // Connect Phone Modal
    document.getElementById('btnConnectPhone').addEventListener('click', () => this.openConnectModal());
    document.getElementById('modalCloseBtn').addEventListener('click', () => {
      document.getElementById('connectModal').classList.remove('open');
    });

    // Sheet close
    document.getElementById('sheetCloseBtn').addEventListener('click', closeSheet);
    document.getElementById('sheetOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'sheetOverlay') closeSheet();
    });

    // Drag and Drop files onto container
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        this.handleFileImport(e.dataTransfer.files);
      }
    });
  }

  switchTab(tab) {
    this.currentTab = tab;
    this.selectedPhotoIds.clear();
    this.updateFabState();

    document.querySelectorAll('.nav-tab-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    this.render();
  }

  toggleSelectMode(enable) {
    this.isSelectMode = enable;
    const btn = document.getElementById('btnToggleSelect');
    if (enable) {
      btn.classList.add('active');
      btn.innerHTML = `${ICONS.check} 선택 취소`;
    } else {
      btn.classList.remove('active');
      btn.innerHTML = `선택`;
      this.selectedPhotoIds.clear();
    }
    this.updateFabState();
    this.renderPhotosGrid();
  }

  toggleSelectAll() {
    const activePhotos = this.getFilteredPhotos();
    if (this.selectedPhotoIds.size === activePhotos.length) {
      this.selectedPhotoIds.clear();
    } else {
      activePhotos.forEach(p => this.selectedPhotoIds.add(p.id));
    }
    this.updateFabState();
    this.renderPhotosGrid();
  }

  updateFabState() {
    const fab = document.getElementById('floatingActionBar');
    const countEl = document.getElementById('fabSelectedCount');
    const sizeEl = document.getElementById('fabSelectedSize');
    const count = this.selectedPhotoIds.size;

    if (count > 0) {
      fab.classList.add('visible');
      countEl.textContent = `${count}장`;

      // Calculate total bytes of selection
      let totalBytes = 0;
      this.photos.forEach(p => {
        if (this.selectedPhotoIds.has(p.id)) {
          totalBytes += (p.size || 0);
        }
      });
      sizeEl.textContent = `(${formatBytes(totalBytes)})`;
    } else {
      fab.classList.remove('visible');
    }
  }

  getFilteredPhotos() {
    let list = this.photos.filter(p => !p.isTrash);
    if (this.activeFolderId === '__unorganized__') {
      list = list.filter(p => !p.folderId);
    } else if (this.activeFolderId) {
      list = list.filter(p => p.folderId === this.activeFolderId);
    }
    return list;
  }

  async render() {
    this.renderStorageHero();

    const mainContainer = document.getElementById('mainContentArea');
    const folderCarousel = document.getElementById('folderTabsWrapper');
    const galleryControls = document.getElementById('galleryControlBar');

    if (this.currentTab === 'photos') {
      folderCarousel.style.display = 'block';
      galleryControls.style.display = 'flex';
      this.renderFolderTabs();
      this.renderPhotosGrid();
    } else if (this.currentTab === 'folders') {
      folderCarousel.style.display = 'none';
      galleryControls.style.display = 'none';
      this.renderFoldersManagement();
    } else if (this.currentTab === 'smart') {
      folderCarousel.style.display = 'none';
      galleryControls.style.display = 'none';
      this.renderSmartDiet();
    } else if (this.currentTab === 'trash') {
      folderCarousel.style.display = 'none';
      galleryControls.style.display = 'none';
      this.renderTrash();
    }
  }

  renderStorageHero() {
    const { totalBytes, trashBytes, organizedBytes, unorganizedBytes, totalCount } = this.stats;
    const totalSizeEl = document.getElementById('storageTotalNumber');
    const totalCountEl = document.getElementById('storageTotalCount');
    const savingsEl = document.getElementById('storageSavingsCount');

    totalSizeEl.textContent = formatBytes(totalBytes);
    totalCountEl.textContent = `${totalCount}장의 사진`;
    savingsEl.textContent = `${formatBytes(trashBytes)} 절약 가능`;

    // Progress Bar
    const sum = totalBytes + trashBytes || 1;
    const fillPhotos = document.getElementById('fillPhotos');
    const fillOrganized = document.getElementById('fillOrganized');
    const fillTrash = document.getElementById('fillTrash');

    fillPhotos.style.width = `${(unorganizedBytes / sum) * 100}%`;
    fillOrganized.style.width = `${(organizedBytes / sum) * 100}%`;
    fillTrash.style.width = `${(trashBytes / sum) * 100}%`;
  }

  renderFolderTabs() {
    const scrollContainer = document.getElementById('folderTabsScroll');
    scrollContainer.innerHTML = '';

    const allPhotos = this.photos.filter(p => !p.isTrash);
    const unorganizedPhotos = allPhotos.filter(p => !p.folderId);

    // 1. All photos tab
    const allTab = document.createElement('div');
    allTab.className = `folder-tab ${this.activeFolderId === '' ? 'active' : ''}`;
    allTab.innerHTML = `전체 <span class="count">${allPhotos.length}</span>`;
    allTab.onclick = () => {
      this.activeFolderId = '';
      this.renderFolderTabs();
      this.renderPhotosGrid();
    };
    scrollContainer.appendChild(allTab);

    // 2. Unorganized Tab
    const unorgTab = document.createElement('div');
    unorgTab.className = `folder-tab ${this.activeFolderId === '__unorganized__' ? 'active' : ''}`;
    unorgTab.innerHTML = `미분류 <span class="count">${unorganizedPhotos.length}</span>`;
    unorgTab.onclick = () => {
      this.activeFolderId = '__unorganized__';
      this.renderFolderTabs();
      this.renderPhotosGrid();
    };
    scrollContainer.appendChild(unorgTab);

    // 3. User Folders
    this.folders.forEach(folder => {
      const folderPhotos = allPhotos.filter(p => p.folderId === folder.id);
      const tab = document.createElement('div');
      tab.className = `folder-tab ${this.activeFolderId === folder.id ? 'active' : ''}`;
      tab.innerHTML = `${folder.icon || '📁'} ${folder.name} <span class="count">${folderPhotos.length}</span>`;
      tab.onclick = () => {
        this.activeFolderId = folder.id;
        this.renderFolderTabs();
        this.renderPhotosGrid();
      };
      scrollContainer.appendChild(tab);
    });

    // 4. Add Folder Button
    const addTab = document.createElement('div');
    addTab.className = 'folder-tab folder-tab-add';
    addTab.innerHTML = `${ICONS.plus} 새 폴더`;
    addTab.onclick = () => this.openCreateFolderSheet();
    scrollContainer.appendChild(addTab);
  }

  renderPhotosGrid() {
    const container = document.getElementById('mainContentArea');
    const filtered = this.getFilteredPhotos();

    document.getElementById('galleryCountBadge').textContent = `${filtered.length}장`;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-gallery">
          <div class="empty-icon-wrap">${ICONS.photos}</div>
          <h3>사진이 없습니다</h3>
          <p>핸드폰 사진첩에서 사진을 추가하거나 테스트용 샘플 사진을 불러와 보세요.</p>
          <button class="btn btn-primary" onclick="document.getElementById('fileInput').click()">
            ${ICONS.plus} 사진 추가하기
          </button>
        </div>
      `;
      return;
    }

    let gridHtml = `<div class="photo-grid">`;
    filtered.forEach(photo => {
      const isSelected = this.selectedPhotoIds.has(photo.id);
      const thumbUrl = URL.createObjectURL(photo.thumbnail || photo.blob);
      const folder = this.folders.find(f => f.id === photo.folderId);

      gridHtml += `
        <div class="photo-card ${isSelected ? 'selected' : ''}" data-id="${photo.id}">
          <img class="photo-img" src="${thumbUrl}" alt="${photo.name}" loading="lazy" />
          <div class="select-check">${ICONS.check}</div>
          <div class="card-overlay-bottom">
            <span class="photo-size-badge">${formatBytes(photo.size)}</span>
            ${folder ? `<span class="folder-indicator-badge">${folder.icon} ${folder.name}</span>` : ''}
          </div>
        </div>
      `;
    });
    gridHtml += `</div>`;

    container.innerHTML = gridHtml;

    // Attach click and long-touch handlers
    container.querySelectorAll('.photo-card').forEach(card => {
      const photoId = card.dataset.id;
      const photo = this.photos.find(p => p.id === photoId);

      let pressTimer = null;

      // Click event
      card.addEventListener('click', (e) => {
        if (this.isSelectMode) {
          this.toggleSelectPhoto(photoId);
        } else {
          openViewer(photo, (id) => this.trashSinglePhoto(id));
        }
      });

      // Long press triggers select mode
      card.addEventListener('touchstart', () => {
        pressTimer = setTimeout(() => {
          if (!this.isSelectMode) {
            this.toggleSelectMode(true);
            this.toggleSelectPhoto(photoId);
            if (navigator.vibrate) navigator.vibrate(40);
          }
        }, 500);
      });

      card.addEventListener('touchend', () => clearTimeout(pressTimer));
      card.addEventListener('touchmove', () => clearTimeout(pressTimer));
    });
  }

  toggleSelectPhoto(photoId) {
    if (this.selectedPhotoIds.has(photoId)) {
      this.selectedPhotoIds.delete(photoId);
    } else {
      this.selectedPhotoIds.add(photoId);
    }
    this.updateFabState();
    
    // Efficiently toggle class instead of full rerender
    const card = document.querySelector(`.photo-card[data-id="${photoId}"]`);
    if (card) {
      card.classList.toggle('selected', this.selectedPhotoIds.has(photoId));
    }
  }

  async handleFileImport(files) {
    if (!files || files.length === 0) return;

    showToast(`${files.length}장의 사진을 분석 및 등록 중입니다...`);

    const newPhotos = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      try {
        const { thumbBlob, origWidth, origHeight } = await createThumbnail(file);
        const dhash = await computeDHash(file);

        newPhotos.push({
          id: 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          name: file.name,
          size: file.size,
          blob: file,
          thumbnail: thumbBlob,
          width: origWidth,
          height: origHeight,
          folderId: this.activeFolderId === '__unorganized__' ? '' : this.activeFolderId,
          isTrash: false,
          dhash: dhash,
          createdAt: file.lastModified || Date.now()
        });
      } catch (err) {
        console.error('File import error:', err);
      }
    }

    if (newPhotos.length > 0) {
      await addPhotos(newPhotos);
      await this.refreshData();
      showToast(`${newPhotos.length}장의 사진을 안전하게 불러왔습니다!`, 'success');
      this.render();
    }
  }

  async loadSamples() {
    showToast('감성적인 데모 샘플 사진을 생성 중입니다...');
    const samples = await generateSamplePhotos();
    await addPhotos(samples);
    await this.refreshData();
    showToast('샘플 사진이 추가되었습니다! 바로 정리해보세요.', 'success');
    this.render();
  }

  // ----------------- FOLDER MANAGEMENT -----------------
  renderFoldersManagement() {
    const container = document.getElementById('mainContentArea');
    const allPhotos = this.photos.filter(p => !p.isTrash);

    let html = `
      <div style="padding: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="font-size: 1.2rem; font-weight: 700;">📂 폴더 및 앨범 관리</h2>
          <button class="btn btn-primary" id="btnAddNewFolderInView">
            ${ICONS.plus} 새 폴더 추가
          </button>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px;">
    `;

    this.folders.forEach(folder => {
      const folderPhotos = allPhotos.filter(p => p.folderId === folder.id);
      const totalSize = folderPhotos.reduce((acc, cur) => acc + cur.size, 0);

      html += `
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; display: flex; flex-direction: column; justify-content: space-between; gap: 10px;">
          <div>
            <div style="font-size: 2rem; margin-bottom: 6px;">${folder.icon}</div>
            <div style="font-weight: 700; font-size: 1rem; color: #fff;">${folder.name}</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">${folderPhotos.length}장 (${formatBytes(totalSize)})</div>
          </div>
          <div style="display: flex; gap: 6px; margin-top: 8px;">
            <button class="btn btn-secondary" style="flex: 1; padding: 6px;" onclick="window.app.viewFolderPhotos('${folder.id}')">보기</button>
            <button class="btn btn-danger btn-icon" style="width: 32px; height: 32px;" onclick="window.app.deleteFolderConfirm('${folder.id}')">${ICONS.trash}</button>
          </div>
        </div>
      `;
    });

    html += `</div></div>`;
    container.innerHTML = html;

    document.getElementById('btnAddNewFolderInView').addEventListener('click', () => this.openCreateFolderSheet());
  }

  viewFolderPhotos(folderId) {
    this.currentTab = 'photos';
    this.activeFolderId = folderId;
    this.render();
  }

  async deleteFolderConfirm(folderId) {
    if (confirm('이 폴더를 삭제하시겠습니까? (폴더 안의 사진은 미분류로 이동됩니다)')) {
      await deleteFolder(folderId);
      await this.refreshData();
      showToast('폴더가 삭제되었습니다.', 'info');
      this.renderFoldersManagement();
    }
  }

  openCreateFolderSheet() {
    const emojis = ['🏖️', '🍜', '📱', '📄', '👥', '🌿', '🐶', '💼', '🚗', '⛺', '🎉', '🎨'];
    let emojiHtml = emojis.map((e, idx) => `
      <button type="button" class="btn btn-secondary emoji-select-btn ${idx === 0 ? 'active' : ''}" data-emoji="${e}" style="font-size: 1.4rem; padding: 6px;">
        ${e}
      </button>
    `).join('');

    const content = `
      <form id="createFolderForm" style="display: flex; flex-direction: column; gap: 14px;">
        <div>
          <label style="font-size: 0.85rem; color: var(--text-secondary); display: block; margin-bottom: 6px;">폴더 이름</label>
          <input type="text" id="newFolderNameInput" placeholder="예: 제주도 여행, 고양이, 계약서 등" required
            style="width: 100%; padding: 12px; border-radius: var(--radius-md); background: rgba(255,255,255,0.06); border: 1px solid var(--border-color); color: #fff; font-size: 0.95rem; outline: none;" />
        </div>
        <div>
          <label style="font-size: 0.85rem; color: var(--text-secondary); display: block; margin-bottom: 6px;">아이콘 선택</label>
          <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px;">
            ${emojiHtml}
          </div>
        </div>
        <button type="submit" class="btn btn-primary" style="padding: 12px; margin-top: 10px;">
          새 폴더 만들기
        </button>
      </form>
    `;

    openSheet('새 폴더 생성', content);

    let selectedEmoji = '🏖️';
    document.querySelectorAll('.emoji-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.emoji-select-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedEmoji = btn.dataset.emoji;
      });
    });

    document.getElementById('createFolderForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('newFolderNameInput').value.trim();
      if (!name) return;

      const newFolder = {
        id: 'folder_' + Date.now(),
        name,
        icon: selectedEmoji,
        color: '#6366f1',
        createdAt: Date.now()
      };

      await addFolder(newFolder);
      await this.refreshData();
      closeSheet();
      showToast(`'${name}' 폴더가 생성되었습니다.`, 'success');
      this.render();
    });
  }

  // ----------------- BATCH ACTIONS -----------------
  openMoveFolderSheet() {
    if (this.selectedPhotoIds.size === 0) return;

    let foldersHtml = `
      <div class="folder-pick-item" data-folder-id="">
        <div class="folder-icon">📂</div>
        <div class="folder-info">
          <div class="folder-name">미분류</div>
          <div class="folder-subtext">폴더 지정 해제</div>
        </div>
      </div>
    `;

    this.folders.forEach(f => {
      foldersHtml += `
        <div class="folder-pick-item" data-folder-id="${f.id}">
          <div class="folder-icon">${f.icon}</div>
          <div class="folder-info">
            <div class="folder-name">${f.name}</div>
            <div class="folder-subtext">이동하기</div>
          </div>
        </div>
      `;
    });

    const content = `
      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 10px;">
        선택한 <strong>${this.selectedPhotoIds.size}장</strong>의 사진을 보낼 폴더를 선택하세요:
      </p>
      <div class="folder-picker-grid">
        ${foldersHtml}
      </div>
    `;

    openSheet('폴더로 사진 이동', content);

    document.querySelectorAll('.folder-pick-item').forEach(item => {
      item.addEventListener('click', async () => {
        const targetId = item.dataset.folderId;
        await batchMovePhotos(Array.from(this.selectedPhotoIds), targetId);
        await this.refreshData();
        closeSheet();
        showToast(`${this.selectedPhotoIds.size}장의 사진을 폴더로 이동했습니다!`, 'success');
        this.selectedPhotoIds.clear();
        this.updateFabState();
        this.render();
      });
    });
  }

  async batchTrashSelected() {
    if (this.selectedPhotoIds.size === 0) return;
    const count = this.selectedPhotoIds.size;

    await batchTrashPhotos(Array.from(this.selectedPhotoIds), true);
    await this.refreshData();
    showToast(`${count}장의 사진을 휴지통으로 이동했습니다.`, 'danger');
    this.selectedPhotoIds.clear();
    this.updateFabState();
    this.render();
  }

  async trashSinglePhoto(photoId) {
    await batchTrashPhotos([photoId], true);
    await this.refreshData();
    showToast('사진을 휴지통으로 이동했습니다.', 'danger');
    this.render();
  }

  async batchCompressSelected() {
    if (this.selectedPhotoIds.size === 0) return;

    const count = this.selectedPhotoIds.size;
    showToast(`${count}장의 사진 용량을 최적화 압축하는 중...`);

    let totalSaved = 0;
    for (const id of this.selectedPhotoIds) {
      const photo = this.photos.find(p => p.id === id);
      if (!photo) continue;

      try {
        const res = await compressImage(photo.blob, 0.8, 1920);
        totalSaved += res.savedBytes;

        photo.blob = res.blob;
        photo.size = res.size;
        photo.width = res.width;
        photo.height = res.height;

        const thumb = await createThumbnail(res.blob);
        photo.thumbnail = thumb.thumbBlob;

        await updatePhoto(photo);
      } catch (err) {
        console.error('Compression failed for photo:', id, err);
      }
    }

    await this.refreshData();
    showToast(`용량 다이어트 성공! 총 ${formatBytes(totalSaved)}를 절약했습니다.`, 'success');
    this.selectedPhotoIds.clear();
    this.updateFabState();
    this.render();
  }

  async batchDownloadZip() {
    if (this.selectedPhotoIds.size === 0) return;

    if (typeof JSZip === 'undefined') {
      showToast('ZIP 생성 라이브러리를 불러오지 못했습니다.', 'danger');
      return;
    }

    showToast(`${this.selectedPhotoIds.size}장의 사진을 ZIP으로 압축 중입니다...`);
    const zip = new JSZip();

    for (const id of this.selectedPhotoIds) {
      const photo = this.photos.find(p => p.id === id);
      if (!photo) continue;

      const folder = this.folders.find(f => f.id === photo.folderId);
      const folderPrefix = folder ? `${folder.name}/` : '';
      zip.file(`${folderPrefix}${photo.name}`, photo.blob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(zipBlob);
    link.download = `포토클리너_정리본_${Date.now()}.zip`;
    link.click();

    showToast('ZIP 다운로드가 시작되었습니다!', 'success');
  }

  // ----------------- SMART DIET & DUPLICATES -----------------
  renderSmartDiet() {
    const container = document.getElementById('mainContentArea');
    const allPhotos = this.photos.filter(p => !p.isTrash);

    // 1. Similar / Burst Photos
    const similarGroups = groupSimilarPhotos(allPhotos, 10);

    // 2. Heavy Photos (> 2MB)
    const heavyPhotos = allPhotos.filter(p => p.size > 2 * 1024 * 1024);

    let html = `
      <div style="padding: 16px; display: flex; flex-direction: column; gap: 20px;">
        <div style="background: var(--bg-card); padding: 18px; border-radius: var(--radius-lg); border: 1px solid var(--border-color);">
          <h2 style="font-size: 1.25rem; font-weight: 800; display: flex; align-items: center; gap: 8px;">
            ${ICONS.cleaner} 스마트 용량 다이어트
          </h2>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">
            인공지능 분석으로 연속 촬영/비슷한 사진을 묶고, 대용량 사진을 찾아 용량을 극대화합니다.
          </p>
        </div>
    `;

    // Duplicate Section
    html += `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="font-size: 1rem; font-weight: 700; color: #fff;">
            🔍 연속/비슷한 사진 감지 (${similarGroups.length}개 그룹)
          </h3>
        </div>
    `;

    if (similarGroups.length === 0) {
      html += `
        <div style="background: rgba(255,255,255,0.03); border: 1px dashed var(--border-color); border-radius: var(--radius-md); padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.88rem;">
          중복되거나 비슷한 사진이 발견되지 않았습니다. 👍
        </div>
      `;
    } else {
      similarGroups.forEach((group, gIdx) => {
        const groupSize = group.reduce((a, b) => a + b.size, 0);
        html += `
          <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <span style="font-weight: 700; font-size: 0.9rem; color: #fbbf24;">
                ⚡ 유사 묶음 #${gIdx + 1} (${group.length}장, ${formatBytes(groupSize)})
              </span>
              <button class="btn btn-secondary" style="font-size: 0.78rem; padding: 4px 10px;" onclick="window.app.keepBestAndTrashRest('${gIdx}')">
                1장 남기고 정리
              </button>
            </div>
            <div style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px;">
        `;

        group.forEach((p, idx) => {
          const thumbUrl = URL.createObjectURL(p.thumbnail || p.blob);
          html += `
            <div style="position: relative; width: 85px; height: 85px; flex-shrink: 0; border-radius: var(--radius-sm); overflow: hidden; border: 2px solid ${idx === 0 ? '#10b981' : 'transparent'};">
              <img src="${thumbUrl}" style="width: 100%; height: 100%; object-fit: cover;" />
              ${idx === 0 ? '<span style="position: absolute; top: 2px; left: 2px; background: #10b981; color: white; font-size: 0.6rem; font-weight: 800; padding: 1px 4px; border-radius: 3px;">BEST</span>' : ''}
              <span style="position: absolute; bottom: 2px; right: 2px; background: rgba(0,0,0,0.7); font-size: 0.6rem; padding: 1px 3px; border-radius: 3px;">${formatBytes(p.size)}</span>
            </div>
          `;
        });

        html += `</div></div>`;
      });
    }
    html += `</div>`;

    // Heavy Photos Section
    html += `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="font-size: 1rem; font-weight: 700; color: #fff;">
            📦 고용량 사진 (>2MB, ${heavyPhotos.length}장)
          </h3>
          ${heavyPhotos.length > 0 ? `
            <button class="btn btn-success" style="font-size: 0.8rem; padding: 6px 12px;" onclick="window.app.compressAllHeavyPhotos()">
              ${ICONS.compress} 일괄 용량 줄이기
            </button>
          ` : ''}
        </div>
    `;

    if (heavyPhotos.length === 0) {
      html += `
        <div style="background: rgba(255,255,255,0.03); border: 1px dashed var(--border-color); border-radius: var(--radius-md); padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.88rem;">
          2MB 이상의 고용량 사진이 없습니다. 용량이 매우 최적화되어 있습니다!
        </div>
      `;
    } else {
      html += `<div class="photo-grid">`;
      heavyPhotos.forEach(p => {
        const thumbUrl = URL.createObjectURL(p.thumbnail || p.blob);
        html += `
          <div class="photo-card" onclick="window.app.viewSinglePhoto('${p.id}')">
            <img class="photo-img" src="${thumbUrl}" />
            <div class="card-overlay-bottom">
              <span class="photo-size-badge" style="background: #ef4444; color: white;">${formatBytes(p.size)}</span>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    html += `</div></div>`;
    container.innerHTML = html;

    // Cache similar groups for action handler
    this.cachedSimilarGroups = similarGroups;
  }

  async keepBestAndTrashRest(groupIndex) {
    const group = this.cachedSimilarGroups[groupIndex];
    if (!group || group.length < 2) return;

    // Keep the first (best) and trash the others
    const trashIds = group.slice(1).map(p => p.id);
    await batchTrashPhotos(trashIds, true);
    await this.refreshData();
    showToast(`베스트 컷 1장을 남기고 ${trashIds.length}장을 휴지통으로 정리했습니다!`, 'success');
    this.render();
  }

  async compressAllHeavyPhotos() {
    const allPhotos = this.photos.filter(p => !p.isTrash);
    const heavyPhotos = allPhotos.filter(p => p.size > 2 * 1024 * 1024);
    if (heavyPhotos.length === 0) return;

    this.selectedPhotoIds = new Set(heavyPhotos.map(p => p.id));
    await this.batchCompressSelected();
  }

  viewSinglePhoto(photoId) {
    const photo = this.photos.find(p => p.id === photoId);
    if (photo) {
      openViewer(photo, (id) => this.trashSinglePhoto(id));
    }
  }

  // ----------------- TRASH MANAGEMENT -----------------
  renderTrash() {
    const container = document.getElementById('mainContentArea');
    const trashPhotos = this.photos.filter(p => p.isTrash);
    const trashBytes = trashPhotos.reduce((a, b) => a + b.size, 0);

    let html = `
      <div style="padding: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div>
            <h2 style="font-size: 1.2rem; font-weight: 700;">🗑️ 휴지통 (${trashPhotos.length}장)</h2>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">비우면 <strong>${formatBytes(trashBytes)}</strong> 확보 가능</div>
          </div>
          ${trashPhotos.length > 0 ? `
            <button class="btn btn-danger" onclick="window.app.emptyTrashConfirm()">
              휴지통 비우기
            </button>
          ` : ''}
        </div>
    `;

    if (trashPhotos.length === 0) {
      html += `
        <div class="empty-gallery">
          <div class="empty-icon-wrap" style="color: #64748b;">${ICONS.trash}</div>
          <h3>휴지통이 비어 있습니다</h3>
          <p>정리할 사진을 삭제하면 이곳에 임시 보관됩니다.</p>
        </div>
      `;
    } else {
      html += `
        <div style="margin-bottom: 12px;">
          <button class="btn btn-secondary" style="font-size: 0.8rem;" onclick="window.app.restoreAllTrash()">
            ${ICONS.refresh} 전체 복원
          </button>
        </div>
        <div class="photo-grid">
      `;

      trashPhotos.forEach(p => {
        const thumbUrl = URL.createObjectURL(p.thumbnail || p.blob);
        html += `
          <div class="photo-card" style="opacity: 0.75;" onclick="window.app.openTrashItemMenu('${p.id}')">
            <img class="photo-img" src="${thumbUrl}" />
            <div class="card-overlay-bottom">
              <span class="photo-size-badge">${formatBytes(p.size)}</span>
            </div>
          </div>
        `;
      });

      html += `</div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
  }

  async emptyTrashConfirm() {
    if (confirm('휴지통을 영구히 비우시겠습니까? 삭제된 사진은 복구할 수 없습니다.')) {
      const count = await clearTrash();
      await this.refreshData();
      showToast(`휴지통을 비웠습니다. 용량이 확보되었습니다!`, 'success');
      this.render();
    }
  }

  async restoreAllTrash() {
    const trashIds = this.photos.filter(p => p.isTrash).map(p => p.id);
    await batchTrashPhotos(trashIds, false);
    await this.refreshData();
    showToast(`${trashIds.length}장의 사진을 모두 복원했습니다.`, 'info');
    this.render();
  }

  openTrashItemMenu(photoId) {
    const photo = this.photos.find(p => p.id === photoId);
    if (!photo) return;

    const content = `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <p style="font-size: 0.9rem; color: var(--text-secondary);">${photo.name} (${formatBytes(photo.size)})</p>
        <button class="btn btn-primary" id="btnRestoreSingle" style="padding: 12px;">
          ${ICONS.refresh} 사진 복원하기
        </button>
        <button class="btn btn-danger" id="btnPermanentDeleteSingle" style="padding: 12px;">
          ${ICONS.trash} 영구 삭제
        </button>
      </div>
    `;

    openSheet('휴지통 사진 관리', content);

    document.getElementById('btnRestoreSingle').onclick = async () => {
      await batchTrashPhotos([photoId], false);
      await this.refreshData();
      closeSheet();
      showToast('사진이 복원되었습니다.', 'success');
      this.render();
    };

    document.getElementById('btnPermanentDeleteSingle').onclick = async () => {
      await batchPermanentDelete([photoId]);
      await this.refreshData();
      closeSheet();
      showToast('사진이 영구 삭제되었습니다.', 'danger');
      this.render();
    };
  }

  // ----------------- MOBILE CONNECT MODAL -----------------
  async openConnectModal() {
    const modal = document.getElementById('connectModal');
    const qrContainer = document.getElementById('qrcodeContainer');
    const urlDisplay = document.getElementById('connectUrlDisplay');

    let currentUrl = window.location.href;
    try {
      const res = await fetch('/api/info');
      if (res.ok) {
        const info = await res.json();
        if (info.url) currentUrl = info.url;
      }
    } catch (e) {
      // Fallback
      if (currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1')) {
        currentUrl = window.location.origin;
      }
    }

    urlDisplay.textContent = currentUrl;
    qrContainer.innerHTML = '';

    if (typeof QRCode !== 'undefined') {
      new QRCode(qrContainer, {
        text: currentUrl,
        width: 180,
        height: 180,
        colorDark: '#0f172a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } else {
      qrContainer.innerHTML = `<p style="color:#64748b;font-size:0.85rem;">스마트폰 브라우저 주소창에 아래 주소를 입력하세요.</p>`;
    }

    modal.classList.add('open');
  }
}

// Global bootstrap
window.addEventListener('DOMContentLoaded', () => {
  window.app = new PhotoCleanerApp();
});
