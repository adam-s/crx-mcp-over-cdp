/*
 * Agentic routing for Baby Elephant Agent
 * ---------------------------------------
 * Implements three explicit steps the user requested:
 * 1) Infer the animal mentioned in free text (canonicalize e.g., "kittens" -> "cat").
 * 2) Map the canonical animal to its juvenile term (cat -> kitten, goat -> kid, chicken -> chick, ...).
 * 3) Decide which search engine to use based on the prompt (e.g., "search google for cats" -> Google Images/Google).
 *
 * Works standalone or as LangGraph nodes. Optimized to be deterministic with optional LLM assist.
 */

import { z } from 'zod';
import type { ChatOpenAI } from '@langchain/openai';

// --- Public Types -----------------------------------------------------------

export enum SearchEngine {
  Google = 'google',
  GoogleImages = 'google_images',
  Bing = 'bing',
  DuckDuckGo = 'duckduckgo',
  YouTube = 'youtube',
  Kagi = 'kagi',
  Perplexity = 'perplexity',
  Yahoo = 'yahoo',
  Baidu = 'baidu',
}

export interface AnimalDecision {
  canonical: string; // singular, lowercase (e.g., "cat")
  mention: string | null; // the surface form found in the prompt, if any
  synonyms: string[]; // e.g., ["kitty", "kitten"]
  confidence: number; // 0..1 heuristic/LLM-derived
  reason: string; // short justification (useful for logs)
  fromLLM: boolean;
}

export interface JuvenileDecision {
  juvenile: string; // singular (e.g., "kitten")
  plural: string; // plural (e.g., "kittens")
  reason: string;
  fromLLM: boolean;
}

export interface EngineDecision {
  engine: SearchEngine;
  reason: string;
  engineUrl: string; // base URL used to build the search
}

export interface SearchPlan {
  animal: AnimalDecision;
  juvenile: JuvenileDecision;
  engine: EngineDecision;
  query: string; // final query text (we default to the juvenile plural)
  url: string; // fully formed URL for navigation
}

// --- Lexicons & Helpers -----------------------------------------------------

const CANONICALS = [
  'ant',
  'bear',
  'beaver',
  'bison',
  'buffalo',
  'camel',
  'cat',
  'cattle',
  'chicken',
  'chimpanzee',
  'cougar',
  'cow',
  'coyote',
  'crab',
  'deer',
  'dog',
  'dolphin',
  'donkey',
  'duck',
  'eagle',
  'elephant',
  'elk',
  'ferret',
  'fish',
  'fox',
  'frog',
  'giraffe',
  'goat',
  'goose',
  'hamster',
  'hippopotamus',
  'horse',
  'kangaroo',
  'koala',
  'leopard',
  'lion',
  'lizard',
  'llama',
  'lobster',
  'monkey',
  'moose',
  'mouse',
  'octopus',
  'otter',
  'owl',
  'ox',
  'panda',
  'panther',
  'parrot',
  'pig',
  'pigeon',
  'rabbit',
  'raccoon',
  'rat',
  'rhino',
  'sheep',
  'shark',
  'shrimp',
  'skunk',
  'snake',
  'sparrow',
  'spider',
  'squid',
  'swan',
  'tiger',
  'turkey',
  'turtle',
  'wolf',
  'yak',
  'zebra',
] as const;

