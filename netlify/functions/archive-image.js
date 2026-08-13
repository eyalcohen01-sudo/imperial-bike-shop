// netlify/functions/archive-image.js
//
// מטרה: לדרוס תמונה קיימת ב-Storage בגרסה מוקטנת (ארכוב), פעולה שדורשת
// הרשאת SELECT ב-Postgres (בגלל ON CONFLICT של upsert) - הרשאה שנחסמה
// מהלקוח מטעמי אבטחה (כדי למנוע listing של כל הקבצים). לכן זה קורה כאן,
// בצד שרת, עם ה-Service Role Key שעוקף RLS לגמרי ולא נחשף לדפדפן.
//
// יש להגדיר ב-Netlify (Site settings > Environment variables):
//   SUPABASE_URL              = https://mdebqivawvmuprcmjbxj.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY = מפתח ה-service_role מ-Supabase (Project Settings > API)
//                                 חשוב: זה מפתח סודי לגמרי, אסור בשום אופן להכניס אותו לקוד הצד לקוח!
//
// קריאה מה-HTML (archiveImage):
//   fetch('/.netlify/functions/archive-image', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ ticketId: 'IMP-000123', imageBase64: '<base64 ללא prefix>' })
//   })

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { ticketId, imageBase64 } = JSON.parse(event.body || '{}');
    if (!ticketId || !imageBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: 'חסר ticketId או imageBase64' }) };
    }

    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'משתני הסביבה של Supabase לא מוגדרים ב-Netlify' }) };
    }

    const buffer = Buffer.from(imageBase64, 'base64');
    const storageUrl = `${url}/storage/v1/object/repairs-images/${ticketId}.jpg`;

    const response = await fetch(storageUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'true',
      },
      body: buffer,
    });

    if (!response.ok) {
      const details = await response.text();
      return { statusCode: response.status, body: JSON.stringify({ error: 'שגיאה בעדכון התמונה', details }) };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'שגיאה כללית', details: err.message }) };
  }
};
