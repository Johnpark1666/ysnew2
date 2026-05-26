import re

# 1. Update style.css
with open('src/style.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Fix layout grid column constraints
css = css.replace("grid-template-columns: 1fr 480px;", "grid-template-columns: minmax(0, 1fr) 480px;")

# Enforce width on sublist pane
pane_sublist_old = r'\.pane-sublist \{[^}]*display: none;\n\}'
pane_sublist_new = '''.pane-sublist {
  background: var(--bg-card);
  border-left: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  position: relative;
  z-index: 100;
  display: none;
  min-width: 0;
  width: 480px;
}'''
css = re.sub(pane_sublist_old, pane_sublist_new, css, flags=re.DOTALL)

# Add word-break to sublist-title
sublist_title_old = r'(\.sublist-title \{[\s\S]*?margin-bottom: 6px;\n)\}'
sublist_title_new = r'\1  word-break: break-all;\n  overflow-wrap: anywhere;\n}'
css = re.sub(sublist_title_old, sublist_title_new, css)

with open('src/style.css', 'w', encoding='utf-8') as f:
    f.write(css)


# 2. Update main.js
with open('src/main.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Fix broken thumbnail extraction in openSublist
thumb_logic_old = r'let videoId = extractVideoId\(item\.URL\);\n\s*const thumb = videoId \? `https://i\.ytimg\.com/vi/\$\{videoId\}/hqdefault\.jpg` : \'icons8-youtube-16\.png\';'
thumb_logic_new = '''let videoId = extractVideoId(item.URL || item['URL'] || "");
    const thumb = item.Image_URL || item['썸네일'] || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : 'icons8-youtube-16.png');'''
js = re.sub(thumb_logic_old, thumb_logic_new, js)

# Add onerror to sublist-thumb img tag
img_tag_old = r'<img src="\$\{thumb\}" class="sublist-thumb">'
img_tag_new = r'<img src="${thumb}" class="sublist-thumb" onerror="window.handleImageError(this)">'
js = js.replace(img_tag_old, img_tag_new)

with open('src/main.js', 'w', encoding='utf-8') as f:
    f.write(js)

print("Sublist width and thumbnail issues fixed.")