// Map many surface forms -> canonical animal
const ANIMAL_SYNONYMS: Record<string, string> = {
  // cat family
  cat: 'cat',
  cats: 'cat',
  kitty: 'cat',
  kitties: 'cat',
  kitten: 'cat',
  kittens: 'cat',
  // dog family
  dog: 'dog',
  dogs: 'dog',
  pup: 'dog',
  pups: 'dog',
  puppy: 'dog',
  puppies: 'dog',
  // goat
  goat: 'goat',
  goats: 'goat',
  kid: 'goat',
  kids: 'goat',
  // chicken
  chicken: 'chicken',
  chickens: 'chicken',
  chick: 'chicken',
  chicks: 'chicken',
  // duck
  duck: 'duck',
  ducks: 'duck',
  duckling: 'duck',
  ducklings: 'duck',
  // goose
  goose: 'goose',
  geese: 'goose',
  gosling: 'goose',
  goslings: 'goose',
  // cow/cattle
  cow: 'cow',
  cows: 'cow',
  cattle: 'cattle',
  calf: 'cow',
  calves: 'cow',
  // horse
  horse: 'horse',
  horses: 'horse',
  foal: 'horse',
  foals: 'horse',
  colt: 'horse',
  colts: 'horse',
  filly: 'horse',
  fillies: 'horse',
  // sheep
  sheep: 'sheep',
  lamb: 'sheep',
  lambs: 'sheep',
  // pig
  pig: 'pig',
  pigs: 'pig',
  piglet: 'pig',
  piglets: 'pig',
  // rabbit
  rabbit: 'rabbit',
  rabbits: 'rabbit',
  bunny: 'rabbit',
  bunnies: 'rabbit',
  kit: 'rabbit',
  kits: 'rabbit',
  // deer
  deer: 'deer',
  fawn: 'deer',
  fawns: 'deer',
  // bear/big cats
  bear: 'bear',
  bears: 'bear',
  cub: 'bear',
  cubs: 'bear',
  lion: 'lion',
  lions: 'lion',
  tiger: 'tiger',
  tigers: 'tiger',
  leopard: 'leopard',
  leopards: 'leopard',
  panther: 'panther',
  panthers: 'panther',
  // fox/wolf
  fox: 'fox',
  foxes: 'fox',
  kitfox: 'fox',
  'kit-fox': 'fox',
  kit_fox: 'fox',
  kitpup: 'fox',
  wolf: 'wolf',
  wolves: 'wolf',
  wolfling: 'wolf',
  // elephant
  elephant: 'elephant',
  elephants: 'elephant',
  // giraffe
  giraffe: 'giraffe',
  giraffes: 'giraffe',
  // kangaroo/koala
  kangaroo: 'kangaroo',
  kangaroos: 'kangaroo',
  joey: 'kangaroo',
  joeys: 'kangaroo',
  koala: 'koala',
  koalas: 'koala',
  // panda
  panda: 'panda',
  pandas: 'panda',
  // primates
  monkey: 'monkey',
  monkeys: 'monkey',
  chimp: 'chimpanzee',
  chimps: 'chimpanzee',
  chimpanzee: 'chimpanzee',
  chimpanzees: 'chimpanzee',
  // misc
  otter: 'otter',
  otters: 'otter',
  mouse: 'mouse',
  mice: 'mouse',
  ducky: 'duck',
  duckies: 'duck',
};

// Canonical -> juvenile singular term
const JUVENILE_LEXICON: Record<string, string> = {
  ant: 'nymph',
  bear: 'cub',
  beaver: 'kit',
  bison: 'calf',
  buffalo: 'calf',
  camel: 'calf',
  cat: 'kitten',
  cattle: 'calf',
  chicken: 'chick',
  chimpanzee: 'infant',
  cougar: 'kitten',
  cow: 'calf',
  coyote: 'pup',
  crab: 'zoea',
  deer: 'fawn',
  dog: 'puppy',
  dolphin: 'calf',
  donkey: 'foal',
  duck: 'duckling',
  eagle: 'eaglet',
  elephant: 'calf',
  elk: 'calf',
  ferret: 'kit',
  fish: 'fry',
  fox: 'kit',
  frog: 'tadpole',
  giraffe: 'calf',
  goat: 'kid',
  goose: 'gosling',
  hamster: 'pup',
  hippopotamus: 'calf',
  horse: 'foal',
  kangaroo: 'joey',
  koala: 'joey',
  leopard: 'cub',
  lion: 'cub',
  lizard: 'hatchling',
  llama: 'cria',
  lobster: 'larva',
  monkey: 'infant',
  moose: 'calf',
  mouse: 'pup',
  octopus: 'larva',
  otter: 'pup',
  owl: 'owlet',
  ox: 'calf',
  panda: 'cub',
  panther: 'cub',
  parrot: 'chick',
  pig: 'piglet',
  pigeon: 'squab',
  rabbit: 'kit',
  raccoon: 'kit',
  rat: 'pup',
  rhino: 'calf',
  sheep: 'lamb',
  shark: 'pup',
  shrimp: 'larva',
  skunk: 'kit',
  snake: 'hatchling',
  sparrow: 'chick',
  spider: 'spiderling',
  squid: 'larva',
  swan: 'cygnet',
  tiger: 'cub',
  turkey: 'poult',
  turtle: 'hatchling',
  wolf: 'pup',
  yak: 'calf',
  zebra: 'foal',
};

