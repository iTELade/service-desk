export function attachmentPreview({ api, showModal, e }) {
  let activeURL, pdfTask, renderTask, generation = 0;
  const release = () => { generation++; renderTask?.cancel(); renderTask = null; void pdfTask?.destroy(); pdfTask = null; if (activeURL) URL.revokeObjectURL(activeURL); activeURL = null; };
  document.querySelector('#modal').addEventListener('close', release);
  window.addEventListener('hashchange', release);
  return async id => {
    const attachment = await api('/desk/r112/attachment/' + encodeURIComponent(id));
    if (!attachment.preview_mime) throw Error('Ten plik nie ma bezpiecznego podglądu. Pobierz go, aby otworzyć lokalnie.');
    release();
    const bytes = Uint8Array.from(atob(attachment.data_base64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: attachment.preview_mime });
    if (attachment.preview_mime.startsWith('image/')) {
      const decoded = await createImageBitmap(blob);
      const tooLarge = decoded.width * decoded.height > 32000000; decoded.close();
      if (tooLarge) throw Error('Obraz jest zbyt duży do podglądu. Pobierz plik.');
    }
    const current = generation;
    if (attachment.preview_mime !== 'application/pdf') activeURL = URL.createObjectURL(blob);
    showModal(`<h2>${e(attachment.filename)}</h2><div data-attachment-preview></div><p>Podgląd jest tylko do odczytu.</p><button type="button" data-preview-close>Zamknij</button>`);
    document.querySelector('[data-preview-close]').onclick = () => document.querySelector('#modal').close();
    const host = document.querySelector('[data-attachment-preview]');
    if (attachment.preview_mime === 'application/pdf') {
      const note = document.createElement('p'); note.textContent = 'Ładowanie PDF…'; host.append(note);
      try {
        const pdfjs = await import('/pdfjs/pdf.mjs?v=2.2.0');
        if (current !== generation) return;
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.mjs?v=2.2.0';
        pdfTask = pdfjs.getDocument({ data: bytes, enableXfa: false, disableFontFace: true, useSystemFonts: true, useWasm: false, disableRange: true, disableStream: true, disableAutoFetch: true, maxImageSize: 32000000, canvasMaxAreaInBytes: 128000000 });
        let timer;
        const pdf = await Promise.race([pdfTask.promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Przekroczono czas ładowania PDF.')), 15000); })]).finally(() => clearTimeout(timer));
        if (current !== generation) return;
        const canvas = document.createElement('canvas'); canvas.className = 'attachment-preview-pdf'; canvas.setAttribute('aria-label', attachment.filename);
        const previous = document.createElement('button'), next = document.createElement('button'); previous.type = next.type = 'button'; previous.textContent = 'Poprzednia strona'; next.textContent = 'Następna strona'; host.append(canvas, previous, next);
        let pageNumber = 1;
        const limit = Math.min(pdf.numPages, 50);
        const render = async () => {
          previous.disabled = next.disabled = true;
          const page = await pdf.getPage(pageNumber);
          if (current !== generation) return;
          const initial = page.getViewport({ scale: 1 }), scale = Math.min(2, 1200 / initial.width, 1600 / initial.height);
          const viewport = page.getViewport({ scale }); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport, annotationMode: pdfjs.AnnotationMode.DISABLE });
          await renderTask.promise; renderTask = null; page.cleanup();
          if (current !== generation) return;
          note.textContent = `Strona ${pageNumber} z ${pdf.numPages}` + (pdf.numPages > limit ? ' — podgląd pierwszych 50 stron.' : ''); previous.disabled = pageNumber === 1; next.disabled = pageNumber === limit;
        };
        const move = delta => { pageNumber += delta; void render().catch(() => { if (current === generation) note.textContent = 'Nie można wyświetlić strony. Pobierz plik.'; }); };
        previous.onclick = () => move(-1); next.onclick = () => move(1); await render();
      } catch {
        if (current !== generation) return;
        renderTask?.cancel(); renderTask = null; void pdfTask?.destroy(); pdfTask = null;
        note.textContent = 'Nie można wyświetlić tego PDF. Pobierz plik, aby otworzyć go lokalnie.';
      }
    } else {
      const img = document.createElement('img'); img.className = 'attachment-preview-image'; img.alt = attachment.filename; img.src = activeURL; host.append(img);
    }
    document.querySelector('[data-preview-close]').onclick = () => document.querySelector('#modal').close();
  };
}
