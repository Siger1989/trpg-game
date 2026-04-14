/**
 * 房间交互系统 V1
 * 统一执行器：文本输入、UI热点、空间位置、对象状态、反馈文本全部基于同一套状态模型
 *
 * 核心原则：
 * - AI不能直接决定房间交互结果
 * - 所有交互先经本地规则层：输入分类→目标绑定→可见性→距离→动作合法性→反馈文本
 * - 当前版本不支持自动移动，超距一律返回"需要先靠近"
 *
 * 模块：RoomState / InputClassifier / TargetBinder / ActionValidator / ActionExecutor / TextPresenter
 */

const RoomInteraction = (() => {

  // ========== 1. 类型常量 ==========

  const InputIntent = {
    DESCRIBE: 'describe',
    MOVE: 'move',
    INTERACT: 'interact',
    COMPOSITE: 'composite',
    FLAVOR: 'flavor',
    UNKNOWN: 'unknown'
  };

  const ActionResultCode = {
    OK: 'OK',
    TARGET_NOT_FOUND: 'TARGET_NOT_FOUND',
    TARGET_NOT_VISIBLE: 'TARGET_NOT_VISIBLE',
    OUT_OF_RANGE: 'OUT_OF_RANGE',
    ACTION_NOT_ALLOWED: 'ACTION_NOT_ALLOWED',
    AP_NOT_ENOUGH: 'AP_NOT_ENOUGH',
    AMBIGUOUS_TARGET: 'AMBIGUOUS_TARGET',
    UNKNOWN: 'UNKNOWN'
  };

  // ========== 2. RoomState 构建 ==========

  /**
   * 从SceneManager的sceneObjects构建RoomState快照
   * @param {Array} sceneObjects - SceneManager.sceneObjects
   * @param {{x:number, z:number}} playerPos - 玩家格子坐标
   * @param {Object} scene - DMEngine.getCurrentScene()
   * @returns {Object} RoomState
   */
  function buildRoomState(sceneObjects, playerPos, scene) {
    const objects = (sceneObjects || []).map(obj => {
      const id = obj.id || `${obj.type}_${obj.gridX}_${obj.gridZ}`;
      return {
        id: id,
        name: obj.name || obj.type,
        aliases: obj.aliases || [obj.name || obj.type],
        type: obj.isLight ? 'interactive' : (obj.type === 'door' ? 'exit' : 'interactive'),
        objType: obj.type, // 保留原始类型用于执行

        position: { x: obj.gridX || 0, y: obj.gridZ || 0 },
        visible: true,
        discovered: true,
        reachable: !obj.blockMove,
        interactable: true,
        interactionRange: obj.interactionRange || 1.5,

        availableActions: mapAvailableActions(obj.availableActions || [], obj),
        state: {
          isOn: obj.isOn || false,
          isLight: obj.isLight || false,
          isOpen: obj.isOn || false,
          blockMove: obj.blockMove || false,
          searched: false
        },
        description: '',

        // 保留原始引用，用于执行时修改真实状态
        _ref: obj
      };
    });

    return {
      roomId: scene?.id || scene?.room || 'unknown',
      roomName: scene?.name || '未知房间',
      playerPosition: { x: playerPos?.x || 0, y: playerPos?.z || 0 },
      playerFacing: 'NE',
      ap: (typeof DMEngine !== 'undefined' && DMEngine.getAP) ? DMEngine.getAP().current : 2,
      turn: 1,
      objects: objects
    };
  }

  /**
   * 将scene-manager的availableActions映射为文档定义的ActionType
   * toggle_light → turn_on/turn_off/ignite/extinguish
   * investigate/inspect → inspect
   * open → open
   * search → inspect
   */
  function mapAvailableActions(actions, obj) {
    const mapped = [];
    for (const a of actions) {
      switch (a) {
        case 'toggle_light':
          // 灯类：turn_on/turn_off；壁炉/蜡烛：ignite/extinguish
          if (obj.type === 'fireplace' || obj.type === 'candle') {
            mapped.push('ignite');
            mapped.push('extinguish');
          } else {
            mapped.push('turn_on');
            mapped.push('turn_off');
          }
          break;
        case 'investigate':
        case 'inspect':
        case 'search':
          if (!mapped.includes('inspect')) mapped.push('inspect');
          break;
        case 'open':
          mapped.push('open');
          break;
        default:
          mapped.push(a);
      }
    }
    if (mapped.length === 0) mapped.push('inspect');
    return mapped;
  }

  // ========== 3. InputClassifier — 输入分类 ==========

  function classifyInput(text) {
    const t = text.trim();

    // describe: 观察环境
    if (/什么样|看看|四周|这里有什么|有门吗|有出口吗|房间|出口|我现在在哪|环境|周围|有什么|描述/.test(t)) {
      return InputIntent.DESCRIBE;
    }

    // composite: 同时包含"靠近/过去"和"执行动作"
    if (/(去|走到|走向|靠近|过去|走过去|跑过去).*(调查|查看|开灯|生火|点燃|进入|打开|检查|搜)/.test(t)) {
      return InputIntent.COMPOSITE;
    }
    // "我去开灯" "我去调查" 等简短复合
    if (/我去*(开灯|生火|调查|查看|检查|打开|点燃|搜)/.test(t)) {
      return InputIntent.COMPOSITE;
    }

    // interact: 对明确目标执行动作
    if (/开灯|关灯|调查|查看|观察|生火|点燃|点火|推|进入|出去|离开|打开|关上|检查|搜索|翻|拿|取|搬|吹灭|熄火/.test(t)) {
      return InputIntent.INTERACT;
    }

    // move: 仅表达移动意图
    if (/往左|往右|往前|往后|移动|走|靠近|去|过来|过去/.test(t)) {
      return InputIntent.MOVE;
    }

    // flavor: 情绪或氛围输入
    if (/阴森|害怕|紧张|小心|恐惧|不安|可怕|恐怖|冷|发抖/.test(t)) {
      return InputIntent.FLAVOR;
    }

    return InputIntent.UNKNOWN;
  }

  // ========== 4. 动词解析 ==========

  function parseVerb(text) {
    const t = text.trim();
    // 顺序很重要：先匹配更具体的
    if (/吹灭|熄火|关灯|关掉/.test(t)) return 'turn_off';
    if (/开灯|打开灯|点灯|开灯/.test(t)) return 'turn_on';
    if (/生火|点燃|点火/.test(t)) return 'ignite';
    if (/调查|查看|观察|检查|搜索|翻|搜/.test(t)) return 'inspect';
    if (/进入|出去|离开/.test(t)) return 'enter';
    if (/打开|开/.test(t)) return 'open';
    if (/推/.test(t)) return 'push';
    if (/靠近|走到|走向|过去|过来/.test(t)) return 'approach';
    return undefined;
  }

  // ========== 5. TargetBinder — 目标绑定 ==========

  /**
   * 绑定顺序：
   * 1. 别名或名称直接命中
   * 2. 动作唯一反推
   * 3. 多目标冲突→报歧义
   * 4. 无法确认→找不到目标
   */
  function bindTarget(text, verb, room) {
    const candidates = room.objects.filter(o => o.visible && o.discovered);

    // 1. 别名或名称直接命中
    for (const obj of candidates) {
      const allNames = [obj.name, ...obj.aliases];
      for (const alias of allNames) {
        if (alias && text.includes(alias)) {
          return obj;
        }
      }
    }

    // 2. 动作唯一反推
    if (verb) {
      const actionCandidates = candidates.filter(o => o.availableActions.includes(verb));
      if (actionCandidates.length === 1) {
        return actionCandidates[0];
      }
      if (actionCandidates.length > 1) {
        // 多目标冲突→返回歧义标记对象
        return { id: '__AMBIGUOUS__', name: '多个目标', ambiguous: true, candidates: actionCandidates };
      }
    }

    return null;
  }

  // ========== 6. 解析总函数 ==========

  function parseAction(text, room) {
    const intent = classifyInput(text);
    const verb = parseVerb(text);
    const target = bindTarget(text, verb, room);

    return {
      intent: intent,
      verb: verb,
      targetId: target ? target.id : undefined,
      target: target,
      rawText: text
    };
  }

  // ========== 7. 距离判定 ==========

  function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function isInRange(playerPos, obj) {
    return distance(playerPos, obj.position) <= obj.interactionRange;
  }

  // ========== 8. describeRoom — 场景描述 ==========

  function describeRoom(room) {
    const visible = room.objects.filter(o => o.visible);
    const parts = [];

    parts.push(`你正身处${room.roomName}。`);

    // 按类型分组描述
    const lights = visible.filter(o => o.state.isLight);
    const doors = visible.filter(o => o.objType === 'door');
    const furniture = visible.filter(o => !o.state.isLight && o.objType !== 'door');
    const litLights = lights.filter(o => o.state.isOn);
    const unlitLights = lights.filter(o => !o.state.isOn);

    if (litLights.length > 0) {
      const names = litLights.map(o => o.name).join('、');
      parts.push(`${names}正亮着，光芒驱散了部分黑暗。`);
    }
    if (unlitLights.length > 0) {
      const names = unlitLights.map(o => o.name).join('、');
      parts.push(`${names}暗着，似乎可以点亮。`);
    }
    if (doors.length > 0) {
      const doorNames = doors.map(o => o.name).join('、');
      parts.push(`房间里有${doorNames}。`);
    }
    if (furniture.length > 0) {
      const furnNames = furniture.map(o => o.name).join('、');
      parts.push(`周围还能看到${furnNames}。`);
    }

    // 出口提示
    const exits = visible.filter(o => o.availableActions.includes('enter'));
    if (exits.length > 0) {
      parts.push('房间边缘有可以通行的出口。');
    }

    return parts.join('');
  }

  // ========== 9. 超距反馈模板 ==========

  function buildOutOfRangeMessage(target, parsed) {
    const name = target.name;
    switch (parsed.verb) {
      case 'turn_on':
        return `你看见${name}了，但它离你还有几步，暂时够不着。先移动到附近再尝试操作。`;
      case 'turn_off':
        return `你看见${name}还亮着，但离得太远够不到。先走近些。`;
      case 'ignite':
        return `你看向${name}，但你现在还没走到它旁边。先靠近它，再尝试生火。`;
      case 'extinguish':
        return `${name}还在燃烧，但你离得太远。先走近些再尝试熄灭。`;
      case 'inspect':
        return `你能看见${name}，但离得还不够近，暂时没法仔细调查。`;
      case 'enter':
        return `出口就在那边，但你还没走到门口。`;
      case 'open':
        return `你看见${name}了，但距离太远。先走近些再尝试打开。`;
      case 'approach':
        return `目标就在前方，请使用移动模式靠近。`;
      default:
        return `你看见${name}了，但现在距离还不够近。`;
    }
  }

  // ========== 10. ActionExecutor — 动作执行 ==========

  /**
   * 执行动作并修改真实场景状态
   * 所有状态修改都在这里完成，不依赖大模型
   */
  function performAction(target, verb, room) {
    if (!verb) {
      return {
        success: false,
        code: ActionResultCode.UNKNOWN,
        targetId: target.id,
        verb: verb,
        message: '你试着做点什么，但动作还不够明确。'
      };
    }

    const ref = target._ref; // 原始sceneObject引用

    // inspect: 调查检定
    if (verb === 'inspect') {
      // AP消耗由外层处理（game.js的sendPlayerInput已经扣了1AP）
      // 这里不重复扣AP
      return performInspect(target, ref, room);
    }

    // turn_on: 开灯类
    if (verb === 'turn_on' && target.state.isLight) {
      if (target.state.isOn) {
        return {
          success: false,
          code: ActionResultCode.ACTION_NOT_ALLOWED,
          targetId: target.id,
          verb: verb,
          message: `${target.name}已经亮着了。`
        };
      }
      // 执行开灯
      if (ref && typeof SceneManager !== 'undefined' && SceneManager.toggleObjectLight) {
        SceneManager.toggleObjectLight(ref.gridX, ref.gridZ);
      }
      target.state.isOn = true;
      return {
        success: true,
        code: ActionResultCode.OK,
        targetId: target.id,
        verb: verb,
        message: buildTurnOnMessage(target)
      };
    }

    // turn_off: 关灯类
    if (verb === 'turn_off' && target.state.isLight) {
      if (!target.state.isOn) {
        return {
          success: false,
          code: ActionResultCode.ACTION_NOT_ALLOWED,
          targetId: target.id,
          verb: verb,
          message: `${target.name}本来就是暗的。`
        };
      }
      if (ref && typeof SceneManager !== 'undefined' && SceneManager.toggleObjectLight) {
        SceneManager.toggleObjectLight(ref.gridX, ref.gridZ);
      }
      target.state.isOn = false;
      return {
        success: true,
        code: ActionResultCode.OK,
        targetId: target.id,
        verb: verb,
        message: buildTurnOffMessage(target)
      };
    }

    // ignite: 点燃（壁炉/蜡烛）
    if (verb === 'ignite' && target.state.isLight) {
      if (target.state.isOn) {
        return {
          success: false,
          code: ActionResultCode.ACTION_NOT_ALLOWED,
          targetId: target.id,
          verb: verb,
          message: `${target.name}已经点着了。`
        };
      }
      if (ref && typeof SceneManager !== 'undefined' && SceneManager.toggleObjectLight) {
        SceneManager.toggleObjectLight(ref.gridX, ref.gridZ);
      }
      target.state.isOn = true;
      return {
        success: true,
        code: ActionResultCode.OK,
        targetId: target.id,
        verb: verb,
        message: buildIgniteMessage(target)
      };
    }

    // extinguish: 熄灭
    if (verb === 'extinguish' && target.state.isLight) {
      if (!target.state.isOn) {
        return {
          success: false,
          code: ActionResultCode.ACTION_NOT_ALLOWED,
          targetId: target.id,
          verb: verb,
          message: `${target.name}没有在燃烧。`
        };
      }
      if (ref && typeof SceneManager !== 'undefined' && SceneManager.toggleObjectLight) {
        SceneManager.toggleObjectLight(ref.gridX, ref.gridZ);
      }
      target.state.isOn = false;
      return {
        success: true,
        code: ActionResultCode.OK,
        targetId: target.id,
        verb: verb,
        message: buildExtinguishMessage(target)
      };
    }

    // open: 开门/开箱
    if (verb === 'open') {
      if (target.objType === 'door') {
        if (target.state.isOpen) {
          return {
            success: false,
            code: ActionResultCode.ACTION_NOT_ALLOWED,
            targetId: target.id,
            verb: verb,
            message: `${target.name}已经开着了。`
          };
        }
        if (ref && typeof SceneManager !== 'undefined' && SceneManager.toggleDoor) {
          SceneManager.toggleDoor(ref.gridX, ref.gridZ);
        }
        target.state.isOpen = true;
        return {
          success: true,
          code: ActionResultCode.OK,
          targetId: target.id,
          verb: verb,
          message: `你推开了${target.name}，门轴发出刺耳的声响。`
        };
      }
      // 其他可打开物件（箱子等）
      return {
        success: true,
        code: ActionResultCode.OK,
        targetId: target.id,
        verb: verb,
        message: `你打开了${target.name}，仔细查看了里面的内容。`
      };
    }

    // enter: 进入出口
    if (verb === 'enter') {
      return {
        success: true,
        code: ActionResultCode.OK,
        targetId: target.id,
        verb: verb,
        message: `你朝${target.name}走去，准备离开这个房间。`
      };
    }

    // approach: 靠近（当前版本不自动移动）
    if (verb === 'approach') {
      return {
        success: false,
        code: ActionResultCode.OUT_OF_RANGE,
        targetId: target.id,
        verb: verb,
        message: `请使用移动模式靠近${target.name}。`,
        uiHint: {
          highlightTargetId: target.id,
          suggestedAction: '先移动靠近目标'
        }
      };
    }

    // push: 推
    if (verb === 'push') {
      return {
        success: true,
        code: ActionResultCode.OK,
        targetId: target.id,
        verb: verb,
        message: `你用力推了推${target.name}，但它纹丝不动。`
      };
    }

    // 兜底
    return {
      success: false,
      code: ActionResultCode.UNKNOWN,
      targetId: target.id,
      verb: verb,
      message: '你试着这么做了，但暂时没有发生什么。'
    };
  }

  // ========== 11. 调查检定 ==========

  function performInspect(target, ref, room) {
    // CoC技能检定
    let skillName = '侦查';
    const skillMap = {
      bookshelf: '图书馆使用', desk: '图书馆使用', table: '侦查',
      chest: '锁匠', crate: '侦查', barrel: '侦查',
      altar: '神秘学', statue: '神秘学', mirror: '侦查',
      painting: '艺术', wardrobe: '侦查', bed: '侦查',
      skeleton: '医学', rug: '侦查', fireplace: '侦查',
      lamp: '侦查', candle: '侦查', door: '侦查'
    };
    skillName = skillMap[target.objType] || '侦查';

    let checkResult = null;
    let skillValue = 25;
    if (typeof CoCRules !== 'undefined') {
      const player = (typeof GameState !== 'undefined') ? GameState.getPlayer() : null;
      if (player && player.skills && player.skills[skillName] !== undefined) {
        skillValue = player.skills[skillName];
      } else if (player && player.stats && typeof CoCRules.calcSkillBase === 'function') {
        skillValue = CoCRules.calcSkillBase(skillName, player.stats);
      }
      if (typeof CoCRules.rollCheck === 'function') {
        checkResult = CoCRules.rollCheck(skillValue);
      }
    }

    let message = '';
    if (checkResult) {
      message = `[${skillName}检定: ${checkResult.roll}/${skillValue} → ${checkResult.result}] `;
      if (checkResult.isSuccess) {
        const discoveries = [
          `你在${target.name}上发现了值得注意的痕迹...`,
          `仔细检查${target.name}后，你找到了一些线索。`,
          `${target.name}中隐藏着不为人知的秘密...`,
          `你对${target.name}的检查有了收获！`
        ];
        message += discoveries[Math.floor(Math.random() * discoveries.length)];
      } else {
        message += `你仔细检查了${target.name}，但没有发现什么特别的东西。`;
      }
    } else {
      // 无CoCRules时降级
      message = `你仔细调查了${target.name}。`;
    }

    return {
      success: true,
      code: ActionResultCode.OK,
      targetId: target.id,
      verb: 'inspect',
      message: message
    };
  }

  // ========== 12. 反馈文本模板 ==========

  function buildTurnOnMessage(target) {
    const templates = {
      lamp: '你伸手拧亮了灯，光芒驱散了周围的黑暗。',
      candle: '你点燃了蜡烛，微弱的烛光摇曳着亮了起来。',
      fireplace: '你点燃了壁炉，火焰很快蔓延开来，温暖的光照亮了周围。'
    };
    return templates[target.objType] || '你打开了照明，光芒驱散了黑暗。';
  }

  function buildTurnOffMessage(target) {
    const templates = {
      lamp: '你关掉了灯，黑暗重新笼罩。',
      candle: '你吹灭了蜡烛，黑暗重新涌来。',
      fireplace: '你熄灭了壁炉，房间重新陷入黑暗。'
    };
    return templates[target.objType] || '你关掉了光源，黑暗重新笼罩。';
  }

  function buildIgniteMessage(target) {
    const templates = {
      fireplace: '你蹲下身尝试点燃壁炉。火焰很快在可燃物上蔓延开来，温暖的光照亮了周围。',
      candle: '你划亮火柴点燃了蜡烛，微弱的火光跳动着亮了起来。'
    };
    return templates[target.objType] || '你成功点燃了它，光芒驱散了部分黑暗。';
  }

  function buildExtinguishMessage(target) {
    const templates = {
      fireplace: '你用旁边的工具熄灭了壁炉的火焰，房间重新陷入黑暗和寒冷。',
      candle: '你轻轻吹灭了蜡烛，黑暗重新涌来。'
    };
    return templates[target.objType] || '你熄灭了光源，黑暗重新笼罩。';
  }

  // ========== 13. 主执行器 ==========

  /**
   * 统一执行器 — 所有交互入口必须走这里
   * @param {string} text - 玩家输入文本
   * @param {Object} room - RoomState快照
   * @returns {Object} ActionResult
   */
  function executePlayerInput(text, room) {
    if (!text || !room) return null;

    const parsed = parseAction(text, room);

    // describe: 观察环境
    if (parsed.intent === InputIntent.DESCRIBE) {
      return {
        success: true,
        code: ActionResultCode.OK,
        message: describeRoom(room)
      };
    }

    // flavor: 情绪氛围
    if (parsed.intent === InputIntent.FLAVOR) {
      const flavorMsgs = [
        '你压低呼吸，谨慎地观察着周围。',
        '你感到一阵不安，但努力让自己镇定下来。',
        '你屏住呼吸，竖起耳朵仔细聆听。',
        '黑暗中似乎有什么在注视着你，你下意识地握紧了拳头。'
      ];
      return {
        success: true,
        code: ActionResultCode.OK,
        message: flavorMsgs[Math.floor(Math.random() * flavorMsgs.length)]
      };
    }

    // move: 纯移动意图
    if (parsed.intent === InputIntent.MOVE) {
      return {
        success: true,
        code: ActionResultCode.OK,
        message: '请使用移动模式（按M或点击🚶按钮）靠近目标位置。'
      };
    }

    // 交互类无目标
    if ((parsed.intent === InputIntent.INTERACT || parsed.intent === InputIntent.COMPOSITE) && !parsed.targetId) {
      return {
        success: false,
        code: ActionResultCode.TARGET_NOT_FOUND,
        message: '你环顾四周，没有发现符合这个描述的目标。'
      };
    }

    // 歧义目标
    if (parsed.target && parsed.target.ambiguous) {
      const names = parsed.target.candidates.map(o => o.name).join('、');
      return {
        success: false,
        code: ActionResultCode.AMBIGUOUS_TARGET,
        message: `这里有多个可能的目标（${names}），请更具体地说明你想操作哪一个。`
      };
    }

    const target = room.objects.find(o => o.id === parsed.targetId);
    if (!target) {
      return {
        success: false,
        code: ActionResultCode.TARGET_NOT_FOUND,
        message: '你环顾四周，没有发现符合这个描述的目标。'
      };
    }

    // 可见性判定
    if (!target.visible || !target.discovered) {
      return {
        success: false,
        code: ActionResultCode.TARGET_NOT_VISIBLE,
        targetId: target.id,
        verb: parsed.verb,
        message: '你暂时还没有注意到这个目标。',
        uiHint: { highlightTargetId: target.id }
      };
    }

    // 不可交互
    if (!target.interactable) {
      return {
        success: false,
        code: ActionResultCode.ACTION_NOT_ALLOWED,
        targetId: target.id,
        verb: parsed.verb,
        message: `你能看见${target.name}，但它现在无法操作。`,
        uiHint: { highlightTargetId: target.id }
      };
    }

    // 动作合法性判定
    if (parsed.verb && !target.availableActions.includes(parsed.verb)) {
      return {
        success: false,
        code: ActionResultCode.ACTION_NOT_ALLOWED,
        targetId: target.id,
        verb: parsed.verb,
        message: `你能看见${target.name}，但它并不能这样操作。`,
        uiHint: { highlightTargetId: target.id }
      };
    }

    // 距离判定（composite和interact都要检查）
    const inRange = isInRange(room.playerPosition, target);
    if (!inRange) {
      return {
        success: false,
        code: ActionResultCode.OUT_OF_RANGE,
        targetId: target.id,
        verb: parsed.verb,
        message: buildOutOfRangeMessage(target, parsed),
        uiHint: {
          highlightTargetId: target.id,
          suggestedAction: '先移动靠近目标'
        }
      };
    }

    // AP判定（inspect/interact消耗AP，describe/flavor不消耗）
    // 注意：AP扣除由game.js负责，这里只做检查
    if (parsed.verb && parsed.verb !== 'approach' && room.ap <= 0) {
      return {
        success: false,
        code: ActionResultCode.AP_NOT_ENOUGH,
        targetId: target.id,
        verb: parsed.verb,
        message: '你知道该怎么做，但你现在行动点不足。',
        uiHint: { highlightTargetId: target.id }
      };
    }

    // 执行动作
    return performAction(target, parsed.verb, room);
  }

  // ========== 14. UIAdapter — 热点文本生成 ==========

  /**
   * 根据对象支持的动作生成UI标签文本
   */
  function getActionLabel(obj) {
    if (!obj) return '';
    const actions = obj.availableActions || [];
    if (actions.includes('turn_on') || actions.includes('ignite')) {
      return obj.state.isOn ? '💡 关灯' : '💡 开灯';
    }
    if (actions.includes('open')) {
      return obj.state.isOpen ? '🚪 关门' : '🚪 打开';
    }
    if (actions.includes('inspect')) {
      return `🔍 调查${obj.name}`;
    }
    return `🔍 查看`;
  }

  // ========== 15. 导出 ==========

  return {
    buildRoomState,
    executePlayerInput,
    classifyInput,
    parseVerb,
    parseAction,
    bindTarget,
    describeRoom,
    getActionLabel,
    // 常量导出（供测试用）
    InputIntent,
    ActionResultCode
  };

})();
