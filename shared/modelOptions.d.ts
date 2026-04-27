export type ModelId =
  | 'gemini-3.1-pro-preview'
  | 'gemini-3-flash-preview'
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash';

export interface ModelOption {
  id: ModelId;
  label: string;
}

export const MODEL_OPTIONS: ModelOption[];
export const DEFAULT_MODEL_ID: ModelId;
export const isValidModelId: (value: string) => value is ModelId;