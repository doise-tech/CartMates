import { store } from '../store/supabase.js';
import { createApp } from '../ui/app.js';

const app = document.getElementById('app');
// Opened as a full tab (not a small pop-up): use the wide layout, same as the drawer's full view.
if (window.innerWidth > 520) app.classList.add('wide');
createApp(app, store);
