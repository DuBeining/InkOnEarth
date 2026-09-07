const STADIA_KEY = 'a31838ed-3a9d-453e-8eea-1dca4d8ffa6f';
const map = L.map('map').setView([34.0, 113.5], 4);
L.tileLayer(`https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key=${STADIA_KEY}`, {
  maxZoom: 20,
  attribution: '&copy; Stadia Maps & OpenMapTiles & OpenStreetMap'
}).addTo(map);

let currentStrokePaths = [];
let centerLatLng = [34.0, 113.5];
const layerGroup = L.layerGroup().addTo(map);

// 缓存当前正在编辑的字与其全部轨迹数据
let currentExportItem = null;

// 从缓存中恢复历史已导出的多字列表（保证多次导出不丢失）
let savedRoutes = JSON.parse(localStorage.getItem('ink_routes_cache') || '[]');
let fileHandle = null; // 用于保持本地 routes.json 文件句柄

map.on('click', e => {
  centerLatLng = [e.latlng.lat, e.latlng.lng];
  updateMapping();
});

function findNearestCity(targetLat, targetLng) {
  let nearest = null, minDist = Infinity;
  for (let i = 0; i < CHINA_CITIES.length; i++) {
    const [name, lat, lng] = CHINA_CITIES[i];
    const dLat = targetLat - lat, dLng = targetLng - lng;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < minDist) {
      minDist = dist;
      nearest = { name, coords: [lat, lng] };
    }
  }
  return nearest;
}

