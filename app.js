/**
 * VR FINANCE - Single Page Web Application Controller (Business Invoice Suite)
 * Connects to PocketBase backend with custom table collections.
 */

// Initialize PocketBase
const pbUrl = (
    window.location.hostname === "localhost" && window.location.port === "8090" ||
    window.location.hostname === "127.0.0.1" && window.location.port === "8090"
) ? window.location.origin : "https://pocketbase2.venturerushtech.com";
const pb = new PocketBase(pbUrl);

// Application State
let currentUser = null;
let currentTab = 'dashboard';
let currentZoom = parseFloat(localStorage.getItem('vrtpocket_zoom')) || 1.0;

// Cache for invoices
let appData = {
    invoices: [],
    reminders: [],
    reminderLogs: []
};

// Global dashboard charts references
let dashboardCharts = {
    statusPie: null,
    amountBar: null,
    monthlyLine: null
};

// Global reminders charts references
let reminderCharts = {
    categoryPie: null,
    statusDoughnut: null
};

// ==================== DOM ELEMENTS & INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();

    // Register PWA Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .then(reg => console.log('ServiceWorker registration successful with scope: ', reg.scope))
                .catch(err => console.log('ServiceWorker registration failed: ', err));
        });
    }
});

// Helper to update brand logo images based on theme
function updateAppLogos(isLight) {
    const logoSrc = isLight ? 'vrLogoBlue.png' : 'vrLogoWhite.png';
    const authLogo = document.getElementById('app-logo-auth');
    const sidebarLogo = document.getElementById('app-logo-sidebar');
    if (authLogo) authLogo.src = logoSrc;
    if (sidebarLogo) sidebarLogo.src = logoSrc;
}

// Helper to format Date string to DD/MM/YYYY
function formatDateToDMY(dateStr) {
    if (!dateStr || dateStr === 'N/A') return 'N/A';
    if (dateStr instanceof Date) {
        const day = String(dateStr.getDate()).padStart(2, '0');
        const month = String(dateStr.getMonth() + 1).padStart(2, '0');
        const year = dateStr.getFullYear();
        return `${day}/${month}/${year}`;
    }
    const cleanStr = dateStr.split(' ')[0].split('T')[0];
    const parts = cleanStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

function applyZoom(zoomVal) {
    currentZoom = Math.max(0.7, Math.min(1.8, zoomVal));
    localStorage.setItem('vrtpocket_zoom', currentZoom);
    document.body.style.zoom = currentZoom;
    const zoomText = document.getElementById('zoom-percentage-val');
    if (zoomText) {
        zoomText.textContent = `${Math.round(currentZoom * 100)}%`;
    }
}

async function initApp() {
    applyZoom(currentZoom);

    // Theme toggle initialization (defaults to light mode on first visit)
    const savedTheme = localStorage.getItem('theme');
    const isLight = savedTheme === null || savedTheme === 'light';

    if (isLight) {
        document.body.setAttribute('data-theme', 'light');
        const themeBtn = document.getElementById('theme-toggle');
        if (themeBtn) themeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
        updateAppLogos(true);
    } else {
        document.body.removeAttribute('data-theme');
        const themeBtn = document.getElementById('theme-toggle');
        if (themeBtn) themeBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
        updateAppLogos(false);
    }

    // Check PocketBase authorization status
    if (pb.authStore.isValid && pb.authStore.model) {
        currentUser = pb.authStore.model;
        showDashboard();
    } else {
        showAuthScreen();
    }
}

// ==================== TOAST NOTIFICATION CONTROLLER ====================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-circle-exclamation';

    toast.innerHTML = `
        <div class="toast-content">
            <i class="fa-solid ${icon}"></i>
            <span>${message}</span>
        </div>
        <button class="toast-close">&times;</button>
    `;

    container.appendChild(toast);

    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove();
    });

    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 5000);
}

// Global Loading Overlay togglers
function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (show) overlay.classList.remove('hidden');
    else overlay.classList.add('hidden');
}

// ==================== SCREEN SWITCHERS ====================
function showAuthScreen() {
    document.getElementById('auth-container').classList.remove('hidden');
    document.getElementById('main-container').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('main-container').classList.remove('hidden');

    updateUserHeaderDisplay();

    // Route to dashboard initially or active hash
    const currentHash = window.location.hash ? window.location.hash.substring(1) + '-tab' : 'dashboard-tab';
    const activeLink = document.querySelector(`.nav-link[data-tab="${currentHash}"]`);
    if (activeLink && !activeLink.classList.contains('disabled')) {
        switchTab(currentHash);
    } else {
        switchTab('dashboard-tab');
    }

    syncAllData();
}

function updateUserHeaderDisplay() {
    if (!currentUser) return;

    // Update Company Badge
    const companyBadge = document.getElementById('sidebar-company-badge');
    if (companyBadge) {
        const companyName = currentUser.company_name || 'My Organization';
        const companyEmail = currentUser.company_email || currentUser.email || '';
        document.getElementById('header-company-name').textContent = companyName;
        document.getElementById('header-company-email').textContent = companyEmail;

        const companyLogoImg = document.getElementById('header-company-logo');
        if (companyLogoImg) {
            if (currentUser.company_logo) {
                companyLogoImg.src = pb.files.getUrl(currentUser, currentUser.company_logo);
            } else {
                companyLogoImg.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%236366f1' d='M12 2L2 22h20L12 2z'/%3E%3C/svg%3E";
            }
        }
    }

    // Currency indicator
    const currencyStr = currentUser.currency || 'USD';
    const currencyIndicator = document.querySelector('.currency-indicator');
    if (currencyIndicator) {
        currencyIndicator.innerHTML = `<i class="fa-solid fa-coins"></i> ${currencyStr}`;
    }
}

// ==================== ROUTING SYSTEM ====================
function switchTab(tabId) {
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.getAttribute('data-tab') === tabId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
        if (pane.id === tabId) {
            pane.classList.add('active');
        } else {
            pane.classList.remove('active');
        }
    });

    const titleMap = {
        'dashboard-tab': 'Financial Analytics Dashboard',
        'invoices-tab': 'Corporate Invoices Suite',
        'reminders-tab': 'Recurring Reminders Registry',
        'profile-tab': 'System Settings',
        'display-tab': 'Display Settings'
    };
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) {
        pageTitle.textContent = titleMap[tabId] || 'Financial Analytics Dashboard';
    }

    currentTab = tabId.replace('-tab', '');
    window.location.hash = currentTab;
}

