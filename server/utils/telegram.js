import dotenv from 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN;

export default token
  ? {
      send: async (chatId, text, html = false) => {
        try {
          const fetch = globalThis.fetch;
          const parseMode = html ? 'HTML' : undefined;
          const url = `https://api.telegram.org/bot${token}/sendMessage`;
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chat_id: chatId,
              text: text,
              parse_mode: parseMode,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('[telegram] send error', { status: response.status, response: errorText });
            return false;
          }

          const data = await response.json();
          console.log('[telegram] sent', { chatId, text: text.slice(0, 30) + '…' });
          return data.ok === true;
        } catch (err) {
          console.error('[telegram] send error', err);
          return false;
        }
      },
    }
  : {
      send: async () => {
        console.warn('[telegram] disabled – TELEGRAM_BOT_TOKEN not set');
        return false;
      },
    };