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
let mixData = []; // NotebookLM_Mix 데이터
let searchQuery = '';
let currentTab = 'unread';
let currentCategory = null;
let currentChannel = null; // 현재 선택된 카테고리 (null이면 전체 카테고리 목록 표시)
let currentDetailId = null;
let touchStartX = 0;
let touchEndX = 0;

// [Multi-Select State]
let isSelectionMode = false;
let selectedIds = new Set();

// [Carousel State]
let categoryIndex = 0;
let categoryList = [];

// [UI State]
let viewMode = 'grid'; // 'grid' | 'list'
let sortOrder = 'newest';

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
  // google 객체가 없으면 500ms 후 재시도 (라이브 환경 로드 타이밍 대응)
  if (typeof google === 'undefined' || !google.accounts) {
    setTimeout(initYouTubeAuth, 500);
    return;
  }

  try {
    ytTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: YT_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
      callback: async (response) => {
        if (response.access_token) {
          ytAccessToken = response.access_token;
          console.log('YouTube Access Token 획득 성공');
          if (ytPendingVideoId) {
            await executeAddToYouTube(ytPendingVideoId, ytPendingBtn, ytPendingRowId);
            ytPendingVideoId = null;
            ytPendingBtn = null;
            ytPendingRowId = null;
          }
        }
      },
    });
    console.log('YouTube Auth Client Initialized');
  } catch (e) {
    console.error('YouTube Auth Init Error:', e);
  }
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

    // 3. NotebookLM_Mix 시트 데이터 가져오기
    const mixResponse = await fetch(`${GVIZ_URL}&sheet=NotebookLM_Mix&t=${Date.now()}`);
    const mixText = await mixResponse.text();
    const mixJsonStr = mixText.match(/google\.visualization\.Query\.setResponse\(([\s\S\w]+)\)/);
    if (mixJsonStr) {
      const mixObj = JSON.parse(mixJsonStr[1]);
      const mixRows = mixObj.table.rows;
      mixData = mixRows.map((row, index) => {
        return {
          id: `mix_${index}`,
          timestamp: row.c[0] ? row.c[0].v : "",
          type: row.c[1] ? row.c[1].v : "",
          url: row.c[2] ? row.c[2].v : "",
          sourceIds: row.c[3] ? row.c[3].v : "",
          title: row.c[4] ? row.c[4].v : ""
        };
      }).reverse(); // 최신순으로 정렬
    }

    console.log('실시간 연동 성공:', allData.length, '개의 행, Mix 데이터:', mixData.length, '개');
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
        <i class="ph ph-warning-circle"></i>
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
  const tabChannel = document.getElementById('tab-channel');
  if (tabChannel) tabChannel.onclick = () => switchTab('channel');

  document.getElementById('tab-today').onclick = () => switchTab('today');
  
  const tabMix = document.getElementById('tab-mix');
  if (tabMix) tabMix.onclick = () => switchTab('mix');
  
  // [Floating Toolbar]
  const toolbar = document.getElementById('floating-toolbar');
  const sortSelect = document.getElementById('toolbar-sort-select');
  const backToTopBtn = document.getElementById('btn-back-to-top');

  // View Mode Toggle
  toolbar.querySelectorAll('.view-btn').forEach(btn => {
    btn.onclick = () => {
      viewMode = btn.dataset.view;
      toolbar.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGrid();
    };
  });

  // Sort Select
  sortSelect.onchange = (e) => {
    sortOrder = e.target.value;
    renderGrid();
  };

  // Back to Top
  backToTopBtn.onclick = () => {
    const pane = document.getElementById('pane-list');
    if (pane) {
      pane.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  document.getElementById('close-detail').onclick = () => closeDetail();
  
  const closeMixDetailBtn = document.getElementById('close-mix-detail');
  if (closeMixDetailBtn) closeMixDetailBtn.onclick = () => closeMixDetail();

  // [Multi-Select Events]
  const selectModeBtn = document.getElementById('btn-select-mode');
  const markSelectedBtn = document.getElementById('btn-mark-selected-read');

  if (selectModeBtn) {
    selectModeBtn.onclick = () => toggleSelectionMode();
  }

  if (markSelectedBtn) {
    markSelectedBtn.onclick = () => handleMarkSelectedRead();
  }

  
  // Search 기능
  const searchInput = document.getElementById('search-input');
  const clearSearchBtn = document.getElementById('btn-clear-search');
  
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      clearSearchBtn.classList.toggle('hidden', searchQuery === '');
      currentVisibleCount = currentPageSize; // 스크롤 초기화
      renderGrid();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      searchQuery = '';
      searchInput.value = '';
      clearSearchBtn.classList.add('hidden');
      currentVisibleCount = currentPageSize;
      renderGrid();
      searchInput.focus();
    });
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
    if (listPane.scrollTop + listPane.clientHeight >= listPane.scrollHeight - 100) {
      if (currentVisibleCount < getFilteredData().length) {
        currentVisibleCount += currentPageSize;
        renderGrid(true, currentVisibleCount - currentPageSize);
      }
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

  // 카테고리 목록 및 개수 계산 (읽지 않은 영상이 있는 카테고리만)
  
  const categories = [...new Set(allData.filter(item => !isTrue(item.Read)).map(item => String(item.Category || item['카테고리'] || "미분류").trim()))].filter(c => c !== "");
  const channels = [...new Set(allData.filter(item => !isTrue(item.Read)).map(item => String(item.ChannelName || "알 수 없음").trim()))].filter(c => c !== "");
  
  document.getElementById('unread-count').textContent = unreadCount;
  document.getElementById('fav-count').textContent = favCount;
  document.getElementById('category-count').textContent = categories.length;
  const channelCountEl = document.getElementById('channel-count');
  if(channelCountEl) channelCountEl.textContent = channels.length;
  
  const mixCountEl = document.getElementById('mix-count');
  if (mixCountEl) mixCountEl.textContent = mixData.length;

}

