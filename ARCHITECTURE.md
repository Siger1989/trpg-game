# 🏰 暗夜跑团 - 游戏架构脑图

> **维护规则**：每次代码更新后，必须同步更新本文档对应章节。  
> **最后更新**：2026-04-16（综合改造Phase1-5完成后）

---

## 📋 模块总览

| 模块 | 文件 | 行数 | 职责 | 状态 |
|------|------|------|------|------|
| CoCRules | `js/coc-rules.js` | 251 | CoC 7版规则引擎 | ✅ 稳定 |
| DMEngine | `js/dm-engine.js` | 1393 | 中央状态引擎+叙事 | ✅ Phase1-5 |
| Game | `js/game.js` | 764 | UI控制器+游戏循环 | ✅ Phase2-5 |
| ActionResolver | `js/action-resolver.js` | 517 | ActionOutcome模式 | ✅ Phase2 |
| RoomInteraction | `js/room-interaction.js` | 980 | 房间交互统一执行器 | ✅ Phase4 |
| RoomTemplates | `js/room-templates.js` | 365 | 房间模板+门连接 | ✅ Phase3 |
| SceneManager | `js/scene-manager.js` | 2822 | 3D场景渲染+移动 | ✅ 稳定 |
| CombatSystem | `js/combat.js` | 439 | 回合制战斗 | ✅ 稳定 |
| FogOfWar | `js/fog-of-war.js` | 291 | 三层迷雾+视线 | ✅ 稳定 |
| AIDM | `js/ai-dm.js` | 209 | AI叙事接口 | ✅ 稳定 |
| CameraControls | `js/camera-controls.js` | 198 | 相机控制 | ✅ 稳定 |
| PaperDoll | `js/paperdoll.js` | 619 | 纸娃娃角色肖像 | ✅ 稳定 |
| SceneCompiler | `js/scene-compiler.js` | 534 | 场景编译器(方案A) | ⚠️ 未接入 |
| InputInterpreter | `js/input-interpreter.js` | 358 | 意图识别(方案B) | ⚠️ 已被替代 |
| ScenePerception | `js/scene-perception.js` | 234 | 场景感知(方案D) | ⚠️ 未接入 |
| ActionQueue | `js/action-queue.js` | 281 | 动作队列(方案D) | ⚠️ 未接入 |

---

## 🔗 模块依赖关系图

```
                        ┌─────────────┐
                        │  index.html │
                        └──────┬──────┘
                               │ 加载所有JS
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
    ┌──────────┐        ┌──────────┐         ┌──────────┐
    │  Game.js │◄──────►│DMEngine  │◄───────►│  AIDM    │
    │ (UI控制) │        │(状态引擎)│         │(AI接口)  │
    └────┬─────┘        └────┬─────┘         └──────────┘
         │                   │
    ┌────┼───────────────────┼──────────────────────┐
    │    │                   │                      │
    ▼    ▼                   ▼                      ▼
┌────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│CoCRules│ │SceneMgr  │ │FogOfWar  │ │ActionResolver│
│(规则)  │ │(3D渲染)  │ │(迷雾)    │ │(结果模式)    │
└────────┘ └────┬─────┘ └────┬─────┘ └──────────────┘
                │             │
           ┌────┼─────────────┤
           ▼    ▼             ▼
    ┌──────────┐ ┌──────────────┐ ┌────────────┐
    │GLTFLoader│ │CameraControls│ │CombatSystem│
    │(模型加载)│ │(相机控制)    │ │(战斗系统)  │
    └──────────┘ └──────────────┘ └────────────┘

    ┌───────────────┐  ┌─────────────────┐
    │RoomInteraction│◄─┤  RoomTemplates  │
    │(交互执行器)   │  │(房间模板)       │
    └───────┬───────┘  └─────────────────┘
            │
    ┌───────┼───────────────────┐
    ▼       ▼                   ▼
┌────────┐ ┌──────────┐  ┌──────────┐
│FogOfWar│ │DMEngine  │  │GameState │
│        │ │          │  │(Game.js) │
└────────┘ └──────────┘  └──────────┘

    ┌──────────────┐
    │  PaperDoll   │ ← 独立，仅被 index.html 调用
    │ (纸娃娃)     │
    └──────────────┘

    ─── 未接入模块 ───
    ┌──────────────┐  ┌────────────────┐  ┌──────────────┐  ┌───────────┐
    │SceneCompiler │  │InputInterpreter│  │ScenePerception│  │ActionQueue│
    │(方案A-编译)  │  │(方案B-意图)    │  │(方案D-感知)  │  │(方案D-队列)│
    └──────────────┘  └────────────────┘  └──────────────┘  └───────────┘
```

