const { generateForTask, GeminiError } = require('./geminiService')
const { getChatThinkingBudget } = require('./modelRouting')
const { recordTokenUsage } = require('./tokenUsageService')
const {
  getLanguageInstruction,
  getLanguageName,
  buildLanguagePromptBlock,
  buildPlainLanguageLayerInstruction,
} = require('./languageService')
const {
  formatChartContext,
  formatConversationHistory,
} = require('./chartContextFormatter')
const {
  sanitizeUserText,
  buildDirectVoiceBlock,
  buildTraditionScopeBlock,
  buildTraditionRoleBlock,
  buildJsonResponseFormatBlock,
} = require('./promptGuardService')
const { buildLifecycleTimingInstruction } = require('./lifecycleTiming')

function buildAstrologerSystem(language = 'en', systemId = 'Vedic / Jyotish') {
  return [
    buildDirectVoiceBlock(),
    buildTraditionScopeBlock(systemId),
    buildTraditionRoleBlock(systemId),
    buildLifecycleTimingInstruction(systemId),
    getLanguageInstruction(language),
    buildPlainLanguageLayerInstruction(language),
    buildJsonResponseFormatBlock(language),
  ].join('\n\n')
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

function normalizeDetailedExplanation(raw = {}) {
  return {
    chartReasoning: normalizeStringList(raw.chartReasoning),
    technicalTerms: normalizeStringList(raw.technicalTerms),
    highlights: normalizeStringList(raw.highlights),
    suggestions: normalizeStringList(raw.suggestions),
    pitfalls: normalizeStringList(raw.pitfalls),
    relatedInfo: normalizeStringList(raw.relatedInfo),
  }
}

function hasDetailedContent(detailedExplanation) {
  return Object.values(detailedExplanation).some((items) => items.length > 0)
}

function parseChatResponse(rawText) {
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')

  try {
    const parsed = JSON.parse(cleaned)
    const summary = String(parsed.summary || '').trim()
    const clearExplanation = String(parsed.clearExplanation || '').trim()
    const detailedExplanation = normalizeDetailedExplanation(parsed.detailedExplanation)

    if (summary) {
      return { summary, clearExplanation, detailedExplanation }
    }
  } catch {
    // fall through to plain-text fallback
  }

  return {
    summary: rawText.trim(),
    clearExplanation: '',
    detailedExplanation: {
      chartReasoning: [],
      technicalTerms: [],
      highlights: [],
      suggestions: [],
      pitfalls: [],
      relatedInfo: [],
    },
  }
}

function buildFallbackChatAnswer(question, chartContext = {}, language = 'en') {
  const sun = chartContext.sunSign || 'unknown'
  const moon = chartContext.moonSign || 'unknown'
  const asc = chartContext.ascSign || 'unknown'
  const place = chartContext.placeOfBirth || 'your birth place'
  const q = question.toLowerCase()
  const isMarriage = /marri|wedding|spouse|partner|vivah|వివాహ|विवाह/i.test(q)
  const currentDasha = (chartContext.dashas || []).find((d) => d.isCurrent)
  const futureDashas = (chartContext.dashas || []).filter((d) => !d.isPast && !d.isCurrent).slice(0, 2)
  const marriageTimelineHint = isMarriage && currentDasha
    ? ` The current ${currentDasha.planet} phase (${currentDasha.period}) and upcoming cycles are the main windows to weigh across your life.`
    : ''

  if (language === 'te') {
    const summary =
      /moon|chandra|chandr|రాశ/i.test(q)
        ? `మీ జనన వివరాల ప్రకారం, మీ భావోద్వేగ స్వభావం ${moon} రాశి ప్రభావంతో ఉంటుంది. మీ వ్యక్తిత్వం ${asc} లాగా కనిపిస్తుంది, మరియు మీ జీవన దిశ ${sun} సూర్య స్వభావాన్ని ప్రతిబింబిస్తుంది.`
        : `మీ జాతకం ప్రకారం, మీ ప్రశ్న "${question}" కు సంబంధించి చార్ట్‌లోని గ్రహ స్థానాలు మరియు ప్రస్తుత దశ కాలం ముఖ్యమైన సూచనలు ఇస్తాయి.`

    return {
      summary,
      clearExplanation: isMarriage && currentDasha
        ? `మీ జీవితంలో వివాహానికి అనుకూలమైన కాలాలను గుర్తించడానికి జననం నుండి పూర్తి దశ కాలపట్టికను పరిశీలించాలి. ప్రస్తుత ${currentDasha.planet} దశ (${currentDasha.period}) మరియు రాబోయే చక్రాలు ముఖ్యమైన సూచనలు ఇస్తాయి.`
        : `మీ ప్రశ్నకు సంబంధించి గ్రహ స్థానాలు, జనన వివరాలు మరియు జీవిత చక్రాల నుండి వచ్చే సూచనలను కలిపి చూడండి.`,
      detailedExplanation: {
        chartReasoning: [
          `జన్మ స్థలం ${place} — స్థానిక సమయం ఆధారంగా చార్ట్ లెక్కించబడింది.`,
          `<em>చంద్ర ${moon}</em> భావోద్వేగ స్వభావాన్ని, <em>లగ్న ${asc}</em> వ్యక్తిత్వాన్ని సూచిస్తుంది.`,
          `<em>సూర్య ${sun}</em> మీ ప్రాథమిక జీవన దిశను సూచిస్తుంది.`,
        ],
        technicalTerms: [
          `<em>చంద్ర రాశి (${moon})</em> — మనస్సు, భావోద్వేగాలు, స్వభావం.`,
          `<em>లగ్న (${asc})</em> — వ్యక్తిత్వం, శరీరం, జీవితాన్ని ఎలా ఎదుర్కొంటారో.`,
          `<em>సూర్య (${sun})</em> — ఆత్మ, ఉద్దేశ్యం, ప్రాధాన్యత.`,
        ],
        highlights: [
          `మీ ప్రశ్నకు సంబంధించిన భావాలు మరియు గ్రహ స్థానాలు చార్ట్‌లో చూడండి.`,
        ],
        suggestions: [
          'మీ ప్రశ్నకు సంబంధించిన గ్రహ దశలను Dasha టైమ్‌లైన్‌తో పోల్చి చూడండి.',
          'ముఖ్య నిర్ణయాలు త్వరపడకుండా, చార్ట్ సూచనలతో సమన్వయం చేసుకోండి.',
          'ఈ సమాధానం చార్ట్ డేటా ఆధారంగా — AI సేవ తాత్కాలికంగా పరిమితమైతే స్థానిక వివరణ.',
        ],
        pitfalls: [
          'జ్యోతిష్యం మార్గదర్శకం మాత్రమే — ఖచ్చితమైన భవిష్యత్తు హామీ కాదు.',
          'ట్రాన్సిట్‌లు, దశలు మారినప్పుడు అర్థాలు మారవచ్చు.',
          'వైద్య, చట్ట, ఆర్థిక నిర్ణయాలకు నిపుణుల సలహ అవసరం.',
        ],
        relatedInfo: [
          'చంద్ర రాశి మనస్సు, లగ్నం శరీరం/వ్యక్తిత్వం, సూర్య ఆత్మ/ఉద్దేశ్యాన్ని సూచిస్తుంది.',
          'మీ ప్రశ్నకు సంబంధించిన భావాలు, గ్రహ స్థానాలు చార్ట్‌లో చూడండి.',
        ],
      },
    }
  }

  if (language === 'hi') {
    const summary =
      /moon|chandra|चंद्र|राश/i.test(q)
        ? `आपकी भावनात्मक प्रकृति ${moon} के गुणों को दर्शाती है; बाहरी व्यक्तित्व ${asc} जैसा दिखता है।`
        : `आपके जन्म से अब तक के जीवन चक्र इस प्रश्न पर मार्गदर्शन देते हैं: "${question}"`

    return {
      summary,
      clearExplanation: isMarriage && currentDasha
        ? `विवाह के समय को पूरे जीवन से देखना सही रहेगा, केवल वर्तमान क्षण से नहीं। वर्तमान ${currentDasha.planet} दशा (${currentDasha.period}) एक महत्वपूर्ण खिड़की है; पिछली और आगामी अवधियाँ भी मायने रखती हैं।`
        : `अपने जन्म से अब तक के जीवन चरणों और आगे की अवधियों को मिलाकर इस प्रश्न को समझें।`,
      detailedExplanation: {
        chartReasoning: [
          `जन्म स्थान ${place} — स्थानीय समय के आधार पर चार्ट गणना की गई।`,
          `<em>चंद्र ${moon}</em> भावनात्मक स्वभाव, <em>लग्न ${asc}</em> व्यक्तित्व दर्शाता है।`,
          `<em>सूर्य ${sun}</em> आपकी मुख्य जीवन दिशा का संकेत है।`,
        ],
        technicalTerms: [
          `<em>चंद्र राशि (${moon})</em> — मन, भावनाएँ, स्वभाव।`,
          `<em>लग्न (${asc})</em> — व्यक्तित्व, शरीर, जीवन के प्रति दृष्टिकोण।`,
          `<em>सूर्य (${sun})</em> — आत्म, उद्देश्य, प्रमुख जीवन थीम।`,
        ],
        highlights: [
          'प्रश्न से जुड़े भाव और ग्रह स्थिति चार्ट में देखें।',
        ],
        suggestions: [
          'अपने प्रश्न से जुड़े ग्रहों और दशा काल की तुलना Dasha टाइमलाइन से करें।',
          'महत्वपूर्ण निर्णय जल्दबाजी में न लें — चार्ट संकेतों के साथ तालमेल रखें।',
          'AI सेवा सीमित होने पर यह उत्तर आपके चार्ट डेटा पर आधारित है।',
        ],
        pitfalls: [
          'ज्योतिष मार्गदर्शन है — निश्चित भविष्यवाणी नहीं।',
          'गोचर और दशा बदलने पर अर्थ बदल सकते हैं।',
          'चिकित्सा, कानूनी, वित्तीय निर्णयों के लिए विशेषज्ञ सलाह लें।',
        ],
        relatedInfo: [
          'चंद्र मन, लग्न शरीर/व्यक्तित्व, सूर्य आत्म/उद्देश्य दर्शाता है।',
          'प्रश्न से जुड़े भाव और ग्रह स्थिति चार्ट में देखें।',
        ],
      },
    }
  }

  const summary =
    /moon|chandra/i.test(q)
      ? `Your emotional nature reflects the qualities of ${moon}; outwardly you come across like ${asc}.`
      : `The life cycles from your birth point to meaningful guidance for "${question}".${marriageTimelineHint}`

  return {
    summary,
    clearExplanation: isMarriage && currentDasha
      ? `Marriage timing is best read across your whole life, not just the present moment. The current ${currentDasha.planet} phase (${currentDasha.period}) is one key window; past and upcoming cycles also matter.${futureDashas.length ? ` Upcoming phases to note: ${futureDashas.map((d) => `${d.planet} (${d.period})`).join(', ')}.` : ''}`
      : `Your birth details and life-cycle phases from childhood onward shape how this question unfolds. Consider past phases already lived, where you are now, and what lies ahead.`,
    detailedExplanation: {
      chartReasoning: [
        `Birth data resolved for ${place} using local birth time.`,
        `<em>Moon in ${moon}</em> shapes emotional patterns; <em>Ascendant in ${asc}</em> shapes personality and approach.`,
        `<em>Sun in ${sun}</em> reflects core identity and life direction.`,
      ],
      technicalTerms: [
        `<em>Moon sign (${moon})</em> — mind, emotions, inner temperament.`,
        `<em>Ascendant / Lagna (${asc})</em> — personality, body, how you meet the world.`,
        `<em>Sun sign (${sun})</em> — soul, purpose, core life themes.`,
      ],
      highlights: [
        currentDasha
          ? `Current mahadasha: ${currentDasha.planet} (${currentDasha.period}) — weigh alongside past and future periods from birth.`
          : 'Use the full dasha timeline from birth for life-phase timing.',
        futureDashas.length
          ? `Upcoming cycles: ${futureDashas.map((d) => `${d.planet} (${d.period})`).join('; ')}.`
          : 'Scan future mahadasha periods for additional timing windows.',
      ],
      suggestions: [
        'Cross-check the current dasha period on your timeline for timing-related questions.',
        'Use insights as guidance — pair them with practical planning before major decisions.',
        'Revisit cycle changes periodically for updated context.',
      ],
      pitfalls: [
        'Readings offer symbolic guidance, not guaranteed predictions.',
        'Interpretations shift as cycles change over time.',
        'Seek professional advice for medical, legal, or major financial decisions.',
      ],
      relatedInfo: [
        'Moon = mind/emotions, Ascendant = body/persona, Sun = soul/purpose.',
        'Relevant houses and placements deepen answers to this topic.',
        'Divisional charts and dasha periods add nuance for marriage, career, and timing.',
      ],
    },
  }
}

async function getChatAnswer(
  question,
  chartContext = {},
  language = 'en',
  history = [],
  compressedContext = '',
  tracking = {},
) {
  const resolvedLanguage = language || chartContext.language || 'en'
  const languageName = getLanguageName(resolvedLanguage)
  const traditionId = chartContext.system || 'Vedic / Jyotish'
  const safeQuestion = sanitizeUserText(question)

  if (!safeQuestion) {
    throw new Error('question is required')
  }

  const historyBlock = formatConversationHistory(history)

  const promptParts = [
    buildLanguagePromptBlock(resolvedLanguage),
    '',
    `=== ACTIVE TRADITION: ${traditionId} ===`,
    'Interpret all answers strictly within this tradition.',
    '',
    '=== CHART CONTEXT (authoritative — use for all interpretations) ===',
    formatChartContext(chartContext),
    '=== END CHART CONTEXT ===',
  ]

  if (compressedContext) {
    promptParts.push(
      '',
      '=== Previous conversation summary ===',
      sanitizeUserText(compressedContext, 600),
      '=== End summary ===',
    )
  }

  if (historyBlock) {
    promptParts.push('', historyBlock)
  }

  promptParts.push(
    '',
    '=== USER QUESTION ===',
    safeQuestion,
    '=== END USER QUESTION ===',
    '',
    `Reminder: interpret using the ${traditionId} framework internally but NEVER name the tradition in user-facing text. Use the user's age and full cycle timeline from birth. For timing questions, give ages and periods in summary (short) and clearExplanation (expanded). Write at least 90% in ${languageName}. Summary = 1-2 direct sentences. clearExplanation = plain follow-up. detailedExplanation = full technical detail only.`,
  )

  const prompt = promptParts.join('\n')

  try {
    const llmResult = await generateForTask('chat', prompt, {
      systemInstruction: buildAstrologerSystem(resolvedLanguage, traditionId),
      jsonResponse: true,
      thinkingBudget: getChatThinkingBudget(safeQuestion),
    })

    await recordTokenUsage({
      userId: tracking.userId,
      task: 'chat',
      model: llmResult.model,
      usage: llmResult.usage,
      conversationId: tracking.conversationId,
      source: 'chat',
    })

    const { summary, clearExplanation, detailedExplanation } = parseChatResponse(llmResult.text)

    return {
      answer: summary,
      summary,
      clearExplanation,
      detailedExplanation,
      question: safeQuestion,
      language: resolvedLanguage,
      chartContext,
      source: 'gemini',
      model: llmResult.model,
    }
  } catch (error) {
    if (error instanceof GeminiError && (error.status === 429 || error.status === 503)) {
      const fallback = buildFallbackChatAnswer(safeQuestion, chartContext, resolvedLanguage)
      return {
        answer: fallback.summary,
        summary: fallback.summary,
        clearExplanation: fallback.clearExplanation || '',
        detailedExplanation: fallback.detailedExplanation,
        question: safeQuestion,
        language: resolvedLanguage,
        chartContext,
        source: 'fallback',
      }
    }

    throw error
  }
}

module.exports = {
  getChatAnswer,
  buildFallbackChatAnswer,
  parseChatResponse,
  hasDetailedContent,
}