function switchTab(tabName) {
  
  if (currentTab === tabName && tabName !== 'category' && tabName !== 'channel') return;
  if (currentTab === tabName && tabName === 'category' && currentCategory === null) return;
  if (currentTab === tabName && tabName === 'channel' && currentChannel === null) return;

  currentTab = tabName;
  currentCategory = null; 
  currentChannel = null; 


  document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');

  currentVisibleCount = currentPageSize;
  
  // 탭 전환 시 선택 모드 해제
  if (isSelectionMode) toggleSelectionMode(false);
  closeSublist();
  
  closeDetail();
  closeMixDetail();

  const paneList = document.getElementById('pane-list');
  const paneToday = document.getElementById('pane-today');
  
  if (tabName === 'today') {
    if (paneList) paneList.style.display = 'none';
    if (paneToday) paneToday.style.display = 'block';
    updateFloatingToolbar();
    return;
  } else {
    if (paneList) paneList.style.display = '';
    if (paneToday) paneToday.style.display = 'none';
  }

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
  let data = [];
  if (currentTab === 'unread') {
    data = allData.filter(item => !isTrue(item.Read));
  } else if (currentTab === 'favorite') {
    data = allData.filter(item => isTrue(item.Favorite));
  } else if (currentTab === 'category') {
    if (currentCategory) {
      data = allData.filter(item => !isTrue(item.Read) && String(item.Category || item['카테고리'] || "미분류").trim() === currentCategory);
    } else {
      data = allData.filter(item => !isTrue(item.Read)); 
    }
  } else if (currentTab === 'channel') {
    if (currentChannel) {
      data = allData.filter(item => !isTrue(item.Read) && String(item.ChannelName || "알 수 없음").trim() === currentChannel);
    } else {
      data = allData.filter(item => !isTrue(item.Read)); 
    }
  }
  
  if (searchQuery) {
    data = data.filter(item => {
      const title = String(item.Title || "").toLowerCase();
      const channel = String(item.ChannelName || "").toLowerCase();
      const keywords = String(item.Keywords || "").toLowerCase();
      const summary = String(item.Summary || "").toLowerCase();
      return title.includes(searchQuery) || channel.includes(searchQuery) || keywords.includes(searchQuery) || summary.includes(searchQuery);
    });
  }
  
  return data;
}

function renderGrid(append = false, startIndex = 0) {
  const grid = document.getElementById('card-grid');
  

  if (currentTab === 'category' && !searchQuery) {
    renderCategoryList();
    updateFloatingToolbar();
    return;
  }

  if (currentTab === 'channel' && !searchQuery) {
    renderChannelList();
    updateFloatingToolbar();
    return;
  }
  
  if (currentTab === 'mix') {
    renderMixGrid();
    updateFloatingToolbar();
    return;
  }


  updateFloatingToolbar();

  if (!append) {
    grid.innerHTML = "";
    grid.className = "grid";
    if (viewMode === 'list') grid.classList.add('list-mode');
    if (currentTab === 'favorite') grid.classList.add('favorites-view-mode');
    if (isSelectionMode) grid.classList.add('selection-mode-active');
    startIndex = 0;
  }

  let filteredData = getFilteredData();
  
  // 정렬 적용
  if (sortOrder === 'newest') {
    filteredData.sort((a, b) => (b.PublishDate || "").localeCompare(a.PublishDate || ""));
  } else if (sortOrder === 'oldest') {
    filteredData.sort((a, b) => (a.PublishDate || "").localeCompare(b.PublishDate || ""));
  } else if (sortOrder === 'favorited') {
    filteredData.sort((a, b) => (b.rowIndex || 0) - (a.rowIndex || 0));
  }



  if (filteredData.length === 0 && !append) {
    const emptyIcon = currentTab === 'unread' ? 'ph-envelope-open' : (currentTab === 'favorite' ? 'ph-star' : 'ph-folder-simple-minus');
    const emptyTitle = currentTab === 'unread' ? '모두 확인했습니다' : (currentTab === 'favorite' ? '즐겨찾기가 없습니다' : '이 카테고리에 영상이 없습니다');
    const emptyDesc = currentTab === 'unread' ? '새로운 콘텐츠가 들어오면 여기에 표시됩니다.' : (currentTab === 'favorite' ? '마음에 드는 콘텐츠에 별표를 눌러보세요.' : '');

    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.innerHTML = `
          <div class="empty-icon">
            <i class="ph ${emptyIcon}"></i>
          </div>
          <div class="empty-title">${emptyTitle}</div>
          <div class="empty-description">${emptyDesc}</div>
      `;
    grid.appendChild(emptyState);
    return;
  }

  const showData = filteredData.slice(startIndex, currentVisibleCount);
  const fragment = document.createDocumentFragment();
  
  let lastAgeGroup = null;

  showData.forEach(item => {
    // [Unread] 시간 기반 구분선 추가
    if (currentTab === 'unread' && !append) {
      const ageGroup = getAgeGroup(item.PublishDate);
      if (ageGroup.label !== lastAgeGroup) {
        const divider = document.createElement('div');
        divider.className = 'time-divider';
        divider.textContent = ageGroup.label;
        fragment.appendChild(divider);
        lastAgeGroup = ageGroup.label;
      }
    }

    const card = document.createElement('div');
    card.className = 'card';
    
    // [Unread] 나이 데이터 속성 추가
    if (currentTab === 'unread') {
      const ageData = getAgeGroup(item.PublishDate);
      card.setAttribute('data-age', ageData.type);
    }

    const imgUrl = item.Image_URL || 'https://placehold.co/640x360/1e1e2a/ffffff?text=No+Image';
    const isFav = isTrue(item.Favorite);
    const pubDate = item.PublishDate ? String(item.PublishDate).substring(0, 10) : '-';

    let keywordHtml = '';
    if (item.Keywords) {
      const keywords = String(item.Keywords).split(',').slice(0, 4);
      keywordHtml = keywords.map(k => `<span class="keyword-tag">${k.trim()}</span>`).join('');
    }

    // [Favorite] 추가 메타 정보
    let favMeta = '';
    if (currentTab === 'favorite') {
       favMeta = `<div class="favorited-date">즐겨찾기 소장 중</div>`;
    }

    const isSelected = selectedIds.has(String(item.ID));
    
    card.onclick = () => {
      if (isSelectionMode) {
        toggleItemSelection(item.ID, card);
      } else {
        openDetail(item.ID);
      }
    };
    
    if (isSelected) card.classList.add('selected');

    card.innerHTML = `
        <div class="selection-overlay">
          <i class=\"ph ${isSelected ? 'ph-check-circle ph-fill' : 'ph-circle'}\"></i>
        </div>
        <div class="card-thumbnail">
          <img src="${imgUrl}" alt="${item.Title}" loading="lazy" onerror="window.handleImageError(this)">
        </div>
        <div class="card-content">
          <div class="channel-info">
            <div class="channel-details">
              <div class="channel-name">${item.ChannelName || '알 수 없는 채널'}</div>
              <div class="video-date">${pubDate}</div>
              ${favMeta}
            </div>
          </div>
          <div class="card-title">${item.Title}</div>
          <div class="keywords">${keywordHtml}</div>
        </div>
        <div class="card-actions">
          <button class="btn-mark-read" onclick="handleMarkRead('${item.ID}', this, event)">
            <i class="ph ph-check-circle"></i>
            읽음 처리
          </button>
          <button class="btn-favorite ${isFav ? 'active' : ''}" onclick="handleToggleFav('${item.ID}', this, event)">
            <i class=\"ph ${isFav ? 'ph-star ph-fill' : 'ph-star'}\"></i>
          </button>
        </div>
      `;
    fragment.appendChild(card);
  });
  grid.appendChild(fragment);
}

