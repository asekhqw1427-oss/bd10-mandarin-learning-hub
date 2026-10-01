// Central TOCFL vocabulary loader. Entry data is preserved from the original dataset.
import { tocflA0Vocabulary } from "./a0.js";
import { tocflA1Vocabulary } from "./a1.js";
import { tocflA2Vocabulary } from "./a2.js";
import { tocflB1Vocabulary } from "./b1.js";
import { tocflB2Vocabulary } from "./b2.js";
import { tocflC1Vocabulary } from "./c1.js";
import { tocflC2Vocabulary } from "./c2.js";

export const tocflVocabularyByLevel = Object.freeze({
  A0: tocflA0Vocabulary,
  A1: tocflA1Vocabulary,
  A2: tocflA2Vocabulary,
  B1: tocflB1Vocabulary,
  B2: tocflB2Vocabulary,
  C1: tocflC1Vocabulary,
  C2: tocflC2Vocabulary,
});

export const tocflVocabulary = Object.freeze([
  ...tocflA0Vocabulary,
  ...tocflA1Vocabulary,
  ...tocflA2Vocabulary,
  ...tocflB1Vocabulary,
  ...tocflB2Vocabulary,
  ...tocflC1Vocabulary,
  ...tocflC2Vocabulary,
]);

export const tocflVocabularyStats = {
  courseCounts: {
    "TOCFL-1": tocflA0Vocabulary.length,
    "TOCFL-2": tocflA1Vocabulary.length,
    "TOCFL-3": tocflA2Vocabulary.length,
    "TOCFL-4": tocflB1Vocabulary.length,
    "TOCFL-5": tocflB2Vocabulary.length,
    "TOCFL-6": tocflC1Vocabulary.length,
    "TOCFL-7": tocflC2Vocabulary.length,
  },
  total: tocflVocabulary.length,
  completePinyinCount: tocflVocabulary.filter((entry) => entry.pinyin && !entry.needsParser?.includes("some variant pinyin")).length,
  partialPinyinCount: tocflVocabulary.filter((entry) => entry.needsParser?.includes("some variant pinyin")).length,
  unresolvedPinyinCount: tocflVocabulary.filter((entry) => !entry.pinyin).length,
  englishCount: tocflVocabulary.filter((entry) => entry.english).length,
  needsEnglishParserCount: tocflVocabulary.filter((entry) => !entry.english).length,
};

export const tocflCourseFormat = "AES-128-CTR; zero IV; key is repeated course name truncated to 16 UTF-8 bytes";
