import './style.css'

// [설정] 복사해둔 Apps Script 웹 앱 URL을 여기에 붙여넣어 주세요
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxBCnqHFxCM5UzknZ0tixYjtcjX0YRWK8N2tArYNmx5emY67HkCVlvBnXsehh72bi-bbg/exec';

let allData = [];
let currentTab = 'unread';
let currentDetailId = null;
let touchStartX = 0;
let touchEndX = 0;

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
  const cachedData = localStorage.getItem('yt_clipping_cache');

  if (cachedData) {
    // 1. 캐시된 데이터가 있으면 즉시 렌더링
    onDataLoaded(JSON.parse(cachedData), true);
  } else {
    // 2. 캐시가 없으면 로딩 인디케이터 표시
    document.getElementById('loader').style.display = 'block';
  }

  try {
    // 3. 서버에서 데이터 가져오기
    const response = await fetch(GAS_API_URL);
    const data = await response.json();

    // 4. 캐시 업데이트 및 최종 화면 갱신
    localStorage.setItem('yt_clipping_cache', JSON.stringify(data));
    onDataLoaded(data);
  } catch (error) {
    if (!cachedData) {
      onLoadError(error);
    }
    console.error('Background Fetch Error:', error);
  }
}

function onDataLoaded(data, isCache = false) {
  allData = typeof data === 'string' ? JSON.parse(data) : data;
  document.getElementById('loader').style.display = 'none';
  updateStats();
  renderGrid();

  if (isCache) {
    console.log('초기 데이터를 로컬 캐시에서 불러왔습니다.');
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
  if (tabName === 'unread') {
    document.getElementById('tab-unread').classList.add('active');
  } else {
    document.getElementById('tab-favorite').classList.add('active');
  }

  closeDetail();
  renderGrid();
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

function renderGrid() {
  const grid = document.getElementById('card-grid');
  grid.innerHTML = "";
  const filteredData = getFilteredData();

  if (filteredData.length === 0) {
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

  filteredData.forEach(item => {
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
    grid.appendChild(card);
  });
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
