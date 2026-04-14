/**
 * 战斗系统 - CoC 7版回合制战斗
 * 先攻→行动→结算，完整审计轨迹
 */

const CombatSystem = (() => {
  let inCombat = false;
  let combatants = [];
  let currentTurnIndex = 0;
  let round = 0;
  let log = [];

  // 武器定义
  const WEAPONS = {
    '拳头': { damage: '1D3', type: 'melee', range: 1, hands: 1, skill: '格斗(斗殴)' },
    '小刀': { damage: '1D4', type: 'melee', range: 1, hands: 1, skill: '格斗(斗殴)', dbAdd: true },
    '棒球棍': { damage: '1D8', type: 'melee', range: 1, hands: 2, skill: '格斗(斗殴)', dbAdd: true },
    '手枪(.38)': { damage: '1D8', type: 'ranged', range: 15, hands: 1, skill: '射击(手枪)', ammo: 6 },
    '手枪(.45)': { damage: '1D10', type: 'ranged', range: 15, hands: 1, skill: '射击(手枪)', ammo: 7 },
    '步枪': { damage: '2D6', type: 'ranged', range: 50, hands: 2, skill: '射击(步枪)', ammo: 5 },
    '霰弹枪': { damage: '4D6', type: 'ranged', range: 10, hands: 2, skill: '射击(步枪)', ammo: 2 },
    '弓箭': { damage: '1D8', type: 'ranged', range: 40, hands: 2, skill: '射击(步枪)', ammo: 12 }
  };

  // 距离惩罚
  const RANGE_PENALTY = {
    melee: { close: 0, medium: 0, far: 0 },
    ranged: { close: 0, medium: -20, far: -40 },
    thrown: { close: 0, medium: -10, far: -30 }
  };

  // 距离分类
  function classifyDistance(gridDist, weaponRange) {
    if (gridDist <= 2) return 'close';
    if (gridDist <= weaponRange * 0.5) return 'medium';
    return 'far';
  }

  // ========== 战斗流程 ==========

  // 开始战斗
  function startCombat(enemies) {
    if (inCombat) return;
    inCombat = true;
    round = 0;
    log = [];
    combatants = [];

    // 添加玩家
    const player = GameState.getPlayer();
    if (player) {
      combatants.push({
        id: 'player',
        name: player.name || '调查员',
        type: 'player',
        dex: player.stats.DEX,
        hp: player.derived.hp,
        maxHp: player.derived.maxHp,
        mov: player.derived.mov || 8,
        gridX: SceneManager.getPlayerPos().x,
        gridZ: SceneManager.getPlayerPos().z,
        weapon: player.weapon || '拳头',
        acted: false
      });
    }

    // 添加敌人
    enemies.forEach((e, i) => {
      combatants.push({
        id: `enemy_${i}`,
        name: e.name || `敌人${i + 1}`,
        type: 'enemy',
        dex: e.dex || 50,
        hp: e.hp || 10,
        maxHp: e.maxHp || e.hp || 10,
        gridX: e.x,
        gridZ: e.z,
        weapon: e.weapon || '拳头',
        damage: e.damage || '1D6',
        acted: false
      });
    });

    // 先攻检定（DEX排序）
    rollInitiative();

    addLog(`⚔️ 战斗开始！`);
    addLog(`先攻顺序: ${combatants.map(c => c.name).join(' → ')}`);

    // 触发UI更新
    if (typeof UI !== 'undefined' && UI.updateCombat) {
      UI.updateCombat();
    }

    nextTurn();
  }

  // 先攻检定
  function rollInitiative() {
    combatants.forEach(c => {
      c.initRoll = CoCRules.rollDie(100);
      c.initValue = c.dex; // CoC 7版先攻 = DEX值排序
    });
    combatants.sort((a, b) => b.initValue - a.initValue);
  }

  // 下一回合
  function nextTurn() {
    if (!inCombat) return;

    // 检查是否所有人都行动过
    const allActed = combatants.every(c => c.acted || c.hp <= 0);
    if (allActed) {
      // 新一轮
      round++;
      combatants.forEach(c => c.acted = false);
      addLog(`--- 第 ${round + 1} 轮 ---`);
    }

    // 找下一个未行动的存活战斗者
    while (currentTurnIndex < combatants.length) {
      const c = combatants[currentTurnIndex];
      if (c.hp > 0 && !c.acted) {
        if (c.type === 'player') {
          addLog(`🎯 你的回合！选择行动。`);
          showPlayerActions(c);
        } else {
          addLog(`🎯 ${c.name} 的回合。`);
          enemyAction(c);
        }
        return;
      }
      currentTurnIndex++;
    }

    // 一轮结束，重置
    currentTurnIndex = 0;
    nextTurn();
  }

  // 显示玩家可执行的行动
  function showPlayerActions(combatant) {
    const weapon = WEAPONS[combatant.weapon] || WEAPONS['拳头'];
    const actions = [];

    // 攻击
    const enemies = combatants.filter(c => c.type === 'enemy' && c.hp > 0);
    if (enemies.length > 0) {
      actions.push({ id: 'attack', label: `⚔️ 攻击 (${combatant.weapon})`, action: () => showTargetSelection(combatant) });
    }

    // 移动
    actions.push({ id: 'move', label: '🚶 移动', action: () => enterMoveMode(combatant) });

    // 闪避（反应动作，本回合不主动使用）
    actions.push({ id: 'dodge', label: '🛡️ 防御姿态', action: () => setDodgeStance(combatant) });

    // 使用物品
    actions.push({ id: 'item', label: '📦 使用物品', action: () => useItem(combatant) });

    // 逃跑
    actions.push({ id: 'flee', label: '🏃 逃跑', action: () => attemptFlee(combatant) });

    if (typeof UI !== 'undefined' && UI.showCombatActions) {
      UI.showCombatActions(actions);
    }
  }

  // 选择攻击目标
  function showTargetSelection(attacker) {
    const enemies = combatants.filter(c => c.type === 'enemy' && c.hp > 0);
    const weapon = WEAPONS[attacker.weapon] || WEAPONS['拳头'];

    const targets = enemies.map(e => {
      const dist = SceneManager.gridDistance(attacker.gridX, attacker.gridZ, e.gridX, e.gridZ);
      const rangeClass = classifyDistance(dist, weapon.range);
      const penalty = RANGE_PENALTY[weapon.type]?.[rangeClass] || 0;
      const hasLOS = SceneManager.hasLineOfSight(attacker.gridX, attacker.gridZ, e.gridX, e.gridZ);

      // 掩体加成
      const targetObj = SceneManager.getObjectAt(e.gridX, e.gridZ);
      let coverBonus = 0;
      if (targetObj && targetObj.cover > 0) coverBonus = targetObj.cover * 10;

      return {
        id: e.id,
        name: e.name,
        distance: dist.toFixed(1),
        rangeClass: rangeClass === 'close' ? '近' : rangeClass === 'medium' ? '中' : '远',
        penalty,
        coverBonus,
        hasLOS,
        canAttack: weapon.type === 'melee' ? dist <= 1.5 : (hasLOS && dist <= weapon.range)
      };
    });

    if (typeof UI !== 'undefined' && UI.showTargetSelection) {
      UI.showTargetSelection(targets, (targetId) => executeAttack(attacker, targetId));
    }
  }

  // 执行攻击
  function executeAttack(attacker, targetId) {
    const target = combatants.find(c => c.id === targetId);
    if (!target || target.hp <= 0) return;

    const weapon = WEAPONS[attacker.weapon] || WEAPONS['拳头'];
    const dist = SceneManager.gridDistance(attacker.gridX, attacker.gridZ, target.gridX, target.gridZ);
    const rangeClass = classifyDistance(dist, weapon.range);
    const rangePenalty = RANGE_PENALTY[weapon.type]?.[rangeClass] || 0;

    // 掩体加成
    const targetObj = SceneManager.getObjectAt(target.gridX, target.gridZ);
    let coverBonus = 0;
    if (targetObj && targetObj.cover > 0) coverBonus = targetObj.cover * 10;

    // 视线检查
    if (weapon.type !== 'melee' && !SceneManager.hasLineOfSight(attacker.gridX, attacker.gridZ, target.gridX, target.gridZ)) {
      addLog(`❌ ${attacker.name} 无法看到 ${target.name}，攻击失败！`);
      endTurn(attacker);
      return;
    }

    // 技能检定
    const player = GameState.getPlayer();
    let skillValue = 0;
    if (attacker.type === 'player' && player) {
      skillValue = player.skills[weapon.skill] || CoCRules.calcSkillBase(weapon.skill, player.stats);
    } else {
      skillValue = attacker.dex; // NPC用DEX近似
    }

    const check = CoCRules.rollCheck(skillValue, 0, Math.abs(rangePenalty) + coverBonus);

    addLog(`🎲 ${attacker.name} 使用 ${attacker.weapon} 攻击 ${target.name}`);
    addLog(`   技能${skillValue} | 距离惩罚${rangePenalty} | 掩体+${coverBonus}`);
    addLog(`   掷骰: ${check.roll} → ${check.result}`);

    if (check.isSuccess) {
      // 计算伤害
      let dmgStr = weapon.damage;
      if (weapon.dbAdd && player && player.derived.db !== '0') {
        dmgStr += '+' + player.derived.db;
      }
      const dmg = CoCRules.rollDamage(dmgStr);

      // 大成功伤害翻倍（可选规则）
      let totalDmg = dmg.total;
      if (check.result === CoCRules.RESULT.CRITICAL || check.result === CoCRules.RESULT.EXTREME) {
        totalDmg *= 2;
        addLog(`   💥 ${check.result}！伤害翻倍！`);
      }

      target.hp = Math.max(0, target.hp - totalDmg);
      addLog(`   ✅ 命中！造成 ${totalDmg} 点伤害 (${dmgStr}=[${dmg.rolls.join('+')}${dmg.modifier ? (dmg.modifier > 0 ? '+' : '') + dmg.modifier : ''}])`);
      addLog(`   ${target.name} HP: ${target.hp}/${target.maxHp}`);

      if (target.hp <= 0) {
        addLog(`   💀 ${target.name} 被击倒！`);
        checkCombatEnd();
      }

      // 可破坏环境
      if (targetObj && targetObj.hp < 999 && targetObj.hp > 0) {
        // 攻击可能误伤场景对象
      }
    } else {
      if (check.result === CoCRules.RESULT.FUMBLE) {
        // 大失败：武器卡壳/走火/掉落
        addLog(`   ❌ 大失败！武器出现故障！`);
        if (weapon.type === 'ranged' && weapon.ammo) {
          addLog(`   🔫 武器卡壳，需要修复才能再次使用。`);
          attacker.weaponJam = true;
        } else {
          // 近战大失败：自己受伤
          const selfDmg = CoCRules.rollDie(4);
          attacker.hp = Math.max(0, attacker.hp - selfDmg);
          addLog(`   😵 失手！自己受到 ${selfDmg} 点伤害`);
        }
      } else {
        addLog(`   ❌ 未命中。`);
      }
    }

    endTurn(attacker);
  }

  // 敌人行动（简单AI）
  function enemyAction(enemy) {
    const playerCombatant = combatants.find(c => c.type === 'player' && c.hp > 0);
    if (!playerCombatant) { endTurn(enemy); return; }

    const dist = SceneManager.gridDistance(enemy.gridX, enemy.gridZ, playerCombatant.gridX, playerCombatant.gridZ);
    const weapon = WEAPONS[enemy.weapon] || WEAPONS['拳头'];

    if (dist <= 1.5 || (weapon.type === 'ranged' && dist <= weapon.range)) {
      // 攻击玩家
      setTimeout(() => {
        executeAttack(enemy, playerCombatant.id);
      }, 800);
    } else {
      // 向玩家移动
      const dx = Math.sign(playerCombatant.gridX - enemy.gridX);
      const dz = Math.sign(playerCombatant.gridZ - enemy.gridZ);

      // 尝试移动
      const newX = enemy.gridX + dx;
      const newZ = enemy.gridZ + dz;
      const obj = SceneManager.getObjectAt(newX, newZ);

      if (!obj || !obj.blockMove) {
        enemy.gridX = newX;
        enemy.gridZ = newZ;
        addLog(`🚶 ${enemy.name} 向你移动。`);
      } else {
        addLog(`🚶 ${enemy.name} 试图移动但被阻挡。`);
      }

      setTimeout(() => endTurn(enemy), 600);
    }
  }

  // 防御姿态
  function setDodgeStance(combatant) {
    combatant.dodgeStance = true;
    addLog(`🛡️ ${combatant.name} 采取防御姿态（闪避检定获得加成）。`);
    endTurn(combatant);
  }

  // 移动模式
  function enterMoveMode(combatant) {
    addLog(`🚶 选择移动目标格（点击格子移动）。`);
    if (typeof UI !== 'undefined' && UI.enterMoveMode) {
      UI.enterMoveMode((x, z) => {
        const dist = SceneManager.gridDistance(combatant.gridX, combatant.gridZ, x, z);
        if (dist <= combatant.mov && dist > 0) {
          const obj = SceneManager.getObjectAt(x, z);
          if (!obj || !obj.blockMove) {
            combatant.gridX = x;
            combatant.gridZ = z;
            addLog(`   移动到 (${x}, ${z})`);
          } else {
            addLog(`   该位置被 ${obj.name} 阻挡！`);
          }
        } else {
          addLog(`   超出移动范围！MOV=${combatant.mov}`);
        }
        endTurn(combatant);
      });
    }
  }

  // 使用物品
  function useItem(combatant) {
    // MVP：简单急救
    const player = GameState.getPlayer();
    if (player && player.derived.hp < player.derived.maxHp) {
      const heal = CoCRules.rollDie(4) + 2;
      combatant.hp = Math.min(combatant.maxHp, combatant.hp + heal);
      addLog(`💊 ${combatant.name} 使用急救包，恢复 ${heal} HP。`);
    } else {
      addLog(`📦 没有可用的物品。`);
    }
    endTurn(combatant);
  }

  // 逃跑
  function attemptFlee(combatant) {
    const check = CoCRules.rollCheck(combatant.dex);
    addLog(`🏃 ${combatant.name} 尝试逃跑！DEX检定: ${check.roll} → ${check.result}`);
    if (check.isSuccess) {
      addLog(`   成功逃离战斗！`);
      endCombat();
    } else {
      addLog(`   逃跑失败！`);
      endTurn(combatant);
    }
  }

  // 结束回合
  function endTurn(combatant) {
    combatant.acted = true;
    currentTurnIndex++;
    setTimeout(() => nextTurn(), 300);
  }

  // 检查战斗结束
  function checkCombatEnd() {
    const aliveEnemies = combatants.filter(c => c.type === 'enemy' && c.hp > 0);
    const alivePlayers = combatants.filter(c => c.type === 'player' && c.hp > 0);

    if (aliveEnemies.length === 0) {
      addLog(`🎉 所有敌人被击败！战斗胜利！`);
      endCombat();
      return true;
    }
    if (alivePlayers.length === 0) {
      addLog(`💀 调查员倒下...战斗失败。`);
      endCombat();
      return true;
    }
    return false;
  }

  // 结束战斗
  function endCombat() {
    inCombat = false;
    combatants = [];
    currentTurnIndex = 0;

    if (typeof UI !== 'undefined' && UI.hideCombat) {
      UI.hideCombat();
    }
  }

  // 日志
  function addLog(msg) {
    log.push({ time: Date.now(), msg });
    if (typeof UI !== 'undefined' && UI.addCombatLog) {
      UI.addCombatLog(msg);
    }
  }

  // 查询
  function isInCombat() { return inCombat; }
  function getCombatants() { return combatants; }
  function getLog() { return log; }
  function getRound() { return round; }
  function getCurrentCombatant() { return combatants[currentTurnIndex]; }

  return {
    WEAPONS, RANGE_PENALTY,
    startCombat, endCombat,
    executeAttack, nextTurn,
    isInCombat, getCombatants, getLog, getRound, getCurrentCombatant,
    classifyDistance, rollInitiative
  };
})();
