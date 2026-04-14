/**
 * 动作队列 - 方案D落地
 * 解决"玩家说过去开灯但角色不自动走"的问题
 * 自然语言→动作队列→自动移动+交互链
 * 
 * 支持4类基础动作：move_to / face_to / interact / pause
 * 关键边界：
 * - "过去开灯" → 允许自动补全移动（明确移动意图）
 * - "开灯" → 不替玩家偷偷走，距离不足时提示"要先靠近吗？"
 * - 目标不唯一 → 优先澄清
 * - 目标唯一且路径明确 → 直接执行自动移动
 */
const ActionQueue = (() => {

  // ========== 动作类型 ==========
  const ACTION_TYPES = {
    MOVE_TO: 'move_to',
    FACE_TO: 'face_to',
    INTERACT: 'interact',
    PAUSE: 'pause'
  };

  // ========== 队列状态 ==========
  let queue = [];
  let isExecuting = false;
  let currentAction = null;
  let onCompleteCallback = null;

  // ========== 移动参数 ==========
  const INTERACT_RANGE = 1.5;

  // ========== 构建动作队列 ==========
  function buildFromInterpretation(interpretation, sceneObjects, playerPos) {
    if (!interpretation) return [];

    const actions = [];

    // 复合动作（隐式拆步）
    if (interpretation.steps) {
      for (const step of interpretation.steps) {
        const targetObj = resolveTarget(step.target, sceneObjects);
        if (!targetObj) continue;

        if (step.intent === 'move' || step.action === 'approach') {
          actions.push({
            type: ACTION_TYPES.MOVE_TO,
            targetId: targetObj.id,
            targetPos: { x: targetObj.gridX, z: targetObj.gridZ },
            requiredRange: INTERACT_RANGE
          });
        } else if (step.intent === 'interact' || step.intent === 'investigate') {
          actions.push({
            type: ACTION_TYPES.INTERACT,
            targetId: targetObj.id,
            action: step.action,
            targetPos: { x: targetObj.gridX, z: targetObj.gridZ }
          });
        }
      }
    }
    // 单一动作
    else {
      const targetObj = resolveTarget(interpretation.target, sceneObjects);

      if (interpretation.intent === 'move') {
        if (targetObj) {
          actions.push({
            type: ACTION_TYPES.MOVE_TO,
            targetId: targetObj.id,
            targetPos: { x: targetObj.gridX, z: targetObj.gridZ },
            requiredRange: 0.5
          });
        } else if (interpretation.direction) {
          actions.push({
            type: ACTION_TYPES.MOVE_TO,
            targetId: null,
            direction: interpretation.direction,
            requiredRange: 0
          });
        }
      } else if (interpretation.intent === 'interact' || interpretation.intent === 'investigate') {
        if (targetObj) {
          const dist = getDistance(playerPos, { x: targetObj.gridX, z: targetObj.gridZ });
          if (dist > INTERACT_RANGE) {
            return [{
              type: ACTION_TYPES.INTERACT,
              targetId: targetObj.id,
              action: interpretation.action,
              targetPos: { x: targetObj.gridX, z: targetObj.gridZ },
              needApproach: true
            }];
          }
          actions.push({
            type: ACTION_TYPES.INTERACT,
            targetId: targetObj.id,
            action: interpretation.action,
            targetPos: { x: targetObj.gridX, z: targetObj.gridZ }
          });
        }
      }
    }

    return actions;
  }

  // ========== 目标解析 ==========
  function resolveTarget(target, sceneObjects) {
    if (!target || !sceneObjects) return null;
    if (target.type) {
      const candidates = sceneObjects.filter(o => o.type === target.type);
      if (candidates.length === 0) return null;
      if (candidates.length === 1) return candidates[0];
      return candidates[0]; // 暂时取第一个，后续加消歧
    }
    return null;
  }

  // ========== 距离计算 ==========
  function getDistance(pos1, pos2) {
    const dx = pos1.x - pos2.x;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  // ========== 执行队列 ==========
  function execute(actions, callbacks) {
    if (!actions || actions.length === 0) {
      callbacks?.onComplete?.();
      return;
    }

    queue = [...actions];
    isExecuting = true;
    onCompleteCallback = callbacks?.onComplete || null;

    executeNext(callbacks);
  }

  function executeNext(callbacks) {
    if (queue.length === 0) {
      isExecuting = false;
      currentAction = null;
      onCompleteCallback?.();
      return;
    }

    currentAction = queue.shift();

    switch (currentAction.type) {
      case ACTION_TYPES.MOVE_TO:
        executeMoveTo(currentAction, callbacks);
        break;
      case ACTION_TYPES.FACE_TO:
        executeNext(callbacks); // 暂跳过
        break;
      case ACTION_TYPES.INTERACT:
        executeInteract(currentAction, callbacks);
        break;
      case ACTION_TYPES.PAUSE:
        setTimeout(() => executeNext(callbacks), currentAction.duration || 500);
        break;
      default:
        executeNext(callbacks);
    }
  }

  // ========== 执行移动 ==========
  function executeMoveTo(action, callbacks) {
    if (!callbacks?.movePlayer) {
      executeNext(callbacks);
      return;
    }

    // 方向移动
    if (action.direction && !action.targetPos) {
      const dir = action.direction;
      callbacks.movePlayer(dir.dx || 0, dir.dz || 0, () => {
        executeNext(callbacks);
      });
      return;
    }

    // 目标移动：逐步靠近
    moveToTarget(action, callbacks);
  }

  function moveToTarget(action, callbacks) {
    const targetPos = action.targetPos;
    const requiredRange = action.requiredRange || INTERACT_RANGE;

    function step() {
      const playerPos = callbacks.getPlayerPos?.();
      if (!playerPos) {
        executeNext(callbacks);
        return;
      }

      const dist = getDistance(playerPos, targetPos);
      if (dist <= requiredRange) {
        if (action.targetId && typeof ScenePerception !== 'undefined') {
          ScenePerception.confirmPosition?.(action.targetId, targetPos.x, targetPos.z);
        }
        executeNext(callbacks);
        return;
      }

      // 计算下一步方向
      const dx = targetPos.x - playerPos.x;
      const dz = targetPos.z - playerPos.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      const ndx = dx / len;
      const ndz = dz / len;

      const moveX = Math.abs(ndx) > 0.3 ? (ndx > 0 ? 1 : -1) : 0;
      const moveZ = Math.abs(ndz) > 0.3 ? (ndz > 0 ? 1 : -1) : 0;

      callbacks.movePlayer(moveX, moveZ, () => {
        const newPos = callbacks.getPlayerPos?.();
        if (newPos) {
          const newDist = getDistance(newPos, targetPos);
          if (newDist <= requiredRange) {
            if (action.targetId && typeof ScenePerception !== 'undefined') {
              ScenePerception.confirmPosition?.(action.targetId, targetPos.x, targetPos.z);
            }
            executeNext(callbacks);
            return;
          }
        }
        setTimeout(step, 150);
      });
    }

    step();
  }

  // ========== 执行交互 ==========
  function executeInteract(action, callbacks) {
    if (action.needApproach) {
      callbacks.onNeedApproach?.(action.targetId, action.targetPos);
      isExecuting = false;
      currentAction = null;
      return;
    }

    callbacks.interact?.(action.targetId, action.action, () => {
      if (action.targetPos && typeof ScenePerception !== 'undefined') {
        ScenePerception.confirmPosition?.(action.targetId, action.targetPos.x, action.targetPos.z);
      }
      executeNext(callbacks);
    });
  }

  // ========== 取消 ==========
  function cancel() {
    queue = [];
    isExecuting = false;
    currentAction = null;
  }

  // ========== 查询 ==========
  function getStatus() {
    return {
      isExecuting,
      currentAction,
      queueLength: queue.length,
      queue: queue.map(a => ({ type: a.type, targetId: a.targetId }))
    };
  }

  // ========== 导出 ==========
  return {
    ACTION_TYPES,
    buildFromInterpretation,
    execute,
    cancel,
    getStatus,
    resolveTarget,
    getDistance
  };
})();
