import re

with open('src/style.css', 'r', encoding='utf-8') as f:
    css = f.read()

# 1. Update widths to 1150px (which is approx 20% larger than 960px)
css = css.replace("grid-template-columns: minmax(0, 1fr) 960px;", "grid-template-columns: minmax(0, 1fr) 1150px;")
css = css.replace("width: 960px;\n}", "width: 1150px;\n}")

# 2. Update sublist-body to 1-column flex
old_body = r'\.sublist-body \{\s*padding: 16px;\s*display: grid;\s*grid-template-columns: 1fr 1fr;\s*gap: 16px;\s*\}'
new_body = '''.sublist-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}'''
css = re.sub(old_body, new_body, css)

with open('src/style.css', 'w', encoding='utf-8') as f:
    f.write(css)

print("CSS updated for width and layout.")
