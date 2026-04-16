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
    if (/开灯|关灯|打开灯|点灯|调查|查看|观察|生火|点燃|点火|进入|出去|离开|推|检查|搜索|打开|翻开|吹灭|熄火|关掉|拿|拾取|捡|拾起/.test(t)) {
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

    // 拾取
    if (/拿|拾取|捡|拾起/.test(t)) return 'pickup';

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
    // 曾经见过但当前不在视野内的对象（KNOWN状态）
    const dimCandidates = room.objects.filter(o => !o.visible && o.discovered);

    // 1. 别名或名称直接命中（优先当前可见对象）
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

    // 1.5 在模糊记忆中的对象命中（KNOWN状态）— 返回特殊标记
    for (const obj of dimCandidates) {
      const names = [obj.name, ...(obj.aliases || [])];
      for (const alias of names) {
        if (alias && text.includes(alias)) {
          return { ...obj, _dimlyRemembered: true };
        }
      }
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
      // 判断可见性和发现状态 — 接入FogOfWar
      // EXPLORED(2)=当前可见, KNOWN(1)=曾经见过, UNDISCOVERED(0)=从未发现
      const fogState = (typeof FogOfWar !== 'undefined' && FogOfWar.isInitialized())
        ? FogOfWar.getCellState(obj.gridX || 0, obj.gridZ || 0)
        : 2; // 迷雾未初始化时默认可见
      const visible = fogState === 2;   // EXPLORED = 当前在视野内
      const discovered = fogState >= 1; // KNOWN或EXPLORED = 曾经发现过

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
      roomType: scene?.room || '', // B2: 房间类型，用于描述
      playerPosition: { x: playerPos?.x || 0, y: playerPos?.z || 0 },
      playerFacing: 'NE', // MVP: 固定朝向
      ap,
      turn: 1, // TODO: 接入回合系统
      objects,
      _scene: scene // B2: 保留场景引用，供describeRoom使用
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
      // Phase 4: 检查对象状态机，已resolved的对象不可再调查
      if (typeof DMEngine !== 'undefined' && DMEngine.canSearchObject) {
        if (!DMEngine.canSearchObject(ref?.gridX, ref?.gridZ)) {
          return {
            success: false,
            code: 'ACTION_NOT_ALLOWED',
            targetId: target.id,
            verb,
            message: `你已经彻底调查过${target.name}了，不会再有新的发现。`
          };
        }
      }

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
          // Phase 4: 调查成功→推进对象状态机
          if (typeof DMEngine !== 'undefined' && DMEngine.advanceObjectState) {
            DMEngine.advanceObjectState(ref?.gridX, ref?.gridZ);
          }
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
      // 执行开灯/生火（视觉同步由applyOutcome统一触发）
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
      // 执行关灯/熄火（视觉同步由applyOutcome统一触发）
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
          // 视觉同步由applyOutcome统一触发，此处仅做逻辑校验
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

    // enter — 进入出口（B1: 对接DMEngine房间切换）
    if (verb === 'enter') {
      // 检查目标是否是门且已开启
      if (target.type !== 'door') {
        return {
          success: false,
          code: 'INVALID_TARGET',
          targetId: target.id,
          verb,
          message: `${target.name}不是可以进入的出口。`
        };
      }
      if (!target.isOn) {
        return {
          success: false,
          code: 'DOOR_CLOSED',
          targetId: target.id,
          verb,
          message: `${target.name}是关着的，你需要先打开它。`
        };
      }
      // B1: 调用DMEngine处理门进入
      if (typeof DMEngine !== 'undefined' && DMEngine.handleDoorInteraction) {
        const doorResult = DMEngine.handleDoorInteraction(target.gridX, target.gridZ, 'enter');
        return {
          success: doorResult.success,
          code: doorResult.success ? 'OK' : 'BLOCKED',
          targetId: target.id,
          verb,
          message: doorResult.narration,
          // B1: 传递房间切换元数据
          nextScene: doorResult.nextScene || null,
          connectedRoomId: doorResult.connectedRoomId || null,
          entryFromRoom: doorResult.entryFromRoom || null
        };
      }
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

    // pickup / take — 拾取物品
    if (verb === 'pickup' || verb === 'take') {
      // 检查是否已被拿走
      if (ref?.taken) {
        return {
          success: false,
          code: 'ACTION_NOT_ALLOWED',
          targetId: target.id,
          verb,
          message: `${target.name}已经被拿走了。`
        };
      }
      // 检查是否可拾取（只有特定类型可以拾取）
      const pickupableTypes = ['chest', 'crate', 'barrel', 'bookshelf', 'desk', 'table', 'lamp', 'candle'];
      if (!pickupableTypes.includes(ref?.type)) {
        return {
          success: false,
          code: 'ACTION_NOT_ALLOWED',
          targetId: target.id,
          verb,
          message: `${target.name}无法被拿走。`
        };
      }
      // 执行拾取：标记taken + 加入inventory + 场景移除
      if (ref) ref.taken = true;
      if (typeof DMEngine !== 'undefined' && DMEngine.getInventory) {
        const inv = DMEngine.getInventory();
        const itemName = target.name || ref?.type || '物品';
        if (!inv.includes(itemName)) {
          inv.push(itemName);
        }
      }
      // 从场景移除（视觉上隐藏）
      if (ref) {
        ref.visible = false;
        ref.interactable = false;
      }
      return {
        success: true,
        code: 'OK',
        targetId: target.id,
        verb: 'pickup',
        message: `你拿起了${target.name}，放进了背包。`
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
  // B2: 动态房间描述 — atmosphere感知 + roomType感知 + visited感知 + 物件状态感知 + 玩家距离感知

  // 房间类型→空间描述映射
  const ROOM_TYPE_DESCRIPTIONS = {
    entrance_hall: { first: '一座宽敞的门厅，高挑的天花板让声音在空旷中回荡。', returning: '门厅依旧空旷，脚步声在石板地上回响。', spatial: '大厅四面墙壁环绕' },
    corridor:     { first: '一条狭长的走廊向前延伸，两侧墙壁几乎触手可及。', returning: '走廊依旧幽暗而狭长。', spatial: '走廊向远处延伸' },
    library:      { first: '一间布满书架的房间，空气中弥漫着旧纸张的气味。', returning: '图书馆中陈旧的纸香依旧。', spatial: '书架从墙边一直延伸到房间深处' },
    basement:     { first: '阴冷的地下室，空气中弥漫着潮湿和铁锈的气味。', returning: '地下室的寒意再次包裹了你。', spatial: '低矮的天花板压在头顶' },
    ritual:       { first: '一间令人不安的房间，地面上刻满了奇怪的符文。', returning: '仪式室中不祥的气息依旧浓重。', spatial: '符文在地面上构成某种图案' },
    room_small:   { first: '一间狭小的房间，空间局促得让人有些透不过气。', returning: '小房间里的一切都和记忆中一样。', spatial: '紧凑的空间中' },
    room_medium:  { first: '一间中等大小的房间，陈设简单。', returning: '房间里的布局没有变化。', spatial: '房间中央留有活动空间' },
    room_large:   { first: '一间宽敞的大房间，四周的阴影似乎藏着什么。', returning: '大房间里依旧安静。', spatial: '开阔的空间向四周展开' }
  };

  // 氛围等级→文本描述
  function describeAtmosphere(atmosphere, litCount) {
    if (!atmosphere) return '';
    const fog = atmosphere.fogDensity || 0;
    const ambient = atmosphere.ambientIntensity || 0;
    const lightInt = atmosphere.lightIntensity || 0;
    const parts = [];

    // 雾气描述
    if (fog > 0.028) {
      parts.push('浓重的迷雾几乎吞没了一切，');
    } else if (fog > 0.022) {
      parts.push('薄雾在空气中缓缓流动，');
    } else if (fog > 0.015) {
      parts.push('空气中漂浮着细微的尘埃，');
    }

    // 环境光描述（与灯光叠加）
    if (litCount === 0) {
      if (ambient < 0.2) {
        parts.push('黑暗如潮水般从四面涌来。');
      } else if (ambient < 0.35) {
        parts.push('微弱的光线勉强勾勒出空间的轮廓。');
      }
    } else {
      // 有灯光时，结合灯光强度和环境光描述
      if (lightInt < 0.4) {
        parts.push('光线昏沉，阴影在角落里蠢蠢欲动。');
      } else if (lightInt > 0.7) {
        parts.push('光线充足，房间中的细节一览无余。');
      }
    }

    return parts.join('');
  }

  // 物件状态感知描述
  function describeObjectState(obj) {
    const ref = obj._ref;
    if (!ref) return '';
    const parts = [];

    // 可搜索物件的状态（chest/crate/wardrobe/desk）
    if (ref.type === 'chest' || ref.type === 'crate' || ref.type === 'wardrobe') {
      if (obj.state?.searched) {
        parts.push('，已经被翻找过了');
      } else if (obj.state?.open) {
        parts.push('，盖子敞开着');
      }
    }
    // 书架
    if (ref.type === 'bookshelf' || ref.type === 'desk') {
      if (obj.state?.searched) {
        parts.push('，书已经被翻乱了');
      }
    }
    // 灯光状态补充
    if (ref.isLight) {
      if (ref.isOn) {
        if (ref.type === 'fireplace') parts.push('，火焰跳动着');
        else if (ref.type === 'candle') parts.push('，烛光摇曳');
        else parts.push('，亮着');
      } else {
        parts.push('，熄灭了');
      }
    }

    return parts.join('');
  }

  // 玩家距离→细节等级
  function getProximityDetail(obj, playerPos) {
    if (!playerPos || !obj._ref) return 0; // 0=无距离信息，走旧逻辑
    const dx = (obj._ref.gridX || 0) - playerPos.x;
    const dz = (obj._ref.gridZ || 0) - playerPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= 1.5) return 2;  // 近距离：详细描述
    if (dist <= 3.0) return 1;  // 中距离：正常描述
    return 0;                    // 远距离：简略描述
  }

  // 门目的地提示
  function describeDoorDestination(door, scene) {
    const ref = door._ref;
    if (!ref || !ref.isOn) return ''; // 只对开着的门提供提示
    const connectedId = ref.connectedRoomId || door.connectedRoomId;
    if (!connectedId || !scene) return '';
    // 从gameState.rooms中获取目标房间名
    const gs = (typeof DMEngine !== 'undefined') ? DMEngine.getGameState() : null;
    if (gs && gs.rooms && gs.rooms[connectedId]) {
      const targetName = gs.rooms[connectedId].name;
      if (gs.rooms[connectedId].visited) {
        return `，通向${targetName}`;
      }
      return '，通向未知的方向';
    }
    return '，通向未知的方向';
  }

  /**
   * 动态房间描述 — B2升级版
   * @param {Object} room - RoomState（由buildRoomState构建）
   * @param {Object} [scene] - DMEngine场景数据（含atmosphere/room/narration等）
   * @param {{x:number,z:number}} [playerPos] - 玩家格子坐标
   */
  function describeRoom(room, scene, playerPos) {
    const visible = room.objects.filter(o => o.visible);       // EXPLORED: 当前在视野内
    const knownButHidden = room.objects.filter(o => !o.visible && o.discovered); // KNOWN: 曾经见过但当前不在视野

    // 按类型分组（仅当前可见的）
    const lights = visible.filter(o => o._ref?.isLight);
    const doors = visible.filter(o => o.type === 'door' || o._ref?.type === 'door');
    const furniture = visible.filter(o => !o._ref?.isLight && o._ref?.type !== 'door');
    const litLights = lights.filter(o => o._ref?.isOn);
    const unlitLights = lights.filter(o => !o._ref?.isOn);

    const parts = [];

    // ---- B2-1: 房间类型感知描述 ----
    const roomType = scene?.room || '';
    const typeDesc = ROOM_TYPE_DESCRIPTIONS[roomType];

    // 判断是否首次访问
    const gs = (typeof DMEngine !== 'undefined') ? DMEngine.getGameState() : null;
    const sceneId = scene?.id || room.roomId;
    const isFirstVisit = !gs || !gs.rooms || !gs.rooms[sceneId] || !gs.rooms[sceneId].visited;

    if (typeDesc) {
      if (isFirstVisit) {
        parts.push(typeDesc.first);
      } else {
        parts.push(typeDesc.returning);
      }
    } else {
      // 无模板匹配时用旧逻辑
      parts.push(`你身处${room.roomName}。`);
    }

    // ---- B2-2: 氛围感知描述 ----
    const atmosphereText = describeAtmosphere(scene?.atmosphere, litLights.length);
    if (atmosphereText) {
      parts.push(atmosphereText);
    }

    // ---- A1: 光照状况 — 根据灯光类型和数量动态描述（保留+增强） ----
    if (litLights.length === 0) {
      // 只有在氛围描述没有覆盖"黑暗"时才补充
      if (!atmosphereText || (!atmosphereText.includes('黑暗') && !atmosphereText.includes('昏'))) {
        parts.push('四周一片昏暗，什么都看不太清。');
      }
    } else if (litLights.length === 1) {
      const light = litLights[0];
      const lightName = light.name;
      if (light._ref?.type === 'fireplace') {
        parts.push('壁炉中的火焰跳动着，暖红色的光映在墙壁上，勉强照亮了房间。');
      } else if (light._ref?.type === 'candle') {
        parts.push(`${lightName}的烛光摇曳不定，微弱的光芒在黑暗中挣扎。`);
      } else {
        parts.push(`${lightName}发出昏黄的光，驱散了周围的部分黑暗。`);
      }
    } else {
      // 多个光源
      const lightNames = litLights.map(o => o.name);
      parts.push(`${lightNames.join('和')}的光芒交织在一起，房间比刚才明亮了许多。`);
    }

    // ---- B2-3: 空间布局提示 ----
    if (typeDesc && typeDesc.spatial && isFirstVisit) {
      parts.push(typeDesc.spatial + '。');
    }

    // ---- B2-4: 可见物件 — 玩家距离感知 + 物件状态感知 ----
    if (furniture.length > 0) {
      if (playerPos) {
        // 按距离排序，近的优先描述
        const sorted = [...furniture].sort((a, b) => {
          const da = Math.hypot((a._ref?.gridX || 0) - playerPos.x, (a._ref?.gridZ || 0) - playerPos.z);
          const db = Math.hypot((b._ref?.gridX || 0) - playerPos.x, (b._ref?.gridZ || 0) - playerPos.z);
          return da - db;
        });
        const nearObjs = sorted.filter(o => getProximityDetail(o, playerPos) >= 1);
        const farObjs = sorted.filter(o => getProximityDetail(o, playerPos) === 0);

        if (litLights.length === 0) {
          // 无灯光：模糊辨认
          const dimNames = sorted.slice(0, 2).map(o => o.name);
          parts.push(`黑暗中你隐约能辨认出${dimNames.join('和')}的轮廓。`);
        } else {
          // 近距离物件：带状态描述
          if (nearObjs.length > 0) {
            const nearDescs = nearObjs.slice(0, 3).map(o => {
              const stateText = describeObjectState(o);
              return o.name + stateText;
            });
            parts.push(`近处你能看见${nearDescs.join('、')}。`);
          }
          // 远距离物件：简略
          if (farObjs.length > 0) {
            const farNames = farObjs.slice(0, 3).map(o => o.name);
            if (farObjs.length <= 2) {
              parts.push(`远处还有${farNames.join('和')}。`);
            } else {
              parts.push(`远处还能看到${farNames.join('、')}等物件。`);
            }
          }
        }
      } else {
        // 无玩家位置信息，走旧逻辑
        const names = furniture.slice(0, 5).map(o => o.name);
        if (litLights.length === 0) {
          if (furniture.length <= 2) {
            parts.push(`黑暗中你隐约能辨认出${names.join('和')}的轮廓。`);
          } else {
            parts.push(`黑暗中你隐约能辨认出${names.slice(0, 2).join('和')}等模糊的轮廓。`);
          }
        } else {
          if (furniture.length <= 3) {
            parts.push(`你能看见${names.join('、')}。`);
          } else {
            parts.push(`你能看见${names.slice(0, 3).join('、')}等物件。`);
          }
        }
      }
    }

    // 未点亮的灯光物件
    if (unlitLights.length > 0) {
      const lightNames = unlitLights.map(o => o.name);
      parts.push(`${lightNames.join('、')}还没有点亮。`);
    }

    // ---- B2-5: 出口 — 门状态 + 目的地提示 ----
    if (doors.length > 0) {
      const openDoors = doors.filter(o => o._ref?.isOn); // door的isOn=isOpen
      const closedDoors = doors.filter(o => !o._ref?.isOn);

      if (openDoors.length > 0) {
        // 开着的门：带目的地提示
        const openDescs = openDoors.map(d => {
          const destHint = describeDoorDestination(d, scene);
          return '一扇敞开的门' + destHint;
        });
        if (closedDoors.length > 0) {
          parts.push(openDescs[0] + '，另一扇门紧闭着。');
        } else if (openDoors.length === 1) {
          parts.push(openDescs[0] + '。');
        } else {
          parts.push(openDescs.join('；') + '。');
        }
      } else if (closedDoors.length > 0) {
        // 全部关闭
        if (closedDoors.length === 1) {
          parts.push('一扇门紧闭着。');
        } else {
          parts.push(`${closedDoors.length}扇门都紧闭着。`);
        }
      }
    }

    // 模糊记忆中的物件（KNOWN状态，不在当前视野但曾经见过）
    if (knownButHidden.length > 0) {
      const dimNames = knownButHidden.slice(0, 3).map(o => o.name);
      if (litLights.length > 0) {
        parts.push(`在光线照不到的角落，你隐约记得那边有${dimNames.join('、')}的轮廓。`);
      } else {
        parts.push(`在黑暗的边缘，你隐约记得那边有${dimNames.join('、')}的轮廓。`);
      }
    }

    // ---- B2-6: 首次进入时附加场景叙述 ----
    if (isFirstVisit && scene?.narration) {
      // 避免与已有描述重复：只取叙述的后半段（场景叙述通常以环境描写开头，与上面重叠）
      const narLines = scene.narration.split(/[。！？]/).filter(s => s.trim());
      if (narLines.length > 1) {
        // 取最后1-2句作为补充氛围
        const tail = narLines.slice(-2).join('。');
        parts.push(tail + '。');
      }
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
        message: describeRoom(room, room._scene, room.playerPosition)
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
        if (fuzzyTarget._dimlyRemembered) {
          // 模糊记忆中的对象：提示看不清
          return {
            success: false,
            code: 'TARGET_NOT_VISIBLE',
            targetId: fuzzyTarget.id,
            verb: 'inspect',
            message: `你记得那边好像有${fuzzyTarget.name}的轮廓，但现在看不清了。也许需要靠近一些，或者找个光源。`,
            uiHint: { highlightTargetId: fuzzyTarget.id }
          };
        }
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
        // 可能是歧义标记，或模糊记忆中的对象
        if (parsed._dimlyRemembered) {
          return {
            success: false,
            code: 'TARGET_NOT_VISIBLE',
            targetId: parsed.targetId,
            verb: parsed.verb,
            message: `你记得那边好像有${parsed._dimlyRememberedName || '什么'}的轮廓，但现在看不清了。也许需要靠近一些，或者找个光源。`,
            uiHint: { highlightTargetId: parsed.targetId }
          };
        }
        return {
          success: false,
          code: 'TARGET_NOT_FOUND',
          message: '你环顾四周，有多个目标符合描述，请更具体地指定。'
        };
      }

      const target = targetLookup;

      // 不可见/未发现
      if (!target.visible || !target.discovered) {
        // 区分迷雾状态给出不同反馈
        let msg = '你暂时还没有注意到这个目标。';
        if (!target.discovered) {
          msg = '你从未在这个房间里注意到这样的东西。';
        } else if (!target.visible) {
          // 曾经见过但当前不在视野内
          msg = `你记得那边好像有${target.name}的轮廓，但现在看不清了。也许需要靠近一些，或者找个光源。`;
        }
        return {
          success: false,
          code: 'TARGET_NOT_VISIBLE',
          targetId: target.id,
          verb: parsed.verb,
          message: msg,
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
    let _dimlyRemembered = false;
    let _dimlyRememberedName = '';
    if (targetResult) {
      if (targetResult._ambiguous) {
        // 歧义：暂取第一个，但标记歧义
        targetId = targetResult.candidates[0]?.id;
      } else if (targetResult._dimlyRemembered) {
        // 模糊记忆中的对象：记录ID和名称，但标记为不可见
        targetId = targetResult.id;
        _dimlyRemembered = true;
        _dimlyRememberedName = targetResult.name;
      } else {
        targetId = targetResult.id;
      }
    }

    return {
      intent,
      verb,
      targetId,
      _dimlyRemembered,
      _dimlyRememberedName,
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
    const dimCandidates = room.objects.filter(o => !o.visible && o.discovered);
    // 检查输入文本是否部分匹配任何对象名（优先当前可见对象）
    for (const obj of candidates) {
      const names = [obj.name, ...(obj.aliases || [])];
      for (const name of names) {
        if (name && (text.includes(name) || name.includes(text))) {
          return obj;
        }
      }
    }
    // 模糊记忆中的对象也尝试匹配
    for (const obj of dimCandidates) {
      const names = [obj.name, ...(obj.aliases || [])];
      for (const name of names) {
        if (name && (text.includes(name) || name.includes(text))) {
          return { ...obj, _dimlyRemembered: true };
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
