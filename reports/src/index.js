import { handleIngest } from './ingest.js';
import { isAuthorised } from './access.js';
import { handleViewer } from './viewer.js';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    // The only public route. Cloudflare Access bypasses this exact path.
    if (pathname === '/ingest') return handleIngest(request, env);
    if (!(await isAuthorised(request, env))) return new Response('Forbidden', { status: 403 });
    return handleViewer(request, env);
  },
};
