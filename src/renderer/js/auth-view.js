'use strict';

export function initAuthView({ onLoginSuccess, onLogout, onRecheck }) {
    const userBadge = document.getElementById('userBadge');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    const btnLogout = document.getElementById('btnLogout');

    const loginView = document.getElementById('loginView');
    const deniedView = document.getElementById('deniedView');
    const dashboardView = document.getElementById('dashboardView');
    const btnLoginDiscord = document.getElementById('btnLoginDiscord');
    const loginAlert = document.getElementById('loginAlert');

    const deniedUsername = document.getElementById('deniedUsername');
    const deniedGuildId = document.getElementById('deniedGuildId');
    const btnRecheckAccess = document.getElementById('btnRecheckAccess');
    const btnSwitchAccount = document.getElementById('btnSwitchAccount');

    function showView(viewName) {
        if (loginView) loginView.style.display = viewName === 'login' ? 'block' : 'none';
        if (deniedView) deniedView.style.display = viewName === 'denied' ? 'block' : 'none';
        if (dashboardView) dashboardView.style.display = viewName === 'dashboard' ? 'flex' : 'none';
    }

    function renderUserBadge(user, membership) {
        if (!userBadge) return;
        if (!user) {
            userBadge.style.display = 'none';
            return;
        }
        userBadge.style.display = 'flex';
        if (userAvatar) userAvatar.src = user.avatarUrl;
        if (userName) userName.textContent = membership?.nick || user.globalName || user.username;

        if (userRole) {
            if (membership?.isAdmin) {
                userRole.textContent = 'Admin';
                userRole.className = 'badge-role badge-admin';
            } else if (membership?.isMember) {
                userRole.textContent = 'Miembro';
                userRole.className = 'badge-role';
            } else {
                userRole.textContent = 'No Autorizado';
                userRole.className = 'badge-role';
            }
        }
    }

    function setDeniedInfo(username, guildId) {
        if (deniedUsername) deniedUsername.textContent = `@${username}`;
        if (deniedGuildId) deniedGuildId.textContent = guildId || '--';
    }

    // Login button
    if (btnLoginDiscord) {
        btnLoginDiscord.addEventListener('click', async () => {
            btnLoginDiscord.disabled = true;
            if (loginAlert) loginAlert.style.display = 'none';

            try {
                const res = await window.igniteLauncher.loginWithDiscord();
                if (res.success) {
                    if (typeof onLoginSuccess === 'function') onLoginSuccess();
                } else {
                    if (loginAlert) {
                        loginAlert.className = 'alert-box alert-error';
                        loginAlert.innerHTML = `<strong>Error de inicio de sesión:</strong> ${res.error || 'Autenticación no completada.'}`;
                        loginAlert.style.display = 'block';
                    }
                }
            } catch (err) {
                if (loginAlert) {
                    loginAlert.className = 'alert-box alert-error';
                    loginAlert.innerHTML = `Error: ${err.message}`;
                    loginAlert.style.display = 'block';
                }
            } finally {
                btnLoginDiscord.disabled = false;
            }
        });
    }

    // Logout
    async function handleLogout() {
        await window.igniteLauncher.logout();
        if (typeof onLogout === 'function') onLogout();
    }

    if (btnLogout) btnLogout.addEventListener('click', handleLogout);
    if (btnSwitchAccount) btnSwitchAccount.addEventListener('click', handleLogout);
    if (btnRecheckAccess && onRecheck) btnRecheckAccess.addEventListener('click', onRecheck);

    return {
        showView,
        renderUserBadge,
        setDeniedInfo,
    };
}