function renderMixGrid() {
  const grid = document.getElementById('card-grid');
  grid.innerHTML = "";
  grid.className = "grid mix-grid";

  if (mixData.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.innerHTML = `
        <div class="empty-icon"><i class="ph ph-headphones"></i></div>
        <div class="empty-title">믹스 데이터가 없습니다</div>
        <div class="empty-description">NotebookLM_Mix 시트에 데이터가 없습니다.</div>
    `;
    grid.appendChild(emptyState);
    return;
  }

  const fragment = document.createDocumentFragment();
  mixData.forEach(item => {
    const card = document.createElement('div');
    card.className = 'card mix-card';
    
    let vIds = [];
    if (typeof item.sourceIds === 'string') {
      vIds = item.sourceIds.split(',').map(s => s.trim()).filter(s => s);
    }
    
    let typeIcon = 'ph-file-text';
    const typeUpper = (item.type || '').toUpperCase();
    if (typeUpper === 'AUDIO') {
      typeIcon = 'ph-headphones';
    } else if (typeUpper.includes('HTML') || typeUpper.includes('MAP')) {
      typeIcon = 'ph-tree-structure';
    } else if (typeUpper.includes('PDF')) {
      typeIcon = 'ph-file-pdf';
    }
    
    const timestampStr = typeof item.timestamp === 'string' ? item.timestamp.substring(0, 10) : '';
    
    const fileId = getGoogleDriveFileId(item.url);
    const imgUrl = fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w640` : '';
    
    card.innerHTML = `
      <div class="card-thumbnail mix-thumbnail" style="display:flex; align-items:center; justify-content:center; background: var(--bg-card-hover); position: relative; aspect-ratio: 16/9; overflow: hidden; width: 100%;">
        ${imgUrl ? `<img src="${imgUrl}" alt="${item.title}" loading="lazy" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` : ''}
        <div class="mix-fallback-icon" style="display: ${imgUrl ? 'none' : 'flex'}; align-items:center; justify-content:center; width:100%; height:100%; font-size: 40px; color: var(--accent-primary); position: absolute; top:0; left:0; background: var(--bg-card-hover);">
          <i class="ph ${typeIcon}"></i>
        </div>
      </div>
      <div class="card-content">
        <div class="channel-info">
          <div class="channel-details">
            <div class="channel-name" style="color:var(--accent-primary)">NotebookLM ${item.type}</div>
            <div class="video-date">${timestampStr}</div>
          </div>
        </div>
        <div class="card-title">${item.title || '제목 없음'}</div>
        <div class="keywords">
          <span class="keyword-tag"><i class="ph ph-youtube-logo"></i> ${vIds.length}개의 소스 영상</span>
        </div>
      </div>
    `;

    card.onclick = () => openMixDetail(item);
    fragment.appendChild(card);
  });
  grid.appendChild(fragment);
}

function renderCategoryList() {
  const grid = document.getElementById('card-grid');
  grid.innerHTML = "";
  grid.className = "vertical-list-mode";

  const categories = {};
  allData.filter(item => !isTrue(item.Read)).forEach(item => {
    const c = String(item.Category || item['카테고리'] || "미분류").trim();
    if (!categories[c]) categories[c] = { count: 0 };
    categories[c].count++;
  });

  const catList = Object.keys(categories).sort((a,b) => categories[b].count - categories[a].count);

  const fragment = document.createDocumentFragment();
  catList.forEach(c => {
    const card = document.createElement('div');
    card.className = 'list-row-item';
    card.onclick = () => openSublist('category', c);
    
    card.innerHTML = `
      <div class="list-row-left">
        <div class="list-row-icon"><i class="ph ph-folder-open"></i></div>
        <div class="list-row-title">${c}</div>
      </div>
      <div class="list-row-right">
        <div class="list-row-count">${categories[c].count}개의 새 영상</div>
        <i class="ph ph-caret-right" style="color: var(--text-muted); font-size: 20px;"></i>
      </div>
    `;
    fragment.appendChild(card);
  });
  grid.appendChild(fragment);
}


window.handleImageError = (img) => {
  // Prevent any inline HTML onerror loops
  img.removeAttribute('onerror');
  img.onerror = null;
  
  if (img.src.includes('maxresdefault.jpg')) {
    img.src = img.src.replace('maxresdefault.jpg', 'hqdefault.jpg');
    // JS-based fallback if hqdefault also fails
    img.onerror = function() {
      this.onerror = null;
      this.src = 'icons8-youtube-16.png';
    };
    return;
  }
  
  // Ultimate fallback to a local image that we know exists
  img.src = 'icons8-youtube-16.png';
};

// 상세 로직 및 Apps Script 호출 로직은 기존 기능 유지
function openDetail(id, keepMixActive = false) {
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
    document.getElementById('m-summary').innerHTML = String(item.Summary || '내용 없음').replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    document.getElementById('m-analysis').innerHTML = String(item.Analysis || '내용 없음').replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    document.getElementById('m-insights').innerHTML = String(item.Insights || '내용 없음').replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

    const mReadBtn = document.getElementById('m-btn-read');
    const mFavBtn = document.getElementById('m-btn-fav');
    const mWlBtn = document.getElementById('m-btn-wl');
    const isFav = isTrue(item.Favorite);
    const isRead = isTrue(item.Read);
    const isWl = isTrue(item.WatchLater || item['보관함']);

    mReadBtn.onclick = (e) => handleMarkRead(id, mReadBtn, e);
    if (isRead) {
      mReadBtn.style.opacity = '0.5';
      mReadBtn.innerHTML = '<i class="ph ph-check"></i> 읽음';
    } else {
      mReadBtn.style.opacity = '1';
      mReadBtn.innerHTML = '<i class="ph ph-check-circle"></i> 읽음 처리';
    }

    mFavBtn.onclick = (e) => handleToggleFav(id, mFavBtn, e);
    mFavBtn.className = `btn-favorite ${isFav ? 'active' : ''}`;
    mFavBtn.innerHTML = `<i class=\"ph ${isFav ? 'ph-star ph-fill' : 'ph-star'}\"></i>`;

    // Watch Later 버튼 핸들러
    mWlBtn.onclick = (e) => window.handleWatchLater(id, mWlBtn, e);
    if (isWl) {
      mWlBtn.classList.add('success');
      mWlBtn.innerHTML = '<i class="ph ph-list-checks"></i> 추가됨';
    } else {
      mWlBtn.classList.remove('success');
      mWlBtn.innerHTML = '<i class="ph ph-list-plus"></i> 보관함 추가';
    }

    detailBody.style.transition = 'all 0.4s ease';
    detailBody.style.opacity = '1';
    detailBody.style.transform = 'translateY(0)';
  }, 50);

  const container = document.getElementById('layout-container');
  if (!keepMixActive) {
    container.classList.remove('mix-detail-active');
  }
  container.classList.add('detail-active');
  document.body.classList.add('detail-open');
  detailPane.scrollTop = 0;
}

