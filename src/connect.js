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
const GH_LANG_COLORS = {
  'Python':'#3572A5','TypeScript':'#3178C6','JavaScript':'#f7df1e','Rust':'#dea584',
  'Go':'#00ADD8','Swift':'#F05138','Kotlin':'#A97BFF','C++':'#f34b7d','Java':'#b07219','Ruby':'#701516',
};
const AVATAR_PALETTE = ['#e8590c','#6d28d9','#0d7a6a','#b45309','#0891b2','#047857','#9333ea','#d97706','#0f766e','#a16207','#be123c'];

function hashColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

// ─── 메인 렌더러 ───
export function renderConnect(container, { allData, githubData }) {

  // ── 데이터 가공 ──
  const ytItems = allData.filter(d => d.ID);
  const ghItems = githubData.filter(d => d.ID);

  // YouTube: 채널/카테고리/키워드 추출
  const chData = {};
  ytItems.forEach(item => {
    const ch = String(item.ChannelName || '알 수 없음').trim();
    const cat = String(item.Category || '기타').trim();
    const kws = String(item.Keywords || '').split(',').map(k => k.trim()).filter(Boolean);
    if (!chData[ch]) chData[ch] = { count: 0, cats: {}, kw: [] };
    chData[ch].count++;
    if (cat) chData[ch].cats[cat] = (chData[ch].cats[cat] || 0) + 1;
    kws.forEach(k => { if (!chData[ch].kw.includes(k)) chData[ch].kw.push(k); });
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
      if (GH_LANG_COLORS[k]) ghLangs[k] = (ghLangs[k]||0) + 1;
      else ghTopics[k] = (ghTopics[k]||0) + 1;
    });
  });

  // ── HTML 빌드 ──
  container.innerHTML = `
    <div class="connect-wrap">
      <!-- Mode Toggle -->
      <div class="connect-mode-toggle">
        <div class="connect-mode-btn active" data-mode="yt">▶ 유튜브 요약</div>
        <div class="connect-mode-btn" data-mode="gh">◆ GitHub Trending</div>
      </div>

      <div class="connect-section active" id="connect-yt">
        <div class="connect-stats card">
          <div class="stats-row-4">
            <div class="stat-item"><div class="stat-num accent">${sortedChs.length}</div><div class="stat-label">구독 채널</div></div>
            <div class="stat-item"><div class="stat-num" style="color:#b45309;">TODO%</div><div class="stat-label">안읽음 비율</div></div>
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
            <div class="stat-item"><div class="stat-num" style="color:#0d7a6a;">TODO</div><div class="stat-label">분석 완료</div></div>
            <div class="stat-item"><div class="stat-num" style="color:#6d28d9;">${Object.keys(ghLangs).length + Object.keys(ghTopics).length}</div><div class="stat-label">주요 토픽</div></div>
            <div class="stat-item"><div class="stat-num accent">0</div><div class="stat-label">이번주 신규</div></div>
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
              <div class="card-h"><span class="card-h-icon">🔥</span> 트렌딩 저장소 <span class="badge">오늘</span></div>
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
        <img src="https://ui-avatars.com/api?name=${encodeURIComponent(name)}&background=${hashColor(name).replace('#','')}&color=fff&size=32&bold=true" class="ch-avatar-img" alt="">
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

    // Build nodes
    const catNodes = allCats.map(c => ({ id: c, type: 'category', group: c, r: 12,
      x: W*(0.1+Math.random()*0.8), y: H*(0.1+Math.random()*0.8), vx:0, vy:0 }));
    const chNodes = sortedChs.slice(0,12).map(([ch]) => ({ id: ch, type: 'channel', group: chPriCat[ch]||'기타', r: 6 + (chData[ch].count)*0.5,
      x: W*(0.1+Math.random()*0.8), y: H*(0.1+Math.random()*0.8), vx:0, vy:0 }));
    const kwNodes = allKws.slice(0,40).map(k => ({ id: k, type: 'keyword', group: kwCat[k]||'기타', r: 3 + (kwCount[k]||1)*2,
      x: W*(0.1+Math.random()*0.8), y: H*(0.1+Math.random()*0.8), vx:0, vy:0 }));

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
        <div class="vitem-thumb">🎬</div>
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
    dc.innerHTML = `<div style="padding:14px;">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;cursor:pointer;font-size:10px;font-weight:700;color:var(--accent);" onclick="cnShowChVids('${(v.ChannelName||'').replace(/'/g, "\\'")}')">← ${v.ChannelName||''} 목록</div>
      <div style="width:100%;height:90px;background:var(--bg);border:var(--border);display:flex;align-items:center;justify-content:center;font-size:26px;margin-bottom:8px;">🎬</div>
      <div style="font-size:13px;font-weight:800;margin-bottom:2px;line-height:1.3;">${v.Title||''}</div>
      <div style="font-size:10px;font-weight:700;color:var(--accent);margin-bottom:6px;">${v.ChannelName||''} · ${v.PublishDate||''}</div>
      <div style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;">
        ${v.Category ? `<span class="hot-tag" style="font-size:8px;padding:2px 6px;background:${CAT_COLORS[v.Category]||'#888'};color:white;border-color:transparent;">${v.Category}</span>` : ''}
      </div>
      <div style="height:1px;background:#e2e2e8;margin:8px 0;"></div>
      <div style="font-size:10px;color:var(--text-dim);font-weight:500;line-height:1.6;">${v.Summary ? (v.Summary.length > 200 ? v.Summary.slice(0,200)+'...' : v.Summary) : '요약 없음'}</div>
    </div>`;
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
            `<span style="display:flex;align-items:center;gap:3px;"><span class="gh-lang-dot" style="background:${GH_LANG_COLORS[k]||'#888'}"></span>${k}</span>`
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
          <div class="bar-track"><div class="bar-fill" style="width:${(n/max)*100}%;background:${GH_LANG_COLORS[l]||'#888'};">${n}</div></div></div>`
      ).join('');
    }
  }

  window.cnShowGhDetail = function(idx) {
    const item = ghItems[idx];
    if (!item) return;
    const ec = document.getElementById('cn-gh-empty'), dc = document.getElementById('cn-gh-detail-content');
    if (ec) ec.style.display='none'; if (dc) { dc.style.display='block';
      dc.innerHTML = `<div style="padding:14px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;cursor:pointer;font-size:10px;font-weight:700;color:var(--accent);" onclick="cnHideGhDetail()">← 목록으로</div>
        <div style="width:100%;height:80px;background:var(--bg);border:var(--border);display:flex;align-items:center;justify-content:center;font-size:24px;">📦</div>
        <div style="font-size:13px;font-weight:800;margin:8px 0 2px;">${item.Title||''}</div>
        <div style="font-size:10px;color:var(--text-dim);font-weight:500;margin-bottom:6px;">${(item.Summary||'').slice(0,100)}</div>
        <div style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap;">${String(item.Keywords||'').split(',').slice(0,5).map(k=>k.trim()).filter(Boolean).map(k =>
          `<span class="hot-tag" style="font-size:8px;padding:2px 8px;background:${GH_LANG_COLORS[k]||'#888'};color:white;border-color:transparent;">${k}</span>`
        ).join('')}</div>
        <div style="height:1px;background:#e2e2e8;margin:8px 0;"></div>
        <div style="font-size:10px;color:var(--text-dim);font-weight:500;line-height:1.6;">${item.Analysis||'분석 정보가 없습니다.'}</div>
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
  renderYtGraph();
  renderGh();

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
