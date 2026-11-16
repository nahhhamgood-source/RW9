self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.searchParams.has('share-target')) {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const title = String(formData.get('title') || '');
          const text = String(formData.get('text') || '');
          const media = formData.get('media');
          const nextUrl = new URL('/?share-target=1', self.location.origin);
          if (title) nextUrl.searchParams.set('title', title);
          if (text) nextUrl.searchParams.set('text', text);

          if (media && typeof media === 'object' && 'arrayBuffer' in media) {
            const cache = await caches.open('ascend-share-target');
            await cache.put(
              '/__shared-photo__',
              new Response(media, {
                headers: {
                  'Content-Type': media.type || 'image/jpeg',
                  'X-File-Name': encodeURIComponent(media.name || 'shared-meal.jpg'),
                },
              })
            );
            nextUrl.searchParams.set('has-photo', '1');
          }
          return Response.redirect(nextUrl.toString(), 303);
        } catch {
          return Response.redirect('/?share-target=1', 303);
        }
      })()
    );
  }
});
