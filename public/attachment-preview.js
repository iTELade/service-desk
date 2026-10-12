export function attachmentPreview({ api, showModal, e }) {
  let activeURL;
  const release = () => { if (activeURL) URL.revokeObjectURL(activeURL); activeURL = null; };
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
    activeURL = URL.createObjectURL(blob);
    showModal(`<h2>${e(attachment.filename)}</h2><div data-attachment-preview></div><p>Podgląd jest tylko do odczytu.</p><button type="button" data-preview-close>Zamknij</button>`);
    const host = document.querySelector('[data-attachment-preview]');
    if (attachment.preview_mime === 'application/pdf') {
      const frame = document.createElement('iframe'); frame.className = 'attachment-preview-pdf';
      frame.setAttribute('sandbox', ''); frame.title = attachment.filename; frame.src = activeURL;
      host.append(frame);
      const note = document.createElement('p'); note.textContent = 'Jeżeli przeglądarka nie obsługuje podglądu PDF w izolowanym oknie, pobierz plik.'; host.append(note);
    } else {
      const img = document.createElement('img'); img.className = 'attachment-preview-image'; img.alt = attachment.filename; img.src = activeURL; host.append(img);
    }
    document.querySelector('[data-preview-close]').onclick = () => document.querySelector('#modal').close();
  };
}