function closeDetail() {
  const container = document.getElementById('layout-container');
  container.classList.remove('detail-active');
  if (!container.classList.contains('mix-detail-active')) {
    document.body.classList.remove('detail-open');
  }
  currentDetailId = null;
}

function getGoogleDriveFileId(url) {
  if (!url) return null;
  const matchD = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (matchD && matchD[1]) return matchD[1];
  const matchId = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchId && matchId[1]) return matchId[1];
  return null;
}

function openMixDetail(item) {
  const detailPane = document.getElementById('pane-mix-detail');
  const detailBody = detailPane.querySelector('.modal-body');

  detailBody.style.opacity = '0';
  detailBody.style.transform = 'translateY(10px)';
  detailBody.style.transition = 'none';

  setTimeout(() => {
    document.getElementById('mix-title').innerText = item.title || '제목 없음';
    document.getElementById('mix-date-text').innerText = typeof item.timestamp === 'string' ? item.timestamp.substring(0, 10) : '';

    const mediaContainer = document.getElementById('mix-media-container');
    mediaContainer.innerHTML = '';
    
    if (item.url) {
      if (item.type && item.type.toUpperCase() === 'AUDIO') {
        const fileId = getGoogleDriveFileId(item.url);
        const streamUrl = fileId ? `https://docs.google.com/uc?export=download&id=${fileId}&confirm=t` : item.url;
        const previewUrl = item.url.replace('/view?usp=drivesdk', '/preview');

        mediaContainer.innerHTML = `
          <div class="custom-audio-player" style="background: var(--bg-card-hover); padding: 24px; border-radius: var(--radius-lg); border: 1px solid var(--border-default); margin-bottom: 24px; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 16px;">
            <!-- Audio Info -->
            <div class="audio-info" style="display: flex; align-items: center; gap: 16px; width: 100%;">
              <div class="audio-icon" style="width: 48px; height: 48px; border-radius: 50%; background: rgba(79, 70, 229, 0.1); color: var(--accent-primary); display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0;">
                <i class="ph-fill ph-headphones"></i>
              </div>
              <div class="audio-title-sec" style="overflow: hidden; flex: 1; display: flex; flex-direction: column; gap: 2px;">
                <div class="audio-filename" style="font-weight: 700; font-size: 15px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.title || '팟캐스트 오디오'}">${item.title || '팟캐스트 오디오'}</div>
                <div class="audio-subtext" style="font-size: 12px; color: var(--text-muted);">${fileId ? 'Google Drive 오디오 스트림' : '오디오 스트림'}</div>
              </div>
            </div>

            <!-- Hidden Native Audio -->
            <audio id="mix-audio-element" src="${streamUrl}" preload="metadata" style="display: none;"></audio>

            <!-- Custom Controls -->
            <div class="player-controls-row" style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
              <!-- Playback Rate & Skip Back -->
              <div style="display: flex; align-items: center; gap: 8px;">
                <select id="audio-speed-select" style="padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-default); background: white; color: var(--text-secondary); font-size: 12px; font-weight: 600; cursor: pointer; outline: none;">
                  <option value="0.5">0.5x</option>
                  <option value="1.0" selected>1.0x</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                  <option value="1.75">1.75x</option>
                  <option value="2.0">2.0x</option>
                </select>
                <button id="btn-audio-rewind" style="height: 32px; padding: 0 10px; border: 1px solid var(--border-default); background: white; color: var(--text-secondary); border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; font-size: 12px; font-weight: 600; cursor: pointer; transition: var(--transition-fast);" title="10초 뒤로">
                  <i class="ph ph-arrow-counter-clockwise" style="font-size: 14px;"></i> 10s
                </button>
              </div>

              <!-- Play/Pause -->
              <button id="btn-audio-play" style="width: 48px; height: 48px; border: none; background: var(--accent-primary); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; cursor: pointer; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3); transition: var(--transition-fast);" title="재생">
                <i class="ph-fill ph-play" id="play-icon" style="margin-left: 2px;"></i>
              </button>

              <!-- Skip Forward & Volume Toggle -->
              <div style="display: flex; align-items: center; gap: 8px;">
                <button id="btn-audio-forward" style="height: 32px; padding: 0 10px; border: 1px solid var(--border-default); background: white; color: var(--text-secondary); border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; font-size: 12px; font-weight: 600; cursor: pointer; transition: var(--transition-fast);" title="10초 앞으로">
                  10s <i class="ph ph-arrow-clockwise" style="font-size: 14px;"></i>
                </button>
                <button id="btn-audio-mute" style="width: 32px; height: 32px; border: 1px solid var(--border-default); background: white; color: var(--text-secondary); border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: var(--transition-fast);" title="음소거">
                  <i class="ph-fill ph-speaker-high" id="mute-icon" style="font-size: 16px;"></i>
                </button>
              </div>
            </div>

            <!-- Progress Bar -->
            <div style="display: flex; flex-direction: column; gap: 6px; width: 100%;">
              <div style="display: flex; align-items: center; width: 100%; gap: 12px;">
                <input type="range" id="audio-progress" min="0" max="100" value="0">
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); font-weight: 500;">
                <span id="audio-time-current">0:00</span>
                <span id="audio-time-duration">0:00</span>
              </div>
            </div>
            
            <!-- Fallback Alert (Initially Hidden) -->
            <div id="audio-fallback-msg" style="display: none; padding: 12px; background: rgba(217, 119, 6, 0.1); border: 1px solid rgba(217, 119, 6, 0.2); border-radius: 8px; color: var(--accent-warning); font-size: 12px; font-weight: 500; align-items: center; gap: 8px;">
              <i class="ph ph-warning-circle" style="font-size: 16px;"></i>
              <span>파일 용량이 커 스트리밍이 해제되었습니다. 안전 모드(드라이브 플레이어)로 전환합니다...</span>
            </div>
          </div>
        `;

        // Wait a tiny bit for elements to mount and bind controls
        setTimeout(() => {
          const audio = document.getElementById('mix-audio-element');
          const playBtn = document.getElementById('btn-audio-play');
          const playIcon = document.getElementById('play-icon');
          const rewindBtn = document.getElementById('btn-audio-rewind');
          const forwardBtn = document.getElementById('btn-audio-forward');
          const muteBtn = document.getElementById('btn-audio-mute');
          const muteIcon = document.getElementById('mute-icon');
          const speedSelect = document.getElementById('audio-speed-select');
          const progressBar = document.getElementById('audio-progress');
          const timeCurrent = document.getElementById('audio-time-current');
          const timeDuration = document.getElementById('audio-time-duration');
          const fallbackMsg = document.getElementById('audio-fallback-msg');

          if (!audio) return;

          // Play / Pause
          playBtn.onclick = () => {
            if (audio.paused) {
              audio.play().catch(err => console.log("Play failed: ", err));
            } else {
              audio.pause();
            }
          };

          audio.onplay = () => {
            playIcon.className = 'ph-fill ph-pause';
            playIcon.style.marginLeft = '0';
          };

          audio.onpause = () => {
            playIcon.className = 'ph-fill ph-play';
            playIcon.style.marginLeft = '2px';
          };

          // Skip -10s / +10s
          rewindBtn.onclick = () => {
            audio.currentTime = Math.max(0, audio.currentTime - 10);
          };

          forwardBtn.onclick = () => {
            audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
          };

          // Playback Rate
          speedSelect.onchange = (e) => {
            audio.playbackRate = parseFloat(e.target.value);
          };

          // Mute / Unmute
          muteBtn.onclick = () => {
            audio.muted = !audio.muted;
            muteIcon.className = audio.muted ? 'ph-fill ph-speaker-slash' : 'ph-fill ph-speaker-high';
          };

          // Time formatting helper
          const formatTime = (secs) => {
            if (isNaN(secs)) return '0:00';
            const m = Math.floor(secs / 60);
            const s = Math.floor(secs % 60);
            return `${m}:${s < 10 ? '0' : ''}${s}`;
          };

          // Update Progress
          audio.ontimeupdate = () => {
            if (audio.duration) {
              const pct = (audio.currentTime / audio.duration) * 100;
              progressBar.value = pct;
              progressBar.style.background = `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${pct}%, var(--border-default) ${pct}%, var(--border-default) 100%)`;
              timeCurrent.textContent = formatTime(audio.currentTime);
            }
          };

          audio.onloadedmetadata = () => {
            timeDuration.textContent = formatTime(audio.duration);
          };

          // Seek
          progressBar.oninput = (e) => {
            if (audio.duration) {
              const pct = parseFloat(e.target.value);
              audio.currentTime = (pct / 100) * audio.duration;
            }
          };

          // Error Fallback - VERY IMPORTANT
          audio.onerror = () => {
            console.warn("Direct stream failed, falling back to Google Drive preview iframe.");
            fallbackMsg.style.display = 'flex';
            setTimeout(() => {
              mediaContainer.innerHTML = `<iframe src="${previewUrl}" width="100%" height="200" allow="autoplay" style="border-radius:12px; border:none; margin-bottom: 20px;"></iframe>`;
            }, 1500); // Wait 1.5s to show warning message, then swap
          };
        }, 50);
      } else {
        // Document, Slide, HTML, PDF 등 모든 웹 문서 처리
        let previewUrl = item.url;
        let isGoogleDrive = false;
        const fileId = getGoogleDriveFileId(item.url);

        let iconClass = 'ph ph-file-text';
        let typeLabel = '문서';
        const typeUpper = (item.type || '').toUpperCase();

        if (typeUpper.includes('HTML') || typeUpper.includes('MAP')) {
          iconClass = 'ph ph-tree-structure';
          typeLabel = '마인드맵';
          if (fileId) {
            previewUrl = `${GAS_API_URL}?id=${fileId}`;
            isGoogleDrive = true;
          }
        } else {
          if (typeUpper.includes('SLIDE') || typeUpper.includes('DECK')) {
            iconClass = 'ph ph-presentation';
            typeLabel = '슬라이드';
          } else if (typeUpper.includes('PDF')) {
            iconClass = 'ph ph-file-pdf';
            typeLabel = 'PDF 문서';
          }
          previewUrl = getDocumentPreviewUrl(item.url);
          if (fileId) isGoogleDrive = true;
        }

        let iframeStyle = 'border: none; display: block; background: #ffffff; width: 100%;';
        let iframeHeightAttr = 'height="600"';

        if (typeUpper.includes('SLIDE') || typeUpper.includes('DECK')) {
          iframeStyle += ' aspect-ratio: 16 / 9; height: auto;';
          iframeHeightAttr = '';
        } else if (typeUpper.includes('PDF')) {
          iframeHeightAttr = 'height="850"';
        } else if (typeUpper.includes('HTML') || typeUpper.includes('MAP')) {
          iframeHeightAttr = 'height="700"';
        }

        const downloadBtnHtml = (isGoogleDrive && fileId) ? `
          <a href="https://docs.google.com/uc?export=download&id=${fileId}" target="_blank" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: white; border: 1px solid var(--border-default); border-radius: 6px; color: var(--text-secondary); text-decoration: none; font-size: 12px; font-weight: 600; transition: var(--transition-fast);" onmouseover="this.style.background='var(--bg-primary)'; this.style.color='var(--accent-primary)'" onmouseout="this.style.background='white'; this.style.color='var(--text-secondary)'">
            <i class="ph ph-download-simple"></i> 다운로드
          </a>
        ` : '';

        mediaContainer.innerHTML = `
          <div class="document-preview-wrapper" style="border: 1px solid var(--border-default); border-radius: var(--radius-lg); overflow: hidden; background: var(--bg-card); margin-bottom: 24px; box-shadow: var(--shadow-sm);">
            <div class="document-header" style="background: var(--bg-card-hover); padding: 12px 20px; border-bottom: 1px solid var(--border-default); display: flex; align-items: center; justify-content: space-between; gap: 12px;">
              <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                <div style="background: rgba(79, 70, 229, 0.1); color: var(--accent-primary); width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0;">
                  <i class="${iconClass}"></i>
                </div>
                <div style="font-weight: 700; font-size: 14px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.title || '미리보기'}">
                  <span style="font-weight:500; color:var(--text-muted); margin-right:6px;">[${typeLabel}]</span>${item.title || '미리보기 문서'}
                </div>
              </div>
              <div style="display: flex; gap: 8px; flex-shrink: 0;">
                ${downloadBtnHtml}
                <a href="${item.url}" target="_blank" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: white; border: 1px solid var(--border-default); border-radius: 6px; color: var(--text-secondary); text-decoration: none; font-size: 12px; font-weight: 600; transition: var(--transition-fast);" onmouseover="this.style.background='var(--bg-primary)'; this.style.color='var(--accent-primary)'" onmouseout="this.style.background='white'; this.style.color='var(--text-secondary)'">
                  <i class="ph ph-arrow-square-out"></i> 새 창에서 열기
                </a>
              </div>
            </div>
            <iframe src="${previewUrl}" ${iframeHeightAttr} style="${iframeStyle}"></iframe>
          </div>
        `;
      }
    }

    const sourcesContainer = document.getElementById('mix-sources-container');
    sourcesContainer.innerHTML = '';
    let vIds = [];
    if (typeof item.sourceIds === 'string') {
      vIds = item.sourceIds.split(',').map(s => s.trim()).filter(s => s);
    }
    
    // vId를 바탕으로 allData에서 원본 데이터를 찾아 카드 렌더링
    vIds.forEach(vId => {
      // url에서 비디오 ID 매칭할 수 있도록 추출 로직. allData의 각 item에서 vId를 포함하는지 확인
      const sourceItem = allData.find(d => {
        const dUrl = d.VideoURL || d.link || d.Video_URL || "";
        return dUrl.includes(vId);
      });
      
      const card = document.createElement('div');
      card.className = 'card source-card';
      // 클릭 시 해당 원본의 상세 페이지 열기 (이미 openDetail 함수가 있음)
      if (sourceItem) {
        card.onclick = () => {
          // 믹스 디테일을 닫지 않고 원본 디테일을 오른쪽에 함께 띄웁니다.
          openDetail(sourceItem.ID, true); 
        };
        const imgUrl = sourceItem.Image_URL || 'https://placehold.co/640x360/1e1e2a/ffffff?text=No+Image';
        const pubDate = sourceItem.PublishDate ? String(sourceItem.PublishDate).substring(0, 10) : '-';
        card.innerHTML = `
          <div class="card-thumbnail" style="width:160px; flex-shrink:0;">
            <img src="${imgUrl}" alt="${sourceItem.Title}" loading="lazy" onerror="window.handleImageError(this)">
          </div>
          <div class="card-content">
            <div class="channel-info">
              <div class="channel-name">${sourceItem.ChannelName || '알 수 없는 채널'}</div>
              <div class="video-date">${pubDate}</div>
            </div>
            <div class="card-title" style="font-size: 14px;">${sourceItem.Title}</div>
          </div>
        `;
      } else {
        // 원본 데이터를 못 찾았을 경우, 단순 링크로 표시
        card.onclick = () => window.open(`https://www.youtube.com/watch?v=${vId}`, '_blank');
        card.innerHTML = `
          <div class="card-thumbnail" style="width:160px; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:#1e1e2a;">
            <i class="ph ph-youtube-logo" style="font-size:24px; color:#ff0000;"></i>
          </div>
          <div class="card-content">
            <div class="card-title" style="font-size: 14px;">YouTube Video (${vId})</div>
            <div class="keywords">클릭하여 YouTube에서 열기</div>
          </div>
        `;
      }
      sourcesContainer.appendChild(card);
    });

    detailBody.style.transition = 'all 0.4s ease';
    detailBody.style.opacity = '1';
    detailBody.style.transform = 'translateY(0)';
  }, 50);

  const container = document.getElementById('layout-container');
  container.classList.remove('detail-active');
  container.classList.add('mix-detail-active');
  document.body.classList.add('detail-open'); // 스크롤 방지 등 동일한 클래스 사용
  setTimeout(() => detailPane.classList.add('open'), 10); // CSS 애니메이션 용 (필요 시)
  detailPane.scrollTop = 0;
}

