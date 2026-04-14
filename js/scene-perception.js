/**
 * 场景可感知快照 - 方案D落地
 * 解决"叙事与画面脱节"问题
 * 将场景信息拆成三层，叙事只能读"玩家感知层"
 * 
 * 三层感知：
 * - visibleObjects：当前镜头可见+标签可点击的对象
 * - nearbyObjects：不在视野但玩家已知（刚确认过/在附近）的对象
 * - knownButOffscreenObjects：存在但不在视野中的对象，需要方向提示
 */
const ScenePerception = (() => {

  // ========== 感知状态 ==========
  let visibleObjects = [];          // 当前视野内可见
  let nearbyObjects = [];           // 附近但不在视野（已知位置）
  let knownButOffscreenObjects = []; // 已知但离屏（需方向提示）
  let currentInteractables = [];    // 当前可交互（在交互距离内）
  let lastConfirmedPositions = {};  // 玩家通过动作确认过的对象位置 {objId: {x,z,timestamp}}

  // ========== 相机参数（用于视野判断） ==========
  let cameraFrustum = null;
  let cameraPosition = null;

  // ========== 更新感知快照（每帧或场景变化时调用） ==========
  function updateSnapshot(sceneObjects, playerPos, camera, containerW, containerH) {
    if (!sceneObjects || !camera) return;

    cameraPosition = camera.position.clone();
    
    // 构建视锥体
    cameraFrustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();
    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    cameraFrustum.setFromProjectionMatrix(projScreenMatrix);

    visibleObjects = [];
    nearbyObjects = [];
    knownButOffscreenObjects = [];
    currentInteractables = [];

    const INTERACT_RANGE = 1.5; // 与scene-manager一致
    const NEARBY_RANGE = 5;     // 附近范围（格子）

    for (const obj of sceneObjects) {
      if (!obj.group) continue;

      const objWorldPos = new THREE.Vector3();
      obj.group.getWorldPosition(objWorldPos);

      // 计算与玩家的距离
      const dx = obj.gridX - playerPos.x;
      const dz = obj.gridZ - playerPos.z;
      const gridDist = Math.sqrt(dx * dx + dz * dz);

      // 判断是否在视锥体内
      const inFrustum = cameraFrustum.containsPoint(objWorldPos);

      // 判断是否被玩家确认过位置（最近30秒内）
      const confirmed = lastConfirmedPositions[obj.id];
      const isRecentlyConfirmed = confirmed && (Date.now() - confirmed.timestamp < 30000);

      // 分层
      if (inFrustum) {
        visibleObjects.push(obj);
      } else if (isRecentlyConfirmed || gridDist <= NEARBY_RANGE) {
        nearbyObjects.push(obj);
      } else if (isRecentlyConfirmed || obj.interactMeta?.actions?.length > 0) {
        knownButOffscreenObjects.push(obj);
      }

      // 可交互判定
      if (gridDist <= INTERACT_RANGE && obj.interactMeta?.actions?.length > 0) {
        currentInteractables.push(obj);
      }
    }
  }

  // ========== 获取当前感知快照 ==========
  function getSnapshot() {
    return {
      visible: visibleObjects,
      nearby: nearbyObjects,
      offscreen: knownButOffscreenObjects,
      interactables: currentInteractables,
      // 供叙事层读取的简化版本
      forNarration: {
        canDescribe: visibleObjects.map(o => ({ id: o.id, type: o.type, role: o.role })),
        canHint: nearbyObjects.map(o => ({ id: o.id, type: o.type })),
        needDirectionHint: knownButOffscreenObjects.map(o => ({
          id: o.id, type: o.type,
          direction: getDirectionTo(o)
        })),
        canInteract: currentInteractables.map(o => ({ id: o.id, type: o.type, actions: o.interactMeta?.actions }))
      }
    };
  }

  // ========== 叙事约束：DM只能描述玩家能感知的东西 ==========
  // 规则1：可以具体描述 → 视野内可见、标签可点、刚确认过
  // 规则2：只能模糊提示 → 存在但不在视野（"你记得入口大概在身后"）
  // 规则3：不应直接强调 → 不在视野、无提示、未确认

  function canDescribe(objId) {
    return visibleObjects.some(o => o.id === objId) ||
           lastConfirmedPositions[objId] && (Date.now() - lastConfirmedPositions[objId].timestamp < 30000);
  }

  function canHint(objId) {
    return nearbyObjects.some(o => o.id === objId) ||
           knownButOffscreenObjects.some(o => o.id === objId);
  }

  function shouldNotMention(objId) {
    return !canDescribe(objId) && !canHint(objId);
  }

  // ========== 记录玩家确认的对象位置 ==========
  function confirmPosition(objId, x, z) {
    lastConfirmedPositions[objId] = { x, z, timestamp: Date.now() };
  }

  // ========== 计算方向（从玩家到目标） ==========
  function getDirectionTo(obj) {
    if (!obj.group || !cameraPosition) return '未知';
    const objPos = new THREE.Vector3();
    obj.group.getWorldPosition(objPos);
    
    const dx = objPos.x - cameraPosition.x;
    const dz = objPos.z - cameraPosition.z;
    const angle = Math.atan2(dx, dz) * 180 / Math.PI;
    
    // 转换为8方向
    if (angle >= -22.5 && angle < 22.5) return '南';
    if (angle >= 22.5 && angle < 67.5) return '东南';
    if (angle >= 67.5 && angle < 112.5) return '东';
    if (angle >= 112.5 && angle < 157.5) return '东北';
    if (angle >= 157.5 || angle < -157.5) return '北';
    if (angle >= -157.5 && angle < -112.5) return '西北';
    if (angle >= -112.5 && angle < -67.5) return '西';
    if (angle >= -67.5 && angle < -22.5) return '西南';
    return '未知';
  }

  // ========== 离屏方向提示（返回屏幕边缘坐标） ==========
  function getOffscreenIndicator(obj, camera, containerW, containerH) {
    if (!obj.group || !camera) return null;
    
    const objPos = new THREE.Vector3();
    obj.group.getWorldPosition(objPos);
    
    // 投影到屏幕
    const projected = objPos.clone().project(camera);
    const screenX = (projected.x + 1) / 2 * containerW;
    const screenY = (-projected.y + 1) / 2 * containerH;
    
    // 如果在屏幕内，不需要离屏提示
    if (screenX >= 0 && screenX <= containerW && screenY >= 0 && screenY <= containerH) {
      return null;
    }
    
    // 计算屏幕边缘交点
    const centerX = containerW / 2;
    const centerY = containerH / 2;
    const dx = screenX - centerX;
    const dy = screenY - centerY;
    const margin = 40; // 边缘留白
    
    let edgeX, edgeY;
    if (Math.abs(dx) * containerH > Math.abs(dy) * containerW) {
      // 左右边缘
      edgeX = dx > 0 ? containerW - margin : margin;
      edgeY = centerY + dy * (edgeX - centerX) / dx;
    } else {
      // 上下边缘
      edgeY = dy > 0 ? containerH - margin : margin;
      edgeX = centerX + dx * (edgeY - centerY) / dy;
    }
    
    // 计算箭头角度
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    
    return {
      x: Math.max(margin, Math.min(containerW - margin, edgeX)),
      y: Math.max(margin, Math.min(containerH - margin, edgeY)),
      angle,
      direction: getDirectionTo(obj),
      objId: obj.id,
      objType: obj.type
    };
  }

  // ========== 上下文标签升级 ==========
  // 靠近对象后标签从"搜索书架"升级为"点击或回车搜索书架"
  function getUpgradedLabel(obj, isNearby) {
    const actionLabels = {
      toggle_light: { far: '💡 开灯', near: '💡 点击开灯' },
      open: { far: '🚪 开门', near: '🚪 点击开门' },
      close: { far: '🚪 关门', near: '🚪 点击关门' },
      investigate: { far: '🔍 调查', near: '🔍 点击调查' },
      search: { far: '🔎 搜索', near: '🔎 点击搜索' },
      examine: { far: '👁 查看', near: '👁 点击查看' },
      take: { far: '✋ 拿取', near: '✋ 点击拿取' }
    };
    
    const actions = obj.interactMeta?.actions || ['investigate'];
    const primaryAction = actions[0];
    const labelSet = actionLabels[primaryAction] || actionLabels.investigate;
    return isNearby ? labelSet.near : labelSet.far;
  }

  // ========== 清理（切换场景时） ==========
  function clear() {
    visibleObjects = [];
    nearbyObjects = [];
    knownButOffscreenObjects = [];
    currentInteractables = [];
    lastConfirmedPositions = {};
  }

  // ========== 导出 ==========
  return {
    updateSnapshot,
    getSnapshot,
    canDescribe,
    canHint,
    shouldNotMention,
    confirmPosition,
    getDirectionTo,
    getOffscreenIndicator,
    getUpgradedLabel,
    clear
  };
})();
