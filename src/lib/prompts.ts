export const fetchPrompt = async (fileName: string): Promise<string> => {
  const response = await fetch(`/prompts/${fileName}`);

  if (!response.ok) {
    throw new Error(`Prompt fetch failed for ${fileName} (${response.status}).`);
  }

  return await response.text();
};