function closeMixDetail() {
  const container = document.getElementById('layout-container');
  container.classList.remove('mix-detail-active');
  if (!container.classList.contains('detail-active')) {
    document.body.classList.remove('detail-open');
  }
  const detailPane = document.getElementById('pane-mix-detail');
  if (detailPane) {
    detailPane.classList.remove('open');
  }
}

window.handleMarkRead = async (id, btn, event) => {
  if (event) event.stopPropagation();
  const item = allData.find(d => String(d.ID) === String(id));
  if (!item) return;

  const originalHtml = btn.innerHTML;
  const originalOpacity = btn.style.opacity;
  const originalReadState = item.Read;

  // 이미 읽음이면 처리하지 않음
  if (isTrue(originalReadState)) return;

  // 1. 낙관적 업데이트
  item.Read = true;
  updateStats();

  const isUnreadTab = (currentTab === 'unread');
  if (isUnreadTab) {
    renderGrid();
    if (currentDetailId === String(id)) {
      closeDetail();
    }
  } else {
    btn.style.opacity = '0.5';
    btn.innerHTML = '<i class="ph ph-check"></i> 읽음';
    
    // 상세 보기 창의 읽음 버튼도 업데이트
    const mReadBtn = document.getElementById('m-btn-read');
    if (currentDetailId === String(id) && mReadBtn) {
      mReadBtn.style.opacity = '0.5';
      mReadBtn.innerHTML = '<i class="ph ph-check"></i> 읽음';
    }
  }

  // 2. 비동기 백그라운드 호출
  callGAS({ action: 'markAsRead', id: id }).then(res => {
    if (!res || res.status !== 'success') {
      throw new Error('GAS API returned error status');
    }
  }).catch(e => {
    console.error('읽음 처리 동기화 실패, 롤백 실행:', e);
    // 3. 실패 시 롤백
    item.Read = originalReadState;
    updateStats();
    if (isUnreadTab) {
      renderGrid();
      if (currentDetailId === String(id)) {
        openDetail(id);
      }
    } else {
      btn.style.opacity = originalOpacity;
      btn.innerHTML = originalHtml;
      
      const mReadBtn = document.getElementById('m-btn-read');
      if (currentDetailId === String(id) && mReadBtn) {
        mReadBtn.style.opacity = '1';
        mReadBtn.innerHTML = '<i class="ph ph-check-circle"></i> 읽음 처리';
      }
    }
    alert('읽음 처리 동기화에 실패했습니다.');
  });
};

