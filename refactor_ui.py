import os
import re

# 1. Update index.html
html_content = '''<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" type="image/png" href="/favicon.png" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/@phosphor-icons/web"></script>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
  <title>유튜브 인사이트 클리핑</title>
</head>
<body>
  <!-- Header -->
  <header class="header">
    <div class="header-content">
      <div class="nav-tabs">
        <div class="tts-group">
          <button class="nav-tab" id="btn-play-latest">
            <i class="ph ph-speaker-high"></i>
            <span class="tab-text">최신 음성 요약 듣기</span>
          </button>
          <button class="nav-tab" id="btn-tts-settings" title="음성 설정"
            style="min-width: 44px; padding: 12px 10px; border-left: 1px solid rgba(0,0,0,0.05); border-radius: 0 100px 100px 0;">
            <i class="ph ph-sliders-horizontal"></i>
          </button>

          <!-- TTS 설정 팝업 -->
          <div class="tts-settings-popover" id="tts-popover" style="display: none;">
            <div class="popover-header">
              <i class="ph ph-sliders-horizontal"></i> 음성 설정
            </div>
            <div class="popover-body">
              <div class="setting-item">
                <label>목소리</label>
                <select id="tts-voice-select"></select>
              </div>
              <div class="setting-item">
                <div class="setting-label-row">
                  <label>속도</label>
                  <span id="speed-value">1.1x</span>
                </div>
                <input type="range" id="tts-speed-range" min="0.5" max="2.0" step="0.1" value="1.1">
              </div>
            </div>
          </div>
        </div>
        <button class="nav-tab active" id="tab-unread">
          <i class="ph ph-tray"></i>
          읽지 않음
          <span class="badge" id="unread-count">0</span>
        </button>
        <button class="nav-tab" id="tab-favorite">
          <i class="ph-fill ph-star" style="color: var(--accent-warning);"></i>
          즐겨찾기
          <span class="badge" id="fav-count">0</span>
        </button>
        <button class="nav-tab" id="tab-category">
          <i class="ph ph-folder"></i>
          카테고리
          <span class="badge" id="category-count">0</span>
        </button>
        <button class="nav-tab" id="tab-today">
          <i class="ph ph-globe"></i>
          오늘의 봄봄
        </button>
        <button class="nav-tab" id="btn-refresh" style="min-width: 50px; padding: 12px 16px; border-radius: 100px;" title="새로고침">
          <i class="ph ph-arrows-clockwise"></i>
        </button>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main id="layout-container" class="layout-container">
    <!-- List Pane -->
    <div id="pane-list" class="pane-list">
      <!-- Loader -->
      <div id="loader" class="loader">
        <div class="loader-spinner"></div>
        <div class="loader-text">데이터를 불러오는 중입니다...</div>
      </div>
      <!-- Card Grid -->
      <div id="card-grid" class="grid"></div>
    </div>

    <!-- Detail Pane -->
    <div id="pane-detail" class="pane-detail">
      <div class="detail-header-sticky">
        <div class="modal-header">
          <div class="modal-header-content" style="flex: 1; min-width: 0;">
            <h2 id="m-title" class="modal-title">제목</h2>
            <div id="m-date" class="modal-date">
              <i class="ph ph-calendar-blank"></i>
              <span id="m-date-text">-</span>
            </div>
          </div>
          <div class="modal-actions-top">
            <button class="close-btn" id="close-detail">
              <i class="ph ph-x"></i>
            </button>
          </div>
        </div>
      </div>

      <div class="modal-body">
        <div class="mobile-title-section">
          <h2 id="m-title-mobile" class="mobile-title">제목</h2>
          <div class="mobile-date">
            <i class="ph ph-calendar-blank"></i>
            <span id="m-date-text-mobile">-</span>
          </div>
        </div>
        <div class="modal-video-section">
          <img id="m-img" class="modal-thumbnail" src="" alt="Video thumbnail">
          <div class="modal-actions-video">
            <a id="m-link" href="#" target="_blank" class="btn-youtube">
              <i class="ph-fill ph-play-circle"></i>
              YouTube에서 보기
            </a>
            <button id="m-btn-read" class="btn-mark-read" style="padding: 8px 12px; height: 44px; min-width: 100px;">
              <i class="ph ph-check-circle"></i>
              읽음
            </button>
            <button id="m-btn-wl" class="btn-watch-later" style="padding: 8px 12px; height: 44px; flex: 1;">
              <i class="ph ph-list-plus"></i>
              보관함 추가
            </button>
            <button id="m-btn-fav" class="btn-favorite" style="width: 44px; height: 44px;">
              <i class="ph ph-star"></i>
            </button>
          </div>
        </div>

        <div class="content-section">
          <div class="section-header">
            <div class="section-icon summary">
              <i class="ph ph-file-text"></i>
            </div>
            <span class="section-title">요약 (Summary)</span>
          </div>
          <div id="m-summary" class="section-content">내용 없음</div>
        </div>

        <div class="content-section">
          <div class="section-header">
            <div class="section-icon analysis">
              <i class="ph ph-chart-bar"></i>
            </div>
            <span class="section-title">분석 (Analysis)</span>
          </div>
          <div id="m-analysis" class="section-content">내용 없음</div>
        </div>

        <div class="content-section">
          <div class="section-header">
            <div class="section-icon insights">
              <i class="ph ph-lightbulb"></i>
            </div>
            <span class="section-title">인사이트 (Insights)</span>
          </div>
          <div id="m-insights" class="section-content">내용 없음</div>
        </div>
      </div>
    </div>

    <!-- Today Pane -->
    <div id="pane-today" class="pane-today" style="display: none; width: 100%; height: 100%;">
      <iframe src="https://www.bombom.news/today" style="width: 100%; height: 100%; border: none;"></iframe>
    </div>
  </main>

  <!-- Floating Toolbar -->
  <div id="floating-toolbar" class="floating-toolbar hidden">
    <div class="toolbar-content">
      <div id="toolbar-view-toggle" class="view-toggle">
        <button class="view-btn grid-btn active" data-view="grid" title="그리드 보기">
          <i class="ph ph-squares-four"></i>
        </button>
        <button class="view-btn list-btn" data-view="list" title="목록 보기">
          <i class="ph ph-list"></i>
        </button>
      </div>
      
      <div class="toolbar-divider"></div>
      
      <select id="toolbar-sort-select" class="sort-select">
        <option value="newest">최신순</option>
        <option value="oldest">오래된순</option>
      </select>
      
      <button id="btn-select-mode" class="toolbar-btn" title="다중 선택">
        <i class="ph ph-check-square-offset"></i>
      </button>

      <div class="toolbar-divider selection-only hidden"></div>

      <button id="btn-mark-selected-read" class="toolbar-btn active hidden" title="선택 항목 읽음 처리" style="background: var(--accent-success); color: white; width: auto; padding: 0 16px; border-radius: 20px; gap: 8px;">
        <i class="ph ph-checks"></i>
        <span id="selected-count-text">0개 읽음</span>
      </button>

      <div class="toolbar-divider"></div>
      
      <button id="btn-back-to-top" class="toolbar-btn" title="맨 위로">
        <i class="ph ph-arrow-up"></i>
      </button>
    </div>
  </div>

  <script type="module" src="/src/main.js"></script>
</body>
</html>'''

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html_content)


