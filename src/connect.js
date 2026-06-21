/**
 * Connect Tab — 네트워크 그래프 + 연결 인사이트
 * imports: main.js의 allData, githubData 활용
 */

// ─── 컬러 팔레트 ───
const CAT_COLORS = {
  '경제/금융':'#0d7a6a','AI/테크':'#6d28d9','정치/국제':'#b45309','사회/이슈':'#d97706',
  '자기계발':'#0f766e','창업/사업':'#047857','엔터테인먼트':'#0891b2','라이프스타일':'#a16207',
};
const BAR_COLORS = ['#4f46e5','#6d28d9','#0d7a6a','#b45309','#d97706','#0891b2','#047857','#9333ea','#0f766e','#a16207'];
// 언어 색상 매핑 (소문자 키, #접두어/대소문자 무시)
const GH_LANG_COLORS_NORM = {
  'python':'#3572A5','typescript':'#3178C6','javascript':'#f7df1e','rust':'#dea584',
  'go':'#00ADD8','swift':'#F05138','kotlin':'#A97BFF','c++':'#f34b7d','java':'#b07219','ruby':'#701516',
  'c':'#555555','c#':'#178600','css':'#563d7c','scss':'#c6538c','html':'#e34c26','shell':'#89e051',
  'bash':'#89e051','powershell':'#012456','php':'#4F5D95','perl':'#0298c3','lua':'#000080',
  'r':'#198ce7','matlab':'#e16737','scala':'#c22d40','dart':'#00B4AB','flutter':'#02569B',
  'elixir':'#6e4a7e','haskell':'#5e5086','clojure':'#db5855','erlang':'#b83998',
  'graphql':'#e10098','json':'#292929','yaml':'#cb171e','markdown':'#083fa1',
  'dockerfile':'#384d54','makefile':'#427819','cmake':'#da3434',
  'objective-c':'#438eff','objective-c++':'#6866fb','vue':'#41b883','svelte':'#ff3e00',
  'solidity':'#363636','zig':'#ec915c','nim':'#ffc200','crystal':'#000100',
};
// 키워드 정규화 + 언어 감지 헬퍼
function detectLang(kw) {
  const clean = kw.replace(/^#/, '').trim().toLowerCase();
  return GH_LANG_COLORS_NORM[clean] ? clean : null;
}
function langColor(kw) {
  const lang = detectLang(kw);
  return lang ? GH_LANG_COLORS_NORM[lang] : '#888';
}
const AVATAR_PALETTE = ['#e8590c','#6d28d9','#0d7a6a','#b45309','#0891b2','#047857','#9333ea','#d97706','#0f766e','#a16207','#be123c'];

function hashColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

// ─── 리렌더링 컨텍스트 저장 ───
let _cnCtx = null;

// ─── 메인 렌더러 ───
export function renderConnect(container, { allData, githubData }) {
  // 컨텍스트 저장 (토글 리렌더링용)
  _cnCtx = { container, allData, githubData };

  const showUnreadOnly = window._cnFilterUnread || false;


  // ── 데이터 가공 ──
  const ytItems = allData.filter(d => d.ID && (!showUnreadOnly || !isTrue(d.Read)));
  const ghItems = githubData.filter(d => d.ID && (!showUnreadOnly || !isTrue(d.Read)));

  // YouTube: 채널/카테고리/키워드 추출
  const chData = {};
  ytItems.forEach(item => {
    const ch = String(item.ChannelName || '알 수 없음').trim();
    const cat = String(item.Category || '기타').trim();
    const kws = String(item.Keywords || '').split(',').map(k => k.trim()).filter(Boolean);
    if (!chData[ch]) chData[ch] = { count: 0, cats: {}, kw: [], avatar: '' };
    chData[ch].count++;
    if (cat) chData[ch].cats[cat] = (chData[ch].cats[cat] || 0) + 1;
    kws.forEach(k => { if (!chData[ch].kw.includes(k)) chData[ch].kw.push(k); });
    // 실제 채널 아바타 저장 (처음 발견된 유효한 URL 우선)
    const av = String(item.ChannelAvatar || '').trim();
    if (av && !chData[ch].avatar) chData[ch].avatar = av;
    // Fav stats
    if (isTrue(item.Favorite)) {
      if (!chData[ch].favCount) chData[ch].favCount = 0;
      chData[ch].favCount++;
    }
  });
  // Sort channels by count
  const sortedChs = Object.entries(chData).sort((a, b) => b[1].count - a[1].count);
  const topChs = sortedChs.slice(0, 15);
  const chPriCat = {};
  Object.entries(chData).forEach(([ch, d]) => {
    const entries = Object.entries(d.cats);
    chPriCat[ch] = entries.length > 0 ? entries.sort((a,b) => b[1]-a[1])[0][0] : '기타';
  });

  // All keywords with counts
  const kwCount = {};
  Object.values(chData).forEach(d => d.kw.forEach(k => { kwCount[k] = (kwCount[k]||0) + 1; }));
  const allKws = Object.keys(kwCount).sort((a,b) => kwCount[b]-kwCount[a]);
  const kwCat = {};
  Object.entries(chData).forEach(([ch, d]) => {
    const mc = chPriCat[ch] || '기타';
    d.kw.forEach(k => { if (!kwCat[k]) kwCat[k] = mc; });
  });

  const allCats = [...new Set(ytItems.map(i => String(i.Category).trim()).filter(Boolean))];

  // GitHub: 언어/토픽 추출
  const ghLangs = {};
  const ghTopics = {};
  ghItems.forEach(item => {
    const title = String(item.Title || '');
    const kws = String(item.Keywords || '').split(',').map(k => k.trim()).filter(Boolean);
    kws.forEach(k => {
      const lang = detectLang(k);
      if (lang) ghLangs[lang] = (ghLangs[lang]||0) + 1;
      else ghTopics[k] = (ghTopics[k]||0) + 1;
    });
  });

  // ── 실제 통계 계산 (플레이스홀더 제거) ──
  const ytUnreadPct = ytItems.length > 0
    ? Math.round(ytItems.filter(i => !isTrue(i.Read)).length / ytItems.length * 100) + '%'
    : '0%';
  const ghAnalyzed = ghItems.filter(i => String(i.Summary || '').trim().length > 0).length;
  const now = new Date();
  const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  const ghNewThisWeek = ghItems.filter(i => {
    const ds = String(i.PublishDate || '').substring(0, 10);
    if (!ds) return false;
    const d = new Date(ds);
    return !isNaN(d) && d >= weekAgo;
  }).length;

  // ── HTML 빌드 ──
  container.innerHTML = `
    <div class="connect-wrap">
      <!-- Mode Toggle -->
      <div class="connect-mode-toggle">
        <div class="cn-filter-btn ${showUnreadOnly ? 'active' : ''}" onclick="cnToggleUnreadFilter()">${showUnreadOnly ? '📋 읽지않음' : '📋 전체'}</div>
        <div class="connect-mode-btn active" data-mode="yt">▶ 유튜브 요약</div>
        <div class="connect-mode-btn" data-mode="gh">◆ GitHub Trending</div>
      </div>

      <div class="connect-section active" id="connect-yt">
        <div class="connect-stats card">
          <div class="stats-row-4">
            <div class="stat-item"><div class="stat-num accent">${sortedChs.length}</div><div class="stat-label">구독 채널</div></div>
            <div class="stat-item"><div class="stat-num" style="color:#b45309;">${ytUnreadPct}</div><div class="stat-label">안읽음 비율</div></div>
            <div class="stat-item"><div class="stat-num" style="color:#e8590c;">${ytItems.filter(i=>isTrue(i.Favorite)).length}</div><div class="stat-label">★ 즐겨찾기</div></div>
            <div class="stat-item"><div class="stat-num accent">${Object.keys(kwCount).length}</div><div class="stat-label">주요 키워드</div></div>
          </div>
        </div>

        <div class="connect-grid">
          <div class="connect-left">
            <div class="card">
              <div class="card-h"><span class="card-h-icon">🕸️</span> 키워드 연결망 <span class="badge">노드 클릭</span></div>
              <div class="card-b slim">
                <div class="graph-wrap" id="cn-graph-wrap">
                  <canvas id="cn-graph-canvas"></canvas>
                  <div class="graph-hint" id="cn-graph-hint">🔍 100% · 휠 확대축소 · 드래그 · 노드 클릭</div>
                </div>
              </div>
              <div class="graph-legend" id="cn-graph-legend"></div>
            </div>

            <div class="card">
              <div class="card-h"><span class="card-h-icon">🔥</span> 핫 키워드 <span class="badge">클릭</span></div>
              <div class="card-b"><div class="hot-grid" id="cn-hot-kw"></div></div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
              <div class="card">
                <div class="card-h"><span class="card-h-icon">📊</span> 채널 활동 <span class="badge">클릭</span></div>
                <div class="card-b"><div class="bar-list" id="cn-ch-bars"></div></div>
              </div>
              <div class="card">
                <div class="card-h"><span class="card-h-icon">🏷️</span> 카테고리 분포</div>
                <div class="card-b">
                  <div class="donut-wrap">
                    <canvas id="cn-donut" width="80" height="80"></canvas>
                    <div id="cn-cat-legend" class="cat-legend"></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-h"><span class="card-h-icon">💛</span> 채널별 즐겨찾기 비율 <span class="badge">인사이트</span></div>
              <div class="card-b"><div class="bar-list" id="cn-fav-ratio"></div></div>
            </div>

            <div class="card">
              <div class="card-h"><span class="card-h-icon">★</span> 즐겨찾기 분석 <span class="badge" style="background:#e8590c;">Fav</span></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;">
                <div class="card-b" style="border-right:var(--border);">
                  <div style="font-size:10px;font-weight:800;margin-bottom:6px;">🏷️ 카테고리 선호도</div>
                  <div class="bar-list" id="cn-fav-cat"></div>
                </div>
                <div class="card-b">
                  <div style="font-size:10px;font-weight:800;margin-bottom:6px;">🏷️ Fav 키워드</div>
                  <div class="hot-grid" id="cn-fav-kw"></div>
                </div>
              </div>
              <div style="border-top:var(--border);padding:10px 14px;">
                <div style="font-size:10px;font-weight:800;margin-bottom:4px;">📺 즐겨찾는 채널</div>
                <div id="cn-fav-ch" style="display:flex;flex-wrap:wrap;gap:4px;"></div>
              </div>
            </div>
          </div>

          <div class="card connect-detail">
            <div class="card-h"><span class="card-h-icon">🔍</span> 상세 패널 <span style="margin-left:auto;font-size:9px;font-weight:700;color:var(--text-dim);">유튜브</span></div>
            <div class="detail-scroll" id="cn-yt-detail">
              <div class="detail-empty" id="cn-yt-empty">
                <div class="big-icon">👆</div>
                <div class="hint">키워드 · 채널 · 노드를 클릭하세요</div>
                <div class="sub-hint">해당 항목의 영상 목록과 상세 정보 확인</div>
              </div>
              <div id="cn-yt-detail-content" style="display:none;"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="connect-section" id="connect-gh">
        <div class="connect-stats card">
          <div class="stats-row-4">
            <div class="stat-item"><div class="stat-num accent">${ghItems.length}</div><div class="stat-label">트렌딩 저장소</div></div>
            <div class="stat-item"><div class="stat-num" style="color:#0d7a6a;">${ghAnalyzed}</div><div class="stat-label">분석 완료</div></div>
            <div class="stat-item"><div class="stat-num" style="color:#6d28d9;">${Object.keys(ghLangs).length + Object.keys(ghTopics).length}</div><div class="stat-label">주요 토픽</div></div>
            <div class="stat-item"><div class="stat-num accent">${ghNewThisWeek}</div><div class="stat-label">이번주 신규</div></div>
          </div>
        </div>

        <div class="connect-grid">
          <div class="connect-left">
            <div class="card">
              <div class="card-h"><span class="card-h-icon">🕸️</span> 저장소 연결망 <span class="badge">노드 클릭</span></div>
              <div class="card-b slim">
                <div class="graph-wrap" id="cn-gh-graph-wrap">
                  <canvas id="cn-gh-graph-canvas"></canvas>
                  <div class="graph-hint" id="cn-gh-graph-hint">🔍 100% · 휠 확대축소 · 언어별 색상</div>
                </div>
              </div>
              <div class="graph-legend" id="cn-gh-graph-legend"></div>
            </div>

            <div class="card">
              <div class="card-h"><span class="card-h-icon">🔥</span> 트렌딩 저장소 <span class="badge">${new Date().toISOString().slice(0,10).replace(/-/g,'.')}</span></div>
              <div class="card-b"><div id="cn-gh-repos"></div></div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
              <div class="card">
                <div class="card-h"><span class="card-h-icon">📊</span> 언어별 분포</div>
                <div class="card-b"><div class="bar-list" id="cn-gh-lang"></div></div>
              </div>
              <div class="card">
                <div class="card-h"><span class="card-h-icon">🏆</span> 별점 TOP</div>
                <div class="card-b"><div class="bar-list" id="cn-gh-stars"></div></div>
              </div>
            </div>
          </div>

          <div class="card connect-detail">
            <div class="card-h"><span class="card-h-icon">🔍</span> 상세 패널 <span style="margin-left:auto;font-size:9px;font-weight:700;color:var(--text-dim);">GitHub</span></div>
            <div class="detail-scroll" id="cn-gh-detail">
              <div class="detail-empty" id="cn-gh-empty">
                <div class="big-icon">👆</div>
                <div class="hint">저장소 · 언어 · 토픽을 클릭하세요</div>
                <div class="sub-hint">분석 리포트와 인사이트 확인</div>
              </div>
              <div id="cn-gh-detail-content" style="display:none;"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // ── 렌더링 함수들 ──

  // Channel bars
  function renderChBars() {
    const el = document.getElementById('cn-ch-bars');
    if (!el) return;
    const max = topChs[0]?.[1]?.count || 1;
    el.innerHTML = topChs.map(([name, d], i) =>
      `<div class="bar-row" onclick="cnShowChVids('${name.replace(/'/g, "\\'")}')">
        <img src="${d.avatar ? d.avatar : 'https://ui-avatars.com/api?name='+encodeURIComponent(name)+'&background='+hashColor(name).replace('#','')+'&color=fff&size=32&bold=true'}" class="ch-avatar-img" alt="" onerror="this.src='https://ui-avatars.com/api?name=${encodeURIComponent(name)}&background=${hashColor(name).replace('#','')}&color=fff&size=32&bold=true'">
        <span class="bar-label">${name}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(d.count/max)*100}%;background:${BAR_COLORS[i%BAR_COLORS.length]};">${d.count > 2 ? d.count : ''}</div></div>
        <span class="bar-count">${d.count}</span>
      </div>`
    ).join('');
  }

  // Donut
  function renderDonut() {
    const canvas = document.getElementById('cn-donut');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W=80,H=80,cx=40,cy=40,R=35,inner=22;
    const totals = {};
    Object.values(chData).forEach(d => Object.entries(d.cats).forEach(([c,n]) => { totals[c]=(totals[c]||0)+n; }));
    const total = Object.values(totals).reduce((a,b)=>a+b,0);
    const sorted = Object.entries(totals).sort((a,b)=>b[1]-a[1]);
    document.getElementById('cn-cat-legend').innerHTML = sorted.slice(0,6).map(([c,n]) =>
      `<div class="cat-row"><span class="cat-dot" style="background:${CAT_COLORS[c]||'#888'}"></span><span class="cat-name">${c}</span><span class="cat-pct">${Math.round(n/total*100)}%</span></div>`
    ).join('');
    let start = -Math.PI/2;
    ctx.clearRect(0,0,W,H);
    sorted.forEach(([c,n]) => {
      const a = (n/total)*Math.PI*2;
      ctx.beginPath(); ctx.arc(cx,cy,R,start,start+a); ctx.arc(cx,cy,inner,start+a,start,true); ctx.closePath();
      ctx.fillStyle = CAT_COLORS[c]||'#888'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      start += a;
    });
    ctx.fillStyle = '#121212'; ctx.font = 'bold 12px Outfit, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(total, cx, cy);
  }

  // Hot keywords
  function renderHot() {
    const el = document.getElementById('cn-hot-kw');
    if (!el) return;
    const top = Object.entries(kwCount).sort((a,b)=>b[1]-a[1]).slice(0,16);
    el.innerHTML = top.map(([k,c]) =>
      `<span class="hot-tag" onclick="cnShowKwVids('${k.replace(/'/g, "\\'")}')">${k} <span class="count">${c}</span></span>`
    ).join('');
  }

  // Favorites
  function renderFav() {
    // Category bars
    const catEl = document.getElementById('cn-fav-cat');
    if (catEl) {
      const favCats = {};
      ytItems.filter(i => isTrue(i.Favorite)).forEach(i => {
        const c = String(i.Category).trim();
        if (c) favCats[c] = (favCats[c]||0) + 1;
      });
      const sorted = Object.entries(favCats).sort((a,b)=>b[1]-a[1]).slice(0,5);
      const max = sorted[0]?.[1] || 1;
      catEl.innerHTML = sorted.map(([c,n]) =>
        `<div class="bar-row" style="cursor:default;"><span class="bar-label" style="width:65px;">${c}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${(n/max)*100}%;background:${CAT_COLORS[c]||'#888'};">${n>2?n:''}</div></div>
          <span class="bar-count">${n}</span></div>`
      ).join('');
    }

    // Fav keywords
    const kwEl = document.getElementById('cn-fav-kw');
    if (kwEl) {
      const favKws = {};
      ytItems.filter(i => isTrue(i.Favorite)).forEach(i => {
        String(i.Keywords||'').split(',').map(k=>k.trim()).filter(Boolean).forEach(k => { favKws[k]=(favKws[k]||0)+1; });
      });
      const sorted = Object.entries(favKws).sort((a,b)=>b[1]-a[1]).slice(0,10);
      kwEl.innerHTML = sorted.map(([k,c]) =>
        `<span class="hot-tag" style="font-size:8px;padding:3px 7px;" onclick="cnShowKwVids('${k.replace(/'/g, "\\'")}')">${k} <span class="count">${c}</span></span>`
      ).join('');
    }

    // Fav channels
    const chEl = document.getElementById('cn-fav-ch');
    if (chEl) {
      const favChs = {};
      ytItems.filter(i => isTrue(i.Favorite)).forEach(i => {
        const ch = String(i.ChannelName).trim();
        if (ch) favChs[ch] = (favChs[ch]||0) + 1;
      });
      chEl.innerHTML = Object.entries(favChs).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([ch,c]) =>
        `<span class="hot-tag" style="font-size:8px;padding:3px 8px;" onclick="cnShowChVids('${ch.replace(/'/g, "\\'")}')">${ch} <span class="count">${c}</span></span>`
      ).join('');
    }
  }

  // ── 채널별 즐겨찾기 비율 ──
  function renderChFavRatio() {
    const el = document.getElementById('cn-fav-ratio');
    if (!el) return;
    const ratios = sortedChs.map(([name, d]) => {
      const total = d.count;
      const fav = d.favCount || 0;
      return { name, ratio: total > 0 ? fav / total : 0, fav, total };
    }).filter(r => r.total >= 2).sort((a, b) => b.ratio - a.ratio);
    if (ratios.length === 0) { el.innerHTML = '<div style="padding:12px;text-align:center;font-size:10px;color:var(--text-dim);">즐겨찾기 데이터가 충분하지 않습니다</div>'; return; }
    const maxRatio = Math.max(ratios[0].ratio, 0.01);
    el.innerHTML = ratios.slice(0, 10).map(r => {
      const pct = Math.round(r.ratio * 100);
      const barW = (r.ratio / maxRatio) * 100;
      const color = r.ratio >= 0.3 ? '#059669' : r.ratio >= 0.15 ? '#d97706' : '#dc2626';
      return `<div class="bar-row" style="cursor:pointer;" onclick="cnShowChVids('${r.name.replace(/'/g, "\\'")}')">
        <span class="bar-label" style="width:80px;font-size:10px;">${r.name}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${barW}%;background:${color};font-size:9px;">${pct}%</div></div>
        <span style="font-size:9px;color:var(--text-dim);font-weight:600;margin-left:6px;flex-shrink:0;">${r.fav}/${r.total}</span>
      </div>`;
    }).join('');
  }

  // ── 네트워크 그래프 (YouTube) ──
  let graphRunning = false;
  function renderYtGraph() {
    if (graphRunning) return;
    graphRunning = true;
    setTimeout(() => { graphRunning = false; }, 500);

    const canvas = document.getElementById('cn-graph-canvas');
    const wrap = document.getElementById('cn-graph-wrap');
    if (!canvas || !wrap || wrap.clientWidth === 0) return;
    canvas.width = wrap.clientWidth * 2; canvas.height = 380 * 2;
    canvas.style.width = wrap.clientWidth+'px'; canvas.style.height = '380px';
    const ctx = canvas.getContext('2d'); ctx.scale(2,2);
    const W = wrap.clientWidth, H = 380;

    // Build nodes — Obsidian-style 동심원 방사형 배치
    const cx = W * 0.5, cy = H * 0.5;
    const catNodes = allCats.map((c, i) => ({ id: c, type: 'category', group: c, r: 12,
      x: cx + Math.cos(i/allCats.length*Math.PI*2)*W*0.12 + (Math.random()-0.5)*8,
      y: cy + Math.sin(i/allCats.length*Math.PI*2)*W*0.12 + (Math.random()-0.5)*8, vx:0, vy:0 }));
    const chNodes = sortedChs.slice(0,12).map(([ch], i) => ({ id: ch, type: 'channel', group: chPriCat[ch]||'기타', r: 6 + (chData[ch].count)*0.5,
      x: cx + Math.cos(i/12*Math.PI*2)*W*0.30 + (Math.random()-0.5)*12,
      y: cy + Math.sin(i/12*Math.PI*2)*W*0.30 + (Math.random()-0.5)*12, vx:0, vy:0 }));
    const kwNodes = allKws.slice(0,40).map((k, i) => ({ id: k, type: 'keyword', group: kwCat[k]||'기타', r: 3 + (kwCount[k]||1)*2,
      x: cx + Math.cos(i/40*Math.PI*2)*W*0.44 + (Math.random()-0.5)*20,
      y: cy + Math.sin(i/40*Math.PI*2)*W*0.44 + (Math.random()-0.5)*20, vx:0, vy:0 }));

    const nodes = [...catNodes, ...chNodes, ...kwNodes];
    const nodeMap = {}; nodes.forEach(n => nodeMap[n.id] = n);

    // Build links
    const links = [];
    sortedChs.slice(0,12).forEach(([ch]) => {
      const d = chData[ch];
      Object.keys(d.cats).forEach(c => { if (nodeMap[ch] && nodeMap[c]) links.push({ s: nodeMap[c], t: nodeMap[ch], v: 2, type: 'cat-ch' }); });
      d.kw.forEach(k => { if (nodeMap[ch] && nodeMap[k]) links.push({ s: nodeMap[ch], t: nodeMap[k], v: 1, type: 'ch-kw' }); });
    });
    const kwLinks = {};
    Object.values(chData).forEach(d => {
      for(let i=0;i<d.kw.length;i++) for(let j=i+1;j<d.kw.length;j++) {
        const k=[d.kw[i],d.kw[j]].sort().join('__'); kwLinks[k]=(kwLinks[k]||0)+1;
      }
    });
    Object.entries(kwLinks).filter(([_,v])=>v>=2).forEach(([k,v]) => {
      const [s,t] = k.split('__');
      if (nodeMap[s] && nodeMap[t]) links.push({ s: nodeMap[s], t: nodeMap[t], v, type: 'kw-kw' });
    });

    if (nodes.length === 0) return;

    const sensitivity = 200;
    let dragNode=null, offX=0, offY=0, panX=0, panY=0, isPan=false, lmx=0, lmy=0, sc=1.0;
    let selNode = null, focusMode = false;
    let showCats = true, showChs = true, showKws = true;

    function isVis(n) {
      return (n.type==='category'&&showCats)||(n.type==='channel'&&showChs)||(n.type==='keyword'&&showKws);
    }

    function m2w(e) { const r=canvas.getBoundingClientRect(); return {x:((e.clientX-r.left)*(W/r.width)-panX)/sc, y:((e.clientY-r.top)*(H/r.height)-panY)/sc}; }

    function getCon(node) {
      const s = new Set([node.id]);
      links.forEach(l => { if (l.s === node) s.add(l.t.id); if (l.t === node) s.add(l.s.id); });
      return s;
    }

    function getOrb(n, focus, idx, total) {
      const a = (idx/total)*Math.PI*2 - Math.PI/2;
      const d = 65 + n.r*2.5 + (total>8?20:0);
      return { x: focus.x + Math.cos(a)*d, y: focus.y + Math.sin(a)*d };
    }

    // Events
    canvas.onwheel = e => {
      e.preventDefault();
      const r=canvas.getBoundingClientRect();
      const mx=(e.clientX-r.left)*(W/r.width), my=(e.clientY-r.top)*(H/r.height);
      const f=e.deltaY<0?1.12:0.88, ns=Math.max(0.2,Math.min(5,sc*f));
      panX=mx-(mx-panX)*(ns/sc); panY=my-(my-panY)*(ns/sc); sc=ns;
      document.getElementById('cn-graph-hint').textContent=`🔍 ${Math.round(sc*100)}% · 휠 확대축소 · 드래그 · 노드 클릭`;
    };
    canvas.onmousedown = e => {
      const w=m2w(e); let c=null, md=25;
      nodes.forEach(n=>{const d=Math.sqrt((w.x-n.x)**2+(w.y-n.y)**2);if(d<md){md=d;c=n;}});
      if(c){dragNode=c;offX=w.x-c.x;offY=w.y-c.y;c.fx=c.x;c.fy=c.y;return;}
      isPan=true;lmx=e.clientX;lmy=e.clientY;
    };
    canvas.onmousemove = e => {
      if(dragNode){const w=m2w(e);dragNode.fx=w.x-offX;dragNode.fy=w.y-offY;}
      if(isPan){panX+=(e.clientX-lmx)*(W/canvas.getBoundingClientRect().width);panY+=(e.clientY-lmy)*(H/canvas.getBoundingClientRect().height);lmx=e.clientX;lmy=e.clientY;}
    };
    canvas.onmouseup = () => {
      if(dragNode){
        if(Math.abs(dragNode.fx-dragNode.x)<3) {
          if (selNode === dragNode) { selNode=null; focusMode=false; document.getElementById('cn-graph-hint').textContent='🔍 100% · 휠 확대축소 · 드래그 · 노드 클릭'; }
          else {
            selNode = dragNode; focusMode = true;
            document.getElementById('cn-graph-hint').textContent=`🔍 포커스: ${selNode.id} · 다시 클릭 시 해제`;
            if (selNode.type === 'category') cnShowCatVids(selNode.id);
            else if (selNode.type === 'channel') cnShowChVids(selNode.id);
            else cnShowKwVids(selNode.id);
          }
        }
        dragNode.fx=null; dragNode.fy=null; dragNode=null;
      } else { selNode=null; focusMode=false; document.getElementById('cn-graph-hint').textContent='🔍 100% · 휠 확대축소 · 드래그 · 노드 클릭'; }
      isPan=false;
    };
    canvas.onmouseleave = () => {if(dragNode){dragNode.fx=null;dragNode.fy=null;dragNode=null;}isPan=false;};

    window.cnToggleType = function(type) {
      if (type==='c') showCats=!showCats; else if (type==='h') showChs=!showChs; else if (type==='k') showKws=!showKws;
      if (selNode && !isVis(selNode)) { selNode=null; focusMode=false; document.getElementById('cn-graph-hint').textContent='🔍 100% · 휠 확대축소 · 드래그 · 노드 클릭'; }
      updateLegend();
    };

    function updateLegend() {
      document.getElementById('cn-graph-legend').innerHTML =
        `<span class="legend-toggle ${showCats?'active':''}" onclick="cnToggleType('c')">●카테고리</span>` +
        allCats.slice(0,6).map(c => `<span class="legend-item"><span class="legend-dot" style="background:${CAT_COLORS[c]||'#888'}"></span>${c}</span>`).join('') +
        `<span class="legend-toggle ${showChs?'active':''}" onclick="cnToggleType('h')" style="margin-left:4px;">■채널</span>` +
        `<span class="legend-toggle ${showKws?'active':''}" onclick="cnToggleType('k')" style="margin-left:4px;">●키워드</span>`;
    }

    function sim() {
      nodes.forEach(n => {
        if(n.fx!==undefined){n.x=n.fx;n.y=n.fy;n.vx=0;n.vy=0;return;}
        let fx=0,fy=0;
        nodes.forEach(o => {
          if(n===o) return;
          const dx=n.x-o.x, dy=n.y-o.y, d=Math.sqrt(dx*dx+dy*dy)||1;
          const r = (n.type==='category'||o.type==='category') ? sensitivity*1.5 : sensitivity;
          fx += dx/d*r/(d*d); fy += dy/d*r/(d*d);
        });
        links.forEach(l => {
          if(l.s===n||l.t===n){const o=l.s===n?l.t:l.s;const s=l.type==='cat-ch'?0.015:l.type==='ch-kw'?0.01:0.006;fx += (o.x-n.x)*s; fy += (o.y-n.y)*s;}
        });
        if (focusMode && selNode) {
          const con = getCon(selNode), isC=con.has(n.id), isS=n===selNode;
          const cx=(W/2-panX)/sc, cy=(H/2-panY)/sc;
          if (isS) { fx += (cx-n.x)*0.03; fy += (cy-n.y)*0.03; n.vx*=0.9; n.vy*=0.9; }
          else if (isC) {
            const cn = nodes.filter(c => con.has(c.id) && c !== selNode);
            const idx = cn.indexOf(n), orb = getOrb(n, selNode, idx, cn.length);
            const st = n.type==='category'?0.04:n.type==='channel'?0.03:0.02;
            fx += (orb.x-n.x)*st; fy += (orb.y-n.y)*st;
          } else {
            const dx=n.x-cx, dy=n.y-cy, d=Math.sqrt(dx*dx+dy*dy)||1;
            const pf = sensitivity*3/(d*d); fx += dx/d*Math.min(pf,8); fy += dy/d*Math.min(pf,8);
          }
        }
        n.vx=(n.vx+fx)*0.85; n.vy=(n.vy+fy)*0.85;
        n.x+=n.vx; n.y+=n.vy;
        n.x=Math.max(20,Math.min(W-20,n.x)); n.y=Math.max(20,Math.min(H-20,n.y));
      });
    }

    function draw() {
      ctx.clearRect(0,0,W,H);
      ctx.save(); ctx.translate(panX,panY); ctx.scale(sc,sc);
      const con = selNode ? getCon(selNode) : null;
      links.forEach(l => {
        if (!isVis(l.s)||!isVis(l.t)) return;
        const isCon = con && con.has(l.s.id) && con.has(l.t.id);
        const isSel = selNode && (l.s===selNode||l.t===selNode);
        ctx.globalAlpha = (!selNode||isCon) ? (isSel?0.8:0.25) : 0.05;
        ctx.strokeStyle = isSel ? '#4f46e5' : 'rgba(120,120,140,0.4)';
        ctx.lineWidth = isSel ? 2.5 : Math.min(1.5, l.v*0.3);
        ctx.beginPath(); ctx.moveTo(l.s.x,l.s.y); ctx.lineTo(l.t.x,l.t.y); ctx.stroke();
      });
      ctx.globalAlpha = 1;
      nodes.forEach(n => {
        if (!isVis(n)) return;
        const isSel=n===selNode, isCon=con&&con.has(n.id), faded=selNode&&!isSel&&!isCon;
        ctx.globalAlpha = faded?0.2:1;
        const r = isSel ? n.r*1.5 : n.r;
        if (n.type==='category') {
          ctx.beginPath(); ctx.arc(n.x,n.y,r,0,Math.PI*2);
          ctx.fillStyle=CAT_COLORS[n.group]||'#888'; ctx.fill();
          ctx.strokeStyle=isSel?'#121212':'#fff'; ctx.lineWidth=isSel?4:2; ctx.stroke();
          ctx.font=`bold ${Math.max(7,r*0.45)}px Outfit,sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#fff';
          ctx.fillText(n.id.slice(0,4), n.x, n.y);
        } else if (n.type==='channel') {
          const s=r*1.5, cx=n.x, cy=n.y;
          ctx.fillStyle=CAT_COLORS[n.group]||'#888';
          ctx.beginPath(); ctx.moveTo(cx-s+3,cy-s); ctx.lineTo(cx+s-3,cy-s);
          ctx.quadraticCurveTo(cx+s,cy-s,cx+s,cy-s+3);
          ctx.lineTo(cx+s,cy+s-3); ctx.quadraticCurveTo(cx+s,cy+s,cx+s-3,cy+s);
          ctx.lineTo(cx-s+3,cy+s); ctx.quadraticCurveTo(cx-s,cy+s,cx-s,cy+s-3);
          ctx.lineTo(cx-s,cy-s+3); ctx.quadraticCurveTo(cx-s,cy-s,cx-s+3,cy-s);
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle=isSel?'#121212':'#fff'; ctx.lineWidth=isSel?3.5:1.5; ctx.stroke();
          ctx.font=`bold ${Math.max(6,r*0.4)}px Outfit,sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#fff';
          ctx.fillText(n.id.length>8?n.id.slice(0,6)+'…':n.id, n.x, n.y);
        } else {
          ctx.beginPath(); ctx.arc(n.x,n.y,r,0,Math.PI*2);
          ctx.fillStyle=CAT_COLORS[n.group]||'#888'; ctx.fill();
          ctx.strokeStyle=isSel?'#121212':'#fff'; ctx.lineWidth=isSel?3.5:1.5; ctx.stroke();
          ctx.font=`${Math.max(6,r*0.4)}px Outfit,sans-serif`; ctx.textAlign='center'; ctx.textBaseline='top';
          ctx.fillStyle=faded?'rgba(0,0,0,0.2)':'#121212';
          ctx.fillText(n.id, n.x, n.y+r+2);
        }
        ctx.globalAlpha=1;
      });
      ctx.restore();
      requestAnimationFrame(()=>{sim();draw();});
    }
    updateLegend();
    draw();
  }

  // ── 상세 패널 함수들 ──
  function ytVidsByCh(ch) { return ytItems.filter(i => String(i.ChannelName).trim() === ch); }
  function ytVidsByKw(kw) { return ytItems.filter(i => String(i.Keywords||'').includes(kw) || String(i.Title||'').includes(kw)); }
  function ytVidsByCat(cat) { return ytItems.filter(i => String(i.Category).trim() === cat); }

  function showYtList(title, items) {
    const ec = document.getElementById('cn-yt-empty'), dc = document.getElementById('cn-yt-detail-content');
    if (!ec || !dc) return;
    ec.style.display='none'; dc.style.display='block';
    dc.innerHTML = `<div class="vlist-header"><span class="back" onclick="cnHideYtDetail()">←</span><span class="title">${title}</span><span class="count">${items.length}</span></div>
      ${items.slice(0,30).map((v,i) => `<div class="vitem" onclick="cnShowYtVid(${i})" data-ytidx="${i}">
        <div class="vitem-thumb"><img src="${v.Image_URL||''}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:6px;" onerror="this.style.display='none';this.parentNode.innerHTML='🎬'"></div>
        <div class="vitem-info"><div class="vitem-title">${v.Title||'제목 없음'}</div>
        <div class="vitem-meta"><span>${v.ChannelName||''}</span><span class="sep">·</span><span>${v.PublishDate||''}</span></div></div></div>`
      ).join('')}`;
    // Store items for detail view
    window._cnYtItems = items;
  }

  window.cnShowChVids = function(ch) {
    const items = ytVidsByCh(ch);
    showYtList(`📺 ${ch}`, items);
  };
  window.cnShowKwVids = function(kw) {
    const items = ytVidsByKw(kw);
    showYtList(`🔥 "${kw}" 관련 영상`, items);
  };
  window.cnShowCatVids = function(cat) {
    const items = ytVidsByCat(cat);
    showYtList(`🏷️ ${cat} 영상`, items);
  };
  window.cnShowYtVid = function(idx) {
    const v = window._cnYtItems?.[idx];
    if (!v) return;
    const dc = document.getElementById('cn-yt-detail-content');
    if (!dc) return;
    const imgHtml = v.Image_URL
      ? `<img src="${v.Image_URL}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;cursor:pointer;" onclick="window.open('${v.VideoURL||'#'}','_blank')" onerror="this.outerHTML='<div style=\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:30px;background:var(--bg);border:1px solid var(--border);border-radius:10px;\'>🎬</div>'">`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:30px;background:var(--bg);border:1px solid var(--border);border-radius:10px;">🎬</div>`;
    const isFav = isTrue(v.Favorite);
    const isRead = isTrue(v.Read);
    dc.innerHTML = `<div style="padding:16px;">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;cursor:pointer;font-size:11px;font-weight:700;color:var(--accent);" onclick="cnShowChVids('${(v.ChannelName||'').replace(/'/g,"\\'")}')">← ${v.ChannelName||''} 목록</div>
      <div style="width:100%;height:140px;margin-bottom:14px;">${imgHtml}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
        <a href="${v.VideoURL||'#'}" target="_blank" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;background:#ff0000;color:white;text-decoration:none;padding:8px 12px;border-radius:8px;font-size:11px;font-weight:700;">▶ YouTube</a>
        <button style="flex:1;display:flex;align-items:center;justify-content:center;gap:4px;background:${isRead?'#059669':'white'};color:${isRead?'white':'var(--text-primary)'};border:2px solid ${isRead?'#059669':'var(--border)'};padding:8px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;" onclick="cnMarkReadFromConnect('${v.ID}')">✓ ${isRead?'읽음':'읽음 처리'}</button>
        <button style="width:40px;display:flex;align-items:center;justify-content:center;background:${isFav?'rgba(251,191,36,0.2)':'white'};border:2px solid ${isFav?'#d97706':'var(--border)'};border-radius:8px;font-size:16px;cursor:pointer;" onclick="cnFavFromConnect('${v.ID}')">${isFav?'★':'☆'}</button>
      </div>
      <div style="font-size:15px;font-weight:800;margin-bottom:4px;line-height:1.4;">${v.Title||''}</div>
      <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:10px;">${v.ChannelName||''} · ${(v.PublishDate||'').substring(0,10)}</div>
      ${v.Category ? `<div style="display:flex;gap:4px;margin-bottom:12px;flex-wrap:wrap;"><span class="hot-tag" style="font-size:9px;padding:3px 8px;background:${CAT_COLORS[v.Category]||'#888'};color:white;border-color:transparent;">${v.Category}</span></div>` : ''}
      <div style="height:1px;background:var(--border);margin:12px 0;"></div>
      <div class="cn-detail-section"><div class="cn-dsec-h"><span class="cn-dsec-i" style="background:rgba(99,102,241,0.2);color:#4f46e5;">📄</span>요약 (Summary)</div><div class="cn-dsec-b">${v.Summary||'내용 없음'}</div></div>
      <div class="cn-detail-section"><div class="cn-dsec-h"><span class="cn-dsec-i" style="background:rgba(34,211,238,0.2);color:#0891b2;">📊</span>분석 (Analysis)</div><div class="cn-dsec-b">${v.Analysis||'내용 없음'}</div></div>
      <div class="cn-detail-section"><div class="cn-dsec-h"><span class="cn-dsec-i" style="background:rgba(52,211,153,0.2);color:#059669;">💡</span>인사이트 (Insights)</div><div class="cn-dsec-b">${v.Insights||'내용 없음'}</div></div>
      ${v.Implications ? `<div class="cn-detail-section"><div class="cn-dsec-h"><span class="cn-dsec-i" style="background:rgba(217,119,6,0.2);color:#d97706;">🔮</span>시사점 (Implications)</div><div class="cn-dsec-b">${v.Implications}</div></div>` : ''}
      ${renderCnTimeline(v.Timeline || v.timeline, v.VideoURL || '')}
    </div>`;
    // 저장소에 현재 항목 저장 (읽음/즐겨찾기 콜백용)
    window._cnCurrentVid = v;
  };
  function renderCnTimeline(timelineStr, videoUrl) {
    if (!timelineStr) return '';
    if (typeof parseTimeline !== 'function') return '';
    const chapters = parseTimeline(timelineStr);
    if (chapters.length === 0) return '';
    let html = `<div style="height:1px;background:var(--border);margin:12px 0;"></div>
      <div class="cn-detail-section"><div class="cn-dsec-h"><span class="cn-dsec-i" style="background:rgba(239,68,68,0.2);color:#dc2626;">⏱</span>타임라인 (Timeline)</div>
      <div class="cn-dsec-b" style="padding:8px 0;"><div class="timeline-list" style="display:flex;flex-direction:column;gap:8px;">`;
    chapters.forEach(ch => {
      let seconds = 0;
      if (typeof timestampToSeconds === 'function') {
        seconds = timestampToSeconds(ch.time);
      }
      html += `<div class="timeline-item" style="display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:1.5;padding:3px 0;">
        <span class="timeline-badge" style="background:#ef4444;color:white;padding:3px 7px;border-radius:5px;font-size:10px;font-weight:700;font-family:monospace;flex-shrink:0;cursor:pointer;" onclick="${videoUrl ? `window.open('${videoUrl}&t=${seconds}s','_blank')` : ''}">▶ ${ch.time}</span>
        <span style="color:var(--text-primary);font-weight:500;word-break:keep-all;">${ch.content}</span>
      </div>`;
    });
    html += `</div></div></div>`;
    return html;
  }
  window.cnMarkReadFromConnect = function(id) {
    const item = allData.find(d => String(d.ID) === String(id));
    if (item) { item.Read = true; window._cnCurrentVid = item; }
    const btn = event?.target?.closest?.('button');
    if (btn) { btn.style.background='#059669'; btn.style.color='white'; btn.style.borderColor='#059669'; btn.innerHTML='✓ 읽음'; }
  };
  window.cnFavFromConnect = function(id) {
    const item = allData.find(d => String(d.ID) === String(id));
    if (item) { item.Favorite = !isTrue(item.Favorite); window._cnCurrentVid = item; }
    const btn = event?.target?.closest?.('button');
    if (btn) { const f = isTrue(item?.Favorite); btn.style.background=f?'rgba(251,191,36,0.2)':'white'; btn.style.borderColor=f?'#d97706':'var(--border)'; btn.innerHTML=f?'★':'☆'; }
  };
  window.cnHideYtDetail = function() {
    const ec = document.getElementById('cn-yt-empty'), dc = document.getElementById('cn-yt-detail-content');
    if (ec) ec.style.display='flex'; if (dc) { dc.style.display='none'; dc.innerHTML=''; }
  };

  // ── GitHub 렌더링 ──
  function renderGh() {
    const rEl = document.getElementById('cn-gh-repos');
    if (rEl) {
      rEl.innerHTML = ghItems.slice(0,10).map(item =>
        `<div class="repo-card" onclick="cnShowGhDetail(${ghItems.indexOf(item)})">
          <div class="repo-card-name">${item.Title||'알 수 없음'}</div>
          <div class="repo-card-desc">${(item.Summary||'').slice(0,60)}</div>
          <div class="repo-card-meta">${String(item.Keywords||'').split(',').slice(0,2).map(k=>k.trim()).filter(Boolean).map(k =>
            `<span style="display:flex;align-items:center;gap:3px;"><span class="gh-lang-dot" style="background:${langColor(k)}"></span>${k}</span>`
          ).join('')}</div>
        </div>`
      ).join('');
    }

    const lEl = document.getElementById('cn-gh-lang');
    if (lEl && Object.keys(ghLangs).length > 0) {
      const sorted = Object.entries(ghLangs).sort((a,b)=>b[1]-a[1]);
      const max = sorted[0][1];
      lEl.innerHTML = sorted.map(([l,n]) =>
        `<div class="bar-row" style="cursor:default;"><span class="bar-label" style="width:70px;">${l}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${(n/max)*100}%;background:${GH_LANG_COLORS_NORM[l]||'#888'};">${n}</div></div></div>`
      ).join('');
    }

    // 별점 TOP (PublishDate 기준 최신순)
    const sEl = document.getElementById('cn-gh-stars');
    if (sEl) {
      const sorted = [...ghItems].sort((a,b) => String(b.PublishDate||'').localeCompare(String(a.PublishDate||'')));
      sEl.innerHTML = sorted.slice(0,5).map(item =>
        `<div class="bar-row" style="cursor:pointer;" onclick="cnShowGhDetail(${ghItems.indexOf(item)})">
          <div style="flex:1;min-width:0;"><div style="font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.Title||'알 수 없음'}</div>
          <div style="font-size:9px;color:var(--text-dim);font-weight:500;">${item.PublishDate||''}</div></div>
          <span style="font-size:9px;font-weight:700;color:var(--accent);flex-shrink:0;">${String(item.Keywords||'').split(',').length} topics</span>
        </div>`
      ).join('');
    }

    // GitHub 네트워크 그래프 (force-directed)
    const ghGraphCanvas = document.getElementById('cn-gh-graph-canvas');
    const ghGraphWrap = document.getElementById('cn-gh-graph-wrap');
    const ghGraphHint = document.getElementById('cn-gh-graph-hint');
    const ghGraphLegend = document.getElementById('cn-gh-graph-legend');
    if (!ghGraphCanvas || !ghGraphWrap || ghGraphWrap.clientWidth === 0) return;
    ghGraphCanvas.width = ghGraphWrap.clientWidth * 2; ghGraphCanvas.height = 380 * 2;
    ghGraphCanvas.style.width = ghGraphWrap.clientWidth+'px'; ghGraphCanvas.style.height = '380px';
    const ghctx = ghGraphCanvas.getContext('2d'); ghctx.scale(2,2);
    const GW = ghGraphWrap.clientWidth, GH = 380;
    const gcx = GW*0.5, gcy = GH*0.5;

    // Extract repos + their languages and topics
    const ghRepos = ghItems.slice(0,20).map((item, i) => {
      const kws = String(item.Keywords||'').split(',').map(k=>k.trim()).filter(Boolean);
      return { id: item.Title||'repo-'+i, item, langs: kws.filter(k => detectLang(k)), topics: kws.filter(k => !detectLang(k)) };
    });
    const allGhLangs = [...new Set(ghRepos.flatMap(r => r.langs))];
    const allGhTopics = [...new Set(ghRepos.flatMap(r => r.topics))].slice(0,30);

    // Nodes: languages (center), repos (mid), topics (outer)
    const glNodes = allGhLangs.map((l, i) => ({ id: l, type: 'lang', r: 16,
      x: gcx + Math.cos(i/allGhLangs.length*Math.PI*2)*GW*0.12 + (Math.random()-0.5)*6,
      y: gcy + Math.sin(i/allGhLangs.length*Math.PI*2)*GW*0.12 + (Math.random()-0.5)*6, vx:0, vy:0 }));
    const grNodes = ghRepos.map((r, i) => ({ id: r.id, type: 'repo', group: r.langs[0]||'기타', r: 8 + r.langs.length*2,
      x: gcx + Math.cos(i/ghRepos.length*Math.PI*2)*GW*0.28 + (Math.random()-0.5)*10,
      y: gcy + Math.sin(i/ghRepos.length*Math.PI*2)*GW*0.28 + (Math.random()-0.5)*10, vx:0, vy:0 }));
    const gtNodes = allGhTopics.map((t, i) => ({ id: t, type: 'topic', r: 5,
      x: gcx + Math.cos(i/allGhTopics.length*Math.PI*2)*GW*0.42 + (Math.random()-0.5)*16,
      y: gcy + Math.sin(i/allGhTopics.length*Math.PI*2)*GW*0.42 + (Math.random()-0.5)*16, vx:0, vy:0 }));
    const allGNodes = [...glNodes, ...grNodes, ...gtNodes];
    const gNodeMap = {}; allGNodes.forEach(n => gNodeMap[n.id] = n);

    // Build links: repo ↔ lang, repo ↔ topic
    const gLinks = [];
    ghRepos.forEach(r => {
      r.langs.forEach(l => { if (gNodeMap[r.id] && gNodeMap[l]) gLinks.push({ s: gNodeMap[r.id], t: gNodeMap[l], v: 2 }); });
      r.topics.forEach(t => { if (gNodeMap[r.id] && gNodeMap[t]) gLinks.push({ s: gNodeMap[r.id], t: gNodeMap[t], v: 1 }); });
    });

    if (allGNodes.length === 0) {
      if (ghGraphHint) ghGraphHint.textContent = '연결망 데이터가 부족합니다';
      return;
    }

    let gDragNode=null, gOffX=0, gOffY=0, gPanX=0, gPanY=0, gIsPan=false, gLmx=0, gLmy=0, gSc=1.0;
    const gSen = 180;
    function gm2w(e) { const r=ghGraphCanvas.getBoundingClientRect(); return {x:((e.clientX-r.left)*(GW/r.width)-gPanX)/gSc, y:((e.clientY-r.top)*(GH/r.height)-gPanY)/gSc}; }

    ghGraphCanvas.onwheel = e => {
      e.preventDefault();
      const r=ghGraphCanvas.getBoundingClientRect();
      const mx=(e.clientX-r.left)*(GW/r.width), my=(e.clientY-r.top)*(GH/r.height);
      const f=e.deltaY<0?1.12:0.88, ns=Math.max(0.2,Math.min(5,gSc*f));
      gPanX=mx-(mx-gPanX)*(ns/gSc); gPanY=my-(my-gPanY)*(ns/gSc); gSc=ns;
      if (ghGraphHint) ghGraphHint.textContent='🔍 '+Math.round(gSc*100)+'% · 휠 확대축소 · 저장소/언어 클릭';
    };
    ghGraphCanvas.onmousedown = e => {
      const w=gm2w(e); let c=null, md=20;
      allGNodes.forEach(n=>{const d=Math.sqrt((w.x-n.x)**2+(w.y-n.y)**2);if(d<md){md=d;c=n;}});
      if(c){gDragNode=c;gOffX=w.x-c.x;gOffY=w.y-c.y;c.fx=c.x;c.fy=c.y;return;}
      gIsPan=true;gLmx=e.clientX;gLmy=e.clientY;
    };
    ghGraphCanvas.onmousemove = e => {
      if(gDragNode){const w=gm2w(e);gDragNode.fx=w.x-gOffX;gDragNode.fy=w.y-gOffY;}
      if(gIsPan){gPanX+=(e.clientX-gLmx)*(GW/ghGraphCanvas.getBoundingClientRect().width);gPanY+=(e.clientY-gLmy)*(GH/ghGraphCanvas.getBoundingClientRect().height);gLmx=e.clientX;gLmy=e.clientY;}
    };
    ghGraphCanvas.onmouseup = () => {
      if(gDragNode){
        if(Math.abs(gDragNode.fx-gDragNode.x)<3) {
          const idx = ghRepos.findIndex(r => r.id === gDragNode.id);
          if (idx >= 0) cnShowGhDetail(ghItems.indexOf(ghRepos[idx].item));
        }
        gDragNode.fx=null; gDragNode.fy=null; gDragNode=null;
      }
      gIsPan=false;
    };
    ghGraphCanvas.onmouseleave = () => {if(gDragNode){gDragNode.fx=null;gDragNode.fy=null;gDragNode=null;}gIsPan=false;};

    // Legend
    if (ghGraphLegend) {
      const gLangColors = allGhLangs.map(l => `<span style="display:inline-flex;align-items:center;gap:3px;margin-right:6px;font-size:9px;font-weight:700;"><span style="width:8px;height:8px;border-radius:50%;background:${GH_LANG_COLORS_NORM[l]||'#888'};display:inline-block;"></span>${l}</span>`).join('');
      const gTopicTags = allGhTopics.slice(0,10).map(t => `<span style="display:inline-flex;align-items:center;gap:3px;margin-right:6px;font-size:9px;font-weight:600;color:#475569;">#${t}</span>`).join('');
      ghGraphLegend.innerHTML = `<div style="padding:6px 10px;font-size:9px;display:flex;flex-wrap:wrap;gap:3px;align-items:center;"><span style="font-weight:800;margin-right:4px;">●언어</span>${gLangColors}<span style="font-weight:800;margin:0 4px;">■저장소</span><span style="font-weight:800;margin:0 4px;">●토픽</span>${gTopicTags}</div>`;
    }

    function gsim() {
      allGNodes.forEach(n => {
        if(n.fx!==undefined){n.x=n.fx;n.y=n.fy;n.vx=0;n.vy=0;return;}
        let fx=0,fy=0;
        allGNodes.forEach(o => {
          if(n===o) return;
          const dx=n.x-o.x, dy=n.y-o.y, d=Math.sqrt(dx*dx+dy*dy)||1;
          fx += dx/d*gSen/(d*d); fy += dy/d*gSen/(d*d);
        });
        gLinks.forEach(l => {
          if(l.s===n||l.t===n){const o=l.s===n?l.t:l.s;const s=l.v===2?0.02:0.012;fx += (o.x-n.x)*s; fy += (o.y-n.y)*s;}
        });
        // Centering force
        fx += (gcx-n.x)*0.002; fy += (gcy-n.y)*0.002;
        n.vx=(n.vx+fx)*0.85; n.vy=(n.vy+fy)*0.85;
        n.x+=n.vx; n.y+=n.vy;
        n.x=Math.max(20,Math.min(GW-20,n.x)); n.y=Math.max(20,Math.min(GH-20,n.y));
      });
    }
    function gdraw() {
      ghctx.clearRect(0,0,GW,GH);
      ghctx.save(); ghctx.translate(gPanX,gPanY); ghctx.scale(gSc,gSc);
      gLinks.forEach(l => {
        ghctx.globalAlpha=0.2; ghctx.strokeStyle='rgba(120,120,140,0.4)'; ghctx.lineWidth=Math.min(1.5,l.v*0.3);
        ghctx.beginPath(); ghctx.moveTo(l.s.x,l.s.y); ghctx.lineTo(l.t.x,l.t.y); ghctx.stroke();
      });
      ghctx.globalAlpha=1;
      allGNodes.forEach(n => {
        const r = n.r;
        if (n.type==='lang') {
          ghctx.beginPath(); ghctx.arc(n.x,n.y,r,0,Math.PI*2);
          ghctx.fillStyle=GH_LANG_COLORS_NORM[n.id]||'#888'; ghctx.fill();
          ghctx.strokeStyle='#fff'; ghctx.lineWidth=2; ghctx.stroke();
          ghctx.font='bold 10px Outfit,sans-serif'; ghctx.textAlign='center'; ghctx.textBaseline='middle'; ghctx.fillStyle='#fff';
          ghctx.fillText(n.id.slice(0,4), n.x, n.y);
        } else if (n.type==='repo') {
          const s=r*1.3;
          ghctx.fillStyle='#4f46e5'; ghctx.beginPath(); ghctx.roundRect(n.x-s,n.y-s,s*2,s*2,4); ghctx.fill();
          ghctx.strokeStyle='#fff'; ghctx.lineWidth=1.5; ghctx.stroke();
          ghctx.font='bold 7px Outfit,sans-serif'; ghctx.textAlign='center'; ghctx.textBaseline='bottom';
          ghctx.fillStyle='#fff'; ghctx.fillText(n.id.length>12?n.id.slice(0,10)+'…':n.id, n.x, n.y+s+2);
        } else {
          ghctx.beginPath(); ghctx.arc(n.x,n.y,r,0,Math.PI*2);
          ghctx.fillStyle='#94a3b8'; ghctx.fill();
          ghctx.strokeStyle='#fff'; ghctx.lineWidth=1; ghctx.stroke();
          ghctx.font='7px Outfit,sans-serif'; ghctx.textAlign='center'; ghctx.textBaseline='top';
          ghctx.fillStyle='#475569'; ghctx.fillText(n.id.length>10?n.id.slice(0,8)+'…':n.id, n.x, n.y+r+2);
        }
      });
      ghctx.restore();
      requestAnimationFrame(()=>{gsim();gdraw();});
    }
    gdraw();
  }

  window.cnShowGhDetail = function(idx) {
    const item = ghItems[idx];
    if (!item) return;
    const ec = document.getElementById('cn-gh-empty'), dc = document.getElementById('cn-gh-detail-content');
    if (ec) ec.style.display='none'; if (dc) { dc.style.display='block';
      const kwHtml = String(item.Keywords||'').split(',').map(k=>k.trim()).filter(Boolean).slice(0,8).map(k =>
        `<span class="hot-tag" style="font-size:9px;padding:3px 8px;background:${langColor(k)};color:white;border-color:transparent;">${k}</span>`
      ).join('');
      const imgHtml = item.Image_URL
        ? `<img src="${item.Image_URL}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;" onerror="this.outerHTML='<div style=\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:30px;background:var(--bg);border-radius:10px;\'>📦</div>'">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:30px;background:var(--bg);border-radius:10px;">📦</div>`;
      dc.innerHTML = `<div style="padding:16px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;cursor:pointer;font-size:11px;font-weight:700;color:var(--accent);" onclick="cnHideGhDetail()">← 목록으로</div>
        <div style="width:100%;height:100px;margin-bottom:14px;">${imgHtml}</div>
        <div style="font-size:15px;font-weight:800;margin-bottom:4px;">${item.Title||''}</div>
        <div style="font-size:11px;color:var(--text-secondary);font-weight:500;margin-bottom:10px;">${(item.Summary||'').substring(0,120)}</div>
        ${kwHtml ? `<div style="display:flex;gap:4px;margin-bottom:12px;flex-wrap:wrap;">${kwHtml}</div>` : ''}
        <div style="height:1px;background:var(--border);margin:12px 0;"></div>
        <div class="cn-detail-section"><div class="cn-dsec-h"><span class="cn-dsec-i" style="background:rgba(99,102,241,0.2);color:#4f46e5;">📄</span>요약 (Summary)</div><div class="cn-dsec-b">${item.Summary||'내용 없음'}</div></div>
        <div class="cn-detail-section"><div class="cn-dsec-h"><span class="cn-dsec-i" style="background:rgba(52,211,153,0.2);color:#059669;">💡</span>인사이트 (Insights)</div><div class="cn-dsec-b">${item.Insights||'내용 없음'}</div></div>
        <div class="cn-detail-section"><div class="cn-dsec-h"><span class="cn-dsec-i" style="background:rgba(34,211,238,0.2);color:#0891b2;">📊</span>분석 (Analysis)</div><div class="cn-dsec-b">${item.Analysis||'분석 정보가 없습니다.'}</div></div>
      </div>`;
    }
  };
  window.cnHideGhDetail = function() {
    const ec = document.getElementById('cn-gh-empty'), dc = document.getElementById('cn-gh-detail-content');
    if (ec) ec.style.display='flex'; if (dc) { dc.style.display='none'; dc.innerHTML=''; }
  };

  // ── 실행 ──
  renderChBars();
  renderDonut();
  renderHot();
  renderFav();
  renderChFavRatio();
  renderYtGraph();
  renderGh();

  // ── 안읽음 토글 함수 ──
  window.cnToggleUnreadFilter = function() {
    window._cnFilterUnread = !window._cnFilterUnread;
    if (_cnCtx) {
      renderConnect(_cnCtx.container, { allData: _cnCtx.allData, githubData: _cnCtx.githubData });
    }
  };

  // ── 모드 전환 ──
  container.querySelectorAll('.connect-mode-btn').forEach(btn => {
    btn.onclick = () => {
      container.querySelectorAll('.connect-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      container.querySelectorAll('.connect-section').forEach(s => s.classList.remove('active'));
      document.getElementById(`connect-${mode}`).classList.add('active');
    };
  });
}

// 헬퍼
function isTrue(val) {
  return val === true || val === 'TRUE' || val === 'true' || val === 1 || val === '1';
}
