const STADIA_KEY = 'a31838ed-3a9d-453e-8eea-1dca4d8ffa6f';
const map = L.map('map').setView([34.0, 113.5], 4);
L.tileLayer(`https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key=${STADIA_KEY}`, {
  maxZoom: 20,
  attribution: '&copy; Stadia Maps & OpenMapTiles & OpenStreetMap'
}).addTo(map);

let currentStrokePaths = [];
let centerLatLng = [34.0, 113.5];
let currentExportItem = null;
const layerGroup = L.layerGroup().addTo(map);

map.on('click', e => {
  centerLatLng = [e.latlng.lat, e.latlng.lng];
  updateMapping();
});

// 遍历城市库，通过欧氏距离快速寻找节点
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
// Douglas-Peucker 算法
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

// 映射函数：将字的坐标投影到地图并吸附城市
function updateMapping() {
  if (!currentStrokePaths.length) return;
  layerGroup.clearLayers();

  const span = parseFloat(document.getElementById('spanRange').value);
  const tolerance = parseFloat(document.getElementById('toleranceRange').value);
  const [cLat, cLng] = centerLatLng;
  const latCorrection = Math.cos(cLat * Math.PI / 180); // 墨卡托投影的纬度矫正

  const hLng = span / 2, hLat = (span / 2) / latCorrection;
  L.rectangle([[cLat - hLat, cLng - hLng], [cLat + hLat, cLng + hLng]], {
    color: '#0066ff', weight: 1.5, dashArray: '4, 4', fill: false
  }).addTo(layerGroup);
  L.marker([cLat, cLng]).addTo(layerGroup);

  const strokesData = [];

  currentStrokePaths.forEach((path, strokeIdx) => {
    const totalLen = path.getTotalLength();
    if (!totalLen) return;

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
      } // 相邻城市的去重
    });

    if (idealPts.length >= 2) {
      L.polyline(idealPts, { color: '#ff6666', weight: 1.5, dashArray: '3, 4', opacity: 0.6 }).addTo(layerGroup);
    } // 绘制描红

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

  const currentChar = document.getElementById('charInput').value.trim();
  currentExportItem = { char: currentChar, strokes: strokesData };

  const listEl = document.getElementById('routeList'); // 更新左侧列表面板
  if (listEl) {
    listEl.innerHTML = strokesData.length ? strokesData.map(s => `
      <div style="margin-bottom: 6px;">
        <strong style="color: #0055ff;">第 ${s.strokeNum} 笔:</strong><br>
        ${s.cities.map(c => c.name).join(' ➔ ')}
      </div>
    `).join('') : '<i>未生成有效连线</i>';
  }
}

// 导出至剪贴板：基于 localStorage 实现多字追加与同名字覆盖
function exportToRoutesJson() {
  if (!currentExportItem || !currentExportItem.strokes.length) {
    alert('当前没有可导出的笔画轨迹！');
    return;
  }

  const pool = JSON.parse(localStorage.getItem('ink_routes_cache') || '[]');
  const existIdx = pool.findIndex(item => item.char === currentExportItem.char);

  if (existIdx >= 0) {
    pool[existIdx] = currentExportItem;
  } else {
    pool.push(currentExportItem);
  }

  localStorage.setItem('ink_routes_cache', JSON.stringify(pool));
  const fileContent = `const SAVED_ROUTES = ${JSON.stringify(pool, null, 2)};\n`;

  navigator.clipboard.writeText(fileContent).then(() => {
    alert(`「${currentExportItem.char}」已追加（共 ${pool.length} 字）！代码已复制到剪贴板。`);
  });
}

function clearSavedRoutes() {
  if (!confirm('确定清空已存汉字轨迹？')) return;
  localStorage.removeItem('ink_routes_cache');
  currentExportItem = null;
  updateMapping();
  alert('已清空缓存');
}

window.onload = renderHanziOnMap;
