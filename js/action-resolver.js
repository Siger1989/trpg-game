/**
 * 动作校验器 - Phase 2: ActionIntent/Outcome模式
 * 
 * 核心原则：
 * - 所有玩家行为必须转成结构化ActionIntent
 * - 所有结果必须以ActionOutcome返回
 * - AI只负责叙事包装，不负责决定动作是否成功
 * - 判定层给verdict，AI只能根据verdict写自然语言
 * 
 * ActionOutcome结构：
 * {
 *   success: boolean,
 *   consumesAp: number,
 *   logs: string[],
 *   stateChanges: StateChange[],
 *   narrationHint: string,
 *   requiresRender: boolean,
 *   resultType: string,  // success/need_approach/blocked/ambiguous/no_target
 *   targetId?: string,
 *   uiHint?: object
 * }
 * 
 * StateChange:
 * { type: 'object'|'room'|'player'|'clue'|'inventory', ...fields }
 */

const ActionResolver = (() => {

  // ========== 5种结果类型 ==========
  const RESULT_TYPES = {
    SUCCESS: 'success',
    NEED_APPROACH: 'need_approach',
    BLOCKED: 'blocked',
    AMBIGUOUS: 'ambiguous',
    NO_TARGET: 'no_target'
  };

  // ========== ActionOutcome工厂 ==========
  function makeOutcome({ success, consumesAp, logs, stateChanges, narrationHint, requiresRender, resultType, targetId, uiHint, nextScene, connectedRoomId, entryFromRoom }) {
    return {
      success: !!success,
      consumesAp: consumesAp || 0,
      logs: logs || [],
      stateChanges: stateChanges || [],
      narrationHint: narrationHint || '',
      requiresRender: requiresRender || false,
      resultType: resultType || (success ? RESULT_TYPES.SUCCESS : RESULT_TYPES.NO_TARGET),
      targetId: targetId || null,
      uiHint: uiHint || null,
      // B1: 房间切换元数据
      nextScene: nextScene || null,
      connectedRoomId: connectedRoomId || null,
      entryFromRoom: entryFromRoom || null
    };
  }

  // ========== 自然反馈模板 ==========
  const FEEDBACK_TEMPLATES = {
    success: {
      toggle_light_on:  '你伸手拧亮了{target}，火苗抖了两下，终于稳稳亮起来。',
      toggle_light_off: '你轻轻吹灭了{target}，光线暗了下去。',
      open:             '你推开了{target}，铰链发出吱呀一声。',
      close:            '你关上了{target}，一切归于沉寂。',
      examine:          '你仔细查看了{target}。',
      search:           '你翻找了{target}。',
      take:             '你拿起了{target}。',
      push:             '你用力推了{target}。',
      look:             '你端详着{target}。',
      look_around:      '你环顾四周。',
      approach:         '你走近了{target}。',
      inspect:          '你仔细调查了{target}。',
      ignite:           '你点燃了{target}，微弱的光芒驱散了周围的黑暗。',
      extinguish:       '你熄灭了{target}，黑暗重新笼罩了这片区域。',
      turn_on:          '你打开了{target}，光芒驱散了周围的黑暗。',
      turn_off:         '你关掉了{target}，黑暗重新笼罩。',
      pickup:           '你拿起了{target}，放进了背包。'
    },
    need_approach: {
      default:     '你看见{target}就在那边，但离得太远，得先走近些才能碰到。',
      toggle_light:'那盏{target}还暗着，但离得太远，得先走近些才能碰到它。',
      open:        '{target}就在远处，但你得先走过去才能碰到它。',
      examine:     '你远远地看见{target}的轮廓，但看不清细节，得走近些。',
      inspect:     '你能看见{target}，但离得还不够近，暂时没法仔细调查。'
    },
    blocked: {
      default: '{target}就在那边，可中间有什么东西把路截住了。'
    },
    ambiguous: {
      default: '这里不止一个{targetType}，你得先说明想去碰哪一个。'
    },
    no_target: {
      toggle_light:'你下意识想去开灯，可这间屋里并没有能立刻点亮的东西。',
      open:        '附近没有可以打开的东西。',
      examine:     '附近没有什么值得仔细查看的。',
      inspect:     '附近没有什么值得仔细调查的。',
      default:     '你找不到可以操作的目标。'
    }
  };

  // ========== 对话AP分级 ==========
  const DIALOGUE_AP_LEVELS = {
    FREE: 0,
    SHOUT: 0,
    SOCIAL: 1,
    HEAVY: 2
  };

  function classifyDialogueAP(action) {
    if (!action || ['say', 'comment', 'mutter'].includes(action)) return DIALOGUE_AP_LEVELS.FREE;
    if (['shout', 'warn', 'call'].includes(action)) return DIALOGUE_AP_LEVELS.SHOUT;
    if (['persuade', 'intimidate', 'deceive', 'calm', 'probe'].includes(action)) return DIALOGUE_AP_LEVELS.SOCIAL;
    if (['negotiate', 'interrogate', 'long_persuade'].includes(action)) return DIALOGUE_AP_LEVELS.HEAVY;
    return DIALOGUE_AP_LEVELS.FREE;
  }

  // ========== 核心校验函数（Phase 2升级：输出ActionOutcome） ==========
  /**
   * resolve - 从解析后的意图+场景上下文，生成ActionOutcome
   * @param {Object} parsedIntent - { intent, action, target, rawInput }
   * @param {Object} sceneContext - { objects, playerPos, isDark, hasLight, hasLineOfSight, inCombat }
   * @returns {Object} ActionOutcome
   */
  function resolve(parsedIntent, sceneContext) {
    if (!parsedIntent) return null;

    const { intent, action, target } = parsedIntent;
    const sceneObjects = sceneContext.objects || [];
    const playerPos = sceneContext.playerPos || { x: 0, z: 0 };

    // 系统指令不需要位置校验
    if (intent === 'system') {
      return makeOutcome({ success: true, resultType: RESULT_TYPES.SUCCESS });
    }

    // 说话类走AP分级，不走位置校验
    if (intent === 'speak') {
      const apCost = classifyDialogueAP(action);
      return makeOutcome({
        success: true,
        consumesAp: apCost,
        resultType: RESULT_TYPES.SUCCESS,
        narrationHint: '你说了些什么。'
      });
    }

    // 观察类：黑暗中受限
    if (intent === 'observe' && sceneContext.isDark && !sceneContext.hasLight) {
      return makeOutcome({
        success: false,
        resultType: RESULT_TYPES.BLOCKED,
        logs: ['黑暗中什么都看不清，你需要先找到光源。'],
        narrationHint: '黑暗中什么都看不清，你需要先找到光源。'
      });
    }

    // 移动类：不需要目标校验
    if (intent === 'move') {
      return makeOutcome({ success: true, consumesAp: 1, resultType: RESULT_TYPES.SUCCESS });
    }

    // 以下意图需要目标+位置校验
    if (!target || !target.type) {
      return makeOutcome({
        success: false,
        resultType: RESULT_TYPES.NO_TARGET,
        logs: [formatFeedback(RESULT_TYPES.NO_TARGET, action, { target: '目标' })],
        narrationHint: formatFeedback(RESULT_TYPES.NO_TARGET, action, { target: '目标' })
      });
    }

    // 查找场景中的目标对象
    const candidates = findTargetObjects(target.type, sceneObjects);

    if (candidates.length === 0) {
      return makeOutcome({
        success: false,
        resultType: RESULT_TYPES.NO_TARGET,
        logs: [formatFeedback(RESULT_TYPES.NO_TARGET, action, { target: getName(target.type) })],
        narrationHint: formatFeedback(RESULT_TYPES.NO_TARGET, action, { target: getName(target.type) })
      });
    }

    // 多个同类目标→消歧
    if (candidates.length > 1) {
      const nearest = findNearest(candidates, playerPos);
      const nearestDist = getDistance(nearest, playerPos);
      if (nearestDist <= (nearest.interactMeta?.requiredRange || 1.5)) {
        return buildSuccessOutcome(nearest, action, sceneContext);
      }
      return makeOutcome({
        success: false,
        resultType: RESULT_TYPES.AMBIGUOUS,
        targetId: objId(candidates[0]),
        logs: [formatFeedback(RESULT_TYPES.AMBIGUOUS, action, { targetType: getName(target.type) })],
        narrationHint: formatFeedback(RESULT_TYPES.AMBIGUOUS, action, { targetType: getName(target.type) })
      });
    }

    // 单一目标
    const targetObj = candidates[0];
    const distance = getDistance(targetObj, playerPos);
    const requiredRange = targetObj.interactMeta?.requiredRange || 1.5;

    // 状态检查
    const stateOutcome = checkStateOutcome(targetObj, action, parsedIntent.rawInput);
    if (stateOutcome) return stateOutcome;

    // 距离校验
    if (distance > requiredRange) {
      return makeOutcome({
        success: false,
        consumesAp: 0,
        resultType: RESULT_TYPES.NEED_APPROACH,
        targetId: objId(targetObj),
        logs: [formatFeedback(RESULT_TYPES.NEED_APPROACH, action, { target: getName(targetObj.type) })],
        narrationHint: formatFeedback(RESULT_TYPES.NEED_APPROACH, action, { target: getName(targetObj.type) }),
        uiHint: { highlightTargetId: objId(targetObj), suggestedAction: '先移动靠近目标' }
      });
    }

    // 视线校验
    if (targetObj.interactMeta?.needsLOS && sceneContext.hasLineOfSight) {
      const hasLOS = sceneContext.hasLineOfSight(playerPos.x, playerPos.z, targetObj.gridX, targetObj.gridZ);
      if (!hasLOS) {
        return makeOutcome({
          success: false,
          resultType: RESULT_TYPES.BLOCKED,
          targetId: objId(targetObj),
          logs: [formatFeedback(RESULT_TYPES.BLOCKED, action, { target: getName(targetObj.type) })],
          narrationHint: formatFeedback(RESULT_TYPES.BLOCKED, action, { target: getName(targetObj.type) })
        });
      }
    }

    return buildSuccessOutcome(targetObj, action, sceneContext);
  }

  // ========== 状态检查（返回ActionOutcome） ==========
  function checkStateOutcome(targetObj, action, rawInput) {
    if (action === 'toggle_light' || action === 'turn_on' || action === 'turn_off') {
      const isOn = targetObj.isOn;
      const wantOn = rawInput?.includes('开') || rawInput?.includes('点燃') || rawInput?.includes('生火');
      const wantOff = rawInput?.includes('关') || rawInput?.includes('吹灭') || rawInput?.includes('熄');
      if (wantOn && isOn) {
        return makeOutcome({
          success: false, resultType: RESULT_TYPES.NO_TARGET,
          logs: ['那盏灯已经亮着了。'], narrationHint: '那盏灯已经亮着了。'
        });
      }
      if (wantOff && !isOn) {
        return makeOutcome({
          success: false, resultType: RESULT_TYPES.NO_TARGET,
          logs: ['那盏灯本来就是灭的。'], narrationHint: '那盏灯本来就是灭的。'
        });
      }
    }
    if (action === 'open' && targetObj.type === 'door' && targetObj.isOn) {
      return makeOutcome({
        success: false, resultType: RESULT_TYPES.NO_TARGET,
        logs: ['那扇门已经开了。'], narrationHint: '那扇门已经开了。'
      });
    }
    if (action === 'close' && targetObj.type === 'door' && !targetObj.isOn) {
      return makeOutcome({
        success: false, resultType: RESULT_TYPES.NO_TARGET,
        logs: ['那扇门本来就是关着的。'], narrationHint: '那扇门本来就是关着的。'
      });
    }
    return null;
  }

  // ========== 构建成功Outcome（含stateChanges） ==========
  function buildSuccessOutcome(targetObj, action, sceneContext) {
    const stateChanges = [];
    const logs = [];
    let narrationHint = '';
    let requiresRender = false;

    const targetId = objId(targetObj);
    const gx = targetObj.gridX;
    const gz = targetObj.gridZ;

    switch (action) {
      case 'toggle_light':
      case 'turn_on':
      case 'ignite': {
        // 灯光开启
        stateChanges.push({ type: 'object', gx, gz, field: 'isOn', value: true });
        // 环境光联动
        const roomId = sceneContext?.roomId || 'unknown';
        stateChanges.push({ type: 'room', roomId, field: 'lightLevel', delta: 0.3 });
        logs.push(formatFeedback(RESULT_TYPES.SUCCESS, action, { target: getName(targetObj.type) }));
        narrationHint = formatFeedback(RESULT_TYPES.SUCCESS, action, { target: getName(targetObj.type) });
        requiresRender = true;
        break;
      }
      case 'turn_off':
      case 'extinguish': {
        // 灯光关闭
        stateChanges.push({ type: 'object', gx, gz, field: 'isOn', value: false });
        const roomId = sceneContext?.roomId || 'unknown';
        stateChanges.push({ type: 'room', roomId, field: 'lightLevel', delta: -0.3 });
        logs.push(formatFeedback(RESULT_TYPES.SUCCESS, action, { target: getName(targetObj.type) }));
        narrationHint = formatFeedback(RESULT_TYPES.SUCCESS, action, { target: getName(targetObj.type) });
        requiresRender = true;
        break;
      }
      case 'open': {
        if (targetObj.type === 'door') {
          stateChanges.push({ type: 'object', gx, gz, field: 'isOpen', value: true });
          stateChanges.push({ type: 'object', gx, gz, field: 'isOn', value: true }); // door的isOn=isOpen
        } else {
          stateChanges.push({ type: 'object', gx, gz, field: 'isOpen', value: true });
        }
        logs.push(formatFeedback(RESULT_TYPES.SUCCESS, action, { target: getName(targetObj.type) }));
        narrationHint = formatFeedback(RESULT_TYPES.SUCCESS, action, { target: getName(targetObj.type) });
        requiresRender = true;
        break;
      }
      case 'close': {
        if (targetObj.type === 'door') {
          stateChanges.push({ type: 'object', gx, gz, field: 'isOpen', value: false });
          stateChanges.push({ type: 'object', gx, gz, field: 'isOn', value: false });
        } else {
          stateChanges.push({ type: 'object', gx, gz, field: 'isOpen', value: false });
        }
        logs.push(formatFeedback(RESULT_TYPES.SUCCESS, action, { target: getName(targetObj.type) }));
        narrationHint = formatFeedback(RESULT_TYPES.SUCCESS, action, { target: getName(targetObj.type) });
        requiresRender = true;
        break;
      }
      case 'inspect':
      case 'examine':
      case 'search': {
        // 调查：推进对象状态机
        stateChanges.push({ type: 'object', gx, gz, field: 'searchCount', delta: 1 });
        // 如果对象有状态机，推进状态
        if (targetObj.maxSearch > 0) {
          stateChanges.push({ type: 'object_state_advance', gx, gz });
        }
        logs.push(formatFeedback(RESULT_TYPES.SUCCESS, action, { target: getName(targetObj.type) }));
        narrationHint = formatFeedback(RESULT_TYPES.SUCCESS, action, { target: getName(targetObj.type) });
        break;
      }
      case 'pickup':
      case 'take': {
        // 拾取：标记taken + 加入inventory
        stateChanges.push({ type: 'object', gx, gz, field: 'taken', value: true });
        stateChanges.push({ type: 'inventory', item: targetObj.type, action: 'add' });
        logs.push(formatFeedback(RESULT_TYPES.SUCCESS, 'pickup', { target: getName(targetObj.type) }));
        narrationHint = formatFeedback(RESULT_TYPES.SUCCESS, 'pickup', { target: getName(targetObj.type) });
        requiresRender = true;
        break;
      }
      default: {
        logs.push(formatFeedback(RESULT_TYPES.SUCCESS, action, { target: getName(targetObj.type) }));
        narrationHint = formatFeedback(RESULT_TYPES.SUCCESS, action, { target: getName(targetObj.type) });
      }
    }

    return makeOutcome({
      success: true,
      consumesAp: 1,
      logs,
      stateChanges,
      narrationHint,
      requiresRender,
      resultType: RESULT_TYPES.SUCCESS,
      targetId
    });
  }

  // ========== 从RoomInteraction的ActionResult转换 ==========
  /**
   * 将RoomInteraction的ActionResult转换为ActionOutcome
   * 这是Phase 2的桥接函数，让现有room-interaction.js的结果
   * 可以通过ActionOutcome统一处理
   */
  function fromActionResult(actionResult) {
    if (!actionResult) return null;

    const resultType = actionResult.success ? RESULT_TYPES.SUCCESS
      : actionResult.code === 'OUT_OF_RANGE' ? RESULT_TYPES.NEED_APPROACH
      : actionResult.code === 'TARGET_NOT_VISIBLE' ? RESULT_TYPES.BLOCKED
      : actionResult.code === 'AMBIGUOUS_TARGET' ? RESULT_TYPES.AMBIGUOUS
      : actionResult.code === 'TARGET_NOT_FOUND' ? RESULT_TYPES.NO_TARGET
      : RESULT_TYPES.NO_TARGET;

    const stateChanges = [];

    // 从ActionResult推导stateChanges
    if (actionResult.success && actionResult.verb) {
      const verb = actionResult.verb;
      // 灯光操作
      if (verb === 'turn_on' || verb === 'ignite') {
        // targetId格式: type_gx_gz
        const parts = actionResult.targetId?.split('_') || [];
        if (parts.length >= 3) {
          const gx = parseInt(parts[parts.length - 2]);
          const gz = parseInt(parts[parts.length - 1]);
          stateChanges.push({ type: 'object', gx, gz, field: 'isOn', value: true });
        }
      }
      if (verb === 'turn_off' || verb === 'extinguish') {
        const parts = actionResult.targetId?.split('_') || [];
        if (parts.length >= 3) {
          const gx = parseInt(parts[parts.length - 2]);
          const gz = parseInt(parts[parts.length - 1]);
          stateChanges.push({ type: 'object', gx, gz, field: 'isOn', value: false });
        }
      }
      // 开门
      if (verb === 'open') {
        const parts = actionResult.targetId?.split('_') || [];
        if (parts.length >= 3) {
          const gx = parseInt(parts[parts.length - 2]);
          const gz = parseInt(parts[parts.length - 1]);
          stateChanges.push({ type: 'object', gx, gz, field: 'isOn', value: true });
        }
      }
    }

    return makeOutcome({
      success: actionResult.success,
      consumesAp: actionResult.success && actionResult.verb !== 'approach' ? 1 : 0,
      logs: actionResult.message ? [actionResult.message] : [],
      stateChanges,
      narrationHint: actionResult.message || '',
      requiresRender: actionResult.success && (
        actionResult.verb === 'turn_on' || actionResult.verb === 'ignite' ||
        actionResult.verb === 'turn_off' || actionResult.verb === 'extinguish' ||
        actionResult.verb === 'open' || actionResult.verb === 'enter'
      ),
      resultType,
      targetId: actionResult.targetId || null,
      uiHint: actionResult.uiHint || null,
      // B1: 房间切换元数据透传
      nextScene: actionResult.nextScene || null,
      connectedRoomId: actionResult.connectedRoomId || null,
      entryFromRoom: actionResult.entryFromRoom || null
    });
  }

  // ========== 辅助函数 ==========
  function findTargetObjects(type, sceneObjects) {
    return sceneObjects.filter(o => o.type === type);
  }

  function findNearest(candidates, playerPos) {
    return candidates.reduce((nearest, obj) =>
      getDistance(obj, playerPos) < getDistance(nearest, playerPos) ? obj : nearest, candidates[0]);
  }

  function getDistance(obj, playerPos) {
    const dx = (obj.gridX || obj.x || 0) - playerPos.x;
    const dz = (obj.gridZ || obj.z || 0) - playerPos.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function getName(type) {
    const names = {
      lamp:'灯', candle:'蜡烛', fireplace:'壁炉', door:'门',
      chest:'箱子', wardrobe:'衣柜', desk:'书桌', bookshelf:'书架',
      table:'桌子', chair:'椅子', bed:'床', rug:'地毯',
      painting:'画', mirror:'镜子', altar:'祭坛', statue:'雕像',
      skeleton:'骷髅', crate:'木箱', barrel:'桶', pillar:'柱子'
    };
    return names[type] || type;
  }

  function objId(obj) {
    return obj.id || `${obj.type}_${obj.gridX}_${obj.gridZ}`;
  }

  function formatFeedback(resultType, action, params) {
    const templates = FEEDBACK_TEMPLATES[resultType] || {};
    let template = templates[action] || templates.default || '你无法这样做。';
    template = template.replace(/\{target\}/g, params.target || '目标');
    template = template.replace(/\{targetType\}/g, params.targetType || '目标');
    return template;
  }

  // ========== 执行动作（Phase 2：通过Outcome驱动，不再直接改状态） ==========
  /**
   * executeAction - 执行动作后的视觉反馈（高亮）
   * 视觉同步（灯光/门）已由 DMEngine.applyOutcome() 统一触发，此处不再重复调用
   */
  function executeAction(resolved, sceneManager) {
    if (!resolved || !resolved.verdict) return resolved;
    const { targetGridX, targetGridZ } = resolved;

    // 只做高亮反馈，灯光/门的3D视觉同步由applyOutcome()负责
    if (sceneManager && sceneManager.highlightObject) {
      sceneManager.highlightObject(targetGridX, targetGridZ, 800);
    }
    return resolved;
  }

  return {
    RESULT_TYPES,
    DIALOGUE_AP_LEVELS,
    resolve,
    executeAction,
    classifyDialogueAP,
    formatFeedback,
    getName,
    makeOutcome,
    fromActionResult,
    buildSuccessOutcome
  };
})();
