import { useUI } from '../../state/ui';
import { ExcalidrawEditor } from './ExcalidrawEditor';

/**
 * Main pane for Draw mode. Renders the Excalidraw editor for the selected
 * drawing, or an empty state prompting the user to pick/create one.
 *
 * The editor is keyed by drawing id so switching drawings fully remounts it —
 * Excalidraw is uncontrolled after mount, so a remount is how a different
 * scene's initialData takes effect (same pattern as NoteEditor).
 */
export function DrawMainPane(): JSX.Element {
  const selectedDrawingId = useUI((s) => s.selectedDrawingId);

  if (!selectedDrawingId) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-center text-gray-500">
        <div>
          <p className="text-lg font-medium">No drawing selected</p>
          <p className="mt-1 text-sm">
            Pick a drawing from the sidebar, or create a new one to start
            sketching.
          </p>
        </div>
      </div>
    );
  }

  return <ExcalidrawEditor key={selectedDrawingId} drawingId={selectedDrawingId} />;
}
