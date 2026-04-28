import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATEGORY_ADHERENCE_MULTIPLIER, CATEGORY_ADHERENCE_MULTIPLIER_LABEL } from '../shared/judgingWeights.js';
import { DEFAULT_MODEL_ID } from '../shared/modelOptions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PROMPTS_DIR = path.join(ROOT_DIR, 'public', 'prompts');

const categorySchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    category_name: { type: 'string' },
    category_description: { type: 'string' },
  },
  required: ['category_name', 'category_description'],
};

const rubricScoreSchema = {
  type: 'object',
  properties: {
    wit: { type: 'integer' },
    creativity: { type: 'integer' },
    adherence_to_category: { type: 'integer' },
    bonus_for_media_politics_references: { type: 'integer' },
    effort: { type: 'integer' },
    elegance_of_prose: { type: 'integer' },
    impressiveness: { type: 'integer' },
  },
  required: [
    'wit',
    'creativity',
    'adherence_to_category',
    'bonus_for_media_politics_references',
    'effort',
    'elegance_of_prose',
    'impressiveness',
  ],
};

const judgingSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    wit: { type: 'string' },
    creativity: { type: 'string' },
    adherence_to_category: { type: 'string' },
    bonus_for_media_politics_references: { type: 'string' },
    effort: { type: 'string' },
    elegance_of_prose: { type: 'string' },
    impressiveness: { type: 'string' },
    player_1_scores: rubricScoreSchema,
    player_2_scores: rubricScoreSchema,
    player_1_feedback: { type: 'string' },
    player_2_feedback: { type: 'string' },
    verdict_sentence: { type: 'string' },
    winner_id: { type: 'string', enum: ['player_1', 'player_2', 'tie'] },
  },
  required: [
    'wit',
    'creativity',
    'adherence_to_category',
    'bonus_for_media_politics_references',
    'effort',
    'elegance_of_prose',
    'impressiveness',
    'player_1_scores',
    'player_2_scores',
    'player_1_feedback',
    'player_2_feedback',
    'verdict_sentence',
    'winner_id',
  ],
};

const defaultDescriptionPhrases = [
  'a rumor with elbows',
  'a smell that seems intentional',
  'a problem nobody priced correctly',
];

let genAI = null;

const getClientOptions = () => {
  const apiKey = process.env.VERTEX_API_KEY?.trim();
  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim() || process.env.VERTEX_PROJECT?.trim();
  const location = process.env.GOOGLE_CLOUD_LOCATION?.trim() || process.env.VERTEX_LOCATION?.trim();
  const apiVersion = process.env.GOOGLE_GENAI_API_VERSION?.trim();

  if (project && location) {
    return {
      vertexai: true,
      project,
      location,
      ...(apiVersion ? { apiVersion } : {}),
    };
  }

  if (apiKey) {
    return {
      apiKey,
      vertexai: false,
      ...(apiVersion ? { apiVersion } : {}),
    };
  }

  throw new Error(
    'Missing AI credentials. Set VERTEX_API_KEY, or configure GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION for true Vertex AI mode.',
  );
};

const getClient = () => {
  if (!genAI) {
    genAI = new GoogleGenAI(getClientOptions());
  }

  return genAI;
};

const getVertexStatus = (error) =>
  typeof error === 'object' && error && 'status' in error && typeof error.status === 'number'
    ? error.status
    : undefined;

const sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

const isRetryableVertexError = (error) => {
  const status = getVertexStatus(error);

  if (status === 429 || status === 503 || status === 504) {
    return true;
  }

  return error instanceof Error && /network|fetch failed|failed to fetch/i.test(error.message);
};

const isInvalidJsonError = (error) => error instanceof Error && /invalid JSON/i.test(error.message);

const getThinkingConfig = (modelId = DEFAULT_MODEL_ID) => {
  if (modelId.startsWith('gemini-3')) {
    return {
      thinkingLevel: 'high',
    };
  }

  if (modelId === 'gemini-2.5-pro') {
    return {
      thinkingBudget: 32768,
    };
  }

  if (modelId === 'gemini-2.5-flash') {
    return {
      thinkingBudget: 24576,
    };
  }

  return {
    thinkingBudget: -1,
  };
};

