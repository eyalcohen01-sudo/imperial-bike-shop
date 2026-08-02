// netlify/functions/send-whatsapp.js
//
// שימוש: הוסף קובץ זה לתיקיה netlify/functions/ בפרויקט שלך
// והגדר ב-Netlify (Site settings > Environment variables):
//   GREEN_API_ID_INSTANCE   = ה-idInstance מ-console.green-api.com
//   GREEN_API_TOKEN         = ה-apiTokenInstance מ-console.green-api.com
//   TRACKING_BASE_URL       = כתובת הבסיס של דף המעקב, לדוגמה:
//                             https://clinquant-croissant-a68b1b.netlify.app
//
// קריאה מה-HTML שלך כשסטטוס משתנה ל"מוכן":
//   fetch('/.netlify/functions/send-whatsapp', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({
//       template: 'ready',              // סוג התבנית (בהמשך: 'quote' וכו')
//       phone: '972501234567',
//       customerName: 'דני',
//       ticketId: 'IMP-000123'
//     })
//   })
//
// הערה: phone צריך להיות בפורמט בינלאומי ללא + וללא אפסים מובילים
// (לדוגמה מספר ישראלי 050-1234567 -> 972501234567)

// תבניות הודעה - כל תבנית חדשה נוספת כאן
function buildMessage(template, { customerName, ticketId, trackingUrl }) {
  switch (template) {
    case 'received':
      return `היי ${customerName} 👋\n\nהפנייה שלך התקבלה בהצלחה!\nמספר קריאה: ${ticketId}\n\nלמעקב אחרי הטיפול, נא היכנס לקישור:\n${trackingUrl}\n\nתודה,\nאימפריאל 🚲`;
    case 'quote':
      return `היי ${customerName} 👋\n\nקיבלת הצעת מחיר לתיקון האופניים שלך!\nמספר קריאה: ${ticketId}\n\nלצפייה בפרטים ולאישור/דחיית ההצעה, נא היכנס לקישור:\n${trackingUrl}\n\nתודה,\nאימפריאל 🚲`;
    case 'ready':
      return `היי ${customerName} 👋\n\nהאופניים שלך מוכנים לאיסוף!\nמספר תיקון: ${ticketId}\n\nלפרטי התיקון וסיכום החשבון, נא היכנס לקישור:\n${trackingUrl}\n\nתודה,\nאימפריאל 🚲`;
    default:
      return null;
  }
}

// ===== גרסה ניסיונית (חשבון חינמי - מוגבל ל-3 צ'אטים בחודש) =====
// יש להגדיר כאן עד 3 מספרי טלפון (בכל פורמט - הבדיקה מתעלמת מקידומת 972/0) שאיתם בודקים את המערכת.
// כשעוברים לתוכנית Business בתשלום - פשוט מוחקים/מרוקנים את המערך הזה.
const TRIAL_ALLOWED_PHONES = [
  // עברנו ל-Business plan - הודעות נשלחות לכל הלקוחות, אין יותר מגבלת מספרים
];

// משווה רק את 9 הספרות האחרונות, כדי שיתאים בין 050-2137075 / 0502137075 / 972502137075 וכו'
function normalizePhone(p) {
  const digits = (p || '').replace(/[^0-9]/g, '');
  return digits.slice(-9);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { template, phone, customerName, ticketId } = JSON.parse(event.body || '{}');

    if (!template || !phone || !customerName || !ticketId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'חסר אחד מהשדות: template, phone, customerName, ticketId' }),
      };
    }

    // ניקוי המספר משאריות פורמט (רווחים, מקפים, +)
    const cleanPhone = phone.replace(/[^0-9]/g, '');

    // בדיקת גרסה ניסיונית - משווים לפי 9 הספרות האחרונות (מתעלם מקידומת 972/0)
    if (TRIAL_ALLOWED_PHONES.length > 0 && !TRIAL_ALLOWED_PHONES.some(p => normalizePhone(p) === normalizePhone(cleanPhone))) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          skipped: true,
          reason: 'מספר זה אינו ברשימת המספרים הניסיוניים (חשבון Green API חינמי, מוגבל ל-3 צ׳אטים בחודש)',
        }),
      };
    }

    // ל-Green API חייבים לשלוח בפורמט בינלאומי מלא (972...) - אם המספר מתחיל ב-0, מחליפים ל-972
    const internationalPhone = cleanPhone.startsWith('0') ? '972' + cleanPhone.slice(1) : cleanPhone;

    const baseUrl = process.env.TRACKING_BASE_URL;
    const trackingUrl = `${baseUrl}/?ticket=${ticketId}`;

    const message = buildMessage(template, { customerName, ticketId, trackingUrl });

    if (!message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `תבנית לא מוכרת: ${template}` }),
      };
    }

    const idInstance = process.env.GREEN_API_ID_INSTANCE;
    const apiToken = process.env.GREEN_API_TOKEN;

    if (!idInstance || !apiToken) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'משתני הסביבה של Green API לא מוגדרים ב-Netlify' }),
      };
    }

    const url = `https://api.green-api.com/waInstance${idInstance}/sendMessage/${apiToken}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: `${internationalPhone}@c.us`,
        message: message,
      }),
    });

    const data = await response.json();

    if (response.status === 466) {
      return {
        statusCode: 466,
        body: JSON.stringify({
          error: 'המכסה החודשית של Green API (3 צ׳אטים) נגמרה - יש לשדרג לתוכנית Business',
          details: data,
        }),
      };
    }

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: 'Green API החזירה שגיאה', details: data }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, result: data }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'שגיאה כללית', details: err.message }),
    };
  }
};