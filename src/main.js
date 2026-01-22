import './style.css'

// [설정] 서비스 URL들
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxBCnqHFxCM5UzknZ0tixYjtcjX0YRWK8N2tArYNmx5emY67HkCVlvBnXsehh72bi-bbg/exec';
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1ou-Nz0NNChhH4HZ3lq-MwnbuRacbY7MF8IzCya5Ndcg/export?format=csv';

let allData = [];
let currentTab = 'unread';
let currentDetailId = null;
let touchStartX = 0;
let touchEndX = 0;

// [렌더링 최적화] 한 번에 보이는 카드 개수를 제어합니다.
let currentPageSize = 20;
let currentVisibleCount = 20;

// [DB 설정] 데이터가 많을 경우를 대비해 localStorage 대신 IndexedDB를 사용합니다.
const DB_NAME = 'YT_Insight_DB';
const STORE_NAME = 'cache';

async function getCache(key) {
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
    request.onsuccess = (e) => {
      const db = e.target.result;
      const getReq = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => resolve(null);
    };
    request.onerror = () => resolve(null);
  });
}

async function setCache(key, value) {
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
    request.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    };
    request.onerror = () => resolve(false);
  });
}

// 초기 데이터 로드
window.addEventListener('DOMContentLoaded', () => {
  if (!GAS_API_URL) {
    alert('Apps Script URL이 설정되지 않았습니다. main.js 상단의 GAS_API_URL을 확인해주세요.');
    return;
  }
  fetchData();
  setupEventListeners();
});

async function fetchData() {
  const cachedData = await getCache('yt_clipping_cache');

  if (cachedData) {
    onDataLoaded(cachedData, true);
  } else {
    document.getElementById('loader').style.display = 'block';
  }

  try {
    // [속도 최적화] 앱스크립트를 거치지 않고 구글 시트에서 직접 CSV를 가져옵니다.
    const response = await fetch(SHEET_CSV_URL);
    const csvText = await response.text();
    const data = parseCSV(csvText);

    await setCache('yt_clipping_cache', data);
    onDataLoaded(data);
  } catch (error) {
    if (!cachedData) {
      onLoadError(error);
    }
    console.error('Background Fetch Error (Direct Sheet):', error);
  }
}

// 간단하고 강력한 CSV 파서
function parseCSV(csvText) {
  const lines = csvText.split(/\r?\n/);
  if (lines.length <= 1) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).filter(line => line.trim() !== "").map((line, index) => {
    // 따옴표 안의 콤마를 무시하고 분리하는 정규식
    const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.replace(/^"|"$/g, '').trim());
    let obj = { rowIndex: index + 2 };
    headers.forEach((header, colIndex) => {
      if (header) {
        obj[header] = values[colIndex] || "";
      }
    });
    return obj;
  });
}

function onDataLoaded(data, isCache = false) {
  allData = typeof data === 'string' ? JSON.parse(data) : data;
  document.getElementById('loader').style.display = 'none';
  updateStats();
  renderGrid();

  if (isCache) {
    console.log('초기 데이터를 캐시(IndexedDB)에서 불러왔습니다.');
  } else {
    console.log('최신 데이터를 서버에서 성공적으로 가져왔습니다.');
  }
}

function onLoadError(error) {
  console.error('Data Load Error:', error);
  document.getElementById('loader').innerHTML = `
      <div class="empty-icon">
        <span class="material-icons-round">error_outline</span>
      </div>
      <div class="empty-title">오류가 발생했습니다</div>
      <div class="empty-description">${error.message}</div>
    `;
}

function setupEventListeners() {
  document.getElementById('tab-unread').onclick = () => switchTab('unread');
  document.getElementById('tab-favorite').onclick = () => switchTab('favorite');
  document.getElementById('close-detail').onclick = () => closeDetail();

  // Infinite Scroll: 스크롤이 끝에 닿으면 더 불러오기
  const listPane = document.getElementById('pane-list');
  listPane.onscroll = () => {
    if (listPane.scrollTop + listPane.clientHeight >= listPane.scrollHeight - 500) {
      loadMore();
    }
  };

  // Swipe Detection
  const detailPane = document.getElementById('pane-detail');
  detailPane.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  detailPane.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  }, { passive: true });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetail();
  });
}

