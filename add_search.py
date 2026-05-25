import re

# 1. Update index.html
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

search_html = '''
        <div class="search-group">
          <i class="ph ph-magnifying-glass search-icon"></i>
          <input type="text" id="search-input" placeholder="검색..." autocomplete="off">
          <button id="btn-clear-search" class="hidden"><i class="ph ph-x-circle"></i></button>
        </div>
'''
html = html.replace('<button class="nav-tab active" id="tab-unread">', search_html + '        <button class="nav-tab active" id="tab-unread">')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

# 2. Update style.css
with open('src/style.css', 'r', encoding='utf-8') as f:
    css = f.read()

search_css = '''
/* Search Bar */
.search-group {
  display: flex;
  align-items: center;
  background: var(--bg-primary);
  border-radius: 100px;
  padding: 0 16px;
  margin-right: 8px;
  border: 1px solid transparent;
  transition: var(--transition-fast);
  width: 200px;
}
.search-group:focus-within {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
  width: 260px;
  background: var(--bg-card);
}
.search-icon {
  font-size: 18px;
  color: var(--text-muted);
}
.search-group input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  padding: 12px 10px;
  font-size: 14px;
  color: var(--text-primary);
  font-family: inherit;
}
.search-group input::placeholder {
  color: var(--text-muted);
}
#btn-clear-search {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  font-size: 18px;
}
#btn-clear-search.hidden {
  display: none;
}
#btn-clear-search:hover {
  color: var(--text-primary);
}
'''
css += search_css

with open('src/style.css', 'w', encoding='utf-8') as f:
    f.write(css)

# 3. Update main.js
with open('src/main.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Add searchQuery variable
js = re.sub(r'(let currentTab = \'unread\';)', r'let searchQuery = \'\';\n\1', js)

# Add search event listeners
search_js = '''
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
'''
js = js.replace('// 새로고침 버튼 핸들러', search_js + '\n  // 새로고침 버튼 핸들러')

# Update getFilteredData
get_filtered_old = r'function getFilteredData\(\) \{[\s\S]*?return \[\];\n\}'
get_filtered_new = '''function getFilteredData() {
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
}'''
js = re.sub(get_filtered_old, get_filtered_new, js)

# Update renderGrid to handle search in category tab
js = js.replace("if (currentTab === 'category' && !currentCategory) {", "if (currentTab === 'category' && !currentCategory && !searchQuery) {")

with open('src/main.js', 'w', encoding='utf-8') as f:
    f.write(js)

print("Search functionality added.")
