import { store } from '../store/supabase.js';
import { createApp } from '../ui/app.js';

createApp(document.getElementById('app'), store);
