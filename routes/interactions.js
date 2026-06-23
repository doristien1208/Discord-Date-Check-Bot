const { Router } = require('express');
const { verifyKeyMiddleware } = require('discord-interactions');
const { handleInteraction } = require('../controllers/interactionController');

const router = Router();

// verifyKeyMiddleware 需要讀取 Raw Body 來驗證 Ed25519 簽章。
//     絕對不可在它之前掛載全域 express.json()，否則 stream 被消費後驗證必定失敗。
router.post(
  '/interactions',
  (req, res, next) => {
    console.log('[VERIFY]      進入 Discord 簽章驗證...');
    next();
  },
  verifyKeyMiddleware(process.env.DISCORD_PUBLIC_KEY),
  handleInteraction
);

module.exports = router;