window.handleToggleFav = async (id, btn, event) => {
  if (event) event.stopPropagation();
  const item = allData.find(d => String(d.ID) === String(id));
  if (!item) return;

  const originalFavState = item.Favorite;
  const newFavState = !isTrue(originalFavState);

  // 1. 낙관적 업데이트
  item.Favorite = newFavState;
  updateStats();

  const originalHtml = btn.innerHTML;
  const originalClassName = btn.className;

  const updateButtonUI = (buttonEl, isFavVal) => {
    if (!buttonEl) return;
    buttonEl.className = `btn-favorite ${isFavVal ? 'active' : ''}`;
    buttonEl.innerHTML = `<i class="ph ${isFavVal ? 'ph-star ph-fill' : 'ph-star'}"></i>`;
  };

  // 현재 클릭된 버튼 업데이트
  updateButtonUI(btn, newFavState);

  // 상세 보기창의 별표 버튼도 함께 업데이트
  const mFavBtn = document.getElementById('m-btn-fav');
  if (currentDetailId === String(id) && mFavBtn && mFavBtn !== btn) {
    updateButtonUI(mFavBtn, newFavState);
  }

  const isFavoriteTab = (currentTab === 'favorite');
  if (isFavoriteTab && !newFavState) {
    renderGrid();
    if (currentDetailId === String(id)) closeDetail();
  }

  // 2. 비동기 호출
  callGAS({
    action: 'toggleFavorite',
    id: id,
    currentStatus: isTrue(originalFavState)
  }).then(res => {
    if (res && res.status === 'success') {
      item.Favorite = res.result;
      updateStats();
    } else {
      throw new Error('GAS API returned error status');
    }
  }).catch(e => {
    console.error('즐겨찾기 토글 동기화 실패, 롤백 실행:', e);
    // 3. 실패 시 롤백
    item.Favorite = originalFavState;
    updateStats();
    
    updateButtonUI(btn, isTrue(originalFavState));
    if (currentDetailId === String(id) && mFavBtn && mFavBtn !== btn) {
      updateButtonUI(mFavBtn, isTrue(originalFavState));
    }

    if (isFavoriteTab) {
      renderGrid();
      if (currentDetailId === String(id)) {
        openDetail(id);
      }
    }
    alert('즐겨찾기 토글 동기화에 실패했습니다.');
  });
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
  
  if (!ytTokenClient) {
    initYouTubeAuth(); // 미초기화 시 재시도
    if (!ytTokenClient) {
      alert('Google 인증 모듈이 준비 중입니다. 잠시 후 다시 클릭해주세요.');
      return;
    }
  }

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
    ytTokenClient.requestAccessToken({ prompt: 'select_account' });
    return;
  }

  await executeAddToYouTube(vId, btn, id);
};

