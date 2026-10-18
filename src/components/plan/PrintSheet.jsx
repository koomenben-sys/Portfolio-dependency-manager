import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

// Release A (D44): print one sheet without a route. The portal is hidden on screen; while it is mounted
// `html.print-sheet` makes it the only visible element in print (src/index.css). Mount it, the browser's
// print dialog opens, and `onDone` unmounts it after printing (or when the dialog is cancelled).
export function PrintSheet({ children, onDone, landscape = false }) {
  useEffect(() => {
    document.documentElement.classList.add('print-sheet');
    const after = () => onDone?.();
    window.addEventListener('afterprint', after);
    const id = requestAnimationFrame(() => window.print());
    return () => { cancelAnimationFrame(id); window.removeEventListener('afterprint', after); document.documentElement.classList.remove('print-sheet'); };
  }, []);
  return createPortal(<div className={`print-sheet-body ${landscape ? 'print-landscape' : ''}`} aria-hidden="true">{children}</div>, document.body);
}