---

## 📊 核心数据流

### 玩家输入 → 结果反馈 完整链路

```
玩家输入文本
    │
    ▼
Game.sendPlayerInput()
    │
    ├─ tryLocalAction() ──── 本地交互路径（优先）
    │       │
    │       ▼
    │   RoomInteraction.executePlayerInput()
    │       │
    │       ├─ classifyInput()     → 输入分类(describe/move/interact/composite/flavor)
    │       ├─ bindTarget()        → 目标绑定(别名→动作反推→歧义→找不到)
    │       ├─ parseAction()       → 动作解析
    │       │
    │       ▼
    │   DMEngine.validateInteraction()  → 三重验证(同房/可见/距离)
    │       │
    │       ▼
    │   ActionResolver.resolve()        → 生成ActionOutcome
    │       │
    │       ▼
    │   DMEngine.applyOutcome()         → 集中执行状态变更
    │       │
    │       ▼
    │   反馈文本 + UI更新
    │
    └─ DMEngine.processFreeInput() ── AI叙事路径（降级）
            │
            ▼
        AIDM.chat() → AI生成叙事
            │
            ▼
        反馈文本 + UI更新
```

### 点击3D对象交互链路

```
点击3D对象
    │
    ▼
SceneManager.objectInteractionHandler
    │
    ▼
Game.buildInteractionOutcome(gx, gz)
    │
    ├─ DMEngine.validateInteraction()  → 三重验证
    ├─ ActionResolver.resolve()        → ActionOutcome
    ├─ DMEngine.applyOutcome()         → 状态变更
    │
    ▼
反馈文本 + UI更新
```

### 回合结束链路

```
玩家点击"结束回合" 或 AP耗尽
    │
    ▼
DMEngine.endTurn()
    │
    ├─ 重置AP
    ├─ 处理NPC行动
    ├─ 更新迷雾 FogOfWar.updateVision()
    ├─ 生成环境叙事
    │
    ▼
UI.addNarration() + UI.updateHUD()
```

---

## 🏗️ 核心数据结构

### GameState（统一游戏状态）

```javascript
gameState = {
    meta: {
        scenarioId: String,
        currentRoomId: String,
        turn: Number,
        phase: String  // 'exploration' | 'combat' | 'dialogue'
    },
    player: {
        name: String,
        stats: { str, con, siz, dex, app, int, pow, edu, luck },
        derived: { hp, mp, san, mov, db, build },
        skills: { [skillName]: { base, occupation, hobby, total } },
        occupation: String,
        age: Number,
        position: { gx: Number, gz: Number },
        facing: Number  // 弧度
    },
    rooms: {
        [roomId]: {
            id, name, description, size: {w, h},
            objects: [{ id, type, gx, gz, state, ... }],
            doors: [{ id, wall, position, connectedRoomId, portal, state }],
            ambientLight: Number,
            fogDensity: Number,
            mood: String
        }
    },
    objects: {
        [objectId]: {
            id, type, name, gx, gz, roomId,
            state: String,           // UNSEARCHED | CLUE_FOUND | RESOLVED
            searchCount: Number,
            maxSearch: Number,
            isOn: Boolean,           // 灯光/开关类
            isOpen: Boolean,         // 门/容器类
            aliases: [String],
            availableActions: [String],
            interactionRange: Number
        }
    },
    clues: {
        [clueId]: { id, name, description, found: Boolean, objectId: String }
    },
    inventory: [String],  // 物品ID列表
    events: [{ turn, type, description }],
    flags: { [key]: any },
    actionPoints: { current: Number, max: Number }
}
```

