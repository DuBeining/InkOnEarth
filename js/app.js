// 1. 初始化底图
const STADIA_KEY = 'a31838ed-3a9d-453e-8eea-1dca4d8ffa6f';
const map = L.map('map').setView([34.0, 113.5], 5);

L.tileLayer(`https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key=${STADIA_KEY}`, {
  maxZoom: 20,
  attribution: '&copy; Stadia Maps & OpenMapTiles & OpenStreetMap'
}).addTo(map);

const drawingLayer = L.layerGroup().addTo(map);
let isAnimating = false;

// 书法色彩池（靛蓝、朱砂红、松石绿、紫苏）
const PALETTE = ['#1e40af', '#b91c1c', '#047857', '#6b21a8'];

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

  // 绑定气泡，允许鼠标随时悬停查看
  marker.bindTooltip(city.name, {
    permanent: false,
    direction: 'top',
    offset: [0, -6]
  });

  return marker;
}

// 核心书法运笔驱动
async function startWritingAnimation() {
  const routeList = (typeof SAVED_ROUTES !== 'undefined') ? SAVED_ROUTES : [];
  if (!routeList.length) {
    alert('未在 routes.js 中检测到汉字数据，请先在设计器中导出！');
    return;
  }

  if (isAnimating) return;
  isAnimating = true;
  document.getElementById('playBtn').disabled = true;
  drawingLayer.clearLayers();

  // 1. 镜头自适应对准所有字
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

        // 1. 开始画本线段：立即弹开当前段起点城市名称
        currentSegStartMarker.openTooltip();
        
        // 捕获当前段起点引用，在 1s 后自动关闭气泡
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
          await sleep(30); // 每帧间隔 30ms
        }

        // 3. 笔锋抵达本段终点：放置终点城市 marker
        const nextMarker = drawCityPoint(cities[i + 1], themeColor);

        // 如果到达的是整笔画的最后一个终点城市，立即打开并在 2s 后关闭
        if (isLastSegmentOfStroke) {
          nextMarker.openTooltip();
          setTimeout(() => {
            nextMarker.closeTooltip();
          }, 2000);
        }

        // 该终点城市作为下一条线段的起点
        currentSegStartMarker = nextMarker;
      }

      // 笔画起落之间的自然呼吸停顿（等终点稍微展示完再起下一笔）
      await sleep(1000);
    }

    await sleep(1000); // 字与字之间的间隔
  }

  document.getElementById('status').innerHTML = '书写完成';
  isAnimating = false;
  document.getElementById('playBtn').disabled = false;
}