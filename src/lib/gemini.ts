import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI: GoogleGenerativeAI | null = null;

export const initGemini = (apiKey: string) => {
  genAI = new GoogleGenerativeAI(apiKey);
};

export const fetchPrompt = async (fileName: string): Promise<string> => {
  const res = await fetch(`/prompts/${fileName}`);
  return await res.text();
};

export const generateAICategory = async (): Promise<{category_name: string, category_description: string}> => {
  if (!genAI) throw new Error("API Key not set");
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    generationConfig: {
      temperature: 0.9,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          category_name: { type: "STRING" },
          category_description: { type: "STRING" },
        },
        required:["category_name", "category_description"],
      },
    },
  });

  const prompt = await fetchPrompt('ai_category_generator.md');
  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text() || "{}");
};

export const judgeTurn = async (
  categoryName: string, 
  categoryDesc: string, 
  p1Text: string, 
  p2Text: string,
  isTieBreaker: boolean,
  prevP1Text?: string,
  prevP2Text?: string,
  prevJudgingLog?: any
) => {
  if (!genAI) throw new Error("API Key not set");
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro",
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          wit: { type: SchemaType.STRING },
          creativity: { type: SchemaType.STRING },
          adherence_to_category: { type: SchemaType.STRING },
          bonus_for_media_politics_references: { type: SchemaType.STRING },
          effort: { type: SchemaType.STRING },
          elegance_of_prose: { type: SchemaType.STRING },
          impressiveness: { type: SchemaType.STRING },
          player_1_feedback: { type: SchemaType.STRING },
          player_2_feedback: { type: SchemaType.STRING },
          verdict_sentence: { type: SchemaType.STRING },
          winner_id: { type: SchemaType.STRING, enum: ["player_1", "player_2", "tie"] },
        },
        required:[
          "wit", "creativity", "adherence_to_category", 
          "bonus_for_media_politics_references", "effort", 
          "elegance_of_prose", "impressiveness", 
          "player_1_feedback", "player_2_feedback", 
          "verdict_sentence", "winner_id"
        ],
      },
    },
  });

  let prompt = await fetchPrompt('judge_master.md');
  
  if (isTieBreaker) {
    const tieContext = `\n\n=== PREVIOUS TIEBREAKER CONTEXT ===\nPlayer 1 Previous: ${prevP1Text}\nPlayer 2 Previous: ${prevP2Text}\nPrevious Verdict: ${JSON.stringify(prevJudgingLog)}\nBuild upon this evolution!`;
    prompt += tieContext;
  }

  prompt = prompt
    .replace('{{category_name}}', categoryName)
    .replace('{{category_description}}', categoryDesc)
    .replace('{{player_1_text}}', p1Text)
    .replace('{{player_2_text}}', p2Text);

  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text() || "{}");
};