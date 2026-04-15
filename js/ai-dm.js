/**
 * AI DM 接口模块
 * 支持多种LLM后端：OpenAI兼容API / 腾讯混元 / 本地Ollama
 * 未配置API时自动降级为预设叙事模板
 */

const AIDM = (() => {
  // ========== 配置 ==========
  let config = {
    provider: 'openai',
    apiKey: 'sk-cp-4KI1Ezy7SSRLZt5KXUPDLZa-UY1_jxmPk1WqyUeGKTJrixrVcMYCVXjaIxEnYT0hjGydM7oqEEXtoLHXZCIFIXkpXB97Fifjj0K_9Vh64-djq48D8utTjbM',
    apiUrl: 'https://api.minimaxi.com/v1/chat/completions',
    model: 'MiniMax-M2.7',
    maxTokens: 512,
    temperature: 0.8
  };

  // 从localStorage加载配置
  function loadConfig() {
    try {
      const saved = localStorage.getItem('ai_dm_config');
      if (saved) config = { ...config, ...JSON.parse(saved) };
    } catch (e) {}
  }

  function saveConfig(newConfig) {
    config = { ...config, ...newConfig };
    try {
      localStorage.setItem('ai_dm_config', JSON.stringify(config));
    } catch (e) {}
  }

  function getConfig() { return { ...config }; }

  function isConfigured() {
    return config.provider !== 'none' && config.apiKey;
  }

  // ========== 系统提示词 ==========
  const SYSTEM_PROMPT = `你是暗夜跑团的DM（主持人），基于克苏鲁的呼唤第七版规则。

核心原则：
1. 你负责叙事描述、NPC扮演、剧情推进
2. 所有数值判定（技能检定、伤害计算等）由规则引擎硬性执行，你只决定"怎么说"
3. 每次回复控制在100-200字，营造氛围但不过度冗长
4. 根据玩家行动给出合理的后果和新的选择
5. 适时引入恐怖元素，但给玩家应对的机会
6. 不要替玩家做决定，只描述情境和后果

回复格式：
- 叙述文本（沉浸式第二人称）
- 可选：用【选项】标记2-3个可选行动`;

  // ========== 过滤AI思考过程 ==========
  function stripThinking(text) {
    if (!text) return '';
    // 过滤推理模型的思考过程标签
    text = text.replace(/\<think\>[\s\S]*?\<\/think\>/gi, '');
    // 过滤可能残留的开头空白
    return text.trim();
  }

  // ========== API调用 ==========
  async function chat(messages) {
    if (!isConfigured()) {
      console.warn('[AIDM] 未配置API，跳过AI调用');
      return null;
    }

    try {
      console.log('[AIDM] 开始调用API:', config.apiUrl);
      const headers = {
        'Content-Type': 'application/json',
      };

      let endpoint, body;

      if (config.provider === 'openai' || config.provider === 'tencent') {
        endpoint = config.apiUrl || (config.provider === 'tencent'
          ? 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions'
          : 'https://api.openai.com/v1/chat/completions');
        headers['Authorization'] = `Bearer ${config.apiKey}`;
        body = JSON.stringify({
          model: config.model || (config.provider === 'tencent' ? 'hunyuan-lite' : 'gpt-3.5-turbo'),
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
          max_tokens: config.maxTokens,
          temperature: config.temperature
        });
      } else if (config.provider === 'ollama') {
        endpoint = config.apiUrl || 'http://localhost:11434/api/chat';
        body = JSON.stringify({
          model: config.model || 'qwen2.5:7b',
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
          stream: false
        });
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body
      });

      if (!response.ok) {
        console.error('[AIDM] API错误:', response.status, await response.text());
        return null;
      }

      const data = await response.json();
      console.log('[AIDM] API响应成功');

      // OpenAI兼容格式
      if (data.choices && data.choices[0]) {
        const msg = data.choices[0].message;
        // msg.reasoning_content 是思考过程，不显示；只取 msg.content
        let content = msg.content || '';
        content = stripThinking(content);
        return content || null;
      }
      // Ollama格式
      if (data.message) {
        let content = data.message.content || '';
        content = stripThinking(content);
        return content || null;
      }

      console.warn('[AIDM] 无法解析API响应格式');
      return null;
    } catch (err) {
      console.error('[AIDM] API调用失败:', err);
      return null;
    }
  }

  // ========== 便捷方法 ==========

  // 生成叙事回应
  async function generateNarration(playerAction, context) {
    const messages = [];
    if (context?.history) {
      // 只保留最近10轮对话
      const recent = context.history.slice(-10);
      recent.forEach(h => {
        messages.push({ role: 'user', content: h.action });
        if (h.narration) messages.push({ role: 'assistant', content: h.narration });
      });
    }
    messages.push({ role: 'user', content: playerAction });

    const result = await chat(messages);
    if (result) {
      // 解析选项
      const choices = [];
      const choiceRegex = /【([^】]+)】/g;
      let match;
      while ((match = choiceRegex.exec(result)) !== null) {
        choices.push({ text: match[1], action: `ai_choice_${choices.length}` });
      }
      const narration = result.replace(/【[^】]+】/g, '').trim();
      return { narration, choices, fromAI: true };
    }
    return null;
  }

  // 生成剧本（含场景物件布局和氛围参数）
  async function generateScenario(surveyAnswers) {
    const prompt = `根据以下偏好生成一个克苏鲁的呼唤剧本大纲：
氛围：${surveyAnswers.mood || '哥特阴森'}
角色类型：${surveyAnswers.role || '局外人'}
期待：${surveyAnswers.expect || '解谜'}

请用以下格式回复（每行一个字段，用|分隔）：
【标题】剧本名称
【简介】2-3句故事简介
【场景1】场景名|房间类型|宽x高|雾密度|光强度|物件列表
【场景2】...
【场景3】...

房间类型可选：corridor/room_small/room_medium/room_large/library/basement/ritual
雾密度：0.03-0.12（越大越浓）
光强度：0.5-2.0（越大越亮）
物件列表：用逗号分隔，格式为"类型:位置"，如 table:2,2,candle:1,1,bookshelf:0,0
可用物件类型：table,chair,bookshelf,crate,barrel,altar,lamp,candle,statue,desk,bed,wardrobe,fireplace,chest,skeleton,rug,painting,mirror

示例：
【场景1】门厅|room_large|6x6|0.04|1.5|table:2,2,lamp:0,0,candle:1,1,painting:3,0,rug:2,3`;

    const result = await chat([{ role: 'user', content: prompt }]);
    return result;
  }

  // ========== 初始化 ==========
  loadConfig();
  
  // 启动时打印配置状态，便于调试
  console.log('[AIDM] 初始化完成，配置状态:', { 
    provider: config.provider, 
    hasApiKey: !!config.apiKey, 
    apiUrl: config.apiUrl,
    isConfigured: isConfigured()
  });

  return {
    chat, generateNarration, generateScenario,
    isConfigured, getConfig, saveConfig, loadConfig,
    SYSTEM_PROMPT
  };
})();
