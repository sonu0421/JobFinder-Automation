require('dotenv').config();

async function triggerN8nWebhook(payload) {
  const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!n8nWebhookUrl) {
    console.warn('[n8n Service]: N8N_WEBHOOK_URL is missing in environment variables.');
    return {
      success: false,
      error: 'N8N Webhook URL is not configured in environment variables.'
    };
  }
  
  let urlWithParams;
  try {
    urlWithParams = new URL(n8nWebhookUrl);
    if (payload.telegramChatId) urlWithParams.searchParams.append('telegramChatId', payload.telegramChatId);
    if (payload.userId) urlWithParams.searchParams.append('userId', payload.userId);
    if (payload.searchId) urlWithParams.searchParams.append('searchId', payload.searchId);
  } catch (err) {
    console.error('[n8n Service Error]: Invalid N8N_WEBHOOK_URL format:', err.message);
    return {
      success: false,
      error: 'Invalid N8N Webhook URL format.'
    };
  }

  try {
    const response = await fetch(urlWithParams.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const textData = await response.text();
    let resData;
    try {
      resData = JSON.parse(textData);
    } catch (e) {
      resData = textData;
    }

    return {
      success: response.ok,
      status: response.status,
      data: resData
    };
  } catch (error) {
    console.error('[n8n Service Error]:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  triggerN8nWebhook
};
