/**
 * VR FINANCE - Single Page Web Application Controller
 * Connects to PocketBase backend with custom table collections.
 */

// Initialize PocketBase
const pbUrl = (
    window.location.origin === "null" || 
    window.location.origin.includes("file://") ||
    ((window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") && window.location.port !== "8090")
) ? "https://pocketbase2.venturerushtech.com" : window.location.origin;
const pb = new PocketBase(pbUrl);

// Application State
let currentUser = null;
let currentTab = 'dashboard';
let currentDashboardSegment = 'all'; // 'all', 'personal', 'business', 'investments'
let charts = {};

// Cache for dashboard data
let appData = {
    personalIncome: [],
    personalExpenses: [],
    businessIncome: [],
    businessExpenses: [],
    investments: [],
    investmentExpenses: [],
    invoices: []
};

// ==================== DOM ELEMENTS & INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
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
    // If it's a Date object
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

// Initialize Application state and check auth
async function initApp() {
    // Theme toggle initialization (defaults to light mode on first visit)
    const savedTheme = localStorage.getItem('theme');
    const isLight = savedTheme === null || savedTheme === 'light';
    
    if (isLight) {
        document.body.setAttribute('data-theme', 'light');
        document.getElementById('theme-toggle').innerHTML = '<i class="fa-solid fa-sun"></i>';
        updateAppLogos(true);
    } else {
        document.body.removeAttribute('data-theme');
        document.getElementById('theme-toggle').innerHTML = '<i class="fa-solid fa-moon"></i>';
        updateAppLogos(false);
    }

    // Check PocketBase authorization status
    if (pb.authStore.isValid && pb.authStore.model) {
        // Double check model type to verify it's our auth collection
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
    
    // Close button handler
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove();
    });
    
    // Auto remove after 5s
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
    
    // Set Header Info
    updateUserHeaderDisplay();
    
    // Route to dashboard initially or active hash
    const currentHash = window.location.hash ? window.location.hash.substring(1) + '-tab' : 'dashboard-tab';
    const activeLink = document.querySelector(`.nav-link[data-tab="${currentHash}"]`);
    if (activeLink) {
        switchTab(currentHash);
    } else {
        switchTab('dashboard-tab');
    }
    
    // Sync entire data from PocketBase
    syncAllData();
}

function updateUserHeaderDisplay() {
    if (!currentUser) return;
    
    const companyName = currentUser.company_name || 'My Organization';
    const email = currentUser.email || '';
    
    document.getElementById('header-company-name').textContent = companyName;
    document.getElementById('header-user-email').textContent = email;
    document.getElementById('dashboard-welcome-name').textContent = companyName;
    
    // Set Company logo if exists
    const avatarImg = document.getElementById('header-company-logo');
    if (currentUser.company_logo) {
        const logoUrl = pb.files.getUrl(currentUser, currentUser.company_logo);
        avatarImg.src = logoUrl;
    } else {
        avatarImg.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%236366f1' d='M12 2L2 22h20L12 2z'/%3E%3C/svg%3E";
    }
    
    // Currency indicator
    const currencyStr = currentUser.currency || 'USD';
    document.querySelector('.currency-indicator').innerHTML = `<i class="fa-solid fa-coins"></i> ${currencyStr}`;
}

// ==================== ROUTING SYSTEM ====================
function switchTab(tabId) {
    // Update menu highlight
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.getAttribute('data-tab') === tabId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
    
    // Toggle content panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
        if (pane.id === tabId) {
            pane.classList.add('active');
        } else {
            pane.classList.remove('active');
        }
    });
    
    // Toggle segment selector visibility
    const segSelector = document.getElementById('dashboard-segment-selector');
    if (tabId === 'dashboard-tab') {
        if (segSelector) segSelector.classList.remove('hidden');
        const titleMap = {
            'all': 'Financial Dashboard',
            'personal': 'Personal Dashboard',
            'business': 'Business Dashboard',
            'investments': 'Investments Dashboard'
        };
        document.getElementById('page-title').textContent = titleMap[currentDashboardSegment] || 'Financial Dashboard';
    } else {
        if (segSelector) segSelector.classList.add('hidden');
        // Update Page Header Title
        const titleMap = {
            'personal-tab': 'Personal Wealth Index',
            'business-tab': 'Business Cashflow Management',
            'investments-tab': 'Investments Portfolio',
            'invoices-tab': 'Corporate Invoices Suite',
            'reports-tab': 'Financial Reports Intelligence',
            'profile-tab': 'System Settings'
        };
        document.getElementById('page-title').textContent = titleMap[tabId] || 'Financial Hub';
    }
    
    currentTab = tabId.replace('-tab', '');
    window.location.hash = currentTab;
    
    // Recalculate and draw components if switching to dashboard or reports
    if (currentTab === 'dashboard') {
        renderDashboardStats();
    } else if (currentTab === 'reports') {
        compileReport(new Event('submit'));
    }
}

