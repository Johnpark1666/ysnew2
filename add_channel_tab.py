import re

# 1. Update index.html
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

channel_tab = '''
        <button class="nav-tab" id="tab-channel">
          <i class="ph ph-youtube-logo"></i>
          채널별
          <span class="badge" id="channel-count">0</span>
        </button>
'''
html = html.replace('<button class="nav-tab" id="tab-today">', channel_tab + '        <button class="nav-tab" id="tab-today">')
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)


# 2. Update style.css
with open('src/style.css', 'r', encoding='utf-8') as f:
    css = f.read()

channel_css = '''
/* Fix Category Horizontal Scroll Mode */
.horizontal-scroll-mode {
  display: block;
  width: 100%;
}

/* Channel Grid Mode */
.channel-grid-mode {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 20px;
  width: 100%;
}
.channel-card {
  background: var(--bg-card);
  border-radius: 16px;
  padding: 20px;
  cursor: pointer;
  border: 1px solid var(--border-default);
  box-shadow: var(--shadow-sm);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  display: flex;
  align-items: center;
  gap: 16px;
  backdrop-filter: blur(8px);
}
.channel-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-md);
  border-color: rgba(220, 38, 38, 0.3);
}
.channel-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(220, 38, 38, 0.1);
  color: #dc2626;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  flex-shrink: 0;
}
.channel-info-text {
  overflow: hidden;
}
.channel-name-large {
  font-weight: 700;
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary);
}
.channel-video-count {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 4px;
}
'''
css += channel_css

# Override grid.category-grid-mode bug
css = re.sub(r'\.grid\.category-grid-mode \{[^\}]+\}', '', css, flags=re.DOTALL)

with open('src/style.css', 'w', encoding='utf-8') as f:
    f.write(css)


# 3. Update main.js
with open('src/main.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Add currentChannel
js = js.replace('let currentCategory = null;', 'let currentCategory = null;\nlet currentChannel = null;')

# Add Event Listener
events_code = '''
  document.getElementById('tab-category').onclick = () => switchTab('category');
  const tabChannel = document.getElementById('tab-channel');
  if (tabChannel) tabChannel.onclick = () => switchTab('channel');
'''
js = js.replace("document.getElementById('tab-category').onclick = () => switchTab('category');", events_code)

# Add updateStats channel count
stats_code = '''
  const categories = [...new Set(allData.filter(item => !isTrue(item.Read)).map(item => String(item.Category || item['카테고리'] || "미분류").trim()))].filter(c => c !== "");
  const channels = [...new Set(allData.filter(item => !isTrue(item.Read)).map(item => String(item.ChannelName || "알 수 없음").trim()))].filter(c => c !== "");
  
  document.getElementById('unread-count').textContent = unreadCount;
  document.getElementById('fav-count').textContent = favCount;
  document.getElementById('category-count').textContent = categories.length;
  const channelCountEl = document.getElementById('channel-count');
  if(channelCountEl) channelCountEl.textContent = channels.length;
'''
js = re.sub(r'const categories = \[\.\.\.new Set.*?textContent = categories\.length;', stats_code, js, flags=re.DOTALL)

# Update switchTab logic
switch_logic = '''
  if (currentTab === tabName && tabName !== 'category' && tabName !== 'channel') return;
  if (currentTab === tabName && tabName === 'category' && currentCategory === null) return;
  if (currentTab === tabName && tabName === 'channel' && currentChannel === null) return;

  currentTab = tabName;
  currentCategory = null; 
  currentChannel = null; 
'''
js = re.sub(r"if \(currentTab === tabName && tabName !== 'category'\) return;.*?currentCategory = null; // 탭 전환 시 카테고리 선택 초기화", switch_logic, js, flags=re.DOTALL)

# Update getFilteredData
get_filtered_old = r'else if \(currentTab === \'category\'\) \{.*?\n  \}'
get_filtered_new = '''else if (currentTab === 'category') {
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
  }'''
js = re.sub(get_filtered_old, get_filtered_new, js, flags=re.DOTALL)


# Inject renderChannelList and update renderGrid logic
render_grid_patch = '''
  if (currentTab === 'category' && !currentCategory && !searchQuery) {
    renderCategoryList();
    updateFloatingToolbar();
    return;
  }

  if (currentTab === 'channel' && !currentChannel && !searchQuery) {
    renderChannelList();
    updateFloatingToolbar();
    return;
  }
'''
js = js.replace('''  if (currentTab === 'category' && !currentCategory && !searchQuery) {
    renderCategoryList();
    updateFloatingToolbar();
    return;
  }''', render_grid_patch)


# Update Category back button logic
back_logic_old = r'// 카테고리 내비게이션 바 \(뒤로가기 버튼\).*?grid\.appendChild\(header\);\s*\}'
back_logic_new = '''// 카테고리/채널 내비게이션 바 (뒤로가기 버튼)
  if (((currentTab === 'category' && currentCategory) || (currentTab === 'channel' && currentChannel)) && !append) {
    const header = document.createElement('div');
    header.className = 'category-header';
    const isCat = currentTab === 'category';
    header.innerHTML = `
      <button class="btn-back">
        <i class="ph ph-arrow-left"></i>
        목록으로
      </button>
      <div class="category-title-display">
        <i class="ph ${isCat ? 'ph-folder-open' : 'ph-youtube-logo'}"></i>
        ${isCat ? currentCategory : currentChannel}
      </div>
    `;
    
    const backBtn = header.querySelector('.btn-back');
    backBtn.onclick = () => {
      if (isCat) currentCategory = null;
      else currentChannel = null;
      renderGrid();
    };
    
    grid.appendChild(header);
  }'''
js = re.sub(back_logic_old, back_logic_new, js, flags=re.DOTALL)

# Fix grid class for renderCategoryList
js = js.replace("grid.classList.add('category-grid-mode');", "grid.className = 'horizontal-scroll-mode';")
js = js.replace("grid.classList.remove('carousel-mode');", "")


# Add renderChannelList function
channel_list_fn = '''
function renderChannelList() {
  const grid = document.getElementById('card-grid');
  grid.innerHTML = "";
  grid.className = "channel-grid-mode";

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
    card.className = 'channel-card';
    card.onclick = () => {
      currentChannel = ch;
      renderGrid();
    };
    card.innerHTML = `
      <div class="channel-avatar">
        <i class="ph-fill ph-youtube-logo"></i>
      </div>
      <div class="channel-info-text">
        <div class="channel-name-large">${ch}</div>
        <div class="channel-video-count">${channelMap[ch].count}개의 새 영상</div>
      </div>
    `;
    fragment.appendChild(card);
  });
  grid.appendChild(fragment);
}
'''
js += "\n" + channel_list_fn

with open('src/main.js', 'w', encoding='utf-8') as f:
    f.write(js)

print("Channel Tab added and Category bug fixed.")
