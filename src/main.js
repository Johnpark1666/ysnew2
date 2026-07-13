import './style.css'
import { marked } from 'marked';
import { renderConnect } from './connect.js';
import { createClient } from '@supabase/supabase-js';

// ── Supabase 설정 ──
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// 마크다운 파싱 헬퍼 (테이블을 컨테이너로 감싸 브루탈리즘 스타일 및 가로 스크롤 적용)
function renderMarkdown(text) {
  if (!text) return '내용 없음';
  const html = marked.parse(String(text));
  return html
    .replace(/<table>/g, '<div class="table-container"><table>')
    .replace(/<\/table>/g, '</table></div>');
}

// [설정] 이미지 URL 기본값
const FALLBACK_IMG = 'https://placehold.co/640x360/1e1e2a/ffffff?text=No+Image';

let allData = [];
let briefingData = []; // !!BRIEFING_LATEST!! 데이터를 따로 저장
let mixData = []; // NotebookLM_Mix 데이터
let githubData = []; // GitHub 시트 데이터
let searchQuery = '';
let currentTab = 'unread';
let currentCategory = null;
let currentChannel = null; // 현재 선택된 카테고리 (null이면 전체 카테고리 목록 표시)
let currentDetailId = null;

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
let currentFilteredCount = 0; // 캐싱된 필터 결과 수 (스크롤 시 O(1) 비교용)

// 초기 데이터 로드
window.addEventListener('DOMContentLoaded', () => {
  fetchData();
  setupEventListeners();
  initCanvasControllers();
  initRightPaneResizers();
  window.addEventListener('resize', updateFloatingToolbar);
  const container = document.getElementById('layout-container');
  if (container) container.classList.add('tab-unread');
});

// ── Supabase 데이터 로드 (최적화) ──
const VIDEO_FIELDS = 'id,title,channel_name,channel_avatar,video_url,publish_date,duration,processed_at,read,favorite,image_url,plus_key,category,keywords,timeline,summary,created_at';
const REPO_FIELDS = 'id,title,channel_name,video_url,publish_date,duration,processed_at,read,favorite,image_url,plus_key,category,keywords,summary,created_at';
const CACHE_KEY = 'ysnew2_cache_v1';
const CACHE_TTL = 5 * 60 * 1000; // 5분

async function fetchData() {
  const loader = document.getElementById('loader');
  loader.style.display = 'block';
  loader.innerHTML = '<div class="loader-spinner"></div><div class="loader-text">최신 데이터를 불러오는 중...</div>';
  document.getElementById('card-grid').innerHTML = '';
  let cached = null;

  try {
    // 1. 캐시 먼저 표시
    cached = loadCache();
    if (cached) {
      allData = cached.allData;
      githubData = cached.githubData;
      mixData = cached.mixData;
      onDataLoaded();
      loader.innerHTML = '<div class="loader-spinner"></div><div class="loader-text">실시간 업데이트 확인 중...</div>';
    }

    if (!supabase) throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');

    // 2. 3개 테이블 병렬 쿼리 + 경량 필드만
    const [vResult, gResult, mResult] = await Promise.all([
      supabase.from('videos').select(VIDEO_FIELDS).order('publish_date', { ascending: false }),
      supabase.from('github_repos').select(REPO_FIELDS).order('publish_date', { ascending: false }),
      supabase.from('notebooklm_mixes').select('id,created_at,type,url,source_ids,title').order('created_at', { ascending: false })
    ]);

    if (vResult.error) throw new Error(`videos 조회 실패: ${vResult.error.message}`);
    if (gResult.error) throw new Error(`github_repos 조회 실패: ${gResult.error.message}`);
    if (mResult.error) throw new Error(`notebooklm_mixes 조회 실패: ${mResult.error.message}`);

    // 3. 데이터 가공
    briefingData = vResult.data.filter(d => String(d.id || '').trim() === "!!BRIEFING_LATEST!!");
    allData = vResult.data.filter(d => {
      const id = String(d.id || '').trim();
      return id !== "" && id !== "!!BRIEFING_LATEST!!";
    }).map(mapVideoRowLight);

    githubData = (gResult.data || []).filter(d => String(d.id || '').trim() !== '').map(mapVideoRowLight);

    mixData = (mResult.data || []).map(m => ({
      id: 'mix_' + m.id,
      timestamp: m.created_at,
      type: m.type,
      url: m.url,
      sourceIds: m.source_ids,
      title: m.title
    }));

    console.log('실시간 연동:', allData.length, '영상, Mix:', mixData.length, '개, GitHub:', githubData.length, '개');

    // 4. 캐시 저장 (로컬에 저장)
    saveCache({ allData, githubData, mixData, timestamp: Date.now() });

    onDataLoaded();

  } catch (error) {
    if (!cached) onLoadError(error);
    else console.warn('새로고침 실패, 캐시 데이터 사용 중:', error.message);
  }
}

// 경량 매핑 (무거운 필드 제외)
function mapVideoRowLight(dbRow) {
  return {
    ID: dbRow.id || '',
    Title: dbRow.title || '',
    ChannelName: dbRow.channel_name || '',
    ChannelAvatar: dbRow.channel_avatar || '',
    VideoURL: dbRow.video_url || '',
    PublishDate: dbRow.publish_date || '',
    Duration: dbRow.duration || '',
    ProcessDate: dbRow.processed_at || '',
    Read: dbRow.read || false,
    Favorite: dbRow.favorite || false,
    Summary: dbRow.summary || '',
    Image_URL: dbRow.image_url || '',
    Plus_Key: dbRow.plus_key || '',
    Category: dbRow.category || '',
    Keywords: dbRow.keywords || '',
    Timeline: dbRow.timeline || '',
  };
}

