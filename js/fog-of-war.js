/**
 * 战争迷雾系统 - 三层迷雾 + 射线投射可见性
 * 未发现(全黑) → 已知(轮廓) → 已探索(完全可见可重遮蔽)
 * 视野范围 = 侦查技能 + 光照等级
 * 动态迷雾：灯灭→迷雾回归，理智下降→视野扭曲
 */

const FogOfWar = (() => {
  let fogGrid = [];     // 0=未发现, 1=已知, 2=已探索
  let width = 0;
  let height = 0;
  let visionRange = 5;
  let sanityDistortion = 0; // 0-1, 理智越低扭曲越强
  let fogPlane = null;
  let fogCanvas = null;
  let fogCtx = null;
  let fogTexture = null;

  // 迷雾层状态
  const FOG_STATE = {
    UNDISCOVERED: 0,  // 全黑
    KNOWN: 1,          // 轮廓可见
    EXPLORED: 2        // 完全可见
  };

  function init(w, h) {
    width = w;
    height = h;
    fogGrid = Array.from({ length: h }, () => Array(w).fill(FOG_STATE.UNDISCOVERED));

    // 创建迷雾Canvas纹理
    fogCanvas = document.createElement('canvas');
    fogCanvas.width = w * 64;
    fogCanvas.height = h * 64;
    fogCtx = fogCanvas.getContext('2d');

    // 创建Three.js迷雾平面
    createFogPlane();

    // 初始全黑
    renderFogTexture();
  }

  function createFogPlane() {
    fogTexture = new THREE.CanvasTexture(fogCanvas);
    fogTexture.minFilter = THREE.LinearFilter;
    fogTexture.magFilter = THREE.LinearFilter;

    const roomInfo = SceneManager.getRoomInfo();
    if (!roomInfo) return;

    const planeW = roomInfo.width * 2; // cellSize=2
    const planeH = roomInfo.height * 2;

    const geo = new THREE.PlaneGeometry(planeW, planeH);
    const mat = new THREE.MeshBasicMaterial({
      map: fogTexture,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    fogPlane = new THREE.Mesh(geo, mat);
    fogPlane.rotation.x = -Math.PI / 2;
    fogPlane.position.y = 0.1; // 略高于地板
    fogPlane.renderOrder = 999; // 渲染在最上层

    // 添加到场景
    SceneManager.addToScene(fogPlane);
  }

  // 更新视野
  function updateVision(px, pz, spotHiddenSkill, lightIntensity) {
    if (!fogGrid.length) return;

    // 计算视野范围
    // 基础视野2-4格（无灯时很窄），灯光加成适度
    const baseRange = 2 + Math.floor(spotHiddenSkill / 40); // 2-4格
    const lightBonus = Math.floor(lightIntensity * 0.8); // 灯光加成降低
    visionRange = baseRange + lightBonus;
    visionRange = Math.max(2, Math.min(visionRange, 8)); // 上限8格

    // 理智扭曲效果
    if (sanityDistortion > 0.3) {
      visionRange = Math.max(2, visionRange - Math.floor(sanityDistortion * 2));
    }

    // 射线投射计算可见格子
    const visibleCells = new Set();

    // 360度射线投射
    const rayCount = 72; // 每5度一条射线
    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2;
      castRay(px, pz, angle, visionRange, visibleCells);
    }

    // 玩家所在格子总是可见
    if (px >= 0 && px < width && pz >= 0 && pz < height) {
      visibleCells.add(`${px},${pz}`);
    }

    // 更新迷雾状态
    visibleCells.forEach(key => {
      const [x, z] = key.split(',').map(Number);
      if (x >= 0 && x < width && z >= 0 && z < height) {
        fogGrid[z][x] = FOG_STATE.EXPLORED;
      }
    });

    // 已探索但当前不可见的格子降级为"已知"
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        if (fogGrid[z][x] === FOG_STATE.EXPLORED && !visibleCells.has(`${x},${z}`)) {
          fogGrid[z][x] = FOG_STATE.KNOWN;
        }
      }
    }

    renderFogTexture();
  }

  // 射线投射
  function castRay(ox, oz, angle, range, visibleCells) {
    let x = ox + 0.5;
    let z = oz + 0.5;
    const dx = Math.cos(angle) * 0.3;
    const dz = Math.sin(angle) * 0.3;
    const steps = range / 0.3;

    for (let i = 0; i < steps; i++) {
      x += dx;
      z += dz;

      const gx = Math.floor(x);
      const gz = Math.floor(z);

      // 超出地图
      if (gx < 0 || gx >= width || gz < 0 || gz >= height) break;

      visibleCells.add(`${gx},${gz}`);

      // 检查墙壁/阻挡视线的对象
      const obj = SceneManager.getObjectAt(gx, gz);
      if (obj && obj.blockLOS) {
        break; // 射线被阻挡
      }
    }
  }

  // 渲染迷雾纹理 — 径向渐变自然过渡
  function renderFogTexture() {
    if (!fogCtx) return;

    const cw = fogCanvas.width / width;
    const ch = fogCanvas.height / height;
    const cellR = Math.max(cw, ch) * 0.8; // 渐变半径

    // 先铺一层深黑底
    fogCtx.fillStyle = 'rgba(2, 2, 6, 0.97)';
    fogCtx.fillRect(0, 0, fogCanvas.width, fogCanvas.height);

    // 用 destination-out 模式"擦除"可见区域，产生自然过渡
    fogCtx.globalCompositeOperation = 'destination-out';

    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        const state = fogGrid[z][x];
        const cx = x * cw + cw / 2;
        const cy = z * ch + ch / 2;

        if (state === FOG_STATE.EXPLORED) {
          // 完全可见 — 径向渐变擦除（中心全透，边缘与邻居融合）
          const grad = fogCtx.createRadialGradient(cx, cy, 0, cx, cy, cellR);
          grad.addColorStop(0, 'rgba(0,0,0,1)');
          grad.addColorStop(0.5, 'rgba(0,0,0,0.95)');
          grad.addColorStop(0.8, 'rgba(0,0,0,0.5)');
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          fogCtx.fillStyle = grad;
          fogCtx.fillRect(cx - cellR, cy - cellR, cellR * 2, cellR * 2);
        } else if (state === FOG_STATE.KNOWN) {
          // 轮廓可见 — 部分擦除，保留暗色
          const grad = fogCtx.createRadialGradient(cx, cy, 0, cx, cy, cellR);
          grad.addColorStop(0, 'rgba(0,0,0,0.3)');
          grad.addColorStop(0.4, 'rgba(0,0,0,0.15)');
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          fogCtx.fillStyle = grad;
          fogCtx.fillRect(cx - cellR, cy - cellR, cellR * 2, cellR * 2);
        }
        // UNDISCOVERED = 不擦除，保持深黑
      }
    }

    // 恢复默认合成模式
    fogCtx.globalCompositeOperation = 'source-over';

    // KNOWN区域加微弱轮廓提示
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        if (fogGrid[z][x] === FOG_STATE.KNOWN) {
          const cx = x * cw + cw / 2;
          const cy = z * ch + ch / 2;
          fogCtx.strokeStyle = 'rgba(60, 60, 90, 0.12)';
          fogCtx.lineWidth = 1;
          fogCtx.strokeRect(x * cw + 4, z * ch + 4, cw - 8, ch - 8);
        }
      }
    }

    // 理智扭曲效果
    if (sanityDistortion > 0.3) {
      applySanityDistortion();
    }

    if (fogTexture) {
      fogTexture.needsUpdate = true;
    }
  }

  // 理智扭曲视觉效果
  function applySanityDistortion() {
    if (!fogCtx) return;

    const intensity = sanityDistortion;

    // 暗红色调
    fogCtx.fillStyle = `rgba(80, 10, 10, ${intensity * 0.15})`;
    fogCtx.fillRect(0, 0, fogCanvas.width, fogCanvas.height);

    // 随机暗斑
    if (intensity > 0.5) {
      const spotCount = Math.floor(intensity * 5);
      for (let i = 0; i < spotCount; i++) {
        const sx = Math.random() * fogCanvas.width;
        const sy = Math.random() * fogCanvas.height;
        const sr = 20 + Math.random() * 40;
        const gradient = fogCtx.createRadialGradient(sx, sy, 0, sx, sy, sr);
        gradient.addColorStop(0, `rgba(60, 0, 20, ${intensity * 0.3})`);
        gradient.addColorStop(1, 'rgba(60, 0, 20, 0)');
        fogCtx.fillStyle = gradient;
        fogCtx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
      }
    }
  }

  // 设置理智扭曲等级
  function setSanityDistortion(currentSan) {
    // SAN越低扭曲越强
    if (currentSan > 60) sanityDistortion = 0;
    else if (currentSan > 40) sanityDistortion = 0.2;
    else if (currentSan > 20) sanityDistortion = 0.5;
    else if (currentSan > 10) sanityDistortion = 0.7;
    else sanityDistortion = 0.9;
  }

  // 灯灭→迷雾回归
  function extinguishLight() {
    // 所有已探索区域降级为已知
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        if (fogGrid[z][x] === FOG_STATE.EXPLORED) {
          fogGrid[z][x] = FOG_STATE.KNOWN;
        }
      }
    }
    renderFogTexture();
  }

  // 查询
  function getCellState(x, z) {
    if (x < 0 || x >= width || z < 0 || z >= height) return FOG_STATE.UNDISCOVERED;
    return fogGrid[z][x];
  }

  function isVisible(x, z) {
    return getCellState(x, z) === FOG_STATE.EXPLORED;
  }

  function getFogGrid() { return fogGrid; }

  function isInitialized() { return fogGrid !== null && fogGrid.length > 0; }

  return {
    FOG_STATE,
    init, updateVision, setSanityDistortion, extinguishLight,
    getCellState, isVisible, getFogGrid, isInitialized,
    renderFogTexture
  };
})();
