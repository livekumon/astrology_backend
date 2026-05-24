const LANGUAGE_NAMES = {
  en: 'English',
  hi: 'Hindi',
  te: 'Telugu',
  ta: 'Tamil',
  bn: 'Bengali',
  mr: 'Marathi',
  pa: 'Punjabi',
  es: 'Spanish',
  fr: 'French',
  zh: 'Chinese',
}

// Native language first; English only sparingly for unavoidable terms
const NATIVE_FIRST_STYLE = {
  hi: {
    script: 'Devanagari (Hindi)',
    examples: [
      'आपकी कुंडली के अनुसार चंद्र राशि सिंह है — इसका मतलब है कि आप भावनात्मक रूप से बहुत अभिव्यंजक हैं।',
      'अभी आप मंगल की दशा में हैं, जो व्यावसायिक जीवन के लिए एक सक्रिय और शक्तिशाली काल है।',
      'आपके सातवें भाव में गुरु है — विवाह और साझेदारी के लिए यह बहुत शुभ योग है।',
    ],
    allowedEnglish: 'Sign names and planet names from the chart (e.g. Leo, Mars) when quoting chart data. At most 1–2 common English words per entire response if no natural Hindi equivalent exists.',
  },
  te: {
    script: 'Telugu script',
    examples: [
      'మీ జాతకం ప్రకారం చంద్ర రాశి సింహం — భావోద్వేగంగా మీరు చాలా అభివ్యక్తిగా ఉంటారు.',
      'ప్రస్తుతం మీరు కుజ దశలో ఉన్నారు, ఇది వృత్తి జీవితానికి చాలా శక్తివంతమైన కాలం.',
      'మీ సప్తమ భావంలో గురుడు ఉన్నారు — వివాహం మరియు భాగస్వామ్యానికి ఇది చాలా శుభ సూచన.',
    ],
    allowedEnglish: 'Sign names and planet names from the chart when quoting chart data. At most 1–2 common English words per entire response if no natural Telugu equivalent exists.',
  },
  ta: {
    script: 'Tamil script',
    examples: [
      'உங்கள் ஜாதகத்தின்படி சந்திர ராசி சிம்மம் — உணர்ச்சி ரீதியாக நீங்கள் மிகவும் வெளிப்படையாக இருப்பீர்கள்.',
    ],
    allowedEnglish: 'Sign/planet names from chart data only. Minimal English otherwise.',
  },
}

function getLanguageName(languageCode = 'en') {
  return LANGUAGE_NAMES[languageCode] || LANGUAGE_NAMES.en
}

function getNativeFirstStyle(languageCode) {
  return NATIVE_FIRST_STYLE[languageCode] || null
}

function getLanguageInstruction(languageCode = 'en') {
  if (languageCode === 'en') {
    return 'Write entirely in clear, warm English.'
  }

  const style = getNativeFirstStyle(languageCode)
  const languageName = getLanguageName(languageCode)

  if (!style) {
    return [
      `IMPORTANT: The user selected ${languageName}.`,
      `Write at least 90% of every sentence in ${languageName}.`,
      'Use English only for sign/planet names from the chart or 1–2 unavoidable terms.',
      'Keep the tone warm and conversational, not stiff or overly formal.',
    ].join(' ')
  }

  return [
    `IMPORTANT: The user selected ${languageName}.`,
    `Write almost entirely in ${languageName} using ${style.script}. At least 90–95% of every answer must be in ${languageName}.`,
    'English is allowed only minimally: ' + style.allowedEnglish,
    'Prefer native terms: lagna/लग्न, rashi/राशि, dasha/दशा, bhav/भाव, grah/ग्रह, kundli/कुंडली — not English equivalents.',
    'Do NOT write full sentences in English. Do NOT use Roman transliteration (Hinglish/Tenglish) for ordinary words.',
    'Do NOT switch to English for career, marriage, health, timing, or advice — translate those into ' + languageName + '.',
    `Example tone: "${style.examples.join('" | "')}"`,
  ].join(' ')
}

function buildLanguagePromptBlock(languageCode = 'en') {
  if (languageCode === 'en') {
    return 'Language: English'
  }

  const languageName = getLanguageName(languageCode)
  return [
    `Response language: ${languageName} (code: ${languageCode})`,
    `Write primarily in ${languageName}. English only for chart sign/planet names or at most 1–2 unavoidable words.`,
  ].join('\n')
}

function buildPlainLanguageLayerInstruction(languageCode = 'en') {
  const languageName = getLanguageName(languageCode)

  return [
    'THREE-LAYER ANSWER STYLE (mandatory):',
    '',
    `LAYER 1 — "summary" (shown first in chat):`,
    `- 1–2 sentences only. Direct, to-the-point answer in simple ${languageName}.`,
    '- Answer the question immediately — no preamble, no tradition labels, no "based on your chart" openers unless unavoidable.',
    '- No jargon, no <em> tags, no house/planet/dasha shorthand.',
    '- For timing questions: state the key window or answer in one crisp line (ages/dates allowed in plain words).',
    '',
    `LAYER 2 — "clearExplanation" (shown right below summary in chat):`,
    `- 3–5 sentences in clear everyday ${languageName}.`,
    '- Expand what the summary means for their life — context, nuance, and practical meaning.',
    '- Still no tradition labels ("numerology", "Vedic", "Jyotish", etc.), no jargon, no <em> tags.',
    '- For timing questions: flesh out the timeline with approximate ages and periods in plain language.',
    '',
    `LAYER 3 — "detailedExplanation" (shown only when user opens technical details):`,
    '- Full technical breakdown — houses, planets, dashas, cycles, terms for the active tradition.',
    '- Use <em> tags for astrological or numerological terms here only.',
    '- chartReasoning: step-by-step logic linking chart factors to layers 1 and 2.',
    '- technicalTerms: glossary entries for terms used in this answer.',
  ].join('\n')
}

module.exports = {
  getLanguageName,
  getLanguageInstruction,
  buildLanguagePromptBlock,
  buildPlainLanguageLayerInstruction,
  getNativeFirstStyle,
  LANGUAGE_NAMES,
}
