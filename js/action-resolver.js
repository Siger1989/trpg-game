/**
 * 动作校验器 - 方案C落地
 * 位置驱动动作反馈与对话资源控制
 * 任何改变世界状态的动作，必须先经位置/目标/可达性校验
 * AI只负责叙事包装，不负责决定动作是否成功
 * 判定层给verdict，AI只能根据verdict写自然语言
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
      approach:         '你走近了{target}。'
    },
    need_approach: {
      default:     '你看见{target}就在那边，但离得太远，得先走近些才能碰到。',
      toggle_light:'那盏{target}还暗着，但离得太远，得先走近些才能碰到它。',
      open:        '{target}就在远处，但你得先走过去才能碰到它。',
      examine:     '你远远地看见{target}的轮廓，但看不清细节，得走近些。'
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

  // ========== 核心校验函数 ==========
  function resolve(parsedIntent, sceneContext) {
    if (!parsedIntent) return null;

    const { intent, action, target } = parsedIntent;
    const sceneObjects = sceneContext.objects || [];
    const playerPos = sceneContext.playerPos || { x: 0, z: 0 };

    // 系统指令不需要位置校验
    if (intent === 'system') {
      return { resultType: RESULT_TYPES.SUCCESS, verdict: true };
    }

    // 说话类走AP分级，不走位置校验
    if (intent === 'speak') {
      const apCost = classifyDialogueAP(action);
      return { resultType: RESULT_TYPES.SUCCESS, verdict: true, apCost, dialogueLevel: apCost };
    }

    // 观察类：黑暗中受限
    if (intent === 'observe' && sceneContext.isDark && !sceneContext.hasLight) {
      return {
        resultType: RESULT_TYPES.BLOCKED,
        verdict: false,
        feedback: '黑暗中什么都看不清，你需要先找到光源。',
        reason: 'darkness'
      };
    }

    // 移动类：不需要目标校验
    if (intent === 'move') {
      return { resultType: RESULT_TYPES.SUCCESS, verdict: true };
    }

    // 以下意图需要目标+位置校验
    if (!target || !target.type) {
      return buildResult(RESULT_TYPES.NO_TARGET, action, null, sceneContext);
    }

    // 查找场景中的目标对象
    const candidates = findTargetObjects(target.type, sceneObjects);

    if (candidates.length === 0) {
      return buildResult(RESULT_TYPES.NO_TARGET, action, target.type, sceneContext);
    }

    // 多个同类目标→消歧
    if (candidates.length > 1) {
      const nearest = findNearest(candidates, playerPos);
      const nearestDist = getDistance(nearest, playerPos);
      if (nearestDist <= (nearest.interactMeta?.requiredRange || 1.5)) {
        return buildSuccessResult(nearest, action, sceneContext);
      }
      return {
        resultType: RESULT_TYPES.AMBIGUOUS,
        verdict: false,
        targetType: target.type,
        candidates,
        feedback: formatFeedback(RESULT_TYPES.AMBIGUOUS, action, { targetType: getName(target.type) })
      };
    }

    // 单一目标
    const targetObj = candidates[0];
    const distance = getDistance(targetObj, playerPos);
    const requiredRange = targetObj.interactMeta?.requiredRange || 1.5;

    // 状态检查
    const stateCheck = checkState(targetObj, action, parsedIntent.rawInput);
    if (stateCheck) return stateCheck;

    // 距离校验
    if (distance > requiredRange) {
      return {
        resultType: RESULT_TYPES.NEED_APPROACH,
        verdict: false,
        targetId: objId(targetObj),
        distance,
        requiredRange,
        feedback: formatFeedback(RESULT_TYPES.NEED_APPROACH, action, { target: getName(targetObj.type) })
      };
    }

    // 视线校验
    if (targetObj.interactMeta?.needsLOS && sceneContext.hasLineOfSight) {
      const hasLOS = sceneContext.hasLineOfSight(playerPos.x, playerPos.z, targetObj.gridX, targetObj.gridZ);
      if (!hasLOS) {
        return {
          resultType: RESULT_TYPES.BLOCKED,
          verdict: false,
          feedback: formatFeedback(RESULT_TYPES.BLOCKED, action, { target: getName(targetObj.type) })
        };
      }
    }

    return buildSuccessResult(targetObj, action, sceneContext);
  }

  // ========== 状态检查 ==========
  function checkState(targetObj, action, rawInput) {
    if (action === 'toggle_light') {
      const isOn = targetObj.isOn;
      const wantOn = rawInput?.includes('开') || rawInput?.includes('点燃') || rawInput?.includes('生火');
      const wantOff = rawInput?.includes('关') || rawInput?.includes('吹灭') || rawInput?.includes('熄');
      if (wantOn && isOn) return { resultType: RESULT_TYPES.NO_TARGET, verdict: false, feedback: '那盏灯已经亮着了。' };
      if (wantOff && !isOn) return { resultType: RESULT_TYPES.NO_TARGET, verdict: false, feedback: '那盏灯本来就是灭的。' };
    }
    if (action === 'open' && targetObj.type === 'door' && targetObj.isOn) {
      return { resultType: RESULT_TYPES.NO_TARGET, verdict: false, feedback: '那扇门已经开了。' };
    }
    if (action === 'close' && targetObj.type === 'door' && !targetObj.isOn) {
      return { resultType: RESULT_TYPES.NO_TARGET, verdict: false, feedback: '那扇门本来就是关着的。' };
    }
    return null;
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

  function buildSuccessResult(targetObj, action) {
    return {
      resultType: RESULT_TYPES.SUCCESS,
      verdict: true,
      targetId: objId(targetObj),
      targetType: targetObj.type,
      targetGridX: targetObj.gridX,
      targetGridZ: targetObj.gridZ,
      action,
      feedback: formatFeedback(RESULT_TYPES.SUCCESS, action, { target: getName(targetObj.type) })
    };
  }

  function buildResult(resultType, action, targetType) {
    return {
      resultType,
      verdict: resultType === RESULT_TYPES.SUCCESS,
      feedback: formatFeedback(resultType, action, { target: getName(targetType), targetType: getName(targetType) })
    };
  }

  function formatFeedback(resultType, action, params) {
    const templates = FEEDBACK_TEMPLATES[resultType] || {};
    let template = templates[action] || templates.default || '你无法这样做。';
    template = template.replace(/\{target\}/g, params.target || '目标');
    template = template.replace(/\{targetType\}/g, params.targetType || '目标');
    return template;
  }

  // ========== 执行动作 ==========
  function executeAction(resolved, sceneManager) {
    if (!resolved || !resolved.verdict) return resolved;
    const { action, targetType, targetGridX, targetGridZ } = resolved;

    switch (action) {
      case 'toggle_light':
        if (sceneManager.toggleObjectLight) sceneManager.toggleObjectLight(targetGridX, targetGridZ);
        break;
      case 'open':
      case 'close':
        if (targetType === 'door' && sceneManager.toggleDoor) sceneManager.toggleDoor(targetGridX, targetGridZ);
        break;
    }

    if (sceneManager.highlightObject) sceneManager.highlightObject(targetGridX, targetGridZ, 800);
    return resolved;
  }

  return {
    RESULT_TYPES,
    DIALOGUE_AP_LEVELS,
    resolve,
    executeAction,
    classifyDialogueAP,
    formatFeedback,
    getName: getName
  };
})();