### ActionOutcome（标准化动作结果）

```javascript
ActionOutcome = {
    success: Boolean,
    consumesAp: Boolean,
    logs: [String],
    stateChanges: [{
        type: 'object' | 'room' | 'player' | 'clue' | 'inventory',
        gx: Number,        // 对象坐标(对象类型)
        gz: Number,
        field: String,     // 要修改的字段名
        value: any,        // 新值
        delta: Number      // 增量(可选，与value二选一)
    }],
    narrationHint: String,
    requiresRender: Boolean,
    resultType: String,    // SUCCESS | NEED_APPROACH | BLOCKED | AMBIGUOUS | NO_TARGET
    targetId: String,
    uiHint: String         // 'highlight' | 'approach' | null
}
```

### FogState（迷雾状态）

```javascript
FOG_STATE = {
    UNDISCOVERED: 0,  // 未发现 - 完全不可见
    KNOWN: 1,         // 已知 - 可见但未详细探索
    EXPLORED: 2       // 已探索 - 完全可见
}
```

### RoomTemplate（房间模板）

```javascript
RoomTemplate = {
    type: String,           // entrance_hall | corridor | library | basement | ...
    shape: 'rect' | 'l_shape',
    size: { w: Number, h: Number },
    doorSlots: [{
        wall: 'north' | 'south' | 'east' | 'west',
        position: Number,   // 沿墙位置(0-1)
        required: Boolean
    }],
    wallObjectSlots: [{
        wall: String,
        position: Number,
        objectType: String,
        role: String         // anchor | interactive | clue | blocker | atmosphere | light_source
    }],
    spawnPoint: { gx, gz },
    ambientLight: Number,
    fogDensity: Number
}
```

---

## 📡 模块API速查

### CoCRules — 规则引擎
| API | 说明 |
|-----|------|
| `rollStats()` | 随机生成8项属性 |
| `calcDerived(stats)` | 计算衍生属性(HP/MP/SAN等) |
| `calcSkillBase(skillName, stats)` | 计算技能基础值 |
| `rollCheck(value, penalty=0, bonus=0)` | d100检定，返回`{roll, result, value}` |
| `opposedCheck(activeVal, passiveVal)` | 对抗检定 |
| `rollDamage(formula)` | 伤害骰(如"1d6+1") |
| `sanCheck(currentSan, lossFormula)` | 理智检定 |
| `rollDie(sides)` | 单骰子 |

**常量**：`ATTRIBUTES`(8项), `SKILLS`(35个), `OCCUPATIONS`(16个), `RESULT`(6级: CRITICAL_SUCCESS→FUMBLE)

### DMEngine — 状态引擎
| API | 说明 |
|-----|------|
| `initWorld(playerData)` | 初始化世界(无剧本) |
| `initWorldWithScenario(scenarioId, playerData)` | 带剧本初始化 |
| `processChoice(choiceId)` | 处理选项选择 |
| `processFreeInput(text)` | 处理自由文本输入 |
| `applyOutcome(outcome)` | **核心**：集中执行ActionOutcome状态变更 |
| `handleDoorInteraction(doorId, action)` | 门交互(开/关/进入) |
| `endTurn()` | **核心**：回合结束单一入口 |
| `validateInteraction(gx, gz)` | **核心**：三重验证(同房/可见/距离) |
| `getCurrentScene()` | 获取当前场景描述 |
| `getNarration()` | 获取叙事文本 |
| `getChoices()` | 获取可选选项 |
| `getGameState()` | 获取完整游戏状态 |
| `getObjectState(objectId)` | 获取对象状态 |
| `setObjectState(objectId, field, value)` | 设置对象状态字段 |
| `advanceObjectState(objectId)` | 推进对象搜索状态机 |
| `canSearchObject(objectId)` | 检查对象是否可搜索 |
| `getAP()` / `consumeAP(n)` / `resetAP()` | AP管理 |
| `saveState()` / `loadState()` | 存档/读档 |
| `registerPlayer(playerData)` | 注册玩家 |
| `generateScenarioFromSurvey(surveyAnswers)` | 从问卷生成剧本 |

