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
  let pathTarget = null;         // {x, z} 目标格子（第一次点击设置，第二次点击执行）
  let pathHighlight = null;      // 目标格子高亮mesh
  let playerModel = null;        // GLB模型（monster.glb）
  let playerMixer = null;        // AnimationMixer
  let playerActions = {};        // 动作名→AnimationAction
  let currentAction = 'idle';    // 当前播放的动作
  let clock = null;              // THREE.Clock（init时创建）

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

    // 环境光（极低基础照明，让灯光成为关键光源）
    const ambient = new THREE.AmbientLight(0x8888aa, 0.3);
    scene.add(ambient);
    ambientLightBase = ambient; // 保存引用，开灯时动态调整

    // 半球光补充微弱环境（天空冷光+地面暗光）
    const hemiLight = new THREE.HemisphereLight(0x6666aa, 0x222233, 0.2);
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

    // 地板
    const floorGeo = new THREE.PlaneGeometry(combatW * cellSize, combatH * cellSize);
    const floorMat = new THREE.MeshStandardMaterial({
      color: tpl.floorColor,
      roughness: 0.7,
      metalness: 0.1,
      emissive: tpl.floorColor,
      emissiveIntensity: 0.02
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    gridObjects.push(floor);

    // 格子线
    drawGrid(combatW, combatH);

    // 墙壁
    buildWalls(combatW, combatH, wallH, tpl.wallColor);

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

  function buildWalls(w, h, wallH, color) {
    const halfW = (w * cellSize) / 2;
    const halfH = (h * cellSize) / 2;
    const wallMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, emissive: color, emissiveIntensity: 0.02 });

    // 四面墙
    const walls = [
      { w: w * cellSize, h: wallH, pos: [0, wallH/2, -halfH], rot: [0, 0, 0] },
      { w: w * cellSize, h: wallH, pos: [0, wallH/2, halfH], rot: [0, Math.PI, 0] },
      { w: h * cellSize, h: wallH, pos: [-halfW, wallH/2, 0], rot: [0, Math.PI/2, 0] },
      { w: h * cellSize, h: wallH, pos: [halfW, wallH/2, 0], rot: [0, -Math.PI/2, 0] }
    ];

    walls.forEach(wallDef => {
      const geo = new THREE.PlaneGeometry(wallDef.w, wallDef.h);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(...wallDef.pos);
      mesh.rotation.set(...wallDef.rot);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      gridObjects.push(mesh);
    });
  }

  function applyAtmosphere(atm) {
    // 雾（暗色，密度较高营造黑暗氛围）
    scene.fog = new THREE.FogExp2(0x0a0a14, Math.max(atm.fogDensity || 0.02, 0.015));

    // 主光源（模拟房间顶灯/窗光，低强度，让物件灯光成为焦点）
    mainLightRef = new THREE.PointLight(
      atm.lightColor || 0xffeedd,
      Math.min(atm.lightIntensity || 1.0, 2.0),
      atm.lightRange || 30
    );
    mainLightRef.position.set(0, (atm.wallHeight || 3) - 0.5, 0);
    mainLightRef.castShadow = true;
    mainLightRef.shadow.mapSize.width = 512;
    mainLightRef.shadow.mapSize.height = 512;
    scene.add(mainLightRef);
    gridObjects.push(mainLightRef);

    // 环境光（极低，只保证不完全漆黑）
    ambientLightRef = new THREE.AmbientLight(0x8888aa, Math.min(atm.ambientIntensity || 0.3, 0.8));
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
      return new THREE.Vector3(w.x, 0.05, w.z); // 贴地
    });
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0x44ff66, linewidth: 2, transparent: true, opacity: 0.8 });
    pathLine = new THREE.Line(geo, mat);
    pathLine.name = 'pathLine';
    scene.add(pathLine);

    // 目标格子高亮
    const endP = path[path.length - 1];
    const endW = gridToWorld(endP.x, endP.z);
    const hlGeo = new THREE.RingGeometry(0.3, 0.55, 16);
    const hlMat = new THREE.MeshBasicMaterial({ color: 0x44ff66, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
    pathHighlight = new THREE.Mesh(hlGeo, hlMat);
    pathHighlight.rotation.x = -Math.PI / 2;
    pathHighlight.position.set(endW.x, 0.06, endW.z);
    scene.add(pathHighlight);
  }

  // 清除轨迹线
  function clearPathLine() {
    if (pathLine && scene) { scene.remove(pathLine); pathLine.geometry.dispose(); pathLine.material.dispose(); pathLine = null; }
    if (pathHighlight && scene) { scene.remove(pathHighlight); pathHighlight.geometry.dispose(); pathHighlight.material.dispose(); pathHighlight = null; }
    pathTarget = null;
  }

  // 沿路径移动（逐格动画）
  function moveAlongPath(path, callback) {
    if (!path || path.length < 2) { if (callback) callback(); return; }
    animating = true;
    let step = 1; // 从第1格开始（第0格是当前位置）
    function nextStep() {
      if (step >= path.length) {
        animating = false;
        clearPathLine();
        if (callback) callback();
        return;
      }
      const target = path[step];
      playerPos.x = target.x;
      playerPos.z = target.z;
      const worldTarget = gridToWorld(target.x, target.z);
      const start = playerMesh.position.clone();
      const duration = 150;
      const startTime = performance.now();
      // 播放走路动作
      playAction('walk');
      function anim(now) {
        const t = Math.min(1, (now - startTime) / duration);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        playerMesh.position.x = start.x + (worldTarget.x - start.x) * ease;
        playerMesh.position.z = start.z + (worldTarget.z - start.z) * ease;
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

  // 点击格子：第一次显示路径，第二次执行移动
  function clickGrid(gx, gz) {
    if (animating || !currentRoom) return 'busy';
    const pp = getPlayerPos();
    // 点击自己位置：取消路径
    if (gx === pp.x && gz === pp.z) { clearPathLine(); return 'cancel'; }
    // 如果已有路径目标且点击同一格：执行移动
    if (pathTarget && pathTarget.x === gx && pathTarget.z === gz) {
      const path = findPath(pp.x, pp.z, gx, gz);
      if (path) { moveAlongPath(path); return 'move'; }
      return 'blocked';
    }
    // 第一次点击：显示路径
    const path = findPath(pp.x, pp.z, gx, gz);
    if (!path) return 'blocked';
    pathTarget = { x: gx, z: gz };
    showPathLine(path);
    return 'preview';
  }

  // ========== GLB模型加载 ==========

  // 加载monster.glb替换主角
  function loadPlayerModel(url) {
    if (!window._gltfLoaderReady) {
      // GLTFLoader还没加载完，等一下
      window.addEventListener('gltf-loader-ready', () => loadPlayerModel(url), { once: true });
      return;
    }
    const loader = new THREE.GLTFLoader();
    loader.load(url, (gltf) => {
      const model = gltf.scene;
      // 缩放适配格子大小
      model.scale.set(0.5, 0.5, 0.5);
      // 如果有动画
      if (gltf.animations && gltf.animations.length > 0) {
        playerMixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach(clip => {
          const action = playerMixer.clipAction(clip);
          playerActions[clip.name.toLowerCase()] = action;
        });
        // 默认播放idle或第一个动画
        playAction('idle') || playAction(Object.keys(playerActions)[0]);
      }
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
      console.warn('GLB模型加载失败，使用默认模型:', err);
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
      }
    }
    requestAnimationFrame(animateMove);

    return true;
  }

  function updatePlayerWorldPos() {
    const pos = gridToWorld(playerPos.x, playerPos.z);
    playerMesh.position.copy(pos);
  }

  // ========== 场景联动方法（叙事→3D效果） ==========
  let mainLightRef = null;   // 主光源引用
  let ambientLightRef = null; // 环境光引用（applyAtmosphere创建的）
  let ambientLightBase = null; // 基础环境光引用（init创建的）
  let hemiLightBase = null;   // 基础半球光引用
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

      // 获取物件世界位置
      const worldPos = new THREE.Vector3();
      group.getWorldPosition(worldPos);
      worldPos.y += 1.5;

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
    movePlayer, movePlayerToGrid, getPlayerPos,
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
    showPathPreview, clearPathPreview, loadPlayerModel
  };
})();
