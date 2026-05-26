import re

with open('src/style.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Fix the CSS for 3-pane layout proportions
old_css = r'\.layout-container\.sublist-active \{[\s\S]*?box-shadow: none;\s*\}'
new_css = '''.layout-container.sublist-active {
  display: flex;
}
.layout-container.sublist-active .pane-list {
  flex: none !important;
  width: 320px !important;
  border-right: 1px solid var(--border-default);
  padding: 24px 16px;
}
.layout-container.sublist-active .pane-sublist {
  flex: 1;
  min-width: 600px;
  width: auto;
  display: flex;
}
.layout-container.sublist-active.detail-active .pane-detail {
  position: static;
  flex: none !important;
  width: 480px !important;
  display: flex;
  box-shadow: none;
  border-left: 1px solid var(--border-default);
}'''

css = re.sub(old_css, new_css, css)

with open('src/style.css', 'w', encoding='utf-8') as f:
    f.write(css)

print("Proportions updated.")
