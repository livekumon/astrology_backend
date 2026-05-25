const USD_TO_INR = Number.parseFloat(process.env.USD_TO_INR) || 100

const DEFAULT_PRICING = {
  promptPer1M: 0.15,
  outputPer1M: 0.6,
  thinkingPer1M: 0.6,
}

const MODEL_PRICING = {
  'gemini-2.5-pro': { promptPer1M: 1.25, outputPer1M: 10, thinkingPer1M: 10 },
  'gemini-2.5-flash-lite': { promptPer1M: 0.075, outputPer1M: 0.3, thinkingPer1M: 0.3 },
  'gemini-2.5-flash': { promptPer1M: 0.15, outputPer1M: 0.6, thinkingPer1M: 0.6 },
  'gemini-3': { promptPer1M: 1.25, outputPer1M: 10, thinkingPer1M: 10 },
}

function resolveModelPricing(model) {
  const name = String(model || '').toLowerCase()
  if (!name) return DEFAULT_PRICING

  const match = Object.keys(MODEL_PRICING)
    .sort((a, b) => b.length - a.length)
    .find((key) => name.includes(key))

  return match ? MODEL_PRICING[match] : DEFAULT_PRICING
}

function round(value, digits = 6) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function computeUsageCost({ model, promptTokens = 0, outputTokens = 0, thinkingTokens = 0 }) {
  const pricing = resolveModelPricing(model)
  const prompt = Number(promptTokens) || 0
  const output = Number(outputTokens) || 0
  const thinking = Number(thinkingTokens) || 0

  const costUsd =
    (prompt / 1_000_000) * pricing.promptPer1M
    + (output / 1_000_000) * pricing.outputPer1M
    + (thinking / 1_000_000) * pricing.thinkingPer1M

  const costInr = costUsd * USD_TO_INR

  return {
    costUsd: round(costUsd, 8),
    costInr: round(costInr, 4),
  }
}

function sumUsageCosts(rows) {
  return rows.reduce(
    (acc, row) => {
      const cost = computeUsageCost({
        model: row.model || row._id?.model,
        promptTokens: row.promptTokens,
        outputTokens: row.outputTokens,
        thinkingTokens: row.thinkingTokens,
      })
      acc.costUsd += cost.costUsd
      acc.costInr += cost.costInr
      return acc
    },
    { costUsd: 0, costInr: 0 },
  )
}

function formatCostSummary(costInr, costUsd) {
  return {
    costInr: round(costInr, 4),
    costUsd: round(costUsd, 8),
    currency: 'INR',
    usdToInrRate: USD_TO_INR,
  }
}

module.exports = {
  USD_TO_INR,
  computeUsageCost,
  sumUsageCosts,
  formatCostSummary,
}
