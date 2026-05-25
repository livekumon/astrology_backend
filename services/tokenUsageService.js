const { col, ObjectId } = require('../db/connection')
const { computeUsageCost, sumUsageCosts, formatCostSummary } = require('./tokenPricingService')

function normalizeUsage(raw) {
  if (!raw) return null
  const promptTokens = Number(raw.promptTokens) || 0
  const outputTokens = Number(raw.outputTokens) || 0
  const thinkingTokens = Number(raw.thinkingTokens) || 0
  const totalTokens =
    Number(raw.totalTokens) || promptTokens + outputTokens + thinkingTokens
  if (totalTokens <= 0) return null
  return { promptTokens, outputTokens, thinkingTokens, totalTokens }
}

function extractUsageFromMetadata(metadata) {
  if (!metadata) return null
  return normalizeUsage({
    promptTokens: metadata.promptTokenCount,
    outputTokens: metadata.candidatesTokenCount,
    thinkingTokens: metadata.thoughtsTokenCount,
    totalTokens: metadata.totalTokenCount,
  })
}

async function recordTokenUsage({
  userId,
  task,
  model,
  usage,
  conversationId,
  source,
}) {
  const normalized = normalizeUsage(usage)
  if (!normalized) return

  const cost = computeUsageCost({
    model,
    promptTokens: normalized.promptTokens,
    outputTokens: normalized.outputTokens,
    thinkingTokens: normalized.thinkingTokens,
  })

  const doc = {
    userId: userId ? new ObjectId(String(userId)) : null,
    task: task || 'unknown',
    model: model || 'unknown',
    promptTokens: normalized.promptTokens,
    outputTokens: normalized.outputTokens,
    thinkingTokens: normalized.thinkingTokens,
    totalTokens: normalized.totalTokens,
    costUsd: cost.costUsd,
    costInr: cost.costInr,
    conversationId: conversationId ? new ObjectId(String(conversationId)) : null,
    source: source || task || 'unknown',
    createdAt: new Date(),
  }

  await col('token_usage').insertOne(doc)

  if (userId) {
    await col('users').updateOne(
      { _id: new ObjectId(String(userId)) },
      {
        $inc: {
          'tokenUsage.promptTokens': normalized.promptTokens,
          'tokenUsage.outputTokens': normalized.outputTokens,
          'tokenUsage.thinkingTokens': normalized.thinkingTokens,
          'tokenUsage.totalTokens': normalized.totalTokens,
          'tokenUsage.requestCount': 1,
        },
        $set: { 'tokenUsage.lastUsedAt': new Date() },
      },
    )
  }
}

async function aggregateTokenUsageByField(match, groupField) {
  const rows = await col('token_usage')
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: { [groupField]: `$${groupField}`, model: '$model' },
          promptTokens: { $sum: '$promptTokens' },
          outputTokens: { $sum: '$outputTokens' },
          thinkingTokens: { $sum: '$thinkingTokens' },
          totalTokens: { $sum: '$totalTokens' },
          requestCount: { $sum: 1 },
        },
      },
    ])
    .toArray()

  const grouped = new Map()

  for (const row of rows) {
    const key = row._id?.[groupField]
    if (key == null) continue
    const id = String(key)
    const cost = computeUsageCost({
      model: row._id.model,
      promptTokens: row.promptTokens,
      outputTokens: row.outputTokens,
      thinkingTokens: row.thinkingTokens,
    })

    const current = grouped.get(id) || {
      totalTokens: 0,
      promptTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      requestCount: 0,
      costUsd: 0,
      costInr: 0,
    }

    current.totalTokens += row.totalTokens
    current.promptTokens += row.promptTokens
    current.outputTokens += row.outputTokens
    current.thinkingTokens += row.thinkingTokens
    current.requestCount += row.requestCount
    current.costUsd += cost.costUsd
    current.costInr += cost.costInr
    grouped.set(id, current)
  }

  return grouped
}

function attachCostToTokenUsage(tokenUsage = {}) {
  return {
    ...tokenUsage,
    cost: formatCostSummary(tokenUsage.costInr || 0, tokenUsage.costUsd || 0),
  }
}

async function getGlobalStats() {
  const [userCount, conversationCount, tokenAgg] = await Promise.all([
    col('users').countDocuments(),
    col('conversations').countDocuments(),
    col('token_usage').aggregate([
      {
        $group: {
          _id: null,
          totalTokens: { $sum: '$totalTokens' },
          promptTokens: { $sum: '$promptTokens' },
          outputTokens: { $sum: '$outputTokens' },
          thinkingTokens: { $sum: '$thinkingTokens' },
          requestCount: { $sum: 1 },
        },
      },
    ]).toArray(),
  ])

  const tokens = tokenAgg[0] || {
    totalTokens: 0,
    promptTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    requestCount: 0,
  }

  const costRows = await col('token_usage')
    .aggregate([
      {
        $group: {
          _id: '$model',
          promptTokens: { $sum: '$promptTokens' },
          outputTokens: { $sum: '$outputTokens' },
          thinkingTokens: { $sum: '$thinkingTokens' },
        },
      },
    ])
    .toArray()
  const totalCost = sumUsageCosts(
    costRows.map((row) => ({ model: row._id, ...row })),
  )

  return {
    userCount,
    conversationCount,
    tokenUsage: attachCostToTokenUsage({
      totalTokens: tokens.totalTokens,
      promptTokens: tokens.promptTokens,
      outputTokens: tokens.outputTokens,
      thinkingTokens: tokens.thinkingTokens,
      requestCount: tokens.requestCount,
      costUsd: totalCost.costUsd,
      costInr: totalCost.costInr,
    }),
  }
}

