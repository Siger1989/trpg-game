/**
 * CoC 7版规则引擎
 * d100检定系统，所有数值由基础属性推导
 */

const CoCRules = (() => {

  // ========== 基础属性 ==========
  const ATTRIBUTES = ['STR', 'CON', 'SIZ', 'DEX', 'APP', 'INT', 'POW', 'EDU'];

  const ATTR_NAMES = {
    STR: '力量', CON: '体质', DEX: '敏捷', APP: '外貌',
    INT: '智力', SIZ: '体型', POW: '意志', EDU: '教育',
    LUCK: '幸运'
  };

  // 衍生属性计算
  function calcDerived(stats) {
    const hp = Math.floor((stats.CON + stats.SIZ) / 10);
    const mp = Math.floor(stats.POW / 5);
    const san = stats.POW;
    const mov = calcMOV(stats);
    const build = calcBuild(stats);
    const db = calcDamageBonus(stats);
    return { hp, maxHp: hp, mp, maxMp: mp, san, maxSan: 99, mov, build, db };
  }

  function calcMOV(stats) {
    if (stats.DEX < stats.SIZ && stats.STR < stats.SIZ) return 7;
    if (stats.DEX >= stats.SIZ && stats.STR >= stats.SIZ) return 9;
    return 8;
  }

  function calcBuild(stats) {
    const sum = stats.STR + stats.SIZ;
    if (sum <= 64) return -2;
    if (sum <= 84) return -1;
    if (sum <= 124) return 0;
    if (sum <= 164) return 1;
    if (sum <= 204) return 2;
    if (sum <= 284) return 3;
    return 4;
  }

  function calcDamageBonus(stats) {
    const sum = stats.STR + stats.SIZ;
    if (sum <= 64) return '-2';
    if (sum <= 84) return '-1';
    if (sum <= 124) return '0';
    if (sum <= 164) return '+1D4';
    if (sum <= 204) return '+1D6';
    if (sum <= 284) return '+2D6';
    return '+3D6';
  }

  // 随机生成属性
  function rollStats() {
    const stats = {};
    const roll3d6 = () => (rollDie(6) + rollDie(6) + rollDie(6)) * 5;
    const roll2d6p6 = () => (rollDie(6) + rollDie(6) + 6) * 5;
    stats.STR = roll3d6();
    stats.CON = roll3d6();
    stats.DEX = roll3d6();
    stats.APP = roll3d6();
    stats.POW = roll3d6();
    stats.SIZ = roll2d6p6();
    stats.INT = roll2d6p6();
    stats.EDU = roll2d6p6();
    stats.LUCK = roll3d6();
    return stats;
  }

  // ========== 技能系统 ==========
  const SKILLS = {
    '人类学': { base: 1, group: '学术' },
    '考古学': { base: 1, group: '学术' },
    '艺术/手艺': { base: 5, group: '学术' },
    '信用评级': { base: 0, group: '学术' },
    '魅惑': { base: 15, group: '社交' },
    '克苏鲁神话': { base: 0, group: '特殊' },
    '乔装': { base: 5, group: '社交' },
    '闪避': { base: 0, group: '战斗' },
    '汽车驾驶': { base: 20, group: '实用' },
    '电气维修': { base: 10, group: '实用' },
    '电子学': { base: 1, group: '学术' },
    '话术': { base: 5, group: '社交' },
    '格斗(斗殴)': { base: 25, group: '战斗' },
    '射击(手枪)': { base: 20, group: '战斗' },
    '射击(步枪)': { base: 25, group: '战斗' },
    '急救': { base: 30, group: '实用' },
    '历史': { base: 5, group: '学术' },
    '恐吓': { base: 15, group: '社交' },
    '跳跃': { base: 20, group: '实用' },
    '其他语言': { base: 1, group: '学术' },
    '母语': { base: 0, group: '学术' },
    '法律': { base: 5, group: '学术' },
    '图书馆使用': { base: 20, group: '学术' },
    '聆听': { base: 20, group: '实用' },
    '锁匠': { base: 1, group: '实用' },
    '机械维修': { base: 10, group: '实用' },
    '医学': { base: 1, group: '学术' },
    '博物学': { base: 10, group: '学术' },
    '导航': { base: 10, group: '实用' },
    '神秘学': { base: 5, group: '学术' },
    '说服': { base: 10, group: '社交' },
    '心理学': { base: 10, group: '社交' },
    '精神分析': { base: 1, group: '学术' },
    '科学': { base: 1, group: '学术' },
    '妙手': { base: 10, group: '实用' },
    '侦查': { base: 25, group: '实用' },
    '潜行': { base: 20, group: '实用' },
    '生存': { base: 10, group: '实用' },
    '游泳': { base: 20, group: '实用' },
    '投掷': { base: 20, group: '战斗' },
    '追踪': { base: 10, group: '实用' }
  };

  function calcSkillBase(skillName, stats) {
    const skill = SKILLS[skillName];
    if (!skill) return 0;
    if (skillName === '闪避') return Math.floor(stats.DEX / 2);
    if (skillName === '母语') return stats.EDU;
    return skill.base;
  }

  // ========== 检定系统 ==========
  const RESULT = {
    CRITICAL: '大成功',
    EXTREME: '极难成功',
    HARD: '困难成功',
    REGULAR: '常规成功',
    FAIL: '失败',
    FUMBLE: '大失败'
  };

  function rollCheck(skillValue, bonus = 0, penalty = 0) {
    const roll = rollDie(100);
    const effectiveValue = Math.max(0, skillValue + bonus - penalty);
    const hardThreshold = Math.floor(effectiveValue / 2);
    const extremeThreshold = Math.floor(effectiveValue / 5);

    let result;
    if (roll === 1) {
      result = RESULT.CRITICAL;
    } else if (roll <= extremeThreshold) {
      result = RESULT.EXTREME;
    } else if (roll <= hardThreshold) {
      result = RESULT.HARD;
    } else if (roll <= effectiveValue) {
      result = RESULT.REGULAR;
    } else if (roll >= 96 && effectiveValue < 50) {
      result = RESULT.FUMBLE;
    } else if (roll === 100) {
      result = RESULT.FUMBLE;
    } else {
      result = RESULT.FAIL;
    }

    return {
      roll,
      skillValue: effectiveValue,
      hardThreshold,
      extremeThreshold,
      result,
      isSuccess: result !== RESULT.FAIL && result !== RESULT.FUMBLE,
      isCritical: result === RESULT.CRITICAL || result === RESULT.EXTREME
    };
  }

  function opposedCheck(activeValue, passiveValue) {
    const active = rollCheck(activeValue);
    const passive = rollCheck(passiveValue);
    const activeLevel = successLevel(active.result);
    const passiveLevel = successLevel(passive.result);
    let winner;
    if (activeLevel > passiveLevel) winner = 'active';
    else if (passiveLevel > activeLevel) winner = 'passive';
    else winner = active.roll <= passive.roll ? 'active' : 'passive';
    return { active, passive, winner };
  }

  function successLevel(result) {
    switch (result) {
      case RESULT.FUMBLE: return 0;
      case RESULT.FAIL: return 1;
      case RESULT.REGULAR: return 2;
      case RESULT.HARD: return 3;
      case RESULT.EXTREME: return 4;
      case RESULT.CRITICAL: return 5;
      default: return 1;
    }
  }

  // ========== 伤害计算 ==========
  function rollDamage(damageString) {
    const match = damageString.match(/(\d+)D(\d+)([+-]\d+)?/i);
    if (!match) return { total: parseInt(damageString) || 0, rolls: [] };
    const count = parseInt(match[1]);
    const sides = parseInt(match[2]);
    const modifier = match[3] ? parseInt(match[3]) : 0;
    const rolls = [];
    for (let i = 0; i < count; i++) rolls.push(rollDie(sides));
    const total = Math.max(0, rolls.reduce((a, b) => a + b, 0) + modifier);
    return { total, rolls, modifier };
  }

  // SAN检定
  function sanCheck(sanValue, successLoss, failLoss) {
    const check = rollCheck(sanValue);
    let loss;
    if (check.isSuccess) {
      loss = typeof successLoss === 'string' ? rollDamage(successLoss).total : successLoss;
    } else {
      loss = typeof failLoss === 'string' ? rollDamage(failLoss).total : failLoss;
    }
    return { check, loss, newSan: Math.max(0, sanValue - loss) };
  }

  function rollDie(sides) {
    return Math.floor(Math.random() * sides) + 1;
  }

  // ========== 职业 ==========
  const OCCUPATIONS = {
    '古董商': { skills: ['艺术/手艺', '信用评级', '历史', '图书馆使用', '神秘学', '说服', '心理学', '其他语言'], credit: [30, 70] },
    '艺术家': { skills: ['艺术/手艺', '信用评级', '魅惑', '其他语言', '心理学', '说服'], credit: [9, 50] },
    '运动员': { skills: ['闪避', '跳跃', '格斗(斗殴)', '游泳', '投掷', '汽车驾驶'], credit: [9, 50] },
    '作家': { skills: ['艺术/手艺', '信用评级', '其他语言', '历史', '图书馆使用', '母语', '心理学', '神秘学'], credit: [9, 30] },
    '神职人员': { skills: ['信用评级', '历史', '图书馆使用', '医学', '神秘学', '母语', '心理学', '说服'], credit: [9, 30] },
    '罪犯': { skills: ['乔装', '闪避', '格斗(斗殴)', '锁匠', '妙手', '侦查', '潜行', '恐吓'], credit: [5, 40] },
    '医生': { skills: ['信用评级', '急救', '其他语言', '图书馆使用', '医学', '心理学', '科学', '精神分析'], credit: [30, 80] },
    '漂泊者': { skills: ['闪避', '格斗(斗殴)', '聆听', '锁匠', '侦查', '潜行', '生存'], credit: [0, 5] },
    '工程师': { skills: ['信用评级', '电气维修', '图书馆使用', '机械维修', '其他语言', '科学', '侦查'], credit: [30, 60] },
    '记者': { skills: ['艺术/手艺', '信用评级', '心理学', '图书馆使用', '母语', '其他语言', '侦查'], credit: [9, 30] },
    '律师': { skills: ['信用评级', '法律', '图书馆使用', '母语', '其他语言', '说服', '心理学', '恐吓'], credit: [30, 80] },
    '军官': { skills: ['信用评级', '格斗(斗殴)', '射击(步枪)', '汽车驾驶', '聆听', '导航', '侦查', '生存'], credit: [20, 70] },
    '教授': { skills: ['信用评级', '图书馆使用', '母语', '其他语言', '科学', '心理学', '说服'], credit: [20, 70] },
    '私家侦探': { skills: ['信用评级', '心理学', '法律', '图书馆使用', '锁匠', '侦查', '潜行'], credit: [9, 30] },
    '警探': { skills: ['信用评级', '格斗(斗殴)', '射击(手枪)', '法律', '聆听', '心理学', '侦查', '恐吓'], credit: [20, 50] },
    '心理学家': { skills: ['信用评级', '急救', '其他语言', '医学', '精神分析', '心理学', '科学', '说服'], credit: [20, 60] },
    '科学家': { skills: ['信用评级', '图书馆使用', '其他语言', '科学', '医学', '机械维修'], credit: [30, 60] },
    '士兵': { skills: ['闪避', '格斗(斗殴)', '射击(步枪)', '汽车驾驶', '急救', '导航', '侦查', '生存'], credit: [9, 30] }
  };

  return {
    ATTR_NAMES, ATTRIBUTES, SKILLS, OCCUPATIONS, RESULT,
    rollStats, calcDerived, calcSkillBase,
    rollCheck, opposedCheck, rollDamage, sanCheck, rollDie
  };
})();