// ==================== EVENT LISTENERS SETUP ====================
function setupEventListeners() {
    // Hash Change listener for back/forward browser support
    window.addEventListener('hashchange', () => {
        if (pb.authStore.isValid && window.location.hash) {
            const targetTab = window.location.hash.substring(1) + '-tab';
            const navLink = document.querySelector(`.nav-link[data-tab="${targetTab}"]`);
            if (navLink) switchTab(targetTab);
        }
    });

    // Tab buttons handler
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = link.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    // Segment dropdown selector click
    const dashSegBtn = document.getElementById('dashboard-segment-btn');
    const dashSegMenu = document.getElementById('dashboard-segment-menu');
    
    if (dashSegBtn && dashSegMenu) {
        dashSegBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dashSegMenu.classList.toggle('hidden');
        });
        
        document.addEventListener('click', (e) => {
            if (!dashSegMenu.contains(e.target) && e.target !== dashSegBtn) {
                dashSegMenu.classList.add('hidden');
            }
        });
    }

    // Segment menu items selection
    document.querySelectorAll('.segment-menu-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const segment = btn.getAttribute('data-segment');
            currentDashboardSegment = segment;
            
            // Toggle active menu item
            document.querySelectorAll('.segment-menu-item').forEach(item => {
                item.classList.remove('active');
            });
            btn.classList.add('active');
            
            // Hide menu
            dashSegMenu.classList.add('hidden');

            // Update page title
            const titleMap = {
                'all': 'Financial Dashboard',
                'personal': 'Personal Dashboard',
                'business': 'Business Dashboard',
                'investments': 'Investments Dashboard'
            };
            document.getElementById('page-title').textContent = titleMap[segment];

            // Refresh view
            renderDashboardStats();
        });
    });

    // Auth screen form toggles
    document.getElementById('toggle-to-signup').addEventListener('click', () => {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('signup-form').classList.remove('hidden');
        document.querySelector('.auth-subtitle').textContent = 'Create Organization Account';
    });

    document.getElementById('toggle-to-login').addEventListener('click', () => {
        document.getElementById('signup-form').classList.add('hidden');
        document.getElementById('login-form').classList.remove('hidden');
        document.querySelector('.auth-subtitle').textContent = 'Wealth Managment Portal';
    });

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
        // Force refresh charts to look good in the new background mode
        if (currentTab === 'dashboard') {
            renderDashboardCharts();
        }
    });

    // Disconnect (Logout)
    document.getElementById('logout-btn').addEventListener('click', () => {
        pb.authStore.clear();
        currentUser = null;
        showToast('Logged out successfully.', 'info');
        showAuthScreen();
    });

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

    // Signup Submission
    document.getElementById('signup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const passwordConfirm = document.getElementById('signup-password-confirm').value;
        
        if (password !== passwordConfirm) {
            showToast('Passwords do not match.', 'error');
            return;
        }

        const companyName = document.getElementById('signup-company-name').value || 'My Corporation';
        const logoFile = document.getElementById('signup-company-logo').files[0];
        const currency = document.getElementById('signup-currency').value;
        const phone = document.getElementById('signup-company-phone').value;
        const address = document.getElementById('signup-company-address').value;

        showLoading(true);
        
        // Multi-part Form Data for upload support
        const formData = new FormData();
        formData.append('email', email);
        formData.append('password', password);
        formData.append('passwordConfirm', passwordConfirm);
        formData.append('company_name', companyName);
        formData.append('currency', currency);
        formData.append('company_phone', phone);
        formData.append('company_address', address);
        
        if (logoFile) {
            formData.append('company_logo', logoFile);
        }

        try {
            // Create user
            await pb.collection('VRTPOCKET_LOGIN_DATABASE').create(formData);
            
            // Login user immediately
            const authData = await pb.collection('VRTPOCKET_LOGIN_DATABASE').authWithPassword(email, password);
            currentUser = authData.record;
            showToast('Account initialized successfully!', 'success');
            
            // Clear inputs
            document.getElementById('signup-form').reset();
            showDashboard();
        } catch (error) {
            console.error(error);
            showToast('Signup failed. Make sure collection schema matches plan instructions.', 'error');
        } finally {
            showLoading(false);
        }
    });

    // Modal forms discards
    document.getElementById('close-p-income-modal').onclick = () => closeModal('personal-income-modal');
    document.getElementById('btn-close-p-income-form').onclick = () => closeModal('personal-income-modal');
    
    document.getElementById('close-p-expense-modal').onclick = () => closeModal('personal-expense-modal');
    document.getElementById('btn-close-p-expense-form').onclick = () => closeModal('personal-expense-modal');
    
    document.getElementById('close-b-income-modal').onclick = () => closeModal('business-income-modal');
    document.getElementById('btn-close-b-income-form').onclick = () => closeModal('business-income-modal');
    
    document.getElementById('close-b-expense-modal').onclick = () => closeModal('business-expense-modal');
    document.getElementById('btn-close-b-expense-form').onclick = () => closeModal('business-expense-modal');

    document.getElementById('close-investment-modal').onclick = () => closeModal('investment-modal');
    document.getElementById('btn-close-investment-form').onclick = () => closeModal('investment-modal');
    
    document.getElementById('close-investment-expense-modal').onclick = () => closeModal('investment-expense-modal');
    document.getElementById('btn-close-investment-expense-form').onclick = () => closeModal('investment-expense-modal');

    // Add buttons toggles
    document.getElementById('btn-add-p-income').onclick = () => {
        document.getElementById('personal-income-form').reset();
        document.getElementById('personal-income-id').value = '';
        document.getElementById('personal-income-modal-title').textContent = 'Log Personal Income';
        document.getElementById('personal-income-currency-label').value = currentUser.currency || 'USD';
        openModal('personal-income-modal');
    };

    document.getElementById('btn-add-p-expense').onclick = () => {
        document.getElementById('personal-expense-form').reset();
        document.getElementById('personal-expense-id').value = '';
        document.getElementById('personal-expense-modal-title').textContent = 'Log Personal Expense';
        openModal('personal-expense-modal');
    };

    document.getElementById('btn-add-b-income').onclick = () => {
        document.getElementById('business-income-form').reset();
        document.getElementById('business-income-id').value = '';
        document.getElementById('business-income-modal-title').textContent = 'Log Business Revenue';
        openModal('business-income-modal');
    };

    document.getElementById('btn-add-b-expense').onclick = () => {
        document.getElementById('business-expense-form').reset();
        document.getElementById('business-expense-id').value = '';
        document.getElementById('business-expense-modal-title').textContent = 'Log Business Expense';
        openModal('business-expense-modal');
    };

    document.getElementById('btn-add-investment').onclick = () => {
        document.getElementById('investment-form').reset();
        document.getElementById('investment-id').value = '';
        document.getElementById('investment-modal-title').textContent = 'Log Investment Asset';
        openModal('investment-modal');
    };

    document.getElementById('btn-add-investment-expense-direct').onclick = () => {
        openAddFeeModal(null, null);
    };

    // Database CRUD Form submissions
    document.getElementById('personal-income-form').onsubmit = (e) => saveTransactionRecord(e, 'VRTPOCKET_PERSONAL_FINANCE_DATABASE', 'personal-income-form', 'personal-income-modal');
    document.getElementById('personal-expense-form').onsubmit = (e) => saveTransactionRecord(e, 'VRTPOCKET_PERSONAL_EXPENSES_DATABASE', 'personal-expense-form', 'personal-expense-modal');
    document.getElementById('business-income-form').onsubmit = (e) => saveTransactionRecord(e, 'VRTPOCKET_BUSINESS_FINANCE_DATABASE', 'business-income-form', 'business-income-modal');
    document.getElementById('business-expense-form').onsubmit = (e) => saveTransactionRecord(e, 'VRTPOCKET_BUSINESS_EXPENSES_DATABASE', 'business-expense-form', 'business-expense-modal');
    document.getElementById('investment-form').onsubmit = (e) => saveTransactionRecord(e, 'VRTPOCKET_INVESTMENT_FINANCE_DATABASE', 'investment-form', 'investment-modal');
    document.getElementById('investment-expense-form').onsubmit = (e) => saveInvestmentFeeRecord(e);

    // Profile Settings Form
    document.getElementById('profile-form').onsubmit = async (e) => {
        e.preventDefault();
        showLoading(true);
        const companyName = document.getElementById('profile-company-name').value;
        const email = document.getElementById('profile-company-email').value;
        const phone = document.getElementById('profile-company-phone').value;
        const address = document.getElementById('profile-company-address').value;
        const bankDetails = document.getElementById('profile-bank-details').value;
        const invoiceNotesTerms = document.getElementById('profile-invoice-notes-terms').value;
        const currency = document.getElementById('profile-currency').value;
        const logoFile = document.getElementById('profile-logo-input').files[0];

        const formData = new FormData();
        formData.append('company_name', companyName);
        formData.append('company_email', email);
        formData.append('company_phone', phone);
        formData.append('company_address', address);
        formData.append('bank_details', bankDetails);
        formData.append('invoice_notes_terms', invoiceNotesTerms);
        formData.append('currency', currency);

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

    // Reports trigger
    document.getElementById('report-filter-form').onsubmit = compileReport;
    document.getElementById('btn-print-report').onclick = () => window.print();

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
    
    // Auto-close menu when clicking nav links on mobile
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

// Helper to calculate subscription due dates relative to today
function calculateNextRenewal(startDateStr, frequency) {
    const start = new Date(startDateStr);
    const today = new Date();
    today.setHours(0,0,0,0);
    
    if (frequency === 'one-time') return start;
    
    let nextDue = new Date(start);
    // Move forward by intervals until it is in the future
    while (nextDue < today) {
        if (frequency === 'monthly') {
            nextDue.setMonth(nextDue.getMonth() + 1);
        } else if (frequency === 'yearly') {
            nextDue.setFullYear(nextDue.getFullYear() + 1);
        } else {
            break;
        }
    }
    return nextDue;
}

// Helper to check if a collection exists by sending a test fetch
async function verifyCollectionExists(collectionName) {
    try {
        await pb.collection(collectionName).getList(1, 1);
        return true;
    } catch (e) {
        console.error(`Collection ${collectionName} check failed:`, e);
        return false;
    }
}

// ==================== CORE SYNCHRONIZER ====================
async function syncAllData() {
    if (!currentUser) return;
    
    showLoading(true);
    try {
        const userId = currentUser.id;
        
        // Parallel queries to PocketBase database with user filters
        const [pInc, pExp, bInc, bExp, invs, invoices] = await Promise.all([
            pb.collection('VRTPOCKET_PERSONAL_FINANCE_DATABASE').getFullList({ filter: `user = "${userId}"`, sort: '-date' }).catch(() => []),
            pb.collection('VRTPOCKET_PERSONAL_EXPENSES_DATABASE').getFullList({ filter: `user = "${userId}"`, sort: '-date' }).catch(() => []),
            pb.collection('VRTPOCKET_BUSINESS_FINANCE_DATABASE').getFullList({ filter: `user = "${userId}"`, sort: '-date' }).catch(() => []),
            pb.collection('VRTPOCKET_BUSINESS_EXPENSES_DATABASE').getFullList({ filter: `user = "${userId}"`, sort: '-date' }).catch(() => []),
            pb.collection('VRTPOCKET_INVESTMENT_FINANCE_DATABASE').getFullList({ filter: `user = "${userId}"`, sort: '-purchase_date' }).catch(() => []),
            pb.collection('VRTPOCKET_INVOICE_DATABASE').getFullList({ filter: `user = "${userId}"`, sort: '-issue_date' }).catch(() => [])
        ]);

        // Get Investment expenses linked to user investments
        let invFees = [];
        if (invs.length > 0) {
            // Relational filters in pocketbase: investment.user = userId
            invFees = await pb.collection('VRTPOCKET_INVESTMENT_EXPENSES_DATABASE').getFullList({
                filter: `investment.user = "${userId}"`,
                sort: '-date'
            }).catch(() => []);
        }

        // Store globally in state
        appData.personalIncome = pInc;
        appData.personalExpenses = pExp;
        appData.businessIncome = bInc;
        appData.businessExpenses = bExp;
        appData.investments = invs;
        appData.investmentExpenses = invFees;
        appData.invoices = invoices;

        // Render sections
        renderPersonalFinance();
        renderBusinessFinance();
        renderInvestments();
        renderInvoices();
        renderDashboardStats();
        
        // Sync profile fields if profile tab active
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
    document.getElementById('profile-company-name').value = currentUser.company_name || '';
    document.getElementById('profile-company-email').value = currentUser.company_email || '';
    document.getElementById('profile-company-phone').value = currentUser.company_phone || '';
    document.getElementById('profile-company-address').value = currentUser.company_address || '';
    document.getElementById('profile-bank-details').value = currentUser.bank_details || '';
    document.getElementById('profile-invoice-notes-terms').value = currentUser.invoice_notes_terms || '';
    document.getElementById('profile-currency').value = currentUser.currency || 'USD';
    
    if (currentUser.company_logo) {
        document.getElementById('profile-logo-preview').src = pb.files.getUrl(currentUser, currentUser.company_logo);
    }
}

// ==================== RENDER: DASHBOARD ANALYTICS ====================
function renderDashboardStats() {
    // Calculators
    const pIncSum = appData.personalIncome.reduce((acc, row) => acc + (row.amount || 0), 0);
    const pExpSum = appData.personalExpenses.reduce((acc, row) => acc + (row.amount || 0), 0);
    
    const bIncSum = appData.businessIncome.reduce((acc, row) => acc + (row.amount || 0), 0);
    const bExpSum = appData.businessExpenses.reduce((acc, row) => acc + (row.amount || 0), 0);

    const invAssetsCapital = appData.investments.reduce((acc, row) => acc + (row.initial_amount || 0), 0);
    const invAssetsCurrent = appData.investments.reduce((acc, row) => acc + (row.current_val || 0), 0);
    const invFeesSum = appData.investmentExpenses.reduce((acc, row) => acc + (row.amount || 0), 0);
    
    const outstandingInvoices = appData.invoices
        .filter(i => i.status !== 'Paid' && i.status !== 'Draft')
        .reduce((acc, i) => acc + (i.total_amount || 0), 0);
    const paidInvoicesCount = appData.invoices.filter(i => i.status === 'Paid').length;
    const pendingInvoicesCount = appData.invoices.filter(i => i.status === 'Sent' || i.status === 'Overdue').length;

    // Fill UI Values
    document.getElementById('stat-personal-net').textContent = formatVal(pIncSum - pExpSum);
    document.getElementById('stat-personal-income-sum').textContent = `+${formatVal(pIncSum)}`;
    document.getElementById('stat-personal-expense-sum').textContent = `-${formatVal(pExpSum)}`;

    document.getElementById('stat-business-net').textContent = formatVal(bIncSum - bExpSum);
    document.getElementById('stat-business-income-sum').textContent = `+${formatVal(bIncSum)}`;
    document.getElementById('stat-business-expense-sum').textContent = `-${formatVal(bExpSum)}`;

    document.getElementById('stat-investments-value').textContent = formatVal(invAssetsCurrent);
    
    // Total Net ROI
    const netReturn = invAssetsCurrent - invAssetsCapital - invFeesSum;
    const roiPercent = invAssetsCapital > 0 ? (netReturn / invAssetsCapital) * 100 : 0;
    
    const roiBadge = document.getElementById('stat-investments-roi');
    roiBadge.textContent = `${roiPercent.toFixed(2)}%`;
    if (roiPercent >= 0) {
        roiBadge.className = 'text-emerald';
        roiBadge.innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i> ${roiPercent.toFixed(2)}%`;
    } else {
        roiBadge.className = 'text-rose';
        roiBadge.innerHTML = `<i class="fa-solid fa-arrow-trend-down"></i> ${roiPercent.toFixed(2)}%`;
    }

    document.getElementById('stat-invoices-outstanding').textContent = formatVal(outstandingInvoices);
    document.getElementById('stat-invoices-paid-count').textContent = paidInvoicesCount;
    document.getElementById('stat-invoices-pending-count').textContent = pendingInvoicesCount;

    // Segment Card toggles
    const pCard = document.getElementById('card-wrapper-personal');
    const bCard = document.getElementById('card-wrapper-business');
    const iCard = document.getElementById('card-wrapper-investments');
    const invCard = document.getElementById('card-wrapper-invoices');

    if (currentDashboardSegment === 'all') {
        pCard.classList.remove('hidden');
        bCard.classList.remove('hidden');
        iCard.classList.remove('hidden');
        invCard.classList.remove('hidden');
    } else if (currentDashboardSegment === 'personal') {
        pCard.classList.remove('hidden');
        bCard.classList.add('hidden');
        iCard.classList.add('hidden');
        invCard.classList.add('hidden');
    } else if (currentDashboardSegment === 'business') {
        pCard.classList.add('hidden');
        bCard.classList.remove('hidden');
        iCard.classList.add('hidden');
        invCard.classList.remove('hidden');
    } else if (currentDashboardSegment === 'investments') {
        pCard.classList.add('hidden');
        bCard.classList.add('hidden');
        iCard.classList.remove('hidden');
        invCard.classList.add('hidden');
    }

    // Toggle bottom list components
    const subListWrapper = document.getElementById('card-wrapper-subscriptions-list');
    const invListWrapper = document.getElementById('card-wrapper-investments-list');

    if (currentDashboardSegment === 'all') {
        subListWrapper.classList.remove('hidden');
        invListWrapper.classList.remove('hidden');
    } else if (currentDashboardSegment === 'personal') {
        subListWrapper.classList.remove('hidden');
        invListWrapper.classList.add('hidden');
    } else if (currentDashboardSegment === 'business') {
        subListWrapper.classList.remove('hidden');
        invListWrapper.classList.add('hidden');
    } else if (currentDashboardSegment === 'investments') {
        subListWrapper.classList.add('hidden');
        invListWrapper.classList.remove('hidden');
    }

    // Load Subscriptions List into Dashboard
    let subPool = [];
    if (currentDashboardSegment === 'all') {
        subPool = [
            ...appData.personalExpenses.filter(e => e.is_subscription),
            ...appData.businessExpenses.filter(e => e.is_subscription)
        ];
    } else if (currentDashboardSegment === 'personal') {
        subPool = appData.personalExpenses.filter(e => e.is_subscription);
    } else if (currentDashboardSegment === 'business') {
        subPool = appData.businessExpenses.filter(e => e.is_subscription);
    }

    const subscriptions = subPool.map(sub => {
        const nextDue = calculateNextRenewal(sub.date, sub.frequency);
        return { ...sub, nextDue };
    }).sort((a, b) => a.nextDue - b.nextDue);

    const subContainer = document.getElementById('dashboard-subscriptions-list');
    subContainer.innerHTML = '';
    
    if (subscriptions.length === 0) {
        subContainer.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No active subscriptions detected.</td></tr>`;
    } else {
        subscriptions.slice(0, 5).forEach(sub => {
            subContainer.innerHTML += `
                <tr>
                    <td><strong>${sub.title}</strong></td>
                    <td><span class="badge ${sub.frequency === 'monthly' ? 'monthly' : 'yearly'}">${sub.frequency}</span></td>
                    <td class="text-rose font-bold">-${formatVal(sub.amount)}</td>
                    <td>${sub.is_subscription ? 'Subscription' : 'Expense'}</td>
                    <td><i class="fa-regular fa-calendar-days text-muted"></i> ${formatDateToDMY(sub.nextDue)}</td>
                </tr>
            `;
        });
    }

    // Load Portfolio List into Dashboard
    const topInvs = [...appData.investments].sort((a, b) => (b.current_val - b.initial_amount) - (a.current_val - a.initial_amount));
    const invContainer = document.getElementById('dashboard-investments-list');
    invContainer.innerHTML = '';
    
    if (topInvs.length === 0) {
        invContainer.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No investments logged.</td></tr>`;
    } else {
        topInvs.slice(0, 5).forEach(inv => {
            const gain = inv.current_val - inv.initial_amount;
            const roi = inv.initial_amount > 0 ? (gain / inv.initial_amount) * 100 : 0;
            const textClass = gain >= 0 ? 'text-emerald' : 'text-rose';
            
            invContainer.innerHTML += `
                <tr>
                    <td><strong>${inv.name}</strong> <span class="text-muted text-sm">(${inv.type})</span></td>
                    <td>${formatVal(inv.initial_amount)}</td>
                    <td>${formatVal(inv.current_val)}</td>
                    <td class="${textClass} font-bold">${roi.toFixed(1)}%</td>
                </tr>
            `;
        });
    }

    // Draw Dashboard Charts
    renderDashboardCharts();
}

function renderDashboardCharts() {
    const ctxCashflow = document.getElementById('cashflowTrendChart').getContext('2d');
    const ctxExpense = document.getElementById('expenseDistributionChart').getContext('2d');

    // Destroy existing charts
    if (charts.cashflow) charts.cashflow.destroy();
    if (charts.expense) charts.expense.destroy();

    // Theme adaptive color rules
    const isLight = document.body.getAttribute('data-theme') === 'light';
    const gridColor = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.08)';
    const textColor = isLight ? '#475569' : '#94a3b8';

    const cashflowWrapper = document.getElementById('card-wrapper-cashflow-chart');
    const expenseWrapper = document.getElementById('card-wrapper-expense-chart');
    const expenseChartTitle = document.getElementById('expense-chart-title');

    if (currentDashboardSegment === 'investments') {
        // Hide cashflow chart in investments segment
        cashflowWrapper.classList.add('hidden');
        expenseWrapper.classList.remove('hidden');
        expenseChartTitle.textContent = 'Investment Asset Allocation by Type';
        
        // Accumulate investments asset types
        const types = {};
        appData.investments.forEach(asset => {
            const t = asset.type || 'Other';
            types[t] = (types[t] || 0) + (asset.current_val || 0);
        });

        const typeLabels = Object.keys(types);
        const typeValues = Object.values(types);

        charts.expense = new Chart(ctxExpense, {
            type: 'doughnut',
            data: {
                labels: typeLabels.length > 0 ? typeLabels : ['No Assets'],
                datasets: [{
                    data: typeValues.length > 0 ? typeValues : [1],
                    backgroundColor: [
                        '#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#d946ef', '#f43f5e', '#3b82f6', '#94a3b8'
                    ],
                    borderWidth: 1,
                    borderColor: isLight ? '#ffffff' : '#0f1524'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: textColor, font: { family: 'Plus Jakarta Sans' } }
                    }
                }
            }
        });
        return; // skip cashflow rendering
    }

    // If not investments, restore defaults
    cashflowWrapper.classList.remove('hidden');
    expenseWrapper.classList.remove('hidden');
    expenseChartTitle.textContent = 'Expense Breakdown by Categories';

    // 1. CASHFLOW CHART: Calculate past 6 months income vs expenses
    const months = [];
    const incomes = [];
    const expenses = [];
    const date = new Date();
    
    for (let i = 5; i >= 0; i--) {
        const d = new Date(date.getFullYear(), date.getMonth() - i, 1);
        months.push(d.toLocaleString('default', { month: 'short', year: '2-digit' }));
        
        // Filter income / expenses matching this month & year
        const matchMonthYear = (recordDateStr) => {
            const rd = new Date(recordDateStr);
            return rd.getMonth() === d.getMonth() && rd.getFullYear() === d.getFullYear();
        };

        let mIncome = 0;
        let mExpense = 0;

        if (currentDashboardSegment === 'all') {
            const mPersonalIncome = appData.personalIncome.filter(r => matchMonthYear(r.date)).reduce((acc, r) => acc + (r.amount || 0), 0);
            const mBusinessIncome = appData.businessIncome.filter(r => matchMonthYear(r.date)).reduce((acc, r) => acc + (r.amount || 0), 0);
            mIncome = mPersonalIncome + mBusinessIncome;

            const mPersonalExpense = appData.personalExpenses.filter(r => matchMonthYear(r.date)).reduce((acc, r) => acc + (r.amount || 0), 0);
            const mBusinessExpense = appData.businessExpenses.filter(r => matchMonthYear(r.date)).reduce((acc, r) => acc + (r.amount || 0), 0);
            mExpense = mPersonalExpense + mBusinessExpense;
        } else if (currentDashboardSegment === 'personal') {
            mIncome = appData.personalIncome.filter(r => matchMonthYear(r.date)).reduce((acc, r) => acc + (r.amount || 0), 0);
            mExpense = appData.personalExpenses.filter(r => matchMonthYear(r.date)).reduce((acc, r) => acc + (r.amount || 0), 0);
        } else if (currentDashboardSegment === 'business') {
            mIncome = appData.businessIncome.filter(r => matchMonthYear(r.date)).reduce((acc, r) => acc + (r.amount || 0), 0);
            mExpense = appData.businessExpenses.filter(r => matchMonthYear(r.date)).reduce((acc, r) => acc + (r.amount || 0), 0);
        }

        incomes.push(mIncome);
        expenses.push(mExpense);
    }

    charts.cashflow = new Chart(ctxCashflow, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                {
                    label: 'Total Inflow',
                    data: incomes,
                    backgroundColor: '#10b981',
                    borderRadius: 4
                },
                {
                    label: 'Total Outflow',
                    data: expenses,
                    backgroundColor: '#f43f5e',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: textColor, font: { family: 'Plus Jakarta Sans' } } }
            },
            scales: {
                x: { grid: { color: gridColor }, ticks: { color: textColor } },
                y: { grid: { color: gridColor }, ticks: { color: textColor } }
            }
        }
    });

    // 2. EXPENSE DISTRIBUTION CHART: Category breakdown
    const categories = {};
    let expPool = [];
    if (currentDashboardSegment === 'all') {
        expPool = [...appData.personalExpenses, ...appData.businessExpenses];
    } else if (currentDashboardSegment === 'personal') {
        expPool = appData.personalExpenses;
    } else if (currentDashboardSegment === 'business') {
        expPool = appData.businessExpenses;
    }

    expPool.forEach(exp => {
        const cat = exp.category || 'Other';
        categories[cat] = (categories[cat] || 0) + (exp.amount || 0);
    });

    const categoryLabels = Object.keys(categories);
    const categoryValues = Object.values(categories);

    charts.expense = new Chart(ctxExpense, {
        type: 'doughnut',
        data: {
            labels: categoryLabels.length > 0 ? categoryLabels : ['No Expenses'],
            datasets: [{
                data: categoryValues.length > 0 ? categoryValues : [1],
                backgroundColor: [
                    '#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#d946ef', '#f43f5e', '#3b82f6', '#94a3b8'
                ],
                borderWidth: 1,
                borderColor: isLight ? '#ffffff' : '#0f1524'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: textColor, font: { family: 'Plus Jakarta Sans' } }
                }
            }
        }
    });
}

// ==================== RENDER: PERSONAL FINANCE TABS ====================
function renderPersonalFinance() {
    // 1. Personal Incomes Render
    const incomeBody = document.getElementById('personal-income-list');
    incomeBody.innerHTML = '';
    
    if (appData.personalIncome.length === 0) {
        incomeBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No income records saved.</td></tr>`;
    } else {
        appData.personalIncome.forEach(row => {
            incomeBody.innerHTML += `
                <tr>
                    <td><strong>${row.title}</strong></td>
                    <td class="text-emerald font-bold">+${formatVal(row.amount)}</td>
                    <td><span class="badge ${row.frequency}">${row.frequency}</span></td>
                    <td>${formatDateToDMY(row.date)}</td>
                    <td>${row.category}</td>
                    <td>
                        <div class="tbl-actions">
                            <button class="tbl-btn tbl-btn-edit" onclick="editTransactionRecord('${row.id}', 'VRTPOCKET_PERSONAL_FINANCE_DATABASE')" title="Edit"><i class="fa-regular fa-pen-to-square"></i></button>
                            <button class="tbl-btn tbl-btn-delete" onclick="deleteTransactionRecord('${row.id}', 'VRTPOCKET_PERSONAL_FINANCE_DATABASE')" title="Delete"><i class="fa-regular fa-trash-can"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    // 2. Personal Expenses Render
    const expenseBody = document.getElementById('personal-expense-list');
    expenseBody.innerHTML = '';
    
    if (appData.personalExpenses.length === 0) {
        expenseBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No expense records saved.</td></tr>`;
    } else {
        appData.personalExpenses.forEach(row => {
            const nextDueStr = row.is_subscription 
                ? formatDateToDMY(calculateNextRenewal(row.date, row.frequency)) 
                : 'N/A';
            
            expenseBody.innerHTML += `
                <tr>
                    <td><strong>${row.title}</strong></td>
                    <td class="text-rose font-bold">-${formatVal(row.amount)}</td>
                    <td>${row.is_subscription ? '<span class="badge monthly">Subscription</span>' : '<span class="badge one-time">Expense</span>'}</td>
                    <td><span class="badge ${row.frequency}">${row.frequency}</span></td>
                    <td><i class="fa-regular fa-calendar-days"></i> ${nextDueStr}</td>
                    <td>${row.category}</td>
                    <td>
                        <div class="tbl-actions">
                            <button class="tbl-btn tbl-btn-edit" onclick="editTransactionRecord('${row.id}', 'VRTPOCKET_PERSONAL_EXPENSES_DATABASE')" title="Edit"><i class="fa-regular fa-pen-to-square"></i></button>
                            <button class="tbl-btn tbl-btn-delete" onclick="deleteTransactionRecord('${row.id}', 'VRTPOCKET_PERSONAL_EXPENSES_DATABASE')" title="Delete"><i class="fa-regular fa-trash-can"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }
}

// ==================== RENDER: BUSINESS FINANCE TABS ====================
function renderBusinessFinance() {
    // 1. Business Incomes
    const incomeBody = document.getElementById('business-income-list');
    incomeBody.innerHTML = '';
    
    if (appData.businessIncome.length === 0) {
        incomeBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No business revenues saved.</td></tr>`;
    } else {
        appData.businessIncome.forEach(row => {
            incomeBody.innerHTML += `
                <tr>
                    <td><strong>${row.title}</strong></td>
                    <td class="text-emerald font-bold">+${formatVal(row.amount)}</td>
                    <td><span class="badge ${row.frequency}">${row.frequency}</span></td>
                    <td>${formatDateToDMY(row.date)}</td>
                    <td>${row.category}</td>
                    <td>
                        <div class="tbl-actions">
                            <button class="tbl-btn tbl-btn-edit" onclick="editTransactionRecord('${row.id}', 'VRTPOCKET_BUSINESS_FINANCE_DATABASE')" title="Edit"><i class="fa-regular fa-pen-to-square"></i></button>
                            <button class="tbl-btn tbl-btn-delete" onclick="deleteTransactionRecord('${row.id}', 'VRTPOCKET_BUSINESS_FINANCE_DATABASE')" title="Delete"><i class="fa-regular fa-trash-can"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    // 2. Business Expenses
    const expenseBody = document.getElementById('business-expense-list');
    expenseBody.innerHTML = '';
    
    if (appData.businessExpenses.length === 0) {
        expenseBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No business expenses saved.</td></tr>`;
    } else {
        appData.businessExpenses.forEach(row => {
            const nextDueStr = row.is_subscription 
                ? formatDateToDMY(calculateNextRenewal(row.date, row.frequency)) 
                : 'N/A';
            
            expenseBody.innerHTML += `
                <tr>
                    <td><strong>${row.title}</strong></td>
                    <td class="text-rose font-bold">-${formatVal(row.amount)}</td>
                    <td>${row.is_subscription ? '<span class="badge monthly">Subscription</span>' : '<span class="badge one-time">Expense</span>'}</td>
                    <td><span class="badge ${row.frequency}">${row.frequency}</span></td>
                    <td><i class="fa-regular fa-calendar-days"></i> ${nextDueStr}</td>
                    <td>${row.category}</td>
                    <td>
                        <div class="tbl-actions">
                            <button class="tbl-btn tbl-btn-edit" onclick="editTransactionRecord('${row.id}', 'VRTPOCKET_BUSINESS_EXPENSES_DATABASE')" title="Edit"><i class="fa-regular fa-pen-to-square"></i></button>
                            <button class="tbl-btn tbl-btn-delete" onclick="deleteTransactionRecord('${row.id}', 'VRTPOCKET_BUSINESS_EXPENSES_DATABASE')" title="Delete"><i class="fa-regular fa-trash-can"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }
}

// ==================== RENDER: INVESTMENTS ====================
function renderInvestments() {
    const body = document.getElementById('investments-list');
    body.innerHTML = '';
    
    if (appData.investments.length === 0) {
        body.innerHTML = `<tr><td colspan="9" class="text-center text-muted">No investments logged yet.</td></tr>`;
    } else {
        appData.investments.forEach(asset => {
            // Find total fees/expenses linked to this asset
            const assetFees = appData.investmentExpenses
                .filter(fee => fee.investment === asset.id)
                .reduce((acc, fee) => acc + (fee.amount || 0), 0);
            
            const netReturn = asset.current_val - asset.initial_amount - assetFees;
            const roiPercent = asset.initial_amount > 0 ? (netReturn / asset.initial_amount) * 100 : 0;
            
            const textClass = netReturn >= 0 ? 'text-emerald' : 'text-rose';
            const iconClass = netReturn >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
            
            body.innerHTML += `
                <tr>
                    <td><strong>${asset.name}</strong></td>
                    <td><span class="badge one-time">${asset.type}</span></td>
                    <td>${formatVal(asset.initial_amount)}</td>
                    <td>${formatVal(asset.current_val)}</td>
                    <td class="text-rose font-bold">-${formatVal(assetFees)}</td>
                    <td class="${textClass} font-bold">${netReturn >= 0 ? '+' : ''}${formatVal(netReturn)}</td>
                    <td class="${textClass} font-bold"><i class="fa-solid ${iconClass}"></i> ${roiPercent.toFixed(2)}%</td>
                    <td>${formatDateToDMY(asset.purchase_date)}</td>
                    <td>
                        <div class="tbl-actions">
                            <button class="tbl-btn tbl-btn-view" onclick="openAddFeeModal('${asset.id}', '${asset.name}')" title="Log Fee/Expense"><i class="fa-solid fa-receipt"></i></button>
                            <button class="tbl-btn tbl-btn-edit" onclick="editTransactionRecord('${asset.id}', 'VRTPOCKET_INVESTMENT_FINANCE_DATABASE')" title="Edit Asset"><i class="fa-regular fa-pen-to-square"></i></button>
                            <button class="tbl-btn tbl-btn-delete" onclick="deleteTransactionRecord('${asset.id}', 'VRTPOCKET_INVESTMENT_FINANCE_DATABASE')" title="Delete"><i class="fa-regular fa-trash-can"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    // Render separate investment expenses list
    renderInvestmentExpenses();
}

function renderInvestmentExpenses() {
    const listContainer = document.getElementById('investment-expenses-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    if (appData.investmentExpenses.length === 0) {
        listContainer.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No investment expenses logged.</td></tr>`;
        return;
    }
    
    // Asset ID to name map helper
    const assetMap = {};
    appData.investments.forEach(asset => {
        assetMap[asset.id] = asset.name;
    });
    
    appData.investmentExpenses.forEach(exp => {
        const assetName = assetMap[exp.investment] || 'General / Unknown Asset';
        const formattedDate = formatDateToDMY(exp.date);
        
        listContainer.innerHTML += `
            <tr>
                <td><strong>${assetName}</strong> <span class="text-muted text-sm">(${exp.title || 'Expense'})</span></td>
                <td class="text-rose font-bold">-${formatVal(exp.amount)}</td>
                <td><span class="badge one-time">${exp.type}</span></td>
                <td><i class="fa-regular fa-calendar-days text-muted"></i> ${formattedDate}</td>
                <td>${exp.notes || '-'}</td>
                <td>
                    <div class="tbl-actions">
                        <button class="tbl-btn tbl-btn-delete" onclick="deleteTransactionRecord('${exp.id}', 'VRTPOCKET_INVESTMENT_EXPENSES_DATABASE')" title="Delete"><i class="fa-regular fa-trash-can"></i></button>
                    </div>
                </td>
            </tr>
        `;
    });
}

function openAddFeeModal(assetId, assetName) {
    document.getElementById('investment-expense-form').reset();
    
    const select = document.getElementById('investment-expense-asset-id');
    select.innerHTML = '';
    
    if (appData.investments.length === 0) {
        select.innerHTML = '<option value="">(No investment assets logged)</option>';
    } else {
        appData.investments.forEach(asset => {
            select.innerHTML += `<option value="${asset.id}">${asset.name} (${asset.type})</option>`;
        });
    }
    
    if (assetId) {
        select.value = assetId;
    }
    openModal('investment-expense-modal');
}

// ==================== TRANSACTION CRUD SYSTEM ====================
async function saveTransactionRecord(e, collectionName, formId, modalId) {
    e.preventDefault();
    showLoading(true);
    
    const form = document.getElementById(formId);
    const recordId = form.querySelector('input[type="hidden"]').value;
    
    // Map fields dynamically based on form types
    const data = {
        user: currentUser.id
    };
    
    // Read form inputs into data payload
    if (formId.includes('income')) {
        data.title = form.querySelector('[id$="-title"]').value;
        data.amount = parseFloat(form.querySelector('[id$="-amount"]').value);
        data.frequency = form.querySelector('[id$="-frequency"]').value;
        data.date = new Date(form.querySelector('[id$="-date"]').value).toISOString();
        data.category = form.querySelector('[id$="-category"]').value;
        data.notes = form.querySelector('[id$="-notes"]').value;
    } else if (formId.includes('expense')) {
        data.title = form.querySelector('[id$="-title"]').value;
        data.amount = parseFloat(form.querySelector('[id$="-amount"]').value);
        data.frequency = form.querySelector('[id$="-frequency"]').value;
        data.date = new Date(form.querySelector('[id$="-date"]').value).toISOString();
        data.category = form.querySelector('[id$="-category"]').value;
        data.is_subscription = form.querySelector('[id$="-is-subscription"]').checked;
        data.notes = form.querySelector('[id$="-notes"]').value;
        
        // Pre-calculate next due date
        if (data.is_subscription) {
            data.next_due_date = calculateNextRenewal(data.date, data.frequency).toISOString();
        }
    } else if (formId.includes('investment')) {
        data.name = document.getElementById('investment-name').value;
        data.type = document.getElementById('investment-type').value;
        data.initial_amount = parseFloat(document.getElementById('investment-initial').value);
        data.current_val = parseFloat(document.getElementById('investment-current').value);
        data.purchase_date = new Date(document.getElementById('investment-purchase-date').value).toISOString();
        data.notes = document.getElementById('investment-notes').value;
    }

    try {
        if (recordId) {
            // Update
            await pb.collection(collectionName).update(recordId, data);
            showToast('Record updated successfully!', 'success');
        } else {
            // Create
            await pb.collection(collectionName).create(data);
            showToast('Record logged successfully!', 'success');
        }
        closeModal(modalId);
        form.reset();
        syncAllData();
    } catch (error) {
        console.error(error);
        showToast('Saving failed. Check collection permissions/columns.', 'error');
    } finally {
        showLoading(false);
    }
}

async function saveInvestmentFeeRecord(e) {
    e.preventDefault();
    showLoading(true);
    
    const assetId = document.getElementById('investment-expense-asset-id').value;
    const title = document.getElementById('investment-expense-title').value;
    const amount = parseFloat(document.getElementById('investment-expense-amount').value);
    const date = new Date(document.getElementById('investment-expense-date').value).toISOString();
    const type = document.getElementById('investment-expense-type').value;
    const notes = document.getElementById('investment-expense-notes').value;

    const data = {
        investment: assetId,
        title,
        amount,
        date,
        type,
        notes
    };

    try {
        await pb.collection('VRTPOCKET_INVESTMENT_EXPENSES_DATABASE').create(data);
        showToast('Investment fee/expense logged!', 'success');
        closeModal('investment-expense-modal');
        document.getElementById('investment-expense-form').reset();
        syncAllData();
    } catch (error) {
        console.error(error);
        showToast('Failed to log investment fee. Verify table relation.', 'error');
    } finally {
        showLoading(false);
    }
}

async function editTransactionRecord(id, collectionName) {
    showLoading(true);
    try {
        const record = await pb.collection(collectionName).getOne(id);
        
        // Open appropriate form and prefill values
        if (collectionName === 'VRTPOCKET_PERSONAL_FINANCE_DATABASE') {
            document.getElementById('personal-income-id').value = record.id;
            document.getElementById('personal-income-title').value = record.title || '';
            document.getElementById('personal-income-amount').value = record.amount || 0;
            document.getElementById('personal-income-frequency').value = record.frequency || 'one-time';
            document.getElementById('personal-income-date').value = record.date.split(' ')[0];
            document.getElementById('personal-income-category').value = record.category || 'Salary';
            document.getElementById('personal-income-notes').value = record.notes || '';
            document.getElementById('personal-income-modal-title').textContent = 'Modify Personal Income';
            openModal('personal-income-modal');
        } else if (collectionName === 'VRTPOCKET_PERSONAL_EXPENSES_DATABASE') {
            document.getElementById('personal-expense-id').value = record.id;
            document.getElementById('personal-expense-title').value = record.title || '';
            document.getElementById('personal-expense-amount').value = record.amount || 0;
            document.getElementById('personal-expense-frequency').value = record.frequency || 'one-time';
            document.getElementById('personal-expense-date').value = record.date.split(' ')[0];
            document.getElementById('personal-expense-category').value = record.category || 'Housing';
            document.getElementById('personal-expense-is-subscription').checked = record.is_subscription || false;
            document.getElementById('personal-expense-notes').value = record.notes || '';
            document.getElementById('personal-expense-modal-title').textContent = 'Modify Personal Expense';
            openModal('personal-expense-modal');
        } else if (collectionName === 'VRTPOCKET_BUSINESS_FINANCE_DATABASE') {
            document.getElementById('business-income-id').value = record.id;
            document.getElementById('business-income-title').value = record.title || '';
            document.getElementById('business-income-amount').value = record.amount || 0;
            document.getElementById('business-income-frequency').value = record.frequency || 'one-time';
            document.getElementById('business-income-date').value = record.date.split(' ')[0];
            document.getElementById('business-income-category').value = record.category || 'Services';
            document.getElementById('business-income-notes').value = record.notes || '';
            document.getElementById('business-income-modal-title').textContent = 'Modify Business Revenue';
            openModal('business-income-modal');
        } else if (collectionName === 'VRTPOCKET_BUSINESS_EXPENSES_DATABASE') {
            document.getElementById('business-expense-id').value = record.id;
            document.getElementById('business-expense-title').value = record.title || '';
            document.getElementById('business-expense-amount').value = record.amount || 0;
            document.getElementById('business-expense-frequency').value = record.frequency || 'one-time';
            document.getElementById('business-expense-date').value = record.date.split(' ')[0];
            document.getElementById('business-expense-category').value = record.category || 'Software/SaaS';
            document.getElementById('business-expense-is-subscription').checked = record.is_subscription || false;
            document.getElementById('business-expense-notes').value = record.notes || '';
            document.getElementById('business-expense-modal-title').textContent = 'Modify Business Expense';
            openModal('business-expense-modal');
        } else if (collectionName === 'VRTPOCKET_INVESTMENT_FINANCE_DATABASE') {
            document.getElementById('investment-id').value = record.id;
            document.getElementById('investment-name').value = record.name || '';
            document.getElementById('investment-type').value = record.type || 'Crypto';
            document.getElementById('investment-purchase-date').value = record.purchase_date.split(' ')[0];
            document.getElementById('investment-initial').value = record.initial_amount || 0;
            document.getElementById('investment-current').value = record.current_val || 0;
            document.getElementById('investment-notes').value = record.notes || '';
            document.getElementById('investment-modal-title').textContent = 'Modify Investment Asset';
            openModal('investment-modal');
        }
    } catch (err) {
        console.error(err);
        showToast('Failed to fetch record for editing.', 'error');
    } finally {
        showLoading(false);
    }
}

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

// ==================== INVOICE MANAGEMENT SUITE ====================
function renderInvoices() {
    const tableBody = document.getElementById('invoices-table-body');
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
    
    // Set default dates (issue date = today, due date = today + 30 days)
    const today = new Date();
    const due = new Date();
    due.setDate(today.getDate() + 30);
    
    document.getElementById('invoice-issue-date').value = today.toISOString().split('T')[0];
    document.getElementById('invoice-due-date').value = due.toISOString().split('T')[0];
    
    // Set sequential invoice number guess
    const invCount = appData.invoices.length + 1;
    document.getElementById('invoice-number').value = `INV-${today.getFullYear()}-${String(invCount).padStart(3, '0')}`;

    // Add first empty item row
    addInvoiceItemRow();

    document.getElementById('invoice-list-container').classList.add('hidden');
    document.getElementById('invoice-builder-container').classList.remove('hidden');
}

function closeInvoiceCreator() {
    document.getElementById('invoice-list-container').classList.remove('hidden');
    document.getElementById('invoice-builder-container').classList.add('hidden');
}

function addInvoiceItemRow(desc = '', qty = 1, price = 0) {
    const container = document.getElementById('invoice-items-rows-container');
    const rowId = 'row-' + Date.now() + Math.random().toString(36).substr(2, 5);
    const total = qty * price;

    const rowHtml = `
        <div class="invoice-item-row" id="${rowId}">
            <input type="text" class="item-desc" required placeholder="Consulting Services, Widget development" value="${desc}">
            <input type="number" class="item-qty" min="1" required value="${qty}">
            <input type="number" class="item-price" min="0" step="0.01" required value="${price}">
            <span class="item-total-cell">${formatVal(total)}</span>
            <button type="button" class="tbl-btn tbl-btn-delete remove-item-row" onclick="removeInvoiceItemRow('${rowId}')"><i class="fa-regular fa-trash-can"></i></button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', rowHtml);
    
    // Hook input events to update math dynamically
    const row = document.getElementById(rowId);
    row.querySelector('.item-qty').addEventListener('input', () => recalculateRowTotal(rowId));
    row.querySelector('.item-price').addEventListener('input', () => recalculateRowTotal(rowId));
}

function removeInvoiceItemRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
        row.remove();
        calculateInvoiceTotals();
    }
}

function recalculateRowTotal(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
        const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
        const price = parseFloat(row.querySelector('.item-price').value) || 0;
        const cell = row.querySelector('.item-total-cell');
        cell.textContent = formatVal(qty * price);
        calculateInvoiceTotals();
    }
}

function calculateInvoiceTotals() {
    let subtotal = 0;
    document.querySelectorAll('.invoice-item-row').forEach(row => {
        const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
        const price = parseFloat(row.querySelector('.item-price').value) || 0;
        subtotal += qty * price;
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

// Compile Invoice form items list into array payload
function getInvoiceItemsPayload() {
    const items = [];
    document.querySelectorAll('.invoice-item-row').forEach(row => {
        const desc = row.querySelector('.item-desc').value;
        const qty = parseFloat(row.querySelector('.item-qty').value) || 1;
        const price = parseFloat(row.querySelector('.item-price').value) || 0;
        items.push({
            desc,
            qty,
            price,
            total: qty * price
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

    // calculate totals
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
        items, // JSON array field in PocketBase
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
        
        // Open in viewer immediately
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

        // Dynamic rows loading
        const container = document.getElementById('invoice-items-rows-container');
        container.innerHTML = '';
        
        // items payload is a JSON array
        const items = Array.isArray(inv.items) ? inv.items : [];
        if (items.length === 0) {
            addInvoiceItemRow();
        } else {
            items.forEach(it => {
                addInvoiceItemRow(it.desc, it.qty, it.price);
            });
        }

        // Calculate math values
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
        
        // Company info inside invoice
        document.getElementById('invoice-paper-company-name').textContent = currentUser.company_name || 'My Organization';
        document.getElementById('invoice-paper-company-address').textContent = currentUser.company_address || '';
        document.getElementById('invoice-paper-company-contact').textContent = `Tel: ${currentUser.company_phone || 'N/A'} | Email: ${currentUser.company_email || currentUser.email}`;

        // Set Company Logo
        const printLogo = document.getElementById('invoice-paper-logo');
        if (currentUser.company_logo) {
            printLogo.src = pb.files.getUrl(currentUser, currentUser.company_logo);
            printLogo.classList.remove('hidden');
        } else {
            printLogo.classList.add('hidden');
        }

        // Invoice Meta
        document.getElementById('invoice-paper-number').textContent = inv.invoice_number;
        document.getElementById('invoice-paper-issue-date').textContent = formatDateToDMY(inv.issue_date);
        document.getElementById('invoice-paper-due-date').textContent = formatDateToDMY(inv.due_date);
        
        const statusBadge = document.getElementById('invoice-paper-status');
        statusBadge.textContent = inv.status;
        statusBadge.className = `badge status-${inv.status.toLowerCase()}`;

        // Client info
        document.getElementById('invoice-paper-client-name').textContent = inv.client_name;
        document.getElementById('invoice-paper-client-address').textContent = inv.client_address || '';
        document.getElementById('invoice-paper-client-email').textContent = inv.client_email || '';

        // Fill Items Table
        const tableBody = document.getElementById('invoice-paper-items-list');
        tableBody.innerHTML = '';
        
        const items = Array.isArray(inv.items) ? inv.items : [];
        let subtotal = 0;
        
        items.forEach(it => {
            subtotal += it.total;
            tableBody.innerHTML += `
                <tr>
                    <td><strong>${it.desc}</strong></td>
                    <td class="text-right">${it.qty}</td>
                    <td class="text-right">${formatVal(it.price)}</td>
                    <td class="text-right font-bold">${formatVal(it.total)}</td>
                </tr>
            `;
        });

        // Totals maths
        const taxVal = subtotal * (inv.tax_rate / 100);
        document.getElementById('invoice-paper-subtotal').textContent = formatVal(subtotal);
        document.getElementById('invoice-paper-tax').textContent = `${formatVal(taxVal)} (${inv.tax_rate}%)`;
        document.getElementById('invoice-paper-discount').textContent = `-${formatVal(inv.discount)}`;
        document.getElementById('invoice-paper-total').textContent = formatVal(inv.total_amount);

        // Memo and payment details
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

        // Toggle UI
        document.getElementById('invoice-list-container').classList.add('hidden');
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

// ==================== REPORTS COMPILATION ENGINE ====================
function compileReport(e) {
    if (e) e.preventDefault();
    
    const startDateVal = document.getElementById('report-start-date').value;
    const endDateVal = document.getElementById('report-end-date').value;
    const scope = document.getElementById('report-segment').value;

    const start = startDateVal ? new Date(startDateVal) : new Date(0); // far past
    const end = endDateVal ? new Date(endDateVal) : new Date();
    end.setHours(23,59,59,999); // boundary

    // Meta report headers
    document.getElementById('report-company-name').textContent = currentUser.company_name || 'My Organization';
    document.getElementById('report-gen-date').textContent = formatDateToDMY(new Date());
    const startText = startDateVal ? formatDateToDMY(startDateVal) : 'All Time';
    const endText = endDateVal ? formatDateToDMY(endDateVal) : 'Today';
    document.getElementById('report-period-text').textContent = `${startText} to ${endText}`;
    
    const logoPrint = document.getElementById('report-company-logo');
    if (currentUser.company_logo) {
        logoPrint.src = pb.files.getUrl(currentUser, currentUser.company_logo);
        logoPrint.classList.remove('hidden');
    } else {
        logoPrint.classList.add('hidden');
    }

    // Combine data lists based on selected scope
    let incomePool = [];
    let expensePool = [];
    
    if (scope === 'all' || scope === 'personal') {
        incomePool = [...incomePool, ...appData.personalIncome.map(r => ({ ...r, origin: 'Personal' }))];
        expensePool = [...expensePool, ...appData.personalExpenses.map(r => ({ ...r, origin: 'Personal' }))];
    }
    if (scope === 'all' || scope === 'business') {
        incomePool = [...incomePool, ...appData.businessIncome.map(r => ({ ...r, origin: 'Business' }))];
        expensePool = [...expensePool, ...appData.businessExpenses.map(r => ({ ...r, origin: 'Business' }))];
    }

    // Date filters apply
    const filteredIncome = incomePool.filter(r => {
        const d = new Date(r.date);
        return d >= start && d <= end;
    });

    const filteredExpenses = expensePool.filter(r => {
        const d = new Date(r.date);
        return d >= start && d <= end;
    });

    const totalInflow = filteredIncome.reduce((acc, r) => acc + (r.amount || 0), 0);
    const totalOutflow = filteredExpenses.reduce((acc, r) => acc + (r.amount || 0), 0);
    const surplus = totalInflow - totalOutflow;

    document.getElementById('report-total-income').textContent = formatVal(totalInflow);
    document.getElementById('report-total-expenses').textContent = `-${formatVal(totalOutflow)}`;
    
    const surplusEl = document.getElementById('report-net-surplus');
    surplusEl.textContent = formatVal(surplus);
    surplusEl.className = surplus >= 0 ? 'text-emerald' : 'text-rose';

    // Investment summary value inside report
    const totalCap = appData.investments.reduce((acc, r) => acc + (r.initial_amount || 0), 0);
    const totalCur = appData.investments.reduce((acc, r) => acc + (r.current_val || 0), 0);
    const totalFees = appData.investmentExpenses.reduce((acc, r) => acc + (r.amount || 0), 0);
    const netReturn = totalCur - totalCap - totalFees;
    const roi = totalCap > 0 ? (netReturn / totalCap) * 100 : 0;
    
    document.getElementById('report-investment-summary').textContent = `${formatVal(totalCur)} (${roi.toFixed(2)}% ROI)`;

    // Render category break down table
    const categoryAgg = {};
    filteredIncome.forEach(r => {
        const key = `${r.category}_Income_${r.origin}`;
        if (!categoryAgg[key]) {
            categoryAgg[key] = { name: r.category, classification: 'Inflow', origin: r.origin, sum: 0 };
        }
        categoryAgg[key].sum += r.amount || 0;
    });

    filteredExpenses.forEach(r => {
        const key = `${r.category}_Expense_${r.origin}`;
        if (!categoryAgg[key]) {
            categoryAgg[key] = { name: r.category, classification: 'Outflow', origin: r.origin, sum: 0 };
        }
        categoryAgg[key].sum += r.amount || 0;
    });

    const distBody = document.getElementById('report-distribution-body');
    distBody.innerHTML = '';
    
    const catList = Object.values(categoryAgg).sort((a,b) => b.sum - a.sum);
    if (catList.length === 0) {
        distBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No distribution data transacted in this period.</td></tr>`;
    } else {
        catList.forEach(c => {
            const classColor = c.classification === 'Inflow' ? 'text-emerald' : 'text-rose';
            distBody.innerHTML += `
                <tr>
                    <td><strong>${c.name}</strong></td>
                    <td>${c.origin} Operations</td>
                    <td><span class="badge ${c.classification === 'Inflow' ? 'one-time' : 'yearly'}">${c.classification}</span></td>
                    <td class="text-right ${classColor} font-bold">${c.classification === 'Inflow' ? '+' : '-'}${formatVal(c.sum)}</td>
                </tr>
            `;
        });
    }

    // Render top transaction list in reports
    const txBody = document.getElementById('report-transactions-body');
    txBody.innerHTML = '';
    
    const combinedTx = [
        ...filteredIncome.map(r => ({ ...r, class: 'Inflow' })),
        ...filteredExpenses.map(r => ({ ...r, class: 'Outflow' }))
    ].sort((a,b) => new Date(b.date) - new Date(a.date));

    if (combinedTx.length === 0) {
        txBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No transactions found.</td></tr>`;
    } else {
        combinedTx.slice(0, 20).forEach(t => {
            const classColor = t.class === 'Inflow' ? 'text-emerald' : 'text-rose';
            txBody.innerHTML += `
                <tr>
                    <td>${formatDateToDMY(t.date)}</td>
                    <td>${t.origin} ${t.class}</td>
                    <td class="report-title-cell"><strong>${t.title || t.name}</strong> <span class="text-muted text-sm">(${t.category})</span></td>
                    <td><span class="badge ${t.frequency}">${t.frequency}</span></td>
                    <td class="text-right ${classColor} font-bold">${t.class === 'Inflow' ? '+' : '-'}${formatVal(t.amount)}</td>
                </tr>
            `;
        });
    }
}
