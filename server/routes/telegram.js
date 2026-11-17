import express, { Router } from 'express';
import User from '../models/User.js';

const router = Router();

router.post('/sub', async (req, res) => {
  const { chatId, email } = req.body;
  if (!chatId || !email) return res.status(400).json({ message: 'chatId and email required' });

  await User.findOneAndUpdate(
    { email },
    { telegramChatId: chatId },
    { upsert: true, new: true }
  );

  res.json({ ok: true, message: 'Subscribed to Telegram alerts' });
});

router.post('/unsub', async (req, res) => {
  const { chatId, email } = req.body;
  await User.findOneAndUpdate(
    { email, telegramChatId: chatId },
    { $unset: { telegramChatId: '' } }
  );
  res.json({ ok: true, message: 'Unsubscribed from Telegram alerts' });
});

export default router;