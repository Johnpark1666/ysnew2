import './style.css'

// [설정] 서비스 URL 및 시트 정보
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxBCnqHFxCM5UzknZ0tixYjtcjX0YRWK8N2tArYNmx5emY67HkCVlvBnXsehh72bi-bbg/exec';
const SPREADSHEET_ID = '1ou-Nz0NNChhH4HZ3lq-MwnbuRacbY7MF8IzCya5Ndcg';
const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json`;

let allData = [];
let currentTab = 'unread';
let currentDetailId = null;
let touchStartX = 0;
let touchEndX = 0;

// [렌더링 설정]
let currentPageSize = 20;
let currentVisibleCount = 20;

// 초기 데이터 로드
window.addEventListener('DOMContentLoaded', () => {
  fetchData();
  setupEventListeners();
});

async function fetchData() {
  const loader = document.getElementById('loader');
  loader.style.display = 'block';
  loader.innerHTML = '<div class="loader-spinner"></div><div class="loader-text">최신 데이터를 실시간으로 가져오는 중...</div>';
  document.getElementById('card-grid').innerHTML = '';

  try {
    // 1. 구글 시트 데이터를 직접 가져옴 (캐시 없이 실시간 연동)
    const response = await fetch(`${GVIZ_URL}&t=${Date.now()}`);
    const text = await response.text();

    // 구글 응답 데이터(JSON)만 추출
    const jsonStr = text.match(/google\.visualization\.Query\.setResponse\(([\s\S\w]+)\)/);
    if (!jsonStr) throw new Error("구글 시트 연동 실패: 데이터 형식이 올바르지 않습니다.");

    const obj = JSON.parse(jsonStr[1]);
    const table = obj.table;
    const rows = table.rows;
    // 헤더(컬럼 레이블) 추출
    const cols = table.cols.map(c => c.label || "");

    // 2. 데이터를 앱용 객체 배열로 변환
    allData = rows.map((row, index) => {
      let item = { rowIndex: index + 2 };
      row.c.forEach((cell, i) => {
        const header = cols[i];
        if (header) {
          // 셀이 비어있으면 null이나 빈 값 처리
          item[header] = cell ? (cell.v ?? "") : "";
          // 날짜 타입인 경우 가독성 좋게 변환 (Date 객체 형태인 경우 문자열 추출)
          if (typeof item[header] === 'string' && item[header].startsWith('Date(')) {
            item[header] = item[header].replace(/Date\(|\)/g, '').split(',').slice(0, 3).join('-');
          }
        }
      });
      return item;
    }).filter(d => {
      // ID 필드명이 대소문자를 가릴 수 있으므로 유연하게 체크합니다.
      const id = d.ID || d.id || d.Id || d['아이디'];
      return id && String(id).trim() !== "";
    });

    console.log('실시간 연동 성공:', allData.length, '개의 행');
    onDataLoaded();

  } catch (error) {
    onLoadError(error);
  }
}

function onDataLoaded() {
  document.getElementById('loader').style.display = 'none';
  updateStats();
  renderGrid();
}

function onLoadError(error) {
  console.error('Data Load Error:', error);
  document.getElementById('loader').innerHTML = `
      <div class="empty-icon">
        <span class="material-icons-round">error_outline</span>
      </div>
      <div class="empty-title">데이터를 불러오지 못했습니다</div>
      <div class="empty-description">${error.message}<br>시트의 '웹에 게시' 설정을 다시 확인해주세요.</div>
    `;
}

// 불리언 값 판별 헬퍼 (구글 시트는 불리언이나 "TRUE"/"FALSE"로 들어옴)
function isTrue(value) {
  if (typeof value === 'boolean') return value;
  return String(value).toUpperCase() === "TRUE";
}

function setupEventListeners() {
  document.getElementById('tab-unread').onclick = () => switchTab('unread');
  document.getElementById('tab-favorite').onclick = () => switchTab('favorite');
  document.getElementById('close-detail').onclick = () => closeDetail();

  // 새로고침 버튼 핸들러
  const refreshBtn = document.getElementById('btn-refresh');
  if (refreshBtn) {
    refreshBtn.onclick = async () => {
      refreshBtn.style.animation = 'spin 1s linear infinite';
      await fetchData();
      refreshBtn.style.animation = 'none';
    };
  }

  // Infinite Scroll
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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetail();
  });
}

function updateStats() {
  const unreadCount = allData.filter(item => !isTrue(item.Read)).length;
  const favCount = allData.filter(item => isTrue(item.Favorite)).length;

  document.getElementById('unread-count').textContent = unreadCount;
  document.getElementById('fav-count').textContent = favCount;
}

function switchTab(tabName) {
  if (currentTab === tabName) return;
  currentTab = tabName;

  document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');

  currentVisibleCount = currentPageSize;
  closeDetail();
  renderGrid();
}

function loadMore() {
  const filteredData = getFilteredData();
  if (currentVisibleCount >= filteredData.length) return;

  const start = currentVisibleCount;
  currentVisibleCount += currentPageSize;
  renderGrid(true, start);
}

function getFilteredData() {
  return allData.filter(item => {
    if (currentTab === 'unread') {
      return !isTrue(item.Read);
    } else {
      return isTrue(item.Favorite);
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
    const imgUrl = item.Image_URL || 'https://placehold.co/640x360/1e1e2a/ffffff?text=No+Image';
    const isFav = isTrue(item.Favorite);
    const pubDate = item.PublishDate ? String(item.PublishDate).substring(0, 10) : '-';

    let keywordHtml = '';
    if (item.Keywords) {
      const keywords = String(item.Keywords).split(',').slice(0, 4);
      keywordHtml = keywords.map(k => `<span class="keyword-tag">${k.trim()}</span>`).join('');
    }

    card.onclick = () => openDetail(item.ID);
    card.innerHTML = `
        <div class="card-thumbnail">
          <img src="${imgUrl}" alt="${item.Title}" loading="lazy" onerror="window.handleImageError(this)">
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