// ==================== EVENT LISTENERS SETUP ====================
function setupEventListeners() {
    window.addEventListener('hashchange', () => {
        if (pb.authStore.isValid && window.location.hash) {
            const targetTab = window.location.hash.substring(1) + '-tab';
            const navLink = document.querySelector(`.nav-link[data-tab="${targetTab}"]`);
            if (navLink) switchTab(targetTab);
        }
    });

    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = link.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    // Auth screen form toggles
    document.getElementById('toggle-to-signup').addEventListener('click', () => {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('signup-form').classList.remove('hidden');
        document.querySelector('.auth-subtitle').textContent = 'Create Account';
    });

    document.getElementById('toggle-to-login').addEventListener('click', () => {
        document.getElementById('signup-form').classList.add('hidden');
        document.getElementById('login-form').classList.remove('hidden');
        document.querySelector('.auth-subtitle').textContent = 'Wealth Managment Portal';
    });

    // Signup company logo preview
    const signupLogoInput = document.getElementById('signup-company-logo');
    if (signupLogoInput) {
        signupLogoInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    document.getElementById('signup-company-logo-preview').src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        };
    }

    // Theme Toggle
    document.getElementById('theme-toggle').addEventListener('click', () => {
        const isLight = document.body.getAttribute('data-theme') === 'light';
        if (isLight) {
            document.body.removeAttribute('data-theme');
            localStorage.setItem('theme', 'dark');
            document.getElementById('theme-toggle').innerHTML = '<i class="fa-solid fa-moon"></i>';
            updateAppLogos(false);
        } else {
            document.body.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
            document.getElementById('theme-toggle').innerHTML = '<i class="fa-solid fa-sun"></i>';
            updateAppLogos(true);
        }

        // Re-render dashboard to update chart colors dynamically based on theme
        if (currentUser) {
            renderDashboard();
        }
    });

    // Disconnect (Logout)
    document.getElementById('logout-btn').addEventListener('click', () => {
        pb.authStore.clear();
        currentUser = null;
        showToast('Logged out successfully.', 'info');
        showAuthScreen();
    });

    // --- DISPLAY SETTINGS ---
    const fullscreenToggle = document.getElementById('display-fullscreen-toggle');
    if (fullscreenToggle) {
        document.addEventListener('fullscreenchange', () => {
            fullscreenToggle.checked = !!document.fullscreenElement;
        });

        fullscreenToggle.addEventListener('change', () => {
            if (fullscreenToggle.checked) {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(err => {
                        console.error(`Error attempting to enable fullscreen: ${err.message}`);
                        fullscreenToggle.checked = false;
                        showToast('Fullscreen mode failed to launch.', 'error');
                    });
                }
            } else {
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                }
            }
        });
    }

    // Zoom Controls
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const btnZoomReset = document.getElementById('btn-zoom-reset');

    if (btnZoomIn) {
        btnZoomIn.addEventListener('click', () => {
            applyZoom(currentZoom + 0.1);
        });
    }
    if (btnZoomOut) {
        btnZoomOut.addEventListener('click', () => {
            applyZoom(currentZoom - 0.1);
        });
    }
    if (btnZoomReset) {
        btnZoomReset.addEventListener('click', () => {
            applyZoom(1.0);
        });
    }

    // --- FETCH PREVIOUS INVOICE ---
    const fetchPrevInvoiceBtn = document.getElementById('btn-invoice-fetch-prev');
    if (fetchPrevInvoiceBtn) {
        fetchPrevInvoiceBtn.addEventListener('click', openInvoiceFetchModal);
    }

    const closeInvoiceFetchBtn = document.getElementById('close-invoice-fetch-modal');
    if (closeInvoiceFetchBtn) {
        closeInvoiceFetchBtn.addEventListener('click', () => {
            document.getElementById('invoice-fetch-modal').classList.add('hidden');
        });
    }

    const cancelInvoiceFetchBtn = document.getElementById('btn-close-invoice-fetch-form');
    if (cancelInvoiceFetchBtn) {
        cancelInvoiceFetchBtn.addEventListener('click', () => {
            document.getElementById('invoice-fetch-modal').classList.add('hidden');
        });
    }

    const invoiceSearchInput = document.getElementById('invoice-fetch-search-input');
    if (invoiceSearchInput) {
        invoiceSearchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            const filtered = appData.invoices.filter(inv => {
                const clientMatch = inv.client_name ? inv.client_name.toLowerCase().includes(term) : false;
                const numberMatch = inv.invoice_number ? inv.invoice_number.toLowerCase().includes(term) : false;
                return clientMatch || numberMatch;
            });
            renderFetchInvoiceList(filtered);
        });
    }

    // --- QUICK PREVIEW MODAL ---
    const closePreviewPopupBtn = document.getElementById('close-invoice-preview-popup-modal');
    if (closePreviewPopupBtn) {
        closePreviewPopupBtn.addEventListener('click', () => {
            document.getElementById('invoice-preview-popup-modal').classList.add('hidden');
        });
    }

    const closePreviewPopupBtn2 = document.getElementById('btn-close-invoice-preview-popup-modal');
    if (closePreviewPopupBtn2) {
        closePreviewPopupBtn2.addEventListener('click', () => {
            document.getElementById('invoice-preview-popup-modal').classList.add('hidden');
        });
    }

    const selectFromPreviewBtn = document.getElementById('btn-select-invoice-from-preview-popup');
    if (selectFromPreviewBtn) {
        selectFromPreviewBtn.addEventListener('click', () => {
            if (currentPreviewInvoiceId) {
                autofillInvoiceFromTemplate(currentPreviewInvoiceId);
                document.getElementById('invoice-preview-popup-modal').classList.add('hidden');
            }
        });
    }

    // --- FETCH CLIENT DATA ---
    const fetchClientBtn = document.getElementById('btn-invoice-fetch-client');
    if (fetchClientBtn) {
        fetchClientBtn.addEventListener('click', openInvoiceClientFetchModal);
    }

    const closeInvoiceClientFetchBtn = document.getElementById('close-invoice-client-fetch-modal');
    if (closeInvoiceClientFetchBtn) {
        closeInvoiceClientFetchBtn.addEventListener('click', () => {
            document.getElementById('invoice-client-fetch-modal').classList.add('hidden');
        });
    }

    const cancelInvoiceClientFetchBtn = document.getElementById('btn-close-invoice-client-fetch-form');
    if (cancelInvoiceClientFetchBtn) {
        cancelInvoiceClientFetchBtn.addEventListener('click', () => {
            document.getElementById('invoice-client-fetch-modal').classList.add('hidden');
        });
    }

    const clientSearchInput = document.getElementById('invoice-client-search-input');
    if (clientSearchInput) {
        clientSearchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            const allClients = getDeduplicatedClients();
            const filtered = allClients.filter(c => {
                const nameMatch = c.name ? c.name.toLowerCase().includes(term) : false;
                const emailMatch = c.email ? c.email.toLowerCase().includes(term) : false;
                const addrMatch = c.address ? c.address.toLowerCase().includes(term) : false;
                return nameMatch || emailMatch || addrMatch;
            });
            renderFetchClientList(filtered);
        });
    }

    // --- FORM SUBMISSIONS ---

    // Login Submission
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        showLoading(true);
        try {
            const authData = await pb.collection('VRTPOCKET_LOGIN_DATABASE').authWithPassword(email, password);
            currentUser = authData.record;
            showToast('Authorization successful!', 'success');
            showDashboard();
        } catch (error) {
            console.error(error);
            showToast('Sign in failed. Check credentials or verify pocketbase is running.', 'error');
        } finally {
            showLoading(false);
        }
    });

    // Signup Submission (Business Details only)
    document.getElementById('signup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const passwordConfirm = document.getElementById('signup-password-confirm').value;

        if (password.length < 8) {
            showToast('Password must be at least 8 characters long.', 'warning');
            return;
        }

        if (password !== passwordConfirm) {
            showToast('Passwords do not match.', 'error');
            return;
        }

        const companyName = document.getElementById('signup-company-name').value;
        const companyEmail = document.getElementById('signup-company-email').value;
        const companyPhone = document.getElementById('signup-company-phone').value;
        const companyAddress = document.getElementById('signup-company-address').value;
        const currency = document.getElementById('signup-currency').value;
        const logoFile = document.getElementById('signup-company-logo').files[0];

        showLoading(true);

        const formData = new FormData();
        formData.append('email', email);
        formData.append('password', password);
        formData.append('passwordConfirm', passwordConfirm);
        formData.append('name', companyName); // store in default pb name column
        formData.append('company_name', companyName);
        formData.append('company_email', companyEmail);
        formData.append('company_phone', companyPhone);
        formData.append('company_address', companyAddress);
        formData.append('currency', currency);

        if (logoFile) {
            formData.append('company_logo', logoFile);
        }

        try {
            // Create user profile
            await pb.collection('VRTPOCKET_LOGIN_DATABASE').create(formData);

            // Log in immediately
            const authData = await pb.collection('VRTPOCKET_LOGIN_DATABASE').authWithPassword(email, password);
            currentUser = authData.record;
            showToast('Account initialized successfully!', 'success');

            document.getElementById('signup-form').reset();
            showDashboard();
        } catch (error) {
            console.error(error);
            showToast('Signup failed. Make sure collection schema matches plan instructions.', 'error');
        } finally {
            showLoading(false);
        }
    });

    // Profile Settings Form
    document.getElementById('profile-form').onsubmit = async (e) => {
        e.preventDefault();
        showLoading(true);

        const companyName = document.getElementById('profile-company-name').value;
        const companyEmail = document.getElementById('profile-company-email').value;
        const companyPhone = document.getElementById('profile-company-phone').value;
        const currency = document.getElementById('profile-currency').value;
        const logoFile = document.getElementById('profile-logo-input').files[0];
        const bankDetails = document.getElementById('profile-bank-details').value;
        const invoiceNotesTerms = document.getElementById('profile-invoice-notes-terms').value;
        const companyAddress = document.getElementById('profile-company-address').value;

        const formData = new FormData();
        formData.append('name', companyName); // update default name
        formData.append('company_name', companyName);
        formData.append('company_email', companyEmail);
        formData.append('company_phone', companyPhone);
        formData.append('currency', currency);
        formData.append('bank_details', bankDetails);
        formData.append('invoice_notes_terms', invoiceNotesTerms);
        formData.append('company_address', companyAddress);

        if (logoFile) {
            formData.append('company_logo', logoFile);
        }

        try {
            const updated = await pb.collection('VRTPOCKET_LOGIN_DATABASE').update(currentUser.id, formData);
            currentUser = updated;

            showToast('System settings updated!', 'success');
            updateUserHeaderDisplay();
            syncAllData();
        } catch (error) {
            console.error(error);
            showToast('Failed to update settings. Verify connection details.', 'error');
        } finally {
            showLoading(false);
        }
    };

    // Profile logo input triggers preview
    document.getElementById('profile-logo-input').onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                document.getElementById('profile-logo-preview').src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    };

    // Dynamic Invoice Item Row setup
    document.getElementById('btn-create-invoice').onclick = () => openInvoiceCreator();
    document.getElementById('add-invoice-item-row').onclick = () => addInvoiceItemRow();
    document.getElementById('btn-invoice-cancel').onclick = () => closeInvoiceCreator();
    document.getElementById('btn-invoice-back').onclick = () => closeInvoiceCreator();
    document.getElementById('btn-invoice-close-view').onclick = () => closeInvoiceViewer();
    document.getElementById('btn-invoice-print').onclick = () => window.print();
    document.getElementById('invoice-form').onsubmit = (e) => saveInvoiceRecord(e);

    // Dynamic recalculations when typing inside invoice form
    document.getElementById('invoice-tax').oninput = calculateInvoiceTotals;
    document.getElementById('invoice-discount').oninput = calculateInvoiceTotals;

    // Reminders Event Listeners
    const btnCreateReminder = document.getElementById('btn-create-reminder');
    if (btnCreateReminder) {
        btnCreateReminder.onclick = () => openReminderCreator();
    }
    const closeReminderModalBtn = document.getElementById('close-reminder-modal');
    if (closeReminderModalBtn) {
        closeReminderModalBtn.onclick = () => closeModal('reminder-modal');
    }
    const cancelReminderBtn = document.getElementById('btn-close-reminder-form');
    if (cancelReminderBtn) {
        cancelReminderBtn.onclick = () => closeModal('reminder-modal');
    }
    const reminderForm = document.getElementById('reminder-form');
    if (reminderForm) {
        reminderForm.onsubmit = (e) => saveReminderRecord(e);
    }
    const paymentTypeSelect = document.getElementById('reminder-payment-type');
    if (paymentTypeSelect) {
        paymentTypeSelect.onchange = (e) => {
            const label = document.getElementById('reminder-value-label');
            if (label) {
                if (e.target.value === 'Percentage') {
                    label.innerHTML = '<i class="fa-solid fa-percent"></i> Percentage Value *';
                } else {
                    label.innerHTML = '<i class="fa-solid fa-dollar-sign"></i> Amount Value *';
                }
            }
        };
    }

    // Reminders Sub-tabs click handlers
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const subtabId = btn.getAttribute('data-subtab');
            switchSubTab(subtabId);
        });
    });

    // Mobile Navigation Drawer toggles
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    const openMenu = () => {
        sidebar.classList.add('open');
        overlay.classList.remove('hidden');
    };

    const closeMenu = () => {
        sidebar.classList.remove('open');
        overlay.classList.add('hidden');
    };

    document.getElementById('menu-toggle-btn').onclick = openMenu;
    document.getElementById('sidebar-close-btn').onclick = closeMenu;
    overlay.onclick = closeMenu;

    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', closeMenu);
    });
}

// ==================== WINDOW MODAL MANAGERS ====================
function openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

// Helper to format values as selected currency
function formatVal(amount) {
    const currencyStr = currentUser ? currentUser.currency : 'USD';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyStr
    }).format(amount);
}

