/**
 * 房间交互系统 V1 — 统一交互执行器
 * 
 * 核心原则：
 * - 所有交互入口（文本输入/UI热点/快捷键）必须走同一个执行器
 * - 规则层优先，文本层只负责表达
 * - AI不能直接决定房间交互结果
 * - 当前版本不支持自动移动，超距一律返回"需要先靠近"
 * 
 * 模块：RoomState / InputClassifier / TargetBinder / ActionValidator / ActionExecutor / TextPresenter
 */

const RoomInteraction = (() => {

  // ========== 1. 类型定义（JS注释形式） ==========
  // ActionResultCode: "OK" | "TARGET_NOT_FOUND" | "TARGET_NOT_VISIBLE" |
  //   "OUT_OF_RANGE" | "ACTION_NOT_ALLOWED" | "AP_NOT_ENOUGH" | "AMBIGUOUS_TARGET" | "UNKNOWN"
  // InputIntent: "describe" | "move" | "interact" | "composite" | "flavor" | "unknown"
  // ActionType: "inspect" | "turn_on" | "ignite" | "turn_off" | "extinguish" |
  //   "push" | "enter" | "approach" | "investigate" | "search" | "open" | "toggle_light"

  // ========== 2. 输入分类器 ==========
  function classifyInput(text) {
    const t = text.trim();

    // describe — 观察环境，不执行对象动作
    if (/什么样|看看|四周|这里有什么|有门吗|有出口吗|房间|出口|我现在在哪|环境|周围|场景/.test(t)) {
      return 'describe';
    }

    // composite — 同时包含"靠近/过去"和"执行动作"
    if (/(去|走到|走向|靠近|过去|过来).*(调查|查看|开灯|生火|点燃|进入|检查|搜索|打开|翻开)/.test(t)) {
      return 'composite';
    }
    // "我去开灯" "我去调查" 等简短复合
    if (/我去|我想去|我要去/.test(t) && /(调查|查看|开灯|生火|点燃|进入|检查|搜索|打开|翻开)/.test(t)) {
      return 'composite';
    }

    // interact — 对明确目标执行动作
    if (/开灯|关灯|打开灯|点灯|调查|查看|观察|生火|点燃|点火|进入|出去|离开|推|检查|搜索|打开|翻开|吹灭|熄火|关掉/.test(t)) {
      return 'interact';
    }

    // move — 仅表达移动意图
    if (/往左|往右|往前|往后|移动|走|靠近|去|走向|走到/.test(t)) {
      return 'move';
    }

    // flavor — 情绪或氛围输入
    if (/阴森|害怕|紧张|小心|恐怖|可怕|不安|恐惧|发抖|冷/.test(t)) {
      return 'flavor';
    }

    return 'unknown';
  }

  // ========== 3. 动词解析 ==========
  function parseVerb(text) {
    const t = text.trim();

    // 灯光操作
    if (/开灯|打开灯|点灯/.test(t)) return 'turn_on';
    if (/关灯|关掉灯/.test(t)) return 'turn_off';

    // 火焰操作
    if (/生火|点燃|点火/.test(t)) return 'ignite';
    if (/吹灭|熄火/.test(t)) return 'extinguish';

    // 调查/检查
    if (/调查|查看|观察|检查/.test(t)) return 'inspect';

    // 搜索
    if (/搜索|翻开|翻找/.test(t)) return 'search';

    // 开门/打开
    if (/打开|推开/.test(t)) return 'open';

    // 进入/离开
    if (/进入|出去|离开/.test(t)) return 'enter';

    // 靠近
    if (/靠近|走到|走向|过去|过来/.test(t)) return 'approach';

    // 推
    if (/推/.test(t)) return 'push';

    // toggle_light — 兼容旧动作名
    if (/开关灯|切换灯/.test(t)) return 'toggle_light';

    return undefined;
  }

  // ========== 4. 目标绑定器 ==========
  /**
   * 绑定顺序：
   * 1. 别名/名称直接命中
   * 2. 动作唯一反推（只有一个对象支持该动作）
   * 3. 多目标冲突报歧义
   * 4. 无法确认报找不到
   */
  function bindTarget(text, verb, room) {
    const candidates = room.objects.filter(o => o.visible && o.discovered);

    // 1. 别名或名称直接命中
    const directMatches = [];
    for (const obj of candidates) {
      const names = [obj.name, ...(obj.aliases || [])];
      // 按匹配长度降序排列，优先匹配更具体的名称
      for (const alias of names) {
        if (alias && text.includes(alias)) {
          directMatches.push({ obj, aliasLen: alias.length });
        }
      }
    }
    if (directMatches.length > 0) {
      // 按别名长度降序，优先匹配更具体的
      directMatches.sort((a, b) => b.aliasLen - a.aliasLen);
      return directMatches[0].obj;
    }

    // 2. 动作唯一反推
    if (verb) {
      // 将文档动作映射到对象availableActions
      const actionMap = mapVerbToActions(verb);
      const actionCandidates = candidates.filter(o => {
        const actions = o.availableActions || [];
        return actionMap.some(a => actions.includes(a));
      });
      if (actionCandidates.length === 1) {
        return actionCandidates[0];
      }
      if (actionCandidates.length > 1) {
        // 歧义：返回特殊标记
        return { _ambiguous: true, candidates: actionCandidates };
      }
    }

    return null;
  }

  /**
   * 将文档级动词映射到对象的availableActions
   * turn_on/turn_off → toggle_light
   * ignite/extinguish → toggle_light（火焰类物件）
   * inspect → inspect/investigate
   * search → search
   * open → open
   */
  function mapVerbToActions(verb) {
    switch (verb) {
      case 'turn_on':
      case 'turn_off':
      case 'toggle_light':
        return ['toggle_light'];
      case 'ignite':
      case 'extinguish':
        return ['toggle_light', 'ignite'];
      case 'inspect':
        return ['inspect', 'investigate'];
      case 'search':
        return ['search', 'investigate'];
      case 'open':
        return ['open'];
      case 'enter':
        return ['enter'];
      case 'push':
        return ['push'];
      default:
        return [verb];
    }
  }

  // ========== 5. 距离判定 ==========
  function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function isInRange(playerPos, obj) {
    return distance(playerPos, obj.position) <= obj.interactionRange;
  }

  // ========== 6. RoomState构建 ==========
  /**
   * 从SceneManager的sceneObjects构建RoomState
   * @param {Array} sceneObjects - SceneManager.sceneObjects
   * @param {{x:number, z:number}} playerPos - 玩家格子坐标
   * @param {Object} scene - DMEngine.getCurrentScene()
   * @returns {Object} RoomState
   */
  function buildRoomState(sceneObjects, playerPos, scene) {
    const objects = (sceneObjects || []).map(obj => {
      // 判断可见性和发现状态
      // 当前MVP：所有场景对象默认可见和已发现
      // 未来接入迷雾系统后，根据FogOfWar状态判断
      const visible = true; // TODO: 接入FogOfWar
      const discovered = true; // TODO: 接入FogOfWar

      // 判断可交互性
      const interactable = visible && discovered && (obj.availableActions || []).length > 0;

      // 对象类型分类
      let objType = 'decoration';
      if (obj.isLight || obj.type === 'door') {
        objType = 'interactive';
      } else if ((obj.availableActions || []).length > 0) {
        objType = 'interactive';
      }

      // 对象状态
      const state = {};
      if (obj.isLight) {
        state.on = obj.isOn || false;
        state.lit = obj.isOn || false;
      }
      if (obj.type === 'door') {
        state.open = obj.isOn || false; // door的isOn表示isOpen
      }
      if (obj.type === 'chest' || obj.type === 'crate' || obj.type === 'wardrobe') {
        state.searched = false;
        state.open = obj.isOn || false;
      }

      // 将availableActions中的旧动作名映射到文档动作名
      const docActions = (obj.availableActions || []).map(a => {
        if (a === 'toggle_light') return obj.isLight ? (obj.isOn ? 'turn_off' : 'turn_on') : 'toggle_light';
        if (a === 'investigate') return 'inspect';
        return a;
      });
      // 去重
      const uniqueActions = [...new Set(docActions)];

      return {
        id: obj.id || `${obj.type}_${obj.gridX}_${obj.gridZ}`,
        name: obj.name || obj.type,
        aliases: obj.aliases || [obj.name || obj.type],
        type: objType,
        position: { x: obj.gridX || 0, y: obj.gridZ || 0 },
        visible,
        discovered,
        reachable: visible, // MVP: 可见=可达
        interactable,
        interactionRange: obj.interactionRange || 1.5,
        availableActions: uniqueActions,
        state,
        description: obj.hint || '',
        // 保留原始引用，供ActionExecutor修改真实状态
        _ref: obj
      };
    });

    // 获取AP
    let ap = 2;
    if (typeof DMEngine !== 'undefined' && DMEngine.getAP) {
      const apData = DMEngine.getAP();
      ap = apData.current || 2;
    }

    return {
      roomId: scene?.id || scene?.room || 'unknown',
      roomName: scene?.name || '未知房间',
      playerPosition: { x: playerPos?.x || 0, y: playerPos?.z || 0 },
      playerFacing: 'NE', // MVP: 固定朝向
      ap,
      turn: 1, // TODO: 接入回合系统
      objects
    };
  }

  // ========== 7. 动作执行器 ==========
  /**
   * 执行动作，修改真实对象状态
   * 所有状态修改都由此函数完成
   */
  function performAction(target, verb, room) {
    if (!verb) {
      return {
        success: false,
        code: 'UNKNOWN',
        targetId: target.id,
        verb,
        message: '你试着做点什么，但动作还不够明确。'
      };
    }

    const ref = target._ref; // SceneManager中的真实对象引用

    // inspect / investigate — 调查检定
    if (verb === 'inspect') {
      // 不扣AP（由game.js统一扣），只返回调查文案
      const skillMap = {
        bookshelf: '图书馆使用', desk: '图书馆使用', table: '侦查',
        chest: '锁匠', crate: '侦查', barrel: '侦查',
        altar: '神秘学', statue: '神秘学', mirror: '侦查',
        painting: '艺术', wardrobe: '侦查', bed: '侦查',
        skeleton: '医学', rug: '侦查', fireplace: '侦查',
        lamp: '侦查', candle: '侦查', door: '侦查'
      };
      const skill = skillMap[ref?.type] || '侦查';
      let checkResult = null;
      if (typeof CoCRules !== 'undefined' && typeof GameState !== 'undefined') {
        const player = GameState.getPlayer();
        if (player) {
          const skillValue = player.skills[skill] || CoCRules.calcSkillBase(skill, player.stats);
          checkResult = CoCRules.rollCheck(skillValue);
        }
      }

      let message = '';
      if (checkResult) {
        message = `[${skill}检定: ${checkResult.roll}/${checkResult.value} → ${checkResult.result}] `;
        if (checkResult.isSuccess) {
          message += getInspectSuccessText(target, ref);
        } else {
          message += `你仔细检查了${target.name}，但没有发现什么特别的东西。`;
        }
      } else {
        message = getInspectSuccessText(target, ref);
      }

      // 标记已搜索
      if (target.state) target.state.searched = true;

      return {
        success: true,
        code: 'OK',
        targetId: target.id,
        verb,
        message
      };
    }

    // search — 搜索（类似inspect但更侧重发现物品）
    if (verb === 'search') {
      let message = `你仔细搜索了${target.name}...`;
      if (ref?.type === 'bookshelf') {
        message = '你逐一扫过书架上的书脊，有几本引起了你的注意...';
      } else if (ref?.type === 'desk') {
        message = '你拉开书桌的抽屉，翻找着里面的物品...';
      } else if (ref?.type === 'wardrobe') {
        message = '你打开衣柜，在衣物间仔细翻找...';
      }
      if (target.state) target.state.searched = true;
      return {
        success: true,
        code: 'OK',
        targetId: target.id,
        verb,
        message
      };
    }

    // turn_on / ignite — 开灯/生火
    if (verb === 'turn_on' || verb === 'ignite') {
      if (!ref?.isLight) {
        return {
          success: false,
          code: 'ACTION_NOT_ALLOWED',
          targetId: target.id,
          verb,
          message: `${target.name}并不是可以点亮的物件。`
        };
      }
      if (ref.isOn) {
        return {
          success: false,
          code: 'ACTION_NOT_ALLOWED',
          targetId: target.id,
          verb,
          message: `${target.name}已经是亮着的了。`
        };
      }
      // 执行开灯/生火
      if (typeof SceneManager !== 'undefined' && SceneManager.toggleObjectLight) {
        SceneManager.toggleObjectLight(ref.gridX, ref.gridZ);
      }
      const actionText = verb === 'ignite' ? '点燃' : '打开';
      const lightText = ref.type === 'fireplace' ? '火焰很快在可燃物上蔓延开来，微弱的火光照亮了周围。'
        : ref.type === 'candle' ? '你小心翼翼地划亮火柴，点燃了蜡烛。微弱的烛光摇曳着亮了起来。'
        : '光芒驱散了周围的黑暗。';
      return {
        success: true,
        code: 'OK',
        targetId: target.id,
        verb,
        message: `你${actionText}了${target.name}，${lightText}`
      };
    }

    // turn_off / extinguish — 关灯/熄火
    if (verb === 'turn_off' || verb === 'extinguish') {
      if (!ref?.isLight) {
        return {
          success: false,
          code: 'ACTION_NOT_ALLOWED',
          targetId: target.id,
          verb,
          message: `${target.name}并不是可以熄灭的物件。`
        };
      }
      if (!ref.isOn) {
        return {
          success: false,
          code: 'ACTION_NOT_ALLOWED',
          targetId: target.id,
          verb,
          message: `${target.name}并没有亮着。`
        };
      }
      // 执行关灯/熄火
      if (typeof SceneManager !== 'undefined' && SceneManager.toggleObjectLight) {
        SceneManager.toggleObjectLight(ref.gridX, ref.gridZ);
      }
      const actionText = verb === 'extinguish' ? '熄灭了' : '关掉了';
      return {
        success: true,
        code: 'OK',
        targetId: target.id,
        verb,
        message: `你${actionText}${target.name}，黑暗重新笼罩了这片区域。`
      };
    }

    // open — 开门/开箱
    if (verb === 'open') {
      if (ref?.type === 'door') {
        if (ref.isOn) { // door的isOn表示isOpen
          return {
            success: false,
            code: 'ACTION_NOT_ALLOWED',
            targetId: target.id,
            verb,
            message: `${target.name}已经是打开的了。`
          };
        }
        if (typeof SceneManager !== 'undefined' && SceneManager.toggleDoor) {
          SceneManager.toggleDoor(ref.gridX, ref.gridZ);
        }
        return {
          success: true,
          code: 'OK',
          targetId: target.id,
          verb,
          message: `你推开了${target.name}，门轴发出刺耳的声响。`
        };
      }
      // 箱子/衣柜等
      if (target.state?.open) {
        return {
          success: false,
          code: 'ACTION_NOT_ALLOWED',
          targetId: target.id,
          verb,
          message: `${target.name}已经是打开的了。`
        };
      }
      if (target.state) target.state.open = true;
      return {
        success: true,
        code: 'OK',
        targetId: target.id,
        verb,
        message: `你打开了${target.name}。`
      };
    }

    // enter — 进入出口
    if (verb === 'enter') {
      return {
        success: true,
        code: 'OK',
        targetId: target.id,
        verb,
        message: `你朝${target.name}走去，准备离开这个房间。`
      };
    }

    // push — 推
    if (verb === 'push') {
      return {
        success: true,
        code: 'OK',
        targetId: target.id,
        verb,
        message: `你用力推了推${target.name}，但它纹丝不动。`
      };
    }

    // approach — 靠近（当前版本不支持自动移动）
    if (verb === 'approach') {
      return {
        success: false,
        code: 'OUT_OF_RANGE',
        targetId: target.id,
        verb,
        message: `目标就在前方，但当前版本还不支持自动靠近，请手动移动过去。`,
        uiHint: {
          highlightTargetId: target.id,
          suggestedAction: '先移动靠近目标'
        }
      };
    }

    // 未知动作
    return {
      success: false,
      code: 'UNKNOWN',
      targetId: target.id,
      verb,
      message: '你试着这么做了，但暂时没有发生什么。'
    };
  }

  // ========== 8. 调查成功文案生成 ==========
  function getInspectSuccessText(target, ref) {
    const typeTexts = {
      table: '你在桌面上发现了值得注意的痕迹...',
      desk: '你俯身查看书桌，发现了一些被频繁使用的迹象。',
      bookshelf: '你扫过书架上的书脊，有几本引起了你的注意...',
      chest: '你仔细检查了宝箱的锁扣，似乎可以打开。',
      crate: '你翻检了木箱里的杂物，找到了一些有用的东西。',
      barrel: '你检查了桶里的内容物...',
      altar: '祭坛上刻着奇异的符文，散发着一股不祥的气息。',
      statue: '雕像的细节令人不安，似乎在注视着你。',
      mirror: '镜面映出你的身影，但似乎有什么不对劲...',
      painting: '画中的场景令你感到一阵寒意。',
      wardrobe: '衣柜里挂着几件旧衣服，你仔细翻找了一番。',
      bed: '你检查了床铺，在枕头下发现了什么...',
      skeleton: '骸骨的姿态暗示着死前经历了极大的恐惧。',
      rug: '你掀开地毯，发现下面有些异样。',
      fireplace: '壁炉中残留着灰烬，似乎不久前还有人使用过。',
      lamp: '这盏灯看起来还能使用。',
      candle: '蜡烛还剩不少，可以点燃。',
      door: '你仔细检查了门，没有发现陷阱。'
    };
    return typeTexts[ref?.type] || `你在${target.name}上发现了值得注意的痕迹...`;
  }

  // ========== 9. 超距反馈模板 ==========
  function buildOutOfRangeMessage(target, parsed) {
    const name = target.name;
    switch (parsed.verb) {
      case 'turn_on':
        return `你看见${name}了，但它离你还有几步，暂时够不着。先移动到附近再尝试操作。`;
      case 'ignite':
        return `你看向${name}，但你现在还没走到它旁边。先靠近它，再尝试生火。`;
      case 'turn_off':
      case 'extinguish':
        return `你看见${name}还亮着，但离得太远够不着。先靠近一些。`;
      case 'inspect':
        return `你能看见${name}，但离得还不够近，暂时没法仔细调查。`;
      case 'search':
        return `你能看见${name}，但离得太远，没法搜索。先靠近一些。`;
      case 'open':
        return `${name}就在那边，但你还没走到跟前。先靠近它。`;
      case 'enter':
        return `出口就在那边，但你还没走到门口。`;
      case 'approach':
        return `目标就在前方，但当前版本还不支持自动靠近，请手动移动过去。`;
      default:
        return `你看见${name}了，但现在距离还不够近。先靠近一些再试试。`;
    }
  }

  // ========== 10. 场景描述函数 ==========
  function describeRoom(room) {
    const visible = room.objects.filter(o => o.visible);

    // 按类型分组
    const lights = visible.filter(o => o._ref?.isLight);
    const doors = visible.filter(o => o.type === 'door' || o._ref?.type === 'door');
    const furniture = visible.filter(o => !o._ref?.isLight && o._ref?.type !== 'door');
    const litLights = lights.filter(o => o._ref?.isOn);

    const parts = [];

    // 房间基本描述
    parts.push(`你身处${room.roomName}。`);

    // 光照状况
    if (litLights.length > 0) {
      parts.push('房间里有微弱的光源。');
    } else {
      parts.push('四周一片昏暗。');
    }

    // 可见物件
    if (furniture.length > 0) {
      const names = furniture.slice(0, 5).map(o => o.name);
      if (furniture.length <= 3) {
        parts.push(`你能看见${names.join('、')}。`);
      } else {
        parts.push(`你能看见${names.slice(0, 3).join('、')}等物件。`);
      }
    }

    // 灯光物件
    const unlitLights = lights.filter(o => !o._ref?.isOn);
    if (unlitLights.length > 0) {
      const lightNames = unlitLights.map(o => o.name);
      parts.push(`${lightNames.join('、')}还没有点亮。`);
    }

    // 出口
    if (doors.length > 0) {
      parts.push('房间里有门。');
    }

    return parts.join('');
  }

  // ========== 11. 主执行器 ==========
  /**
   * 统一交互执行器 — 所有交互入口必须调用此函数
   * @param {string} text - 玩家输入文本
   * @param {Object} room - RoomState（由buildRoomState构建）
   * @returns {Object} ActionResult
   */
  function executePlayerInput(text, room) {
    if (!text || !room) return null;

    const parsed = parseAction(text, room);

    // describe — 观察环境
    if (parsed.intent === 'describe') {
      return {
        success: true,
        code: 'OK',
        message: describeRoom(room)
      };
    }

    // flavor — 情绪输入
    if (parsed.intent === 'flavor') {
      return {
        success: true,
        code: 'OK',
        message: getFlavorResponse(text)
      };
    }

    // move — 纯移动
    if (parsed.intent === 'move') {
      // 如果有目标，提示用移动模式靠近
      if (parsed.targetId) {
        const target = room.objects.find(o => o.id === parsed.targetId);
        if (target) {
          return {
            success: true,
            code: 'OK',
            message: `请使用移动模式（点击🚶按钮或按M键）靠近${target.name}。`,
            uiHint: { highlightTargetId: target.id }
          };
        }
      }
      return {
        success: true,
        code: 'OK',
        message: '请使用移动模式移动。点击🚶按钮或按M键进入移动模式。'
      };
    }

    // unknown — 无法识别
    if (parsed.intent === 'unknown') {
      // 尝试模糊匹配：看看输入是否包含任何对象别名
      const fuzzyTarget = fuzzyMatchObject(text, room);
      if (fuzzyTarget) {
        // 有模糊匹配结果，当作interact处理
        parsed.intent = 'interact';
        parsed.targetId = fuzzyTarget.id;
        parsed.verb = parsed.verb || 'inspect';
      } else {
        return null; // 返回null，让game.js走AI/DM引擎
      }
    }

    // interact / composite — 交互类
    if (parsed.intent === 'interact' || parsed.intent === 'composite') {
      // 无目标
      if (!parsed.targetId) {
        return {
          success: false,
          code: 'TARGET_NOT_FOUND',
          message: '你环顾四周，没有发现符合这个描述的目标。'
        };
      }

      // 歧义目标
      const targetLookup = room.objects.find(o => o.id === parsed.targetId);
      if (!targetLookup) {
        // 可能是歧义标记
        return {
          success: false,
          code: 'TARGET_NOT_FOUND',
          message: '你环顾四周，有多个目标符合描述，请更具体地指定。'
        };
      }

      const target = targetLookup;

      // 不可见/未发现
      if (!target.visible || !target.discovered) {
        return {
          success: false,
          code: 'TARGET_NOT_VISIBLE',
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
          code: 'ACTION_NOT_ALLOWED',
          targetId: target.id,
          verb: parsed.verb,
          message: `你能看见${target.name}，但它现在无法操作。`,
          uiHint: { highlightTargetId: target.id }
        };
      }

      // 动作不合法
      if (parsed.verb && !isActionAllowed(parsed.verb, target)) {
        return {
          success: false,
          code: 'ACTION_NOT_ALLOWED',
          targetId: target.id,
          verb: parsed.verb,
          message: `你能看见${target.name}，但它并不能这样操作。`,
          uiHint: { highlightTargetId: target.id }
        };
      }

      // 距离检查（composite意图也一样，当前版本不支持自动移动）
      const inRange = isInRange(room.playerPosition, target);
      if (!inRange) {
        return {
          success: false,
          code: 'OUT_OF_RANGE',
          targetId: target.id,
          verb: parsed.verb,
          message: buildOutOfRangeMessage(target, parsed),
          uiHint: {
            highlightTargetId: target.id,
            suggestedAction: '先移动靠近目标'
          }
        };
      }

      // AP检查（inspect不在此处扣AP，由game.js统一处理）
      if (room.ap <= 0 && parsed.verb !== 'inspect') {
        return {
          success: false,
          code: 'AP_NOT_ENOUGH',
          targetId: target.id,
          verb: parsed.verb,
          message: '你知道该怎么做，但你现在行动点不足。',
          uiHint: { highlightTargetId: target.id }
        };
      }

      // 执行动作
      return performAction(target, parsed.verb, room);
    }

    // 兜底
    return null;
  }

  // ========== 12. 解析总函数 ==========
  function parseAction(text, room) {
    const intent = classifyInput(text);
    const verb = parseVerb(text);
    const targetResult = bindTarget(text, verb, room);

    let targetId = undefined;
    if (targetResult) {
      if (targetResult._ambiguous) {
        // 歧义：暂取第一个，但标记歧义
        targetId = targetResult.candidates[0]?.id;
      } else {
        targetId = targetResult.id;
      }
    }

    return {
      intent,
      verb,
      targetId,
      rawText: text
    };
  }

  // ========== 13. 动作合法性检查 ==========
  function isActionAllowed(verb, target) {
    const actions = target.availableActions || [];
    const mapped = mapVerbToActions(verb);
    // 检查映射后的动作是否在对象的可用动作中
    return mapped.some(a => actions.includes(a)) || actions.includes(verb);
  }

  // ========== 14. 模糊匹配 ==========
  function fuzzyMatchObject(text, room) {
    const candidates = room.objects.filter(o => o.visible && o.discovered);
    // 检查输入文本是否部分匹配任何对象名
    for (const obj of candidates) {
      const names = [obj.name, ...(obj.aliases || [])];
      for (const name of names) {
        if (name && (text.includes(name) || name.includes(text))) {
          return obj;
        }
      }
    }
    return null;
  }

  // ========== 15. 情绪响应 ==========
  function getFlavorResponse(text) {
    if (/阴森|恐怖|可怕/.test(text)) return '你感到一阵寒意从脊背升起，这里的氛围确实令人不安。';
    if (/害怕|恐惧|发抖/.test(text)) return '你压低呼吸，努力控制住自己的恐惧。';
    if (/紧张|不安/.test(text)) return '你绷紧了神经，谨慎地观察着周围的一切。';
    if (/小心/.test(text)) return '你放轻脚步，更加小心地审视着环境。';
    if (/冷/.test(text)) return '你感到一阵莫名的寒意，不由得裹紧了衣服。';
    return '你压低呼吸，谨慎地观察着周围。';
  }

  // ========== 公开API ==========
  return {
    buildRoomState,
    executePlayerInput,
    // 以下为测试/调试用
    classifyInput,
    parseVerb,
    bindTarget,
    parseAction,
    describeRoom
  };

})();
