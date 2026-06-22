import express from 'express';

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    status: global.isReady ? "ok" : "initializing",
    service: "rssee-rag-engine",
    version: "3.0.0",
  });
});

export default router;