### Game — UI控制器
| API | 说明 |
|-----|------|
| `GameState.getPlayer()` | 获取玩家数据 |
| `GameState.createPlayer(data)` | 创建玩家 |
| `GameState.saveGame()` / `loadGame()` / `hasSave()` / `deleteSave()` | 存档管理 |
| `UI.showScreen(name)` | 切换界面(menu/char-create/game/about/survey) |
| `UI.addNarration(text, type)` | 添加叙事文本 |
| `UI.updateHUD()` | 更新HUD(HP/SAN/AP/回合) |
| `UI.updateCombat()` / `UI.hideCombat()` | 战斗UI |
| `UI.showCombatActions()` / `UI.showTargetSelection()` | 战斗操作UI |
| `buildInteractionOutcome(gx, gz)` | 构建交互结果(3D点击) |
| `tryLocalAction(text)` | 尝试本地交互(文本输入) |
| `sendPlayerInput(text)` | 发送玩家输入(总入口) |
| `showInventory()` | 显示背包面板 |
| `handleChoice(choiceId)` | 处理选项选择 |

### ActionResolver — 结果模式
| API | 说明 |
|-----|------|
| `resolve(context)` | 解析动作上下文，生成ActionOutcome |
| `makeOutcome(opts)` | 构建ActionOutcome对象 |
| `fromActionResult(actionResult)` | 从ActionResult桥接转换 |
| `buildSuccessOutcome(targetId, stateChanges, hint)` | 快速构建成功结果 |
| `classifyDialogueAP(text)` | 对话AP分级(0/1/2/3) |
| `executeAction(action, context)` | 执行动作 |
| `formatFeedback(resultType, targetName)` | 格式化反馈文本 |

**常量**：`RESULT_TYPES`(5种), `DIALOGUE_AP_LEVELS`(4级)

### RoomInteraction — 交互执行器
| API | 说明 |
|-----|------|
| `buildRoomState()` | 构建当前房间状态快照 |
| `executePlayerInput(text)` | **核心**：执行玩家文本输入 |
| `classifyInput(text)` | 输入分类(describe/move/interact/composite/flavor/unknown) |
| `parseVerb(text)` | 动词解析 |
| `bindTarget(text, objects)` | 目标绑定 |
| `parseAction(verb, target)` | 动作解析 |
| `describeRoom()` | 房间观察描述 |

### SceneManager — 3D场景
| API | 说明 |
|-----|------|
| `init(container)` | 初始化3D场景 |
| `buildRoom(roomData)` | 构建房间3D场景 |
| `movePlayer(gx, gz)` | 移动玩家到格子 |
| `moveAlongPath(path)` | 沿路径移动 |
| `getPlayerPos()` | 获取玩家格子坐标 |
| `getObjectAt(gx, gz)` | 获取指定格子对象 |
| `toggleObjectLight(objectId)` | 切换灯光状态 |
| `toggleDoor(doorId)` | 切换门状态 |
| `highlightObject(objectId)` | 高亮对象 |
| `setObjectInteractionHandler(fn)` | 设置对象点击回调 |
| `loadPlayerModel()` | 加载玩家3D模型 |
| `setPlayerFacing(angle)` | 设置玩家朝向 |
| `canInteract(gx, gz)` | 检查交互距离 |
| `hasLineOfSight(from, to)` | Bresenham视线检查 |
| `gridDistance(a, b)` | 格子距离 |
| `addToScene(mesh)` | 添加3D对象到场景 |
| `getRoomInfo()` | 获取当前房间信息 |
| `sceneObjects` | 场景对象映射(属性) |

