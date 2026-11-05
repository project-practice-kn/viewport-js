import { isHttpError } from '@sveltejs/kit';
import { archive } from './index.ts';
export async function archiveResponse(access: Parameters<typeof archive>[0], request: Request) {
  try {
    return await archive(access, request.signal);
  } catch (e) {
    if (!isHttpError(e) || new URL(request.url).searchParams.get('embedded') !== '1') throw e;
    const payload = JSON.stringify({
      type: 'viewport-download-error',
      message: e.body.message,
    }).replace(/</g, '\u003c');
    return new Response(
      `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Скачивание не началось</title><p id="message"></p><script>const result=${payload};document.getElementById('message').textContent=result.message;parent.postMessage(result,location.origin);</script></html>`,
      {
        status: e.status,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'private, no-store',
        },
      },
    );
  }
}