const getWeightedRubricTotal = (scores) =>
  scores.wit
  + scores.creativity
  + scores.adherence_to_category * CATEGORY_ADHERENCE_MULTIPLIER
  + scores.bonus_for_media_politics_references
  + scores.effort
  + scores.elegance_of_prose
  + scores.impressiveness;

const applyWeightedWinner = (judgingResult) => {
  const playerOneTotal = getWeightedRubricTotal(judgingResult.player_1_scores);
  const playerTwoTotal = getWeightedRubricTotal(judgingResult.player_2_scores);

  const weightedWinnerId = playerOneTotal === playerTwoTotal
    ? 'tie'
    : playerOneTotal > playerTwoTotal
      ? 'player_1'
      : 'player_2';

  if (weightedWinnerId === judgingResult.winner_id) {
    return {
      ...judgingResult,
      winner_id: weightedWinnerId,
    };
  }

  const verdictSentence = weightedWinnerId === 'tie'
    ? `Even with ${CATEGORY_ADHERENCE_MULTIPLIER_LABEL} category weighting, the round remains deadlocked.`
    : `${weightedWinnerId === 'player_1' ? 'Player 1' : 'Player 2'} takes the round once category adherence receives its ${CATEGORY_ADHERENCE_MULTIPLIER_LABEL} weight.`;

  return {
    ...judgingResult,
    winner_id: weightedWinnerId,
    verdict_sentence: verdictSentence,
  };
};

const withRetry = async (run, maxRetries) => {
  let attempt = 0;

  while (true) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= maxRetries || !isRetryableVertexError(error)) {
        throw error;
      }

      const baseDelay = 600 * 2 ** attempt;
      const jitter = Math.floor(Math.random() * 250);
      await sleep(baseDelay + jitter);
      attempt += 1;
    }
  }
};

const withTimeout = async (promise, timeoutMs, action) => {
  let timeoutId;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`__VERTEX_TIMEOUT__:${action}`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const formatVertexError = (error, action) => {
  if (error instanceof Error && error.message.startsWith('__VERTEX_TIMEOUT__')) {
    return new Error(`The Overseer took too long to ${action}. Please try again.`);
  }

  const status = getVertexStatus(error);

  if (status === 404) {
    return new Error(`Vertex AI could not find the requested resource while trying to ${action} (404).`);
  }

  if (status === 429) {
    return new Error(`Vertex AI rate-limited the request while trying to ${action} (429). Please wait a moment and retry.`);
  }

  if (status === 503 || status === 504) {
    return new Error(`Vertex AI is temporarily unavailable while trying to ${action} (${status}). Please retry shortly.`);
  }

  if (status && status >= 500) {
    return new Error(`Vertex AI hit a server error while trying to ${action} (${status}).`);
  }

  if (status && status >= 400) {
    return new Error(`Vertex AI rejected the request while trying to ${action} (${status}).`);
  }

  if (error instanceof Error) {
    return new Error(error.message);
  }

  return new Error(`Vertex AI failed to ${action}.`);
};

const parseJsonResponse = (text, action) => {
  if (!text) {
    throw new Error(`Vertex AI returned an empty response while trying to ${action}.`);
  }

  const normalizedText = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(normalizedText);
  } catch {
    const firstBraceIndex = normalizedText.indexOf('{');
    const lastBraceIndex = normalizedText.lastIndexOf('}');

    if (firstBraceIndex !== -1 && lastBraceIndex > firstBraceIndex) {
      try {
        return JSON.parse(normalizedText.slice(firstBraceIndex, lastBraceIndex + 1));
      } catch {
        throw new Error(`Vertex AI returned invalid JSON while trying to ${action}.`);
      }
    }

    throw new Error(`Vertex AI returned invalid JSON while trying to ${action}.`);
  }
};