### RoomTemplates — 房间模板
| API | 说明 |
|-----|------|
| `getTemplate(type)` | 获取房间模板 |
| `generateDoors(template, connections)` | 生成门对象 |
| `calcWallPosition(wall, pos, roomSize)` | 计算墙上位置坐标 |
| `getSpawnPoint(template)` | 获取出生点 |
| `applyConnections(roomId, connections)` | 应用门连接 |
| `getConnectedRoom(doorId)` | 获取门连接的房间 |
| `listTemplateTypes()` | 列出所有模板类型 |

**模板类型**：entrance_hall, corridor, library, basement, ritual, room_small, room_medium, room_large

### CombatSystem — 战斗系统
| API | 说明 |
|-----|------|
| `startCombat(enemies)` | 开始战斗 |
| `endCombat()` | 结束战斗 |
| `executeAttack(attackerId, targetId, weaponId)` | 执行攻击 |
| `nextTurn()` | 下一回合 |
| `isInCombat()` | 是否战斗中 |
| `getCombatants()` | 获取战斗参与者 |
| `rollInitiative()` | 投先攻 |

**数据**：`WEAPONS`(8种), `RANGE_PENALTY`(距离惩罚表)

### FogOfWar — 迷雾系统
| API | 说明 |
|-----|------|
| `init(gridW, gridH)` | 初始化迷雾网格 |
| `updateVision(playerPos, range)` | 更新玩家视野 |
| `setSanityDistortion(level)` | 设置理智扭曲 |
| `extinguishLight(objectId)` | 熄灭灯光(影响视野) |
| `getCellState(gx, gz)` | 获取格子迷雾状态 |
| `isVisible(gx, gz)` | 格子是否可见 |
| `isInitialized()` | 是否已初始化 |
| `renderFogTexture()` | 渲染迷雾纹理 |

### AIDM — AI叙事接口
| API | 说明 |
|-----|------|
| `chat(messages)` | AI对话 |
| `generateNarration(context)` | 生成叙事文本 |
| `generateScenario(prompt)` | 生成剧本 |
| `isConfigured()` | 是否已配置 |
| `getConfig()` / `saveConfig()` / `loadConfig()` | 配置管理 |

**后端**：OpenAI / 腾讯混元 / Ollama（本地）

### PaperDoll — 纸娃娃
| API | 说明 |
|-----|------|
| `render(canvas, state)` | 渲染角色肖像 |
| `cycle(part)` | 循环切换部件 |
| `getLabel(part, index)` | 获取部件标签 |
| `getState()` / `setState(state)` | 获取/设置状态 |
| `renderMini(canvas, state)` | 渲染迷你头像 |

**部件**：hair(20), face(8), expression(5), outfit(10), skinTones(6)

### CameraControls — 相机控制
| API | 说明 |
|-----|------|
| `init(camera, domElement)` | 初始化 |
| `update()` | 帧更新(惯性) |
| `setTarget(x, y, z)` | 设置观察目标 |
| `setSpherical(radius, theta, phi)` | 设置球坐标 |
| `getTarget()` | 获取当前目标 |
| `setEnabled(bool)` | 启用/禁用 |

---

## 🔄 关键机制详解

### 1. ActionOutcome模式（Phase2核心）

所有交互结果统一为ActionOutcome对象，由`applyOutcome()`集中执行状态变更。

**流程**：
```
交互触发 → ActionResolver.resolve() → ActionOutcome
                                         │
                 ┌───────────────────────┤
                 ▼                       ▼
         stateChanges[]            narrationHint
                 │                       │
                 ▼                       ▼
         applyOutcome()           UI.addNarration()
         逐条执行变更
```

