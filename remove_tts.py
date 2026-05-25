import re

# 1. Update index.html
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Remove tts-group
html = re.sub(r'<div class="tts-group">.*?(?=<button class="nav-tab active" id="tab-unread">)', '', html, flags=re.DOTALL)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

# 2. Update main.js
with open('src/main.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Remove setupEventListeners TTS logic
tts_events_pattern = r'// 최신 음성 요약 듣기 버튼.*?// 새로고침 버튼 핸들러'
js = re.sub(tts_events_pattern, '// 새로고침 버튼 핸들러', js, flags=re.DOTALL)

# Remove TTS global vars and functions
tts_funcs_pattern = r'let isSpeaking = false;.*?window\.speechSynthesis\.speak\(utterance\);\s*\}'
js = re.sub(tts_funcs_pattern, '', js, flags=re.DOTALL)

with open('src/main.js', 'w', encoding='utf-8') as f:
    f.write(js)

# 3. Update style.css
with open('src/style.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Remove TTS CSS
tts_css_pattern = r'\.tts-group \{.*?(?=\.layout-container \{)'
css = re.sub(tts_css_pattern, '', css, flags=re.DOTALL)

# Remove mobile TTS CSS
mobile_tts_pattern = r'/\* 모바일에서 음성 요약 버튼 그룹 최적화 \*/.*?\}\s*\}'
css = re.sub(mobile_tts_pattern, '}', css, flags=re.DOTALL)

# Appending Design Polish (Custom Scrollbars, Empty State Polish, Section Header Polish)
design_polish = '''

/* === DESIGN POLISH === */

/* Custom Scrollbars */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(15, 23, 42, 0.15);
  border-radius: 10px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(15, 23, 42, 0.25);
}

/* Empty State Polish */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  height: 100%;
}
.empty-state .empty-icon {
  width: 80px;
  height: 80px;
  background: var(--bg-card);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  box-shadow: var(--shadow-sm);
  color: var(--text-muted);
}
.empty-state .empty-icon i {
  font-size: 40px;
}
.empty-state .empty-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}
.empty-state .empty-description {
  font-size: 14px;
  color: var(--text-muted);
  max-width: 300px;
}

/* Detail Pane Section Headers Polish */
.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
}
.section-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}
.section-icon.summary {
  background: rgba(79, 70, 229, 0.1);
  color: var(--accent-primary);
}
.section-icon.analysis {
  background: rgba(5, 150, 105, 0.1);
  color: var(--accent-success);
}
.section-icon.insights {
  background: rgba(217, 119, 6, 0.1);
  color: var(--accent-warning);
}
.section-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

/* Detail Button Hierarchy Polish */
.modal-actions-video .btn-youtube {
  background: #ff0000;
  color: white;
  border: none;
  font-weight: 600;
  padding: 10px 16px;
  border-radius: 100px;
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  transition: var(--transition-fast);
}
.modal-actions-video .btn-youtube:hover {
  background: #dc2626;
  transform: translateY(-2px);
}
.modal-actions-video .btn-mark-read, 
.modal-actions-video .btn-watch-later,
.modal-actions-video .btn-favorite {
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  font-weight: 600;
  border-radius: 100px;
  transition: var(--transition-fast);
}
.modal-actions-video .btn-mark-read:hover, 
.modal-actions-video .btn-watch-later:hover,
.modal-actions-video .btn-favorite:hover {
  background: var(--bg-primary);
  border-color: var(--text-muted);
}
'''
css += design_polish

with open('src/style.css', 'w', encoding='utf-8') as f:
    f.write(css)

print("TTS removed and design polished.")