async function renderHanziOnMap() {
  const char = document.getElementById('charInput').value.trim();
  if (!char) return;

  try {
    const res = await fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/${encodeURIComponent(char)}.json`);
    const data = await res.json();
    if (!data.medians) return;

    const svgNS = "http://www.w3.org/2000/svg";
    currentStrokePaths = data.medians.map(pts => {
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' '));
      return path;
    });

    updateMapping();
  } catch (err) {
    console.error(err);
  }
}

function simplifyPoints(points, tolerance) {
  if (points.length <= 2) return points;
  const sqTol = tolerance * tolerance;

  function getSqDist(p, p1, p2) {
    let x = p1[0], y = p1[1], dx = p2[0] - x, dy = p2[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = p2[0]; y = p2[1]; }
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p[0] - x; dy = p[1] - y;
    return dx * dx + dy * dy;
  }

  function step(first, last, res) {
    let maxDist = sqTol, index = -1;
    for (let i = first + 1; i < last; i++) {
      const dist = getSqDist(points[i], points[first], points[last]);
      if (dist > maxDist) { index = i; maxDist = dist; }
    }
    if (maxDist > sqTol) {
      if (index - first > 1) step(first, index, res);
      res.push(points[index]);
      if (last - index > 1) step(index, last, res);
    }
  }

  const res = [points[0]];
  step(0, points.length - 1, res);
  res.push(points[points.length - 1]);
  return res;
}

function updateMapping() {
  if (!currentStrokePaths.length) return;
  layerGroup.clearLayers();

  const span = parseFloat(document.getElementById('spanRange').value);
  const tolerance = parseFloat(document.getElementById('toleranceRange').value);
  const [cLat, cLng] = centerLatLng;
  const latCorrection = Math.cos(cLat * Math.PI / 180);

  // 辅助外框与中心点
  const hLng = span / 2, hLat = (span / 2) / latCorrection;
  L.rectangle([[cLat - hLat, cLng - hLng], [cLat + hLat, cLng + hLng]], {
    color: '#0066ff', weight: 1.5, dashArray: '4, 4', fill: false
  }).addTo(layerGroup);
  L.marker([cLat, cLng]).addTo(layerGroup);

  const strokesData = [];

  currentStrokePaths.forEach((path, strokeIdx) => {
    const totalLen = path.getTotalLength();
    if (!totalLen) return;

    // 等距密集采样并用 Douglas-Peucker 提纯骨架
    const densePts = [];
    for (let i = 0; i <= 35; i++) {
      const pt = path.getPointAtLength((i / 35) * totalLen);
      densePts.push([pt.x, pt.y]);
    }
    const simplified = simplifyPoints(densePts, tolerance);

    const idealPts = [];
    const matchedCities = [];

    simplified.forEach(pt => {
      const u = (pt[0] - 512) / 1024;
      const v = (pt[1] - 512) / 1024;
      const lat = cLat + (v * span) / latCorrection;
      const lng = cLng + u * span;
      idealPts.push([lat, lng]);

      const city = findNearestCity(lat, lng);
      if (city && (!matchedCities.length || matchedCities[matchedCities.length - 1].name !== city.name)) {
        matchedCities.push(city);
      }
    });

    if (idealPts.length >= 2) {
      L.polyline(idealPts, { color: '#ff6666', weight: 1.5, dashArray: '3, 4', opacity: 0.6 }).addTo(layerGroup);
    }

    if (matchedCities.length >= 2) {
      L.polyline(matchedCities.map(c => c.coords), {
        color: '#0055ff', weight: 4, opacity: 0.9, lineCap: 'round', lineJoin: 'round'
      }).addTo(layerGroup);

      matchedCities.forEach(city => {
        L.circleMarker(city.coords, { radius: 5, color: '#0033aa', fillColor: '#fff', fillOpacity: 1, weight: 2 })
          .addTo(layerGroup)
          .bindTooltip(city.name, { direction: 'top', offset: [0, -6] });
      });

      strokesData.push({
        strokeNum: strokeIdx + 1,
        cities: matchedCities.map(c => ({ name: c.name, coords: c.coords }))
      });
    }
  });

  // 更新当前待导出的完整字形对象
  const currentChar = document.getElementById('charInput').value.trim();
  currentExportItem = { char: currentChar, strokes: strokesData };

  // 更新左侧列表 UI
  const listEl = document.getElementById('routeList');
  if (listEl) {
    listEl.innerHTML = strokesData.length ? strokesData.map(s => `
      <div style="margin-bottom: 6px;">
        <strong style="color: #0055ff;">第 ${s.strokeNum} 笔:</strong><br>
        ${s.cities.map(c => c.name).join(' ➔ ')}
      </div>
    `).join('') : '<i>未生成有效连线</i>';
  }
}

function exportToRoutesJson() {
  if (!currentExportItem || !currentExportItem.strokes.length) {
    alert('当前没有可导出的笔画轨迹！');
    return;
  }

  // 1. 读取已有的数据池（如果引入了 routes.js 则以 SAVED_ROUTES 为准，否则用本地缓存）
  let pool = (typeof SAVED_ROUTES !== 'undefined' && SAVED_ROUTES.length > 0) 
    ? SAVED_ROUTES 
    : JSON.parse(localStorage.getItem('ink_routes_cache') || '[]');

  // 2. 查重合并：已有同名汉字则更新，没有则追加
  const existIdx = pool.findIndex(item => item.char === currentExportItem.char);
  if (existIdx >= 0) {
    pool[existIdx] = currentExportItem;
  } else {
    pool.push(currentExportItem);
  }

  // 3. 保持内存与缓存同步
  localStorage.setItem('ink_routes_cache', JSON.stringify(pool));
  if (typeof SAVED_ROUTES !== 'undefined') {
    SAVED_ROUTES.length = 0;
    SAVED_ROUTES.push(...pool);
  }

  // 4. 生成可直接粘贴回 routes.js 的标准代码
  const fileContent = `const SAVED_ROUTES = ${JSON.stringify(pool, null, 2)};\n`;

  // 自动写入剪贴板
  navigator.clipboard.writeText(fileContent).then(() => {
    alert(`「${currentExportItem.char}」已追加！当前共 ${pool.length} 个汉字。\n\n最新 routes.js 内容已自动复制到剪贴板，直接粘贴覆盖 routes.js 即可。`);
  }).catch(() => {
    const blob = new Blob([fileContent], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'routes.js';
    a.click();
  });
}

window.onload = renderHanziOnMap;