// ==================== CORE SYNCHRONIZER ====================
async function syncAllData() {
    if (!currentUser) return;

    showLoading(true);
    try {
        try {
            await pb.collection('VRTPOCKET_LOGIN_DATABASE').authRefresh();
            currentUser = pb.authStore.model;
        } catch (authErr) {
            console.error("Auth refresh failed:", authErr);
        }

        const userId = currentUser.id;

        // Fetch Invoices
        const invoices = await pb.collection('VRTPOCKET_INVOICE_DATABASE').getFullList({
            filter: `user = "${userId}"`,
            sort: '-issue_date'
        }).catch(() => []);

        appData.invoices = invoices;

        // Fetch Reminders
        const reminders = await pb.collection('VRTPOCKET_REMINDER_DATABASE').getFullList({
            filter: `user = "${userId}"`,
            sort: 'next_due_date'
        }).catch(() => []);

        appData.reminders = reminders;

        // Fetch initial Reminders Logs
        let reminderLogs = await pb.collection('VRTPOCKET_REMINDER_LOG_DATABASE').getFullList({
            filter: `user = "${userId}"`,
            sort: '-due_date'
        }).catch(() => []);
        appData.reminderLogs = reminderLogs;

        // Process reminder logs auto-generation
        await scanAndGenerateReminderLogs();

        // Re-fetch Reminders Logs to include newly generated ones
        reminderLogs = await pb.collection('VRTPOCKET_REMINDER_LOG_DATABASE').getFullList({
            filter: `user = "${userId}"`,
            sort: '-due_date'
        }).catch(() => []);
        appData.reminderLogs = reminderLogs;

        renderDashboard();
        renderInvoices();
        renderReminders();
        renderRemindersDashboard();
        renderRemindersLogs();
        syncProfileFields();

    } catch (err) {
        console.error(err);
        showToast('Database synchronization error. Verify pocketbase columns.', 'error');
    } finally {
        showLoading(false);
    }
}

// Sync profile settings values to profile fields
function syncProfileFields() {
    if (!currentUser) return;

    document.getElementById('profile-currency').value = currentUser.currency || 'USD';
    document.getElementById('profile-company-name').value = currentUser.company_name || '';
    document.getElementById('profile-company-email').value = currentUser.company_email || '';
    document.getElementById('profile-company-phone').value = currentUser.company_phone || '';
    document.getElementById('profile-company-address').value = currentUser.company_address || '';
    document.getElementById('profile-bank-details').value = currentUser.bank_details || '';
    document.getElementById('profile-invoice-notes-terms').value = currentUser.invoice_notes_terms || '';

    if (currentUser.company_logo) {
        document.getElementById('profile-logo-preview').src = pb.files.getUrl(currentUser, currentUser.company_logo);
    } else {
        document.getElementById('profile-logo-preview').src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%236366f1' d='M12 2L2 22h20L12 2z'/%3E%3C/svg%3E";
    }
}

// ==================== TRANSACTION DELETE INVOICE HELPER ====================
async function deleteTransactionRecord(id, collectionName) {
    if (!confirm('Are you absolutely sure you want to delete this record?')) return;
    showLoading(true);
    try {
        await pb.collection(collectionName).delete(id);
        showToast('Record deleted.', 'info');
        syncAllData();
    } catch (error) {
        console.error(error);
        showToast('Deletion failed.', 'error');
    } finally {
        showLoading(false);
    }
}

// ==================== RECURRING REMINDERS SUITE ====================
function calculateNextDueDate(startDateStr, frequency) {
    if (!startDateStr) return null;
    const start = new Date(startDateStr);
    if (isNaN(start.getTime())) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Date comparison only
    
    const next = new Date(start);
    if (next >= today) {
        return next.toISOString();
    }
    
    while (next < today) {
        if (frequency.toLowerCase() === 'weekly') {
            next.setDate(next.getDate() + 7);
        } else if (frequency.toLowerCase() === 'monthly') {
            next.setMonth(next.getMonth() + 1);
        } else if (frequency.toLowerCase() === 'yearly') {
            next.setFullYear(next.getFullYear() + 1);
        } else {
            break;
        }
    }
    return next.toISOString();
}

