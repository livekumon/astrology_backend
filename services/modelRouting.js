const COMPLEX_QUESTION_PATTERN =
  /\b(marriage|married|marry|spouse|partner|relationship|career|job|profession|business|health|finance|money|wealth|child|children|pregnancy|dasha|mahadasha|antardasha|transit|timing|when will|when should|future|predict|compatibility|divorce|promotion|retirement|property|travel|education|study)\b/i

function isComplexAstrologyQuestion(question) {
  return COMPLEX_QUESTION_PATTERN.test(String(question || ''))
}

function getChatThinkingBudget(question) {
  const complexBudget = Number.parseInt(process.env.GEMINI_COMPLEX_THINKING_BUDGET, 10)
  if (!isComplexAstrologyQuestion(question)) {
    return undefined
  }
  return Number.isFinite(complexBudget) ? complexBudget : 16384
}

module.exports = {
  isComplexAstrologyQuestion,
  getChatThinkingBudget,
}