# 2. Update style.css
with open('src/style.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Soften colors and add glassmorphism
css = re.sub(r'--bg-primary: #[a-f0-9A-F]+;', '--bg-primary: #f8fafc;', css)
css = re.sub(r'--bg-secondary: #[a-f0-9A-F]+;', '--bg-secondary: rgba(255, 255, 255, 0.85);', css)
css = re.sub(r'--bg-card: #[a-f0-9A-F]+;', '--bg-card: rgba(255, 255, 255, 0.95);', css)
css = re.sub(r'--shadow-sm: [^;]+;', '--shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.04);', css)
css = re.sub(r'--shadow-md: [^;]+;', '--shadow-md: 0 8px 24px rgba(0, 0, 0, 0.06);', css)
css = re.sub(r'--shadow-lg: [^;]+;', '--shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.08);', css)

# Make tabs more pill-like
css = re.sub(r'border-radius: var\(--radius-md\);(.*?)min-width: 200px;', r'border-radius: 100px;\1min-width: 140px; padding: 10px 30px;', css, flags=re.DOTALL)

# Remove pulse animation from unread-count
css = re.sub(r'animation: pulse 2s infinite;', '/* animation: pulse 2s infinite; */', css)

# Update card styles (remove neon glow, add smooth floating effect)
css = re.sub(r'\.card:hover \{[^\}]+\}', r'''.card:hover {
  transform: translateY(-4px);
  border-color: rgba(79, 70, 229, 0.3);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.08);
  z-index: 10;
}''', css)

css = re.sub(r'\.favorites-view-mode \.card:hover \{[^\}]+\}', r'''.favorites-view-mode .card:hover {
  border-color: rgba(245, 158, 11, 0.3);
  box-shadow: 0 12px 24px rgba(245, 158, 11, 0.1);
}''', css)

css = re.sub(r'\.card\[data-age="fresh"\]:hover \{[^\}]+\}', r'''.card[data-age="fresh"]:hover {
  border-color: rgba(239, 68, 68, 0.3);
  box-shadow: 0 12px 24px rgba(239, 68, 68, 0.1);
}''', css)

# Card border radius
css = re.sub(r'\.card \{([^\}]+)border-radius: var\(--radius-lg\);', r'.card {\1border-radius: 16px; backdrop-filter: blur(8px);', css)

# Replace 3D carousel CSS with Horizontal Snap Scroll CSS
carousel_css_pattern = r'/\* DJMAX Style Carousel Mode \*/.*?/\* Hidden Items \*/.*?\}'
horizontal_scroll_css = '''/* Modern Horizontal Scroll Mode */
.category-scroll-container {
  display: flex;
  gap: 20px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding: 20px 0 40px;
  width: 100%;
  -webkit-overflow-scrolling: touch;
}

.category-scroll-container::-webkit-scrollbar {
  height: 8px;
}
.category-scroll-container::-webkit-scrollbar-track {
  background: rgba(0,0,0,0.05);
  border-radius: 10px;
}
.category-scroll-container::-webkit-scrollbar-thumb {
  background: rgba(0,0,0,0.15);
  border-radius: 10px;
}

.category-card {
  flex: 0 0 320px;
  scroll-snap-align: center;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  cursor: pointer;
}
.category-card:hover {
  transform: translateY(-4px);
}
'''
css = re.sub(carousel_css_pattern, horizontal_scroll_css, css, flags=re.DOTALL)

with open('src/style.css', 'w', encoding='utf-8') as f:
    f.write(css)


# 3. Update main.js
with open('src/main.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Replace material-icons-round with Phosphor icons
replacements = {
    '<span class="material-icons-round">error_outline</span>': '<i class="ph ph-warning-circle"></i>',
    '<span class="material-icons-round">arrow_back</span>': '<i class="ph ph-arrow-left"></i>',
    '<span class="material-icons-round">folder_open</span>': '<i class="ph ph-folder-open"></i>',
    '<span class="material-icons-round spin">sync</span>': '<i class="ph ph-arrows-clockwise ph-spin"></i>',
    '<span class="material-icons-round">done</span>': '<i class="ph ph-check"></i>',
    '<span class="material-icons-round">check_circle</span>': '<i class="ph ph-check-circle"></i>',
    '<span class="material-icons-round">playlist_add</span>': '<i class="ph ph-list-plus"></i>',
    '<span class="material-icons-round">playlist_add_check</span>': '<i class="ph ph-list-checks"></i>',
    '<span class="material-icons-round">volume_up</span>': '<i class="ph ph-speaker-high"></i>',
    '<span class="material-icons-round">stop</span>': '<i class="ph ph-stop"></i>'
}
for old, new in replacements.items():
    js = js.replace(old, new)

# Dynamic empty states
js = re.sub(r"const emptyIcon = currentTab === 'unread' \? 'mark_email_read' : \(currentTab === 'favorite' \? 'star_border' : 'folder_off'\);", 
            r"const emptyIcon = currentTab === 'unread' ? 'ph-envelope-open' : (currentTab === 'favorite' ? 'ph-star' : 'ph-folder-simple-minus');", js)
js = js.replace('<span class="material-icons-round">${emptyIcon}</span>', '<i class="ph ${emptyIcon}"></i>')

# Card selection overlay
js = re.sub(r"<span class=\"material-icons-round\">\$\{isSelected \? 'check_circle' : 'radio_button_unchecked'\}</span>",
            r"<i class=\"ph ${isSelected ? 'ph-check-circle ph-fill' : 'ph-circle'}\"></i>", js)

# Detail Card Fav
js = re.sub(r"<span class=\"material-icons-round\">\$\{isFav \? 'star' : 'star_border'\}</span>",
            r"<i class=\"ph ${isFav ? 'ph-star ph-fill' : 'ph-star'}\"></i>", js)

# Rewrite renderCategoryList and remove Carousel logic
cat_list_old = r"function renderCategoryList\(\) \{.*?updateCarouselPositions\(\);\s*\}\s*/\*\*.*?\*/\s*function updateCarouselPositions\(\) \{.*?\}\s*"

cat_list_new = '''function renderCategoryList() {
  const grid = document.getElementById('card-grid');
  grid.innerHTML = "";
  grid.classList.add('category-grid-mode');
  grid.classList.remove('carousel-mode');

  const categoryMap = {};
  allData.filter(item => !isTrue(item.Read)).forEach(item => {
    const cat = String(item.Category || item['카테고리'] || "미분류").trim();
    if (cat === "") return;
    
    if (!categoryMap[cat]) {
      categoryMap[cat] = { count: 0, thumbs: [] };
    }
    categoryMap[cat].count++;
    if (categoryMap[cat].thumbs.length < 3 && item.Image_URL) {
      categoryMap[cat].thumbs.push(item.Image_URL);
    }
  });

  categoryList = Object.keys(categoryMap).sort();

  if (categoryList.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i class="ph ph-folder-simple-minus"></i></div>
        <div class="empty-title">카테고리가 없습니다</div>
        <div class="empty-description">영상에 카테고리가 지정되면 여기에 표시됩니다.</div>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  categoryList.forEach((cat, index) => {
    const data = categoryMap[cat];
    const card = document.createElement('div');
    card.className = 'category-card';
    card.dataset.catName = cat;

    card.onclick = () => {
      currentCategory = cat;
      renderGrid();
    };

    let itemsHtml = '';
    if (data.thumbs.length > 0) {
      itemsHtml = data.thumbs.map((t) => `
        <div class="folder-item">
          <img src="${t}" alt="thumb" loading="lazy">
        </div>
      `).join('');
    } else {
      itemsHtml = `
        <div class="folder-item">
          <div class="no-thumb-icon"><i class="ph ph-play-circle"></i></div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="folder-container">
        <div class="folder-front-content" style="padding: 24px; background: var(--bg-card); border-radius: 16px; border: 1px solid var(--border-default); box-shadow: var(--shadow-sm); display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <i class="ph ph-folder-open folder-icon" style="font-size: 24px; color: var(--accent-primary);"></i>
            <div class="category-info">
              <div class="category-name" style="font-weight: 700; font-size: 16px;">${cat}</div>
              <div class="category-count" style="font-size: 13px; color: var(--text-muted);">영상 ${data.count}개</div>
            </div>
          </div>
          <i class="ph ph-caret-right category-arrow" style="color: var(--text-muted);"></i>
        </div>
      </div>
    `;
    fragment.appendChild(card);
  });
  
  const scrollContainer = document.createElement('div');
  scrollContainer.className = 'category-scroll-container';
  scrollContainer.appendChild(fragment);
  grid.appendChild(scrollContainer);
}

'''

js = re.sub(cat_list_old, cat_list_new, js, flags=re.DOTALL)

# Remove keydown and wheel handlers for Carousel
js = re.sub(r"// Carousel Navigation.*?// Mouse Wheel for Carousel.*?(?=if\s*\(currentTab)", '', js, flags=re.DOTALL)
# Since the regex above might be brittle, let's just do a simpler replace or ignore if it fails
js = re.sub(r'if \([^)]+\)\s*\{\s*if \(e\.key === \'ArrowLeft\'\).*?\}\s*\}', '', js, flags=re.DOTALL)
js = re.sub(r'const grid = document\.getElementById\(\'card-grid\'\);\s*grid\.onwheel = \(e\) => \{.*?\}\s*\};\s*', '', js, flags=re.DOTALL)

with open('src/main.js', 'w', encoding='utf-8') as f:
    f.write(js)

print("UI Refactoring completed.")
