/**
 * 房间模板系统 - Phase 3
 * 
 * 定义房间模板：门槽位、墙物件槽位、中心槽位、灯槽位、生成点
 * 门作为portal连接房间
 * 
 * 模板类型：
 * - entrance_hall: 入口大厅（门厅）
 * - corridor: 走廊
 * - library: 图书馆
 * - basement: 地下室
 * - ritual: 仪式室
 * - room_small: 小房间
 * - room_medium: 中房间
 * - room_large: 大房间
 */

const RoomTemplates = (() => {

  // ========== 房间模板定义 ==========
  const ROOM_TEMPLATES = {
    entrance_hall: {
      name: '入口大厅',
      minWidth: 5, maxWidth: 7, minHeight: 5, maxHeight: 7,
      wallHeight: 3,
      doorSlots: [
        { wall: 'south', position: 'center', connectedRoomId: null, portal: true }
      ],
      wallObjectSlots: [
        { wall: 'east', count: 2, types: ['bookshelf', 'painting'] },
        { wall: 'west', count: 1, types: ['lamp'] }
      ],
      centerSlots: [
        { count: 1, minDist: 2, types: ['table'] }
      ],
      lampSlots: [
        { wall: 'east', count: 1 },
        { wall: 'center', count: 1 }
      ],
      anchorSlot: { position: 'center', types: ['table', 'fireplace'] },
      spawnPoint: { x: 'center', z: 'far' }, // center-x, far-z（远离入口）
      mood: 'gothic'
    },

    corridor: {
      name: '走廊',
      minWidth: 2, maxWidth: 3, minHeight: 6, maxHeight: 10,
      wallHeight: 2.5,
      doorSlots: [
        { wall: 'south', position: 'left', connectedRoomId: null, portal: true },
        { wall: 'north', position: 'right', connectedRoomId: null, portal: true }
      ],
      wallObjectSlots: [
        { wall: 'east', count: 2, types: ['painting', 'lamp'] },
        { wall: 'west', count: 1, types: ['crate'] }
      ],
      centerSlots: [],
      lampSlots: [
        { wall: 'east', count: 2 }
      ],
      anchorSlot: null,
      spawnPoint: { x: 'center', z: 'near' },
      mood: 'gothic'
    },

    library: {
      name: '图书馆',
      minWidth: 5, maxWidth: 7, minHeight: 5, maxHeight: 7,
      wallHeight: 3,
      doorSlots: [
        { wall: 'south', position: 'left', connectedRoomId: null, portal: true }
      ],
      wallObjectSlots: [
        { wall: 'west', count: 3, types: ['bookshelf', 'bookshelf', 'bookshelf'] },
        { wall: 'east', count: 2, types: ['bookshelf', 'painting'] }
      ],
      centerSlots: [
        { count: 1, minDist: 1, types: ['desk'] }
      ],
      lampSlots: [
        { wall: 'center', count: 1 },
        { wall: 'west', count: 1 }
      ],
      anchorSlot: { position: 'center', types: ['desk'] },
      spawnPoint: { x: 'center', z: 'near' },
      mood: 'gothic'
    },

    basement: {
      name: '地下室',
      minWidth: 4, maxWidth: 5, minHeight: 4, maxHeight: 5,
      wallHeight: 2.5,
      doorSlots: [
        { wall: 'south', position: 'center', connectedRoomId: null, portal: true }
      ],
      wallObjectSlots: [
        { wall: 'west', count: 2, types: ['barrel', 'crate'] }
      ],
      centerSlots: [
        { count: 1, minDist: 1, types: ['altar'] }
      ],
      lampSlots: [
        { wall: 'east', count: 1 }
      ],
      anchorSlot: { position: 'center', types: ['altar'] },
      spawnPoint: { x: 'center', z: 'near' },
      mood: 'cosmic'
    },

    ritual: {
      name: '仪式室',
      minWidth: 5, maxWidth: 6, minHeight: 5, maxHeight: 6,
      wallHeight: 3,
      doorSlots: [
        { wall: 'south', position: 'center', connectedRoomId: null, portal: true }
      ],
      wallObjectSlots: [
        { wall: 'west', count: 1, types: ['statue'] },
        { wall: 'east', count: 1, types: ['statue'] }
      ],
      centerSlots: [
        { count: 1, minDist: 1, types: ['altar'] }
      ],
      lampSlots: [
        { wall: 'center', count: 2 }
      ],
      anchorSlot: { position: 'center', types: ['altar'] },
      spawnPoint: { x: 'center', z: 'near' },
      mood: 'cosmic'
    },

    room_small: {
      name: '小房间',
      minWidth: 3, maxWidth: 4, minHeight: 3, maxHeight: 4,
      wallHeight: 2.5,
      doorSlots: [
        { wall: 'south', position: 'center', connectedRoomId: null, portal: true }
      ],
      wallObjectSlots: [
        { wall: 'east', count: 1, types: ['lamp'] }
      ],
      centerSlots: [
        { count: 1, minDist: 1, types: ['table'] }
      ],
      lampSlots: [
        { wall: 'east', count: 1 }
      ],
      anchorSlot: null,
      spawnPoint: { x: 'center', z: 'near' },
      mood: 'gothic'
    },

    room_medium: {
      name: '中房间',
      minWidth: 4, maxWidth: 6, minHeight: 4, maxHeight: 6,
      wallHeight: 3,
      doorSlots: [
        { wall: 'south', position: 'center', connectedRoomId: null, portal: true }
      ],
      wallObjectSlots: [
        { wall: 'west', count: 1, types: ['bookshelf'] },
        { wall: 'east', count: 1, types: ['lamp'] }
      ],
      centerSlots: [
        { count: 1, minDist: 1, types: ['table'] }
      ],
      lampSlots: [
        { wall: 'east', count: 1 }
      ],
      anchorSlot: null,
      spawnPoint: { x: 'center', z: 'near' },
      mood: 'gothic'
    },

    room_large: {
      name: '大厅',
      minWidth: 6, maxWidth: 8, minHeight: 6, maxHeight: 8,
      wallHeight: 3.5,
      doorSlots: [
        { wall: 'south', position: 'center', connectedRoomId: null, portal: true }
      ],
      wallObjectSlots: [
        { wall: 'west', count: 2, types: ['pillar', 'lamp'] },
        { wall: 'east', count: 2, types: ['pillar', 'painting'] }
      ],
      centerSlots: [
        { count: 1, minDist: 2, types: ['table'] }
      ],
      lampSlots: [
        { wall: 'west', count: 1 },
        { wall: 'east', count: 1 },
        { wall: 'center', count: 1 }
      ],
      anchorSlot: { position: 'center', types: ['table', 'fireplace'] },
      spawnPoint: { x: 'center', z: 'far' },
      mood: 'gothic'
    }
  };

  // ========== 门连接定义 ==========
  // 默认剧本的门连接关系
  const DEFAULT_CONNECTIONS = {
    'old_house': [
      { fromRoom: 'arrival', fromWall: 'north', fromPos: 'center', toRoom: 'corridor', toWall: 'south', toPos: 'left' },
      { fromRoom: 'corridor', fromWall: 'north', fromPos: 'right', toRoom: 'library', toWall: 'south', toPos: 'left' },
      { fromRoom: 'library', fromWall: 'north', fromPos: 'center', toRoom: 'basement', toWall: 'south', toPos: 'center' },
      { fromRoom: 'basement', fromWall: 'north', fromPos: 'center', toRoom: 'ritual_room', toWall: 'south', toPos: 'center' }
    ]
  };

  // ========== 工具函数 ==========

  /**
   * 获取房间模板
   * @param {string} roomType - 房间类型（如'entrance_hall', 'library'等）
   * @returns {Object|null} 模板定义
   */
  function getTemplate(roomType) {
    return ROOM_TEMPLATES[roomType] || null;
  }

  /**
   * 根据房间类型和尺寸，生成门对象列表
   * @param {string} roomType - 房间类型
   * @param {number} width - 房间宽度
   * @param {number} height - 房间高度
   * @param {Object} connections - 门连接映射 { wall_pos: connectedRoomId }
   * @returns {Array} 门对象数组（可直接用于DMEngine场景objects）
   */
  function generateDoors(roomType, width, height, connections) {
    const template = getTemplate(roomType);
    if (!template || !template.doorSlots) return [];

    const doors = [];
    for (const slot of template.doorSlots) {
      const pos = calcWallPosition(slot.wall, slot.position, width, height);
      const doorObj = {
        type: 'door',
        x: pos.x,
        z: pos.z,
        wall: slot.wall,
        portal: slot.portal || false,
        state: 'closed',
        isOpen: false,
        isOn: false  // door的isOn表示isOpen
      };

      // 连接关系
      const connKey = `${slot.wall}_${slot.position}`;
      if (connections && connections[connKey]) {
        doorObj.connectedRoomId = connections[connKey];
      } else if (slot.connectedRoomId) {
        doorObj.connectedRoomId = slot.connectedRoomId;
      }

      doors.push(doorObj);
    }
    return doors;
  }

  /**
   * 计算墙上位置的格子坐标
   * @param {string} wall - 'north'|'south'|'east'|'west'
   * @param {string} position - 'left'|'center'|'right'
   * @param {number} width - 房间宽度
   * @param {number} height - 房间高度
   * @returns {{x: number, z: number}}
   */
  function calcWallPosition(wall, position, width, height) {
    const posCalc = {
      center: (max) => Math.floor(max / 2),
      left: (max) => Math.floor(max * 0.25),
      right: (max) => Math.floor(max * 0.75)
    };
    const calc = posCalc[position] || posCalc.center;

    switch (wall) {
      case 'north': return { x: calc(width), z: 0 };
      case 'south': return { x: calc(width), z: height - 1 };
      case 'west':  return { x: 0, z: calc(height) };
      case 'east':  return { x: width - 1, z: calc(height) };
      default:      return { x: calc(width), z: 0 };
    }
  }

  /**
   * 根据模板生成生成点坐标
   * @param {string} roomType - 房间类型
   * @param {number} width - 房间宽度
   * @param {number} height - 房间高度
   * @returns {{x: number, z: number}}
   */
  function getSpawnPoint(roomType, width, height) {
    const template = getTemplate(roomType);
    if (!template || !template.spawnPoint) return { x: Math.floor(width / 2), z: Math.floor(height / 2) };

    const sp = template.spawnPoint;
    const x = sp.x === 'center' ? Math.floor(width / 2) : (typeof sp.x === 'number' ? sp.x : Math.floor(width / 2));
    const z = sp.z === 'near' ? Math.floor(height * 0.75) : (sp.z === 'far' ? Math.floor(height * 0.25) : (typeof sp.z === 'number' ? sp.z : Math.floor(height / 2)));
    return { x: Math.min(x, width - 1), z: Math.min(z, height - 1) };
  }

  /**
   * 为剧本场景添加门连接属性
   * @param {Object} scenario - 剧本对象
   * @returns {Object} 添加了门连接的剧本
   */
  /**
   * C1-3升级: 为剧本场景添加门连接属性
   * 支持三种连接来源：
   * 1. DEFAULT_CONNECTIONS 硬编码连接（old_house等预设剧本）
   * 2. scenario.transitions 动态连接（AI生成的剧本）
   * 3. 场景编译器编译后的connections字段
   */
  function applyConnections(scenario) {
    if (!scenario || !scenario.scenes) return scenario;

    // 来源1: 硬编码的DEFAULT_CONNECTIONS
    const hardcodedConns = DEFAULT_CONNECTIONS[scenario.scenarioId || 'old_house'] || [];
    for (const conn of hardcodedConns) {
      const fromScene = scenario.scenes.find(s => s.id === conn.fromRoom);
      if (fromScene && fromScene.objects) {
        for (const obj of fromScene.objects) {
          if (obj.type === 'door' && !obj.connectedRoomId) {
            obj.connectedRoomId = conn.toRoom;
            obj.portal = true;
            obj.wall = obj.wall || conn.fromWall;
          }
        }
      }
    }

    // 来源2: scenario.transitions（AI生成剧本的动态连接）
    const transitions = scenario.transitions || {};
    const sceneIndex = {};
    scenario.scenes.forEach((s, i) => { sceneIndex[s.id] = i; });

    for (const [action, trans] of Object.entries(transitions)) {
      if (!trans.nextScene) continue;
      // 解析action格式: "next_s0" → 源场景index=0, "back_s1" → 源场景index=1
      const match = action.match(/^(?:next|back)_s(\d+)$/);
      if (!match) continue;
      const sourceIdx = parseInt(match[1]);
      const sourceScene = scenario.scenes[sourceIdx];
      if (!sourceScene || !sourceScene.objects) continue;

      // 确定门的方向：next→北墙，back→南墙
      const isForward = action.startsWith('next');
      const doorWall = isForward ? 'north' : 'south';

      // 找到该墙上未连接的门
      let doorFound = false;
      for (const obj of sourceScene.objects) {
        if (obj.type === 'door' && !obj.connectedRoomId) {
          obj.connectedRoomId = trans.nextScene;
          obj.portal = true;
          obj.wall = obj.wall || doorWall;
          doorFound = true;
          break; // 每个transition只连接一个门
        }
      }

      // 如果没有门，自动创建一个
      if (!doorFound) {
        const doorPos = calcWallPosition(doorWall, 'center', sourceScene.width || 5, sourceScene.height || 5);
        sourceScene.objects.push({
          type: 'door',
          x: doorPos.x,
          z: doorPos.z,
          wall: doorWall,
          connectedRoomId: trans.nextScene,
          portal: true,
          isOpen: false,
          isOn: false,
          role: 'interactive',
          actions: ['open', 'close', 'enter'],
          requiredRange: 1,
          needsLOS: true
        });
      }
    }

    // 来源3: 编译器编译后的connections字段（已在tryCompileScene中处理为门对象）
    // 这里做二次校验：确保编译器生成的门的connectedRoomId指向存在的场景
    for (const scene of scenario.scenes) {
      if (!scene.objects) continue;
      for (const obj of scene.objects) {
        if (obj.type === 'door' && obj.connectedRoomId) {
          // 验证目标场景存在
          const targetExists = scenario.scenes.some(s => s.id === obj.connectedRoomId);
          if (!targetExists) {
            console.warn(`[RoomTemplates] 门连接到不存在的场景: ${obj.connectedRoomId}，移除连接`);
            delete obj.connectedRoomId;
            obj.portal = false;
          }
        }
      }
    }

    // 双向连接补全：如果A→B有门，确保B→A也有门
    for (const scene of scenario.scenes) {
      if (!scene.objects) continue;
      for (const obj of scene.objects) {
        if (obj.type === 'door' && obj.connectedRoomId && obj.portal) {
          const targetScene = scenario.scenes.find(s => s.id === obj.connectedRoomId);
          if (!targetScene || !targetScene.objects) continue;
          // 检查目标场景是否有指向当前场景的门
          const hasReturn = targetScene.objects.some(o =>
            o.type === 'door' && o.connectedRoomId === scene.id
          );
          if (!hasReturn) {
            // 自动创建返回门
            const returnWall = getOppositeWall(obj.wall || 'north');
            const returnPos = calcWallPosition(returnWall, 'center', targetScene.width || 5, targetScene.height || 5);
            targetScene.objects.push({
              type: 'door',
              x: returnPos.x,
              z: returnPos.z,
              wall: returnWall,
              connectedRoomId: scene.id,
              portal: true,
              isOpen: false,
              isOn: false,
              role: 'interactive',
              actions: ['open', 'close', 'enter'],
              requiredRange: 1,
              needsLOS: true
            });
          }
        }
      }
    }

    return scenario;
  }

  /**
   * C1-3: 获取对面墙方向
   */
  function getOppositeWall(wall) {
    const opposites = { north: 'south', south: 'north', east: 'west', west: 'east' };
    return opposites[wall] || 'south';
  }

  /**
   * 获取门的目标房间
   * @param {Object} doorObj - 门对象
   * @returns {string|null} 连接的房间ID
   */
  function getConnectedRoom(doorObj) {
    if (!doorObj || !doorObj.portal) return null;
    return doorObj.connectedRoomId || null;
  }

  /**
   * 列出所有模板类型
   * @returns {string[]}
   */
  function listTemplateTypes() {
    return Object.keys(ROOM_TEMPLATES);
  }

  /**
   * B1: 获取玩家进入新房间时的初始位置
   * 根据连接来源房间的门，找到目标房间中对应的门，在门旁放置玩家
   * @param {Object} scene - 目标房间场景对象
   * @param {string} fromRoomId - 来源房间ID
   * @returns {{x: number, z: number}|null}
   */
  function getEntryPosition(scene, fromRoomId) {
    if (!scene || !fromRoomId) return null;

    // 在目标房间中找到连接来源房间的门
    const entryDoor = (scene.objects || []).find(o =>
      o.type === 'door' && o.connectedRoomId === fromRoomId
    );

    if (entryDoor) {
      // 在门旁边放置玩家（门的前一格）
      const dx = entryDoor.gridX || 0;
      const dz = entryDoor.gridZ || 0;
      // 根据门所在墙推算"门内侧"位置
      const wall = entryDoor.wall;
      let px, pz;
      switch (wall) {
        case 'north': px = dx; pz = dz + 1; break;   // 北墙门→往南走一格
        case 'south': px = dx; pz = dz - 1; break;   // 南墙门→往北走一格
        case 'west':  px = dx + 1; pz = dz; break;   // 西墙门→往东走一格
        case 'east':  px = dx - 1; pz = dz; break;   // 东墙门→往西走一格
        default:      px = dx; pz = dz + 1; break;    // 默认往南
      }
      // 边界裁剪
      const w = scene.width || 6;
      const h = scene.height || 6;
      px = Math.max(0, Math.min(px, w - 1));
      pz = Math.max(0, Math.min(pz, h - 1));
      return { x: px, z: pz };
    }

    // 没找到对应门→使用默认生成点
    return getSpawnPoint(scene.room, scene.width || 6, scene.height || 6);
  }

  return {
    ROOM_TEMPLATES,
    DEFAULT_CONNECTIONS,
    getTemplate,
    generateDoors,
    calcWallPosition,
    getSpawnPoint,
    applyConnections,
    getConnectedRoom,
    listTemplateTypes,
    // B1: 入口定位
    getEntryPosition,
    // C1-3: 辅助函数
    getOppositeWall
  };

})();
