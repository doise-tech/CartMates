import { supabase } from '../lib/supabase.js';

// Supabase sends people here from two kinds of email, with a token after the # in the address:
//   confirm your email  -> just say welcome
//   reset your password -> ask for a new one (type=recovery)
// The token is removed from the address bar and history as soon as it is read.
const $ = (id) => document.getElementById(id);
const show = (id) => { for (const s of ['done', 'reset', 'saved', 'expired']) $(s).hidden = s !== id; };

const params = new URLSearchParams(location.hash.slice(1));
history.replaceState(null, '', location.pathname);

const failed = params.get('error') || params.get('error_code');
const isRecovery = params.get('type') === 'recovery';
const access = params.get('access_token');
const refresh = params.get('refresh_token');

if (failed) show('expired');
else if (isRecovery && access && refresh) {
  show('reset');
  const input = $('pw');
  const toggle = $('pwToggle');
  toggle.addEventListener('click', () => {
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    toggle.textContent = reveal ? 'Hide' : 'Show';
    toggle.setAttribute('aria-pressed', String(reveal));
  });
  $('resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('resetMsg');
    msg.hidden = true;
    try {
      const { error: sessionError } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
      if (sessionError) throw sessionError;
      const { error } = await supabase.auth.updateUser({ password: input.value });
      if (error) throw error;
      show('saved');
    } catch (err) {
      msg.textContent = err?.message || 'Could not save the new password. Try the link again.';
      msg.hidden = false;
    }
  });
} else show('done');