// 지연 로딩: 상세 패널 열릴 때 무거운 필드 fetch
const _detailCache = {};
async function lazyLoadDetail(id) {
  if (_detailCache[id]) return _detailCache[id];
  const { data, error } = await supabase
    .from('videos')
    .select('summary,insights,implications,analysis,transcript,show_transcript')
    .eq('id', id)
    .single();
  if (!error && data) {
    _detailCache[id] = data;
    return data;
  }
  // Fallback: github
  const { data: gData } = await supabase
    .from('github_repos')
    .select('summary,insights,implications,analysis')
    .eq('id', id)
    .single();
  if (gData) _detailCache[id] = gData;
  return gData || {};
}
// Connect 탭에서 접근할 수 있도록 전역 노출
window.lazyLoadDetail = lazyLoadDetail;

// 캐시 helpers
function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (Date.now() - c.timestamp > CACHE_TTL) return null;
    return c;
  } catch { return null; }
}
function saveCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
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

// YouTube URL → Video ID 추출
function extractVideoId(url) {
  if (!url) return '';
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : (url.length === 11 ? url : '');
}

function setupEventListeners() {
  document.getElementById('tab-unread').onclick = () => switchTab('unread');
  document.getElementById('tab-favorite').onclick = () => switchTab('favorite');
  
  document.getElementById('tab-category').onclick = () => switchTab('category');
  const tabChannel = document.getElementById('tab-channel');
  if (tabChannel) tabChannel.onclick = () => switchTab('channel');

  const tabMix = document.getElementById('tab-mix');
  if (tabMix) tabMix.onclick = () => switchTab('mix');

  const tabNetwork = document.getElementById('tab-network');
  if (tabNetwork) tabNetwork.onclick = () => switchTab('network');
  
  const tabGithub = document.getElementById('tab-github');
  if (tabGithub) tabGithub.onclick = () => switchTab('github');
  
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
  
  const closeSublistBtn = document.getElementById('close-sublist');
  if (closeSublistBtn) closeSublistBtn.onclick = () => closeSublist();
  
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

  // Infinite Scroll (O(1) 캐싱된 필터 결과 수 비교를 통한 스크롤 버벅임 방지)
  const listPane = document.getElementById('pane-list');
  listPane.onscroll = () => {
    if (listPane.scrollTop + listPane.clientHeight >= listPane.scrollHeight - 100) {
      if (currentVisibleCount < currentFilteredCount) {
        currentVisibleCount += currentPageSize;
        renderGrid(true, currentVisibleCount - currentPageSize);
      }
    }
  };

  // Detail Navigation (mobile buttons)
  document.getElementById('detail-nav-prev').onclick = () => navigateDetail(-1);
  document.getElementById('detail-nav-next').onclick = () => navigateDetail(1);

  // Scroll-to-top button (mobile)
  const scrollTopBtn = document.getElementById('detail-scroll-top');
  if (scrollTopBtn) {
    scrollTopBtn.onclick = () => {
      document.getElementById('pane-detail').scrollTop = 0;
    };
    document.getElementById('pane-detail').addEventListener('scroll', () => {
      const scrollTop = document.getElementById('pane-detail').scrollTop;
      scrollTopBtn.classList.toggle('visible', scrollTop > 200);
    }, { passive: true });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetail();
  });
}

function updateStats() {
  window.openDetail = openDetail; // Expose openDetail globally as early as possible
  const unreadCount = allData.filter(item => !isTrue(item.Read)).length;
  const favCount = allData.filter(item => isTrue(item.Favorite)).length + githubData.filter(item => isTrue(item.Favorite)).length;

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

  const githubUnreadCount = githubData.filter(item => !isTrue(item.Read)).length;
  const githubCountEl = document.getElementById('github-count');
  if (githubCountEl) githubCountEl.textContent = githubUnreadCount;

  // Update left visuals with dynamic counter, keywords and headlines
  updateLeftPanelDynamicData();
}