async function listUsersWithStats() {
  const users = await col('users')
    .find({}, { projection: { password: 0 } })
    .sort({ createdAt: -1 })
    .toArray()

  const userIds = users.map((u) => u._id)

  const [convCounts, tokenByUserMap] = await Promise.all([
    col('conversations')
      .aggregate([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ])
      .toArray(),
    aggregateTokenUsageByField({ userId: { $in: userIds } }, 'userId'),
  ])

  const convMap = Object.fromEntries(convCounts.map((r) => [String(r._id), r.count]))

  return users.map((user) => {
    const id = String(user._id)
    const stored = user.tokenUsage || {}
    const aggregated = tokenByUserMap.get(id) || {}
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      language: user.language,
      createdAt: user.createdAt,
      conversationCount: convMap[id] || 0,
      tokenUsage: attachCostToTokenUsage({
        totalTokens: aggregated.totalTokens ?? stored.totalTokens ?? 0,
        promptTokens: aggregated.promptTokens ?? stored.promptTokens ?? 0,
        outputTokens: aggregated.outputTokens ?? stored.outputTokens ?? 0,
        thinkingTokens: aggregated.thinkingTokens ?? stored.thinkingTokens ?? 0,
        requestCount: aggregated.requestCount ?? stored.requestCount ?? 0,
        costUsd: aggregated.costUsd ?? 0,
        costInr: aggregated.costInr ?? 0,
        lastUsedAt: stored.lastUsedAt || null,
      }),
    }
  })
}

async function getUserConversations(userId) {
  return col('conversations')
    .find(
      { userId: new ObjectId(String(userId)) },
      {
        projection: {
          name: 1,
          language: 1,
          messageCount: 1,
          chartData: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    )
    .sort({ updatedAt: -1 })
    .limit(100)
    .toArray()
}

async function getConversationTokenUsage(userId) {
  const oid = new ObjectId(String(userId))
  const byConversation = await aggregateTokenUsageByField(
    { userId: oid, conversationId: { $ne: null } },
    'conversationId',
  )

  return Object.fromEntries(
    [...byConversation.entries()].map(([conversationId, usage]) => [
      conversationId,
      attachCostToTokenUsage(usage),
    ]),
  )
}

async function getUserTokenBreakdown(userId) {
  const oid = new ObjectId(String(userId))
  const [recent, byTaskRows] = await Promise.all([
    col('token_usage')
      .find({ userId: oid })
      .sort({ createdAt: -1 })
      .limit(50)
      .project({
        task: 1,
        model: 1,
        totalTokens: 1,
        promptTokens: 1,
        outputTokens: 1,
        thinkingTokens: 1,
        costInr: 1,
        costUsd: 1,
        source: 1,
        createdAt: 1,
      })
      .toArray(),
    col('token_usage')
      .aggregate([
        { $match: { userId: oid } },
        {
          $group: {
            _id: { task: '$task', model: '$model' },
            promptTokens: { $sum: '$promptTokens' },
            outputTokens: { $sum: '$outputTokens' },
            thinkingTokens: { $sum: '$thinkingTokens' },
            totalTokens: { $sum: '$totalTokens' },
            requestCount: { $sum: 1 },
          },
        },
      ])
      .toArray(),
  ])

  const taskMap = new Map()
  for (const row of byTaskRows) {
    const task = row._id.task
    const cost = computeUsageCost({
      model: row._id.model,
      promptTokens: row.promptTokens,
      outputTokens: row.outputTokens,
      thinkingTokens: row.thinkingTokens,
    })
    const current = taskMap.get(task) || {
      task,
      totalTokens: 0,
      promptTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      requestCount: 0,
      costUsd: 0,
      costInr: 0,
    }
    current.totalTokens += row.totalTokens
    current.promptTokens += row.promptTokens
    current.outputTokens += row.outputTokens
    current.thinkingTokens += row.thinkingTokens
    current.requestCount += row.requestCount
    current.costUsd += cost.costUsd
    current.costInr += cost.costInr
    taskMap.set(task, current)
  }

  return {
    byTask: [...taskMap.values()]
      .map((row) => attachCostToTokenUsage(row))
      .sort((a, b) => b.totalTokens - a.totalTokens),
    recent: recent.map((row) => ({
      ...row,
      cost: formatCostSummary(
        row.costInr ?? computeUsageCost(row).costInr,
        row.costUsd ?? computeUsageCost(row).costUsd,
      ),
    })),
  }
}

module.exports = {
  extractUsageFromMetadata,
  recordTokenUsage,
  getGlobalStats,
  listUsersWithStats,
  getUserConversations,
  getUserTokenBreakdown,
  getConversationTokenUsage,
}
