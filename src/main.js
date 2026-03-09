import './style.css'

// [설정] 서비스 URL 및 시트 정보
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxBCnqHFxCM5UzknZ0tixYjtcjX0YRWK8N2tArYNmx5emY67HkCVlvBnXsehh72bi-bbg/exec';
const SPREADSHEET_ID = '1ou-Nz0NNChhH4HZ3lq-MwnbuRacbY7MF8IzCya5Ndcg';
const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json`;

// [YouTube API 설정]
const YT_CLIENT_ID = '53823290193-nu4v4dg1lub94d9g4kc0ffaji53ap033.apps.googleusercontent.com'; // 발급받은 클라이언트 ID를 여기에 넣으세요
const YT_PLAYLIST_ID = 'PLQ6Ij6whruQwDSnFFMEto9zWkNm4hJWDL';
let ytAccessToken = '';
let ytTokenClient;
let ytPendingVideoId = null;
let ytPendingBtn = null;
let ytPendingRowId = null;

let allData = [];
let briefingData = []; // !!BRIEFING_LATEST!! 데이터를 따로 저장
let currentTab = 'unread';
let currentCategory = null; // 현재 선택된 카테고리 (null이면 전체 카테고리 목록 표시)
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
  initYouTubeAuth();
});

function initYouTubeAuth() {
  if (typeof google === 'undefined') return;
  ytTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: YT_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
    callback: async (response) => {
      if (response.access_token) {
        ytAccessToken = response.access_token;
        if (ytPendingVideoId) {
          await executeAddToYouTube(ytPendingVideoId, ytPendingBtn, ytPendingRowId);
          ytPendingVideoId = null;
          ytPendingBtn = null;
          ytPendingRowId = null;
        }
      }
    },
  });
}

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
    const rawData = rows.map((row, index) => {
      let item = { rowIndex: index + 2 };
      row.c.forEach((cell, i) => {
        const header = cols[i];
        if (header) {
          item[header] = cell ? (cell.v ?? "") : "";
          if (typeof item[header] === 'string' && item[header].startsWith('Date(')) {
            const parts = item[header].replace(/Date\(|\)/g, '').split(',');
            const y = parts[0];
            const m = String(parseInt(parts[1]) + 1).padStart(2, '0');
            const d = String(parseInt(parts[2])).padStart(2, '0');
            item[header] = `${y}-${m}-${d}`;
          }
        }
      });
      return item;
    });

    // !!BRIEFING_LATEST!! 데이터만 따로 필터링
    briefingData = rawData.filter(d => {
      const id = String(d.ID || d.id || d.Id || d['아이디'] || "").trim();
      return id === "!!BRIEFING_LATEST!!";
    });

    // 일반 카드용 데이터 (그리드 표시용)
    allData = rawData.filter(d => {
      const id = String(d.ID || d.id || d.Id || d['아이디'] || "").trim();
      return id !== "" && id !== "!!BRIEFING_LATEST!!";
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
  document.getElementById('tab-category').onclick = () => switchTab('category');
  document.getElementById('close-detail').onclick = () => closeDetail();

  // 최신 음성 요약 듣기 버튼
  const playLatestBtn = document.getElementById('btn-play-latest');
  if (playLatestBtn) {
    playLatestBtn.onclick = () => playLatestVoiceSummary();
  }

  // TTS 설정 팝업 제어
  const ttsSettingsBtn = document.getElementById('btn-tts-settings');
  const ttsPopover = document.getElementById('tts-popover');
  if (ttsSettingsBtn && ttsPopover) {
    ttsSettingsBtn.onclick = (e) => {
      e.stopPropagation();
      const isVisible = ttsPopover.style.display === 'block';
      ttsPopover.style.display = isVisible ? 'none' : 'block';
    };

    document.addEventListener('click', (e) => {
      if (!ttsPopover.contains(e.target) && e.target !== ttsSettingsBtn) {
        ttsPopover.style.display = 'none';
      }
    });
  }

  // 속도 조절 이벤트
  const speedRange = document.getElementById('tts-speed-range');
  const speedValue = document.getElementById('speed-value');
  if (speedRange && speedValue) {
    speedRange.oninput = () => {
      const val = speedRange.value;
      speedValue.innerText = `${val}x`;
      localStorage.setItem('tts-speed', val);
    };
    // 초기값 로드
    const savedSpeed = localStorage.getItem('tts-speed');
    if (savedSpeed) {
      speedRange.value = savedSpeed;
      speedValue.innerText = `${savedSpeed}x`;
    }
  }

  // 목소리 선택 이벤트
  const voiceSelect = document.getElementById('tts-voice-select');
  if (voiceSelect) {
    voiceSelect.onchange = () => {
      localStorage.setItem('tts-voice-name', voiceSelect.value);
    };
  }

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

  // 카테고리 목록 및 개수 계산
  const categories = [...new Set(allData.map(item => String(item.Category || item['카테고리'] || "미분류").trim()))].filter(c => c !== "");
  
  document.getElementById('unread-count').textContent = unreadCount;
  document.getElementById('fav-count').textContent = favCount;
  document.getElementById('category-count').textContent = categories.length;
}

function switchTab(tabName) {
  if (currentTab === tabName && tabName !== 'category') return;
  if (currentTab === tabName && tabName === 'category' && currentCategory === null) return;

  currentTab = tabName;
  currentCategory = null; // 탭 전환 시 카테고리 선택 초기화

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
  if (currentTab === 'unread') {
    return allData.filter(item => !isTrue(item.Read));
  } else if (currentTab === 'favorite') {
    return allData.filter(item => isTrue(item.Favorite));
  } else if (currentTab === 'category') {
    if (currentCategory) {
      return allData.filter(item => String(item.Category || item['카테고리'] || "미분류").trim() === currentCategory);
    } else {
      // 카테고리 목록 모드일 때는 데이터 자체가 아니라 카테고리 문자열 배열을 기준으로 처리하나, 
      // renderGrid에서 직접 처리할 것이므로 여기서는 빈 배열 혹은 전체 데이터를 반환
      return allData; 
    }
  }
  return [];
}

function renderGrid(append = false, startIndex = 0) {
  const grid = document.getElementById('card-grid');
  
  if (currentTab === 'category' && !currentCategory) {
    renderCategoryList();
    return;
  }

  if (!append) {
    grid.innerHTML = "";
    startIndex = 0;
  }

  const filteredData = getFilteredData();
  
  // 카테고리 내비게이션 바 (뒤로가기 버튼)
  if (currentTab === 'category' && currentCategory && !append) {
    const backBtn = document.createElement('div');
    backBtn.className = 'category-header';
    backBtn.innerHTML = `
      <button class="btn-back" onclick="currentCategory=null; renderGrid();">
        <span class="material-icons-round">arrow_back</span>
        목록으로
      </button>
      <div class="category-title-display">
        <span class="material-icons-round">folder_open</span>
        ${currentCategory}
      </div>
    `;
    grid.appendChild(backBtn);
  }

  const showData = filteredData.slice(startIndex, currentVisibleCount);

  if (filteredData.length === 0 && !append) {
    const emptyIcon = currentTab === 'unread' ? 'inbox' : (currentTab === 'favorite' ? 'star_border' : 'folder_off');
    const emptyTitle = currentTab === 'unread' ? '모든 영상을 확인했습니다' : (currentTab === 'favorite' ? '즐겨찾기가 없습니다' : '이 카테고리에 영상이 없습니다');
    const emptyDesc = currentTab === 'unread' ? '새로운 영상이 추가되면 여기에 표시됩니다.' : (currentTab === 'favorite' ? '관심 있는 영상에 별표를 추가해보세요.' : '');

    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.innerHTML = `
          <div class="empty-icon">
            <span class="material-icons-round">${emptyIcon}</span>
          </div>
          <div class="empty-title">${emptyTitle}</div>
          <div class="empty-description">${emptyDesc}</div>
      `;
    grid.appendChild(emptyState);
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

function renderCategoryList() {
  const grid = document.getElementById('card-grid');
  grid.innerHTML = "";

  // 카테고리별 개수 및 썸네일 수집
  const categoryMap = {};
  allData.forEach(item => {
    const cat = String(item.Category || item['카테고리'] || "미분류").trim();
    if (cat === "") return;
    
    if (!categoryMap[cat]) {
      categoryMap[cat] = { count: 0, thumbs: [] };
    }
    categoryMap[cat].count++;
    if (categoryMap[cat].thumbs.length < 4 && item.Image_URL) {
      categoryMap[cat].thumbs.push(item.Image_URL);
    }
  });

  const categories = Object.keys(categoryMap).sort();

  if (categories.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><span class="material-icons-round">folder_off</span></div>
        <div class="empty-title">카테고리가 없습니다</div>
        <div class="empty-description">영상에 카테고리가 지정되면 여기에 표시됩니다.</div>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  categories.forEach(cat => {
    const data = categoryMap[cat];
    const card = document.createElement('div');
    card.className = 'category-card';
    card.onclick = () => {
      currentCategory = cat;
      renderGrid();
    };

    // 썸네일 그리드 생성 (최대 4개)
    let thumbHtml = '';
    if (data.thumbs.length > 0) {
      thumbHtml = data.thumbs.map(t => `<img src="${t}" alt="thumb" loading="lazy">`).join('');
    } else {
      thumbHtml = '<div class="no-thumb-icon"><span class="material-icons-round">play_circle_outline</span></div>';
    }

    card.innerHTML = `
      <div class="category-preview-grid">
        ${thumbHtml}
      </div>
      <div class="category-card-body">
        <div class="category-info">
          <div class="category-name">${cat}</div>
          <div class="category-count">영상 ${data.count}개</div>
        </div>
        <div class="category-arrow">
          <span class="material-icons-round">chevron_right</span>
        </div>
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
    const mWlBtn = document.getElementById('m-btn-wl');
    const isFav = isTrue(item.Favorite);
    const isRead = isTrue(item.Read);
    const isWl = isTrue(item.WatchLater || item['보관함']);

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

    // Watch Later 버튼 핸들러
    mWlBtn.onclick = (e) => window.handleWatchLater(id, mWlBtn, e);
    if (isWl) {
      mWlBtn.classList.add('success');
      mWlBtn.innerHTML = '<span class="material-icons-round">playlist_add_check</span> 추가됨';
    } else {
      mWlBtn.classList.remove('success');
      mWlBtn.innerHTML = '<span class="material-icons-round">playlist_add</span> 보관함 추가';
    }

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