**stateChange类型**：
- `object`：修改房间对象(gx,gz定位)的field
- `room`：修改房间属性
- `player`：修改玩家属性(HP/SAN/位置)
- `clue`：修改线索状态
- `inventory`：增删背包物品

### 2. 对象状态机（Phase4）

```
UNSEARCHED ──search──► CLUE_FOUND ──search──► RESOLVED
    │                      │
    │ searchCount=0        │ searchCount < maxSearch
    │                      │
    └──canSearch=true      └──canSearch=true
                           
                    searchCount ≥ maxSearch → canSearch=false
```

### 3. 三重验证门控（Phase5）

```
validateInteraction(gx, gz)
    │
    ├─ 1. 同房检查：对象是否在当前房间
    ├─ 2. 可见检查：FogOfWar.isVisible(gx, gz)
    └─ 3. 距离检查：gridDistance(player, target) ≤ INTERACT_RANGE
```

### 4. 门连接系统（Phase3）

```
Door对象 = {
    id, wall, position,
    connectedRoomId,    → 连接的目标房间ID
    portal: {gx, gz},   → 目标房间的入口坐标
    state: 'closed'     → 'open' | 'closed' | 'locked'
}

handleDoorInteraction(doorId, action):
    open  → state='open'
    close → state='closed'  
    enter → 验证state → 切换房间 → SceneManager.buildRoom() → FogOfWar.updateVision()
```

### 5. 迷雾三层系统

```
UNDISCOVERED(0) ──进入视野──► KNOWN(1) ──详细探索──► EXPLORED(2)
    │                            │                           │
    完全不可见                   可见轮廓                    完全可见
    无交互                      有限交互                    全部交互
```

**视线计算**：Bresenham射线 + 障碍物遮挡 + 灯光范围 + 理智扭曲

---

## ⚠️ 未接入模块说明

| 模块 | 方案 | 状态 | 接入条件 |
|------|------|------|----------|
| SceneCompiler | A-场景编译 | 代码完成，未接入dm-engine | 需要AI动态生成场景时接入 |
| InputInterpreter | B-意图识别 | 已被RoomInteraction替代 | 不再接入，保留参考 |
| ScenePerception | D-场景感知 | 代码完成，未接入 | 需要AI叙事受视野约束时接入 |
| ActionQueue | D-动作队列 | 代码完成，未接入 | 需要自动寻路+复合动作时接入 |

---

## 📝 已知TODO

- [ ] SceneCompiler接入dm-engine.js
- [ ] 背包物品使用逻辑
- [ ] 门开启后视觉反馈需scene-manager.js支持
- [ ] AI叙事完全对接ActionOutcome（目前部分走旧路径）
- [ ] InputInterpreter清理或标记废弃

---

## 🎮 预设剧本

### old_house（旧宅疑云）
```
门厅(entrance_hall) → 走廊(corridor) → 图书馆(library)
                                    ↓
                              地下室(basement) → 仪式室(ritual)
```

---

## 📐 架构四层模型

```
┌─────────────────────────────────────────────┐
│           叙事意图层（AI负责）                │
│  房间是什么、服务什么剧情、情绪是什么          │
├─────────────────────────────────────────────┤
│           场景逻辑层（AI+模板）               │
│  room_type、shape、zones、interactables      │
│  → SceneCompiler / RoomTemplates            │
├─────────────────────────────────────────────┤
│           空间编译层（代码负责）               │
│  合法grid、槽位、摆放、通路校验               │
│  → SceneManager.buildRoom()                 │
├─────────────────────────────────────────────┤
│           渲染交互层（Three.js）              │
│  3D渲染、移动、点击、灯光、迷雾               │
│  → SceneManager + FogOfWar + CameraControls │
└─────────────────────────────────────────────┘
```

---

*本文档由 Claw 🦀 生成并维护，随代码更新同步更新。*