async function executeAddToYouTube(vId, btn, rowId) {
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-arrows-clockwise ph-spin"></i> 추가 중...';
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
        btn.innerHTML = '<i class="ph ph-list-checks"></i> 추가 완료';
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



// [Multi-Select Helpers]
function toggleSelectionMode(forceValue) {
  isSelectionMode = forceValue !== undefined ? forceValue : !isSelectionMode;
  selectedIds.clear();
  
  const selectModeBtn = document.getElementById('btn-select-mode');
  if (selectModeBtn) {
    selectModeBtn.classList.toggle('active', isSelectionMode);
  }
  
  updateSelectionToolbar();
  renderGrid();
  if (isSelectionMode) closeDetail();
}

function toggleItemSelection(id, cardEl) {
  const sId = String(id);
  if (selectedIds.has(sId)) {
    selectedIds.delete(sId);
    cardEl.classList.remove('selected');
    cardEl.querySelector('.selection-overlay span').textContent = 'radio_button_unchecked';
  } else {
    selectedIds.add(sId);
    cardEl.classList.add('selected');
    cardEl.querySelector('.selection-overlay span').textContent = 'check_circle';
  }
  updateSelectionToolbar();
}

function updateSelectionToolbar() {
  const markBtn = document.getElementById('btn-mark-selected-read');
  const divider = document.querySelector('.toolbar-divider.selection-only');
  const countText = document.getElementById('selected-count-text');
  
  if (isSelectionMode && selectedIds.size > 0) {
    markBtn.classList.remove('hidden');
    divider.classList.remove('hidden');
    countText.textContent = `${selectedIds.size}개 읽음 처리`;
  } else {
    markBtn.classList.add('hidden');
    divider.classList.add('hidden');
  }
}

async function handleMarkSelectedRead() {
  if (selectedIds.size === 0) return;
  
  const idsToProcess = Array.from(selectedIds);
  const markBtn = document.getElementById('btn-mark-selected-read');
  const originalHtml = markBtn.innerHTML;
  
  markBtn.disabled = true;
  markBtn.style.opacity = '0.7';
  markBtn.innerHTML = `<i class="ph ph-arrows-clockwise ph-spin"></i> 처리 중...`;

  // 원래 상태 백업 (롤백용)
  const originalStates = idsToProcess.map(id => {
    const item = allData.find(d => String(d.ID) === String(id));
    return { id, item, originalRead: item ? item.Read : false };
  });

  // 1. 낙관적 업데이트
  idsToProcess.forEach(id => {
    const item = allData.find(d => String(d.ID) === String(id));
    if (item) item.Read = true;
  });

  updateStats();
  toggleSelectionMode(false); // 선택 모드 종료 및 새로고침

  // 2. 비동기 배치 호출
  callGAS({ action: 'batchMarkAsRead', ids: idsToProcess }).then(res => {
    if (!res || res.status !== 'success') {
      throw new Error('GAS API returned error status');
    }
    console.log('일괄 읽음 동기화 완료:', res.result, '개 업데이트됨');
  }).catch(e => {
    console.error('일괄 읽음 동기화 실패, 롤백 실행:', e);
    // 3. 실패 시 롤백
    originalStates.forEach(state => {
      if (state.item) {
        state.item.Read = state.originalRead;
      }
    });
    updateStats();
    renderGrid();
    alert('일괄 읽음 처리 동기화에 실패했습니다.');
  });
}

function getAgeGroup(dateStr) {
  if (!dateStr) return { type: 'old', label: '이전' };
  const now = new Date();
  const pubDate = new Date(dateStr);
  const diffHours = (now - pubDate) / (1000 * 60 * 60);

  if (diffHours < 1) return { type: 'fresh', label: '방금 도착' };
  if (diffHours < 24) return { type: 'today', label: '오늘' };
  return { type: 'old', label: '이전' };
}

function updateFloatingToolbar() {
  const toolbar = document.getElementById('floating-toolbar');
  if (!toolbar) return;

  // Show/Hide logic: Hide in category carousel, show elsewhere
  if ((currentTab === 'category' && !currentCategory) || currentTab === 'today') {
    toolbar.classList.add('hidden');
    return;
  }
  toolbar.classList.remove('hidden');

  // Update Sort Options
  const sortSelect = document.getElementById('toolbar-sort-select');
  if (sortSelect) {
    let options = '<option value="newest">최신순</option><option value="oldest">오래된순</option>';
    if (currentTab === 'favorite') {
      options += '<option value="favorited">최근 추가순</option>';
    }
    
    const currentVal = sortOrder;
    sortSelect.innerHTML = options;
    if ([...sortSelect.options].some(opt => opt.value === currentVal)) {
      sortSelect.value = currentVal;
    } else {
      sortSelect.value = 'newest';
    }
  }

  // Sync View Type Buttons
  toolbar.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewMode);
  });
}