function switchTab(tabName) {
  
  if (currentTab === tabName && tabName !== 'category' && tabName !== 'channel') return;
  if (currentTab === tabName && tabName === 'category' && currentCategory === null) return;
  if (currentTab === tabName && tabName === 'channel' && currentChannel === null) return;

  currentTab = tabName;
  currentCategory = null; 
  currentChannel = null; 

  const container = document.getElementById('layout-container');
  if (container) {
    container.className = container.className.replace(/\btab-\S+/g, '').trim();
    container.classList.add(`tab-${tabName}`);
  } 


  document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tabName}`).classList.add('active');

  currentVisibleCount = currentPageSize;
  
  // 탭 전환 시 선택 모드 해제
  if (isSelectionMode) toggleSelectionMode(false);
  closeSublist();
  
  closeDetail();
  closeMixDetail();

  const paneList = document.getElementById('pane-list');
  if (paneList) paneList.style.display = '';

  renderGrid();
}

function loadMore() {
  if (currentVisibleCount >= currentFilteredCount) return;

  const start = currentVisibleCount;
  currentVisibleCount += currentPageSize;
  renderGrid(true, start);
}

function getFilteredData() {
  let data = [];
  if (currentTab === 'github') {
    data = githubData.filter(item => !isTrue(item.Read));
  } else if (currentTab === 'unread') {
    data = allData.filter(item => !isTrue(item.Read));
  } else if (currentTab === 'favorite') {
    const ytFavs = allData.filter(item => isTrue(item.Favorite));
    const githubFavs = githubData.filter(item => isTrue(item.Favorite));
    data = [...ytFavs, ...githubFavs];
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

  if (currentTab === 'network') {
    const grid = document.getElementById('card-grid');
    grid.className = '';
    renderConnect(grid, { allData, githubData });
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
  currentFilteredCount = filteredData.length;
  
  // 정렬 적용
  if (sortOrder === 'newest') {
    filteredData.sort((a, b) => (b.PublishDate || "").localeCompare(a.PublishDate || ""));
  } else if (sortOrder === 'oldest') {
    filteredData.sort((a, b) => (a.PublishDate || "").localeCompare(b.PublishDate || ""));
  } else if (sortOrder === 'favorited') {
    filteredData.sort((a, b) => (b.rowIndex || 0) - (a.rowIndex || 0));
  }



  if (filteredData.length === 0 && !append) {
    const emptyIcon = currentTab === 'unread' ? 'ph-envelope-open' : (currentTab === 'favorite' ? 'ph-star' : (currentTab === 'github' ? 'ph-github-logo' : 'ph-folder-simple-minus'));
    const emptyTitle = currentTab === 'unread' ? '모두 확인했습니다' : (currentTab === 'favorite' ? '즐겨찾기가 없습니다' : (currentTab === 'github' ? '저장소를 모두 확인했습니다' : '이 카테고리에 영상이 없습니다'));
    const emptyDesc = currentTab === 'unread' ? '새로운 콘텐츠가 들어오면 여기에 표시됩니다.' : (currentTab === 'favorite' ? '마음에 드는 콘텐츠에 별표를 눌러보세요.' : (currentTab === 'github' ? '새로운 깃허브 프로젝트가 들어오면 여기에 표시됩니다.' : ''));

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

// 믹스 유형별 알약 색상
function getMixTypeColor(type) {
  const t = (type || '').toUpperCase();
  if (t === 'AUDIO') return '#0891b2';
  if (t.includes('HTML') || t.includes('MAP')) return '#7c3aed';
  if (t.includes('PDF')) return '#dc2626';
  if (t.includes('DOC') || t.includes('DOCX')) return '#2563eb';
  if (t.includes('VIDEO')) return '#ea580c';
  if (t.includes('NOTE')) return '#059669';
  return '#4f46e5';
}
// 믹스 유형별 한글 레이블
function getMixTypeLabel(type) {
  const t = (type || '').toUpperCase();
  if (t === 'AUDIO') return '🎙️ 팟캐스트';
  if (t.includes('HTML') || t.includes('MAP')) return '🧠 마인드맵';
  if (t.includes('PDF')) return '📑 슬라이드';
  if (t.includes('DOC') || t.includes('DOCX')) return '📄 문서';
  if (t.includes('VIDEO')) return '🎬 영상';
  if (t.includes('NOTE')) return '📝 노트';
  return '📋 자료';
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
        <!-- 유형 알약 태그 -->
        <span style="position:absolute;top:10px;left:10px;z-index:2;padding:4px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:0.03em;display:flex;align-items:center;gap:4px;box-shadow:0 2px 6px rgba(0,0,0,0.15);
          background:${getMixTypeColor(item.type)};color:white;">
          <i class="ph ${typeIcon}" style="font-size:12px;"></i> ${getMixTypeLabel(item.type)}
        </span>
        ${imgUrl ? `<img src="${imgUrl}" alt="${item.title}" loading="lazy" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` : ''}
        <div class="mix-fallback-icon" style="display: ${imgUrl ? 'none' : 'flex'}; align-items:center; justify-content:center; width:100%; height:100%; font-size: 40px; color: var(--accent-primary); position: absolute; top:0; left:0; background: var(--bg-card-hover);">
          <i class="ph ${typeIcon}"></i>
        </div>
      </div>
      <div class="card-content">
        <div class="channel-info">
          <div class="channel-details">
            <div class="channel-name" style="color:var(--accent-primary)">${getMixTypeLabel(item.type)}</div>
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

function renderNetworkPlaceholder() {
  const grid = document.getElementById('card-grid');
  grid.innerHTML = `
    <div class="empty-state" style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:120px 24px;text-align:center;">
      <div class="empty-icon" style="font-size:48px;color:var(--text-muted);margin-bottom:16px;">
        <i class="ph ph-globe"></i>
      </div>
      <div class="empty-title" style="font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;">커넥트</div>
      <div class="empty-description" style="margin-top:8px;font-size:14px;color:var(--text-muted);font-weight:500;">준비 중인 탭입니다</div>
    </div>
  `;
}

function renderCategoryList() {
  const grid = document.getElementById('card-grid');
  grid.innerHTML = "";
  grid.className = "vertical-list-mode";

  const CATEGORY_ICONS = {
    '뉴스/정치': '/icon/news.png',
    '경제/비즈니스': '/icon/business.png',
    '경제/금융': '/icon/economy.png',
    '자기계발/교육': '/icon/education.png',
    '엔터테인먼트': '/icon/entertainment.png',
    'AI/테크': '/icon/ai.png',
    '사회/이슈': '/icon/society.png',
    '게임': '/icon/game.png',
    'IT/기술': '💻',
    '스포츠': '🏅',
    '스포츠/레저': '🏅',
  };

  const categories = {};
  allData.filter(item => !isTrue(item.Read)).forEach(item => {
    const c = String(item.Category || item['카테고리'] || "미분류").trim();
    if (!categories[c]) categories[c] = { count: 0 };
    categories[c].count++;
  });

  const catList = Object.keys(categories).sort((a,b) => categories[b].count - categories[a].count);

  const fragment = document.createDocumentFragment();
  catList.forEach(c => {
    const icon = CATEGORY_ICONS[c] || '📁';
    const baseUrl = import.meta.env.BASE_URL || '/';
    const iconHtml = icon.startsWith('/icon/')
      ? `<img src="${baseUrl.replace(/\/$/, '')}${icon}" alt="${c}" class="category-png-icon">`
      : `<span style="font-size:22px">${icon}</span>`;
    const card = document.createElement('div');
    card.className = 'list-row-item';
    card.onclick = () => openSublist('category', c);
    
    card.innerHTML = `
      <div class="list-row-left">
        <div class="list-row-icon">${iconHtml}</div>
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
  window.openDetail = openDetail; // Expose globally
  currentDetailId = String(id);
  let item = allData.find(d => String(d.ID) === currentDetailId);
  if (!item) {
    item = githubData.find(d => String(d.ID) === currentDetailId);
  }
  if (!item) return;

  const detailPane = document.getElementById('pane-detail');
  const detailBody = detailPane.querySelector('.modal-body');

  detailBody.style.opacity = '0';
  detailBody.style.transform = 'translateY(10px)';
  detailBody.style.transition = 'none';

  // Reset video section to remove any existing player iframe and show thumbnail
  const videoSection = document.querySelector('.modal-video-section');
  if (videoSection) {
    const iframe = videoSection.querySelector('iframe');
    if (iframe) iframe.remove();
    const mImg = document.getElementById('m-img');
    if (mImg) mImg.style.display = '';
  }

  setTimeout(() => {
    document.getElementById('m-title').innerText = item.Title;
    const pubDate = item.PublishDate ? String(item.PublishDate).substring(0, 10) : '-';
    document.getElementById('m-date-text').innerText = pubDate;

    const mChannel = document.getElementById('m-channel');
    if (mChannel) {
      mChannel.innerText = item.ChannelName || '알 수 없는 채널';
    }

    const mAvatar = document.getElementById('m-channel-avatar');
    const mAvatarFallback = document.getElementById('m-channel-avatar-fallback');
    if (mAvatar && mAvatarFallback) {
      if (item.ChannelAvatar) {
        mAvatar.src = item.ChannelAvatar;
        mAvatar.style.display = '';
        mAvatarFallback.textContent = '';
      } else {
        mAvatar.style.display = 'none';
        mAvatarFallback.textContent = (item.ChannelName || '?')[0];
      }
    }

    const videoId = String(item.ID || item.id || '').trim();
    const mImg = document.getElementById('m-img');
    mImg.onerror = () => window.handleImageError(mImg);
    mImg.src = item.Image_URL || 'https://placehold.co/640x360/1e1e2a/ffffff?text=No+Image';
    mImg.style.cursor = 'pointer';
    mImg.onclick = () => playVideoInline(videoId, 0);

    const mLink = document.getElementById('m-link');
    mLink.href = item.VideoURL;

    // 경량 필드는 즉시 표시, 무거운 필드는 지연 로딩
    document.getElementById('m-summary').innerHTML = '<div class="loading-pulse" style="height:60px;border-radius:6px;background:var(--bg-card-hover);"></div>';
    document.getElementById('m-analysis').innerHTML = '<div class="loading-pulse" style="height:40px;border-radius:6px;background:var(--bg-card-hover);"></div>';
    document.getElementById('m-insights').innerHTML = '<div class="loading-pulse" style="height:40px;border-radius:6px;background:var(--bg-card-hover);"></div>';
    document.getElementById('m-implications').innerHTML = '<div class="loading-pulse" style="height:30px;border-radius:6px;background:var(--bg-card-hover);"></div>';

    lazyLoadDetail(item.ID).then(detail => {
      if (!detail) return;
      document.getElementById('m-summary').innerHTML = renderMarkdown(detail.summary || '내용 없음');
      document.getElementById('m-analysis').innerHTML = renderMarkdown(detail.analysis || '내용 없음');
      document.getElementById('m-insights').innerHTML = renderMarkdown(detail.insights || '내용 없음');
      document.getElementById('m-implications').innerHTML = renderMarkdown(detail.implications || '');
    });

    // Render timeline accordions
    renderTimeline(item.Timeline || item.timeline, videoId);

    const mReadBtn = document.getElementById('m-btn-read');
    const mFavBtn = document.getElementById('m-btn-fav');
    const mWlBtn = document.getElementById('m-btn-wl');
    const isFav = isTrue(item.Favorite);
    const isRead = isTrue(item.Read);
    const isWl = isTrue(item.WatchLater || item['보관함']);

    const isGitHub = String(item.VideoURL || '').includes('github.com');
    if (isGitHub) {
      mLink.className = 'btn-github';
      mLink.innerHTML = '<i class="ph ph-github-logo"></i> GitHub<span class="desktop-only">에서 보기</span>';
      mWlBtn.style.display = 'none';
    } else {
      mLink.className = 'btn-youtube';
      mLink.innerHTML = '<i class="ph-fill ph-play-circle"></i> YouTube<span class="desktop-only">에서 보기</span>';
      mWlBtn.style.display = '';
    }

    mReadBtn.onclick = (e) => handleMarkRead(id, mReadBtn, e);
    if (isRead) {
      mReadBtn.style.opacity = '0.5';
      mReadBtn.innerHTML = '<i class="ph ph-check"></i> 읽음';
    } else {
      mReadBtn.style.opacity = '1';
      mReadBtn.innerHTML = '<i class="ph ph-check-circle"></i> 읽음<span class="desktop-only"> 처리</span>';
    }

    mFavBtn.onclick = (e) => handleToggleFav(id, mFavBtn, e);
    mFavBtn.className = `btn-favorite ${isFav ? 'active' : ''}`;
    mFavBtn.innerHTML = `<i class="ph ${isFav ? 'ph-star ph-fill' : 'ph-star'}"></i>`;

    // Watch Later 버튼 핸들러
    mWlBtn.onclick = (e) => window.handleWatchLater(id, mWlBtn, e);
    if (isWl) {
      mWlBtn.classList.add('success');
      mWlBtn.innerHTML = '<i class="ph ph-list-checks"></i> 추가됨';
    } else {
      mWlBtn.classList.remove('success');
      mWlBtn.innerHTML = '<i class="ph ph-list-plus"></i> 보관함<span class="desktop-only"> 추가</span>';
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
  
  if (container) {
    container.style.removeProperty('--detail-width');
    if (typeof resizeMainCanvas === 'function') {
      resizeMainCanvas();
    }
  }
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
            previewUrl = `https://docs.google.com/uc?export=download&id=${fileId}`;
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
  if (container) {
    container.style.removeProperty('--detail-width');
    if (typeof resizeMainCanvas === 'function') {
      resizeMainCanvas();
    }
  }
}

window.handleMarkRead = async (id, btn, event) => {
  if (event) event.stopPropagation();
  let item = allData.find(d => String(d.ID) === String(id));
  if (!item) {
    item = githubData.find(d => String(d.ID) === String(id));
  }
  if (!item) return;

  const originalHtml = btn.innerHTML;
  const originalOpacity = btn.style.opacity;
  const originalReadState = item.Read;

  // 이미 읽음이면 처리하지 않음
  if (isTrue(originalReadState)) return;

  // 1. 낙관적 업데이트
  item.Read = true;
  updateStats();

  const isUnreadTab = (currentTab === 'unread' || currentTab === 'github');
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

  // 2. 비동기 백그라운드 호출 (Supabase)
  const isGitHub = githubData.some(d => String(d.ID) === String(id));

  supabaseMarkRead(id, isGitHub).then(success => {
    if (!success) throw new Error('Supabase markRead failed');
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
  let item = allData.find(d => String(d.ID) === String(id));
  if (!item) {
    item = githubData.find(d => String(d.ID) === String(id));
  }
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

  // 2. 비동기 호출 (Supabase)
  const isGitHub = githubData.some(d => String(d.ID) === String(id));

  supabaseToggleFav(id, isTrue(originalFavState), isGitHub).then(newStatus => {
    item.Favorite = newStatus;
    updateStats();
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

// ── Supabase write-back ──
async function supabaseMarkRead(id, isGitHub = false) {
  if (!supabase) return false;
  const table = isGitHub ? 'github_repos' : 'videos';
  const { error } = await supabase.from(table).update({ read: true }).eq('id', id);
  if (error) console.error('Supabase markRead error:', error.message);
  return !error;
}

async function supabaseToggleFav(id, currentStatus, isGitHub = false) {
  if (!supabase) return false;
  const table = isGitHub ? 'github_repos' : 'videos';
  const newStatus = !currentStatus;
  const { error } = await supabase.from(table).update({ favorite: newStatus }).eq('id', id);
  if (error) console.error('Supabase toggleFav error:', error.message);
  return !error ? newStatus : currentStatus;
}

async function supabaseBatchMarkRead(ids, isGitHub = false) {
  if (!supabase || !ids || ids.length === 0) return 0;
  const table = isGitHub ? 'github_repos' : 'videos';
  const { error } = await supabase.from(table).update({ read: true }).in('id', ids);
  if (error) console.error('Supabase batchMarkRead error:', error.message);
  return !error ? ids.length : 0;
}

// ── GAS를 Supabase로 교체 ──

function navigateDetail(direction) {
  const filteredData = getFilteredData();
  const idx = filteredData.findIndex(d => String(d.ID) === currentDetailId);
  if (idx === -1) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= filteredData.length) return;
  openDetail(filteredData[newIdx].ID);
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
    let item = allData.find(d => String(d.ID) === String(id));
    if (!item) {
      item = githubData.find(d => String(d.ID) === String(id));
    }
    return { id, item, originalRead: item ? item.Read : false };
  });

  // 1. 낙관적 업데이트
  idsToProcess.forEach(id => {
    let item = allData.find(d => String(d.ID) === String(id));
    if (!item) {
      item = githubData.find(d => String(d.ID) === String(id));
    }
    if (item) item.Read = true;
  });

  updateStats();
  toggleSelectionMode(false); // 선택 모드 종료 및 새로고침

  // 2. 비동기 배치 호출 (Supabase)
  const isGitHub = currentTab === 'github';

  supabaseBatchMarkRead(idsToProcess, isGitHub).then(count => {
    console.log('일괄 읽음 동기화 완료:', count, '개 업데이트됨');
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

  const isMobile = window.innerWidth <= 576;

  // Show/Hide logic
  let shouldHide = false;
  if (currentTab === 'category' && !currentCategory) {
    shouldHide = true;
  } else if (isMobile && (currentTab === 'channel' || currentTab === 'mix')) {
    shouldHide = true;
  } else if (currentTab === 'network') {
    shouldHide = true;
  }

  if (shouldHide) {
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
  const channelAvatarMap = {};
  allData.filter(item => !isTrue(item.Read)).forEach(item => {
    const ch = String(item.ChannelName || "알 수 없음").trim();
    if (!channelMap[ch]) channelMap[ch] = { count: 0 };
    channelMap[ch].count++;
    if (!channelAvatarMap[ch] && item.ChannelAvatar) {
      channelAvatarMap[ch] = item.ChannelAvatar;
    }
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
        <div class="list-row-icon">
          ${channelAvatarMap[ch]
            ? `<img src="${channelAvatarMap[ch]}" alt="${ch}" class="channel-avatar-icon">`
            : `<span style="font-size:18px;">📺</span>`}
        </div>
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
  
  if (type === 'category') {
    currentCategory = key;
    currentChannel = null;
  } else {
    currentChannel = key;
    currentCategory = null;
  }
  updateLeftPanelDynamicData();
  
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
    
    let videoId = extractVideoId(item.VideoURL || item.URL || "");
    const thumb = item.Image_URL || item['썸네일'] || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : 'icons8-youtube-16.png');
    
    const isFav = isTrue(item.Favorite);

    card.innerHTML = `
      <div class="sublist-card-main" style="display: flex; gap: 16px; flex: 1; align-items: center; overflow: hidden;">
        <img src="${thumb}" class="sublist-thumb" onerror="window.handleImageError(this)">
        <div class="sublist-info" style="flex: 1; min-width: 0;">
          <div class="sublist-title">${item.Title || "제목 없음"}</div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; flex-wrap: wrap; gap: 4px;">
            <span style="font-size: 11px; font-weight: 700; color: var(--accent-primary); text-transform: uppercase;">${item.ChannelName || ""}</span>
            <span class="sublist-date">${item.PublishDate ? String(item.PublishDate).substring(0, 10) : ""}</span>
          </div>
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
  const container = document.querySelector('.layout-container');
  if (container) {
    container.classList.remove('sublist-active');
    container.style.removeProperty('--sublist-width');
  }
  currentCategory = null;
  currentChannel = null;
  updateLeftPanelDynamicData();
  
  if (typeof resizeMainCanvas === 'function') {
    resizeMainCanvas();
  }
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

// ==========================================
// Brutalist Visuals & HTML-in-Canvas Controller
// ==========================================
let mainCanvas, mainCtx;
let canvasScrollY = 0;
let isHtmlInCanvasActive = false;
let canvasAnimationId = null;
function initCanvasControllers() {
  mainCanvas = document.getElementById('main-canvas');
  
  if (!mainCanvas) return;
  
  mainCtx = mainCanvas.getContext('2d');
  
  // Check browser support for drawElementImage (HTML-in-Canvas)
  // drawElementImage는 비표준 실험적 기능으로, 일부 브라우저에서 실행 중 오류(Uncaught TypeError)를 유발하여 화면이 굳는 원인이 되므로 false로 강제 설정해 안정적인 CSS Grid 뷰가 항상 쓰이도록 합니다.
  isHtmlInCanvasActive = false;
  console.log("HTML-in-Canvas support active (disabled for compatibility):", isHtmlInCanvasActive);
  
  const grid = document.getElementById('card-grid');
  const paneList = document.getElementById('pane-list');
  
  if (isHtmlInCanvasActive) {
    mainCanvas.setAttribute('layoutsubtree', '');
    mainCanvas.appendChild(grid); // Move layout inside canvas context
    
    // Add scroll spacer to manage native scrolling
    let spacer = document.getElementById('scroll-spacer');
    if (!spacer) {
      spacer = document.createElement('div');
      spacer.id = 'scroll-spacer';
      paneList.appendChild(spacer);
    }
    
    paneList.addEventListener('scroll', () => {
      canvasScrollY = paneList.scrollTop;
      requestCanvasPaint();
    });
    
    window.addEventListener('resize', resizeMainCanvas);
    resizeMainCanvas();
    startCanvasLoop();
  } else {
    // Fallback: hide canvas, display grid as normal CSS Grid
    mainCanvas.style.display = 'none';
  }
}

function resizeMainCanvas() {
  if (!mainCanvas) return;
  const rect = mainCanvas.parentElement.getBoundingClientRect();
  mainCanvas.width = rect.width;
  mainCanvas.height = rect.height;
  requestCanvasPaint();
}

function startCanvasLoop() {
  function renderLoop() {
    drawMainCanvas();
    canvasAnimationId = requestAnimationFrame(renderLoop);
  }
  canvasAnimationId = requestAnimationFrame(renderLoop);
}

function drawMainCanvas() {
  if (!isHtmlInCanvasActive || !mainCanvas) return;
  
  mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
  
  const grid = document.getElementById('card-grid');
  const cards = document.querySelectorAll('#card-grid .card');
  const scrollSpacer = document.getElementById('scroll-spacer');
  
  if (cards.length === 0) {
    // If no elements, hide canvas so fallback empty state displays naturally
    mainCanvas.style.display = 'none';
    if (grid) grid.style.display = '';
    return;
  }
  
  mainCanvas.style.display = 'block';
  if (grid) grid.style.display = 'block';
  
  // Render grid background design
  const dotSpacing = 30;
  mainCtx.fillStyle = 'rgba(18, 18, 18, 0.05)';
  for (let x = 0; x < mainCanvas.width; x += dotSpacing) {
    for (let y = 0; y < mainCanvas.height; y += dotSpacing) {
      mainCtx.beginPath();
      mainCtx.arc(x, y - (canvasScrollY % dotSpacing), 1.5, 0, Math.PI * 2);
      mainCtx.fill();
    }
  }
  
  const paneList = document.getElementById('pane-list');
  const paneListWidth = paneList.clientWidth;
  const isListMode = viewMode === 'list';
  
  let totalHeight = 0;
  const cardWidth = 320;
  const gap = 24;
  const padding = 32;
  const centers = [];
  
  if (isListMode) {
    // List Mode Layout inside Canvas
    const cardHeight = 140;
    const startX = padding;
    const actualWidth = Math.max(400, paneListWidth - padding * 2);
    
    cards.forEach((card, index) => {
      const x = startX;
      const y = padding + index * (cardHeight + gap);
      
      card.classList.add('canvas-managed');
      card.style.left = `${x}px`;
      card.style.top = `${y}px`;
      card.style.width = `${actualWidth}px`;
      card.style.height = `${cardHeight}px`;
      
      const drawY = y - canvasScrollY;
      if (drawY + cardHeight > 0 && drawY < mainCanvas.height) {
        centers.push({ x: x + actualWidth / 2, y: drawY + cardHeight / 2 });
        const transform = mainCtx.drawElementImage(card, x, drawY);
        card.style.transform = transform.toString();
        card.style.opacity = '1';
        card.style.pointerEvents = 'auto';
      } else {
        card.style.transform = 'translate(-9999px, -9999px)';
        card.style.opacity = '0';
        card.style.pointerEvents = 'none';
      }
    });
    
    totalHeight = padding * 2 + cards.length * (cardHeight + gap) - gap;
  } else {
    // Grid Mode Layout inside Canvas
    const cols = Math.max(1, Math.floor(paneListWidth / 360));
    const totalGridWidth = cols * cardWidth + (cols - 1) * gap;
    const startX = Math.max(padding, (paneListWidth - totalGridWidth) / 2);
    const cardHeight = 350;
    const rows = Math.ceil(cards.length / cols);
    
    cards.forEach((card, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = startX + col * (cardWidth + gap);
      const y = padding + row * (cardHeight + gap);
      
      card.classList.add('canvas-managed');
      card.style.left = `${x}px`;
      card.style.top = `${y}px`;
      card.style.width = `${cardWidth}px`;
      card.style.height = `${cardHeight}px`;
      
      const drawY = y - canvasScrollY;
      if (drawY + cardHeight > 0 && drawY < mainCanvas.height) {
        centers.push({ x: x + cardWidth / 2, y: drawY + cardHeight / 2 });
        const transform = mainCtx.drawElementImage(card, x, drawY);
        card.style.transform = transform.toString();
        card.style.opacity = '1';
        card.style.pointerEvents = 'auto';
      } else {
        card.style.transform = 'translate(-9999px, -9999px)';
        card.style.opacity = '0';
        card.style.pointerEvents = 'none';
      }
    });
    
    totalHeight = padding * 2 + rows * (cardHeight + gap) - gap;
  }
  
  if (scrollSpacer) {
    scrollSpacer.style.height = `${totalHeight}px`;
  }
  
  // Connect cards visually
  mainCtx.strokeStyle = 'rgba(79, 70, 229, 0.15)';
  mainCtx.lineWidth = 2;
  for (let i = 0; i < centers.length - 1; i++) {
    const p1 = centers[i];
    const p2 = centers[i + 1];
    if (Math.hypot(p1.x - p2.x, p1.y - p2.y) < 500) {
      mainCtx.beginPath();
      mainCtx.moveTo(p1.x, p1.y);
      mainCtx.lineTo(p2.x, p2.y);
      mainCtx.stroke();
    }
  }
}

function requestCanvasPaint() {
  if (!canvasAnimationId) {
    drawMainCanvas();
  }
}

function updateLeftPanelDynamicData() {
  // 1. Update Status Counter (based on current active tab or category/channel sublist)
  const counterEl = document.getElementById('visual-unread-count');
  const labelEl = document.querySelector('.status-counter-box .counter-label');
  
  if (counterEl && labelEl) {
    let count = 0;
    let label = 'UNREAD CLIPS';
    
    switch (currentTab) {
      case 'unread':
        count = allData.filter(item => !isTrue(item.Read)).length;
        label = 'UNREAD CLIPS';
        break;
      case 'favorite':
        const ytFavs = allData.filter(item => isTrue(item.Favorite));
        const githubFavs = githubData.filter(item => isTrue(item.Favorite));
        count = ytFavs.length + githubFavs.length;
        label = 'FAVORITE CLIPS';
        break;
      case 'category':
        if (currentCategory) {
          count = allData.filter(item => !isTrue(item.Read) && String(item.Category || item['카테고리'] || "미분류").trim() === currentCategory).length;
          label = `${currentCategory.toUpperCase()} CLIPS`;
        } else {
          const categories = [...new Set(allData.filter(item => !isTrue(item.Read)).map(item => String(item.Category || item['카테고리'] || "미분류").trim()))].filter(c => c !== "");
          count = categories.length;
          label = 'CATEGORIES';
        }
        break;
      case 'channel':
        if (currentChannel) {
          count = allData.filter(item => !isTrue(item.Read) && String(item.ChannelName || "알 수 없음").trim() === currentChannel).length;
          label = `${currentChannel.toUpperCase()} CLIPS`;
        } else {
          const channels = [...new Set(allData.filter(item => !isTrue(item.Read)).map(item => String(item.ChannelName || "알 수 없음").trim()))].filter(c => c !== "");
          count = channels.length;
          label = 'CHANNELS';
        }
        break;
      case 'mix':
        count = mixData.length;
        label = 'PODCAST MIXES';
        break;
      case 'github':
        count = githubData.filter(item => !isTrue(item.Read)).length;
        label = 'GITHUB PROJECTS';
        break;
      default:
        count = 0;
        label = 'CLIPS';
    }
    
    counterEl.textContent = count;
    labelEl.textContent = label;
  }
  
  // 2. Extract Tags/Keywords from Unread & Favorites for Horizontal 3-Row Ticker
  const tagTicker1 = document.getElementById('dynamic-tag-ticker-1');
  const tagTicker2 = document.getElementById('dynamic-tag-ticker-2');
  const tagTicker3 = document.getElementById('dynamic-tag-ticker-3');
  
  if (tagTicker1 && tagTicker2 && tagTicker3) {
    const relevantItems = [
      ...allData.filter(item => !isTrue(item.Read)),
      ...allData.filter(item => isTrue(item.Favorite)),
      ...githubData.filter(item => !isTrue(item.Read)),
      ...githubData.filter(item => isTrue(item.Favorite))
    ];
    
    const keywordSet = new Set();
    relevantItems.forEach(item => {
      if (item.Keywords) {
        String(item.Keywords).split(',').forEach(k => {
          const trimmed = k.trim().toUpperCase();
          if (trimmed) {
            keywordSet.add(trimmed);
          }
        });
      }
    });
    
    let keywords = Array.from(keywordSet);
    
    // Fallback default keywords if sheet contains none
    if (keywords.length === 0) {
      keywords = ['AI', 'TECH', 'WORKFLOW', 'CLIPPING', 'NEWS', 'TRENDS', 'ANALYSIS', 'GITHUB', 'PODCAST'];
    }
    
    // Stagger keywords into three rows
    let kw1 = [], kw2 = [], kw3 = [];
    keywords.forEach((k, idx) => {
      if (idx % 3 === 0) kw1.push(k);
      else if (idx % 3 === 1) kw2.push(k);
      else kw3.push(k);
    });
    
    const formatKw = (arr) => {
      if (arr.length === 0) arr = ['CLIPS', 'INSIGHTS', 'NEWS'];
      // 대량 데이터일 때 불필요한 DOM 복제를 막고 스크롤 채우기만 가능하도록 듀플리케이션 계수를 동적으로 계산 (총 엘리먼트 수 약 50개 제한)
      const dupCount = Math.max(2, Math.min(6, Math.floor(50 / arr.length)));
      let duplicated = [];
      for (let i = 0; i < dupCount; i++) {
        duplicated = duplicated.concat(arr);
      }
      return duplicated.map(k => `<span>${k}</span>`).join('');
    };
    
    tagTicker1.innerHTML = formatKw(kw1);
    tagTicker2.innerHTML = formatKw(kw2);
    tagTicker3.innerHTML = formatKw(kw3);
  }
  
  // 3. Extract Latest Video Headlines for Vertical Scrolling
  const headlinesScroll = document.getElementById('headlines-scroll-list');
  if (headlinesScroll) {
    // Combine YouTube and GitHub feeds, sorting by Publish Date descending
    const combinedFeeds = [...allData, ...githubData].sort((a, b) => (b.PublishDate || "").localeCompare(a.PublishDate || ""));
    const latestClips = combinedFeeds.slice(0, 10);
    
    if (latestClips.length > 0) {
      const itemsHtml = latestClips.map(clip => {
        const dateStr = clip.PublishDate ? String(clip.PublishDate).substring(0, 10) : '';
        const titleText = clip.Title || 'Untitled Clip';
        return `<div class="headline-item" onclick="openDetail('${clip.ID}')">
          <div style="font-size: 9px; color: var(--accent-primary); font-weight: 800; margin-bottom: 2px;">${dateStr}</div>
          <div>${titleText}</div>
        </div>`;
      }).join('');
      
      // Duplicate list twice to build seamless infinite marquee scrolling
      headlinesScroll.innerHTML = itemsHtml + itemsHtml + itemsHtml;
    } else {
      headlinesScroll.innerHTML = '<div style="font-size: 11px; color: var(--text-muted); text-align: center; padding: 24px 0;">NO HEADLINES AVAILABLE</div>';
    }
  }
}

function initRightPaneResizers() {
  const container = document.getElementById('layout-container');
  if (!container) return;

  function setupResizer(resizerId, widthVarName) {
    const resizer = document.getElementById(resizerId);
    if (!resizer) return;

    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isDragging = true;
      container.classList.add('resizing');

      let paneId = '';
      if (resizerId === 'sublist-resizer') paneId = 'pane-sublist';
      else if (resizerId === 'detail-resizer') paneId = 'pane-detail';
      else if (resizerId === 'mix-detail-resizer') paneId = 'pane-mix-detail';

      const pane = document.getElementById(paneId);
      startWidth = pane ? pane.clientWidth : (resizerId === 'sublist-resizer' ? 500 : 650);
      startX = e.clientX;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
      if (!isDragging) return;
      const deltaX = e.clientX - startX;
      let newWidth = startWidth - deltaX;

      const minWidth = 320;
      const maxWidth = Math.floor(window.innerWidth * 0.7);
      if (newWidth < minWidth) newWidth = minWidth;
      if (newWidth > maxWidth) newWidth = maxWidth;

      container.style.setProperty(widthVarName, newWidth + 'px');

      if (typeof resizeMainCanvas === 'function') {
        resizeMainCanvas();
      }
    }

    function onMouseUp() {
      if (!isDragging) return;
      isDragging = false;
      container.classList.remove('resizing');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      if (typeof resizeMainCanvas === 'function') {
        resizeMainCanvas();
      }
    }
  }

  setupResizer('sublist-resizer', '--sublist-width');
  setupResizer('detail-resizer', '--detail-width');
  setupResizer('mix-detail-resizer', '--detail-width');
}

// ==========================================
// Timeline & Inline Player Helper Functions
// ==========================================

function playVideoInline(videoId, startSeconds = 0) {
  const videoSection = document.querySelector('.modal-video-section');
  if (!videoSection) return;
  
  let iframe = videoSection.querySelector('iframe');
  const startParam = startSeconds > 0 ? `&start=${startSeconds}` : '';
  
  if (!iframe) {
    const mImg = document.getElementById('m-img');
    if (mImg) mImg.style.display = 'none';
    
    iframe = document.createElement('iframe');
    iframe.className = 'modal-thumbnail';
    iframe.style.border = 'none';
    iframe.style.width = '100%';
    iframe.style.aspectRatio = '16/9';
    videoSection.insertBefore(iframe, videoSection.firstChild);
  }
  
  iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1${startParam}`;
}

function timestampToSeconds(ts) {
  if (!ts) return 0;
  const parts = ts.replace(/[\[\]]/g, '').split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
}

function parseTimeline(timelineStr) {
  if (!timelineStr) return [];
  // Strip HTML tags (<b>, </b>, etc.) and markdown bold (**) 
  // that can get embedded inside timestamps like <b>[00:</b>00] or [00:**00]
  const cleaned = timelineStr.replace(/<[^>]+>/g, '').replace(/\*\*/g, '');
  const lines = cleaned.split('\n');
  const chapters = [];
  const timeRegex = /\[((?:\d{1,2}:)?\d{1,2}:\d{2})\]/;
  
  for (const line of lines) {
    const match = line.match(timeRegex);
    if (match) {
      const timestamp = match[1];
      let content = line.replace(match[0], '')
        .replace(/^[\s•\-:|~·#★➔▶\s]+|[\s•\-:|~·#★➔▶\s]+$/g, '')
        .trim();
      chapters.push({
        time: timestamp,
        content: content
      });
    }
  }
  return chapters;
}

function renderTimeline(timelineStr, videoId) {
  const timelineEl = document.getElementById('m-timeline');
  const timelineSection = document.getElementById('m-timeline-section');
  if (!timelineEl) return;
  
  const chapters = parseTimeline(timelineStr || '');
  if (chapters.length === 0) {
    if (timelineSection) timelineSection.style.display = 'none';
    timelineEl.innerHTML = '내용 없음';
    return;
  }
  
  if (timelineSection) timelineSection.style.display = 'block';
  
  let html = `<div class="timeline-list" style="display: flex; flex-direction: column; gap: 10px; margin-top: 10px;">`;
  
  chapters.forEach((ch, idx) => {
    const seconds = timestampToSeconds(ch.time);
    
    html += `
      <div class="timeline-item" style="display: flex; align-items: flex-start; gap: 10px; font-size: 13px; line-height: 1.5; padding: 4px 0;">
        <button class="timeline-badge" data-seconds="${seconds}" style="background: var(--accent-primary, #ef4444); color: white; border: none; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; font-family: monospace; display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0; transition: background 0.2s;">
          <i class="ph ph-play-fill" style="font-size: 8px;"></i>${ch.time}
        </button>
        <span class="timeline-content" style="color: var(--text-main, #0f172a); font-weight: 500; word-break: keep-all;">${ch.content}</span>
      </div>
    `;
  });
  
  html += `</div>`;
  timelineEl.innerHTML = html;
  
  const list = timelineEl.querySelector('.timeline-list');
  if (list) {
    list.querySelectorAll('.timeline-badge').forEach(btn => {
      btn.onclick = (e) => {
        const secs = parseInt(btn.dataset.seconds);
        playVideoInline(videoId, secs);
      };
      // hover effect via JS since it is inline style
      btn.onmouseover = () => btn.style.background = 'var(--accent-primary-hover, #dc2626)';
      btn.onmouseout = () => btn.style.background = 'var(--accent-primary, #ef4444)';
    });
  }
}
