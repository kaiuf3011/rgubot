import { applyTfIdfReranking } from './engine/search/ranker.js';

const mockDocs = [
  { text: "We offer programs in various fields", score: 0.1, id: 1 },
  { text: "B.E. Computer Science and Engineering", score: 0.2, id: 2 },
  { text: "B.Tech Information Technology", score: 0.3, id: 3 },
  { text: "General FAQs about specific courses available at Rathinam", score: 0.05, id: 4 }
];

const queries = ["specific engineering courses available at Rathinam Group of Institutions"];

const ranked = applyTfIdfReranking(mockDocs, queries);
console.log(ranked.map(r => ({ id: r.id, text: r.text, rrfScore: r.rrfScore })));