// pluralization for juvenile terms (lightweight rules + irregulars)
const IRREGULAR_PLURALS: Record<string, string> = {
  calf: 'calves',
  foal: 'foals',
  lamb: 'lambs',
  kid: 'kids',
  puppy: 'puppies',
  kitten: 'kittens',
  duckling: 'ducklings',
  gosling: 'goslings',
  piglet: 'piglets',
  fawn: 'fawns',
  joey: 'joeys',
  cub: 'cubs',
  kit: 'kits',
  fry: 'fry',
  tadpole: 'tadpoles',
  spiderling: 'spiderlings',
  hatchling: 'hatchlings',
  larva: 'larvae',
  zoea: 'zoeae',
  cygnet: 'cygnets',
  squab: 'squabs',
  nymph: 'nymphs',
  infant: 'infants',
  owlet: 'owlets',
};

function pluralizeJuvenile(term: string): string {
  const t = term.toLowerCase();
  if (IRREGULAR_PLURALS[t]) return IRREGULAR_PLURALS[t];
  if (t.endsWith('y')) return t.slice(0, -1) + 'ies'; // puppy -> puppies
  if (t.endsWith('f')) return t.slice(0, -1) + 'ves'; // calf -> calves (covered above anyway)
  if (t.endsWith('fe')) return t.slice(0, -2) + 'ves';
  return t + 's';
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function findFirstAnimalSurfaceForm(prompt: string): { surface: string; canonical: string } | null {
  const tokens = prompt.toLowerCase().match(/[a-zA-Z-]+/g) ?? [];
  for (const tok of tokens) {
    if (ANIMAL_SYNONYMS[tok]) {
      return { surface: tok, canonical: ANIMAL_SYNONYMS[tok] };
    }
  }
  return null;
}

function canonicalExists(animal: string): boolean {
  return (
    (CANONICALS as readonly string[]).includes(animal) ||
    JUVENILE_LEXICON[animal] !== undefined ||
    Object.values(ANIMAL_SYNONYMS).includes(animal)
  );
}

// --- LLM Schemas ------------------------------------------------------------

const AnimalLLMSchema = z.object({
  canonicalAnimal: z.string().describe("singular, lowercase common name (e.g., 'cat')"),
  juvenileTerm: z.string().describe("singular, lowercase juvenile term (e.g., 'kitten')"),
  reason: z.string().describe('brief justification'),
});

// --- Core Class -------------------------------------------------------------

export class BabyAnimalPlanner {
  private readonly _llm?: ChatOpenAI;
  constructor(llm?: ChatOpenAI) {
    this._llm = llm;
  }

  // Step 1: infer canonical animal from text
  async decideAnimal(prompt: string): Promise<AnimalDecision> {
    const text = normalizeWhitespace(prompt);

    // Deterministic pass: look for surface form in text
    const surface = findFirstAnimalSurfaceForm(text);
    if (surface) {
      const { surface: mention, canonical } = surface;
      return {
        canonical,
        mention,
        synonyms: Object.entries(ANIMAL_SYNONYMS)
          .filter(([, c]) => c === canonical)
          .map(([k]) => k),
        confidence: 0.75,
        reason: `Found surface form "${mention}" -> canonical "${canonical}" via lexicon`,
        fromLLM: false,
      };
    }

    // LLM assist (optional)
    if (this._llm) {
      try {
        const llmWithSchema = this._llm as ChatOpenAI & {
          withStructuredOutput?: (schema: typeof AnimalLLMSchema) => ChatOpenAI;
        };
        const withSchema = llmWithSchema.withStructuredOutput?.(AnimalLLMSchema) ?? this._llm;
        const out = (await withSchema.invoke([
          {
            role: 'system',
            content:
              'You extract the canonical animal and its juvenile term from text. Use common names, lowercase, singular. If no animal, infer the most likely one mentioned or implied.',
          },
          { role: 'user', content: text },
        ])) as { canonicalAnimal?: string; canonical?: string; reason?: string };
        const canonical = (out.canonicalAnimal ?? out.canonical ?? '').toLowerCase();
        if (canonical && canonicalExists(canonical)) {
          return {
            canonical,
            mention: null,
            synonyms: Object.entries(ANIMAL_SYNONYMS)
              .filter(([, c]) => c === canonical)
              .map(([k]) => k),
            confidence: 0.6,
            reason: out.reason ?? 'LLM-inferred canonical animal',
            fromLLM: true,
          };
        }
      } catch (err) {
        // fall through to default below
      }
    }

    // Default fallback if nothing recognized
    return {
      canonical: 'cat',
      mention: null,
      synonyms: ['cat', 'cats', 'kitty', 'kitties', 'kitten', 'kittens'],
      confidence: 0.3,
      reason: "Fallback default to 'cat' (no animal confidently detected)",
      fromLLM: false,
    };
  }

  // Step 2: map canonical to juvenile term
  async decideJuvenile(canonicalAnimal: string, prompt?: string): Promise<JuvenileDecision> {
    const canonical = canonicalAnimal.toLowerCase();

    // Prefer deterministic lexicon
    const lex = JUVENILE_LEXICON[canonical];
    if (lex) {
      const plural = pluralizeJuvenile(lex);
      return {
        juvenile: lex,
        plural,
        reason: `From lexicon: ${canonical} -> ${lex}`,
        fromLLM: false,
      };
    }

    // Otherwise, LLM assist if available
    if (this._llm) {
      try {
        const llmWithSchema = this._llm as ChatOpenAI & {
          withStructuredOutput?: (schema: typeof AnimalLLMSchema) => ChatOpenAI;
        };
        const withSchema = llmWithSchema.withStructuredOutput?.(AnimalLLMSchema) ?? this._llm;
        const out = (await withSchema.invoke([
          {
            role: 'system',
            content: 'Return canonical animal and juvenile term, lowercase, singular.',
          },
          {
            role: 'user',
            content: `Animal: ${canonical}. Prompt (may help disambiguate): ${prompt ?? ''}`,
          },
        ])) as { juvenileTerm?: string; juvenile?: string; reason?: string };
        const juvenile = (out.juvenileTerm ?? out.juvenile ?? '').toLowerCase();
        if (juvenile) {
          return {
            juvenile,
            plural: pluralizeJuvenile(juvenile),
            reason: out.reason ?? 'LLM-inferred juvenile term',
            fromLLM: true,
          };
        }
      } catch (err) {
        // ignore and fall through
      }
    }

    // Last resort: use canonical itself
    return {
      juvenile: canonical,
      plural: canonical.endsWith('s') ? canonical : canonical + 's',
      reason: 'No juvenile available; using canonical',
      fromLLM: false,
    };
  }

  // Step 3: route to appropriate search engine
  decideSearchEngine(prompt: string): EngineDecision {
    const p = prompt.toLowerCase();
    const saysImages = /(image|images|pics|pictures|photos|wallpapers)\b/.test(p);
    const saysVideo = /(video|videos|clips)\b/.test(p);

    // explicit engine mentions take precedence
    const wantsGoogle = /\bgoogle\b/.test(p);
    const wantsBing = /\bbing\b/.test(p);
    const wantsDDG = /\bduck\s*duck\s*go\b|\bddg\b/.test(p);
    const wantsKagi = /\bkagi\b/.test(p);
    const wantsPerplexity = /\bperplexity\b/.test(p);
    const wantsYahoo = /\byahoo\b/.test(p);
    const wantsBaidu = /\bbaidu\b/.test(p);
    const wantsYouTube = /\byoutube\b/.test(p);

    let engine: SearchEngine;
    if (saysVideo || wantsYouTube) engine = SearchEngine.YouTube;
    else if (wantsGoogle && saysImages) engine = SearchEngine.GoogleImages;
    else if (wantsGoogle) engine = SearchEngine.Google;
    else if (wantsBing) engine = SearchEngine.Bing;
    else if (wantsDDG) engine = SearchEngine.DuckDuckGo;
    else if (wantsKagi) engine = SearchEngine.Kagi;
    else if (wantsPerplexity) engine = SearchEngine.Perplexity;
    else if (wantsYahoo) engine = SearchEngine.Yahoo;
    else if (wantsBaidu) engine = SearchEngine.Baidu;
    else if (saysImages)
      engine = SearchEngine.GoogleImages; // sensible default for images
    else engine = SearchEngine.Google; // general default

    const engineUrl =
      engine === SearchEngine.Google
        ? 'https://www.google.com/search?q='
        : engine === SearchEngine.GoogleImages
          ? 'https://www.google.com/search?tbm=isch&q='
          : engine === SearchEngine.Bing
            ? 'https://www.bing.com/search?q='
            : engine === SearchEngine.DuckDuckGo
              ? 'https://duckduckgo.com/?q='
              : engine === SearchEngine.YouTube
                ? 'https://www.youtube.com/results?search_query='
                : engine === SearchEngine.Kagi
                  ? 'https://kagi.com/search?q='
                  : engine === SearchEngine.Perplexity
                    ? 'https://www.perplexity.ai/search?q='
                    : engine === SearchEngine.Yahoo
                      ? 'https://search.yahoo.com/search?p='
                      : engine === SearchEngine.Baidu
                        ? 'https://www.baidu.com/s?wd='
                        : 'https://www.google.com/search?q=';

    const reason = normalizeWhitespace(
      `engine=${engine} because ${
        saysVideo
          ? 'prompt requests videos'
          : saysImages
            ? 'prompt requests images'
            : wantsGoogle
              ? 'prompt explicitly mentions Google'
              : wantsBing
                ? 'prompt explicitly mentions Bing'
                : wantsDDG
                  ? 'prompt explicitly mentions DuckDuckGo'
                  : wantsKagi
                    ? 'prompt explicitly mentions Kagi'
                    : wantsPerplexity
                      ? 'prompt explicitly mentions Perplexity'
                      : wantsYahoo
                        ? 'prompt explicitly mentions Yahoo'
                        : wantsBaidu
                          ? 'prompt explicitly mentions Baidu'
                          : 'default rule'
      }`,
    );

    return { engine, engineUrl, reason };
  }

  // Full plan: animal -> juvenile -> engine -> query/url
  async plan(prompt: string): Promise<SearchPlan> {
    const animal = await this.decideAnimal(prompt);
    const juvenile = await this.decideJuvenile(animal.canonical, prompt);
    const engine = this.decideSearchEngine(prompt);

    // Check if juvenile term is ambiguous and needs parent animal for disambiguation
    const ambiguousJuvenileTerms = new Set([
      'calves',
      'pups',
      'cubs',
      'kits',
      'fry',
      'larvae',
      'infants',
      'chicks',
    ]);

    let query: string;
    if (ambiguousJuvenileTerms.has(juvenile.plural.toLowerCase())) {
      // For ambiguous terms, use "animal juvenile" format (e.g., "elephant calves", "dog pups")
      query = `${animal.canonical} ${juvenile.plural}`;
    } else {
      // For unambiguous terms, use just the juvenile plural (e.g., "kittens", "ducklings")
      query = juvenile.plural;
    }

    const url = engine.engineUrl + encodeURIComponent(query);

    return { animal, juvenile, engine, query, url };
  }
}

// --- LangGraph Node Factories (optional) -----------------------------------

export type AgentStateLike = {
  task: string;
  steps?: string[];
  searchPlan?: SearchPlan;
};

export function makeAnimalStep(planner: BabyAnimalPlanner) {
  return async (state: AgentStateLike): Promise<Partial<AgentStateLike>> => {
    const animal = await planner.decideAnimal(state.task);
    const stepMsg = `animal: ${animal.canonical} (conf=${animal.confidence.toFixed(2)})`;
    return {
      steps: [...(state.steps ?? []), stepMsg],
      searchPlan: { ...(state.searchPlan ?? {}), animal } as SearchPlan,
    };
  };
}

export function makeBabyNameStep(planner: BabyAnimalPlanner) {
  return async (state: AgentStateLike): Promise<Partial<AgentStateLike>> => {
    const canonical = state.searchPlan?.animal?.canonical ?? 'cat';
    const juvenile = await planner.decideJuvenile(canonical, state.task);
    const stepMsg = `juvenile: ${juvenile.juvenile}/${juvenile.plural}`;
    return {
      steps: [...(state.steps ?? []), stepMsg],
      searchPlan: { ...(state.searchPlan ?? {}), juvenile } as SearchPlan,
    };
  };
}

export function makeSearchEngineStep(planner: BabyAnimalPlanner) {
  return async (state: AgentStateLike): Promise<Partial<AgentStateLike>> => {
    const engine = planner.decideSearchEngine(state.task);
    const stepMsg = `engine: ${engine.engine}`;
    const prev = state.searchPlan ?? ({} as SearchPlan);
    const juvenile = prev.juvenile ?? { plural: 'kittens' };
    const query = juvenile.plural;
    const url = engine.engineUrl + encodeURIComponent(query);
    return {
      steps: [...(state.steps ?? []), stepMsg],
      searchPlan: { ...prev, engine, query, url },
    };
  };
}

export function makeEndToEndSearchPlanStep(planner: BabyAnimalPlanner) {
  return async (state: AgentStateLike): Promise<Partial<AgentStateLike>> => {
    const plan = await planner.plan(state.task);
    const stepMsg = `plan: ${plan.engine.engine} -> ${plan.query}`;
    return { steps: [...(state.steps ?? []), stepMsg], searchPlan: plan };
  };
}

// --- Minimal usage example --------------------------------------------------
/*
import { ChatOpenAI } from "@langchain/openai";

const llm = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
const planner = new BabyAnimalPlanner(llm);

const plan = await planner.plan("there are lots of kittens in the boat, search google for cats pictures");
// plan.query === "kittens", plan.engine.engine === SearchEngine.GoogleImages
// plan.url -> navigate here with your driver
*/
