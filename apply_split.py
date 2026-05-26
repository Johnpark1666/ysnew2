import re

# 1. Update index.html
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

sublist_html = '''
    <!-- Sublist Pane (For Channel/Category Videos) -->
    <div id="pane-sublist" class="pane-sublist">
      <div class="detail-header-sticky">
        <div class="modal-header">
          <div class="modal-header-content" style="flex: 1; min-width: 0;">
            <h2 id="sl-title" class="modal-title">목록</h2>
          </div>
          <div class="modal-actions-top">
            <button class="close-btn" id="close-sublist">
              <i class="ph ph-x"></i>
            </button>
          </div>
        </div>
      </div>
      <div class="sublist-body" id="sublist-body">
      </div>
    </div>
'''
html = html.replace('<!-- Detail Pane -->', sublist_html + '\n    <!-- Detail Pane -->')
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)


# 2. Update style.css
with open('src/style.css', 'r', encoding='utf-8') as f:
    css = f.read()

sublist_css = '''
/* Sublist Pane */
.pane-sublist {
  background: var(--bg-card);
  border-left: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  position: relative;
  z-index: 100;
  display: none;
}
.layout-container.sublist-active {
  grid-template-columns: 1fr 480px;
}
.layout-container.sublist-active .pane-sublist {
  display: flex;
}
.layout-container.sublist-active.detail-active {
  grid-template-columns: 1fr 480px;
}
.layout-container.sublist-active.detail-active .pane-detail {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 480px;
  display: flex;
  z-index: 200;
  box-shadow: -10px 0 30px rgba(0,0,0,0.15);
}

.sublist-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sublist-card {
  display: flex;
  gap: 12px;
  background: var(--bg-primary);
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  transition: var(--transition-fast);
  border: 1px solid transparent;
}
.sublist-card:hover {
  background: white;
  box-shadow: var(--shadow-sm);
  border-color: var(--accent-primary);
}
.sublist-thumb {
  width: 130px;
  height: 74px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--bg-card);
}
.sublist-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.sublist-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
  margin-bottom: 6px;
}
.sublist-date {
  font-size: 12px;
  color: var(--text-muted);
}

/* Vertical List Mode for Channel/Category Main Pane */
.vertical-list-mode {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
  padding-bottom: 40px;
}
.list-row-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-card);
  border-radius: 16px;
  padding: 16px 24px;
  cursor: pointer;
  border: 1px solid var(--border-default);
  transition: var(--transition-fast);
}
.list-row-item:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
  border-color: var(--accent-primary);
}
.list-row-left {
  display: flex;
  align-items: center;
  gap: 16px;
}
.list-row-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  background: rgba(79, 70, 229, 0.1);
  color: var(--accent-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}
.list-row-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}
.list-row-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.list-row-count {
  font-size: 14px;
  color: var(--text-muted);
  font-weight: 600;
  background: var(--bg-primary);
  padding: 4px 12px;
  border-radius: 100px;
}
'''
css += sublist_css
with open('src/style.css', 'w', encoding='utf-8') as f:
    f.write(css)


# 3. Update main.js
with open('src/main.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Replace event listeners
js = js.replace("const closeBtn = document.getElementById('close-detail');", "const closeBtn = document.getElementById('close-detail');\n  const closeSublistBtn = document.getElementById('close-sublist');")
js = js.replace("if (closeBtn) closeBtn.onclick = () => closeDetail();", "if (closeBtn) closeBtn.onclick = () => closeDetail();\n  if (closeSublistBtn) closeSublistBtn.onclick = () => closeSublist();")
js = js.replace("if (isSelectionMode) toggleSelectionMode(false);", "if (isSelectionMode) toggleSelectionMode(false);\n  closeSublist();")
js = re.sub(r'  // 카테고리/채널 내비게이션 바 \(뒤로가기 버튼\).*?grid\.appendChild\(header\);\s*\}', '', js, flags=re.DOTALL)

# Re-implement renderCategoryList
render_cat_old = r'function renderCategoryList\(\) \{[\s\S]*?grid\.appendChild\(scrollContainer\);\n\}'
render_cat_new = '''function renderCategoryList() {
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
}'''
js = re.sub(render_cat_old, render_cat_new, js)


# Re-implement renderChannelList
render_ch_old = r'function renderChannelList\(\) \{[\s\S]*?grid\.appendChild\(fragment\);\n\}'
render_ch_new = '''function renderChannelList() {
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
        <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(ch)}&background=random&color=fff&rounded=true&bold=true" class="list-row-icon">
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
}'''
js = re.sub(render_ch_old, render_ch_new, js)


sublist_logic = '''
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
      openDetail(item.id);
    };
    
    let videoId = extractVideoId(item.URL);
    const thumb = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : 'icons8-youtube-16.png';
    
    card.innerHTML = `
      <img src="${thumb}" class="sublist-thumb">
      <div class="sublist-info">
        <div class="sublist-title">${item.Title || "제목 없음"}</div>
        <div class="sublist-date">${item.PublishDate || ""}</div>
      </div>
    `;
    sublistBody.appendChild(card);
  });
}

function closeSublist() {
  document.querySelector('.layout-container').classList.remove('sublist-active');
}
'''
js += "\n" + sublist_logic

# Fix renderGrid to not use currentCategory/currentChannel filter when just viewing the tab
js = js.replace("if (currentTab === 'category' && !currentCategory && !searchQuery) {", "if (currentTab === 'category' && !searchQuery) {")
js = js.replace("if (currentTab === 'channel' && !currentChannel && !searchQuery) {", "if (currentTab === 'channel' && !searchQuery) {")

with open('src/main.js', 'w', encoding='utf-8') as f:
    f.write(js)

print("Applied!")
