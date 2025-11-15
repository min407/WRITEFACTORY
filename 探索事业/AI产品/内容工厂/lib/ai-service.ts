/**
 * AI分析服务层
 * 提供与OpenAI兼容API的调用服务
 */

import { ArticleSummary, TopicInsight } from '@/types/ai-analysis'

// OpenAI配置从环境变量读取
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const OPENAI_API_BASE = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o'

/**
 * 调用OpenAI API
 */
async function callOpenAI(
  messages: Array<{ role: string; content: string }>,
  temperature = 0.7
): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY 未配置')
  }

  const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      temperature,
      response_format: { type: 'text' },
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }))
    throw new Error(`OpenAI API错误: ${error.error?.message || response.statusText}`)
  }

  const data = await response.json()
  return data.choices[0]?.message?.content || ''
}

/**
 * 深度文章分析（阶段1增强版）
 * 对每篇文章进行深入的内容和用户分析
 */
export async function deepAnalyzeArticles(
  articles: Array<{
    title: string
    content?: string
    likes: number
    reads: number
    url: string
  }>
): Promise<ArticleSummary[]> {
  if (!articles || articles.length === 0) {
    return []
  }

  // 构建详细的文章数据
  const articlesJson = JSON.stringify(
    articles.map((a, i) => ({
      index: i + 1,
      title: a.title,
      content: (a.content || '').substring(0, 3000), // 增加内容长度以获得更好分析
      likes: a.likes,
      reads: a.reads,
      engagement: a.reads > 0 ? ((a.likes / a.reads) * 100).toFixed(1) : '0',
    }))
  )

  const prompt = `你是一个资深的内容分析专家。请对以下${articles.length}篇微信公众号文章进行深度分析，提取结构化信息。

文章数据：
${articlesJson}

请为每篇文章输出以下JSON格式：
{
  "summaries": [
    {
      "index": 1,
      "keyPoints": ["要点1", "要点2", "要点3"],
      "keywords": ["关键词1", "关键词2", "关键词3", "关键词4", "关键词5", "关键词6"],
      "highlights": ["亮点1", "亮点2"],
      "engagementAnalysis": "互动表现分析（50字以内）",

      // 新增的深度分析字段（必须填写）
      "targetAudience": "明确的目标人群，如：职场新人、宝妈、大学生、创业者等",
      "scenario": "具体使用场景，如：工作日早晨、周末休息、睡前阅读、通勤路上等",
      "painPoint": "解决的痛点需求，如：时间紧张、选择困难、技能缺失、信息焦虑等",
      "contentAngle": "内容角度，如：实用教程、经验分享、趋势分析、产品评测等",
      "emotionType": "情感类型，如：激励鼓舞、温暖治愈、理性分析、幽默轻松等",
      "writingStyle": "写作风格，如：干货满满、故事性强、数据驱动、观点鲜明等"
    }
  ]
}

核心要求：
1. **targetAudience、scenario、painPoint 这三个字段必须准确填写**，这是后续选题洞察的关键
2. keyPoints: 3-5个最有价值的要点
3. keywords: 至少5个关键词，包含主题词、人群词、场景词、痛点词
4. highlights: 1-2个最有特色的内容亮点
5. engagementAnalysis: 基于互动数据分析内容受欢迎的原因

只输出JSON格式，不要任何解释文字。`

  const response = await callOpenAI([
    { role: 'system', content: '你是一个专业的内容深度分析专家，擅长从文章中提取结构化信息，只输出JSON格式数据。' },
    { role: 'user', content: prompt },
  ], 0.3)

  // 解析JSON响应
  try {
    // 清理响应中的markdown标记
    let cleanResponse = response.trim()
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace('```json', '').replace('```', '').trim()
    }

    const parsed = JSON.parse(cleanResponse)
    const summaries = parsed.summaries || []

    // 验证关键字段是否完整
    summaries.forEach((summary: any, index: number) => {
      if (!summary.targetAudience || !summary.scenario || !summary.painPoint) {
        console.warn(`文章${index + 1}缺少关键字段: targetAudience/scenario/painPoint`)
      }
    })

    return summaries
  } catch (error) {
    console.error('解析AI响应失败:', response)
    throw new Error('深度文章分析失败')
  }
}

