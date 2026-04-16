/**
 * 3D场景管理器 - Three.js房间式场景 + 格子移动
 * 最小几何 + 氛围渲染（灯光/雾是灵魂）
 */

const SceneManager = (() => {
  let scene, camera, renderer;
  let currentRoom = null;
  let gridObjects = [];
  let sceneObjects = [];
  let playerMesh = null;
  let playerPos = { x: 0, z: 0 }; // 格子坐标
  let cellSize = 2; // 每格世界单位大小
  let animating = false;

  // ========== 绿色轨迹线 + 点击移动 ==========
  let pathLine = null;           // THREE.Line 绿色路径
  let pathTarget = null;         // {x, z} 目标格子（点击移动时设置）
  let pathHighlight = null;      // 目标格子高亮mesh
  let playerModel = null;        // GLB模型（monster.glb）
  let playerMixer = null;        // AnimationMixer
  let playerActions = {};        // 动作名→AnimationAction
  let currentAction = 'idle';    // 当前播放的动作
  let clock = null;              // THREE.Clock（init时创建）
  
  // 灯光系统引用（init和applyAtmosphere中赋值）
  let ambientLightBase = null;   // 基础环境光引用
  let hemiLightBase = null;      // 基础半球光引用

  // ========== 场景模板定义 ==========
  const ROOM_TEMPLATES = {
    corridor: {
      name: '走廊',
      minWidth: 1, maxWidth: 2,
      minHeight: 3, maxHeight: 8,
      wallHeight: 3,
      floorColor: 0x909090,
      wallColor: 0xa0a0a0,
      ambientIntensity: 0.15,
      fogDensity: 0.03
    },
    room_small: {
      name: '小房间',
      minWidth: 3, maxWidth: 4,
      minHeight: 3, maxHeight: 4,
      wallHeight: 3,
      floorColor: 0x909090,
      wallColor: 0xa0a0a0,
      ambientIntensity: 0.2,
      fogDensity: 0.025
    },
    room_medium: {
      name: '中房间',
      minWidth: 4, maxWidth: 6,
      minHeight: 4, maxHeight: 6,
      wallHeight: 3.5,
      floorColor: 0x888888,
      wallColor: 0x989898,
      ambientIntensity: 0.25,
      fogDensity: 0.020
    },
    room_large: {
      name: '大厅',
      minWidth: 6, maxWidth: 10,
      minHeight: 6, maxHeight: 10,
      wallHeight: 4,
      floorColor: 0x858585,
      wallColor: 0x959595,
      ambientIntensity: 0.2,
      fogDensity: 0.025
    },
    library: {
      name: '图书馆',
      minWidth: 5, maxWidth: 7,
      minHeight: 5, maxHeight: 7,
      wallHeight: 3.5,
      floorColor: 0x8a8a8a,
      wallColor: 0x9a9a9a,
      ambientIntensity: 0.25,
      fogDensity: 0.020
    },
    basement: {
      name: '地下室',
      minWidth: 3, maxWidth: 6,
      minHeight: 3, maxHeight: 6,
      wallHeight: 2.5,
      floorColor: 0x7a7a7a,
      wallColor: 0x8a8a8a,
      ambientIntensity: 0.1,
      fogDensity: 0.035
    },
    ritual: {
      name: '仪式室',
      minWidth: 4, maxWidth: 6,
      minHeight: 4, maxHeight: 6,
      wallHeight: 4,
      floorColor: 0x7a7a7a,
      wallColor: 0x8a8a8a,
      ambientIntensity: 0.15,
      fogDensity: 0.030
    }
  };

  // 场景对象模板（带战斗属性+交互提示+可操作动作）
  const OBJECT_TEMPLATES = {
    table: { name: '桌子', cover: 1, blockMove: true, blockLOS: false, hp: 15, color: 0x5a3a1a, hint: '🔍 调查桌子', actions: ['investigate'] },
    chair: { name: '椅子', cover: 0, blockMove: true, blockLOS: false, hp: 8, color: 0x4a2a0a, actions: ['investigate'] },
    bookshelf: { name: '书架', cover: 2, blockMove: true, blockLOS: true, hp: 20, color: 0x3a2010, hint: '📚 搜索书架', actions: ['investigate', 'search'] },
    pillar: { name: '柱子', cover: 2, blockMove: true, blockLOS: true, hp: 999, color: 0x555555 },
    crate: { name: '箱子', cover: 1, blockMove: true, blockLOS: false, hp: 12, color: 0x6a4a2a, hint: '📦 打开箱子', actions: ['investigate', 'open'] },
    barrel: { name: '桶', cover: 1, blockMove: true, blockLOS: false, hp: 10, color: 0x5a3a1a, hint: '🔍 检查桶', actions: ['investigate'] },
    altar: { name: '祭坛', cover: 2, blockMove: true, blockLOS: true, hp: 999, color: 0x2a1a2a, hint: '⚠️ 调查祭坛', actions: ['investigate'] },
    door: { name: '门', cover: 1, blockMove: true, blockLOS: false, hp: 15, color: 0x4a3a2a, hint: '🚪 打开门', actions: ['open', 'investigate'], isOpen: false },
    lamp: { name: '灯', cover: 0, blockMove: false, blockLOS: false, hp: 3, color: 0xccaa44, isLight: true, hint: '💡 开灯', actions: ['toggle_light'], isOn: false },
    statue: { name: '雕像', cover: 2, blockMove: true, blockLOS: true, hp: 999, color: 0x444444, hint: '🗿 查看雕像', actions: ['investigate'] },
    rug: { name: '地毯', cover: 0, blockMove: false, blockLOS: false, hp: 5, color: 0x6a2a2a, hint: '🔍 翻开地毯', actions: ['investigate', 'search'] },
    painting: { name: '画作', cover: 0, blockMove: false, blockLOS: false, hp: 3, color: 0x554433, isWall: true, hint: '🖼️ 查看画作', actions: ['investigate'] },
    candle: { name: '蜡烛', cover: 0, blockMove: false, blockLOS: false, hp: 1, color: 0xeecc66, isLight: true, hint: '🕯️ 点燃', actions: ['toggle_light'], isOn: false },
    desk: { name: '书桌', cover: 1, blockMove: true, blockLOS: false, hp: 15, color: 0x4a3018, hint: '📝 查看书桌', actions: ['investigate', 'search'] },
    bed: { name: '床', cover: 1, blockMove: true, blockLOS: false, hp: 15, color: 0x3a3a4a, hint: '🔍 检查床铺', actions: ['investigate', 'search'] },
    wardrobe: { name: '衣柜', cover: 2, blockMove: true, blockLOS: true, hp: 18, color: 0x3a2818, hint: '🗄️ 打开衣柜', actions: ['investigate', 'open'] },
    fireplace: { name: '壁炉', cover: 1, blockMove: true, blockLOS: false, hp: 999, color: 0x2a2a2a, isLight: true, hint: '🔥 生火', actions: ['toggle_light', 'investigate'], isOn: false },
    chest: { name: '宝箱', cover: 1, blockMove: true, blockLOS: false, hp: 14, color: 0x6a4a1a, hint: '📦 打开宝箱', actions: ['investigate', 'open'] },
    skeleton: { name: '骸骨', cover: 0, blockMove: false, blockLOS: false, hp: 1, color: 0xccccaa, hint: '💀 检查骸骨', actions: ['investigate'] },
    mirror: { name: '镜子', cover: 0, blockMove: false, blockLOS: false, hp: 2, color: 0x8899aa, isWall: true, hint: '🪞 照镜子', actions: ['investigate'] }
  };

  // ========== 初始化 ==========
  let controls = null; // CameraControls实例

  function init(container) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a14);

    // 确保容器有尺寸
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    if (w === 0 || h === 0) {
      console.warn('SceneManager: container has zero size, deferring init');
      return;
    }

    // 相机 - 斜45度等距视角
    camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.set(8, 10, 8);
    camera.lookAt(0, 0, 0);

    // 渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.8;
    container.appendChild(renderer.domElement);

    // 初始化相机控制器（缩放/旋转/平移）
    if (typeof CameraControls !== 'undefined') {
      controls = CameraControls.init(camera, renderer.domElement);
      controls.setSpherical(14, Math.PI / 4, Math.PI / 4);
    }

    // 响应窗口大小
    window.addEventListener('resize', () => {
      const newW = container.clientWidth || window.innerWidth;
      const newH = container.clientHeight || window.innerHeight;
      if (newW === 0 || newH === 0) return; // 容器不可见时跳过
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
      // 竖屏时调整相机视角：更陡的俯角以看清房间
      if (controls) {
        const isPortrait = newH > newW;
        if (isPortrait) {
          const maxDim = currentRoom ? Math.max(currentRoom.width || 5, currentRoom.height || 5) : 5;
          const dist = Math.max(8, maxDim * 1.8);
          controls.setSpherical(dist, Math.PI / 3, Math.PI / 4); // 更陡的俯角
        }
      }
    });

    // 环境光（适度基础照明，保证场景可见）
    const ambient = new THREE.AmbientLight(0x8888aa, 0.6);
    scene.add(ambient);
    ambientLightBase = ambient; // 保存引用，开灯时动态调整

    // 半球光补充环境（天空冷光+地面暗光）
    const hemiLight = new THREE.HemisphereLight(0x6666aa, 0x222233, 0.5);
    scene.add(hemiLight);
    hemiLightBase = hemiLight; // 保存引用

    // 默认雾（暗色，营造氛围）
    scene.fog = new THREE.FogExp2(0x0a0a14, 0.02);

    // 创建玩家标记
    createPlayerMesh();

    // Clock用于AnimationMixer
    clock = new THREE.Clock();

    // 初始化物件标签叠加层
    initLabels(container);

    // 3D场景点击事件：raycast检测格子，点击显示轨迹线/移动
    initGridClick(container);

    // 开始渲染循环
    animate();
  }

  function createPlayerMesh() {
    const group = new THREE.Group();

    // 身体 - 简单圆柱
    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.35, 1.0, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc9a04e, roughness: 0.7 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.7;
    body.castShadow = true;
    group.add(body);

    // 头部 - 球体
    const headGeo = new THREE.SphereGeometry(0.25, 8, 6);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.6 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.45;
    head.castShadow = true;
    group.add(head);

    // 底部圆环指示器
    const ringGeo = new THREE.RingGeometry(0.35, 0.45, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xc9a04e, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    group.add(ring);

    playerMesh = group;
    scene.add(playerMesh);
  }

  // ========== 构建房间 ==========
  function buildRoom(template, width, height, objects, atmosphere) {
    clearRoom();

    const tpl = ROOM_TEMPLATES[template] || ROOM_TEMPLATES.room_medium;
    const w = width || Math.floor(Math.random() * (tpl.maxWidth - tpl.minWidth + 1)) + tpl.minWidth;
    const h = height || Math.floor(Math.random() * (tpl.maxHeight - tpl.minHeight + 1)) + tpl.minHeight;
    const wallH = tpl.wallHeight;

    // 战斗空间保证：最小4×4
    const combatW = Math.max(w, 4);
    const combatH = Math.max(h, 4);

    currentRoom = { template, width: combatW, height: combatH, wallHeight: wallH, objects: [] };

    // 地板（程序化纹理）
    const floorGeo = new THREE.PlaneGeometry(combatW * cellSize, combatH * cellSize);
    const floorTex = generateFloorTexture(template, 99);
    floorTex.repeat.set(combatW, combatH);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      color: 0xdddddd,
      roughness: 0.8,
      metalness: 0.05,
      emissive: tpl.floorColor,
      emissiveIntensity: 0.12
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    gridObjects.push(floor);
    floorMesh = floor; // 保存引用，用于raycast点击检测

    // 格子线
    drawGrid(combatW, combatH);

    // 墙壁（传入模板类型用于纹理风格）
    buildWalls(combatW, combatH, wallH, tpl.wallColor, template);

    // 氛围设置
    applyAtmosphere(atmosphere || tpl);

    // 放置场景对象
    if (objects) {
      objects.forEach(obj => placeObjectInternal(obj));
    } else {
      // 自动放置一些装饰
      autoDecorate(combatW, combatH, template);
    }

    // 重置玩家位置到房间中心
    playerPos = { x: Math.floor(combatW / 2), z: Math.floor(combatH / 2) };
    updatePlayerWorldPos();

    // 相机居中到房间中心
    centerCameraOnRoom(combatW, combatH);

    return currentRoom;
  }

  function centerCameraOnRoom(w, h) {
    const centerX = 0; // 房间中心在世界原点
    const centerZ = 0;
    // 根据房间大小和屏幕方向调整相机距离
    const maxDim = Math.max(w || 5, h || 5);
    const container = renderer?.domElement?.parentElement;
    const isPortrait = container ? (container.clientHeight > container.clientWidth) : false;
    const dist = isPortrait
      ? Math.max(8, maxDim * 1.8)  // 竖屏：更近以看清
      : Math.max(10, maxDim * 2.0);
    const phi = isPortrait ? Math.PI / 3 : Math.PI / 4; // 竖屏更陡俯角
    if (controls) {
      controls.setTarget(centerX, 0, centerZ);
      controls.setSpherical(dist, phi, Math.PI / 4);
    } else {
      const halfDist = dist * Math.SQRT1_2;
      camera.position.set(centerX + halfDist, halfDist, centerZ + halfDist);
      camera.lookAt(centerX, 0, centerZ);
    }
  }

  function drawGrid(w, h) {
    const gridMat = new THREE.LineBasicMaterial({ color: 0x333344, transparent: true, opacity: 0.3 });
    const halfW = (w * cellSize) / 2;
    const halfH = (h * cellSize) / 2;

    for (let i = 0; i <= w; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-halfW + i * cellSize, 0.01, -halfH),
        new THREE.Vector3(-halfW + i * cellSize, 0.01, halfH)
      ]);
      const line = new THREE.Line(geo, gridMat);
      scene.add(line);
      gridObjects.push(line);
    }

    for (let j = 0; j <= h; j++) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-halfW, 0.01, -halfH + j * cellSize),
        new THREE.Vector3(halfW, 0.01, -halfH + j * cellSize)
      ]);
      const line = new THREE.Line(geo, gridMat);
      scene.add(line);
      gridObjects.push(line);
    }
  }

  // ========== 程序化墙面纹理生成器 ==========
  const WALL_TEXTURE_STYLES = {
    // 旧宅：剥落灰泥+裂缝
    old_house: { base: '#8a8070', stain: '#6a6050', crack: '#3a3530', brickChance: 0.15, stainChance: 0.3, crackChance: 0.1 },
    // 走廊：深色壁纸+水渍
    corridor: { base: '#5a5550', stain: '#4a4540', crack: '#3a3530', brickChance: 0, stainChance: 0.4, crackChance: 0.05 },
    // 图书馆：深木镶板
    library: { base: '#3a2a1a', stain: '#2a1a0a', crack: '#1a1008', brickChance: 0, stainChance: 0.1, crackChance: 0.02, panelLines: true },
    // 地下室：粗糙石砖+潮湿
    basement: { base: '#5a5a5a', stain: '#3a4a3a', crack: '#2a2a2a', brickChance: 0.6, stainChance: 0.5, crackChance: 0.2 },
    // 仪式室：暗红石墙+符文痕迹
    ritual: { base: '#4a2a2a', stain: '#3a1a1a', crack: '#2a0a0a', brickChance: 0.4, stainChance: 0.2, crackChance: 0.15, runeChance: 0.05 },
    // 默认：普通灰墙
    default: { base: '#909090', stain: '#808080', crack: '#606060', brickChance: 0, stainChance: 0.1, crackChance: 0.02 }
  };

  // 纹理缓存，避免重复生成
  const wallTextureCache = {};

  function generateWallTexture(styleName, seed) {
    const cacheKey = styleName + '_' + seed;
    if (wallTextureCache[cacheKey]) return wallTextureCache[cacheKey];

    const style = WALL_TEXTURE_STYLES[styleName] || WALL_TEXTURE_STYLES.default;
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // 伪随机数生成器（基于seed）
    let rng = seed | 0;
    function rand() { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; }

    // 基础颜色
    ctx.fillStyle = style.base;
    ctx.fillRect(0, 0, size, size);

    // 砖块纹理
    if (style.brickChance > 0) {
      const brickH = 16;
      const brickW = 32;
      for (let row = 0; row < size / brickH; row++) {
        const offset = (row % 2) * brickW / 2;
        for (let col = -1; col < size / brickW + 1; col++) {
          if (rand() > style.brickChance) continue;
          const x = col * brickW + offset;
          const y = row * brickH;
          // 砖缝
          ctx.strokeStyle = style.crack;
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, brickW, brickH);
          // 砖块颜色变化
          const brightness = 0.85 + rand() * 0.3;
          ctx.fillStyle = style.base;
          ctx.globalAlpha = brightness;
          ctx.fillRect(x + 1, y + 1, brickW - 2, brickH - 2);
          ctx.globalAlpha = 1;
        }
      }
    }

    // 木镶板线条（图书馆风格）
    if (style.panelLines) {
      ctx.strokeStyle = style.stain;
      ctx.lineWidth = 2;
      // 竖线
      for (let x = 0; x < size; x += 64) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
      }
      // 横线（上下镶板）
      ctx.beginPath(); ctx.moveTo(0, size * 0.3); ctx.lineTo(size, size * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, size * 0.7); ctx.lineTo(size, size * 0.7); ctx.stroke();
    }

    // 水渍/污渍
    for (let i = 0; i < 20; i++) {
      if (rand() > style.stainChance) continue;
      const x = rand() * size;
      const y = rand() * size;
      const r = 10 + rand() * 30;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, style.stain);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.3 + rand() * 0.4;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
    }

    // 裂缝
    for (let i = 0; i < 8; i++) {
      if (rand() > style.crackChance) continue;
      ctx.strokeStyle = style.crack;
      ctx.lineWidth = 0.5 + rand() * 1.5;
      ctx.beginPath();
      let cx = rand() * size, cy = rand() * size;
      ctx.moveTo(cx, cy);
      for (let j = 0; j < 5; j++) {
        cx += (rand() - 0.5) * 30;
        cy += rand() * 20;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }

    // 符文痕迹（仪式室）
    if (style.runeChance) {
      for (let i = 0; i < 5; i++) {
        if (rand() > style.runeChance) continue;
        const rx = rand() * size;
        const ry = rand() * size;
        ctx.strokeStyle = '#8a2a2a';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;
        // 简单符文形状
        ctx.beginPath();
        ctx.arc(rx, ry, 5 + rand() * 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(rx - 5, ry); ctx.lineTo(rx + 5, ry);
        ctx.moveTo(rx, ry - 5); ctx.lineTo(rx, ry + 5);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // 噪点
    const imgData = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const noise = (rand() - 0.5) * 15;
      imgData.data[i] = Math.max(0, Math.min(255, imgData.data[i] + noise));
      imgData.data[i+1] = Math.max(0, Math.min(255, imgData.data[i+1] + noise));
      imgData.data[i+2] = Math.max(0, Math.min(255, imgData.data[i+2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    wallTextureCache[cacheKey] = texture;
    return texture;
  }

  // ========== 程序化地板纹理生成器 ==========
  const FLOOR_TEXTURE_STYLES = {
    old_house: { base: '#5a4030', plank: true, plankColor: '#4a3520', gapColor: '#2a1a10' },
    corridor: { base: '#4a3a2a', plank: true, plankColor: '#3a2a1a', gapColor: '#1a1008' },
    library: { base: '#3a2818', plank: true, plankColor: '#2a1a0a', gapColor: '#1a0a00' },
    basement: { base: '#4a4a4a', plank: false, stone: true, stoneColor: '#3a3a3a', gapColor: '#2a2a2a' },
    ritual: { base: '#3a2a2a', plank: false, stone: true, stoneColor: '#2a1a1a', gapColor: '#1a0a0a' },
    default: { base: '#5a5040', plank: true, plankColor: '#4a4030', gapColor: '#2a2010' }
  };

  const floorTextureCache = {};

  function generateFloorTexture(template, seed) {
    const cacheKey = 'floor_' + template + '_' + seed;
    if (floorTextureCache[cacheKey]) return floorTextureCache[cacheKey];

    const style = FLOOR_TEXTURE_STYLES[template] || FLOOR_TEXTURE_STYLES.default;
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    let rng = seed | 0;
    function rand() { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; }

    ctx.fillStyle = style.base;
    ctx.fillRect(0, 0, size, size);

    if (style.plank) {
      // 木地板
      const plankW = 32;
      for (let x = 0; x < size; x += plankW) {
        // 木板颜色变化
        const brightness = 0.8 + rand() * 0.4;
        ctx.fillStyle = style.plankColor;
        ctx.globalAlpha = brightness;
        ctx.fillRect(x, 0, plankW - 1, size);
        ctx.globalAlpha = 1;
        // 板缝
        ctx.fillStyle = style.gapColor;
        ctx.fillRect(x + plankW - 1, 0, 1, size);
        // 木纹
        ctx.strokeStyle = style.gapColor;
        ctx.globalAlpha = 0.15;
        ctx.lineWidth = 0.5;
        for (let y = 0; y < size; y += 4 + rand() * 8) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + plankW - 1, y + (rand() - 0.5) * 4);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    } else if (style.stone) {
      // 石板地面
      const tileW = 48;
      const tileH = 48;
      for (let row = 0; row < size / tileH; row++) {
        const offset = (row % 2) * tileW / 2;
        for (let col = -1; col < size / tileW + 1; col++) {
          const x = col * tileW + offset;
          const y = row * tileH;
          const brightness = 0.85 + rand() * 0.3;
          ctx.fillStyle = style.stoneColor;
          ctx.globalAlpha = brightness;
          ctx.fillRect(x + 1, y + 1, tileW - 2, tileH - 2);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = style.gapColor;
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, tileW, tileH);
        }
      }
    }

    // 噪点
    const imgData = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const noise = (rand() - 0.5) * 12;
      imgData.data[i] = Math.max(0, Math.min(255, imgData.data[i] + noise));
      imgData.data[i+1] = Math.max(0, Math.min(255, imgData.data[i+1] + noise));
      imgData.data[i+2] = Math.max(0, Math.min(255, imgData.data[i+2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    floorTextureCache[cacheKey] = texture;
    return texture;
  }

  // 场景类型→纹理风格映射
  function getWallStyleForTemplate(template) {
    const map = {
      corridor: 'corridor',
      room_small: 'old_house',
      room_medium: 'old_house',
      room_large: 'old_house',
      library: 'library',
      basement: 'basement',
      ritual: 'ritual'
    };
    return map[template] || 'default';
  }

  function buildWalls(w, h, wallH, color, template) {
    const halfW = (w * cellSize) / 2;
    const halfH = (h * cellSize) / 2;

    // 根据场景类型生成墙面纹理
    const styleName = getWallStyleForTemplate(template);
    const wallTexture = generateWallTexture(styleName, 42);
    wallTexture.repeat.set(w, 1); // 水平重复按房间宽度

    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTexture,
      color: 0xdddddd, // 纹理着色，略亮让纹理可见
      roughness: 0.85,
      metalness: 0.02,
      emissive: color,
      emissiveIntensity: 0.12
    });

    // 四面墙
    const walls = [
      { w: w * cellSize, h: wallH, pos: [0, wallH/2, -halfH], rot: [0, 0, 0], face: 'front' },
      { w: w * cellSize, h: wallH, pos: [0, wallH/2, halfH], rot: [0, Math.PI, 0], face: 'back' },
      { w: h * cellSize, h: wallH, pos: [-halfW, wallH/2, 0], rot: [0, Math.PI/2, 0], face: 'left' },
      { w: h * cellSize, h: wallH, pos: [halfW, wallH/2, 0], rot: [0, -Math.PI/2, 0], face: 'right' }
    ];

    walls.forEach(wallDef => {
      const geo = new THREE.PlaneGeometry(wallDef.w, wallDef.h);
      // 每面墙用不同seed的纹理
      const tex = generateWallTexture(styleName, 42 + walls.indexOf(wallDef) * 7);
      tex.repeat.set(wallDef.w / cellSize, 1);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        color: 0xdddddd,
        roughness: 0.85,
        metalness: 0.02,
        emissive: color,
        emissiveIntensity: 0.12
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...wallDef.pos);
      mesh.rotation.set(...wallDef.rot);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      gridObjects.push(mesh);
    });

    // 在前墙中间添加门框
    addDoorToWall(halfH, wallH, 'front');
  }

  // 在墙上添加门框3D模型
  function addDoorToWall(halfH, wallH, face) {
    const doorGroup = new THREE.Group();
    const doorW = 1.0;
    const doorH = 2.2;

    // 门框（深色木框，左右+顶部）
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.7, metalness: 0.05 });
    // 左框
    const leftFrame = new THREE.Mesh(new THREE.BoxGeometry(0.1, doorH + 0.2, 0.12), frameMat);
    leftFrame.position.set(-doorW / 2 - 0.05, (doorH + 0.2) / 2, 0);
    doorGroup.add(leftFrame);
    // 右框
    const rightFrame = new THREE.Mesh(new THREE.BoxGeometry(0.1, doorH + 0.2, 0.12), frameMat);
    rightFrame.position.set(doorW / 2 + 0.05, (doorH + 0.2) / 2, 0);
    doorGroup.add(rightFrame);
    // 顶框
    const topFrame = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.2, 0.1, 0.12), frameMat);
    topFrame.position.set(0, doorH + 0.15, 0);
    doorGroup.add(topFrame);

    // 门板（浅色木门）
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.75, metalness: 0.02 });
    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.06), doorMat);
    doorPanel.position.set(0, doorH / 2, 0.03);
    doorPanel.name = 'doorPanel';
    doorGroup.add(doorPanel);

    // 门把手
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xccaa66, roughness: 0.3, metalness: 0.8 });
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), handleMat);
    handle.position.set(doorW / 2 - 0.12, doorH / 2, 0.07);
    doorGroup.add(handle);

    // 放置在前墙中间
    doorGroup.position.set(0, 0, -halfH + 0.01);

    scene.add(doorGroup);
    gridObjects.push(doorGroup);
  }

  function applyAtmosphere(atm) {
    // 雾（适度密度，营造氛围但保证视野）
    scene.fog = new THREE.FogExp2(0x0a0a14, Math.max(atm.fogDensity || 0.015, 0.010));

    // 主光源（模拟房间顶灯/窗光，适度强度）
    mainLightRef = new THREE.PointLight(
      atm.lightColor || 0xffeedd,
      Math.min(atm.lightIntensity || 1.0, 2.0) * 2.0,  // 提高强度以确保可见
      atm.lightRange || 30
    );
    mainLightRef.position.set(0, (atm.wallHeight || 3) - 0.5, 0);
    mainLightRef.castShadow = true;
    mainLightRef.shadow.mapSize.width = 512;
    mainLightRef.shadow.mapSize.height = 512;
    scene.add(mainLightRef);
    gridObjects.push(mainLightRef);

    // 环境光（适度照明）
    ambientLightRef = new THREE.AmbientLight(0x8888aa, Math.min(atm.ambientIntensity || 0.3, 0.8) * 2.0);
    scene.add(ambientLightRef);
    gridObjects.push(ambientLightRef);
  }

  // ========== 房间交互系统V1辅助函数 ==========
  function getObjAliases(type, name) {
    const map = {
      lamp: ['灯', '油灯', '台灯', '电灯', '照明装置'],
      candle: ['蜡烛', '烛', '烛台'],
      fireplace: ['壁炉', '火炉', '炉', '火', '生火处', '火堆'],
      door: ['门', '大门', '房门', '木门'],
      table: ['桌子', '木桌', '桌案'],
      desk: ['书桌', '桌', '写字台'],
      chair: ['椅子', '椅'],
      bookshelf: ['书架', '架子'],
      chest: ['宝箱', '箱子'],
      crate: ['木箱', '箱子', '盒子'],
      barrel: ['桶', '木桶'],
      altar: ['祭坛', '神坛'],
      statue: ['雕像', '塑像'],
      bed: ['床', '床铺'],
      wardrobe: ['衣柜', '柜', '衣橱'],
      rug: ['地毯', '毯子'],
      painting: ['画作', '画', '油画'],
      mirror: ['镜子', '镜'],
      skeleton: ['骸骨', '骷髅', '骨头', '尸体'],
      pillar: ['柱子', '柱']
    };
    return map[type] || [name || type];
  }

  function getObjAvailableActions(type, tpl) {
    const actions = [];
    if (tpl.isLight) {
      actions.push('inspect');
      actions.push('toggle_light');
    }
    if (type === 'door') {
      actions.push('inspect');
      actions.push('open');
    }
    if (tpl.actions) {
      for (const a of tpl.actions) {
        if (!actions.includes(a)) actions.push(a);
      }
    }
    if (actions.length === 0) actions.push('investigate');
    return actions;
  }

  // ========== 场景对象（内部） ==========
  function placeObjectInternal(objDef) {
    const tpl = OBJECT_TEMPLATES[objDef.type] || OBJECT_TEMPLATES.crate;
    const group = new THREE.Group();

    let mesh;
    switch (objDef.type) {
      case 'table':
        mesh = createBox(1.6, 0.8, 0.9, tpl.color);
        mesh.position.y = 0.45;
        break;
      case 'chair':
        mesh = createBox(0.5, 0.9, 0.5, tpl.color);
        mesh.position.y = 0.45;
        break;
      case 'bookshelf':
        mesh = createBox(1.2, 2.2, 0.5, tpl.color);
        mesh.position.y = 1.1;
        break;
      case 'pillar':
        mesh = createCylinder(0.4, currentRoom.wallHeight, tpl.color);
        mesh.position.y = currentRoom.wallHeight / 2;
        break;
      case 'crate':
        mesh = createBox(0.8, 0.8, 0.8, tpl.color);
        mesh.position.y = 0.4;
        break;
      case 'barrel':
        mesh = createCylinder(0.4, 0.9, tpl.color);
        mesh.position.y = 0.45;
        break;
      case 'altar':
        mesh = createBox(1.4, 0.9, 0.9, tpl.color);
        mesh.position.y = 0.45;
        break;
      case 'lamp':
        mesh = createCylinder(0.1, 0.3, tpl.color);
        mesh.position.y = 1.5;
        // 灯光源（初始关闭，需要开灯才亮）— 增强强度和范围
        const light = new THREE.PointLight(0xffdd88, 0, 18);
        light.position.y = 1.8;
        light.name = 'objectLight';
        light.castShadow = true;
        light.shadow.mapSize.width = 256;
        light.shadow.mapSize.height = 256;
        group.add(light);
        // 灯罩发光球（开灯时显示）
        const lampGlow = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0 })
        );
        lampGlow.position.y = 1.7;
        lampGlow.name = 'glowMesh';
        group.add(lampGlow);
        break;
      case 'candle':
        mesh = createCylinder(0.05, 0.25, 0xeebb55);
        mesh.position.y = 0.85;
        // 蜡烛光源（初始关闭）— 增强范围
        const candleLight = new THREE.PointLight(0xff9944, 0, 10);
        candleLight.position.y = 1.05;
        candleLight.name = 'objectLight';
        group.add(candleLight);
        // 烛焰发光球
        const candleGlow = new THREE.Mesh(
          new THREE.SphereGeometry(0.06, 6, 4),
          new THREE.MeshBasicMaterial({ color: 0xff9944, transparent: true, opacity: 0 })
        );
        candleGlow.position.y = 1.0;
        candleGlow.name = 'glowMesh';
        group.add(candleGlow);
        break;
      case 'statue':
        mesh = createCylinder(0.3, 1.8, tpl.color);
        mesh.position.y = 0.9;
        const head = new THREE.SphereGeometry(0.25, 6, 4);
        const headMesh = new THREE.Mesh(head, new THREE.MeshStandardMaterial({ color: tpl.color, roughness: 0.8 }));
        headMesh.position.y = 1.95;
        group.add(headMesh);
        break;
      case 'rug':
        mesh = createBox(2.0, 0.02, 1.5, tpl.color);
        mesh.position.y = 0.01;
        break;
      case 'painting':
        mesh = createBox(1.0, 0.7, 0.05, tpl.color);
        mesh.position.y = 2.0;
        break;
      case 'desk':
        mesh = createBox(1.4, 0.75, 0.7, tpl.color);
        mesh.position.y = 0.375;
        break;
      case 'bed':
        mesh = createBox(1.8, 0.5, 2.0, tpl.color);
        mesh.position.y = 0.25;
        break;
      case 'wardrobe':
        mesh = createBox(1.0, 2.0, 0.6, tpl.color);
        mesh.position.y = 1.0;
        break;
      case 'fireplace':
        mesh = createBox(1.4, 1.2, 0.5, tpl.color);
        mesh.position.y = 0.6;
        // 壁炉光源（初始关闭）— 大范围暖光
        const fireLight = new THREE.PointLight(0xff6622, 0, 22);
        fireLight.position.y = 1.0;
        fireLight.name = 'objectLight';
        fireLight.castShadow = true;
        fireLight.shadow.mapSize.width = 256;
        fireLight.shadow.mapSize.height = 256;
        group.add(fireLight);
        // 火焰发光效果
        const fireGlow = new THREE.Mesh(
          new THREE.SphereGeometry(0.3, 6, 4),
          new THREE.MeshBasicMaterial({ color: 0xff6622, transparent: true, opacity: 0 })
        );
        fireGlow.position.y = 0.9;
        fireGlow.name = 'glowMesh';
        group.add(fireGlow);
        break;
      case 'chest':
        mesh = createBox(0.9, 0.6, 0.6, tpl.color);
        mesh.position.y = 0.3;
        // 箱盖
        const lid = createBox(0.9, 0.1, 0.6, 0x7a5a2a);
        lid.position.y = 0.55;
        group.add(lid);
        break;
      case 'skeleton':
        // 骨盆
        mesh = createBox(0.3, 0.15, 0.2, tpl.color);
        mesh.position.y = 0.15;
        // 脊椎
        const spine = createCylinder(0.05, 0.5, tpl.color);
        spine.position.y = 0.5;
        group.add(spine);
        // 头骨
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshStandardMaterial({ color: tpl.color, roughness: 0.9 }));
        skull.position.y = 0.8;
        group.add(skull);
        break;
      case 'mirror':
        mesh = createBox(0.8, 1.2, 0.05, tpl.color);
        mesh.position.y = 1.8;
        break;
      case 'door':
        // 门框（深色木框）
        const doorFrame = createBox(1.0, 2.4, 0.12, 0x2a1a0a);
        doorFrame.position.y = 1.2;
        group.add(doorFrame);
        // 门板（浅色木门）
        mesh = createBox(0.85, 2.1, 0.06, tpl.color);
        mesh.position.y = 1.15;
        // 门把手
        const handle = createCylinder(0.04, 0.04, 0xccaa66);
        handle.rotation.z = Math.PI / 2;
        handle.position.set(0.3, 1.1, 0.05);
        group.add(handle);
        break;
      default:
        mesh = createBox(0.6, 0.6, 0.6, tpl.color);
        mesh.position.y = 0.3;
    }

    if (mesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    // 格子坐标转世界坐标
    const worldPos = gridToWorld(objDef.x, objDef.z);
    group.position.copy(worldPos);

    // 墙壁物件贴墙
    if (tpl.isWall && currentRoom) {
      const halfW = (currentRoom.width * cellSize) / 2;
      const halfH = (currentRoom.height * cellSize) / 2;
      // 贴最近的墙
      const distToNegZ = Math.abs(group.position.z - (-halfH));
      const distToPosZ = Math.abs(group.position.z - halfH);
      const distToNegX = Math.abs(group.position.x - (-halfW));
      const distToPosX = Math.abs(group.position.x - halfW);
      const minDist = Math.min(distToNegZ, distToPosZ, distToNegX, distToPosX);
      if (minDist === distToNegZ) { group.position.z = -halfH + 0.05; }
      else if (minDist === distToPosZ) { group.position.z = halfH - 0.05; }
      else if (minDist === distToNegX) { group.position.x = -halfW + 0.05; group.rotation.y = Math.PI / 2; }
      else { group.position.x = halfW - 0.05; group.rotation.y = Math.PI / 2; }
    }

    scene.add(group);
    // 从SceneCompiler获取交互元数据（如果可用），否则用默认值
    const compilerDefaults = (typeof SceneCompiler !== 'undefined' && SceneCompiler.TYPE_DEFAULTS[objDef.type])
      ? SceneCompiler.TYPE_DEFAULTS[objDef.type]
      : null;
    const objState = {
      id: `${objDef.type}_${objDef.x}_${objDef.z}`,
      group,
      type: objDef.type,
      gridX: objDef.x,
      gridZ: objDef.z,
      ...tpl,
      hp: tpl.hp,
      isOn: tpl.isLight ? (tpl.isOn !== undefined ? tpl.isOn : false) : (tpl.isOpen || false),
      // 交互元数据（方案C：位置驱动动作校验需要）
      role: compilerDefaults?.role || (tpl.isLight ? 'light_source' : 'atmosphere'),
      interactMeta: {
        actions: compilerDefaults?.actions || tpl.actions || ['investigate'],
        requiredRange: compilerDefaults?.requiredRange || 1.5,
        needsLOS: compilerDefaults?.needsLOS || false
      },
      // 房间交互系统V1所需元数据
      aliases: getObjAliases(objDef.type, tpl.name),
      availableActions: getObjAvailableActions(objDef.type, tpl),
      interactionRange: compilerDefaults?.requiredRange || 1.5
    };
    sceneObjects.push(objState);
    // 灯光对象：保存lightRef/glowRef引用，避免后续每次切换都搜索children
    if (objState.isLight) {
      objState.lightRef = group.children.find(c => c.isLight && c.name === 'objectLight') || null;
      objState.glowRef  = group.children.find(c => c.name === 'glowMesh') || null;
      // 如果初始就是亮的，设置PointLight强度
      if (objState.isOn) {
        if (objState.lightRef) {
          objState.lightRef.intensity = objState.type === 'lamp' ? 5.0 : objState.type === 'candle' ? 3.0 : objState.type === 'fireplace' ? 7.0 : 4.0;
        }
        if (objState.glowRef) objState.glowRef.material.opacity = 0.9;
      }
    }
  }

  function createBox(w, h, d, color) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1 });
    return new THREE.Mesh(geo, mat);
  }

  function createCylinder(r, h, color) {
    const geo = new THREE.CylinderGeometry(r, r, h, 8);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.1 });
    return new THREE.Mesh(geo, mat);
  }

  function autoDecorate(w, h, template) {
    const decorMap = {
      corridor: [
        { type: 'lamp', x: 0, z: 0 }, { type: 'candle', x: w > 1 ? 1 : 0, z: Math.floor(h/2) },
        { type: 'crate', x: 0, z: Math.min(2, h-1) },
        { type: 'painting', x: w > 1 ? 1 : 0, z: 1 },
        { type: 'rug', x: 0, z: Math.floor(h/2) }
      ],
      room_small: [
        { type: 'table', x: 1, z: 1 }, { type: 'chair', x: 2, z: 1 },
        { type: 'lamp', x: 0, z: 0 }, { type: 'candle', x: 1, z: 0 },
        { type: 'rug', x: 1, z: 1 }, { type: 'painting', x: 2, z: 0 }
      ],
      room_medium: [
        { type: 'desk', x: 2, z: 2 }, { type: 'chair', x: 3, z: 2 },
        { type: 'bookshelf', x: 0, z: 0 }, { type: 'bookshelf', x: 0, z: 2 },
        { type: 'lamp', x: 1, z: 1 }, { type: 'candle', x: 3, z: 1 },
        { type: 'rug', x: 2, z: 3 }, { type: 'painting', x: 4, z: 0 },
        { type: 'wardrobe', x: 4, z: 3 }
      ],
      room_large: [
        { type: 'pillar', x: 1, z: 1 }, { type: 'pillar', x: w-2, z: 1 },
        { type: 'pillar', x: 1, z: h-2 }, { type: 'pillar', x: w-2, z: h-2 },
        { type: 'table', x: Math.floor(w/2), z: Math.floor(h/2) },
        { type: 'chair', x: Math.floor(w/2)+1, z: Math.floor(h/2) },
        { type: 'lamp', x: 0, z: 0 }, { type: 'candle', x: w-1, z: h-1 },
        { type: 'statue', x: Math.floor(w/2), z: 0 },
        { type: 'rug', x: Math.floor(w/2), z: Math.floor(h/2) },
        { type: 'painting', x: 2, z: 0 }, { type: 'painting', x: w-3, z: 0 },
        { type: 'fireplace', x: 0, z: Math.floor(h/2) }
      ],
      library: [
        { type: 'bookshelf', x: 0, z: 0 }, { type: 'bookshelf', x: 0, z: 2 },
        { type: 'bookshelf', x: 0, z: 4 }, { type: 'bookshelf', x: 4, z: 0 },
        { type: 'desk', x: 2, z: 2 }, { type: 'chair', x: 3, z: 2 },
        { type: 'lamp', x: 2, z: 0 }, { type: 'candle', x: 1, z: 3 },
        { type: 'rug', x: 2, z: 3 }, { type: 'painting', x: 3, z: 0 },
        { type: 'chest', x: 4, z: 4 }
      ],
      basement: [
        { type: 'crate', x: 1, z: 1 }, { type: 'barrel', x: 2, z: 3 },
        { type: 'crate', x: 3, z: 1 }, { type: 'barrel', x: 0, z: 2 },
        { type: 'lamp', x: 0, z: 0 }, { type: 'candle', x: 1, z: 0 },
        { type: 'skeleton', x: 3, z: 3 }, { type: 'chest', x: 2, z: 0 }
      ],
      ritual: [
        { type: 'altar', x: Math.floor(w/2), z: Math.floor(h/2) },
        { type: 'statue', x: 0, z: 0 }, { type: 'statue', x: w-1, z: 0 },
        { type: 'candle', x: Math.floor(w/2)-1, z: Math.floor(h/2) },
        { type: 'candle', x: Math.floor(w/2)+1, z: Math.floor(h/2) },
        { type: 'lamp', x: 1, z: 1 }, { type: 'lamp', x: w-2, z: 1 },
        { type: 'rug', x: Math.floor(w/2), z: Math.floor(h/2) },
        { type: 'skeleton', x: 0, z: h-1 }
      ]
    };

    const decor = decorMap[template] || decorMap.room_medium;
    decor.forEach(d => {
      if (d.x < w && d.z < h) placeObjectInternal(d);
    });
  }

  // ========== 坐标转换 ==========
  function gridToWorld(gx, gz) {
    const halfW = (currentRoom.width * cellSize) / 2;
    const halfH = (currentRoom.height * cellSize) / 2;
    return new THREE.Vector3(
      -halfW + gx * cellSize + cellSize / 2,
      0,
      -halfH + gz * cellSize + cellSize / 2
    );
  }

  function worldToGrid(worldPos) {
    const halfW = (currentRoom.width * cellSize) / 2;
    const halfH = (currentRoom.height * cellSize) / 2;
    return {
      x: Math.floor((worldPos.x + halfW) / cellSize),
      z: Math.floor((worldPos.z + halfH) / cellSize)
    };
  }

  // ========== 绿色轨迹线 + 点击移动 ==========

  // BFS寻路：从start到end，返回格子路径数组[{x,z},...] 或null
  function findPath(startX, startZ, endX, endZ) {
    if (!currentRoom) return null;
    const w = currentRoom.width, h = currentRoom.height;
    // 起终点相同
    if (startX === endX && startZ === endZ) return [{ x: startX, z: startZ }];
    // 终点不可达
    if (endX < 0 || endX >= w || endZ < 0 || endZ >= h) return null;
    const blocking = sceneObjects.find(o => o.gridX === endX && o.gridZ === endZ && o.blockMove);
    if (blocking) return null;

    const visited = new Set();
    const queue = [{ x: startX, z: startZ, path: [{ x: startX, z: startZ }] }];
    visited.add(`${startX},${startZ}`);
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

    while (queue.length > 0) {
      const cur = queue.shift();
      for (const [dx, dz] of dirs) {
        const nx = cur.x + dx, nz = cur.z + dz;
        const key = `${nx},${nz}`;
        if (nx < 0 || nx >= w || nz < 0 || nz >= h) continue;
        if (visited.has(key)) continue;
        const blk = sceneObjects.find(o => o.gridX === nx && o.gridZ === nz && o.blockMove);
        if (blk) continue;
        visited.add(key);
        const newPath = [...cur.path, { x: nx, z: nz }];
        if (nx === endX && nz === endZ) return newPath;
        queue.push({ x: nx, z: nz, path: newPath });
      }
    }
    return null; // 无路径
  }

  // 显示绿色轨迹线
  function showPathLine(path) {
    clearPathLine();
    if (!path || path.length < 2 || !scene) return;

    const points = path.map(p => {
      const w = gridToWorld(p.x, p.z);
      return new THREE.Vector3(w.x, 0.08, w.z); // 贴地稍高
    });

    // 使用管道几何体做粗发光轨迹线（比LineBasicMaterial更明显）
    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeo = new THREE.TubeGeometry(curve, points.length * 8, 0.06, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({ color: 0x00ff44, transparent: true, opacity: 0.85 });
    pathLine = new THREE.Mesh(tubeGeo, tubeMat);
    pathLine.name = 'pathLine';
    scene.add(pathLine);

    // 每个路径节点加小发光球
    path.forEach((p, i) => {
      if (i === 0 || i === path.length - 1) return; // 起终点用环
      const w = gridToWorld(p.x, p.z);
      const dotGeo = new THREE.SphereGeometry(0.08, 8, 6);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0x00ff44, transparent: true, opacity: 0.9 });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.set(w.x, 0.08, w.z);
      dot.name = 'pathDot';
      scene.add(dot);
    });

    // 目标格子高亮（绿色发光环）
    const endP = path[path.length - 1];
    const endW = gridToWorld(endP.x, endP.z);
    const hlGeo = new THREE.RingGeometry(0.25, 0.55, 16);
    const hlMat = new THREE.MeshBasicMaterial({ color: 0x00ff44, side: THREE.DoubleSide, transparent: true, opacity: 1.0 });
    pathHighlight = new THREE.Mesh(hlGeo, hlMat);
    pathHighlight.rotation.x = -Math.PI / 2;
    pathHighlight.position.set(endW.x, 0.09, endW.z);
    scene.add(pathHighlight);

    // 起点标记（小蓝环）
    const startP = path[0];
    const startW = gridToWorld(startP.x, startP.z);
    const sGeo = new THREE.RingGeometry(0.15, 0.35, 16);
    const sMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const startRing = new THREE.Mesh(sGeo, sMat);
    startRing.rotation.x = -Math.PI / 2;
    startRing.position.set(startW.x, 0.09, startW.z);
    startRing.name = 'pathStart';
    scene.add(startRing);
  }

  // 显示混合轨迹线（AP范围内绿色，超出部分红色）
  function showMixedPathLine(path, apRange) {
    clearPathLine();
    if (!path || path.length < 2 || !scene) return;

    // apRange: AP能走的步数（path[0]是起点，path[1]是第一步）
    const greenEnd = Math.min(apRange + 1, path.length); // 绿色路径到第apRange+1个节点
    const redStart = greenEnd; // 红色从greenEnd开始

    // 绿色部分
    if (greenEnd >= 2) {
      const greenPoints = path.slice(0, greenEnd).map(p => {
        const w = gridToWorld(p.x, p.z);
        return new THREE.Vector3(w.x, 0.08, w.z);
      });
      const greenCurve = new THREE.CatmullRomCurve3(greenPoints);
      const greenTube = new THREE.TubeGeometry(greenCurve, greenPoints.length * 8, 0.06, 8, false);
      const greenMat = new THREE.MeshBasicMaterial({ color: 0x00ff44, transparent: true, opacity: 0.85 });
      const greenMesh = new THREE.Mesh(greenTube, greenMat);
      greenMesh.name = 'pathLine';
      scene.add(greenMesh);

      // 绿色节点球
      for (let i = 1; i < greenEnd - 1; i++) {
        const w = gridToWorld(path[i].x, path[i].z);
        const dotGeo = new THREE.SphereGeometry(0.08, 8, 6);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0x00ff44, transparent: true, opacity: 0.9 });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.set(w.x, 0.08, w.z);
        dot.name = 'pathDot';
        scene.add(dot);
      }

      // AP边界格子高亮（绿色发光环）—— 这是AP能到的最远点
      const apEndP = path[greenEnd - 1];
      const apEndW = gridToWorld(apEndP.x, apEndP.z);
      const hlGeo = new THREE.RingGeometry(0.25, 0.55, 16);
      const hlMat = new THREE.MeshBasicMaterial({ color: 0x00ff44, side: THREE.DoubleSide, transparent: true, opacity: 1.0 });
      pathHighlight = new THREE.Mesh(hlGeo, hlMat);
      pathHighlight.rotation.x = -Math.PI / 2;
      pathHighlight.position.set(apEndW.x, 0.09, apEndW.z);
      scene.add(pathHighlight);
    }

    // 红色部分（超出AP范围）
    if (redStart < path.length) {
      // 红色从绿色末端开始，确保连续
      const redPoints = path.slice(redStart - 1).map(p => {
        const w = gridToWorld(p.x, p.z);
        return new THREE.Vector3(w.x, 0.08, w.z);
      });
      const redCurve = new THREE.CatmullRomCurve3(redPoints);
      const redTube = new THREE.TubeGeometry(redCurve, redPoints.length * 8, 0.06, 8, false);
      const redMat = new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.85 });
      const redMesh = new THREE.Mesh(redTube, redMat);
      redMesh.name = 'pathLineRed';
      scene.add(redMesh);

      // 红色节点球
      for (let i = 1; i < redPoints.length - 1; i++) {
        const w = gridToWorld(path[redStart + i].x, path[redStart + i].z);
        const dotGeo = new THREE.SphereGeometry(0.08, 8, 6);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.9 });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.set(w.x, 0.08, w.z);
        dot.name = 'pathDot';
        scene.add(dot);
      }

      // 目标格子高亮（红色发光环）
      const endP = path[path.length - 1];
      const endW = gridToWorld(endP.x, endP.z);
      const endGeo = new THREE.RingGeometry(0.25, 0.55, 16);
      const endMat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, transparent: true, opacity: 1.0 });
      const endRing = new THREE.Mesh(endGeo, endMat);
      endRing.rotation.x = -Math.PI / 2;
      endRing.position.set(endW.x, 0.06, endW.z);
      endRing.name = 'pathEndRed';
      scene.add(endRing);
    }

    // 起点标记（小蓝环）
    const startP = path[0];
    const startW = gridToWorld(startP.x, startP.z);
    const sGeo = new THREE.RingGeometry(0.15, 0.35, 16);
    const sMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const startRing = new THREE.Mesh(sGeo, sMat);
    startRing.rotation.x = -Math.PI / 2;
    startRing.position.set(startW.x, 0.09, startW.z);
    startRing.name = 'pathStart';
    scene.add(startRing);
  }

  // 显示红色轨迹线（AP不足，无绿色部分时用）
  function showRedPathLine(path) {
    showMixedPathLine(path, 0);
  }

  // 清除轨迹线
  function clearPathLine() {
    // 清除pathLine和pathHighlight变量引用
    if (pathLine && scene) { scene.remove(pathLine); pathLine.geometry?.dispose(); pathLine.material?.dispose(); }
    pathLine = null;
    if (pathHighlight && scene) { scene.remove(pathHighlight); pathHighlight.geometry?.dispose(); pathHighlight.material?.dispose(); }
    pathHighlight = null;
    // 遍历scene清理所有路径相关对象（防止残留）
    if (scene) {
      const toRemove = [];
      scene.traverse(obj => {
        if (obj.name === 'pathLine' || obj.name === 'pathDot' || obj.name === 'pathStart' ||
            obj.name === 'pathLineRed' || obj.name === 'pathEndRed') {
          toRemove.push(obj);
        }
      });
      toRemove.forEach(obj => { scene.remove(obj); obj.geometry?.dispose(); obj.material?.dispose(); });
    }
    pathTarget = null;
  }

  // 沿路径移动（逐格动画）
  function moveAlongPath(path, callback) {
    if (!path || path.length < 2) { if (callback) callback(); return; }
    animating = true;
    let step = 1;
    let lastDirection = 0; // 记录最后朝向
    
    function nextStep() {
      if (step >= path.length) {
        animating = false;
        clearPathLine();
        // 保持最后朝向，回到idle
        playAction('idle') || playAction('Idle');
        // 更新UI
        if (typeof UI !== 'undefined' && UI.updateHUD) UI.updateHUD();
        if (typeof GameState !== 'undefined' && GameState.saveGame) GameState.saveGame();
        if (callback) callback();
        return;
      }
      
      const prev = path[step - 1];
      const target = path[step];
      playerPos.x = target.x;
      playerPos.z = target.z;
      
      const worldStart = gridToWorld(prev.x, prev.z);
      const worldTarget = gridToWorld(target.x, target.z);
      
      // 计算移动方向并旋转角色
      const dx = worldTarget.x - worldStart.x;
      const dz = worldTarget.z - worldStart.z;
      lastDirection = Math.atan2(dx, dz); // 记录朝向
      if (playerMesh) {
        playerMesh.rotation.y = lastDirection;
      }
      
      // 播放走路动作
      playAction('walk') || playAction('Walk') || playAction('walking');
      
      const duration = 400; // 正常走路速度（每格400ms）
      const startTime = performance.now();
      
      function anim(now) {
        const t = Math.min(1, (now - startTime) / duration);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        playerMesh.position.x = worldStart.x + (worldTarget.x - worldStart.x) * ease;
        playerMesh.position.z = worldStart.z + (worldTarget.z - worldStart.z) * ease;
        if (t < 1) {
          requestAnimationFrame(anim);
        } else {
          step++;
          nextStep();
        }
      }
      requestAnimationFrame(anim);
    }
    nextStep();
  }
  
  // 设置玩家朝向（用于互动后朝向物品）
  function setPlayerFacing(targetX, targetZ) {
    if (!playerMesh) return;
    const playerWorld = gridToWorld(playerPos.x, playerPos.z);
    const targetWorld = gridToWorld(targetX, targetZ);
    const dx = targetWorld.x - playerWorld.x;
    const dz = targetWorld.z - playerWorld.z;
    const angle = Math.atan2(dx, dz);
    playerMesh.rotation.y = angle;
  }

  // 点击格子：路径预览 → 确认移动
  function clickGrid(gx, gz) {
    if (animating || !currentRoom) return 'busy';
    const pp = getPlayerPos();
    // 点击自己位置：忽略
    if (gx === pp.x && gz === pp.z) { clearPathLine(); return 'cancel'; }

    // 检查AP
    const ap = typeof DMEngine !== 'undefined' ? DMEngine.getAP() : { current: 999, max: 999 };

    // 检查是否在预览状态，点击的是目标格子
    if (pathTarget && gx === pathTarget.x && gz === pathTarget.z) {
      // 确认移动
      const path = findPath(pp.x, pp.z, gx, gz);
      if (!path) return 'blocked';
      
      const cost = path.length - 1;
      if (ap.current >= cost) {
        // AP足够，移动到目标
        if (typeof DMEngine !== 'undefined' && DMEngine.consumeAP) {
          DMEngine.consumeAP(cost);
        }
        clearPathLine();
        moveAlongPath(path);
        pathTarget = null;
        return 'move';
      } else if (ap.current > 0) {
        // AP不足但>0，移动到AP范围内最远点
        const partialPath = path.slice(0, ap.current + 1);
        if (typeof DMEngine !== 'undefined' && DMEngine.consumeAP) {
          DMEngine.consumeAP(ap.current);
        }
        clearPathLine();
        moveAlongPath(partialPath);
        pathTarget = null;
        return 'move';
      } else {
        return 'blocked';
      }
    }

    // 第一次点击：显示路径预览
    const path = findPath(pp.x, pp.z, gx, gz);
    if (!path) return 'blocked';

    const cost = path.length - 1;
    if (ap.current >= cost) {
      showPathLine(path);
      pathTarget = { x: gx, z: gz };
      return 'preview';
    } else {
      // AP不足：显示混合路径（绿色=AP范围内，红色=超出部分）
      showMixedPathLine(path, ap.current);
      pathTarget = { x: gx, z: gz };
      return 'preview';
    }
  }

  // ========== 3D场景点击（Raycast→格子→轨迹线→移动） ==========

  let raycaster = null;
  let floorMesh = null; // 地板mesh引用，用于raycast

  function initGridClick(container) {
    raycaster = new THREE.Raycaster();
    const canvas = renderer.domElement;
    console.log('[SceneManager] initGridClick 已初始化, canvas:', canvas ? 'OK' : 'NULL');

    // 点击事件（区分点击和拖拽）
    let mouseDownPos = null;
    let mouseDownTime = 0;

    canvas.addEventListener('pointerdown', (e) => {
      mouseDownPos = { x: e.clientX, y: e.clientY };
      mouseDownTime = performance.now();
    });

    canvas.addEventListener('pointerup', (e) => {
      if (!mouseDownPos) return;
      const dx = e.clientX - mouseDownPos.x;
      const dy = e.clientY - mouseDownPos.y;
      const dt = performance.now() - mouseDownTime;
      const dist = Math.sqrt(dx*dx + dy*dy);
      console.log('[SceneManager] pointerup: dist=' + dist.toFixed(1) + ' dt=' + dt.toFixed(0) + 'ms floorMesh=' + (floorMesh ? 'OK' : 'NULL'));
      // 短距离+短时间=点击，否则是拖拽
      if (dist < 15 && dt < 500) {
        handleSceneClick(e);
      }
      mouseDownPos = null;
    });
  }

  function handleSceneClick(e) {
    if (!camera || !currentRoom) {
      console.warn('[SceneManager] 点击检测跳过: camera=' + !!camera + ' room=' + !!currentRoom);
      return;
    }

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    raycaster.setFromCamera(mouse, camera);
    
    // 尝试raycast地板
    let grid = null;
    if (floorMesh) {
      const intersects = raycaster.intersectObject(floorMesh);
      if (intersects.length > 0) {
        const point = intersects[0].point;
        grid = worldToGrid({ x: point.x, z: point.z });
        console.log('[SceneManager] raycast命中地板, 世界坐标:', point, '→ 格子:', grid);
      }
    }
    
    // 如果地板没命中，尝试所有场景对象（包括格子线等）
    if (!grid) {
      const allObjects = [];
      scene.traverse(obj => { if (obj.isMesh) allObjects.push(obj); });
      const intersects = raycaster.intersectObjects(allObjects);
      if (intersects.length > 0) {
        const point = intersects[0].point;
        grid = worldToGrid({ x: point.x, z: point.z });
        console.log('[SceneManager] raycast命中场景对象, 世界坐标:', point, '→ 格子:', grid, '对象:', intersects[0].object.name || intersects[0].object.type);
      }
    }
    
    if (!grid) {
      console.log('[SceneManager] raycast未命中任何对象, floorMesh=' + !!floorMesh + ' mouse=' + mouse.x.toFixed(2) + ',' + mouse.y.toFixed(2));
      return;
    }

    if (grid.x < 0 || grid.x >= currentRoom.width || grid.z < 0 || grid.z >= currentRoom.height) {
      console.log('[SceneManager] 格子超出范围:', grid, '房间:', currentRoom.width + 'x' + currentRoom.height);
      return;
    }

    // 调用clickGrid逻辑
    const result = clickGrid(grid.x, grid.z);
    console.log('[SceneManager] clickGrid结果:', result);
    // 单击直接移动，无需区分preview/move
  }

  // ========== GLB模型加载 ==========

  // ========== 程序化走路/跑步动画生成 ==========
  
  function generateWalkAnimation(model) {
    // 查找模型的骨骼
    const bones = [];
    model.traverse(child => { if (child.isBone) bones.push(child); });
    // 如果直接遍历没找到，从SkinnedMesh的skeleton获取
    if (bones.length === 0) {
      model.traverse(child => {
        if (child.isSkinnedMesh && child.skeleton && child.skeleton.bones) {
          child.skeleton.bones.forEach(b => { if (!bones.includes(b)) bones.push(b); });
        }
      });
    }
    if (bones.length === 0) {
      console.log('[SceneManager] 无骨骼，无法生成走路动画');
      return null;
    }
    console.log('[SceneManager] 找到骨骼:', bones.map(b => b.name));
    
    const duration = 0.8; // 走路周期（秒）
    const fps = 30;
    const frames = Math.round(duration * fps);
    const times = [];
    for (let i = 0; i <= frames; i++) times.push(i / fps);
    
    const tracks = [];
    
    // 辅助函数：生成正弦关键帧
    function sineKeyframes(amplitude, phase) {
      return times.map(t => amplitude * Math.sin(2 * Math.PI * t / duration + phase));
    }
    function cosKeyframes(amplitude, phase) {
      return times.map(t => amplitude * Math.cos(2 * Math.PI * t / duration + phase));
    }
    function constKeyframes(value) {
      return times.map(() => value);
    }
    
    // 找骨骼（模糊匹配，支持BipTrump/Mixamo/通用命名）
    function findBone(partials) {
      for (const p of partials) {
        const found = bones.find(b => b.name.toLowerCase().includes(p.toLowerCase()));
        if (found) return found;
      }
      return null;
    }
    
    // BipTrump骨骼映射（注意：BipTrump用下划线分隔如L_Thigh，需同时匹配空格和下划线版本）
    const bLeftLeg = findBone(['l thigh', 'l_thigh', 'leftleg', 'leg_l', 'left_up_leg', 'upperleg_l', 'thigh_l', 'LeftUpLeg']);
    const bRightLeg = findBone(['r thigh', 'r_thigh', 'rightleg', 'leg_r', 'right_up_leg', 'upperleg_r', 'thigh_r', 'RightUpLeg']);
    const bLeftKnee = findBone(['l calf', 'l_calf', 'leftknee', 'knee_l', 'left_low_leg', 'lowerleg_l', 'shin_l', 'LeftLowLeg', 'calf_l']);
    const bRightKnee = findBone(['r calf', 'r_calf', 'rightknee', 'knee_r', 'right_low_leg', 'lowerleg_r', 'shin_r', 'RightLowLeg', 'calf_r']);
    const bLeftArm = findBone(['l upperarm', 'l_upperarm', 'leftarm', 'arm_l', 'left_up_arm', 'upperarm_l', 'LeftUpArm']);
    const bRightArm = findBone(['r upperarm', 'r_upperarm', 'rightarm', 'arm_r', 'right_up_arm', 'upperarm_r', 'RightUpArm']);
    const bSpine = findBone(['spine1', 'spine', 'chest', 'torso', 'body', 'hips', 'pelvis']);
    const bHead = findBone(['head', 'neck', 'skull']);
    // 根骨骼 - 身体弹跳用
    const bRoot = findBone(['biptrump_00','biptrump','root','pelvis','hips','hip']) || bones[0];
    
    console.log('[SceneManager] 骨骼匹配结果:', {
      leftLeg: bLeftLeg?.name, rightLeg: bRightLeg?.name,
      leftKnee: bLeftKnee?.name, rightKnee: bRightKnee?.name,
      leftArm: bLeftArm?.name, rightArm: bRightArm?.name,
      spine: bSpine?.name, head: bHead?.name
    });
    
    // --- 腿部：交替前后摆动 ---
    // 检测确认：大腿 +Z增量=向前抬腿，-Z=向后踢
    // 关键帧值 = 初始旋转 + 摆动增量
    // 对侧协调：左腿向前时右臂向前
    const legSwing = 0.4;
    if (bLeftLeg) tracks.push(new THREE.NumberKeyframeTrack(bLeftLeg.name + '.rotation[z]', times, sineKeyframes(legSwing, 0).map(v => v + bLeftLeg.rotation.z), THREE.InterpolateLinear));
    if (bRightLeg) tracks.push(new THREE.NumberKeyframeTrack(bRightLeg.name + '.rotation[z]', times, sineKeyframes(legSwing, Math.PI).map(v => v + bRightLeg.rotation.z), THREE.InterpolateLinear));
    
    // --- 小腿：走路时微弯 ---
    // 检测确认：小腿 -Z增量=膝盖弯曲（向后折叠）
    // 当腿向前摆时弯曲（sin>0时左腿向前）
    const kneeSwing = 0.3;
    if (bLeftKnee) {
      const initZ = bLeftKnee.rotation.z;
      const kneeValues = times.map(t => { const phase = Math.sin(2 * Math.PI * t / duration); return initZ + (phase > 0 ? -kneeSwing * phase : 0); });
      tracks.push(new THREE.NumberKeyframeTrack(bLeftKnee.name + '.rotation[z]', times, kneeValues, THREE.InterpolateLinear));
    }
    if (bRightKnee) {
      const initZ = bRightKnee.rotation.z;
      const kneeValues = times.map(t => { const phase = Math.sin(2 * Math.PI * t / duration + Math.PI); return initZ + (phase > 0 ? -kneeSwing * phase : 0); });
      tracks.push(new THREE.NumberKeyframeTrack(bRightKnee.name + '.rotation[z]', times, kneeValues, THREE.InterpolateLinear));
    }
    
    // --- 手臂：与腿对侧协调（左腿向前→右臂向前） ---
    // 检测确认：上臂 -Z增量=向前摆，+Z=向后摆
    // 左腿相位0(向前)→右臂相位0(向前)，右腿相位π→左臂相位π
    const armSwing = 0.35;
    if (bLeftArm) tracks.push(new THREE.NumberKeyframeTrack(bLeftArm.name + '.rotation[z]', times, sineKeyframes(-armSwing, Math.PI).map(v => v + bLeftArm.rotation.z), THREE.InterpolateLinear));
    if (bRightArm) tracks.push(new THREE.NumberKeyframeTrack(bRightArm.name + '.rotation[z]', times, sineKeyframes(-armSwing, 0).map(v => v + bRightArm.rotation.z), THREE.InterpolateLinear));
    
    // --- 身体弹跳：根骨骼position[y] ---
    // 双脚触地时身体最高，单脚支撑时最低
    // BipTrump根骨骼有90度Z旋转，局部+X=世界上，所以用position[x]
    const bodyBob = 1;
    if (bRoot) {
      const rootInitX = bRoot.position?.x || 0;
      const rootBobVals = times.map(t => rootInitX + bodyBob * Math.cos(2 * Math.PI * t / duration));
      tracks.push(new THREE.NumberKeyframeTrack(bRoot.name + '.position[x]', times, rootBobVals, THREE.InterpolateLinear));
    }
    
    // --- 头部：微摆 ---
    const headSwing = 0.05;
    if (bHead) tracks.push(new THREE.NumberKeyframeTrack(bHead.name + '.rotation[y]', times, sineKeyframes(headSwing, 0).map(v => v + bHead.rotation.y), THREE.InterpolateLinear));
    
    if (tracks.length === 0) {
      console.log('[SceneManager] 未匹配到任何骨骼，无法生成走路动画');
      return null;
    }
    
    console.log('[SceneManager] 生成走路动画: ' + tracks.length + '条轨道');
    return new THREE.AnimationClip('walk', duration, tracks);
  }
  
  function generateRunAnimation(model) {
    // 跑步 = 走路的加速加大版
    const bones = [];
    model.traverse(child => { if (child.isBone) bones.push(child); });
    if (bones.length === 0) {
      model.traverse(child => {
        if (child.isSkinnedMesh && child.skeleton && child.skeleton.bones) {
          child.skeleton.bones.forEach(b => { if (!bones.includes(b)) bones.push(b); });
        }
      });
    }
    if (bones.length === 0) return null;
    
    const duration = 0.5; // 跑步周期更短
    const fps = 30;
    const frames = Math.round(duration * fps);
    const times = [];
    for (let i = 0; i <= frames; i++) times.push(i / fps);
    
    const tracks = [];
    
    function sineKeyframes(amplitude, phase) {
      return times.map(t => amplitude * Math.sin(2 * Math.PI * t / duration + phase));
    }
    function cosKeyframes(amplitude, phase) {
      return times.map(t => amplitude * Math.cos(2 * Math.PI * t / duration + phase));
    }
    
    function findBone(partials) {
      for (const p of partials) {
        const found = bones.find(b => b.name.toLowerCase().includes(p.toLowerCase()));
        if (found) return found;
      }
      return null;
    }
    
    // BipTrump骨骼映射（下划线分隔版本）
    const bLeftLeg = findBone(['l thigh', 'l_thigh', 'leftleg', 'leg_l', 'left_up_leg', 'upperleg_l', 'thigh_l', 'LeftUpLeg']);
    const bRightLeg = findBone(['r thigh', 'r_thigh', 'rightleg', 'leg_r', 'right_up_leg', 'upperleg_r', 'thigh_r', 'RightUpLeg']);
    const bLeftKnee = findBone(['l calf', 'l_calf', 'leftknee', 'knee_l', 'left_low_leg', 'lowerleg_l', 'shin_l', 'LeftLowLeg', 'calf_l']);
    const bRightKnee = findBone(['r calf', 'r_calf', 'rightknee', 'knee_r', 'right_low_leg', 'lowerleg_r', 'shin_r', 'RightLowLeg', 'calf_r']);
    const bLeftArm = findBone(['l upperarm', 'l_upperarm', 'leftarm', 'arm_l', 'left_up_arm', 'upperarm_l', 'LeftUpArm']);
    const bRightArm = findBone(['r upperarm', 'r_upperarm', 'rightarm', 'arm_r', 'right_up_arm', 'upperarm_r', 'RightUpArm']);
    const bSpine = findBone(['spine1', 'spine', 'chest', 'torso', 'body', 'hips', 'pelvis']);
    const bHead = findBone(['head', 'neck', 'skull']);
    const bRoot = findBone(['biptrump_00','biptrump','root','pelvis','hips','hip']) || bones[0];
    
    console.log('[SceneManager] Run骨骼匹配:', {lLeg:bLeftLeg?.name, rLeg:bRightLeg?.name, lKnee:bLeftKnee?.name, rKnee:bRightKnee?.name, lArm:bLeftArm?.name, rArm:bRightArm?.name, spine:bSpine?.name, root:bRoot?.name});
    
    const legSwing = 0.7;
    if (bLeftLeg) tracks.push(new THREE.NumberKeyframeTrack(bLeftLeg.name + '.rotation[z]', times, sineKeyframes(legSwing, 0).map(v => v + bLeftLeg.rotation.z), THREE.InterpolateLinear));
    if (bRightLeg) tracks.push(new THREE.NumberKeyframeTrack(bRightLeg.name + '.rotation[z]', times, sineKeyframes(legSwing, Math.PI).map(v => v + bRightLeg.rotation.z), THREE.InterpolateLinear));
    
    const kneeSwing = 0.6;
    if (bLeftKnee) {
      const initZ = bLeftKnee.rotation.z;
      const v = times.map(t => { const p = Math.sin(2 * Math.PI * t / duration); return initZ + (p > 0 ? -kneeSwing * p : 0); });
      tracks.push(new THREE.NumberKeyframeTrack(bLeftKnee.name + '.rotation[z]', times, v, THREE.InterpolateLinear));
    }
    if (bRightKnee) {
      const initZ = bRightKnee.rotation.z;
      const v = times.map(t => { const p = Math.sin(2 * Math.PI * t / duration + Math.PI); return initZ + (p > 0 ? -kneeSwing * p : 0); });
      tracks.push(new THREE.NumberKeyframeTrack(bRightKnee.name + '.rotation[z]', times, v, THREE.InterpolateLinear));
    }
    
    const armSwing = 0.6;
    if (bLeftArm) tracks.push(new THREE.NumberKeyframeTrack(bLeftArm.name + '.rotation[z]', times, sineKeyframes(-armSwing, Math.PI).map(v => v + bLeftArm.rotation.z), THREE.InterpolateLinear));
    if (bRightArm) tracks.push(new THREE.NumberKeyframeTrack(bRightArm.name + '.rotation[z]', times, sineKeyframes(-armSwing, 0).map(v => v + bRightArm.rotation.z), THREE.InterpolateLinear));
    
    const bodyBob = 2;
    if (bRoot) {
      const rootInitX = bRoot.position?.x || 0;
      const rootBobVals = times.map(t => rootInitX + bodyBob * Math.cos(2 * Math.PI * t / duration));
      tracks.push(new THREE.NumberKeyframeTrack(bRoot.name + '.position[x]', times, rootBobVals, THREE.InterpolateLinear));
    }
    
    if (tracks.length === 0) return null;
    console.log('[SceneManager] 生成跑步动画: ' + tracks.length + '条轨道');
    return new THREE.AnimationClip('run', duration, tracks);
  }

  // 加载monster.glb替换主角
  function loadPlayerModel(url) {
    console.log('[SceneManager] loadPlayerModel called with:', url);
    
    // 检查GLTFLoader是否可用
    if (typeof THREE.GLTFLoader === 'undefined') {
      console.error('[SceneManager] THREE.GLTFLoader 不可用，请确保GLTFLoader.js已加载');
      return;
    }
    
    const loader = new THREE.GLTFLoader();
    loader.load(url, (gltf) => {
      console.log('[SceneManager] GLB模型加载成功:', gltf);
      console.log('[SceneManager] 动画列表:', gltf.animations.map(a => a.name));
      const model = gltf.scene;
      
      // 修复贴图：尝试从GLB提取内嵌贴图，修正PBR参数，否则设默认颜色
      (async () => {
        try {
          let embeddedTexture = null;
          if (gltf.parser && gltf.parser.getDependency) {
            try {
              const textures = gltf.parser.json.textures;
              if (textures && textures.length > 0) {
                embeddedTexture = await gltf.parser.getDependency('texture', 0);
                console.log('[SceneManager] 提取到GLB内嵌贴图:', embeddedTexture);
              }
            } catch(texErr) { console.warn('[SceneManager] 提取贴图失败:', texErr); }
          }
          model.traverse(child => {
            if (child.isMesh && child.material) {
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              mats.forEach(mat => {
                if (!mat.map && embeddedTexture) {
                  mat.map = embeddedTexture;
                  mat.needsUpdate = true;
                  console.log('[SceneManager] 已为材质', mat.name, '赋值内嵌贴图');
                }
                // 修正KHR_materials_pbrSpecularGlossiness转换问题
                if (mat.isMeshStandardMaterial && mat.metalness >= 0.9 && mat.roughness >= 0.9) {
                  console.log('[SceneManager] 修正PBR参数:', mat.name);
                  mat.metalness = 0;
                  mat.roughness = 0.7;
                  mat.needsUpdate = true;
                }
                if (!mat.map && (!mat.color || (mat.color.r >= 0.9 && mat.color.g >= 0.9 && mat.color.b >= 0.9))) {
                  mat.color = new THREE.Color(0xc9a04e); // 金色
                  mat.needsUpdate = true;
                }
              });
            }
          });
        } catch(e) { console.warn('[SceneManager] 贴图修复失败:', e); }
      })();
      
      // 根据模型包围盒自动缩放，使其高度约为1.5格
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const targetHeight = 1.5; // 目标高度（格子单位）
      const autoScale = size.y > 0 ? targetHeight / size.y : 0.5;
      model.scale.set(autoScale, autoScale, autoScale);
      console.log('[SceneManager] 模型原始尺寸:', size, '自动缩放:', autoScale);
      // 如果有动画
      if (gltf.animations && gltf.animations.length > 0) {
        playerMixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach(clip => {
          const action = playerMixer.clipAction(clip);
          playerActions[clip.name] = action;
          playerActions[clip.name.toLowerCase()] = action;
        });
        // Mixamo模型常见动作名映射：Take 001 → idle
        if (playerActions['Take 001'] && !playerActions['idle']) {
          playerActions['idle'] = playerActions['Take 001'];
        }
      }
      
      // ========== 程序化生成走路动画 ==========
      // 基于模型骨骼生成走路动作（左右腿交替+身体上下微动+手臂摆动）
      const walkClip = generateWalkAnimation(model);
      if (walkClip) {
        if (!playerMixer) playerMixer = new THREE.AnimationMixer(model);
        const walkAction = playerMixer.clipAction(walkClip);
        playerActions['walk'] = walkAction;
        playerActions['Walk'] = walkAction;
      }
      
      // 程序化生成跑步动画（走路加速版）
      const runClip = generateRunAnimation(model);
      if (runClip) {
        if (!playerMixer) playerMixer = new THREE.AnimationMixer(model);
        const runAction = playerMixer.clipAction(runClip);
        playerActions['run'] = runAction;
        playerActions['Run'] = runAction;
      }
      
      console.log('[SceneManager] 可用动作:', Object.keys(playerActions));
      // 默认播放idle
      const idleAction = playerActions['idle'] || playerActions['Idle'] || playerActions[Object.keys(playerActions)[0]];
      if (idleAction) { idleAction.reset().fadeIn(0.3).play(); currentAction = Object.keys(playerActions).find(k => playerActions[k] === idleAction) || 'idle'; }
      
      // 替换旧模型
      if (playerMesh && scene) scene.remove(playerMesh);
      playerModel = model;
      // 保留底部圆环
      const group = new THREE.Group();
      group.add(model);
      // 底部圆环指示器
      const ringGeo = new THREE.RingGeometry(0.35, 0.45, 16);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xc9a04e, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      group.add(ring);
      playerMesh = group;
      scene.add(playerMesh);
      updatePlayerWorldPos();
    }, undefined, (err) => {
      console.error('GLB模型加载失败，使用默认模型:', err);
    });
  }

  // 播放动作
  function playAction(name) {
    if (!playerMixer || !playerActions[name]) return false;
    const action = playerActions[name];
    if (currentAction === name) return true;
    // 淡出旧动作
    const oldAction = playerActions[currentAction];
    if (oldAction && oldAction !== action) oldAction.fadeOut(0.3);
    action.reset().fadeIn(0.3).play();
    currentAction = name;
    return true;
  }

  // 获取可用动作列表
  function getAvailableActions() {
    return Object.keys(playerActions);
  }

  // 获取当前动作名
  function getCurrentAction() {
    return currentAction;
  }

  // ========== 玩家移动 ==========
  function movePlayer(dx, dz) {
    if (animating || !currentRoom) return false;

    const newX = playerPos.x + dx;
    const newZ = playerPos.z + dz;

    // 边界检查
    if (newX < 0 || newX >= currentRoom.width || newZ < 0 || newZ >= currentRoom.height) return false;

    // 阻挡检查
    const blocking = sceneObjects.find(o => o.gridX === newX && o.gridZ === newZ && o.blockMove);
    if (blocking) return false;

    playerPos.x = newX;
    playerPos.z = newZ;

    // 播放行走动作
    playAction('walk') || playAction('Walk') || playAction('walking');

    // 平滑移动动画
    animating = true;
    const target = gridToWorld(newX, newZ);
    const start = playerMesh.position.clone();
    const duration = 200;
    const startTime = performance.now();

    function animateMove(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      playerMesh.position.x = start.x + (target.x - start.x) * ease;
      playerMesh.position.z = start.z + (target.z - start.z) * ease;
      if (t < 1) {
        requestAnimationFrame(animateMove);
      } else {
        animating = false;
        // 移动结束，回到idle
        playAction('idle') || playAction('Idle');
      }
    }
    requestAnimationFrame(animateMove);

    return true;
  }

  function updatePlayerWorldPos() {
    const pos = gridToWorld(playerPos.x, playerPos.z);
    playerMesh.position.copy(pos);
  }

  // 移动到指定格子（英雄无敌式）
  function movePlayerToGrid(gx, gz) {
    if (animating || !currentRoom) return false;
    
    // 边界检查
    if (gx < 0 || gx >= currentRoom.width || gz < 0 || gz >= currentRoom.height) return false;
    
    // 阻挡检查
    const blocking = sceneObjects.find(o => o.gridX === gx && o.gridZ === gz && o.blockMove);
    if (blocking) return false;
    
    playerPos.x = gx;
    playerPos.z = gz;
    
    // 平滑移动动画
    animating = true;
    const target = gridToWorld(gx, gz);
    const start = playerMesh.position.clone();
    const duration = 200;
    const startTime = performance.now();
    
    function animateMove(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      playerMesh.position.x = start.x + (target.x - start.x) * ease;
      playerMesh.position.z = start.z + (target.z - start.z) * ease;
      if (t < 1) {
        requestAnimationFrame(animateMove);
      } else {
        animating = false;
      }
    }
    requestAnimationFrame(animateMove);
    
    return true;
  }

  // ========== 场景联动方法（叙事→3D效果） ==========
  let mainLightRef = null;   // 主光源引用
  let ambientLightRef = null; // 环境光引用（applyAtmosphere创建的）
  let flickerTimer = null;

  // 灯光闪烁效果
  function flickerLights(duration) {
    if (!mainLightRef) return;
    const origIntensity = mainLightRef.intensity;
    const startTime = Date.now();
    if (flickerTimer) clearInterval(flickerTimer);
    flickerTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed > (duration || 2000)) {
        mainLightRef.intensity = origIntensity;
        clearInterval(flickerTimer);
        flickerTimer = null;
        return;
      }
      mainLightRef.intensity = origIntensity * (0.3 + Math.random() * 0.7);
    }, 80);
  }

  // 动态调整雾密度
  function setFogDensity(density) {
    if (scene && scene.fog) scene.fog.density = density;
  }

  // 动态调整主灯光颜色
  function setLightColor(color) {
    if (mainLightRef) mainLightRef.color.set(color);
  }

  // 动态调整主灯光强度
  function setLightIntensity(intensity) {
    if (mainLightRef) mainLightRef.intensity = intensity;
  }

  // 在场景中放置新对象（外部API）
  function placeObject(objDef) {
    if (!currentRoom) return;
    if (objDef.x >= currentRoom.width || objDef.z >= currentRoom.height) return;
    if (getObjectAt(objDef.x, objDef.z)) return;
    placeObjectInternal(objDef);
  }

  // 移除指定格子上的对象
  function removeObjectAt(gx, gz) {
    const idx = sceneObjects.findIndex(o => o.gridX === gx && o.gridZ === gz);
    if (idx >= 0) {
      scene.remove(sceneObjects[idx].group);
      sceneObjects.splice(idx, 1);
    }
  }

  // ========== 清理 ==========
  function clearRoom() {
    gridObjects.forEach(obj => scene.remove(obj));
    sceneObjects.forEach(obj => scene.remove(obj.group));
    // 用 length=0 清空而非重新赋值，保持外部引用有效
    gridObjects.length = 0;
    sceneObjects.length = 0;
    currentRoom = null;
    floorMesh = null; // 清除地板引用
    clearPathLine(); // 清除轨迹线
    // 清理标签
    labelElements.forEach(el => el.remove());
    labelElements = [];
  }

  // ========== 渲染循环 ==========
  function animate() {
    requestAnimationFrame(animate);

    // AnimationMixer更新（GLB模型动画）
    if (playerMixer) {
      const delta = clock.getDelta ? clock.getDelta() : 1/60;
      playerMixer.update(delta);
    }

    // 相机控制器更新（惯性等）
    if (controls) {
      controls.update();
    } else if (playerMesh && currentRoom) {
      // 降级：简单相机跟随（无控制器时）
      const targetCamX = playerMesh.position.x;
      const targetCamZ = playerMesh.position.z + 10;
      camera.position.x += (targetCamX - camera.position.x) * 0.05;
      camera.position.z += (targetCamZ - camera.position.z) * 0.05;
      camera.lookAt(playerMesh.position.x, 0, playerMesh.position.z);
    }

    renderer.render(scene, camera);

    // 灯光闪烁效果：蜡烛和壁炉的火焰自然抖动
    const now = performance.now();
    sceneObjects.forEach(obj => {
      if (obj.isLight && obj.isOn) {
        const lightMesh = obj.group?.children?.find(c => c.isLight && c.name === 'objectLight');
        if (!lightMesh) return;
        if (obj.type === 'candle') {
          // 蜡烛：快速微弱闪烁
          const base = 3.0;
          lightMesh.intensity = base + Math.sin(now * 0.008) * 0.3 + Math.sin(now * 0.013) * 0.2 + (Math.random() - 0.5) * 0.3;
        } else if (obj.type === 'fireplace') {
          // 壁炉：较慢大幅闪烁
          const base = 7.0;
          lightMesh.intensity = base + Math.sin(now * 0.004) * 0.8 + Math.sin(now * 0.007) * 0.5 + (Math.random() - 0.5) * 0.6;
        } else if (obj.type === 'lamp') {
          // 油灯：偶尔微弱波动
          const base = 5.0;
          lightMesh.intensity = base + Math.sin(now * 0.002) * 0.15;
        }
      }
    });

    // 每6帧更新一次标签（性能优化）
    labelUpdateFrame++;
    if (labelUpdateFrame % 6 === 0) updateLabels();
  }

  // ========== 查询 ==========
  function getObjectAt(gx, gz) {
    return sceneObjects.find(o => o.gridX === gx && o.gridZ === gz);
  }

  function getRoomInfo() {
    return currentRoom;
  }

  function getPlayerPos() {
    return { ...playerPos };
  }

  function getScene() {
    return scene;
  }

  function addToScene(obj) {
    if (scene) scene.add(obj);
  }

  function removeFromScene(obj) {
    if (scene) scene.remove(obj);
  }

  // Bresenham视线检查
  function hasLineOfSight(x1, z1, x2, z2) {
    if (!currentRoom) return false;
    let dx = Math.abs(x2 - x1);
    let dz = Math.abs(z2 - z1);
    let sx = x1 < x2 ? 1 : -1;
    let sz = z1 < z2 ? 1 : -1;
    let err = dx - dz;
    let cx = x1, cz = z1;

    while (cx !== x2 || cz !== z2) {
      const obj = getObjectAt(cx, cz);
      if (obj && obj.blockLOS) return false;
      const e2 = 2 * err;
      if (e2 > -dz) { err -= dz; cx += sx; }
      if (e2 < dx) { err += dx; cz += sz; }
    }
    return true;
  }

  // 计算格子距离
  function gridDistance(x1, z1, x2, z2) {
    return Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
  }

  // 获取可交互物件列表
  function getInteractableObjects() {
    return sceneObjects.filter(o => o.hint).map(o => ({
      type: o.type, name: o.name, hint: o.hint,
      gridX: o.gridX, gridZ: o.gridZ
    }));
  }

  // ========== 物件交互标签（HTML叠加层） ==========
  let labelContainer = null;
  let labelElements = [];
  let labelUpdateFrame = 0; // 节流计数器

  function initLabels(container) {
    labelContainer = document.createElement('div');
    labelContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;';
    container.style.position = 'relative';
    container.appendChild(labelContainer);
  }

  function updateLabels() {
    if (!labelContainer || !camera || !renderer) return;

    // 移除旧标签
    labelElements.forEach(el => el.remove());
    labelElements = [];

    const canvasRect = renderer.domElement.getBoundingClientRect();
    const playerWorldPos = playerMesh ? playerMesh.position.clone() : new THREE.Vector3();

    // 更新感知快照（如果ScenePerception可用）
    if (typeof ScenePerception !== 'undefined') {
      const playerGridPos = playerMesh ? {
        x: Math.round(playerMesh.position.x / cellSize + currentRoom.combatW / 2),
        z: Math.round(playerMesh.position.z / cellSize + currentRoom.combatH / 2)
      } : { x: 0, z: 0 };
      ScenePerception.updateSnapshot(sceneObjects, playerGridPos, camera, canvasRect.width, canvasRect.height);
    }

    sceneObjects.forEach(obj => {
      if (!obj.hint) return;
      const group = obj.group;
      if (!group) return;

      // 获取物件世界位置，标签放在物体顶部
      const worldPos = new THREE.Vector3();
      group.getWorldPosition(worldPos);
      // 计算物体包围盒高度，标签放在顶部上方0.2
      const box = new THREE.Box3().setFromObject(group);
      const objHeight = box.max.y - box.min.y;
      worldPos.y = box.max.y + 0.2;

      // 投影到屏幕坐标
      const screenPos = worldPos.clone().project(camera);

      // 在相机后面则不显示
      if (screenPos.z > 1) return;

      const x = (screenPos.x * 0.5 + 0.5) * canvasRect.width;
      const y = (-screenPos.y * 0.5 + 0.5) * canvasRect.height;

      // 距离玩家
      const dist = worldPos.distanceTo(playerWorldPos);
      if (dist > 8) return;

      // 判断是否在交互距离内（靠近强化标签）
      const isNearby = dist <= 2.5;

      // 使用ScenePerception的标签升级（如果可用）
      let labelText = obj.hint;
      if (typeof ScenePerception !== 'undefined' && isNearby) {
        labelText = ScenePerception.getUpgradedLabel(obj, true);
      }

      const label = document.createElement('div');
      label.className = 'scene-object-label';
      const bgAlpha = isNearby ? '0.95' : '0.85';
      const borderColor = isNearby ? 'rgba(201,160,78,0.7)' : 'rgba(201,160,78,0.3)';
      const fontSize = isNearby ? '12px' : '11px';
      label.style.cssText = `position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-100%);
        background:rgba(10,10,18,${bgAlpha});color:#c9a04e;font-size:${fontSize};padding:2px 8px;
        border-radius:3px;border:1px solid ${borderColor};white-space:nowrap;
        pointer-events:auto;cursor:pointer;transition:opacity 0.2s;`;
      label.textContent = labelText;
      label.dataset.type = obj.type;
      label.dataset.gridX = obj.gridX;
      label.dataset.gridZ = obj.gridZ;

      // 点击标签触发交互
      label.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof handleObjectInteraction === 'function') {
          handleObjectInteraction(obj.type, obj.name, obj.gridX, obj.gridZ);
        }
      });

      labelContainer.appendChild(label);
      labelElements.push(label);
    });

    // 离屏方向提示（如果ScenePerception可用）
    if (typeof ScenePerception !== 'undefined') {
      const snapshot = ScenePerception.getSnapshot();
      for (const obj of snapshot.offscreen) {
        const indicator = ScenePerception.getOffscreenIndicator(obj, camera, canvasRect.width, canvasRect.height);
        if (!indicator) continue;

        const arrow = document.createElement('div');
        arrow.className = 'offscreen-indicator';
        arrow.style.cssText = `position:absolute;left:${indicator.x}px;top:${indicator.y}px;
          transform:translate(-50%,-50%) rotate(${indicator.angle}deg);
          width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;
          border-bottom:14px solid rgba(201,160,78,0.6);pointer-events:auto;cursor:pointer;`;
        arrow.title = `${indicator.direction}方向有${obj.type}`;
        arrow.addEventListener('click', () => {
          // 点击箭头：提示方向
          // 点击箭头：通过UI模块提示方向
          if (typeof UI !== 'undefined' && UI.addNarration) {
            UI.addNarration(`你记得${indicator.direction}方向似乎有什么...`, 'system');
          }
        });
        labelContainer.appendChild(arrow);
        labelElements.push(arrow);
      }
    }
  }

  // ========== 灯光开关 ==========
  // on: undefined=toggle, true=强制开, false=强制关
  function toggleObjectLight(gx, gz, on) {
    const obj = sceneObjects.find(o => o.gridX === gx && o.gridZ === gz && o.isLight);
    if (!obj) return null;

    // 优先使用保存的lightRef，退路：在group.children中查找
    const lightMesh = obj.lightRef || obj.group.children.find(c => c.isLight && c.name === 'objectLight');
    if (!lightMesh) return null;
    // 同步保存引用，避免下次再搜索
    if (!obj.lightRef) obj.lightRef = lightMesh;

    const glowMesh = obj.glowRef || obj.group.children.find(c => c.name === 'glowMesh');
    if (glowMesh && !obj.glowRef) obj.glowRef = glowMesh;

    // 确定目标状态：传入on时强制，否则toggle
    const nextOn = (on !== undefined) ? !!on : !obj.isOn;
    // 状态未变则直接返回当前状态（幂等）
    if (nextOn === obj.isOn) return obj.isOn;

    obj.isOn = nextOn;
    if (obj.isOn) {
      // 增强灯光强度：灯5.0，蜡烛3.0，壁炉7.0
      const targetIntensity = obj.type === 'lamp' ? 5.0 : obj.type === 'candle' ? 3.0 : obj.type === 'fireplace' ? 7.0 : 4.0;
      animateLightIntensity(lightMesh, 0, targetIntensity, 400);
      // 显示发光球
      if (glowMesh) animateGlowOpacity(glowMesh, 0, 0.9, 300);
      obj.hint = obj.type === 'lamp' ? '💡 关灯' : obj.type === 'candle' ? '🕯️ 吹灭' : '🔥 熄火';
      // 开灯后增强环境光和降低雾密度
      applyLightingEnvironment(true);
    } else {
      animateLightIntensity(lightMesh, lightMesh.intensity, 0, 300);
      // 隐藏发光球
      if (glowMesh) animateGlowOpacity(glowMesh, glowMesh.material.opacity, 0, 200);
      obj.hint = obj.type === 'lamp' ? '💡 开灯' : obj.type === 'candle' ? '🕯️ 点燃' : '🔥 生火';
      // 关灯后恢复暗色环境
      applyLightingEnvironment(false);
    }
    return obj.isOn;
  }

  // 根据房间内灯光状态动态调整环境
  function applyLightingEnvironment(hasNewLight) {
    // 统计当前亮着的灯数量
    const litLights = sceneObjects.filter(o => o.isLight && o.isOn);
    const lightCount = litLights.length;

    // 环境光：有灯时增强，无灯时压低
    if (ambientLightBase) {
      const targetAmbient = lightCount > 0 ? Math.min(0.3 + lightCount * 0.15, 0.8) : 0.3;
      animateValue(ambientLightBase, 'intensity', ambientLightBase.intensity, targetAmbient, 500);
    }
    if (ambientLightRef) {
      const targetAmbient2 = lightCount > 0 ? Math.min(0.3 + lightCount * 0.1, 0.6) : 0.15;
      animateValue(ambientLightRef, 'intensity', ambientLightRef.intensity, targetAmbient2, 500);
    }
    if (hemiLightBase) {
      const targetHemi = lightCount > 0 ? Math.min(0.2 + lightCount * 0.1, 0.5) : 0.2;
      animateValue(hemiLightBase, 'intensity', hemiLightBase.intensity, targetHemi, 500);
    }

    // 雾密度：有灯时降低（视野更远），无灯时恢复
    if (scene && scene.fog) {
      const baseDensity = currentRoom?.template ? (ROOM_TEMPLATES[currentRoom.template]?.fogDensity || 0.02) : 0.02;
      const targetDensity = lightCount > 0 ? Math.max(baseDensity * 0.3, 0.005) : baseDensity;
      animateFogDensity(scene.fog.density, targetDensity, 600);
    }

    // toneMappingExposure：有灯时提亮
    if (renderer) {
      const targetExposure = lightCount > 0 ? Math.min(0.8 + lightCount * 0.3, 1.8) : 0.8;
      animateValue(renderer, 'toneMappingExposure', renderer.toneMappingExposure, targetExposure, 500);
    }
  }

  // 通用数值动画
  function animateValue(obj, prop, from, to, duration) {
    const startTime = performance.now();
    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      obj[prop] = from + (to - from) * ease;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // 雾密度动画
  function animateFogDensity(from, to, duration) {
    const startTime = performance.now();
    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      if (scene && scene.fog) scene.fog.density = from + (to - from) * ease;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // 发光球透明度动画
  function animateGlowOpacity(mesh, from, to, duration) {
    const startTime = performance.now();
    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      mesh.material.opacity = from + (to - from) * t;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function animateLightIntensity(light, from, to, duration) {
    const startTime = performance.now();
    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      light.intensity = from + (to - from) * t;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ========== 物件高亮反馈 ==========
  function highlightObject(gx, gz, duration) {
    duration = duration || 800;
    const obj = sceneObjects.find(o => o.gridX === gx && o.gridZ === gz);
    if (!obj) return;
    
    const mesh = obj.group.children.find(c => c.isMesh);
    if (!mesh) return;
    
    const origEmissive = mesh.material.emissive ? mesh.material.emissive.clone() : new THREE.Color(0);
    if (!mesh.material.emissive) mesh.material.emissive = new THREE.Color(0);
    mesh.material.emissive.set(0xc9a04e);
    mesh.material.emissiveIntensity = 0.5;
    
    setTimeout(function() {
      mesh.material.emissive.copy(origEmissive);
      mesh.material.emissiveIntensity = 0;
    }, duration);
  }

  // ========== 交互距离检查 ==========
  var INTERACT_RANGE = 1.5; // 相邻格可交互（对角线~1.414）

  function canInteract(gx, gz) {
    var pp = getPlayerPos();
    var dist = gridDistance(pp.x, pp.z, gx, gz);
    return dist <= INTERACT_RANGE;
  }

  function getInteractDistance(gx, gz) {
    var pp = getPlayerPos();
    return gridDistance(pp.x, pp.z, gx, gz);
  }

  // ========== 开门/关门 ==========
  function toggleDoor(gx, gz) {
    var obj = sceneObjects.find(o => o.gridX === gx && o.gridZ === gz && o.type === 'door');
    if (!obj) return null;
    
    obj.isOn = !obj.isOn;
    if (obj.isOn) {
      obj.group.visible = false;
      obj.blockMove = false;
      obj.hint = '🚪 关门';
    } else {
      obj.group.visible = true;
      obj.blockMove = true;
      obj.hint = '🚪 打开门';
    }
    return obj.isOn;
  }

  // 全局交互回调（由game.js设置）
  let handleObjectInteraction = null;
  function setObjectInteractionHandler(handler) {
    handleObjectInteraction = handler;
  }

  return {
    init, buildRoom, clearRoom,
    movePlayer, movePlayerToGrid, getPlayerPos, setPlayerFacing,
    getObjectAt, getRoomInfo,
    hasLineOfSight, gridDistance,
    gridToWorld, worldToGrid,
    ROOM_TEMPLATES, OBJECT_TEMPLATES,
    sceneObjects, getScene, addToScene, removeFromScene,
    flickerLights, setFogDensity, setLightColor, setLightIntensity,
    placeObject, removeObjectAt, getInteractableObjects,
    centerCameraOnRoom, setObjectInteractionHandler,
    toggleObjectLight, toggleDoor, highlightObject,
    canInteract, getInteractDistance, INTERACT_RANGE,
    showPathLine, clearPathLine, loadPlayerModel, clickGrid,
    playAction, getAvailableActions, getCurrentAction
  };
})();
