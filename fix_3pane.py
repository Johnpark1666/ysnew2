import re

# 1. Update style.css
with open('src/style.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Update sublist-thumb size (30% increase)
old_thumb = r'\.sublist-thumb \{\s*width: 130px;\s*height: 74px;'
new_thumb = '''.sublist-thumb {
  width: 170px;
  height: 96px;'''
css = re.sub(old_thumb, new_thumb, css)

# Make layout-container scrollable horizontally
css = css.replace("overflow: hidden;\n  position: relative;\n}", "overflow-x: auto;\n  overflow-y: hidden;\n  position: relative;\n}")

# Update sublist pane to not shrink
css = css.replace("width: 1150px;\n}", "width: 1150px;\n  flex-shrink: 0;\n}")

# Fix the 3-pane layout (sublist + detail)
old_3pane = r'\.layout-container\.sublist-active\.detail-active \.pane-detail \{\s*position: absolute;\s*top: 0;\s*right: 0;\s*bottom: 0;\s*width: 480px;\s*display: flex;\s*z-index: 200;\s*box-shadow: -10px 0 30px rgba\(0,0,0,0\.15\);\s*\}'
new_3pane = '''.layout-container.sublist-active.detail-active .pane-detail {
  position: static;
  width: 480px;
  display: flex;
  flex-shrink: 0;
  box-shadow: none;
}'''
css = re.sub(old_3pane, new_3pane, css)

with open('src/style.css', 'w', encoding='utf-8') as f:
    f.write(css)


# 2. Update main.js
with open('src/main.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Replace the innerHTML generation inside openSublist
old_card_logic = r'const thumb = item\.Image_URL[\s\S]*?sublistBody\.appendChild\(card\);'

new_card_logic = '''const thumb = item.Image_URL || item['썸네일'] || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : 'icons8-youtube-16.png');
    
    const isFav = isTrue(item.Favorite);

    card.innerHTML = `
      <div style="display: flex; gap: 16px; flex: 1; align-items: center; overflow: hidden;">
        <img src="${thumb}" class="sublist-thumb" onerror="window.handleImageError(this)">
        <div class="sublist-info" style="flex: 1; min-width: 0;">
          <div class="sublist-title">${item.Title || "제목 없음"}</div>
          <div class="sublist-date">${item.PublishDate || ""}</div>
        </div>
      </div>
      <div class="sublist-actions" style="display: flex; gap: 8px; flex-shrink: 0; align-items: center; border-left: 1px solid var(--border-subtle); padding-left: 16px;">
        <button class="btn-mark-read" style="padding: 8px 12px; height: 44px; border-radius: 8px; font-size: 13px; border: 1px solid var(--border-default); background: white; color: var(--text-primary); cursor: pointer;" onclick="event.stopPropagation(); handleMarkRead('${item.id || item.ID}', this, event)">
          <i class="ph ph-check-circle" style="font-size: 18px; margin-right: 4px;"></i> 읽음
        </button>
        <button class="btn-favorite ${isFav ? 'active' : ''}" style="width: 44px; height: 44px; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid var(--border-default); background: white; cursor: pointer; color: ${isFav ? 'var(--accent-warning)' : 'var(--text-muted)'};" onclick="event.stopPropagation(); handleToggleFav('${item.id || item.ID}', this, event)">
          <i class="ph ${isFav ? 'ph-star ph-fill' : 'ph-star'}" style="font-size: 20px;"></i>
        </button>
      </div>
    `;
    sublistBody.appendChild(card);'''

js = re.sub(old_card_logic, new_card_logic, js)

with open('src/main.js', 'w', encoding='utf-8') as f:
    f.write(js)

print("3-pane layout, 30% height increase, and read/fav buttons applied.")
