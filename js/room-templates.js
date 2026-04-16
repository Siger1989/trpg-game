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
  function applyConnections(scenario) {
    if (!scenario || !scenario.scenes) return scenario;

    const connections = DEFAULT_CONNECTIONS[scenario.scenarioId || 'old_house'] || [];

    for (const conn of connections) {
      // 找到源房间场景
      const fromScene = scenario.scenes.find(s => s.id === conn.fromRoom);
      if (fromScene && fromScene.objects) {
        // 找到对应墙上的门
        for (const obj of fromScene.objects) {
          if (obj.type === 'door') {
            // 如果门在该墙上且位置匹配，添加连接
            if (!obj.connectedRoomId) {
              obj.connectedRoomId = conn.toRoom;
              obj.portal = true;
              obj.wall = obj.wall || conn.fromWall;
            }
          }
        }
      }
    }

    return scenario;
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

  return {
    ROOM_TEMPLATES,
    DEFAULT_CONNECTIONS,
    getTemplate,
    generateDoors,
    calcWallPosition,
    getSpawnPoint,
    applyConnections,
    getConnectedRoom,
    listTemplateTypes
  };

})();
