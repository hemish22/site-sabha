export interface Worker {
  name: string;
  language: string;
}

// Same crew as data/roster.csv in the Streamlit version.
export const ROSTER: Worker[] = [
  { name: "Ravi", language: "ta-IN" },
  { name: "Murugan", language: "ta-IN" },
  { name: "Bikash", language: "od-IN" },
  { name: "Sanjay", language: "od-IN" },
  { name: "Sumon", language: "bn-IN" },
  { name: "Rahim", language: "bn-IN" },
  { name: "Ramesh", language: "hi-IN" },
  { name: "Suresh", language: "hi-IN" },
];

export const GLOSSARY = [
  "harness", "scaffolding", "scaffold", "PPE", "helmet", "fire extinguisher", "permit", "assembly point", "lockout",
];

export const LANG_NAMES: Record<string, string> = {
  "hi-IN": "Hindi", "bn-IN": "Bengali", "od-IN": "Odia", "ta-IN": "Tamil", "te-IN": "Telugu",
  "kn-IN": "Kannada", "ml-IN": "Malayalam", "mr-IN": "Marathi", "gu-IN": "Gujarati",
  "pa-IN": "Punjabi", "en-IN": "English",
};

// Each language's name written in its own script, for the worker screen.
export const LANG_NATIVE: Record<string, string> = {
  "hi-IN": "हिन्दी", "bn-IN": "বাংলা", "od-IN": "ଓଡ଼ିଆ", "ta-IN": "தமிழ்", "te-IN": "తెలుగు", "en-IN": "English",
};

export const ROSTER_LANGS = [...new Set(ROSTER.map((w) => w.language))].sort();

export const langName = (code: string) => LANG_NAMES[code] ?? code;