function switchSubTab(subTabId) {
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        if (btn.getAttribute('data-subtab') === subTabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    document.querySelectorAll('.sub-tab-pane').forEach(pane => {
        if (pane.id === subTabId) {
            pane.classList.remove('hidden');
        } else {
            pane.classList.add('hidden');
        }
    });

    // Re-render subtab specific data
    if (subTabId === 'reminders-sub-log') {
        renderRemindersLogs();
    } else if (subTabId === 'reminders-sub-dashboard') {
        renderRemindersDashboard();
    }
}

async function scanAndGenerateReminderLogs() {
    if (!currentUser) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const logsToCreate = [];

    appData.reminders.forEach(r => {
        if (!r.next_due_date) return;
        const dueDate = new Date(r.next_due_date);
        dueDate.setHours(0, 0, 0, 0);

        // Parse interval
        let intervalDays = 0;
        if (r.remind_interval === '3 days before') {
            intervalDays = 3;
        } else if (r.remind_interval === '7 days before') {
            intervalDays = 7;
        }

        // Calculate trigger date: due_date - intervalDays
        const triggerDate = new Date(dueDate);
        triggerDate.setDate(triggerDate.getDate() - intervalDays);
        triggerDate.setHours(0, 0, 0, 0);

        // If today is >= triggerDate, we check if we need to log it
        if (today >= triggerDate) {
            // Check if log already exists for this reminder and due date
            const logExists = appData.reminderLogs.some(l => 
                l.reminder === r.id && 
                new Date(l.due_date).toDateString() === dueDate.toDateString()
            );

            if (!logExists) {
                logsToCreate.push({
                    user: currentUser.id,
                    reminder: r.id,
                    title: r.title,
                    type: r.type,
                    value: r.value,
                    payment_type: r.payment_type,
                    category: r.category,
                    due_date: r.next_due_date,
                    status: 'Pending',
                    notes: r.notes || ''
                });
            }
        }
    });

    if (logsToCreate.length > 0) {
        // Create logs in PocketBase
        const promises = logsToCreate.map(logData => 
            pb.collection('VRTPOCKET_REMINDER_LOG_DATABASE').create(logData)
        );
        try {
            await Promise.all(promises);
            console.log(`Auto-generated ${logsToCreate.length} reminder occurrences logs.`);
        } catch (err) {
            console.error("Failed to auto-generate logs:", err);
        }
    }
}

async function changeReminderLogStatus(logId, newStatus) {
    showLoading(true);
    try {
        const log = await pb.collection('VRTPOCKET_REMINDER_LOG_DATABASE').getOne(logId);
        await pb.collection('VRTPOCKET_REMINDER_LOG_DATABASE').update(logId, { status: newStatus });
        
        // If marked as Paid, advance the parent reminder next due date
        if (newStatus === 'Paid' && log.reminder) {
            try {
                const r = await pb.collection('VRTPOCKET_REMINDER_DATABASE').getOne(log.reminder);
                const nextDate = new Date(r.next_due_date);
                if (r.frequency.toLowerCase() === 'weekly') {
                    nextDate.setDate(nextDate.getDate() + 7);
                } else if (r.frequency.toLowerCase() === 'monthly') {
                    nextDate.setMonth(nextDate.getMonth() + 1);
                } else if (r.frequency.toLowerCase() === 'yearly') {
                    nextDate.setFullYear(nextDate.getFullYear() + 1);
                }
                
                await pb.collection('VRTPOCKET_REMINDER_DATABASE').update(r.id, {
                    next_due_date: nextDate.toISOString()
                });
                showToast(`Status updated to Paid. Recurring schedule advanced to ${formatDateToDMY(nextDate)}.`, 'success');
            } catch (pErr) {
                console.error("Parent reminder update failed:", pErr);
                showToast('Status updated, but failed to advance recurring schedule.', 'warning');
            }
        } else {
            showToast(`Log status updated to ${newStatus}.`, 'success');
        }
        
        syncAllData();
    } catch (err) {
        console.error(err);
        showToast('Failed to update status.', 'error');
    } finally {
        showLoading(false);
    }
}

function renderReminders() {
    const incomeBody = document.getElementById('reminders-income-table-body');
    const expenseBody = document.getElementById('reminders-expense-table-body');
    
    if (!incomeBody || !expenseBody) return;
    
    incomeBody.innerHTML = '';
    expenseBody.innerHTML = '';
    
    const incomeReminders = appData.reminders.filter(r => r.type === 'Income');
    const expenseReminders = appData.reminders.filter(r => r.type === 'Expense');
    
    document.getElementById('reminders-income-summary').textContent = `${incomeReminders.length} Active`;
    document.getElementById('reminders-expense-summary').textContent = `${expenseReminders.length} Active`;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Render Income table
    if (incomeReminders.length === 0) {
        incomeBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No income reminders configured.</td></tr>`;
    } else {
        incomeReminders.forEach(r => {
            const valDisplay = r.payment_type === 'Percentage' ? `${r.value}%` : formatVal(r.value);
            const typeClass = r.payment_type === 'Percentage' ? 'type-percentage' : 'type-fixed';
            
            // Calculate Next Due Urgency
            const due = new Date(r.next_due_date);
            due.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
            
            let dueClass = 'due-future';
            if (diffDays <= 0) {
                dueClass = 'due-overdue';
            } else if (diffDays <= 7) {
                dueClass = 'due-soon';
            }
            
            incomeBody.innerHTML += `
                <tr>
                    <td><strong>${r.title}</strong></td>
                    <td><span class="text-muted text-sm">${r.category}</span></td>
                    <td><span class="badge ${typeClass}">${valDisplay}</span></td>
                    <td>${r.frequency}</td>
                    <td><span class="badge ${dueClass}">${formatDateToDMY(r.next_due_date)}</span></td>
                    <td>
                        <div class="reminder-actions">
                            <button type="button" class="tbl-btn tbl-btn-edit" onclick="editReminderRecord('${r.id}')" title="Edit"><i class="fa-regular fa-pen-to-square"></i></button>
                            <button type="button" class="tbl-btn tbl-btn-delete" onclick="deleteTransactionRecord('${r.id}', 'VRTPOCKET_REMINDER_DATABASE')" title="Delete"><i class="fa-regular fa-trash-can"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }
    
    // Render Expense table
    if (expenseReminders.length === 0) {
        expenseBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No expense reminders configured.</td></tr>`;
    } else {
        expenseReminders.forEach(r => {
            const valDisplay = r.payment_type === 'Percentage' ? `${r.value}%` : formatVal(r.value);
            const typeClass = r.payment_type === 'Percentage' ? 'type-percentage' : 'type-fixed';
            
            // Calculate Next Due Urgency
            const due = new Date(r.next_due_date);
            due.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
            
            let dueClass = 'due-future';
            if (diffDays <= 0) {
                dueClass = 'due-overdue';
            } else if (diffDays <= 7) {
                dueClass = 'due-soon';
            }
            
            expenseBody.innerHTML += `
                <tr>
                    <td><strong>${r.title}</strong></td>
                    <td><span class="text-muted text-sm">${r.category}</span></td>
                    <td><span class="badge ${typeClass}">${valDisplay}</span></td>
                    <td>${r.frequency}</td>
                    <td><span class="badge ${dueClass}">${formatDateToDMY(r.next_due_date)}</span></td>
                    <td>
                        <div class="reminder-actions">
                            <button type="button" class="tbl-btn tbl-btn-edit" onclick="editReminderRecord('${r.id}')" title="Edit"><i class="fa-regular fa-pen-to-square"></i></button>
                            <button type="button" class="tbl-btn tbl-btn-delete" onclick="deleteTransactionRecord('${r.id}', 'VRTPOCKET_REMINDER_DATABASE')" title="Delete"><i class="fa-regular fa-trash-can"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }
}

function renderRemindersLogs() {
    const tableBody = document.getElementById('reminders-log-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    
    document.getElementById('reminders-log-summary').textContent = `${appData.reminderLogs.length} Log${appData.reminderLogs.length !== 1 ? 's' : ''}`;
    
    if (appData.reminderLogs.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No log occurrences generated. Check active reminders and trigger dates.</td></tr>`;
        return;
    }
    
    appData.reminderLogs.forEach(l => {
        const valDisplay = l.payment_type === 'Percentage' ? `${l.value}%` : formatVal(l.value);
        const typeBadgeClass = l.type === 'Income' ? 'status-paid' : 'status-overdue';
        const paymentTypeBadge = l.payment_type === 'Percentage' ? 'type-percentage' : 'type-fixed';
        
        let statusBadgeClass = 'status-pending';
        if (l.status === 'Paid') statusBadgeClass = 'status-paid';
        else if (l.status === 'Noticed') statusBadgeClass = 'status-noticed';
        
        let actionButtons = '';
        if (l.status === 'Pending') {
            actionButtons = `
                <button type="button" class="btn btn-xs btn-outline text-emerald" style="padding: 0.2rem 0.5rem;" onclick="changeReminderLogStatus('${l.id}', 'Paid')" title="Mark Paid"><i class="fa-solid fa-check"></i> Paid</button>
                <button type="button" class="btn btn-xs btn-outline text-accent" style="padding: 0.2rem 0.5rem;" onclick="changeReminderLogStatus('${l.id}', 'Noticed')" title="Mark Noticed"><i class="fa-solid fa-eye"></i> Notice</button>
            `;
        } else if (l.status === 'Noticed') {
            actionButtons = `
                <button type="button" class="btn btn-xs btn-outline text-emerald" style="padding: 0.2rem 0.5rem;" onclick="changeReminderLogStatus('${l.id}', 'Paid')" title="Mark Paid"><i class="fa-solid fa-check"></i> Paid</button>
                <button type="button" class="btn btn-xs btn-outline text-muted" style="padding: 0.2rem 0.5rem;" onclick="changeReminderLogStatus('${l.id}', 'Pending')" title="Mark Pending"><i class="fa-solid fa-undo"></i> Reset</button>
            `;
        } else if (l.status === 'Paid') {
            actionButtons = `
                <span class="text-emerald" style="font-size: 0.85rem; font-weight:600;"><i class="fa-solid fa-circle-check"></i> Resolved</span>
                <button type="button" class="tbl-btn tbl-btn-edit" style="margin-left:0.5rem; display:inline-flex;" onclick="changeReminderLogStatus('${l.id}', 'Pending')" title="Revert to Pending"><i class="fa-solid fa-rotate-left"></i></button>
            `;
        }
        
        actionButtons += `
            <button type="button" class="tbl-btn tbl-btn-delete" style="margin-left: 0.25rem;" onclick="deleteTransactionRecord('${l.id}', 'VRTPOCKET_REMINDER_LOG_DATABASE')" title="Delete Log"><i class="fa-regular fa-trash-can"></i></button>
        `;
        
        tableBody.innerHTML += `
            <tr>
                <td><strong>${l.title}</strong></td>
                <td><span class="badge ${typeBadgeClass}">${l.type}</span></td>
                <td><span class="text-muted text-sm">${l.category || 'General'}</span></td>
                <td><span class="badge ${paymentTypeBadge}">${valDisplay}</span></td>
                <td>${formatDateToDMY(l.due_date)}</td>
                <td><span class="badge ${statusBadgeClass}">${l.status}</span></td>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.25rem;">
                        ${actionButtons}
                    </div>
                </td>
            </tr>
        `;
    });
}

function renderRemindersDashboard() {
    let overdueCount = 0, overdueAmount = 0;
    let upcomingExpenseCount = 0, upcomingExpenseAmount = 0;
    let upcomingIncomeCount = 0, upcomingIncomeAmount = 0;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    appData.reminderLogs.forEach(l => {
        if (l.status === 'Paid') return;
        const amt = parseFloat(l.value) || 0;
        const due = new Date(l.due_date);
        due.setHours(0, 0, 0, 0);
        
        if (due < today) {
            overdueCount++;
            overdueAmount += amt;
        }
        
        if (l.type === 'Expense') {
            upcomingExpenseCount++;
            upcomingExpenseAmount += amt;
        } else if (l.type === 'Income') {
            upcomingIncomeCount++;
            upcomingIncomeAmount += amt;
        }
    });
    
    document.getElementById('reminders-dashboard-overdue-count').textContent = overdueCount;
    document.getElementById('reminders-dashboard-overdue-amount').textContent = `Value: ${formatVal(overdueAmount)}`;
    
    document.getElementById('reminders-dashboard-expense-amount').textContent = formatVal(upcomingExpenseAmount);
    document.getElementById('reminders-dashboard-expense-count').textContent = `${upcomingExpenseCount} Pending log${upcomingExpenseCount !== 1 ? 's' : ''}`;
    
    document.getElementById('reminders-dashboard-income-amount').textContent = formatVal(upcomingIncomeAmount);
    document.getElementById('reminders-dashboard-income-count').textContent = `${upcomingIncomeCount} Pending log${upcomingIncomeCount !== 1 ? 's' : ''}`;

    // Category cost summation (Expense reminders)
    const categories = {};
    appData.reminders.forEach(r => {
        if (r.type !== 'Expense') return;
        const cat = r.category || 'Other';
        const val = parseFloat(r.value) || 0;
        categories[cat] = (categories[cat] || 0) + val;
    });
    
    const catLabels = Object.keys(categories);
    const catData = Object.values(categories);

    // Log statuses count
    let pendingLogs = 0, noticedLogs = 0, paidLogs = 0;
    appData.reminderLogs.forEach(l => {
        if (l.status === 'Pending') pendingLogs++;
        else if (l.status === 'Noticed') noticedLogs++;
        else if (l.status === 'Paid') paidLogs++;
    });

    // Destroy old charts
    if (reminderCharts.categoryPie) {
        reminderCharts.categoryPie.destroy();
        reminderCharts.categoryPie = null;
    }
    if (reminderCharts.statusDoughnut) {
        reminderCharts.statusDoughnut.destroy();
        reminderCharts.statusDoughnut = null;
    }

    const ctxCat = document.getElementById('chart-reminder-category');
    const ctxStatus = document.getElementById('chart-reminder-status');
    
    if (!ctxCat || !ctxStatus) return;

    const isLight = document.body.getAttribute('data-theme') === 'light';
    const textColor = isLight ? '#475569' : '#94a3b8';

    reminderCharts.categoryPie = new Chart(ctxCat.getContext('2d'), {
        type: 'pie',
        data: {
            labels: catLabels.length > 0 ? catLabels : ['No Expenses Configured'],
            datasets: [{
                data: catData.length > 0 ? catData : [1],
                backgroundColor: catLabels.length > 0 ? 
                    ['#6366f1', '#d946ef', '#f59e0b', '#10b981', '#f43f5e', '#8b5cf6', '#0ea5e9'] : 
                    ['#64748b'],
                borderWidth: isLight ? 2 : 0,
                borderColor: isLight ? '#ffffff' : 'transparent'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: textColor,
                        boxWidth: 12,
                        font: { family: 'Plus Jakarta Sans', size: 11 }
                    }
                }
            }
        }
    });

    reminderCharts.statusDoughnut = new Chart(ctxStatus.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Pending', 'Noticed', 'Paid'],
            datasets: [{
                data: [pendingLogs, noticedLogs, paidLogs],
                backgroundColor: ['#f59e0b', '#0ea5e9', '#10b981'],
                borderWidth: isLight ? 2 : 0,
                borderColor: isLight ? '#ffffff' : 'transparent'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: textColor,
                        boxWidth: 12,
                        font: { family: 'Plus Jakarta Sans', size: 11 }
                    }
                }
            }
        }
    });
}

function openReminderCreator() {
    const form = document.getElementById('reminder-form');
    if (form) form.reset();
    document.getElementById('reminder-record-id').value = '';
    document.getElementById('reminder-modal-title').textContent = 'Configure Recurring Reminder';
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('reminder-start-date').value = today;
    
    document.getElementById('reminder-remind-interval').value = 'Immediately';
    
    const label = document.getElementById('reminder-value-label');
    if (label) {
        label.innerHTML = '<i class="fa-solid fa-dollar-sign"></i> Amount Value *';
    }
    
    openModal('reminder-modal');
}

async function saveReminderRecord(e) {
    e.preventDefault();
    showLoading(true);
    
    const recordId = document.getElementById('reminder-record-id').value;
    const type = document.getElementById('reminder-type').value;
    const category = document.getElementById('reminder-category').value;
    const title = document.getElementById('reminder-title').value;
    const paymentType = document.getElementById('reminder-payment-type').value;
    const value = parseFloat(document.getElementById('reminder-value').value) || 0;
    const startDate = document.getElementById('reminder-start-date').value;
    const frequency = document.getElementById('reminder-frequency').value;
    const remindInterval = document.getElementById('reminder-remind-interval').value;
    const notes = document.getElementById('reminder-notes').value;
    
    const nextDueDate = calculateNextDueDate(startDate, frequency);
    
    const data = {
        user: currentUser.id,
        type,
        category,
        title,
        payment_type: paymentType,
        value,
        start_date: new Date(startDate).toISOString(),
        frequency,
        next_due_date: nextDueDate,
        remind_interval: remindInterval,
        notes
    };
    
    try {
        if (recordId) {
            await pb.collection('VRTPOCKET_REMINDER_DATABASE').update(recordId, data);
            showToast('Recurring reminder updated.', 'success');
        } else {
            await pb.collection('VRTPOCKET_REMINDER_DATABASE').create(data);
            showToast('New recurring reminder set up.', 'success');
        }
        
        closeModal('reminder-modal');
        syncAllData();
    } catch (error) {
        console.error(error);
        showToast('Saving reminder failed. Confirm PocketBase schema.', 'error');
    } finally {
        showLoading(false);
    }
}

async function editReminderRecord(id) {
    showLoading(true);
    try {
        const r = await pb.collection('VRTPOCKET_REMINDER_DATABASE').getOne(id);
        
        document.getElementById('reminder-record-id').value = r.id;
        document.getElementById('reminder-type').value = r.type;
        document.getElementById('reminder-category').value = r.category;
        document.getElementById('reminder-title').value = r.title;
        document.getElementById('reminder-payment-type').value = r.payment_type;
        document.getElementById('reminder-value').value = r.value;
        
        if (r.start_date) {
            document.getElementById('reminder-start-date').value = r.start_date.split('T')[0].split(' ')[0];
        }
        
        document.getElementById('reminder-frequency').value = r.frequency;
        document.getElementById('reminder-remind-interval').value = r.remind_interval || 'Immediately';
        document.getElementById('reminder-notes').value = r.notes || '';
        
        const label = document.getElementById('reminder-value-label');
        if (label) {
            if (r.payment_type === 'Percentage') {
                label.innerHTML = '<i class="fa-solid fa-percent"></i> Percentage Value *';
            } else {
                label.innerHTML = '<i class="fa-solid fa-dollar-sign"></i> Amount Value *';
            }
        }
        
        document.getElementById('reminder-modal-title').textContent = 'Modify Recurring Reminder';
        openModal('reminder-modal');
    } catch (error) {
        console.error(error);
        showToast('Failed to load reminder details.', 'error');
    } finally {
        showLoading(false);
    }
}

// ==================== FINANCIAL DASHBOARD MANAGEMENT ====================
function renderDashboard() {
    if (!currentUser) return;

    let draftCount = 0, draftAmount = 0;
    let sentCount = 0, sentAmount = 0;
    let paidCount = 0, paidAmount = 0;
    let overdueCount = 0, overdueAmount = 0;

    appData.invoices.forEach(inv => {
        const amt = parseFloat(inv.total_amount) || 0;
        const status = (inv.status || 'Draft').toLowerCase();
        if (status === 'draft') {
            draftCount++;
            draftAmount += amt;
        } else if (status === 'sent') {
            sentCount++;
            sentAmount += amt;
        } else if (status === 'paid') {
            paidCount++;
            paidAmount += amt;
        } else if (status === 'overdue') {
            overdueCount++;
            overdueAmount += amt;
        }
    });

    const pendingAmount = sentAmount + overdueAmount;
    const pendingCount = sentCount + overdueCount;

    // Update Text Elements
    document.getElementById('dashboard-paid-amount').textContent = formatVal(paidAmount);
    document.getElementById('dashboard-paid-count').textContent = `${paidCount} Invoice${paidCount !== 1 ? 's' : ''}`;
    
    document.getElementById('dashboard-pending-amount').textContent = formatVal(pendingAmount);
    document.getElementById('dashboard-pending-count').textContent = `${pendingCount} Invoice${pendingCount !== 1 ? 's' : ''} (Sent & Overdue)`;
    
    document.getElementById('dashboard-draft-amount').textContent = formatVal(draftAmount);
    document.getElementById('dashboard-draft-count').textContent = `${draftCount} Invoice${draftCount !== 1 ? 's' : ''}`;
    
    document.getElementById('dashboard-overdue-amount').textContent = formatVal(overdueAmount);
    document.getElementById('dashboard-overdue-count').textContent = `${overdueCount} Invoice${overdueCount !== 1 ? 's' : ''}`;

    // Chart.js Theme Adaptation Options
    const isLight = document.body.getAttribute('data-theme') === 'light';
    const textColor = isLight ? '#475569' : '#94a3b8';
    const gridColor = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.08)';

    // Cleanup previous chart instances to prevent canvas reused error
    if (dashboardCharts.statusPie) {
        dashboardCharts.statusPie.destroy();
        dashboardCharts.statusPie = null;
    }
    if (dashboardCharts.amountBar) {
        dashboardCharts.amountBar.destroy();
        dashboardCharts.amountBar = null;
    }
    if (dashboardCharts.monthlyLine) {
        dashboardCharts.monthlyLine.destroy();
        dashboardCharts.monthlyLine = null;
    }

    // Check if we have dashboard DOM nodes ready before initializing
    const pieCanvas = document.getElementById('chart-status-pie');
    const barCanvas = document.getElementById('chart-status-bar');
    const lineCanvas = document.getElementById('chart-monthly-trend');

    if (!pieCanvas || !barCanvas || !lineCanvas) return;

    // 1. Circle Chart (Doughnut)
    dashboardCharts.statusPie = new Chart(pieCanvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Draft', 'Sent', 'Paid', 'Overdue'],
            datasets: [{
                data: [draftCount, sentCount, paidCount, overdueCount],
                backgroundColor: ['#8b5cf6', '#f59e0b', '#10b981', '#f43f5e'],
                borderWidth: isLight ? 2 : 0,
                borderColor: isLight ? '#ffffff' : 'transparent'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: textColor,
                        boxWidth: 12,
                        padding: 15,
                        font: { family: 'Plus Jakarta Sans', size: 12 }
                    }
                }
            }
        }
    });

    // 2. Bar Chart
    dashboardCharts.amountBar = new Chart(barCanvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Draft', 'Sent', 'Paid', 'Overdue'],
            datasets: [{
                label: 'Total Invoiced amount',
                data: [draftAmount, sentAmount, paidAmount, overdueAmount],
                backgroundColor: [
                    'rgba(139, 92, 246, 0.8)',
                    'rgba(245, 158, 11, 0.8)',
                    'rgba(16, 185, 129, 0.8)',
                    'rgba(244, 63, 94, 0.8)'
                ],
                borderRadius: 6,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: { color: textColor, font: { family: 'Plus Jakarta Sans' } },
                    grid: { display: false }
                },
                y: {
                    ticks: { color: textColor, font: { family: 'Plus Jakarta Sans' } },
                    grid: { color: gridColor }
                }
            }
        }
    });

    // 3. Line Chart - Monthly Invoicing vs Collections Trend
    const monthlyData = {};
    appData.invoices.forEach(inv => {
        if (!inv.issue_date) return;
        const date = new Date(inv.issue_date);
        if (isNaN(date.getTime())) return;
        
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const key = `${yyyy}-${mm}`;
        
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const label = `${monthNames[date.getMonth()]} ${yyyy}`;
        
        if (!monthlyData[key]) {
            monthlyData[key] = { label, invoiced: 0, collected: 0 };
        }
        
        const amt = parseFloat(inv.total_amount) || 0;
        monthlyData[key].invoiced += amt;
        if ((inv.status || '').toLowerCase() === 'paid') {
            monthlyData[key].collected += amt;
        }
    });

    const sortedKeys = Object.keys(monthlyData).sort();
    const labels = [];
    const invoicedData = [];
    const collectedData = [];

    if (sortedKeys.length === 0) {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const today = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            labels.push(`${monthNames[d.getMonth()]} ${d.getFullYear()}`);
            invoicedData.push(0);
            collectedData.push(0);
        }
    } else {
        sortedKeys.forEach(k => {
            labels.push(monthlyData[k].label);
            invoicedData.push(monthlyData[k].invoiced);
            collectedData.push(monthlyData[k].collected);
        });
    }

    dashboardCharts.monthlyLine = new Chart(lineCanvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Total Invoiced',
                    data: invoicedData,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.08)',
                    fill: true,
                    tension: 0.35,
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: '#6366f1',
                    pointHoverRadius: 6
                },
                {
                    label: 'Paid (Collected)',
                    data: collectedData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    fill: true,
                    tension: 0.35,
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: '#10b981',
                    pointHoverRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 12 } }
                }
            },
            scales: {
                x: {
                    ticks: { color: textColor, font: { family: 'Plus Jakarta Sans' } },
                    grid: { display: false }
                },
                y: {
                    ticks: { color: textColor, font: { family: 'Plus Jakarta Sans' } },
                    grid: { color: gridColor }
                }
            }
        }
    });
}

// ==================== INVOICE MANAGEMENT SUITE ====================
function renderInvoices() {
    const tableBody = document.getElementById('invoices-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (appData.invoices.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No invoices logged.</td></tr>`;
    } else {
        appData.invoices.forEach(inv => {
            const statusClass = `status-${inv.status.toLowerCase()}`;
            tableBody.innerHTML += `
                <tr>
                    <td><strong>${inv.invoice_number}</strong></td>
                    <td>${inv.client_name}</td>
                    <td>${formatDateToDMY(inv.issue_date)}</td>
                    <td>${formatDateToDMY(inv.due_date)}</td>
                    <td class="font-bold">${formatVal(inv.total_amount)}</td>
                    <td><span class="badge ${statusClass}">${inv.status}</span></td>
                    <td>
                        <div class="tbl-actions">
                            <button class="tbl-btn tbl-btn-view" onclick="viewInvoicePaper('${inv.id}')" title="Preview/Print"><i class="fa-regular fa-file-pdf"></i></button>
                            <button class="tbl-btn tbl-btn-edit" onclick="editInvoiceRecord('${inv.id}')" title="Edit"><i class="fa-regular fa-pen-to-square"></i></button>
                            <button class="tbl-btn tbl-btn-delete" onclick="deleteTransactionRecord('${inv.id}', 'VRTPOCKET_INVOICE_DATABASE')" title="Delete"><i class="fa-regular fa-trash-can"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }
}

function openInvoiceCreator() {
    document.getElementById('invoice-form').reset();
    document.getElementById('invoice-record-id').value = '';
    document.getElementById('invoice-items-rows-container').innerHTML = '';
    document.getElementById('invoice-payment-details').value = currentUser.bank_details || '';
    document.getElementById('invoice-notes').value = currentUser.invoice_notes_terms || '';
    document.getElementById('invoice-builder-title').textContent = 'Create Dynamic Invoice';

    const today = new Date();
    const due = new Date();
    due.setDate(today.getDate() + 30);

    document.getElementById('invoice-issue-date').value = today.toISOString().split('T')[0];
    document.getElementById('invoice-due-date').value = due.toISOString().split('T')[0];

    const invCount = appData.invoices.length + 1;
    document.getElementById('invoice-number').value = `INV-${today.getFullYear()}-${String(invCount).padStart(3, '0')}`;

    addInvoiceItemRow();

    document.getElementById('invoice-list-container').classList.add('hidden');
    document.getElementById('invoice-builder-container').classList.remove('hidden');
}

function closeInvoiceCreator() {
    document.getElementById('invoice-list-container').classList.remove('hidden');
    document.getElementById('invoice-builder-container').classList.add('hidden');
}

function addInvoiceItemRow(desc = '', qty = 1, price = 0, subItems = []) {
    const container = document.getElementById('invoice-items-rows-container');
    if (!container) return;
    const blockId = 'block-' + Date.now() + Math.random().toString(36).substr(2, 5);
    const total = qty * price;

    const blockHtml = `
        <div class="invoice-item-block" id="${blockId}">
            <div class="invoice-item-row-header">
                <input type="text" class="item-desc" required placeholder="Consulting Services, Widget development" value="${desc}">
                <input type="number" class="item-qty" min="1" required value="${qty}">
                <input type="number" class="item-price" min="0" step="0.01" required value="${price}">
                <span class="item-total-cell">${formatVal(total)}</span>
                <button type="button" class="tbl-btn tbl-btn-delete remove-item-block" onclick="removeInvoiceItemBlock('${blockId}')" title="Delete Item Group"><i class="fa-regular fa-trash-can"></i></button>
            </div>
            
            <div style="display: flex; align-items: center; gap: 0.5rem; padding-left: 1.5rem;">
                <button type="button" class="btn btn-xs btn-outline btn-add-sub-item" onclick="addInvoiceSubItemRow('${blockId}')" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;"><i class="fa-solid fa-plus"></i> Add Sub-Description</button>
            </div>
            
            <div class="sub-items-container" style="display: flex; flex-direction: column; gap: 0.35rem; padding-left: 1.5rem;">
                <!-- Sub items will be dynamically appended here -->
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', blockHtml);

    const block = document.getElementById(blockId);
    block.querySelector('.item-qty').addEventListener('input', () => recalculateRowTotal(blockId));
    block.querySelector('.item-price').addEventListener('input', () => recalculateRowTotal(blockId));

    if (Array.isArray(subItems)) {
        subItems.forEach(sub => {
            addInvoiceSubItemRow(blockId, sub.desc, sub.qty, sub.price, sub.hasPrice);
        });
    }
}

function removeInvoiceItemBlock(blockId) {
    const block = document.getElementById(blockId);
    if (block) {
        block.remove();
        calculateInvoiceTotals();
    }
}

function addInvoiceSubItemRow(blockId, desc = '', qty = 1, price = 0, hasPrice = true) {
    const block = document.getElementById(blockId);
    if (!block) return;
    const subContainer = block.querySelector('.sub-items-container');
    const subRowId = 'subrow-' + Date.now() + Math.random().toString(36).substr(2, 5);
    const subTotal = qty * price;

    const subRowHtml = `
        <div class="invoice-sub-item-row" id="${subRowId}">
            <i class="fa-solid fa-turn-up" style="transform: rotate(90deg); margin-right: 0.25rem; color: var(--text-muted); font-size: 0.75rem;"></i>
            <input type="text" class="sub-item-desc" required placeholder="Sub-description detail..." value="${desc}" style="flex-grow: 1; font-size: 0.85rem; padding: 0.2rem 0.4rem;">
            
            <div class="sub-item-price-fields ${hasPrice ? '' : 'hidden'}" style="display: flex; gap: 0.5rem; align-items: center;">
                <input type="number" class="sub-item-qty" min="1" required value="${qty}" style="width: 60px; font-size: 0.85rem; padding: 0.2rem 0.4rem;">
                <input type="number" class="sub-item-price" min="0" step="0.01" required value="${price}" style="width: 80px; font-size: 0.85rem; padding: 0.2rem 0.4rem;">
                <span class="sub-item-total-cell" style="width: 70px; text-align: right; font-weight: 500; font-size: 0.85rem; padding: 0 0.4rem;">${formatVal(subTotal)}</span>
            </div>
 
            <div class="sub-item-actions" style="display: flex; gap: 0.25rem; align-items: center;">
                <button type="button" class="btn btn-xs btn-outline toggle-sub-pricing ${hasPrice ? 'btn-danger-outline' : ''}" onclick="toggleSubItemPricing('${subRowId}')" style="padding: 0.2rem 0.4rem; font-size: 0.7rem;">
                    ${hasPrice ? '<i class="fa-solid fa-eraser"></i> Remove Price' : '<i class="fa-solid fa-dollar-sign"></i> Add Price'}
                </button>
                <button type="button" class="tbl-btn tbl-btn-delete remove-sub-item-row" onclick="removeInvoiceSubItemRow('${subRowId}')" title="Delete Sub-description" style="width: 24px; height: 24px;"><i class="fa-regular fa-trash-can" style="font-size: 0.75rem;"></i></button>
            </div>
        </div>
    `;
    subContainer.insertAdjacentHTML('beforeend', subRowHtml);

    const subRow = document.getElementById(subRowId);
    subRow.querySelector('.sub-item-qty').addEventListener('input', () => recalculateRowTotal(blockId));
    subRow.querySelector('.sub-item-price').addEventListener('input', () => recalculateRowTotal(blockId));

    recalculateRowTotal(blockId);
}

function removeInvoiceSubItemRow(subRowId) {
    const subRow = document.getElementById(subRowId);
    if (subRow) {
        const blockId = subRow.closest('.invoice-item-block').id;
        subRow.remove();
        recalculateRowTotal(blockId);
    }
}

function toggleSubItemPricing(subRowId) {
    const subRow = document.getElementById(subRowId);
    if (subRow) {
        const priceFields = subRow.querySelector('.sub-item-price-fields');
        const btn = subRow.querySelector('.toggle-sub-pricing');
        const isHidden = priceFields.classList.contains('hidden');

        if (isHidden) {
            priceFields.classList.remove('hidden');
            btn.innerHTML = '<i class="fa-solid fa-eraser"></i> Remove Price';
            btn.classList.add('btn-danger-outline');
        } else {
            priceFields.classList.add('hidden');
            btn.innerHTML = '<i class="fa-solid fa-dollar-sign"></i> Add Price';
            btn.classList.remove('btn-danger-outline');
        }
        recalculateRowTotal(subRow.closest('.invoice-item-block').id);
    }
}

function recalculateRowTotal(blockId) {
    const block = document.getElementById(blockId);
    if (block) {
        const mainQty = parseFloat(block.querySelector('.item-qty').value) || 0;
        const mainPrice = parseFloat(block.querySelector('.item-price').value) || 0;
        let itemSubtotal = mainQty * mainPrice;

        block.querySelectorAll('.invoice-sub-item-row').forEach(subRow => {
            const priceFields = subRow.querySelector('.sub-item-price-fields');
            const totalCell = subRow.querySelector('.sub-item-total-cell');

            if (priceFields && !priceFields.classList.contains('hidden')) {
                const subQty = parseFloat(subRow.querySelector('.sub-item-qty').value) || 0;
                const subPrice = parseFloat(subRow.querySelector('.sub-item-price').value) || 0;
                const subTotal = subQty * subPrice;
                totalCell.textContent = formatVal(subTotal);
            } else {
                totalCell.textContent = formatVal(0);
            }
        });

        block.querySelector('.item-total-cell').textContent = formatVal(itemSubtotal);
        calculateInvoiceTotals();
    }
}

function calculateInvoiceTotals() {
    let subtotal = 0;
    document.querySelectorAll('.invoice-item-block').forEach(block => {
        const qty = parseFloat(block.querySelector('.item-qty').value) || 0;
        const price = parseFloat(block.querySelector('.item-price').value) || 0;
        let blockSum = qty * price;

        block.querySelectorAll('.invoice-sub-item-row').forEach(subRow => {
            const priceFields = subRow.querySelector('.sub-item-price-fields');
            if (priceFields && !priceFields.classList.contains('hidden')) {
                const subQty = parseFloat(subRow.querySelector('.sub-item-qty').value) || 0;
                const subPrice = parseFloat(subRow.querySelector('.sub-item-price').value) || 0;
                blockSum += subQty * subPrice;
            }
        });
        subtotal += blockSum;
    });

    const taxRate = parseFloat(document.getElementById('invoice-tax').value) || 0;
    const discount = parseFloat(document.getElementById('invoice-discount').value) || 0;

    const taxAmount = subtotal * (taxRate / 100);
    const grandTotal = subtotal + taxAmount - discount;

    document.getElementById('invoice-summary-subtotal').textContent = formatVal(subtotal);
    document.getElementById('invoice-summary-tax').textContent = formatVal(taxAmount);
    document.getElementById('invoice-summary-discount').textContent = `-${formatVal(discount)}`;
    document.getElementById('invoice-summary-total').textContent = formatVal(grandTotal);
}

function getInvoiceItemsPayload() {
    const items = [];
    document.querySelectorAll('.invoice-item-block').forEach(block => {
        const desc = block.querySelector('.item-desc').value;
        const qty = parseFloat(block.querySelector('.item-qty').value) || 1;
        const price = parseFloat(block.querySelector('.item-price').value) || 0;

        const subItems = [];
        block.querySelectorAll('.invoice-sub-item-row').forEach(subRow => {
            const subDesc = subRow.querySelector('.sub-item-desc').value;
            const priceFields = subRow.querySelector('.sub-item-price-fields');
            const hasPrice = !priceFields.classList.contains('hidden');

            let subQty = 1;
            let subPrice = 0;
            if (hasPrice) {
                subQty = parseFloat(subRow.querySelector('.sub-item-qty').value) || 0;
                subPrice = parseFloat(subRow.querySelector('.sub-item-price').value) || 0;
            }

            subItems.push({
                desc: subDesc,
                hasPrice,
                qty: subQty,
                price: subPrice,
                total: hasPrice ? (subQty * subPrice) : 0
            });
        });

        const subTotalSum = subItems.reduce((acc, it) => acc + it.total, 0);
        const itemTotal = (qty * price) + subTotalSum;

        items.push({
            desc,
            qty,
            price,
            subItems,
            total: itemTotal
        });
    });
    return items;
}

// Save or Update Invoices
async function saveInvoiceRecord(e) {
    e.preventDefault();
    showLoading(true);

    const recordId = document.getElementById('invoice-record-id').value;
    const invoiceNumber = document.getElementById('invoice-number').value;
    const clientName = document.getElementById('invoice-client-name').value;
    const clientEmail = document.getElementById('invoice-client-email').value;
    const clientAddress = document.getElementById('invoice-client-address').value;
    const issueDate = new Date(document.getElementById('invoice-issue-date').value).toISOString();
    const dueDate = new Date(document.getElementById('invoice-due-date').value).toISOString();
    const status = document.getElementById('invoice-status').value;
    const taxRate = parseFloat(document.getElementById('invoice-tax').value) || 0;
    const discount = parseFloat(document.getElementById('invoice-discount').value) || 0;
    const paymentDetails = document.getElementById('invoice-payment-details').value;
    const items = getInvoiceItemsPayload();

    const notes = document.getElementById('invoice-notes').value;
    const combinedNotes = notes + "\n---PAYMENT-DETAILS---\n" + paymentDetails;

    const subtotal = items.reduce((acc, it) => acc + it.total, 0);
    const totalAmount = subtotal + (subtotal * (taxRate / 100)) - discount;

    const data = {
        user: currentUser.id,
        invoice_number: invoiceNumber,
        client_name: clientName,
        client_email: clientEmail,
        client_address: clientAddress,
        issue_date: issueDate,
        due_date: dueDate,
        status,
        items,
        tax_rate: taxRate,
        discount,
        total_amount: totalAmount,
        notes: combinedNotes,
        payment_details: paymentDetails
    };

    try {
        let savedRecord;
        if (recordId) {
            savedRecord = await pb.collection('VRTPOCKET_INVOICE_DATABASE').update(recordId, data);
            showToast('Invoice details saved.', 'success');
        } else {
            savedRecord = await pb.collection('VRTPOCKET_INVOICE_DATABASE').create(data);
            showToast('Invoice compiled into registry.', 'success');
        }

        closeInvoiceCreator();
        syncAllData();

        viewInvoicePaper(savedRecord.id);
    } catch (error) {
        console.error(error);
        showToast('Saving invoice failed. Confirm pocketbase column types.', 'error');
    } finally {
        showLoading(false);
    }
}

async function editInvoiceRecord(id) {
    showLoading(true);
    try {
        const inv = await pb.collection('VRTPOCKET_INVOICE_DATABASE').getOne(id);

        document.getElementById('invoice-record-id').value = inv.id;
        document.getElementById('invoice-number').value = inv.invoice_number;
        document.getElementById('invoice-client-name').value = inv.client_name;
        document.getElementById('invoice-client-email').value = inv.client_email || '';
        document.getElementById('invoice-client-address').value = inv.client_address || '';
        document.getElementById('invoice-issue-date').value = inv.issue_date.split(' ')[0];
        document.getElementById('invoice-due-date').value = inv.due_date.split(' ')[0];
        document.getElementById('invoice-status').value = inv.status;
        document.getElementById('invoice-tax').value = inv.tax_rate;
        document.getElementById('invoice-discount').value = inv.discount;
        let notesText = inv.notes || '';
        let paymentDetailsText = inv.payment_details || '';

        const delimiter = "\n---PAYMENT-DETAILS---\n";
        if (notesText.includes(delimiter)) {
            const parts = notesText.split(delimiter);
            notesText = parts[0] || '';
            paymentDetailsText = parts[1] || '';
        }

        document.getElementById('invoice-notes').value = notesText;
        document.getElementById('invoice-payment-details').value = paymentDetailsText || inv.payment_details || '';

        const container = document.getElementById('invoice-items-rows-container');
        container.innerHTML = '';

        const items = Array.isArray(inv.items) ? inv.items : [];
        if (items.length === 0) {
            addInvoiceItemRow();
        } else {
            items.forEach(it => {
                addInvoiceItemRow(it.desc, it.qty, it.price, it.subItems);
            });
        }

        calculateInvoiceTotals();

        document.getElementById('invoice-builder-title').textContent = 'Modify Invoice details';
        document.getElementById('invoice-list-container').classList.add('hidden');
        document.getElementById('invoice-builder-container').classList.remove('hidden');

    } catch (err) {
        console.error(err);
        showToast('Failed to load invoice.', 'error');
    } finally {
        showLoading(false);
    }
}

// Generate PDF / print layout for Invoice
async function viewInvoicePaper(id) {
    showLoading(true);
    try {
        const inv = await pb.collection('VRTPOCKET_INVOICE_DATABASE').getOne(id);

        document.getElementById('invoice-paper-company-name').textContent = currentUser.company_name || 'My Organization';
        document.getElementById('invoice-paper-company-address').textContent = currentUser.company_address || '';
        document.getElementById('invoice-paper-company-contact').textContent = `Tel: ${currentUser.company_phone || 'N/A'} | Email: ${currentUser.company_email || currentUser.email}`;

        const printLogo = document.getElementById('invoice-paper-logo');
        if (currentUser.company_logo) {
            printLogo.src = pb.files.getUrl(currentUser, currentUser.company_logo);
            printLogo.classList.remove('hidden');
        } else {
            printLogo.classList.add('hidden');
        }

        document.getElementById('invoice-paper-number').textContent = inv.invoice_number;
        document.getElementById('invoice-paper-issue-date').textContent = formatDateToDMY(inv.issue_date);
        document.getElementById('invoice-paper-due-date').textContent = formatDateToDMY(inv.due_date);

        const statusBadge = document.getElementById('invoice-paper-status');
        statusBadge.textContent = inv.status;
        statusBadge.className = `badge status-${inv.status.toLowerCase()}`;

        document.getElementById('invoice-paper-client-name').textContent = inv.client_name;
        document.getElementById('invoice-paper-client-address').textContent = inv.client_address || '';
        document.getElementById('invoice-paper-client-email').textContent = inv.client_email || '';

        const tableBody = document.getElementById('invoice-paper-items-list');
        tableBody.innerHTML = '';

        const items = Array.isArray(inv.items) ? inv.items : [];
        let subtotal = 0;

        items.forEach(it => {
            const displayTotal = it.qty * it.price;
            const subTotalSum = Array.isArray(it.subItems) ? it.subItems.reduce((acc, sub) => acc + (sub.total || 0), 0) : 0;
            const actualTotal = displayTotal + subTotalSum;
            subtotal += actualTotal;
            tableBody.innerHTML += `
                <tr>
                    <td><strong>${it.desc}</strong></td>
                    <td class="text-right">${it.qty}</td>
                    <td class="text-right">${formatVal(it.price)}</td>
                    <td class="text-right font-bold">${formatVal(displayTotal)}</td>
                </tr>
            `;

            if (Array.isArray(it.subItems)) {
                it.subItems.forEach(sub => {
                    const subQtyStr = sub.hasPrice ? `${sub.qty}` : '';
                    const subPriceStr = sub.hasPrice ? `${formatVal(sub.price)}` : '';
                    const subTotalStr = sub.hasPrice ? `${formatVal(sub.total)}` : '';

                    tableBody.innerHTML += `
                        <tr class="sub-item-paper-row" style="background: rgba(255, 255, 255, 0.01);">
                            <td style="padding-left: 2.5rem; color: var(--text-secondary); font-size: 0.85rem;">
                                <i class="fa-solid fa-turn-up" style="transform: rotate(90deg); margin-right: 0.5rem; color: var(--text-muted); font-size: 0.75rem;"></i>
                                ${sub.desc}
                            </td>
                            <td class="text-right" style="color: var(--text-secondary); font-size: 0.85rem;">${subQtyStr}</td>
                            <td class="text-right" style="color: var(--text-secondary); font-size: 0.85rem;">${subPriceStr}</td>
                            <td class="text-right" style="color: var(--text-secondary); font-size: 0.85rem; font-weight: 500;">${subTotalStr}</td>
                        </tr>
                    `;
                });
            }
        });

        const taxVal = subtotal * (inv.tax_rate / 100);
        document.getElementById('invoice-paper-subtotal').textContent = formatVal(subtotal);
        document.getElementById('invoice-paper-tax').textContent = `${formatVal(taxVal)} (${inv.tax_rate}%)`;
        document.getElementById('invoice-paper-discount').textContent = `-${formatVal(inv.discount)}`;
        document.getElementById('invoice-paper-total').textContent = formatVal(subtotal + taxVal - inv.discount);

        let notesText = inv.notes || '';
        let paymentDetailsText = inv.payment_details || '';

        const delimiter = "\n---PAYMENT-DETAILS---\n";
        if (notesText.includes(delimiter)) {
            const parts = notesText.split(delimiter);
            notesText = parts[0] || '';
            paymentDetailsText = parts[1] || '';
        }

        const pDetailsText = document.getElementById('invoice-paper-payment-details-text');
        const pDetailsBox = document.getElementById('invoice-paper-payment-details-box');

        if (paymentDetailsText && paymentDetailsText.trim() !== '') {
            pDetailsText.textContent = paymentDetailsText;
            pDetailsBox.classList.remove('hidden');
        } else {
            pDetailsText.textContent = '';
            pDetailsBox.classList.add('hidden');
        }

        document.getElementById('invoice-paper-notes-text').textContent = notesText || 'Thank you for your business!';

        document.getElementById('invoice-list-container').classList.remove('hidden');
        document.getElementById('invoice-view-container').classList.remove('hidden');

    } catch (err) {
        console.error(err);
        showToast('Error loading print rendering.', 'error');
    } finally {
        showLoading(false);
    }
}

function closeInvoiceViewer() {
    document.getElementById('invoice-list-container').classList.remove('hidden');
    document.getElementById('invoice-view-container').classList.add('hidden');
}

// ==================== FETCH CLIENT DATA SYSTEM ====================
function getDeduplicatedClients() {
    const clientsMap = {};
    appData.invoices.forEach(inv => {
        const name = (inv.client_name || '').trim();
        const email = (inv.client_email || '').trim();
        const address = (inv.client_address || '').trim();

        if (!name) return;

        const key = `${name.toLowerCase()}||${email.toLowerCase()}||${address.toLowerCase()}`;

        if (!clientsMap[key]) {
            clientsMap[key] = {
                name: inv.client_name,
                email: inv.client_email || '',
                address: inv.client_address || ''
            };
        }
    });
    return Object.values(clientsMap);
}

function openInvoiceClientFetchModal() {
    const listBody = document.getElementById('invoice-client-fetch-list-body');
    const searchInput = document.getElementById('invoice-client-search-input');

    if (listBody && searchInput) {
        listBody.innerHTML = '';
        searchInput.value = '';
        const clients = getDeduplicatedClients();
        renderFetchClientList(clients);
        document.getElementById('invoice-client-fetch-modal').classList.remove('hidden');
    }
}

function renderFetchClientList(clientsList) {
    const listBody = document.getElementById('invoice-client-fetch-list-body');
    if (!listBody) return;
    listBody.innerHTML = '';

    if (!clientsList || clientsList.length === 0) {
        listBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding: 1rem;">No clients found.</td></tr>`;
        return;
    }

    clientsList.forEach((client, idx) => {
        listBody.innerHTML += `
            <tr style="cursor: pointer;" onclick="selectClientFromTemplate(${idx})">
                <td><strong>${client.name}</strong></td>
                <td>${client.email || 'N/A'}</td>
                <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${client.address || 'N/A'}</td>
                <td class="text-right">
                    <button type="button" class="btn btn-xs btn-primary" onclick="event.stopPropagation(); selectClientFromTemplate(${idx})" style="padding: 0.2rem 0.4rem; font-size: 0.75rem;">Select</button>
                </td>
            </tr>
        `;
    });

    window.currentClientFetchPool = clientsList;
}

function selectClientFromTemplate(index) {
    if (!window.currentClientFetchPool || !window.currentClientFetchPool[index]) return;
    const client = window.currentClientFetchPool[index];

    document.getElementById('invoice-client-name').value = client.name;
    document.getElementById('invoice-client-email').value = client.email;
    document.getElementById('invoice-client-address').value = client.address;

    document.getElementById('invoice-client-fetch-modal').classList.add('hidden');
    showToast(`Client ${client.name} loaded successfully!`, 'success');
}

// ==================== FETCH PREVIOUS INVOICE SYSTEM ====================
let currentPreviewInvoiceId = null;

function openInvoiceFetchModal() {
    const listBody = document.getElementById('invoice-fetch-list-body');
    const searchInput = document.getElementById('invoice-fetch-search-input');

    if (listBody && searchInput) {
        listBody.innerHTML = '';
        searchInput.value = '';
        renderFetchInvoiceList(appData.invoices);
        document.getElementById('invoice-fetch-modal').classList.remove('hidden');
    }
}

function renderFetchInvoiceList(invoicesList) {
    const listBody = document.getElementById('invoice-fetch-list-body');
    if (!listBody) return;
    listBody.innerHTML = '';

    if (!invoicesList || invoicesList.length === 0) {
        listBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding: 1rem;">No previous invoices found.</td></tr>`;
        return;
    }

    invoicesList.forEach(inv => {
        listBody.innerHTML += `
            <tr style="cursor: pointer;" onclick="previewInvoicePopup('${inv.id}')">
                <td><strong>${inv.invoice_number}</strong></td>
                <td>${inv.client_name}</td>
                <td class="text-right font-bold">${formatVal(inv.total_amount)}</td>
                <td class="text-right">
                    <button type="button" class="btn btn-xs btn-outline" onclick="event.stopPropagation(); previewInvoicePopup('${inv.id}')" style="padding: 0.2rem 0.4rem; font-size: 0.75rem;">Preview</button>
                    <button type="button" class="btn btn-xs btn-primary" onclick="event.stopPropagation(); autofillInvoiceFromTemplate('${inv.id}')" style="padding: 0.2rem 0.4rem; font-size: 0.75rem;">Select</button>
                </td>
            </tr>
        `;
    });
}

function autofillInvoiceFromTemplate(id) {
    const inv = appData.invoices.find(i => i.id === id);
    if (!inv) return;

    // Load Client Details
    document.getElementById('invoice-client-name').value = inv.client_name;
    document.getElementById('invoice-client-email').value = inv.client_email || '';
    document.getElementById('invoice-client-address').value = inv.client_address || '';

    // Load tax & discount
    document.getElementById('invoice-tax').value = inv.tax_rate || 0;
    document.getElementById('invoice-discount').value = inv.discount || 0;

    let notesText = inv.notes || '';
    let paymentDetailsText = inv.payment_details || '';

    const delimiter = "\n---PAYMENT-DETAILS---\n";
    if (notesText.includes(delimiter)) {
        const parts = notesText.split(delimiter);
        notesText = parts[0] || '';
        paymentDetailsText = parts[1] || '';
    }

    document.getElementById('invoice-notes').value = notesText;
    document.getElementById('invoice-payment-details').value = paymentDetailsText || inv.payment_details || '';

    // Load item blocks
    const container = document.getElementById('invoice-items-rows-container');
    container.innerHTML = '';

    const items = Array.isArray(inv.items) ? inv.items : [];
    if (items.length === 0) {
        addInvoiceItemRow();
    } else {
        items.forEach(it => {
            addInvoiceItemRow(it.desc, it.qty, it.price, it.subItems);
        });
    }

    calculateInvoiceTotals();

    document.getElementById('invoice-fetch-modal').classList.add('hidden');
    showToast(`Autofilled from invoice ${inv.invoice_number}`, 'success');
}

function previewInvoicePopup(id) {
    const inv = appData.invoices.find(i => i.id === id);
    if (!inv) return;

    currentPreviewInvoiceId = id;

    // Company Info
    document.getElementById('popup-invoice-paper-company-name').textContent = currentUser.company_name || 'My Organization';
    document.getElementById('popup-invoice-paper-company-address').textContent = currentUser.company_address || '';
    document.getElementById('popup-invoice-paper-company-contact').textContent = `Tel: ${currentUser.company_phone || 'N/A'} | Email: ${currentUser.company_email || currentUser.email}`;

    const printLogo = document.getElementById('popup-invoice-paper-logo');
    if (currentUser.company_logo) {
        printLogo.src = pb.files.getUrl(currentUser, currentUser.company_logo);
        printLogo.classList.remove('hidden');
    } else {
        printLogo.classList.add('hidden');
    }

    // Invoice Info
    document.getElementById('popup-invoice-paper-number').textContent = inv.invoice_number;
    document.getElementById('popup-invoice-paper-issue-date').textContent = formatDateToDMY(inv.issue_date);
    document.getElementById('popup-invoice-paper-due-date').textContent = formatDateToDMY(inv.due_date);

    const statusBadge = document.getElementById('popup-invoice-paper-status');
    statusBadge.textContent = inv.status;
    statusBadge.className = `badge status-${inv.status.toLowerCase()}`;

    // Client Info
    document.getElementById('popup-invoice-paper-client-name').textContent = inv.client_name;
    document.getElementById('popup-invoice-paper-client-address').textContent = inv.client_address || '';
    document.getElementById('popup-invoice-paper-client-email').textContent = inv.client_email || '';

    // Items
    const tableBody = document.getElementById('popup-invoice-paper-items-list');
    tableBody.innerHTML = '';

    const items = Array.isArray(inv.items) ? inv.items : [];
    let subtotal = 0;

    items.forEach(it => {
        const displayTotal = it.qty * it.price;
        const subTotalSum = Array.isArray(it.subItems) ? it.subItems.reduce((acc, sub) => acc + (sub.total || 0), 0) : 0;
        const actualTotal = displayTotal + subTotalSum;
        subtotal += actualTotal;
        tableBody.innerHTML += `
            <tr>
                <td><strong>${it.desc}</strong></td>
                <td class="text-right">${it.qty}</td>
                <td class="text-right">${formatVal(it.price)}</td>
                <td class="text-right font-bold">${formatVal(displayTotal)}</td>
            </tr>
        `;

        if (Array.isArray(it.subItems)) {
            it.subItems.forEach(sub => {
                const subQtyStr = sub.hasPrice ? `${sub.qty}` : '';
                const subPriceStr = sub.hasPrice ? `${formatVal(sub.price)}` : '';
                const subTotalStr = sub.hasPrice ? `${formatVal(sub.total)}` : '';

                tableBody.innerHTML += `
                    <tr class="sub-item-paper-row" style="background: rgba(255, 255, 255, 0.01);">
                        <td style="padding-left: 2.5rem; color: var(--text-secondary); font-size: 0.85rem;">
                            <i class="fa-solid fa-turn-up" style="transform: rotate(90deg); margin-right: 0.5rem; color: var(--text-muted); font-size: 0.75rem;"></i>
                            ${sub.desc}
                        </td>
                        <td class="text-right" style="color: var(--text-secondary); font-size: 0.85rem;">${subQtyStr}</td>
                        <td class="text-right" style="color: var(--text-secondary); font-size: 0.85rem;">${subPriceStr}</td>
                        <td class="text-right" style="color: var(--text-secondary); font-size: 0.85rem; font-weight: 500;">${subTotalStr}</td>
                    </tr>
                `;
            });
        }
    });

    const taxVal = subtotal * (inv.tax_rate / 100);
    document.getElementById('popup-invoice-paper-subtotal').textContent = formatVal(subtotal);
    document.getElementById('popup-invoice-paper-tax').textContent = `${formatVal(taxVal)} (${inv.tax_rate}%)`;
    document.getElementById('popup-invoice-paper-discount').textContent = `-${formatVal(inv.discount)}`;
    document.getElementById('popup-invoice-paper-total').textContent = formatVal(subtotal + taxVal - inv.discount);

    // Notes
    let notesText = inv.notes || '';
    let paymentDetailsText = inv.payment_details || '';

    const delimiter = "\n---PAYMENT-DETAILS---\n";
    if (notesText.includes(delimiter)) {
        const parts = notesText.split(delimiter);
        notesText = parts[0] || '';
        paymentDetailsText = parts[1] || '';
    }

    const pDetailsText = document.getElementById('popup-invoice-paper-payment-details-text');
    if (paymentDetailsText && paymentDetailsText.trim() !== '') {
        pDetailsText.textContent = paymentDetailsText;
        document.getElementById('popup-invoice-paper-payment-details-box').classList.remove('hidden');
    } else {
        pDetailsText.textContent = '';
        document.getElementById('popup-invoice-paper-payment-details-box').classList.add('hidden');
    }

    document.getElementById('popup-invoice-paper-notes-text').textContent = notesText || 'Thank you for your business!';

    document.getElementById('invoice-preview-popup-modal').classList.remove('hidden');
}
