export const MODEL_OPTIONS = [
  { id: 'gemini-3.1-pro-preview', label: '3.1 Pro' },
  { id: 'gemini-3-flash-preview', label: '3 Flash' },
  { id: 'gemini-2.5-pro', label: '2.5 Pro' },
  { id: 'gemini-2.5-flash', label: '2.5 Flash' },
];

export const DEFAULT_MODEL_ID = 'gemini-3-flash-preview';

export const isValidModelId = (value) => MODEL_OPTIONS.some((option) => option.id === value);