const requestStructuredJson = async ({
  action,
  modelId = DEFAULT_MODEL_ID,
  prompt,
  schema,
  temperature,
  maxOutputTokens,
  timeoutMs,
  repairTemperature = 0.1,
}) => {
  const requestContent = (promptText, requestTemperature) =>
    withTimeout(
      withRetry(
        () => {
          const config = {
            temperature: requestTemperature,
            thinkingConfig: getThinkingConfig(modelId),
            responseMimeType: 'application/json',
            responseJsonSchema: schema,
          };

          if (typeof maxOutputTokens === 'number') {
            config.maxOutputTokens = maxOutputTokens;
          }

          return getClient().models.generateContent({
            model: modelId,
            contents: promptText,
            config,
          });
        },
        1,
      ),
      timeoutMs,
      action,
    );

  const result = await requestContent(prompt, temperature);

  try {
    return parseJsonResponse(result.text, action);
  } catch (error) {
    if (!isInvalidJsonError(error)) {
      throw error;
    }

    const repairPrompt = `${prompt}\n\nFINAL OUTPUT RULE: Return valid raw JSON only. No markdown fences. No commentary. No trailing text. Every required field must be present.`;
    const repairResult = await requestContent(repairPrompt, repairTemperature);
    return parseJsonResponse(repairResult.text, action);
  }
};

const fetchPrompt = async (fileName) => fs.readFile(path.join(PROMPTS_DIR, fileName), 'utf8');

const normalizeCategoryName = (value) => {
  const cleanedValue = value.replace(/\s+/g, ' ').trim();
  const words = cleanedValue.split(' ').filter(Boolean);
  return (words.slice(0, 4).join(' ') || 'Future Garage Sale').trim();
};

const extractPhrases = (value) => {
  const commaSplit = value
    .split(/[,;\n]+/)
    .map((phrase) => phrase.replace(/[.!?]+$/g, '').trim())
    .filter(Boolean);

  if (commaSplit.length >= 3) {
    return commaSplit;
  }

  return value
    .split(/[.!?\n]+/)
    .map((phrase) => phrase.replace(/[,:;]+$/g, '').trim())
    .filter(Boolean);
};

const normalizeCategoryDescription = (value) => {
  const extractedPhrases = extractPhrases(value);
  const phrases = [];

  for (const phrase of extractedPhrases) {
    if (!phrases.includes(phrase)) {
      phrases.push(phrase);
    }
  }

  while (phrases.length < 3) {
    phrases.push(defaultDescriptionPhrases[phrases.length]);
  }

  return phrases.slice(0, 3).join(', ');
};

export const generateMatchCategory = async (existingCategories, modelId = DEFAULT_MODEL_ID) => {
  try {
    let prompt = await fetchPrompt('ai_category_generator.md');
    const existingCategoryLines = existingCategories
      .map((category, index) => `${index + 1}. ${category.name} :: ${category.description}`)
      .join('\n');

    prompt = prompt.replace('{{existing_categories}}', existingCategoryLines || 'No existing categories.');

    const result = await requestStructuredJson({
      action: 'generate a category',
      modelId,
      prompt,
      schema: categorySchema,
      temperature: 0.85,
      timeoutMs: 120000,
      repairTemperature: 0.2,
    });

    return {
      category_name: normalizeCategoryName(result.category_name ?? ''),
      category_description: normalizeCategoryDescription(result.category_description ?? ''),
    };
  } catch (error) {
    throw formatVertexError(error, 'generate a category');
  }
};

export const judgeMatchTurn = async ({
  categoryName,
  categoryDescription,
  playerOneText,
  playerTwoText,
  isTieBreaker,
  previousLog,
  modelId = DEFAULT_MODEL_ID,
}) => {
  try {
    let prompt = await fetchPrompt('judge_master.md');

    if (isTieBreaker && previousLog) {
      prompt += `\n\n=== PREVIOUS TIEBREAKER CONTEXT ===\nPlayer 1 Previous: ${previousLog.player1Text}\nPlayer 2 Previous: ${previousLog.player2Text}\nPrevious Verdict: ${JSON.stringify(previousLog.judgingLog)}\nBuild upon this evolution!`;
    }

    prompt = prompt
      .replace('{{category_name}}', categoryName)
      .replace('{{category_description}}', categoryDescription)
      .replace('{{player_1_text}}', playerOneText)
      .replace('{{player_2_text}}', playerTwoText);

    const judgingResult = await requestStructuredJson({
      action: 'judge a turn',
      modelId,
      prompt,
      schema: judgingSchema,
      temperature: 0.2,
      timeoutMs: 180000,
    });

    return applyWeightedWinner(judgingResult);
  } catch (error) {
    throw formatVertexError(error, 'judge a turn');
  }
};