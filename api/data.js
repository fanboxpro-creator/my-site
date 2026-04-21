// Vercel Serverless Function: /api/data
// Читает данные из Google Sheets через Service Account и возвращает JSON.
//
// Требуемые переменные окружения (настраиваются в Vercel → Project → Settings → Environment Variables):
//   GOOGLE_CLIENT_EMAIL  — e-mail сервисного аккаунта (вида xxx@yyy.iam.gserviceaccount.com)
//   GOOGLE_PRIVATE_KEY   — приватный ключ из JSON (включая "-----BEGIN PRIVATE KEY-----" ... "-----END PRIVATE KEY-----")
//   SHEET_ID             — ID Google-таблицы (часть URL между /d/ и /edit)
//
// Перед тем как функция начнёт работать, в самой Google-таблице нужно
// через "Поделиться" дать сервисному аккаунту права "Читатель".

import { google } from 'googleapis';

export default async function handler(req, res) {
  try {
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey  = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    const sheetId     = process.env.SHEET_ID;

    if (!clientEmail || !privateKey || !sheetId) {
      return res.status(500).json({
        ok: false,
        error: 'Missing env vars',
        missing: {
          GOOGLE_CLIENT_EMAIL: !clientEmail,
          GOOGLE_PRIVATE_KEY:  !privateKey,
          SHEET_ID:            !sheetId,
        },
      });
    }

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Для первой проверки: читаем метаданные таблицы (имена листов)
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      includeGridData: false,
    });

    const sheetNames = (meta.data.sheets || []).map(s => s.properties?.title);

    // Для примера ещё читаем первые 5 строк первого листа, чтобы убедиться,
    // что Service Account действительно имеет доступ к данным.
    let sampleRows = null;
    if (sheetNames.length > 0) {
      const first = sheetNames[0];
      const range = `'${first}'!A1:E5`;
      const values = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range,
      });
      sampleRows = values.data.values || [];
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json({
      ok: true,
      title: meta.data.properties?.title || null,
      sheets: sheetNames,
      sample: sampleRows,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err?.message || String(err),
      code: err?.code || null,
    });
  }
}
