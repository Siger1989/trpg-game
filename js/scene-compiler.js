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

    // 步骤7：失败降级
    if (!validation.valid) {
      return degrade(legalized, validation.issues);
    }

    // 步骤8：反向叙事（基于真实生成结果输出描述）
    return {
      scene_id: legalized.scene_id,
      room_type: legalized.room_type,
      shape: legalized.shape,
      size: legalized.size,
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
        fogDensity: legalized.fog_density,
        ambientIntensity: legalized.ambient_light,
        mood: legalized.mood
      },
      connections: legalized.connections
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

  // ========== 校验 ==========

  function validate(placedObjects, size, mask, playerStart) {
    const issues = [];

    // 校验1：入口可达（玩家起始位置到所有门/出口）
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

  // ========== 降级 ==========

  function degrade(spec, issues) {
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
    // 工具方法
    mapRoomType,
    normalizeObject
  };
})();
