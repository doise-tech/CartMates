// Supabase sends people here with their sign-in token in the address. Nothing needs it, so remove it from view and history.
if (location.hash || location.search) history.replaceState(null, '', location.pathname);
