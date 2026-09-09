const STADIA_KEY = 'a31838ed-3a9d-453e-8eea-1dca4d8ffa6f';
const map = L.map('map').setView([34.0, 113.5], 5);

L.tileLayer(`https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key=${STADIA_KEY}`, {
  maxZoom: 20,
  attribution: '&copy; Stadia Maps & OpenMapTiles & OpenStreetMap'
}).addTo(map);

const drawingLayer = L.layerGroup().addTo(map);
let isAnimating = false;

const PALETTE = [
  '#1e40af', // 1. 黛蓝
  '#b91c1c', // 2. 朱砂
  '#047857', // 3. 翡翠
  '#b45309', // 4. 琥珀
  '#6b21a8', // 5. 紫苏
  '#0e7490', // 6. 苍蓝
  '#c2410c', // 7. 赭石
  '#0f766e', // 8. 松石
  '#be185d', // 9. 胭脂
  '#1f2937'  // 10. 焦墨
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function resetCanvas() {
  drawingLayer.clearLayers();
  document.getElementById('status').innerHTML = '就绪';
  isAnimating = false;
  document.getElementById('playBtn').disabled = false;
}

// 绘制城市节点并返回 marker 实例
function drawCityPoint(city, color) {
  const marker = L.circleMarker(city.coords, {
    radius: 4.5,
    color: color,
    fillColor: '#ffffff',
    fillOpacity: 1,
    weight: 2
  }).addTo(drawingLayer);

  // 绑定气泡，允许鼠标悬停查看
  marker.bindTooltip(city.name, {
    permanent: false,
    direction: 'top',
    offset: [0, -6]
  });

  return marker;
}

async function startWritingAnimation() {
  const routeList = (typeof SAVED_ROUTES !== 'undefined') ? SAVED_ROUTES : [];
  if (!routeList.length) {
    alert('未在 routes.js 中检测到汉字数据，请先导出！');
    return;
  }

  if (isAnimating) return;
  isAnimating = true;
  document.getElementById('playBtn').disabled = true;
  drawingLayer.clearLayers();

  // 1. 镜头对准
  const allCoords = [];
  routeList.forEach(item => {
    item.strokes.forEach(s => s.cities.forEach(c => allCoords.push(c.coords)));
  });
  if (allCoords.length) {
    map.fitBounds(L.latLngBounds(allCoords), { padding: [80, 80], animate: true, duration: 1.2 });
    await sleep(1300);
  }

  // 2. 逐字、逐笔运笔
  for (let charIdx = 0; charIdx < routeList.length; charIdx++) {
    const charData = routeList[charIdx];
    const themeColor = PALETTE[charIdx % PALETTE.length];
    const statusEl = document.getElementById('status');

    for (let strokeIdx = 0; strokeIdx < charData.strokes.length; strokeIdx++) {
      const stroke = charData.strokes[strokeIdx];
      const cities = stroke.cities;
      if (cities.length < 2) continue;

      statusEl.innerHTML = `正在书写：<b>${charData.char}</b> (第 ${stroke.strokeNum} 笔)`;

      // 创建当前笔画的连线
      const animatedPolyline = L.polyline([cities[0].coords], {
        color: themeColor,
        weight: 4,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(drawingLayer);

      // 维护当前线段的起点 marker（整笔第一个点）
      let currentSegStartMarker = drawCityPoint(cities[0], themeColor);

      // 逐线段运笔（每一段都有自己的起点与终点）
      for (let i = 0; i < cities.length - 1; i++) {
        const start = cities[i].coords;
        const end = cities[i + 1].coords;
        const isLastSegmentOfStroke = (i === cities.length - 2); // 是否是整笔的最后一段

        // 1. 开始画本线段
        currentSegStartMarker.openTooltip();
        
        const segStartToHide = currentSegStartMarker;
        setTimeout(() => {
          segStartToHide.closeTooltip();
        }, 1000);  

        // 2. 本线段平滑插值向前延伸
        const FRAMES = 12;
        for (let f = 1; f <= FRAMES; f++) {
          const curLat = start[0] + (end[0] - start[0]) * (f / FRAMES);
          const curLng = start[1] + (end[1] - start[1]) * (f / FRAMES);
          animatedPolyline.addLatLng([curLat, curLng]);
          await sleep(30); // 画线速度（帧率）
        }

        // 3. 笔锋抵达本段终点：放置终点城市 marker
        const nextMarker = drawCityPoint(cities[i + 1], themeColor);

        if (isLastSegmentOfStroke) {
          nextMarker.openTooltip();
          setTimeout(() => {
            nextMarker.closeTooltip();
          }, 2000);
        }

        // 该终点城市作为下一条线段的起点
        currentSegStartMarker = nextMarker;
      }

      await sleep(1000); // 笔画起落之间的停顿
    }

    await sleep(1000); // 字与字之间的间隔
  }

  document.getElementById('status').innerHTML = '书写完成';
  isAnimating = false;
  document.getElementById('playBtn').disabled = false;
}
