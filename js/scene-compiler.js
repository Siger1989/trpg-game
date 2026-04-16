/**
 * 场景编译器 - 方案A落地
 * 四层架构：叙事意图层 → 场景逻辑层 → 空间编译层 → 渲染交互层
 * AI产出结构化场景骨架，编译器生成合法grid、槽位与实体
 * 不让AI直接决定坐标、碰撞、路径和真值状态
 */
const SceneCompiler = (() => {

  // ========== 对象角色体系（按摆放优先级） ==========
  const ROLES = {
    light_source: { priority: 0, desc: '决定局部亮度与视觉焦点，与anchor同级处理' },
    anchor:       { priority: 1, desc: '主视觉中心，优先放置，不允许因小冲突被删' },
    interactive:  { priority: 2, desc: '玩家高频可操作对象，需保证可达、可见、标签不被挡' },
    clue:         { priority: 3, desc: '线索承载体，允许隐蔽但不允许不可达' },
    blocker:      { priority: 4, desc: '塑造路径/遮挡/掩体，应影响路线但不能彻底封路' },
    atmosphere:   { priority: 5, desc: '气氛物件，冲突时优先删减' }
  };

  // ========== 房型模板（MVP: 2种shape） ==========
  const SHAPE_TEMPLATES = {
    rect: {
      name: '矩形房间',
      minWidth: 3, maxWidth: 10,
      minHeight: 3, maxHeight: 10,
      slots(w, h) {
        const slots = [];
        // 靠墙大件（四边，跳过角落）
        for (let x = 1; x < w - 1; x++) {
          slots.push({ zone: 'wall_north', x, z: 0, size: 'large' });
          slots.push({ zone: 'wall_south', x, z: h - 1, size: 'large' });
        }
        for (let z = 1; z < h - 1; z++) {
          slots.push({ zone: 'wall_west', x: 0, z, size: 'large' });
          slots.push({ zone: 'wall_east', x: w - 1, z, size: 'large' });
        }
        // 中心物件
        const cx = Math.floor(w / 2), cz = Math.floor(h / 2);
        slots.push({ zone: 'center', x: cx, z: cz, size: 'large' });
        // 小型点缀（中心周围）
        if (w >= 5 && h >= 5) {
          slots.push({ zone: 'near_center', x: cx + 1, z: cz, size: 'small' });
          slots.push({ zone: 'near_center', x: cx - 1, z: cz, size: 'small' });
          slots.push({ zone: 'near_center', x: cx, z: cz + 1, size: 'small' });
          slots.push({ zone: 'near_center', x: cx, z: cz - 1, size: 'small' });
        }
        // 阴影角落
        slots.push({ zone: 'corner_nw', x: 0, z: 0, size: 'medium' });
        slots.push({ zone: 'corner_ne', x: w - 1, z: 0, size: 'medium' });
        slots.push({ zone: 'corner_sw', x: 0, z: h - 1, size: 'medium' });
        slots.push({ zone: 'corner_se', x: w - 1, z: h - 1, size: 'medium' });
        return slots;
      }
    },
    l_shape: {
      name: 'L形房间',
      minWidth: 4, maxWidth: 8,
      minHeight: 4, maxHeight: 8,
      mask(w, h) {
        const grid = Array.from({ length: h }, () => Array(w).fill(true));
        const cutW = Math.floor(w / 2), cutH = Math.floor(h / 2);
        for (let z = 0; z < cutH; z++)
          for (let x = 0; x < cutW; x++)
            grid[z][x] = false;
        return grid;
      },
      slots(w, h) {
        const slots = [];
        const cutW = Math.floor(w / 2), cutH = Math.floor(h / 2);
        // L形有效区域的靠墙位
        for (let x = cutW; x < w; x++) slots.push({ zone: 'wall_north', x, z: cutH, size: 'large' });
        for (let x = 0; x < w; x++) slots.push({ zone: 'wall_south', x, z: h - 1, size: 'large' });
        for (let z = cutH; z < h; z++) slots.push({ zone: 'wall_west', x: cutW, z, size: 'large' });
        for (let z = 0; z < h; z++) slots.push({ zone: 'wall_east', x: w - 1, z, size: 'large' });
        // L形拐角中心
        const cx = Math.floor((cutW + w) / 2), cz = Math.floor((cutH + h) / 2);
        slots.push({ zone: 'center', x: cx, z: cz, size: 'large' });
        // 角落
        slots.push({ zone: 'corner_ne', x: w - 1, z: cutH, size: 'medium' });
        slots.push({ zone: 'corner_sw', x: cutW, z: h - 1, size: 'medium' });
        slots.push({ zone: 'corner_se', x: w - 1, z: h - 1, size: 'medium' });
        return slots;
      }
    }
  };

  // ========== 语义映射：未知对象名→最近模板 ==========
  const SEMANTIC_MAP = {
    ritual_table: 'altar', ritual_circle: 'altar', shrine: 'altar',
    couch: 'bed', sofa: 'bed', cot: 'bed',
    cabinet: 'wardrobe', closet: 'wardrobe', drawer: 'desk',
    torch: 'lamp', lantern: 'lamp', chandelier: 'lamp',
    shelf: 'bookshelf', shelves: 'bookshelf',
    box: 'crate', trunk: 'chest', safe: 'chest',
    column: 'pillar', post: 'pillar',
    painting_frame: 'painting', portrait: 'painting', photo: 'painting',
    brazier: 'fireplace', hearth: 'fireplace',
    remains: 'skeleton', corpse: 'skeleton', bones: 'skeleton',
    book: 'bookshelf', diary: 'desk', letter: 'desk',
    rug_carpet: 'rug', carpet: 'rug'
  };

  // ========== 对象类型→默认属性（交互元数据+角色+尺寸） ==========
  const TYPE_DEFAULTS = {
    lamp:      { role: 'light_source', actions: ['toggle_light'], requiredRange: 1.5, needsLOS: false, size: 'small' },
    candle:    { role: 'light_source', actions: ['toggle_light'], requiredRange: 1.5, needsLOS: false, size: 'small' },
    fireplace: { role: 'light_source', actions: ['toggle_light', 'investigate'], requiredRange: 1.5, needsLOS: false, size: 'large' },
    door:      { role: 'interactive', actions: ['open', 'close', 'investigate'], requiredRange: 1.5, needsLOS: false, size: 'medium' },
    chest:     { role: 'interactive', actions: ['open', 'investigate'], requiredRange: 1.5, needsLOS: false, size: 'medium' },
    wardrobe:  { role: 'interactive', actions: ['open', 'investigate'], requiredRange: 1.5, needsLOS: false, size: 'large' },
    altar:     { role: 'anchor', actions: ['investigate'], requiredRange: 1.5, needsLOS: true, size: 'large' },
    statue:    { role: 'anchor', actions: ['investigate'], requiredRange: 1.5, needsLOS: true, size: 'large' },
    bookshelf: { role: 'clue', actions: ['investigate', 'search'], requiredRange: 1.5, needsLOS: false, size: 'large' },
    desk:      { role: 'clue', actions: ['investigate', 'search'], requiredRange: 1.5, needsLOS: false, size: 'large' },
    skeleton:  { role: 'clue', actions: ['investigate'], requiredRange: 1.5, needsLOS: false, size: 'small' },
    mirror:    { role: 'clue', actions: ['investigate'], requiredRange: 1.5, needsLOS: true, size: 'small' },
    table:     { role: 'blocker', actions: ['investigate'], requiredRange: 1.5, needsLOS: false, size: 'large' },
    pillar:    { role: 'blocker', actions: [], requiredRange: 0, needsLOS: false, size: 'large' },
    crate:     { role: 'blocker', actions: ['investigate', 'open'], requiredRange: 1.5, needsLOS: false, size: 'medium' },
    barrel:    { role: 'blocker', actions: ['investigate'], requiredRange: 1.5, needsLOS: false, size: 'medium' },
    bed:       { role: 'blocker', actions: ['investigate', 'search'], requiredRange: 1.5, needsLOS: false, size: 'large' },
    chair:     { role: 'atmosphere', actions: ['investigate'], requiredRange: 1.5, needsLOS: false, size: 'small' },
    rug:       { role: 'atmosphere', actions: ['investigate', 'search'], requiredRange: 1.5, needsLOS: false, size: 'small' },
    painting:  { role: 'atmosphere', actions: ['investigate'], requiredRange: 1.5, needsLOS: true, size: 'small' }
  };

  // ========== 房间类型默认参数 ==========
  const ROOM_TYPE_DEFAULTS = {
    corridor:   { minWidth: 2, maxWidth: 2, minHeight: 4, maxHeight: 8, defaultShape: 'rect' },
    room_small: { minWidth: 3, maxWidth: 4, minHeight: 3, maxHeight: 4, defaultShape: 'rect' },
    room_medium:{ minWidth: 4, maxWidth: 6, minHeight: 4, maxHeight: 6, defaultShape: 'rect' },
    room_large: { minWidth: 6, maxWidth: 10, minHeight: 6, maxHeight: 10, defaultShape: 'rect' },
    library:    { minWidth: 5, maxWidth: 7, minHeight: 5, maxHeight: 7, defaultShape: 'rect' },
    basement:   { minWidth: 3, maxWidth: 6, minHeight: 3, maxHeight: 6, defaultShape: 'l_shape' },
    ritual:     { minWidth: 4, maxWidth: 6, minHeight: 4, maxHeight: 6, defaultShape: 'rect' }
  };

  // ========== 1. 场景逻辑层：解析+规范化AI输出 ==========

  function parseSceneSpec(aiOutput) {
    if (typeof aiOutput === 'string') {
      try {
        const jsonMatch = aiOutput.match(/```json\s*([\s\S]*?)```/);
        if (jsonMatch) aiOutput = JSON.parse(jsonMatch[1]);
        else aiOutput = JSON.parse(aiOutput);
      } catch (e) {
        return null; // 降级：由调用方使用预设场景
      }
    }
    return normalizeSceneSpec(aiOutput);
  }

  function normalizeSceneSpec(spec) {
    if (!spec) return null;
    const roomType = mapRoomType(spec.room_type || spec.room);
    const roomDefaults = ROOM_TYPE_DEFAULTS[roomType] || ROOM_TYPE_DEFAULTS.room_medium;

    return {
      scene_id: spec.scene_id || spec.id || `scene_${Date.now()}`,
      room_type: roomType,
      shape: (spec.shape === 'l_shape') ? 'l_shape' : (spec.shape || roomDefaults.defaultShape),
      size: normalizeSize(spec.size || { w: spec.width, h: spec.height }, roomType),
      anchor: spec.anchor ? normalizeObject(spec.anchor) : null,
      zones: (spec.zones || []).map(z => ({
        id: z.id || `zone_${Math.random().toString(36).substr(2, 5)}`,
        type: z.type || 'center',
        mood: z.mood || 'neutral'
      })),
      objects: (spec.objects || []).map(o => normalizeObject(o)),
      connections: (spec.connections || []).map(c => ({
        direction: c.direction || 'south',
        target: c.target || 'unknown',
        type: c.type || 'door'
      })),
      mood: spec.mood || 'neutral',
      fog_density: Math.min(spec.fog_density || spec.fogDensity || 0.01, 0.02),
      ambient_light: Math.max(spec.ambient_light || spec.ambientIntensity || 0.8, 0.5)
    };
  }

  function normalizeSize(size, roomType) {
    const rd = ROOM_TYPE_DEFAULTS[roomType] || ROOM_TYPE_DEFAULTS.room_medium;
    let w = size.w || size.width || rd.minWidth;
    let h = size.h || size.height || rd.minHeight;
    w = Math.max(4, Math.min(w, rd.maxWidth));
    h = Math.max(4, Math.min(h, rd.maxHeight));
    return { w, h };
  }

  function normalizeObject(obj) {
    const rawType = obj.type || 'crate';
    const mappedType = SEMANTIC_MAP[rawType] || rawType;
    const defaults = TYPE_DEFAULTS[mappedType] || TYPE_DEFAULTS.crate;

    return {
      id: obj.id || `${mappedType}_${Math.random().toString(36).substr(2, 5)}`,
      type: mappedType,
      role: obj.role || defaults.role,
      zone: obj.zone || null,
      near: obj.near || null,
      facing: obj.facing || null,
      size: defaults.size,
      actions: defaults.actions,
      requiredRange: defaults.requiredRange,
      needsLOS: defaults.needsLOS
    };
  }

  function mapRoomType(name) {
    const map = {
      '走廊': 'corridor', 'corridor': 'corridor',
      '小房间': 'room_small', 'room_small': 'room_small',
      '中房间': 'room_medium', 'room_medium': 'room_medium',
      '大厅': 'room_large', 'room_large': 'room_large',
      '图书馆': 'library', 'library': 'library',
      '地下室': 'basement', 'basement': 'basement',
      '仪式室': 'ritual', 'ritual': 'ritual'
    };
    return map[name] || 'room_medium';
  }

  // ========== 2. 空间编译层：8步编译流程 ==========

  function compileScene(spec) {
    if (!spec) return null;

    const shape = spec.shape || 'rect';
    const shapeTpl = SHAPE_TEMPLATES[shape] || SHAPE_TEMPLATES.rect;
    const size = spec.size;

    // 步骤1：房型选择（已由normalizeSceneSpec完成）
    // 步骤2：合法化（尺寸/雾密度/光照裁剪）
    const legalized = {
      ...spec,
      fog_density: Math.min(spec.fog_density, 0.02),
      ambient_light: Math.max(spec.ambient_light, 0.5)
    };

    // 生成mask（L形房间）
    let mask = null;
    if (shape === 'l_shape' && shapeTpl.mask) {
      mask = shapeTpl.mask(size.w, size.h);
    }

    // 步骤3：锚点落位
    const slots = shapeTpl.slots(size.w, size.h);
    const occupied = new Set();
    const placedObjects = [];

    // 玩家起始位置（房间中心，避开mask和角落物件）
    const playerStart = findPlayerStart(size.w, size.h, mask);
    occupied.add(`${playerStart.x},${playerStart.z}`);

    // 按优先级排序对象
    const sortedObjects = [...legalized.objects].sort((a, b) => {
      const pa = ROLES[a.role]?.priority || 99;
      const pb = ROLES[b.role]?.priority || 99;
      return pa - pb;
    });

    // 先放anchor（如果有单独定义）
    if (legalized.anchor) {
      const anchorPos = placeByZone(legalized.anchor, slots, occupied, mask, size);
      if (anchorPos) {
        placedObjects.push({ ...legalized.anchor, x: anchorPos.x, z: anchorPos.z, placed: true });
      }
    }

    // 步骤4-5：槽位生成 + 角色化摆放
    for (const obj of sortedObjects) {
      if (obj.id === legalized.anchor?.id) continue;

      const pos = placeByRole(obj, slots, occupied, mask, size, placedObjects);
      if (pos) {
        placedObjects.push({ ...obj, x: pos.x, z: pos.z, placed: true });
      }
      // 放不下且是atmosphere→跳过（降级：删减）
    }

    // 步骤6：校验
    const validation = validate(placedObjects, size, mask, playerStart);

    // 步骤6.5：通路修复（如果有不可达物件，尝试重排blocker）
    if (!validation.valid && validation.issues.includes('unreachable_objects')) {
      const rearranged = rearrangeForReachability(placedObjects, size, mask, playerStart, slots);
      if (rearranged) {
        // 重排成功，重新校验
        const revalidation = validate(rearranged, size, mask, playerStart);
        if (revalidation.valid) {
          // 用重排后的物件替换
          placedObjects.length = 0;
          placedObjects.push(...rearranged);
          // 跳过degrade，直接到步骤8
          return buildCompiledResult(legalized, placedObjects, size, mask, playerStart);
        }
      }
    }

    // 步骤7：失败降级
    if (!validation.valid) {
      return degrade(legalized, validation.issues);
    }

    // 步骤8：反向叙事（基于真实生成结果输出描述）
    return buildCompiledResult(legalized, placedObjects, size, mask, playerStart);
  }

  /**
   * buildCompiledResult - 从编译结果构建标准输出对象
   */
  function buildCompiledResult(spec, placedObjects, size, mask, playerStart) {
    return {
      scene_id: spec.scene_id,
      room_type: spec.room_type,
      shape: spec.shape,
      size: spec.size,
      mask,
      playerStart,
      objects: placedObjects.filter(o => o.placed).map(o => ({
        id: o.id,
        type: o.type,
        role: o.role,
        x: o.x,
        z: o.z,
        actions: o.actions,
        requiredRange: o.requiredRange,
        needsLOS: o.needsLOS
      })),
      atmosphere: {
        fogDensity: spec.fog_density,
        ambientIntensity: spec.ambient_light,
        mood: spec.mood
      },
      connections: spec.connections
    };
  }

  // ========== 摆放算法 ==========

  function findPlayerStart(w, h, mask) {
    const cx = Math.floor(w / 2), cz = Math.floor(h / 2);
    if (!mask || mask[cz]?.[cx]) return { x: cx, z: cz };
    // L形房间：找有效中心
    for (let r = 1; r < Math.max(w, h); r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = cx + dx, nz = cz + dz;
          if (nx >= 0 && nx < w && nz >= 0 && nz < h && mask[nz]?.[nx]) {
            return { x: nx, z: nz };
          }
        }
      }
    }
    return { x: cx, z: cz };
  }

  function placeByZone(obj, slots, occupied, mask, size) {
    // 优先匹配zone，其次匹配near
    if (obj.zone) {
      const zoneSlots = slots.filter(s => s.zone === obj.zone && !occupied.has(`${s.x},${s.z}`));
      const validSlot = zoneSlots.find(s => !mask || mask[s.z]?.[s.x]);
      if (validSlot) {
        occupied.add(`${validSlot.x},${validSlot.z}`);
        return { x: validSlot.x, z: validSlot.z };
      }
    }
    // 没有zone或zone满了，找任意空位
    return findFreeSlot(obj, slots, occupied, mask, size);
  }

  function placeByRole(obj, slots, occupied, mask, size, placedObjects) {
    // near逻辑：靠近指定对象
    if (obj.near) {
      const nearObj = placedObjects.find(p => p.id === obj.near);
      if (nearObj) {
        const neighbors = [
          { x: nearObj.x + 1, z: nearObj.z },
          { x: nearObj.x - 1, z: nearObj.z },
          { x: nearObj.x, z: nearObj.z + 1 },
          { x: nearObj.x, z: nearObj.z - 1 }
        ];
        for (const n of neighbors) {
          if (n.x >= 0 && n.x < size.w && n.z >= 0 && n.z < size.h
              && !occupied.has(`${n.x},${n.z}`)
              && (!mask || mask[n.z]?.[n.x])) {
            occupied.add(`${n.x},${n.z}`);
            return { x: n.x, z: n.z };
          }
        }
      }
    }
    // zone逻辑
    return placeByZone(obj, slots, occupied, mask, size);
  }

  function findFreeSlot(obj, slots, occupied, mask, size) {
    // 按角色偏好找空位
    const rolePref = {
      anchor: ['center', 'corner_se'],
      light_source: ['wall_north', 'wall_south', 'near_center'],
      interactive: ['near_center', 'wall_east', 'wall_west'],
      clue: ['corner_se', 'corner_sw', 'corner_ne', 'corner_nw'],
      blocker: ['wall_north', 'wall_south', 'wall_east', 'wall_west'],
      atmosphere: ['near_center', 'corner_nw', 'corner_ne']
    };
    const prefs = rolePref[obj.role] || rolePref.atmosphere;
    for (const zone of prefs) {
      const slot = slots.find(s => s.zone === zone && !occupied.has(`${s.x},${s.z}`)
                   && (!mask || mask[s.z]?.[s.x]));
      if (slot) {
        occupied.add(`${slot.x},${slot.z}`);
        return { x: slot.x, z: slot.z };
      }
    }
    // 兜底：任意空位
    for (let z = 0; z < size.h; z++) {
      for (let x = 0; x < size.w; x++) {
        if (!occupied.has(`${x},${z}`) && (!mask || mask[z]?.[x])) {
          occupied.add(`${x},${z}`);
          return { x, z };
        }
      }
    }
    return null; // 放不下
  }

  // ========== BFS路径可达性检查 ==========

  /**
   * bfsReachable - 从起点BFS遍历，返回所有可达格子
   * blocker角色物件视为不可通行，其他角色物件可通行（可交互但不阻挡移动）
   * @param {number} startX - 起点X
   * @param {number} startZ - 起点Z
   * @param {Array} placedObjects - 已放置物件列表
   * @param {Object} size - {w, h}
   * @param {Array|null} mask - L形遮罩
   * @returns {Set} 可达格子集合 "x,z"
   */
  function bfsReachable(startX, startZ, placedObjects, size, mask) {
    const visited = new Set();
    const queue = [{ x: startX, z: startZ }];
    visited.add(`${startX},${startZ}`);

    // 构建阻挡格集合（blocker角色占据的格子不可通行）
    const blocked = new Set();
    for (const o of placedObjects) {
      if (o.placed && o.role === 'blocker') {
        blocked.add(`${o.x},${o.z}`);
      }
    }

    const dirs = [
      { dx: 1, dz: 0 }, { dx: -1, dz: 0 },
      { dx: 0, dz: 1 }, { dx: 0, dz: -1 }
    ];

    while (queue.length > 0) {
      const cur = queue.shift();
      for (const d of dirs) {
        const nx = cur.x + d.dx;
        const nz = cur.z + d.dz;
        const key = `${nx},${nz}`;
        // 边界检查
        if (nx < 0 || nx >= size.w || nz < 0 || nz >= size.h) continue;
        // 已访问
        if (visited.has(key)) continue;
        // mask检查（L形无效区域）
        if (mask && !mask[nz]?.[nx]) continue;
        // 阻挡检查
        if (blocked.has(key)) continue;
        visited.add(key);
        queue.push({ x: nx, z: nz });
      }
    }
    return visited;
  }

  /**
   * checkReachability - 检查关键物件是否从playerStart可达
   * 关键物件：door, light_source, interactive, clue, anchor
   * @returns {Object} { reachable: Array, unreachable: Array<{id,type,role,x,z}> }
   */
  function checkReachability(placedObjects, size, mask, playerStart) {
    const reachableSet = bfsReachable(playerStart.x, playerStart.z, placedObjects, size, mask);
    const criticalRoles = ['light_source', 'anchor', 'interactive', 'clue'];
    // door类型也视为关键（type='door'，无论role）
    const unreachable = [];
    const reachable = [];

    for (const o of placedObjects) {
      if (!o.placed) continue;
      const isCritical = criticalRoles.includes(o.role) || o.type === 'door';
      if (!isCritical) continue;
      const key = `${o.x},${o.z}`;
      // 物件本身可能占据blocker位置，检查相邻4格是否有任一可达
      // 对于非blocker物件，它们不阻挡移动，所以自身格子应在可达集内
      // 但如果物件恰好在blocker旁边，检查物件格子或相邻格是否可达
      if (reachableSet.has(key)) {
        reachable.push(o);
      } else {
        // 检查物件周围是否有可达格子（交互范围1.5格内）
        const adjacentReachable = [
          { x: o.x - 1, z: o.z }, { x: o.x + 1, z: o.z },
          { x: o.x, z: o.z - 1 }, { x: o.x, z: o.z + 1 }
        ].some(n => reachableSet.has(`${n.x},${n.z}`));
        if (adjacentReachable) {
          reachable.push(o);
        } else {
          unreachable.push({ id: o.id, type: o.type, role: o.role, x: o.x, z: o.z });
        }
      }
    }
    return { reachable, unreachable };
  }

  // ========== 校验 ==========

  function validate(placedObjects, size, mask, playerStart) {
    const issues = [];

    // 校验1：入口可达（BFS从玩家起始位置到所有关键物件）
    const reachResult = checkReachability(placedObjects, size, mask, playerStart);
    if (reachResult.unreachable.length > 0) {
      issues.push('unreachable_objects');
      // 记录具体不可达物件信息
      issues._unreachableDetails = reachResult.unreachable;
    }

    // 校验2：主通路畅通（anchor不被完全围住）
    const anchor = placedObjects.find(o => o.role === 'anchor' && o.placed);
    if (anchor) {
      const hasAdjacent = placedObjects.some(o =>
        o.placed && o.id !== anchor.id &&
        Math.abs(o.x - anchor.x) + Math.abs(o.z - anchor.z) === 1 &&
        o.role === 'blocker'
      );
      if (hasAdjacent) {
        // 检查anchor是否被完全围住（4面都是blocker或墙）
        const blocked = [
          anchor.x === 0 || placedObjects.some(o => o.placed && o.x === anchor.x - 1 && o.z === anchor.z && o.role === 'blocker'),
          anchor.x === size.w - 1 || placedObjects.some(o => o.placed && o.x === anchor.x + 1 && o.z === anchor.z && o.role === 'blocker'),
          anchor.z === 0 || placedObjects.some(o => o.placed && o.x === anchor.x && o.z === anchor.z - 1 && o.role === 'blocker'),
          anchor.z === size.h - 1 || placedObjects.some(o => o.placed && o.x === anchor.x && o.z === anchor.z + 1 && o.role === 'blocker')
        ].filter(Boolean).length;
        if (blocked >= 3) issues.push('anchor_blocked');
      }
    }

    // 校验3：标签不重叠（同位置多物件）
    const posMap = new Map();
    for (const o of placedObjects) {
      if (!o.placed) continue;
      const key = `${o.x},${o.z}`;
      if (posMap.has(key)) issues.push('position_overlap');
      posMap.set(key, o.id);
    }

    // 校验4：最小玩法空间（至少4×4可活动区域）
    const totalCells = size.w * size.h;
    const blockedCells = placedObjects.filter(o => o.placed && o.role === 'blocker').length;
    if (blockedCells > totalCells * 0.4) issues.push('too_crowded');

    return { valid: issues.length === 0, issues };
  }

  // ========== 通路重排：自动移动阻挡物件恢复可达性 ==========

  /**
   * rearrangeForReachability - 尝试移动blocker物件恢复关键物件可达性
   * 策略：找到不可达物件与playerStart之间的blocker，将其移到非关键路径位置
   * @param {Array} placedObjects - 已放置物件
   * @param {Object} size - {w, h}
   * @param {Array|null} mask - L形遮罩
   * @param {Object} playerStart - {x, z}
   * @param {Object} slots - 可用槽位
   * @returns {Array|null} 重排后的placedObjects，或null（无法修复）
   */
  function rearrangeForReachability(placedObjects, size, mask, playerStart, slots) {
    const maxAttempts = 3;
    let currentObjects = placedObjects.map(o => ({ ...o }));
    const occupied = new Set(currentObjects.filter(o => o.placed).map(o => `${o.x},${o.z}`));
    occupied.add(`${playerStart.x},${playerStart.z}`);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const reachResult = checkReachability(currentObjects, size, mask, playerStart);
      if (reachResult.unreachable.length === 0) {
        return currentObjects; // 所有关键物件可达
      }

      // 找到阻挡路径的blocker：在playerStart和不可达物件之间的blocker
      const blockers = currentObjects.filter(o => o.placed && o.role === 'blocker');
      let moved = false;

      for (const unreachableObj of reachResult.unreachable) {
        // 找playerStart到不可达物件直线路径上的blocker
        const pathBlockers = findPathBlockers(playerStart, unreachableObj, blockers, size, mask);
        
        for (const blocker of pathBlockers) {
          // 尝试将blocker移到非关键位置
          const newPos = findNonBlockingPosition(blocker, currentObjects, size, mask, occupied, playerStart);
          if (newPos) {
            // 更新位置
            occupied.delete(`${blocker.x},${blocker.z}`);
            blocker.x = newPos.x;
            blocker.z = newPos.z;
            occupied.add(`${newPos.x},${newPos.z}`);
            moved = true;
          }
        }
      }

      if (!moved) {
        // 无法通过移动blocker修复，尝试删除最低优先级blocker
        const removableBlocker = currentObjects
          .filter(o => o.placed && o.role === 'blocker')
          .sort((a, b) => {
            // 有actions的blocker（如crate, barrel）优先保留
            const aHasActions = (a.actions?.length || 0) > 0 ? 0 : 1;
            const bHasActions = (b.actions?.length || 0) > 0 ? 0 : 1;
            return aHasActions - bHasActions;
          })[0];

        if (removableBlocker) {
          occupied.delete(`${removableBlocker.x},${removableBlocker.z}`);
          removableBlocker.placed = false;
          moved = true;
        }
      }

      if (!moved) return null; // 无法修复
    }

    // 最终检查
    const finalResult = checkReachability(currentObjects, size, mask, playerStart);
    return finalResult.unreachable.length === 0 ? currentObjects : null;
  }

  /**
   * findPathBlockers - 找到两点之间直线/曼哈顿路径上的blocker
   */
  function findPathBlockers(start, target, blockers, size, mask) {
    const pathBlockers = [];
    // 使用BFS路径找阻挡者：从start出发，记录到target路径上遇到的blocker
    const dx = target.x - start.x;
    const dz = target.z - start.z;
    const steps = Math.max(Math.abs(dx), Math.abs(dz));
    
    if (steps === 0) return pathBlockers;

    // 沿直线方向检查
    for (let s = 1; s <= steps; s++) {
      const cx = start.x + Math.round(dx * s / steps);
      const cz = start.z + Math.round(dz * s / steps);
      const blocker = blockers.find(b => b.x === cx && b.z === cz);
      if (blocker) {
        pathBlockers.push(blocker);
      }
    }

    // 如果直线上没找到blocker，扩大搜索：检查不可达物件周围1格内的blocker
    if (pathBlockers.length === 0) {
      const nearbyBlockers = blockers.filter(b => 
        Math.abs(b.x - target.x) <= 2 && Math.abs(b.z - target.z) <= 2
      );
      pathBlockers.push(...nearbyBlockers);
    }

    return pathBlockers;
  }

  /**
   * findNonBlockingPosition - 为blocker找一个不阻挡关键路径的新位置
   */
  function findNonBlockingPosition(blocker, allObjects, size, mask, occupied, playerStart) {
    // 候选位置：靠墙的空位（blocker原本就偏好靠墙）
    const wallPositions = [];
    // 北墙
    for (let x = 0; x < size.w; x++) {
      if (x !== playerStart.x) wallPositions.push({ x, z: 0 });
    }
    // 南墙
    for (let x = 0; x < size.w; x++) {
      if (x !== playerStart.x) wallPositions.push({ x, z: size.h - 1 });
    }
    // 西墙
    for (let z = 1; z < size.h - 1; z++) {
      wallPositions.push({ x: 0, z });
    }
    // 东墙
    for (let z = 1; z < size.h - 1; z++) {
      wallPositions.push({ x: size.w - 1, z });
    }

    // 筛选：不在occupied中、在mask有效区域内、不在playerStart相邻位置
    for (const pos of wallPositions) {
      const key = `${pos.x},${pos.z}`;
      if (occupied.has(key)) continue;
      if (mask && !mask[pos.z]?.[pos.x]) continue;
      // 不要放在playerStart相邻4格（避免堵住出生点）
      const distToStart = Math.abs(pos.x - playerStart.x) + Math.abs(pos.z - playerStart.z);
      if (distToStart <= 1) continue;
      return pos;
    }

    // 靠墙位置满了，找任意空位
    for (let z = 0; z < size.h; z++) {
      for (let x = 0; x < size.w; x++) {
        const key = `${x},${z}`;
        if (occupied.has(key)) continue;
        if (mask && !mask[z]?.[x]) continue;
        const distToStart = Math.abs(x - playerStart.x) + Math.abs(z - playerStart.z);
        if (distToStart <= 1) continue;
        return { x, z };
      }
    }
    return null;
  }

  // ========== 降级 ==========

  function degrade(spec, issues) {
    // 通路问题：优先尝试重排blocker而非直接降级
    if (issues.includes('unreachable_objects')) {
      // 重新编译，但这次移除最低优先级的blocker
      const reducedBlockers = {
        ...spec,
        objects: spec.objects.map((o, i) => {
          // 标记最后一个无交互的blocker为atmosphere（降低优先级，更容易被删减）
          if (o.role === 'blocker' && (!o.actions || o.actions.length === 0)) {
            return { ...o, role: 'atmosphere' };
          }
          return o;
        })
      };
      const result = compileScene(reducedBlockers);
      if (result) return result;
    }

    // 结构降级：l_shape → rect
    if (spec.shape === 'l_shape') {
      const rectSpec = { ...spec, shape: 'rect' };
      return compileScene(rectSpec); // 重新编译
    }

    // 对象降级：删减atmosphere → 调整blocker
    const trimmed = { ...spec, objects: spec.objects.filter(o => o.role !== 'atmosphere') };
    if (trimmed.objects.length < spec.objects.length) {
      return compileScene(trimmed);
    }

    // 最终降级：返回最简rect安全房
    return {
      scene_id: spec.scene_id,
      room_type: 'room_medium',
      shape: 'rect',
      size: { w: 5, h: 5 },
      mask: null,
      playerStart: { x: 2, z: 2 },
      objects: spec.objects.filter(o => o.role === 'anchor' || o.role === 'light_source').slice(0, 3).map((o, i) => ({
        id: o.id, type: o.type, role: o.role,
        x: i === 0 ? 2 : i === 1 ? 0 : 4,
        z: i === 0 ? 2 : i === 1 ? 0 : 0,
        actions: o.actions, requiredRange: o.requiredRange, needsLOS: o.needsLOS
      })),
      atmosphere: { fogDensity: 0.005, ambientIntensity: 1.0, mood: 'neutral' },
      connections: spec.connections || []
    };
  }

  // ========== 反向叙事：基于真实生成结果输出描述 ==========
  function generateNarration(compiledScene) {
    if (!compiledScene) return '你来到了一个陌生的地方...';

    const parts = [];
    const roomNames = {
      corridor: '走廊', room_small: '小房间', room_medium: '房间',
      room_large: '大厅', library: '图书馆', basement: '地下室', ritual: '仪式室'
    };
    parts.push(`你进入了${roomNames[compiledScene.room_type] || '一个房间'}。`);

    // 描述anchor
    const anchor = compiledScene.objects.find(o => o.role === 'anchor');
    if (anchor) {
      const names = { altar: '祭坛', statue: '雕像', desk: '书桌', fireplace: '壁炉' };
      parts.push(`${names[anchor.type] || '某物'}矗立在房间中央。`);
    }

    // 描述光源
    const lights = compiledScene.objects.filter(o => o.role === 'light_source');
    if (lights.length === 0) parts.push('房间里一片漆黑。');
    else if (lights.length === 1) parts.push('角落里有一处光源。');
    else parts.push('几处微弱的光源勉强照亮了空间。');

    // 描述氛围
    const moodDesc = {
      gothic: '空气中弥漫着陈腐的气息。', cosmic: '空间中似乎有不可名状的力量在涌动。',
      noir: '阴影中似乎隐藏着什么。', folklore: '古老的传说似乎在此处回响。',
      modern: '这里似乎曾经有人居住。', dream: '一切都显得不太真实。',
      neutral: ''
    };
    if (moodDesc[compiledScene.atmosphere.mood]) {
      parts.push(moodDesc[compiledScene.atmosphere.mood]);
    }

    return parts.join('');
  }

  // ========== C3: 语义蓝图解析层 ==========

  /**
   * LAYOUT_KEYWORDS - 布局关键词→zone映射
   * AI说"靠北墙"→zone: 'wall_north'，"房间中央"→zone: 'center'
   * 支持中英文混合输入
   */
  const LAYOUT_KEYWORDS = {
    // 方位→zone
    '北墙': 'wall_north', '靠北': 'wall_north', '北侧': 'wall_north', 'north wall': 'wall_north',
    '南墙': 'wall_south', '靠南': 'wall_south', '南侧': 'wall_south', 'south wall': 'wall_south',
    '西墙': 'wall_west',  '靠西': 'wall_west',  '西侧': 'wall_west',  'west wall': 'wall_west',
    '东墙': 'wall_east',  '靠东': 'wall_east',  '东侧': 'wall_east',  'east wall': 'wall_east',
    // 位置→zone
    '中央': 'center',     '中间': 'center',     '中心': 'center',     'center': 'center',
    '角落': 'corner',     '暗角': 'corner_sw',  '角落里': 'corner',
    '西北角': 'corner_nw', '东北角': 'corner_ne',
    '西南角': 'corner_sw', '东南角': 'corner_se',
    // 相对位置
    '旁边': 'near',       '附近': 'near',       '旁边': 'near',
    '对面': 'opposite',   '对面墙': 'opposite',
    '入口': 'entrance',   '门口': 'entrance',   '门旁': 'entrance',
    '远处': 'far',        '远处角落': 'corner',
    // 隐蔽性
    '隐蔽': 'hidden',     '隐藏': 'hidden',     '暗处': 'hidden',
    '显眼': 'center',     '醒目': 'center',     '正中': 'center'
  };

  /**
   * ATMOSPHERE_MAP - 氛围关键词→atmosphere参数映射
   */
  const ATMOSPHERE_MAP = {
    '黑暗': { fogDensity: 0.02, ambientIntensity: 0.3, mood: 'gothic' },
    '阴暗': { fogDensity: 0.015, ambientIntensity: 0.4, mood: 'gothic' },
    '昏暗': { fogDensity: 0.01, ambientIntensity: 0.5, mood: 'noir' },
    '明亮': { fogDensity: 0.002, ambientIntensity: 0.9, mood: 'modern' },
    '诡异': { fogDensity: 0.015, ambientIntensity: 0.4, mood: 'cosmic' },
    '恐怖': { fogDensity: 0.02, ambientIntensity: 0.3, mood: 'gothic' },
    '神秘': { fogDensity: 0.012, ambientIntensity: 0.5, mood: 'cosmic' },
    '荒凉': { fogDensity: 0.01, ambientIntensity: 0.5, mood: 'folklore' },
    '梦幻': { fogDensity: 0.008, ambientIntensity: 0.7, mood: 'dream' },
    '压抑': { fogDensity: 0.015, ambientIntensity: 0.4, mood: 'noir' },
    'dark': { fogDensity: 0.02, ambientIntensity: 0.3, mood: 'gothic' },
    'dim': { fogDensity: 0.01, ambientIntensity: 0.5, mood: 'noir' },
    'bright': { fogDensity: 0.002, ambientIntensity: 0.9, mood: 'modern' },
    'eerie': { fogDensity: 0.015, ambientIntensity: 0.4, mood: 'cosmic' },
    'scary': { fogDensity: 0.02, ambientIntensity: 0.3, mood: 'gothic' },
    'mysterious': { fogDensity: 0.012, ambientIntensity: 0.5, mood: 'cosmic' }
  };

  /**
   * parseLayoutNote - 解析单条布局说明，提取zone和near信息
   * @param {string} note - 如"书架靠北墙"、"祭坛在房间中央"
   * @returns {Object} { zone: string|null, near: string|null }
   */
  function parseLayoutNote(note) {
    if (!note || typeof note !== 'string') return { zone: null, near: null };
    const lower = note.toLowerCase().trim();

    // 匹配LAYOUT_KEYWORDS
    for (const [keyword, zone] of Object.entries(LAYOUT_KEYWORDS)) {
      if (lower.includes(keyword.toLowerCase())) {
        if (zone === 'near') {
          // "旁边"需要指定near目标，尝试从上下文提取
          return { zone: null, near: null }; // near目标需要从focalObjects关联
        }
        if (zone === 'hidden') {
          return { zone: 'corner_sw', near: null }; // 隐蔽→西南暗角
        }
        if (zone === 'entrance') {
          return { zone: 'wall_south', near: null }; // 入口默认南墙
        }
        if (zone === 'opposite') {
          return { zone: 'wall_north', near: null }; // 对面→北墙（假设入口在南）
        }
        if (zone === 'far') {
          return { zone: 'corner_ne', near: null }; // 远处→东北角
        }
        return { zone, near: null };
      }
    }
    return { zone: null, near: null };
  }

  /**
   * parseSemanticBlueprint - 将AI语义输出转换为SceneCompiler标准spec
   * AI只输出：roomType, atmosphere, connections, focalObjects, searchables, layoutNotes
   * 程序根据模板与slot自动落地，不接受AI的x/z坐标
   * 
   * @param {Object} blueprint - AI语义输出
   * @param {string} blueprint.roomType - 房间类型（如"图书馆"、"library"）
   * @param {string|Object} blueprint.atmosphere - 氛围描述（如"昏暗"或{fogDensity, ambientIntensity, mood}）
   * @param {Array} blueprint.connections - 门连接 [{direction, target, type}]
   * @param {Array} blueprint.focalObjects - 焦点物件 [{name, description, importance}]
   * @param {Array} blueprint.searchables - 可搜索物件 [{name, description, hidden}]
   * @param {Array} blueprint.layoutNotes - 布局说明 ["书架靠北墙", "祭坛在中央"]
   * @returns {Object|null} 标准SceneCompiler spec
   */
  function parseSemanticBlueprint(blueprint) {
    if (!blueprint) return null;

    // 1. 房间类型映射
    const roomType = mapRoomType(blueprint.roomType || blueprint.room_type || 'room_medium');
    const roomDefaults = ROOM_TYPE_DEFAULTS[roomType] || ROOM_TYPE_DEFAULTS.room_medium;

    // 2. 氛围解析
    let atmosphere = { fogDensity: 0.01, ambientIntensity: 0.6, mood: 'neutral' };
    if (blueprint.atmosphere) {
      if (typeof blueprint.atmosphere === 'string') {
        // 从关键词映射
        for (const [keyword, atm] of Object.entries(ATMOSPHERE_MAP)) {
          if (blueprint.atmosphere.includes(keyword)) {
            atmosphere = { ...atmosphere, ...atm };
            break;
          }
        }
      } else if (typeof blueprint.atmosphere === 'object') {
        atmosphere = {
          fogDensity: blueprint.atmosphere.fogDensity || blueprint.atmosphere.fog_density || atmosphere.fogDensity,
          ambientIntensity: blueprint.atmosphere.ambientIntensity || blueprint.atmosphere.ambient_light || atmosphere.ambientIntensity,
          mood: blueprint.atmosphere.mood || atmosphere.mood
        };
      }
    }

    // 3. 构建物件列表（从focalObjects + searchables）
    const objects = [];

    // 焦点物件 → anchor + interactive + light_source
    if (Array.isArray(blueprint.focalObjects)) {
      for (const focal of blueprint.focalObjects) {
        const obj = semanticObjectToSpec(focal, 'anchor');
        if (obj) objects.push(obj);
      }
    }

    // 可搜索物件 → clue + interactive
    if (Array.isArray(blueprint.searchables)) {
      for (const searchable of blueprint.searchables) {
        const obj = semanticObjectToSpec(searchable, 'clue');
        if (obj) objects.push(obj);
      }
    }

    // 4. 布局说明解析 → 为物件分配zone
    if (Array.isArray(blueprint.layoutNotes)) {
      for (let i = 0; i < blueprint.layoutNotes.length; i++) {
        const note = blueprint.layoutNotes[i];
        const parsed = parseLayoutNote(note);
        // 将布局说明匹配到对应物件（按名称关键词匹配）
        if (parsed.zone || parsed.near) {
          const matchedObj = matchLayoutNoteToObject(note, objects);
          if (matchedObj) {
            if (parsed.zone) matchedObj.zone = parsed.zone;
            if (parsed.near) matchedObj.near = parsed.near;
          }
        }
      }
    }

    // 5. 自动补充光源（如果没有任何light_source）
    const hasLight = objects.some(o => o.role === 'light_source');
    if (!hasLight) {
      objects.push({
        id: `lamp_auto_${Date.now()}`,
        type: 'lamp',
        role: 'light_source',
        zone: 'wall_north',
        near: null,
        facing: null,
        size: 'small',
        actions: ['toggle_light'],
        requiredRange: 1.5,
        needsLOS: false
      });
    }

    // 6. 构建标准spec
    const spec = {
      scene_id: blueprint.scene_id || blueprint.id || `scene_${Date.now()}`,
      room_type: roomType,
      shape: blueprint.shape || roomDefaults.defaultShape,
      size: blueprint.size || { w: roomDefaults.minWidth + 1, h: roomDefaults.minHeight + 1 },
      anchor: null,
      zones: [],
      objects: objects,
      connections: (blueprint.connections || []).map(c => ({
        direction: c.direction || 'south',
        target: c.target || 'unknown',
        type: c.type || 'door'
      })),
      mood: atmosphere.mood,
      fog_density: atmosphere.fogDensity,
      ambient_light: atmosphere.ambientIntensity
    };

    // 7. 通过normalizeSceneSpec规范化
    return normalizeSceneSpec(spec);
  }

  /**
   * semanticObjectToSpec - 将AI语义物件转换为SceneCompiler物件spec
   * @param {Object} semanticObj - AI输出的语义物件 {name, description, importance, hidden}
   * @param {string} defaultRole - 默认角色（focalObjects→anchor, searchables→clue）
   * @returns {Object|null} 标准化物件spec
   */
  function semanticObjectToSpec(semanticObj, defaultRole) {
    if (!semanticObj) return null;
    const name = semanticObj.name || semanticObj.type || '';
    if (!name) return null;

    // 通过名称映射到已知类型
    const mappedType = mapSemanticNameToType(name);
    const typeDefaults = TYPE_DEFAULTS[mappedType] || TYPE_DEFAULTS.crate;

    // 根据importance调整角色
    let role = defaultRole;
    if (semanticObj.importance === 'critical' || semanticObj.importance === '关键') {
      role = 'anchor';
    } else if (semanticObj.importance === 'high' || semanticObj.importance === '重要') {
      role = 'interactive';
    } else if (semanticObj.hidden || semanticObj.importance === 'hidden') {
      role = 'clue';
    }

    // 如果映射类型有默认角色且没有显式importance，使用类型默认角色
    if (!semanticObj.importance && typeDefaults.role) {
      role = typeDefaults.role;
    }

    return {
      id: `${mappedType}_${Math.random().toString(36).substr(2, 5)}`,
      type: mappedType,
      role: role,
      zone: semanticObj.zone || null,
      near: semanticObj.near || null,
      facing: semanticObj.facing || null,
      size: typeDefaults.size,
      actions: typeDefaults.actions,
      requiredRange: typeDefaults.requiredRange,
      needsLOS: typeDefaults.needsLOS
    };
  }

  /**
   * mapSemanticNameToType - 将AI自然语言物件名映射到TYPE_DEFAULTS中的类型
   * 支持中英文混合、模糊匹配
   */
  const NAME_TYPE_MAP = {
    // 光源
    '灯': 'lamp', '油灯': 'lamp', '台灯': 'lamp', '吊灯': 'lamp', 'lamp': 'lamp', 'lantern': 'lamp',
    '蜡烛': 'candle', '烛台': 'candle', 'candle': 'candle',
    '壁炉': 'fireplace', 'fireplace': 'fireplace', '炉火': 'fireplace',
    // 家具
    '桌子': 'table', '餐桌': 'table', 'table': 'table',
    '椅子': 'chair', '座椅': 'chair', 'chair': 'chair',
    '床': 'bed', 'bed': 'bed',
    '书架': 'bookshelf', '书柜': 'bookshelf', '书橱': 'bookshelf', 'bookshelf': 'bookshelf',
    '书桌': 'desk', '办公桌': 'desk', 'desk': 'desk', '写字台': 'desk',
    '衣柜': 'wardrobe', 'wardrobe': 'wardrobe', '橱': 'wardrobe',
    // 容器
    '箱子': 'chest', '宝箱': 'chest', 'chest': 'chest',
    '木箱': 'crate', '箱子': 'crate', 'crate': 'crate',
    '桶': 'barrel', '木桶': 'barrel', 'barrel': 'barrel',
    // 特殊
    '门': 'door', 'door': 'door',
    '祭坛': 'altar', 'altar': 'altar', '神台': 'altar',
    '雕像': 'statue', 'statue': 'statue', '塑像': 'statue',
    '柱子': 'pillar', 'pillar': 'pillar', '石柱': 'pillar',
    '镜子': 'mirror', 'mirror': 'mirror', '铜镜': 'mirror',
    '骷髅': 'skeleton', 'skeleton': 'skeleton', '尸骨': 'skeleton', '遗骸': 'skeleton',
    '画': 'painting', '油画': 'painting', 'painting': 'painting', '画像': 'painting',
    '地毯': 'rug', 'rug': 'rug', '地垫': 'rug'
  };

  function mapSemanticNameToType(name) {
    if (!name) return 'crate';
    const lower = name.toLowerCase().trim();

    // 精确匹配
    if (NAME_TYPE_MAP[lower]) return NAME_TYPE_MAP[lower];
    // 中文包含匹配
    for (const [key, type] of Object.entries(NAME_TYPE_MAP)) {
      if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
        return type;
      }
    }
    // SEMANTIC_MAP兜底
    if (SEMANTIC_MAP[lower]) return SEMANTIC_MAP[lower];
    // 最终兜底
    return 'crate';
  }

  /**
   * matchLayoutNoteToObject - 将布局说明匹配到物件列表中的对应物件
   * 策略：从说明中提取物件名关键词，与物件type/id匹配
   */
  function matchLayoutNoteToObject(note, objects) {
    if (!note || !objects.length) return null;
    const lower = note.toLowerCase();

    // 尝试匹配物件类型名
    for (const obj of objects) {
      const typeName = obj.type;
      // 检查说明中是否包含该物件类型的中文名或英文名
      for (const [key, type] of Object.entries(NAME_TYPE_MAP)) {
        if (type === typeName && lower.includes(key.toLowerCase())) {
          return obj;
        }
      }
      // 检查说明中是否包含物件id
      if (lower.includes(obj.id.toLowerCase())) {
        return obj;
      }
    }

    // 没有精确匹配，返回第一个没有zone的物件
    return objects.find(o => !o.zone) || null;
  }

  // ========== 导出 ==========
  return {
    ROLES,
    SHAPE_TEMPLATES,
    SEMANTIC_MAP,
    TYPE_DEFAULTS,
    ROOM_TYPE_DEFAULTS,
    parseSceneSpec,
    normalizeSceneSpec,
    compileScene,
    generateNarration,
    // C2: 路径可达性检查
    bfsReachable,
    checkReachability,
    rearrangeForReachability,
    // C3: 语义蓝图解析
    parseSemanticBlueprint,
    // 工具方法
    mapRoomType,
    normalizeObject
  };
})();