/**
 * 生成高质量选题洞察（阶段2增强版）
 * 基于深度文章分析生成不限制数量的选题洞察，按重要指数排序
 */
export async function generateSmartTopicInsights(
  summaries: ArticleSummary[],
  stats: {
    totalArticles: number
    avgReads: number
    avgLikes: number
    avgEngagement: string
  }
): Promise<TopicInsight[]> {
  if (!summaries || summaries.length === 0) {
    return []
  }

  const summariesJson = JSON.stringify(summaries)

  const prompt = `你是一个顶级的内容选题策划专家，专门为微信公众号创作者提供精准的选题洞察。基于对${summaries.length}篇高质量文章的深度分析，请生成尽可能多的具有商业价值的选题洞察。

文章深度分析数据：
${summariesJson}

统计数据：
- 总文章数: ${stats.totalArticles}
- 平均阅读量: ${stats.avgReads}
- 平均点赞数: ${stats.avgLikes}
- 平均互动率: ${stats.avgEngagement}

请严格按照以下三维度分析框架，生成高质量选题洞察（不限制数量）：

**三维度分析框架说明：**

1. **决策阶段**：基于用户旅程觉察阶段，深度分析用户心理状态和行为阶段
   - **觉察期**：用户刚意识到问题存在，处于困惑迷茫阶段，如"为什么我总是效率低下"、"大家都在用AI我不懂怎么办"
   - **认知期**：用户开始主动了解概念和基础信息，如"什么是私域流量"、"AI工具有哪些类型"
   - **调研期**：用户在比较和收集信息，处于选择困难阶段，如"哪个副业最适合我"、"AI写作工具哪个好用"
   - **决策期**：用户准备开始行动，需要具体指导和信心，如"如何开始第一个副业项目"、"AI写作具体步骤"
   - **行动期**：用户已经在执行中，遇到具体问题需要解决，如"副业没效果怎么办"、"AI写作质量不高怎么提升"
   - **成果期**：用户有了初步结果，想要优化和展示，如"副业收入如何提升"、"AI写作效率提升案例"

2. **人群场景**：必须基于文章内容深度分析，精准定位具体人群和使用场景
   - **人群分析**：从文章内容中提取具体的人群特征，如：30岁职场妈妈、二三线城市的程序员、刚毕业的设计师、创业公司老板等，要尽可能具体
   - **场景分析**：结合人群特征分析具体使用场景，如：深夜加班时、地铁通勤路上、带娃间隙时间、周末充电学习、工作中遇到瓶颈时等，要与人群高度匹配
   - **组合分析**：人群+场景的精准匹配，如"深夜加班的程序员想要提升效率"、"带娃间隙的宝妈想学习新技能"

3. **需求痛点**：深度分析用户产生这个问题的根本原因和核心诉求
   - **情绪痛点**：分析用户的情感状态，如：对未来感到焦虑、对现状不满、渴望被认可、害怕落后、想要改变现状等
   - **现实痛点**：分析用户遇到的实际问题，如：收入不够用、工作遇到瓶颈、技能跟不上时代、时间管理困难、选择太多无从下手等
   - **期望需求**：分析用户希望通过内容获得什么，如：找到可行解决方案、获得心理安慰和鼓励、了解行业趋势、学习具体技能、避坑少走弯路等

JSON格式输出：
{
  "insights": [
    {
      "title": "洞察标题（15-20字，简洁有力）",
      "description": "详细分析（120-180字，包含市场分析、用户价值、可行性）",
      "confidence": 85,
      "evidence": ["文章1标题", "文章2标题", "文章3标题"],

      // 三维度分析
      "decisionStage": {
        "stage": "觉察期/认知期/调研期/决策期/行动期/成果期",
        "reason": "基于文章内容判断用户心理状态和行为阶段的理由（1-2句话）"
      },
      "audienceScene": {
        "audience": "从文章内容分析出的具体人群特征（如：30岁职场妈妈、二三线程序员等）",
        "scene": "与人群匹配的具体使用场景（如：深夜加班、带娃间隙等）",
        "reason": "基于文章内容分析人群场景匹配度的理由（1-2句话）"
      },
      "demandPainPoint": {
        "emotionalPain": "用户的情绪痛点（如：对未来焦虑、害怕落后、渴望被认可等）",
        "realisticPain": "用户的现实痛点（如：收入不足、技能落后、时间管理等）",
        "expectation": "用户的期望需求（如：解决方案、心理安慰、技能学习等）",
        "reason": "基于文章内容分析用户产生问题根本原因的理由（1-2句话）"
      },

      // 其他字段
      "tags": ["标签1", "标签2", "标签3"],
      "marketPotential": "high",          // high/medium/low
      "contentSaturation": 65,            // 0-100的内容饱和度
      "recommendedFormat": "教程类/经验分享/案例分析",
      "keyDifferentiators": ["差异化点1", "差异化点2"]
    }
  ]
}

**核心要求：**
1. **生成多条洞察**（建议5-10条，最多不超过10条）
2. **三维度分析必须深度基于文章内容**：
   - decisionStage.stage 必须准确分析用户心理状态和行为阶段
   - audienceScene.audience/scene 必须从文章内容中提取具体人群特征和使用场景
   - demandPainPoint.emotionalPain/realisticPain/expectation 必须深度分析用户的痛点和需求
3. **每个维度都要有reason字段**，详细说明基于文章内容的判断理由
4. **人群场景要具体化**：避免泛泛而谈，要基于文章内容分析出精准的人群画像和场景
5. **需求痛点要深入**：不能简单分类，要分析用户为什么会产生这个问题的根本原因
6. **confidence 基于证据强度设定**，范围70-95，这是重要指数
7. **evidence 至少引用2-3篇相关文章标题**
8. **确保洞察的多样性和精准性**，覆盖不同用户旅程阶段和具体人群场景

只输出JSON格式，不要任何解释。`

  const response = await callOpenAI([
    { role: 'system', content: '你是顶级的内容选题策划专家，擅长从数据分析中提炼出具有商业价值的选题洞察，只输出JSON格式数据。' },
    { role: 'user', content: prompt },
  ], 0.4)

  try {
    // 清理响应中的markdown标记
    let cleanResponse = response.trim()
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace('```json', '').replace('```', '').trim()
    }

    const parsed = JSON.parse(cleanResponse)
    let insights = parsed.insights || []

    // 限制洞察数量最多不超过10条
    if (insights.length === 0) {
      console.warn('AI未能生成任何洞察')
    } else if (insights.length > 10) {
      console.log(`AI生成了${insights.length}条选题洞察，截取前10条`)
      insights = insights.slice(0, 10)
    } else {
      console.log(`AI生成了${insights.length}条选题洞察`)
    }

    // 验证关键字段
    insights.forEach((insight: any, index: number) => {
      if (!insight.keywords?.scene || !insight.keywords?.audience || !insight.keywords?.need) {
        console.warn(`洞察${index + 1}缺少必需的关键词字段`)
      }
    })

    // 按重要指数（置信度）从高到低排序，置信度就是重要指数
    return insights.sort((a: TopicInsight, b: TopicInsight) => {
      return b.confidence - a.confidence
    })
  } catch (error) {
    console.error('解析洞察失败:', response)
    throw new Error('智能选题洞察生成失败')
  }
}

/**
 * 生成词云数据（基于摘要）
 */
export async function generateWordCloud(summaries: ArticleSummary[]): Promise<Array<{ word: string; count: number; size: number }>> {
  const allKeywords = summaries.flatMap(s => s.keywords || [])
  
  // 统计词频
  const wordCount: Record<string, number> = {}
  allKeywords.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1
  })
  
  // 转换为数组并排序
  const sorted = Object.entries(wordCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 20) // 前20个
    .map(([word, count], index) => {
      const size = Math.max(20, 48 - index * 2) // 递减大小
      return { word, count, size }
    })
  
  return sorted
}
