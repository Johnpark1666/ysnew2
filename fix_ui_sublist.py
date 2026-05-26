import re

# 1. Update style.css
with open('src/style.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Fix layout proportions for true 3-pane layout
old_layout = r'\.layout-container\.sublist-active \.pane-list \{[\s\S]*?padding: 24px 16px;\s*\}\s*\.layout-container\.sublist-active \.pane-sublist \{[\s\S]*?display: flex;\s*\}\s*\.layout-container\.sublist-active\.detail-active \.pane-detail \{[\s\S]*?border-left: 1px solid var\(--border-default\);\s*\}'

new_layout = '''.layout-container.sublist-active .pane-list {
  flex: none !important;
  width: 280px !important;
  border-right: 1px solid var(--border-default);
  padding: 24px 16px;
}
.layout-container.sublist-active .pane-sublist {
  flex: none !important;
  width: 450px !important;
  min-width: 0 !important;
  display: flex;
}
.layout-container.sublist-active.detail-active .pane-detail {
  position: static;
  flex: 1 !important;
  width: auto !important;
  min-width: 500px !important;
  display: block;
  box-shadow: none;
  border-left: 1px solid var(--border-default);
}'''

css = re.sub(old_layout, new_layout, css)

with open('src/style.css', 'w', encoding='utf-8') as f:
    f.write(css)


# 2. Update main.js
with open('src/main.js', 'r', encoding='utf-8') as f:
    js = f.read()

old_click = r'document\.getElementById\(\'close-detail\'\)\.onclick = \(\) => closeDetail\(\);'
new_click = '''document.getElementById('close-detail').onclick = () => closeDetail();
  const sublistBtn = document.getElementById('close-sublist');
  if (sublistBtn) {
    sublistBtn.onclick = () => {
      document.getElementById('layout-container').classList.remove('sublist-active');
      closeDetail();
    };
  }'''
js = js.replace(old_click, new_click)

with open('src/main.js', 'w', encoding='utf-8') as f:
    f.write(js)

print("Proportions and close button fixed.")
