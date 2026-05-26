import re

with open('src/style.css', 'r', encoding='utf-8') as f:
    css = f.read()

# 1. Update widths to 960px
css = css.replace("grid-template-columns: minmax(0, 1fr) 480px;", "grid-template-columns: minmax(0, 1fr) 960px;")
css = css.replace("width: 480px;\n}", "width: 960px;\n}") # For pane-sublist and pane-detail

# 2. Update sublist-body to 2-column grid
old_body = r'\.sublist-body \{\s*padding: 16px;\s*display: flex;\s*flex-direction: column;\s*gap: 12px;\s*\}'
new_body = '''.sublist-body {
  padding: 16px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}'''
css = re.sub(old_body, new_body, css)

with open('src/style.css', 'w', encoding='utf-8') as f:
    f.write(css)

print("CSS updated.")