function renderChannelList() {
  const grid = document.getElementById('card-grid');
  grid.innerHTML = "";
  grid.className = "vertical-list-mode";

  const channelMap = {};
  allData.filter(item => !isTrue(item.Read)).forEach(item => {
    const ch = String(item.ChannelName || "알 수 없음").trim();
    if (!channelMap[ch]) channelMap[ch] = { count: 0 };
    channelMap[ch].count++;
  });

  const channelList = Object.keys(channelMap).sort((a,b) => channelMap[b].count - channelMap[a].count);

  if (channelList.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i class="ph ph-youtube-logo"></i></div>
        <div class="empty-title">채널이 없습니다</div>
        <div class="empty-description">읽지 않은 영상이 없습니다.</div>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  channelList.forEach(ch => {
    const card = document.createElement('div');
    card.className = 'list-row-item';
    card.onclick = () => openSublist('channel', ch);
    
    card.innerHTML = `
      <div class="list-row-left">
        <div class="list-row-title">${ch}</div>
      </div>
      <div class="list-row-right">
        <div class="list-row-count">${channelMap[ch].count}개의 새 영상</div>
        <i class="ph ph-caret-right" style="color: var(--text-muted); font-size: 20px;"></i>
      </div>
    `;
    fragment.appendChild(card);
  });
  grid.appendChild(fragment);
}


function openSublist(type, key) {
  document.querySelector('.layout-container').classList.add('sublist-active');
  document.getElementById('sl-title').textContent = key;
  
  const sublistBody = document.getElementById('sublist-body');
  sublistBody.innerHTML = '';
  
  let data = [];
  if (type === 'category') {
    data = allData.filter(item => !isTrue(item.Read) && String(item.Category || item['카테고리'] || "미분류").trim() === key);
  } else {
    data = allData.filter(item => !isTrue(item.Read) && String(item.ChannelName || "알 수 없음").trim() === key);
  }
  
  if (sortOrder === 'newest') {
    data.sort((a, b) => (b.PublishDate || "").localeCompare(a.PublishDate || ""));
  } else if (sortOrder === 'oldest') {
    data.sort((a, b) => (a.PublishDate || "").localeCompare(b.PublishDate || ""));
  }
  
  data.forEach(item => {
    const card = document.createElement('div');
    card.className = 'sublist-card';
    card.onclick = () => {
      openDetail(item.id || item.ID);
    };
    
    let videoId = extractVideoId(item.URL || item['URL'] || "");
    const thumb = item.Image_URL || item['썸네일'] || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : 'icons8-youtube-16.png');
    
    const isFav = isTrue(item.Favorite);

    card.innerHTML = `
      <div style="display: flex; gap: 16px; flex: 1; align-items: center; overflow: hidden;">
        <img src="${thumb}" class="sublist-thumb" onerror="window.handleImageError(this)">
        <div class="sublist-info" style="flex: 1; min-width: 0;">
          <div class="sublist-title">${item.Title || "제목 없음"}</div>
          <div class="sublist-date">${item.PublishDate || ""}</div>
        </div>
      </div>
      <div class="sublist-actions" style="display: flex; gap: 8px; flex-shrink: 0; align-items: center; border-left: 1px solid var(--border-subtle); padding-left: 16px;">
        <button class="btn-mark-read" style="padding: 8px 12px; height: 44px; border-radius: 8px; font-size: 13px; border: 1px solid var(--border-default); background: white; color: var(--text-primary); cursor: pointer;" onclick="event.stopPropagation(); handleMarkRead('${item.id || item.ID}', this, event)">
          <i class="ph ph-check-circle" style="font-size: 18px; margin-right: 4px;"></i> 읽음
        </button>
        <button class="btn-favorite ${isFav ? 'active' : ''}" style="width: 44px; height: 44px; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid var(--border-default); background: white; cursor: pointer; color: ${isFav ? 'var(--accent-warning)' : 'var(--text-muted)'};" onclick="event.stopPropagation(); handleToggleFav('${item.id || item.ID}', this, event)">
          <i class="ph ${isFav ? 'ph-star ph-fill' : 'ph-star'}" style="font-size: 20px;"></i>
        </button>
      </div>
    `;
    sublistBody.appendChild(card);
  });
}

function closeSublist() {
  document.querySelector('.layout-container').classList.remove('sublist-active');
}

function getDocumentPreviewUrl(url) {
  if (!url) return '';
  
  // 1. Google Slides
  const slidesMatch = url.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
  if (slidesMatch && slidesMatch[1]) {
    return `https://docs.google.com/presentation/d/${slidesMatch[1]}/embed?start=false&loop=false&delayms=3000`;
  }
  
  // 2. Google Docs
  const docsMatch = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (docsMatch && docsMatch[1]) {
    return `https://docs.google.com/document/d/${docsMatch[1]}/preview`;
  }

  // 3. Google Sheets
  const sheetsMatch = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (sheetsMatch && sheetsMatch[1]) {
    return `https://docs.google.com/spreadsheets/d/${sheetsMatch[1]}/preview`;
  }
  
  // 4. Default Google Drive Preview
  return url.replace('/view?usp=drivesdk', '/preview');
}