// 이미지 에러 핸들러
window.handleImageError = (img) => {
  if (img.src.includes('maxresdefault.jpg')) {
    img.src = img.src.replace('maxresdefault.jpg', 'hqdefault.jpg');
    return;
  }
  img.src = 'https://placehold.co/640x360/1e1e2a/ffffff?text=No+Thumbnail';
  img.onerror = null;
};

// 상세 로직 및 Apps Script 호출 로직은 기존 기능 유지
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

    const mImg = document.getElementById('m-img');
    mImg.onerror = () => window.handleImageError(mImg);
    mImg.src = item.Image_URL || 'https://placehold.co/640x360/1e1e2a/ffffff?text=No+Image';

    document.getElementById('m-link').href = item.VideoURL;
    document.getElementById('m-summary').innerText = item.Summary || '내용 없음';
    document.getElementById('m-analysis').innerText = item.Analysis || '내용 없음';
    document.getElementById('m-insights').innerText = item.Insights || '내용 없음';

    const mReadBtn = document.getElementById('m-btn-read');
    const mFavBtn = document.getElementById('m-btn-fav');
    const isFav = isTrue(item.Favorite);
    const isRead = isTrue(item.Read);

    mReadBtn.onclick = (e) => handleMarkRead(id, mReadBtn, e);
    if (isRead) {
      mReadBtn.style.opacity = '0.5';
      mReadBtn.innerHTML = '<span class="material-icons-round">done</span> 읽음';
    } else {
      mReadBtn.style.opacity = '1';
      mReadBtn.innerHTML = '<span class="material-icons-round">check_circle</span> 읽음 처리';
    }

    mFavBtn.onclick = (e) => handleToggleFav(id, mFavBtn, e);
    mFavBtn.className = `btn-favorite ${isFav ? 'active' : ''}`;
    mFavBtn.innerHTML = `<span class="material-icons-round">${isFav ? 'star' : 'star_border'}</span>`;

    detailBody.style.transition = 'all 0.4s ease';
    detailBody.style.opacity = '1';
    detailBody.style.transform = 'translateY(0)';
  }, 50);

  document.getElementById('layout-container').classList.add('detail-active');
  detailPane.scrollTop = 0;
}

function closeDetail() {
  document.getElementById('layout-container').classList.remove('detail-active');
  currentDetailId = null;
}

window.handleMarkRead = async (id, btn, event) => {
  if (event) event.stopPropagation();
  const icon = btn.querySelector('.material-icons-round');
  const originalHtml = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons-round spin">sync</span> 처리 중...';

  try {
    const res = await callGAS({ action: 'markAsRead', id: id });
    if (res.status === 'success') {
      const item = allData.find(d => String(d.ID) === String(id));
      if (item) item.Read = true;
      updateStats();
      if (currentTab === 'unread') {
        renderGrid();
        if (currentDetailId === String(id)) closeDetail();
      } else {
        btn.style.opacity = '0.5';
        btn.innerHTML = '<span class="material-icons-round">done</span> 읽음';
      }
    }
  } catch (e) {
    alert('읽음 처리 실패');
    btn.innerHTML = originalHtml;
  } finally {
    btn.disabled = false;
  }
};

window.handleToggleFav = async (id, btn, event) => {
  if (event) event.stopPropagation();
  const item = allData.find(d => String(d.ID) === String(id));
  if (!item) return;

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add('loading');

  try {
    const res = await callGAS({
      action: 'toggleFavorite',
      id: id,
      currentStatus: isTrue(item.Favorite)
    });
    if (res.status === 'success') {
      item.Favorite = res.result;
      updateStats();
      if (currentTab === 'favorite' && !isTrue(item.Favorite)) {
        renderGrid();
        if (currentDetailId === String(id)) closeDetail();
      } else {
        const isFav = isTrue(item.Favorite);
        btn.className = `btn-favorite ${isFav ? 'active' : ''}`;
        btn.innerHTML = `<span class="material-icons-round">${isFav ? 'star' : 'star_border'}</span>`;
      }
    }
  } catch (e) {
    alert('즐겨찾기 토글 실패');
    btn.innerHTML = originalHtml;
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
};

async function callGAS(params) {
  const response = await fetch(GAS_API_URL, {
    method: 'POST',
    body: JSON.stringify(params)
  });
  return await response.json();
}

function handleSwipe() {
  const diff = touchStartX - touchEndX;
  if (Math.abs(diff) < 100) return;

  const filteredData = getFilteredData();
  const idx = filteredData.findIndex(d => String(d.ID) === currentDetailId);
  if (idx === -1) return;

  if (diff > 0 && idx < filteredData.length - 1) {
    openDetail(filteredData[idx + 1].ID);
  } else if (diff < 0 && idx > 0) {
    openDetail(filteredData[idx - 1].ID);
  }
}
