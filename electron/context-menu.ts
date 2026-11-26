export type BrowserContextMenuAction =
  | 'back'
  | 'copy-image'
  | 'copy-image-address'
  | 'copy-link'
  | 'copy-selection'
  | 'forward'
  | 'inspect'
  | 'open-image'
  | 'open-link'
  | 'open-link-incognito'
  | 'paste'
  | 'print'
  | 'reload'
  | 'save-image'
  | 'save-link'
  | 'save-page'
  | 'select-all'
  | 'cut';

export type BrowserContextMenuItem =
  | { type: 'separator' }
  | {
    action: BrowserContextMenuAction;
    accelerator?: string;
    enabled?: boolean;
    label: string;
  };

export type BrowserContextMenuContext = {
  canGoBack: boolean;
  canGoForward: boolean;
  hasImageContents: boolean;
  imageURL: string | null;
  isEditable: boolean;
  linkURL: string | null;
  selectionText: string;
};

export function buildBrowserContextMenu(context: BrowserContextMenuContext): BrowserContextMenuItem[] {
  const items: BrowserContextMenuItem[] = [];
  const separator = () => {
    const last = items[items.length - 1];
    if (last && (!('type' in last) || last.type !== 'separator')) items.push({ type: 'separator' });
  };

  if (context.linkURL) {
    items.push(
      { label: "Apri link in un'altra scheda", action: 'open-link' },
      { label: 'Apri link in finestra di navigazione in incognito', action: 'open-link-incognito' }
    );
    separator();
    items.push(
      { label: 'Copia indirizzo link', action: 'copy-link' },
      { label: 'Salva link con nome...', action: 'save-link' }
    );
  }

  if (context.hasImageContents) {
    if (context.linkURL) separator();
    if (context.imageURL) {
      items.push(
        { label: "Apri immagine in un'altra scheda", action: 'open-image' },
        { label: 'Salva immagine con nome...', action: 'save-image' }
      );
    }
    items.push({ label: 'Copia immagine', action: 'copy-image' });
    if (context.imageURL) items.push({ label: "Copia l'indirizzo dell'immagine", action: 'copy-image-address' });
  }

  if (!context.hasImageContents) {
    if (context.isEditable) {
      separator();
      items.push(
        { label: 'Taglia', action: 'cut' },
        { label: 'Copia', action: 'copy-selection', enabled: !!context.selectionText },
        { label: 'Incolla', action: 'paste' },
        { label: 'Seleziona tutto', action: 'select-all' }
      );
    } else {
      separator();
      items.push(
        { label: 'Indietro', action: 'back', enabled: context.canGoBack, accelerator: 'Alt+Left' },
        { label: 'Avanti', action: 'forward', enabled: context.canGoForward, accelerator: 'Alt+Right' },
        { label: 'Ricarica', action: 'reload', accelerator: 'Ctrl+R' }
      );
      if (context.selectionText) items.push({ label: 'Copia', action: 'copy-selection', enabled: true });
      separator();
      items.push(
        { label: 'Salva con nome...', action: 'save-page', accelerator: 'Ctrl+S' },
        { label: 'Stampa...', action: 'print', accelerator: 'Ctrl+P' }
      );
    }
  }

  separator();
  items.push({ label: 'Ispeziona', action: 'inspect' });
  return items;
}
