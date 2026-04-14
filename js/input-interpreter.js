/**
 * 意图识别器 - 方案B落地
 * 玩家输入 → 意图识别 → 结构化动作 → 规则校验 → 执行 → 叙事
 * 规则只认结构，叙事只认结果
 */
const InputInterpreter = (() => {

  // ========== 7种意图类型 ==========
  const INTENT_TYPES = {
    MOVE: 'move',           // 移动：走、去、前进、后退
    OBSERVE: 'observe',     // 观察：看、查看、环顾
    INTERACT: 'interact',   // 交互：开灯、开门、拿取、推动
    INVESTIGATE: 'investigate', // 调查：搜查、检查、翻找
    SPEAK: 'speak',         // 说话：对话、喊话、自言自语
    COMBAT: 'combat',       // 战斗：攻击、闪避、逃跑
    SYSTEM: 'system'        // 系统：存档、读档、设置
  };

  // ========== 关键词→意图映射 ==========
  const KEYWORD_MAP = {
    // 移动
    '走': INTENT_TYPES.MOVE, '去': INTENT_TYPES.MOVE, '前进': INTENT_TYPES.MOVE,
    '后退': INTENT_TYPES.MOVE, '往': INTENT_TYPES.MOVE, '移动': INTENT_TYPES.MOVE,
    '靠近': INTENT_TYPES.MOVE, '离开': INTENT_TYPES.MOVE, '跑': INTENT_TYPES.MOVE,
    '走过去': INTENT_TYPES.MOVE, '跑过去': INTENT_TYPES.MOVE, '走开': INTENT_TYPES.MOVE,
    // 观察
    '看': INTENT_TYPES.OBSERVE, '查看': INTENT_TYPES.OBSERVE, '环顾': INTENT_TYPES.OBSERVE,
    '观察': INTENT_TYPES.OBSERVE, '瞧': INTENT_TYPES.OBSERVE, '凝视': INTENT_TYPES.OBSERVE,
    '张望': INTENT_TYPES.OBSERVE, '端详': INTENT_TYPES.OBSERVE,
    // 交互 - 灯光
    '开灯': INTENT_TYPES.INTERACT, '关灯': INTENT_TYPES.INTERACT,
    '点燃': INTENT_TYPES.INTERACT, '吹灭': INTENT_TYPES.INTERACT,
    '生火': INTENT_TYPES.INTERACT, '熄火': INTENT_TYPES.INTERACT,
    '打开灯': INTENT_TYPES.INTERACT, '关掉灯': INTENT_TYPES.INTERACT,
    // 交互 - 门
    '开门': INTENT_TYPES.INTERACT, '关门': INTENT_TYPES.INTERACT,
    '推门': INTENT_TYPES.INTERACT, '拉门': INTENT_TYPES.INTERACT,
    '打开门': INTENT_TYPES.INTERACT, '关上门': INTENT_TYPES.INTERACT,
    // 交互 - 容器
    '打开': INTENT_TYPES.INTERACT, '关上': INTENT_TYPES.INTERACT,
    '拿': INTENT_TYPES.INTERACT, '取': INTENT_TYPES.INTERACT, '拿取': INTENT_TYPES.INTERACT,
    '推': INTENT_TYPES.INTERACT, '拉': INTENT_TYPES.INTERACT,
    '放下': INTENT_TYPES.INTERACT, '扔': INTENT_TYPES.INTERACT,
    // 调查
    '搜查': INTENT_TYPES.INVESTIGATE, '搜索': INTENT_TYPES.INVESTIGATE,
    '翻找': INTENT_TYPES.INVESTIGATE, '检查': INTENT_TYPES.INVESTIGATE,
    '调查': INTENT_TYPES.INVESTIGATE, '翻': INTENT_TYPES.INVESTIGATE,
    '找': INTENT_TYPES.INVESTIGATE, '探查': INTENT_TYPES.INVESTIGATE,
    // 说话
    '说': INTENT_TYPES.SPEAK, '喊': INTENT_TYPES.SPEAK, '叫': INTENT_TYPES.SPEAK,
    '问': INTENT_TYPES.SPEAK, '回答': INTENT_TYPES.SPEAK, '告诉': INTENT_TYPES.SPEAK,
    '劝': INTENT_TYPES.SPEAK, '威胁': INTENT_TYPES.SPEAK, '恐吓': INTENT_TYPES.SPEAK,
    '说服': INTENT_TYPES.SPEAK, '安抚': INTENT_TYPES.SPEAK, '欺骗': INTENT_TYPES.SPEAK,
    '谈判': INTENT_TYPES.SPEAK, '求': INTENT_TYPES.SPEAK,
    // 战斗
    '攻击': INTENT_TYPES.COMBAT, '打': INTENT_TYPES.COMBAT, '砍': INTENT_TYPES.COMBAT,
    '刺': INTENT_TYPES.COMBAT, '射击': INTENT_TYPES.COMBAT, '开枪': INTENT_TYPES.COMBAT,
    '闪避': INTENT_TYPES.COMBAT, '躲': INTENT_TYPES.COMBAT, '逃跑': INTENT_TYPES.COMBAT,
    '反击': INTENT_TYPES.COMBAT, '防守': INTENT_TYPES.COMBAT,
    // 系统
    '存档': INTENT_TYPES.SYSTEM, '读档': INTENT_TYPES.SYSTEM,
    '保存': INTENT_TYPES.SYSTEM, '加载': INTENT_TYPES.SYSTEM,
    '设置': INTENT_TYPES.SYSTEM, '帮助': INTENT_TYPES.SYSTEM
  };

  // ========== 动作子类型映射 ==========
  const ACTION_MAP = {
    // 灯光
    '开灯': 'toggle_light', '关灯': 'toggle_light',
    '点燃': 'toggle_light', '吹灭': 'toggle_light',
    '生火': 'toggle_light', '熄火': 'toggle_light',
    '打开灯': 'toggle_light', '关掉灯': 'toggle_light',
    // 门
    '开门': 'open', '关门': 'close',
    '推门': 'open', '拉门': 'open',
    '打开门': 'open', '关上门': 'close',
    // 容器
    '打开': 'open', '关上': 'close',
    '拿': 'take', '取': 'take', '拿取': 'take',
    '推': 'push', '拉': 'pull',
    '放下': 'drop', '扔': 'drop',
    // 调查
    '搜查': 'search', '搜索': 'search',
    '翻找': 'search', '检查': 'examine',
    '调查': 'examine', '翻': 'search',
    '找': 'search', '探查': 'examine',
    // 观察
    '看': 'look', '查看': 'look', '环顾': 'look_around',
    '观察': 'look', '瞧': 'look', '凝视': 'look',
    '张望': 'look_around', '端详': 'examine',
    // 说话
    '劝': 'persuade', '威胁': 'intimidate', '恐吓': 'intimidate',
    '说服': 'persuade', '安抚': 'calm', '欺骗': 'deceive',
    '谈判': 'negotiate', '求': 'beg',
    // 战斗
    '攻击': 'attack', '打': 'attack', '砍': 'attack',
    '刺': 'attack', '射击': 'shoot', '开枪': 'shoot',
    '闪避': 'dodge', '躲': 'dodge', '逃跑': 'flee',
    '反击': 'counter', '防守': 'defend'
  };

  // ========== 目标类型映射 ==========
  const TARGET_MAP = {
    // 灯光类
    '灯': 'lamp', '油灯': 'lamp', '台灯': 'lamp', '电灯': 'lamp',
    '蜡烛': 'candle', '烛': 'candle', '烛台': 'candle',
    '壁炉': 'fireplace', '火炉': 'fireplace', '炉': 'fireplace',
    '火': 'fireplace', '火把': 'lamp',
    // 门类
    '门': 'door', '大门': 'door', '房门': 'door', '木门': 'door',
    // 容器类
    '抽屉': 'desk', '柜': 'wardrobe', '衣柜': 'wardrobe',
    '箱子': 'chest', '宝箱': 'chest', '盒子': 'crate',
    '桶': 'barrel', '书架': 'bookshelf', '架子': 'bookshelf',
    // 家具
    '桌子': 'table', '桌': 'desk', '椅子': 'chair', '椅': 'chair',
    '床': 'bed', '地毯': 'rug', '画': 'painting', '镜': 'mirror',
    // 特殊
    '祭坛': 'altar', '雕像': 'statue', '骷髅': 'skeleton',
    '尸体': 'skeleton', '骨头': 'skeleton', '柱': 'pillar'
  };

  // ========== 方向映射 ==========
  const DIRECTION_MAP = {
    '北': { dx: 0, dz: -1 }, '上': { dx: 0, dz: -1 }, '前': { dx: 0, dz: -1 },
    '南': { dx: 0, dz: 1 }, '下': { dx: 0, dz: 1 }, '后': { dx: 0, dz: 1 },
    '东': { dx: 1, dz: 0 }, '右': { dx: 1, dz: 0 },
    '西': { dx: -1, dz: 0 }, '左': { dx: -1, dz: 0 },
    '东北': { dx: 1, dz: -1 }, '西北': { dx: -1, dz: -1 },
    '东南': { dx: 1, dz: 1 }, '西南': { dx: -1, dz: 1 }
  };

  // ========== 上下文门控：根据场景状态决定哪些意图可用 ==========
  function getAvailableIntents(context) {
    const available = { ...INTENT_TYPES };
    const blocked = [];

    if (context.inCombat) {
      // 战斗中限制
      blocked.push(INTENT_TYPES.INVESTIGATE);
      // SPEAK受限（只能短促喊话）
    }
    if (context.isDark && !context.hasLight) {
      // 黑暗中观察受限
      blocked.push(INTENT_TYPES.OBSERVE);
    }
    if (context.isParalyzed || context.isStunned) {
      // 被控制时大部分动作不可用
      blocked.push(INTENT_TYPES.MOVE, INTENT_TYPES.INTERACT, INTENT_TYPES.COMBAT);
    }

    return { available, blocked };
  }

  // ========== 核心解析函数 ==========
  function interpret(rawInput, context = {}) {
    const input = rawInput.trim();
    if (!input) return null;

    // 1. 识别意图
    const intent = detectIntent(input);
    // 2. 识别动作子类型
    const action = detectAction(input);
    // 3. 识别目标
    const target = detectTarget(input, intent);
    // 4. 识别方向（移动用）
    const direction = detectDirection(input);
    // 5. 识别方式修饰
    const manner = detectManner(input);
    // 6. 判断是否需要接近
    const requiresProximity = [INTENT_TYPES.INTERACT, INTENT_TYPES.INVESTIGATE].includes(intent);
    // 7. 判断风险等级
    const riskProfile = assessRisk(intent, action, context);

    // 8. 检测隐式拆步："走过去开灯" → move + interact
    const isCompound = detectCompound(input);

    const result = {
      intent,
      action,
      target,
      direction,
      manner,
      requiresProximity,
      riskProfile,
      mode: isCompound ? 'compound' : 'explicit',
      rawInput: input,
      // 隐式拆步结果
      steps: isCompound ? splitSteps(input, intent, action, target, direction) : null
    };

    // 9. 上下文门控检查
    const gating = getAvailableIntents(context);
    if (gating.blocked.includes(intent)) {
      result.blocked = true;
      result.blockReason = getBlockReason(intent, context);
    }

    return result;
  }

  // ========== 意图检测 ==========
  function detectIntent(input) {
    // 优先匹配长关键词
    const sortedKeywords = Object.keys(KEYWORD_MAP).sort((a, b) => b.length - a.length);
    for (const kw of sortedKeywords) {
      if (input.includes(kw)) return KEYWORD_MAP[kw];
    }
    // 默认：短句当说话，长句当调查
    return input.length <= 6 ? INTENT_TYPES.SPEAK : INTENT_TYPES.INVESTIGATE;
  }

  // ========== 动作检测 ==========
  function detectAction(input) {
    const sortedKeywords = Object.keys(ACTION_MAP).sort((a, b) => b.length - a.length);
    for (const kw of sortedKeywords) {
      if (input.includes(kw)) return ACTION_MAP[kw];
    }
    return null;
  }

  // ========== 目标检测 ==========
  function detectTarget(input, intent) {
    // 从输入中提取目标类型
    const sortedTargets = Object.keys(TARGET_MAP).sort((a, b) => b.length - a.length);
    for (const t of sortedTargets) {
      if (input.includes(t)) return { type: TARGET_MAP[t], keyword: t };
    }
    // 移动意图：目标是方向
    if (intent === INTENT_TYPES.MOVE) return { type: 'direction', keyword: null };
    // 说话意图：目标是NPC（暂无NPC系统，返回null）
    if (intent === INTENT_TYPES.SPEAK) return { type: 'speech', keyword: null };
    return null;
  }

  // ========== 方向检测 ==========
  function detectDirection(input) {
    const sortedDirs = Object.keys(DIRECTION_MAP).sort((a, b) => b.length - a.length);
    for (const d of sortedDirs) {
      if (input.includes(d)) return { name: d, ...DIRECTION_MAP[d] };
    }
    return null;
  }

  // ========== 方式修饰检测 ==========
  function detectManner(input) {
    const manners = {
      '小心': 'carefully', '谨慎': 'carefully', '悄悄': 'quietly', '偷偷': 'stealthily',
      '快速': 'quickly', '赶紧': 'quickly', '慢慢': 'slowly', '轻': 'gently',
      '用力': 'forcefully', '猛': 'forcefully', '仔细': 'thoroughly', '认真': 'thoroughly'
    };
    for (const [kw, manner] of Object.entries(manners)) {
      if (input.includes(kw)) return manner;
    }
    return null;
  }

  // ========== 风险评估 ==========
  function assessRisk(intent, action, context) {
    if (intent === INTENT_TYPES.COMBAT) return 'high';
    if (action === 'intimidate' || action === 'negotiate') return 'medium';
    if (intent === INTENT_TYPES.INTERACT && context?.isDark) return 'medium';
    if (intent === INTENT_TYPES.INVESTIGATE && context?.isDangerous) return 'medium';
    return 'low';
  }

  // ========== 隐式拆步检测 ==========
  function detectCompound(input) {
    const compoundPatterns = [
      /走过去.*开/, /跑过去.*开/, /过去.*把/,
      /走过去.*关/, /跑过去.*关/, /过去.*拿/,
      /走过去.*生/, /跑过去.*生/, /过去.*生/,
      /走过去.*点/, /跑过去.*点/, /过去.*点/,
      /靠近.*然后/, /走.*再/,
      /过去.*开/, /过去.*关/, /过去.*点/
    ];
    return compoundPatterns.some(p => p.test(input));
  }

  // ========== 隐式拆步 ==========
  function splitSteps(input, intent, action, target, direction) {
    const steps = [];

    // 第一步：移动到目标附近
    if (target && target.type !== 'direction' && target.type !== 'speech') {
      steps.push({
        intent: INTENT_TYPES.MOVE,
        action: 'approach',
        target: target,
        direction: null,
        requiresProximity: false,
        riskProfile: 'low'
      });
    }

    // 第二步：从输入中提取交互意图（而非用主意图，因为"走过去生火"主意图是move）
    // 尝试从动作关键词推断第二步意图
    let step2Intent = intent;
    let step2Action = action;
    if (action) {
      // 有明确动作（如toggle_light），则第二步是interact
      step2Intent = INTENT_TYPES.INTERACT;
      step2Action = action;
    } else if (intent === INTENT_TYPES.MOVE) {
      // "走过去"后跟的词重新检测
      const afterMove = input.replace(/走过去|跑过去|过去|靠近/, '');
      if (afterMove.trim()) {
        step2Intent = detectIntent(afterMove);
        step2Action = detectAction(afterMove);
      }
    }

    steps.push({
      intent: step2Intent,
      action: step2Action,
      target,
      direction,
      requiresProximity: true,
      riskProfile: 'low'
    });

    return steps;
  }

  // ========== 门控拒绝原因 ==========
  function getBlockReason(intent, context) {
    const reasons = {
      [INTENT_TYPES.MOVE]: '你无法移动——身体似乎不听使唤。',
      [INTENT_TYPES.OBSERVE]: '黑暗中什么都看不清，你需要先找到光源。',
      [INTENT_TYPES.INVESTIGATE]: '现在不是仔细搜查的时候！',
      [INTENT_TYPES.INTERACT]: '你无法进行这个操作。',
      [INTENT_TYPES.COMBAT]: '你暂时无法战斗。'
    };
    return reasons[intent] || '你现在无法这样做。';
  }

  // ========== 消歧：多个同类目标时让玩家指定 ==========
  function disambiguate(targetType, sceneObjects) {
    const candidates = sceneObjects.filter(o => o.type === targetType);
    if (candidates.length <= 1) return candidates[0] || null;
    // 返回候选列表，由上层让玩家选择
    return { ambiguous: true, candidates, message: `这里有多个${targetType}，你要操作哪一个？` };
  }

  // ========== 导出 ==========
  return {
    INTENT_TYPES,
    interpret,
    getAvailableIntents,
    disambiguate,
    // 工具方法（供action-resolver使用）
    detectIntent,
    detectAction,
    detectTarget,
    detectDirection
  };
})();
