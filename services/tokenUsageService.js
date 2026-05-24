const { col, ObjectId } = require('../db/connection')

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

  const doc = {
    userId: userId ? new ObjectId(String(userId)) : null,
    task: task || 'unknown',
    model: model || 'unknown',
    promptTokens: normalized.promptTokens,
    outputTokens: normalized.outputTokens,
    thinkingTokens: normalized.thinkingTokens,
    totalTokens: normalized.totalTokens,
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

  return {
    userCount,
    conversationCount,
    tokenUsage: {
      totalTokens: tokens.totalTokens,
      promptTokens: tokens.promptTokens,
      outputTokens: tokens.outputTokens,
      thinkingTokens: tokens.thinkingTokens,
      requestCount: tokens.requestCount,
    },
  }
}

async function listUsersWithStats() {
  const users = await col('users')
    .find({}, { projection: { password: 0 } })
    .sort({ createdAt: -1 })
    .toArray()

  const userIds = users.map((u) => u._id)

  const [convCounts, tokenByUser] = await Promise.all([
    col('conversations')
      .aggregate([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: '$userId', count: { $sum: 1 } } },
      ])
      .toArray(),
    col('token_usage')
      .aggregate([
        { $match: { userId: { $in: userIds } } },
        {
          $group: {
            _id: '$userId',
            totalTokens: { $sum: '$totalTokens' },
            promptTokens: { $sum: '$promptTokens' },
            outputTokens: { $sum: '$outputTokens' },
            thinkingTokens: { $sum: '$thinkingTokens' },
            requestCount: { $sum: 1 },
          },
        },
      ])
      .toArray(),
  ])

  const convMap = Object.fromEntries(convCounts.map((r) => [String(r._id), r.count]))
  const tokenMap = Object.fromEntries(tokenByUser.map((r) => [String(r._id), r]))

  return users.map((user) => {
    const id = String(user._id)
    const stored = user.tokenUsage || {}
    const aggregated = tokenMap[id] || {}
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      language: user.language,
      createdAt: user.createdAt,
      conversationCount: convMap[id] || 0,
      tokenUsage: {
        totalTokens: aggregated.totalTokens ?? stored.totalTokens ?? 0,
        promptTokens: aggregated.promptTokens ?? stored.promptTokens ?? 0,
        outputTokens: aggregated.outputTokens ?? stored.outputTokens ?? 0,
        thinkingTokens: aggregated.thinkingTokens ?? stored.thinkingTokens ?? 0,
        requestCount: aggregated.requestCount ?? stored.requestCount ?? 0,
        lastUsedAt: stored.lastUsedAt || null,
      },
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

async function getUserTokenBreakdown(userId) {
  const [byTask, recent] = await Promise.all([
    col('token_usage')
      .aggregate([
        { $match: { userId: new ObjectId(String(userId)) } },
        {
          $group: {
            _id: '$task',
            totalTokens: { $sum: '$totalTokens' },
            promptTokens: { $sum: '$promptTokens' },
            outputTokens: { $sum: '$outputTokens' },
            thinkingTokens: { $sum: '$thinkingTokens' },
            requestCount: { $sum: 1 },
          },
        },
        { $sort: { totalTokens: -1 } },
      ])
      .toArray(),
    col('token_usage')
      .find({ userId: new ObjectId(String(userId)) })
      .sort({ createdAt: -1 })
      .limit(50)
      .project({
        task: 1,
        model: 1,
        totalTokens: 1,
        promptTokens: 1,
        outputTokens: 1,
        thinkingTokens: 1,
        source: 1,
        createdAt: 1,
      })
      .toArray(),
  ])

  return {
    byTask: byTask.map((row) => ({
      task: row._id,
      totalTokens: row.totalTokens,
      promptTokens: row.promptTokens,
      outputTokens: row.outputTokens,
      thinkingTokens: row.thinkingTokens,
      requestCount: row.requestCount,
    })),
    recent,
  }
}

module.exports = {
  extractUsageFromMetadata,
  recordTokenUsage,
  getGlobalStats,
  listUsersWithStats,
  getUserConversations,
  getUserTokenBreakdown,
}
