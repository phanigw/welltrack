import { sb } from './state.js';

// ============================================================
// AUTH SCREEN
// ============================================================

export function renderAuth(mode) {
    mode = mode || 'login';
    const isLogin = mode === 'login';
    const isSignup = mode === 'signup';
    const isMagic = mode === 'magic';

    let html = `<div class="auth-container">
    <div class="auth-card">
      <div class="auth-title">WellTrack</div>
      <div class="auth-subtitle">${isLogin ? 'Sign in to your account' : isSignup ? 'Create a new account' : 'Sign in with magic link'}</div>
      <div class="auth-error" id="auth-error"></div>
      <div class="auth-success" id="auth-success"></div>
      <form id="auth-form">
        <input type="email" id="auth-email" placeholder="Email address" required autocomplete="email">`;

    if (!isMagic) {
        html += `<input type="password" id="auth-password" placeholder="Password" required autocomplete="${isLogin ? 'current-password' : 'new-password'}" minlength="6">`;
    }

    html += `<button type="submit" class="btn btn-primary">${isLogin ? 'Sign In' : isSignup ? 'Sign Up' : 'Send Magic Link'}</button>
      </form>`;

    if (!isMagic) {
        html += `<div class="auth-divider">or</div>
      <button class="btn btn-secondary" id="auth-magic-btn" style="width:100%">Send Magic Link</button>`;
    }

    if (isLogin) {
        html += `<div class="auth-toggle">Don't have an account? <a id="auth-switch">Sign up</a></div>`;
    } else if (isSignup) {
        html += `<div class="auth-toggle">Already have an account? <a id="auth-switch">Sign in</a></div>`;
    } else {
        html += `<div class="auth-toggle">Back to <a id="auth-switch">Sign in</a></div>`;
    }

    html += `</div></div>`;

    document.getElementById('screen-auth').innerHTML = html;
    attachAuthEvents(mode);
}

function attachAuthEvents(mode) {
    const form = document.getElementById('auth-form');
    const errorEl = document.getElementById('auth-error');
    const successEl = document.getElementById('auth-success');

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.classList.add('visible');
        successEl.classList.remove('visible');
    }

    function showSuccess(msg) {
        successEl.textContent = msg;
        successEl.classList.add('visible');
        errorEl.classList.remove('visible');
    }

    form.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value.trim();
        const submitBtn = form.querySelector('button[type=submit]');
        submitBtn.disabled = true;
        errorEl.classList.remove('visible');
        successEl.classList.remove('visible');

        try {
            if (mode === 'magic') {
                const { error } = await sb.auth.signInWithOtp({ email });
                if (error) throw error;
                showSuccess('Check your email for the magic link!');
            } else if (mode === 'signup') {
                const password = document.getElementById('auth-password').value;
                const { error } = await sb.auth.signUp({ email, password });
                if (error) throw error;
                showSuccess('Account created! Check your email to confirm, then sign in.');
            } else {
                const password = document.getElementById('auth-password').value;
                const { error } = await sb.auth.signInWithPassword({ email, password });
                if (error) throw error;
                // onAuthStateChange will handle navigation
            }
        } catch (err) {
            showError(err.message || 'An error occurred');
        } finally {
            submitBtn.disabled = false;
        }
    };

    const switchLink = document.getElementById('auth-switch');
    if (switchLink) {
        switchLink.onclick = () => {
            if (mode === 'login') renderAuth('signup');
            else renderAuth('login');
        };
    }

    const magicBtn = document.getElementById('auth-magic-btn');
    if (magicBtn) {
        magicBtn.onclick = () => renderAuth('magic');
    }
}