function updateStats() {
  const unreadCount = allData.filter(item => item.Read !== true && item.Read !== "TRUE").length;
  const favCount = allData.filter(item => item.Favorite === true || item.Favorite === "TRUE").length;

  document.getElementById('unread-count').textContent = unreadCount;
  document.getElementById('fav-count').textContent = favCount;
}

function switchTab(tabName) {
  if (currentTab === tabName) return;
  currentTab = tabName;

  document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');

  currentVisibleCount = currentPageSize; // 초기화
  closeDetail();
  renderGrid();
}

function loadMore() {
  const filteredData = getFilteredData();
  if (currentVisibleCount >= filteredData.length) return;

  const start = currentVisibleCount;
  currentVisibleCount += currentPageSize;
  renderGrid(true, start); // append 모드로 렌더링
}

function getFilteredData() {
  return allData.filter(item => {
    if (currentTab === 'unread') {
      return item.Read !== true && item.Read !== "TRUE";
    } else {
      return item.Favorite === true || item.Favorite === "TRUE";
    }
  });
}

function renderGrid(append = false, startIndex = 0) {
  const grid = document.getElementById('card-grid');
  if (!append) {
    grid.innerHTML = "";
    startIndex = 0;
  }

  const filteredData = getFilteredData();
  const showData = filteredData.slice(startIndex, currentVisibleCount);

  if (filteredData.length === 0 && !append) {
    const emptyIcon = currentTab === 'unread' ? 'inbox' : 'star_border';
    const emptyTitle = currentTab === 'unread' ? '모든 영상을 확인했습니다' : '즐겨찾기가 없습니다';
    const emptyDesc = currentTab === 'unread' ? '새로운 영상이 추가되면 여기에 표시됩니다.' : '관심 있는 영상에 별표를 추가해보세요.';

    grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <span class="material-icons-round">${emptyIcon}</span>
          </div>
          <div class="empty-title">${emptyTitle}</div>
          <div class="empty-description">${emptyDesc}</div>
        </div>
      `;
    return;
  }

  const fragment = document.createDocumentFragment();
  showData.forEach(item => {
    const card = document.createElement('div');
    card.className = 'card';
    const imgUrl = item.Image_URL || 'https://via.placeholder.com/640x360/1e1e2a/6b6b7b?text=No+Image';
    const isFav = (item.Favorite === true || item.Favorite === "TRUE");
    const pubDate = item.PublishDate ? String(item.PublishDate).substring(0, 10) : '-';

    let keywordHtml = '';
    if (item.Keywords) {
      const keywords = String(item.Keywords).split(',').slice(0, 4);
      keywordHtml = keywords.map(k => `<span class="keyword-tag">${k.trim()}</span>`).join('');
    }

    card.onclick = () => openDetail(item.ID);
    card.innerHTML = `
        <div class="card-thumbnail">
          <img src="${imgUrl}" alt="${item.Title}" loading="lazy">
          <div class="thumbnail-overlay">
            <div class="play-button">
              <span class="material-icons-round">play_arrow</span>
            </div>
          </div>
        </div>
        <div class="card-content">
          <div class="channel-info">
            <div class="channel-details">
              <div class="channel-name">${item.ChannelName || '알 수 없는 채널'}</div>
              <div class="video-date">${pubDate}</div>
            </div>
          </div>
          <div class="card-title">${item.Title}</div>
          <div class="keywords">${keywordHtml}</div>
        </div>
        <div class="card-actions">
          <button class="btn-mark-read" onclick="handleMarkRead('${item.ID}', this, event)">
            <span class="material-icons-round">check_circle</span>
            읽음 처리
          </button>
          <button class="btn-favorite ${isFav ? 'active' : ''}" onclick="handleToggleFav('${item.ID}', this, event)">
            <span class="material-icons-round">${isFav ? 'star' : 'star_border'}</span>
          </button>
        </div>
      `;
    fragment.appendChild(card);
  });
  grid.appendChild(fragment);
}

function openDetail(id) {
  currentDetailId = String(id);
  const item = allData.find(d => String(d.ID) === currentDetailId);
  if (!item) return;

  const detailPane = document.getElementById('pane-detail');
  const detailBody = detailPane.querySelector('.modal-body');

  detailBody.style.opacity = '0';
  detailBody.style.transform = 'translateY(10px)';
  detailBody.style.transition = 'none';

  setTimeout(() => {
    document.getElementById('m-title').innerText = item.Title;
    document.getElementById('m-title-mobile').innerText = item.Title;
    const pubDate = item.PublishDate ? String(item.PublishDate).substring(0, 10) : '-';
    document.getElementById('m-date-text').innerText = pubDate;
    document.getElementById('m-date-text-mobile').innerText = pubDate;
    document.getElementById('m-img').src = item.Image_URL || '';
    document.getElementById('m-link').href = item.VideoURL;
    document.getElementById('m-summary').innerText = item.Summary || '내용 없음';
    document.getElementById('m-analysis').innerText = item.Analysis || '내용 없음';
    document.getElementById('m-insights').innerText = item.Insights || '내용 없음';

    const mReadBtn = document.getElementById('m-btn-read');
    const mFavBtn = document.getElementById('m-btn-fav');
    const isFav = (item.Favorite === true || item.Favorite === "TRUE");
    const isRead = (item.Read === true || item.Read === "TRUE");

    mReadBtn.onclick = (e) => handleMarkRead(id, mReadBtn, e);
    if (isRead) {
      mReadBtn.style.opacity = '0.6';
      mReadBtn.disabled = true;
      mReadBtn.innerHTML = '<span class="material-icons-round">check_circle</span> 완료';
    } else {
      mReadBtn.style.opacity = '1';
      mReadBtn.disabled = false;
      mReadBtn.innerHTML = '<span class="material-icons-round">check_circle</span> 읽음';
    }

    mFavBtn.onclick = (e) => handleToggleFav(id, mFavBtn, e);
    mFavBtn.querySelector('.material-icons-round').innerText = isFav ? 'star' : 'star_border';
    isFav ? mFavBtn.classList.add('active') : mFavBtn.classList.remove('active');

    document.getElementById('layout-container').classList.add('detail-active');
    detailPane.scrollTop = 0;
    detailBody.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    detailBody.style.opacity = '1';
    detailBody.style.transform = 'translateY(0)';
  }, 50);
}

function closeDetail() {
  currentDetailId = null;
  document.getElementById('layout-container').classList.remove('detail-active');
}

// API 호출 도우미
async function callGAS(params) {
  const response = await fetch(GAS_API_URL, {
    method: 'POST',
    body: JSON.stringify(params)
  });
  return await response.json();
}

// 전역 핸들러 (버튼 클릭용)
window.handleMarkRead = async (id, btn, event) => {
  event.stopPropagation();
  const originalHTML = btn.innerHTML;
  btn.style.opacity = '0.6';
  btn.innerHTML = '<span class="material-icons-round">hourglass_empty</span>...';
  btn.disabled = true;

  try {
    const res = await callGAS({ action: 'markAsRead', id: id });
    if (res.status === 'success') {
      const item = allData.find(d => String(d.ID) === String(id));
      if (item) item.Read = true;
      updateStats();
      renderGrid();
      if (currentDetailId === String(id)) openDetail(id);
    }
  } catch (err) {
    alert('오류: ' + err.message);
    btn.innerHTML = originalHTML;
    btn.disabled = false;
    btn.style.opacity = '1';
  }
};

window.handleToggleFav = async (id, btn, event) => {
  event.stopPropagation();
  const item = allData.find(d => String(d.ID) === String(id));
  const currentStatus = (item.Favorite === true || item.Favorite === "TRUE");

  try {
    const res = await callGAS({ action: 'toggleFavorite', id: id, currentStatus: currentStatus });
    if (res.status === 'success') {
      item.Favorite = res.result;
      updateStats();
      renderGrid();
      if (currentDetailId === String(id)) openDetail(id);
    }
  } catch (err) {
    alert('오류: ' + err.message);
  }
};

function handleSwipe() {
  const swipeThreshold = 50;
  const diff = touchEndX - touchStartX;
  if (Math.abs(diff) > swipeThreshold) {
    const filteredData = getFilteredData();
    const currentIndex = filteredData.findIndex(d => String(d.ID) === currentDetailId);
    if (currentIndex === -1) return;

    let nextIndex = diff < 0 ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0) nextIndex = filteredData.length - 1;
    if (nextIndex >= filteredData.length) nextIndex = 0;

    openDetail(filteredData[nextIndex].ID);
  }
}
