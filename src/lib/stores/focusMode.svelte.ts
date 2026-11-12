/**
 * Editor focus mode: hides the app chrome (navbar, banners, feedback button)
 * and the editor toolbar so only the text, the title and the save status stay.
 * The editor turns it off when it unmounts.
 */
export const focusMode = $state({ on: false });
