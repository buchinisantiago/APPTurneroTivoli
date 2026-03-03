/**
 * JS -> User Management module
 */

async function renderUsers(container) {
    if (!isManager()) return;

    container.innerHTML = `
        <div class="header-actions">
            <h2>User Management</h2>
            <button class="btn btn-primary" onclick="openUserModal()">
                <span class="material-icons-round">person_add</span> Add User
            </button>
        </div>
        <div class="settings-card" style="margin-top:20px;">
            <div class="table-responsive">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Id</th>
                            <th>Username</th>
                            <th>Role</th>
                            <th>Linked Employee</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="users-tbody">
                        <tr><td colspan="6" style="text-align:center;">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
    loadUsers();
}

async function loadUsers() {
    try {
        const users = await api('users.php');
        const tbody = document.getElementById('users-tbody');
        if (!tbody) return;

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No users found</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(u => `
            <tr>
                <td>#${u.id}</td>
                <td><strong>${u.username}</strong></td>
                <td><span class="badge ${u.role === 'manager' ? 'badge-manager' : 'badge-staff'}">${u.role}</span></td>
                <td>${u.employee_name ? u.employee_name : '<span style="color:#888;">Not linked</span>'}</td>
                <td>
                    ${u.active === 1
                ? '<span class="status-indicator status-active">Active</span>'
                : '<span class="status-indicator status-inactive">Inactive</span>'}
                </td>
                <td>
                    <button class="btn-icon" title="Reset Password" onclick="resetPassword(${u.id}, '${u.username}')">
                        <span class="material-icons-round" style="color:#eab308">lock_reset</span>
                    </button>
                    ${u.role !== 'manager' ? `
                    <button class="btn-icon" title="Delete User" onclick="deleteUser(${u.id}, '${u.username}')">
                        <span class="material-icons-round" style="color:#ef4444">delete</span>
                    </button>
                    ` : ''}
                </td>
            </tr>
        `).join('');
    } catch (e) {
        showToast('Error loading users', 'error');
    }
}

async function resetPassword(id, username) {
    if (!confirm(`Are you sure you want to reset password for ${username} to '1234'?`)) return;

    try {
        await api(`users.php?action=reset_password`, 'POST', { id });
        showToast(`Password for ${username} reset to 1234`, 'success');
    } catch (e) {
        showToast(e.error || 'Failed to reset password', 'error');
    }
}

async function deleteUser(id, username) {
    if (!confirm(`Are you sure you want to deactivate ${username}?`)) return;

    try {
        await api(`users.php?id=${id}`, 'DELETE');
        showToast('User deactivated', 'success');
        loadUsers();
    } catch (e) {
        showToast(e.error || 'Failed to deactivate user', 'error');
    }
}

function openUserModal() {
    const body = `
        <form id="user-form">
            <div class="input-group">
                <label>Username</label>
                <input type="text" id="user-username" required>
                <small style="display:block;margin-top:4px;color:#888;">Default password will be <strong>1234</strong></small>
            </div>
            
            <div class="input-group" style="margin-top:10px;">
                <label>Role</label>
                <select id="user-role" required>
                    <option value="staff">Staff</option>
                    <option value="manager">Manager</option>
                </select>
            </div>
        </form>
    `;

    const footer = `
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveUser()">Create User</button>
    `;

    openModal('Add New User', body, footer);
}

async function saveUser() {
    const username = document.getElementById('user-username').value.trim();
    const role = document.getElementById('user-role').value;

    if (!username) return showToast('Username is required', 'error');

    try {
        await api('users.php', 'POST', { username, role });
        showToast('User created successfully. Password is: 1234', 'success');
        closeModal();
        loadUsers();
    } catch (e) {
        showToast(e.error || 'Failed to create user', 'error');
    }
}