window.handleWatchLater = async (id, btn, event) => {
  if (event) event.stopPropagation();
  const item = allData.find(d => String(d.ID) === String(id));
  if (!item) return;

  const vId = extractVideoId(item.VideoURL || item.link || item.Video_URL);
  if (!vId) {
    alert('비디오 ID를 추출할 수 없습니다.');
    return;
  }

  if (!ytAccessToken) {
    ytPendingVideoId = vId;
    ytPendingBtn = btn;
    ytPendingRowId = id;
    ytTokenClient.requestAccessToken();
    return;
  }

  await executeAddToYouTube(vId, btn, id);
};

async function executeAddToYouTube(vId, btn, rowId) {
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons-round spin">sync</span> 추가 중...';
  }

  try {
    const res = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ytAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        snippet: {
          playlistId: YT_PLAYLIST_ID,
          resourceId: { kind: 'youtube#video', videoId: vId }
        }
      })
    });

    if (res.ok) {
      if (btn) {
        btn.classList.add('success');
        btn.innerHTML = '<span class="material-icons-round">playlist_add_check</span> 추가 완료';
      }
      // 시트 업데이트 (GAS)
      await callGAS({ action: 'markAsWatchLater', id: rowId });
      const item = allData.find(d => String(d.ID) === String(rowId));
      if (item) item.WatchLater = true;
    } else {
      const errorData = await res.json();
      console.error('YT API Error:', errorData);
      if (res.status === 401) {
        ytAccessToken = '';
        alert('인증이 만료되었습니다. 다시 시도해주세요.');
      } else {
        alert('추가 실패: ' + (errorData.error.message || '알 수 없는 오류'));
      }
    }
  } catch (e) {
    console.error('YT API Fetch Error:', e);
    alert('추가 중 오류가 발생했습니다.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function extractVideoId(url) {
  if (!url) return null;
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length == 11) ? match[7] : null;
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

let isSpeaking = false;
let selectedVoice = null;

// 최상의 한국어 음성 찾기 및 목록 관리
function findBestKoreanVoice() {
  const voices = window.speechSynthesis.getVoices();
  const koreanVoices = voices.filter(v => v.lang.startsWith('ko'));

  // 드롭다운 목록 업데이트
  const voiceSelect = document.getElementById('tts-voice-select');
  if (voiceSelect) {
    const savedVoiceName = localStorage.getItem('tts-voice-name');
    voiceSelect.innerHTML = koreanVoices.map(v =>
      `<option value="${v.name}" ${v.name === savedVoiceName ? 'selected' : ''}>${v.name}</option>`
    ).join('');
  }

  if (koreanVoices.length === 0) return null;

  // 저장된 설정이 있으면 해당 음성 반환
  const savedName = localStorage.getItem('tts-voice-name');
  if (savedName) {
    const savedVoice = koreanVoices.find(v => v.name === savedName);
    if (savedVoice) return savedVoice;
  }

  // 1순위: 마이크로소프트 선희 (가장 아나운서 같음)
  const sunHi = voices.find(v => v.name.includes('SunHi') || v.name.includes('선희'));
  if (sunHi) return sunHi;

  // 2순위: 기타 Neural(신경망) 음성
  const neural = voices.find(v => (v.lang.startsWith('ko')) && v.name.includes('Neural'));
  if (neural) return neural;

  // 3순위: Google 한국어
  const google = voices.find(v => v.name.includes('Google') && v.lang.startsWith('ko'));
  if (google) return google;

  // 일반 한국어
  return voices.find(v => v.lang.startsWith('ko'));
}

// 음성 목록 로드 대기
window.speechSynthesis.onvoiceschanged = () => {
  selectedVoice = findBestKoreanVoice();
  if (selectedVoice) console.log('현재 설정된 음성:', selectedVoice.name);
};

function playLatestVoiceSummary() {
  if (briefingData.length === 0) {
    alert('최신 브리핑 데이터가 없습니다.');
    return;
  }

  // G열(PublishDate) 기준 최신순 정렬
  const sortedBriefings = [...briefingData].sort((a, b) => {
    const dateA = a.PublishDate || "";
    const dateB = b.PublishDate || "";
    return dateB.localeCompare(dateA);
  });

  const latestBriefing = sortedBriefings[0];
  const summaryText = latestBriefing.Summary || '요약 내용이 없습니다.';
  const textToSpeak = summaryText;

  if (isSpeaking) {
    window.speechSynthesis.cancel();
    isSpeaking = false;
    const btn = document.getElementById('btn-play-latest');
    if (btn) {
      btn.classList.remove('speaking');
      btn.innerHTML = '<span class="material-icons-round">volume_up</span> <span class="tab-text">최신 음성 요약 듣기</span>';
    }
    return;
  }

  const utterance = new SpeechSynthesisUtterance(textToSpeak);
  utterance.lang = 'ko-KR';

  // 현재 시점에 최상의 음성 다시 한번 확인
  if (!selectedVoice) {
    selectedVoice = findBestKoreanVoice();
  }

  if (selectedVoice) {
    utterance.voice = selectedVoice;
  } else {
    // 폰트 목록에서 선택된 값이 있으면 해당 voice 명시적 지정
    const voiceSelect = document.getElementById('tts-voice-select');
    if (voiceSelect && voiceSelect.value) {
      const voices = window.speechSynthesis.getVoices();
      const userVoice = voices.find(v => v.name === voiceSelect.value);
      if (userVoice) utterance.voice = userVoice;
    }
  }

  // 속도 설정 적용
  const speedRange = document.getElementById('tts-speed-range');
  utterance.rate = speedRange ? parseFloat(speedRange.value) : 1.05;
  utterance.pitch = 1.0;

  utterance.onstart = () => {
    isSpeaking = true;
    const btn = document.getElementById('btn-play-latest');
    if (btn) {
      btn.classList.add('speaking');
      btn.innerHTML = '<span class="material-icons-round">stop</span> <span class="tab-text">요약 듣기 중단</span>';
    }
  };

  utterance.onend = () => {
    isSpeaking = false;
    const btn = document.getElementById('btn-play-latest');
    if (btn) {
      btn.classList.remove('speaking');
      btn.innerHTML = '<span class="material-icons-round">volume_up</span> <span class="tab-text">최신 음성 요약 듣기</span>';
    }
  };

  utterance.onerror = (e) => {
    console.error('TTS Error:', e);
    isSpeaking = false;
    const btn = document.getElementById('btn-play-latest');
    if (btn) {
      btn.classList.remove('speaking');
      btn.innerHTML = '<span class="material-icons-round">volume_up</span> <span class="tab-text">최신 음성 요약 듣기</span>';
    }
  };

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

